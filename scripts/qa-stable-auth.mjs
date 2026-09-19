// Real browser over the exact selected bytes, no external API or real account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import { selectFiles, selectedBytes } from '../docs/migration/2026-09-19-stable-preparation/selection.mjs';
const root = process.cwd();
const selected = new Set(selectFiles(root).files);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const requestPath = new URL(req.url, 'http://localhost').pathname;
  const file = requestPath === '/shared/permissions.json' ? 'shared/permissions.json' : `app/${requestPath === '/' ? 'index.html' : requestPath.slice(1)}`;
  if (!selected.has(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(selectedBytes(root, file).bytes);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  const output = '.migration-staging/auth-evidence';
  fs.mkdirSync(output, { recursive: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === base) return route.continue();
      if (url.hostname === '127.0.0.1' && url.port === '8787' && url.pathname === '/config') return route.fulfill({ json: { setup_available: false, auth_mode: 'native' } });
      return route.abort(); // Never contact an API, provider or school.
    });
    const page = await context.newPage();
    const errors = [], portraits = [], missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/login-kid-/.test(request.url())) portraits.push(request.url()); });
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) missing.push(new URL(response.url()).pathname); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('#enterSplash').click();
    await page.locator('#auth.active').waitFor();
    await page.locator('#loginForm').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#authJaspe canvas');
      return canvas && canvas.width > 0 && canvas.getBoundingClientRect().width > 0;
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    assert.deepEqual(portraits, []);
    assert.deepEqual(missing, []);
    await page.screenshot({ path: `${output}/auth-${width}.png`, fullPage: true });
    console.log(`PASS ${width}: login form + JASPE canvas visible; no excluded portrait request, missing asset, JS error or overflow. API config substituted; no login attempted.`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
