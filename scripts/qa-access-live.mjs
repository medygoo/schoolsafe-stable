// Run with: node --import tsx scripts/qa-access-live.mjs
// Requires the fresh local database prepared by test-access-postgres.mjs and preview 4176.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
import { buildNativeApp } from '../server/src/native-app.ts';
import { parseEnv } from '../server/src/config/env.ts';

const raw = process.env.SCHOOLSAFE_ACCESS_TEST_URL;
assert.ok(raw, 'Explicit test database required');
const url = new URL(raw);
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.search, '', 'No connection overrides in the test URL');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
assert.match(url.pathname, /^\/schoolsafe_access_test(?:_\d+)?$/);
assert.equal(url.username, 'schoolsafe_bootstrap');
const config = { host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1) };
const admin = new pg.Client({ ...config, user: url.username, password: decodeURIComponent(url.password) });
await admin.connect();
let app, browser;
try {
  assert.equal((await admin.query('select count(*)::int n from app.schools')).rows[0].n, 0, 'Requires empty synthetic school data');
  const testSql = await readFile(new URL('../database/projections/v1/tests/access-read.test.sql', import.meta.url), 'utf8');
  const fixture = testSql.split('set local role schoolsafe_api;')[0].replace(/^\\.*$/gm, '');
  await admin.query(fixture + '\ncommit;');
  const actor = 'a2000000-0000-4000-8000-000000000001';
  const target = 'a2000000-0000-4000-8000-000000000002';
  const identity = (await admin.query("insert into auth.identities(user_id,email) values ('a1000000-0000-4000-8000-000000000001','qa-access@example.invalid') returning id")).rows[0].id;
  const token = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await admin.query('insert into auth.sessions(identity_id,profile_id,token_hash,expires_at) values ($1,$2,$3,now()+interval \'15 minutes\')', [identity, actor, tokenHash]);
  const authPool = new pg.Pool({ ...config, user: 'schoolsafe_auth' });
  const businessPool = new pg.Pool({ ...config, user: 'schoolsafe_api' });
  app = buildNativeApp(parseEnv({ NODE_ENV: 'test' }), { authPool, businessPool });
  await app.listen({ host: '127.0.0.1', port: 8787 }); // Never take over an existing server.
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addCookies([{ name: 'schoolsafe_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.SCHOOLSAFE_URL || 'http://127.0.0.1:4176/');
  await page.waitForFunction(() => window.currentSession?.native && window.currentSession?.profile);
  await page.evaluate(() => schoolSafeShow('workspace'));
  await page.locator('#permissionsNav').click();
  await page.locator('[data-access-view="profiles"]').click();
  await page.locator(`[data-access-profile="${target}"]`).click();
  await page.locator('[data-access-detail] h3').waitFor();
  assert.match(await page.locator('[data-access-detail]').innerText(), /B Person.*Expiré/s);
  assert.match(await page.locator('[data-access-detail]').innerText(), /Exception individuelle/);
  assert.doesNotMatch(await page.locator('[data-access-list]').innerText(), /Secret other school/);
  assert.equal(await page.evaluate(() => currentSession.profile.id), actor, 'inspection must not switch the session');
  const foreign = await context.request.get('http://127.0.0.1:8787/native/access/profiles/a2000000-0000-4000-8000-000000000003');
  assert.equal(foreign.status(), 404);
  const input = page.locator('[data-access-search] input');
  await input.fill('Secret');
  await page.locator('[data-access-search] button').click();
  await page.getByText('Aucun résultat dans cette école.').waitFor();
  await input.fill('');
  await page.locator('[data-access-search] button').click();
  await page.locator(`[data-access-profile="${target}"]`).click();
  await page.locator('[data-access-detail] h3').waitFor();
  if (process.env.ACCESS_LIVE_QA_OUTPUT) await page.screenshot({ path: process.env.ACCESS_LIVE_QA_OUTPUT, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.waitForFunction(() => document.getElementById('workspaceSidebar').getBoundingClientRect().right <= 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (process.env.ACCESS_LIVE_QA_OUTPUT) await page.screenshot({ path: process.env.ACCESS_LIVE_QA_OUTPUT.replace(/\.png$/, '-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-access-view="roles"]').click();
  await page.getByText('Administration', { exact: true }).last().waitFor();
  assert.doesNotMatch(await page.locator('[data-access-list]').innerText(), /Other school role/);
  // Real revocation while the old page/cookie remain open.
  await admin.query("update iam.role_permission_grants set is_active=false where id='a4000000-0000-4000-8000-000000000001'");
  const denied = await context.request.get('http://127.0.0.1:8787/native/access/profiles');
  assert.equal(denied.status(), 403);
  await page.locator('[data-access-view="profiles"]').click();
  await page.waitForFunction(() => !window.currentSession);
  assert.equal(await page.locator('[data-access-profile]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS real UI → cookie/auth → native server → PostgreSQL roles: directory, detail, search, isolation, mobile dark, revocation');
} finally {
  if (browser) await browser.close();
  if (app) await app.close();
  await admin.end();
}
