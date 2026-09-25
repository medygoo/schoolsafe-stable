const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { chromium, expect } = require('@playwright/test');

// Run with: node --test app/qa-setup-token.test.cjs
// Only synthetic tokens and local HTTP fixtures are used.
let browser, preview, fixture;
let version = 1;
const uiURL = 'http://127.0.0.1:4189/';
let swURL;
const chromePath = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
].find(fs.existsSync);

before(async () => {
  preview = spawn(process.execPath, [path.join(__dirname, 'server.mjs'), '--port', '4189'], {
    stdio: 'ignore', windowsHide: true,
  });
  for (let attempt = 0; ; attempt++) {
    if (preview.exitCode !== null) throw new Error('Preview server exited');
    try { await fetch(uiURL); break; } catch (error) {
      if (attempt >= 50) throw error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  fixture = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (pathname === '/sw.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(fs.readFileSync(path.join(__dirname, 'sw.js')));
    } else if (pathname === '/' || pathname === '/index.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Offline fixture</title><script src="./app.js"></script><p>Cached shell</p>');
    } else if (pathname === '/app.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end('window.fixtureVersion = ' + version + ';');
    } else if (pathname === '/missing.js') {
      res.writeHead(404); res.end('Missing');
    } else {
      res.setHeader('Content-Type', 'text/plain');
      res.end('fixture-' + version);
    }
  });
  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');
  swURL = 'http://127.0.0.1:' + fixture.address().port + '/';
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (fixture) { fixture.closeAllConnections(); await new Promise(resolve => fixture.close(resolve)); }
  if (preview && preview.exitCode === null) { preview.kill(); await once(preview, 'exit'); }
});

async function openModal(t, viewport) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.route('**/auth/native/me', route => route.fulfill({
    status: 401, json: { message: 'Authentication required' },
  }));
  await page.goto(uiURL, { waitUntil: 'networkidle' });
  await page.locator('#enterSplash').click();
  await page.locator('.auth-other-access summary').click();
  await page.locator('#startSetup').click();
  const modal = page.locator('.ss-modal-overlay.is-open');
  await expect(modal).toBeVisible();
  return { page, modal, button: modal.getByRole('button', { name: 'Valider', exact: true }) };
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const size = viewport.width === 390 ? 'mobile' : 'desktop';
  test(size + ': empty code keeps a visible error without server requests', async t => {
    const { page, modal, button } = await openModal(t, viewport);
    let calls = 0;
    await page.route('**/config', route => { calls++; return route.abort(); });
    await button.click();
    await expect(modal.locator('.ss-modal__error')).toBeVisible();
    await expect(modal.locator('.ss-modal__error')).toContainText('Veuillez saisir un token.');
    await expect(button).toBeEnabled();
    assert.equal(calls, 0);
    await expect(page.locator('#setup')).not.toHaveClass(/active/);
  });

  for (const scenario of [
    { name: 'invalid code', response: { status: 200, json: { valid: false } }, error: 'Token de configuration invalide.' },
    { name: 'server refusal', response: { status: 403, json: { message: 'Autorisation expirée.' } }, error: 'Autorisation expirée.' },
    { name: 'validation HTTP unavailable', response: { status: 503, json: { message: 'Service indisponible.' } }, error: 'Service indisponible.' },
    { name: 'validation network unavailable', abort: true },
    { name: 'config HTTP unavailable', configStatus: 503 },
    { name: 'config network unavailable', configAbort: true },
  ]) {
    test(size + ': ' + scenario.name + ' remains visible and retryable', async t => {
      const { page, modal, button } = await openModal(t, viewport);
      let validations = 0;
      await page.route('**/config', route => scenario.configAbort ? route.abort() : route.fulfill({
        status: scenario.configStatus || 200, json: { setup_available: true },
      }));
      await page.route('**/setup/validate-token', route => {
        validations++;
        return scenario.abort ? route.abort() : route.fulfill(scenario.response || { json: { valid: true } });
      });
      await modal.locator('#setup-token-input').fill('synthetic-test-code');
      await button.click();
      await expect(modal.locator('.ss-modal__error')).toBeVisible();
      if (scenario.error) await expect(modal.locator('.ss-modal__error')).toContainText(scenario.error);
      else await expect(modal.locator('.ss-modal__error')).not.toHaveText('');
      await expect(button).toBeEnabled();
      await expect(modal).not.toHaveClass(/is-loading/);
      await expect(page.locator('#setup')).not.toHaveClass(/active/);
      if (scenario.configStatus || scenario.configAbort) assert.equal(validations, 0);
    });
  }

  test(size + ': valid code waits for server then closes modal and opens setup', async t => {
    const { page, modal, button } = await openModal(t, viewport);
    await page.route('**/config', route => route.fulfill({ json: { setup_available: true } }));
    let release;
    const responseGate = new Promise(resolve => { release = resolve; });
    t.after(() => release());
    await page.route('**/setup/validate-token', async route => {
      assert.deepEqual(route.request().postDataJSON(), { token: 'synthetic-test-code' });
      await responseGate;
      await route.fulfill({ json: { valid: true } });
    });
    await modal.locator('#setup-token-input').fill('  synthetic-test-code  ');
    await button.click();
    await expect(modal).toBeVisible();
    await expect(modal).toHaveClass(/is-loading/);
    await expect(button).toBeDisabled();
    await expect(page.locator('#setup')).not.toHaveClass(/active/);
    release();
    await expect(page.locator('#setup.active')).toBeVisible();
    await expect(page.locator('.ss-modal-overlay')).toHaveCount(0);
  });
}

async function controlledPage(t) {
  version = 1;
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  t.after(() => context.close());
  const page = await context.newPage();
  await page.goto(swURL);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    });
  });
  return { page, context };
}

for (const asset of ['app.js', 'styles.css', 'page.html', 'manifest.webmanifest']) {
  test('PWA refreshes online ' + asset + ' and retains its offline fallback', async t => {
    const { page, context } = await controlledPage(t);
    const read = () => page.evaluate(async asset => (await fetch('/' + asset)).text(), asset);
    const first = await read();
    version = 2;
    const fresh = await read();
    assert.notEqual(fresh, first, 'Online asset must use the new server version');
    await context.setOffline(true);
    assert.equal(await read(), fresh, 'Offline must return latest cached asset');
  });
}

test('PWA retains navigation offline and does not substitute HTML for missing JS', async t => {
  const { page, context } = await controlledPage(t);
  version = 2;
  await page.reload();
  assert.equal(await page.evaluate(() => window.fixtureVersion), 2);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('p')).toHaveText('Cached shell');
  assert.equal(await page.evaluate(() => window.fixtureVersion), 2);
  assert.equal(await page.evaluate(async () => {
    try { await fetch('/missing.js'); return 'unexpected response'; } catch { return 'network error'; }
  }), 'network error');
});

test('PWA keeps immutable fonts, images and icons cache-first', async t => {
  const { page } = await controlledPage(t);
  for (const asset of ['assets/fonts/test.woff2', 'photo.png', 'icons/icon-192.png']) {
    version = 1;
    const first = await page.evaluate(async p => (await fetch('/' + p)).text(), asset);
    version = 2;
    assert.equal(await page.evaluate(async p => (await fetch('/' + p)).text(), asset), first);
  }
});

test('PWA never caches API, config or setup responses, including offline', async t => {
  const { page, context } = await controlledPage(t);
  for (const endpoint of ['/auth/me', '/native/students', '/api/private', '/config', '/setup/status']) {
    await context.setOffline(false);
    version = 1;
    await page.evaluate(async p => (await fetch(p)).text(), endpoint);
    version = 2;
    assert.equal(await page.evaluate(async p => (await fetch(p)).text(), endpoint), 'fixture-2');
    assert.equal(await page.evaluate(async p => Boolean(await caches.match(p)), endpoint), false);
    await context.setOffline(true);
    assert.equal(await page.evaluate(async p => {
      try { await fetch(p); return 'cached'; } catch { return 'network error'; }
    }, endpoint), 'network error');
  }
});

test('pending validation cannot be dismissed and failed code can be retried', async t => {
  const { page, modal, button } = await openModal(t, { width: 390, height: 844 });
  await page.route('**/config', route => route.fulfill({ json: { setup_available: true } }));
  let release;
  const responseGate = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  let attempts = 0;
  await page.route('**/setup/validate-token', async route => {
    attempts++;
    if (attempts === 1) await responseGate;
    await route.fulfill({ json: { valid: attempts > 1 } });
  });
  await modal.locator('#setup-token-input').fill('synthetic-test-code');
  await button.click();
  await expect(button).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  await modal.locator('[data-modal-close]').click();
  await expect(modal).toBeVisible();
  release();
  await expect(modal.locator('.ss-modal__error')).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator('#setup.active')).toBeVisible();
  await expect(page.locator('.ss-modal-overlay')).toHaveCount(0);
  assert.equal(attempts, 2);
});
