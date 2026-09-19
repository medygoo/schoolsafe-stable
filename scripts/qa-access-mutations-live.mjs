// Real A3 proof: PostgreSQL concurrency, native cookie/API, browser writes.
// Only an empty, explicitly named loopback test database is accepted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright';
import { buildNativeApp } from '../server/src/native-app.ts';
import { parseEnv } from '../server/src/config/env.ts';

const url = new URL(process.env.SCHOOLSAFE_ACCESS_TEST_URL || 'about:blank');
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.search, '');
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
assert.match(url.pathname, /^\/schoolsafe_access_test(?:_\d+)?$/);
assert.equal(url.username, 'schoolsafe_bootstrap');
const config = { host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1) };
const root = new pg.Client({ ...config, user: url.username, password: decodeURIComponent(url.password) });
const first = new pg.Client({ ...config, user: 'schoolsafe_api' });
const second = new pg.Client({ ...config, user: 'schoolsafe_api' });
const school = 'b0000000-0000-4000-8000-000000000001';
const uid = n => `b1000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pid = n => `b2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rid = n => `b3000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let app, browser;
await Promise.all([root.connect(), first.connect(), second.connect()]);
async function begin(client, who) {
  await client.query('begin');
  await client.query('set local statement_timeout=5000');
  await client.query('select api.set_request_context($1,$2,$3,$4)', [uid(who), pid(who), school, randomUUID()]);
}
async function revision(client) {
  return (await client.query('select api.access_profile_read($1) as data', [pid(1)])).rows[0].data.revision;
}
async function change(client, who, role, action, version) {
  return client.query('select api.access_role_assign($1,$2,$3,$4,$5,true) as data', [pid(who), rid(role), action, version, 'Synthetic concurrent test']);
}
async function waitForLock(client) {
  const limit = Date.now() + 3000;
  while (Date.now() < limit) {
    const state = await root.query('select wait_event_type from pg_stat_activity where pid=$1', [client.processID]);
    if (state.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Second IAM mutation did not wait on the school lock');
}
try {
  assert.equal((await root.query('select count(*)::int n from app.schools')).rows[0].n, 0);
  const sql = await readFile(new URL('../database/access/v1/tests/role-assignments.test.sql', import.meta.url), 'utf8');
  await root.query(sql.split('-- END FIXTURES')[0].replace(/^\\.*$/gm, '') + '\ncommit;');
  await begin(first, 1);
  await change(first, 2, 1, 'assign', await revision(first));
  await first.query('commit');

  // Both admins try to remove themselves. Only one can commit.
  await begin(first, 1); await begin(second, 2);
  const v1 = await revision(first), v2 = await revision(second);
  assert.equal(v1, v2);
  await change(first, 1, 1, 'revoke', v1);
  const concurrent = change(second, 2, 1, 'revoke', v2).then(() => 'UNEXPECTED_SUCCESS', error => error.code);
  await waitForLock(second);
  await first.query('commit');
  assert.equal(await concurrent, '40001');
  await second.query('rollback');
  await begin(second, 2);
  await assert.rejects(change(second, 2, 1, 'revoke', await revision(second)), e => e.message === 'LAST_ACCESS_ADMIN');
  await second.query('rollback');
  await begin(second, 2);
  await change(second, 1, 1, 'assign', await revision(second));
  await second.query('commit');

  // A permission revoked while a request waits is checked again after the lock.
  await begin(first, 2); await begin(second, 1);
  const before = await revision(second);
  await change(first, 1, 1, 'revoke', await revision(first));
  const waiting = change(second, 3, 2, 'assign', before).then(() => 'UNEXPECTED_SUCCESS', error => error.code);
  await waitForLock(second); await first.query('commit');
  assert.equal(await waiting, '42501');
  await second.query('rollback');
  await begin(first, 2);
  await change(first, 1, 1, 'assign', await revision(first));
  await first.query('commit');
  console.log('PASS two real API connections: school lock, stale revision, last admin, authorization refreshed after lock');

  const identity = (await root.query('insert into auth.identities(user_id,email) values ($1,$2) returning id', [uid(1), 'a3-test@example.invalid'])).rows[0].id;
  const token = randomBytes(32).toString('hex');
  await root.query("insert into auth.sessions(identity_id,profile_id,token_hash,expires_at) values ($1,$2,$3,now()+interval '15 minutes')", [identity, pid(1), createHash('sha256').update(token).digest('hex')]);
  app = buildNativeApp(parseEnv({ NODE_ENV: 'test' }), {
    authPool: new pg.Pool({ ...config, user: 'schoolsafe_auth' }), businessPool: new pg.Pool({ ...config, user: 'schoolsafe_api' }),
  });
  await app.listen({ host: '127.0.0.1', port: 8787 });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addCookies([{ name: 'schoolsafe_session', value: token, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  async function openProfile() {
    await page.goto(process.env.SCHOOLSAFE_URL || 'http://127.0.0.1:4176/');
    await page.waitForFunction(() => window.currentSession?.native && window.currentSession?.profile);
    await page.evaluate(() => schoolSafeShow('workspace'));
    await page.locator('#permissionsNav').click();
    await page.locator('[data-access-view="profiles"]').click();
    await page.locator(`[data-access-profile="${pid(3)}"]`).click();
    await page.locator(`[data-role-assign="${rid(2)}"]`).waitFor();
  }
  async function submit() {
    await page.locator('[data-role-change] textarea').fill('Mission de lecture validée par la direction');
    await page.locator('[data-role-change] [name="confirmed"]').check();
    await page.locator('[data-role-change] button[type="submit"]').click();
  }
  await openProfile();
  assert.equal(await page.locator(`[data-role-assign="${rid(4)}"]`).isDisabled(), true, 'Control excluded');
  await page.locator(`[data-role-assign="${rid(2)}"]`).click();
  await page.locator('[data-role-change]').waitFor();
  assert.equal((await root.query('select count(*)::int n from iam.profile_roles where profile_id=$1', [pid(3)])).rows[0].n, 0, 'opening confirmation never writes');
  if (process.env.ACCESS_LIVE_QA_OUTPUT) await page.screenshot({ path: process.env.ACCESS_LIVE_QA_OUTPUT, fullPage: true });
  await submit();
  await page.locator(`[data-role-revoke="${rid(2)}"]`).waitFor();
  await openProfile(); // persist across a fresh session bootstrap/page load
  await page.locator(`[data-role-revoke="${rid(2)}"]`).click();
  await page.locator('[data-role-change]').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.waitForFunction(() => document.getElementById('workspaceSidebar').getBoundingClientRect().right <= 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (process.env.ACCESS_LIVE_QA_OUTPUT) await page.screenshot({ path: process.env.ACCESS_LIVE_QA_OUTPUT.replace(/\.png$/, '-mobile.png'), fullPage: true });
  await submit();
  await page.waitForFunction(role => !document.querySelector(`[data-role-revoke="${role}"]`) && document.querySelector(`[data-role-assign="${role}"]`), rid(2));
  assert.equal((await root.query('select is_active from iam.profile_roles where profile_id=$1 and role_id=$2', [pid(3), rid(2)])).rows[0].is_active, false);
  // Conflict after confirmation opened: no automatic write retry.
  await page.locator(`[data-role-assign="${rid(2)}"]`).click();
  await page.locator('[data-role-change]').waitFor();
  await begin(first, 1); await change(first, 3, 3, 'assign', await revision(first)); await first.query('commit');
  await submit();
  await page.getByRole('alert').filter({ hasText: 'Les accès ont changé' }).waitFor();
  assert.equal(await page.locator('[data-role-change] textarea').inputValue(), 'Mission de lecture validée par la direction', 'failure preserves the reviewed form');
  assert.equal(await page.locator('[data-role-change] button[type="submit"]').isDisabled(), true, 'stale confirmation cannot be resubmitted');
  assert.equal((await root.query('select is_active from iam.profile_roles where profile_id=$1 and role_id=$2', [pid(3), rid(2)])).rows[0].is_active, false);
  const audit = await root.query("select count(*)::int n from audit.events where event_type='access.role.revoke' and entity_id=$1 and payload->>'reason'=$2", [pid(3), 'Mission de lecture validée par la direction']);
  assert.equal(audit.rows[0].n, 1);

  // A4: a new custom post follows the same native path, with real persistence.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-access-view="roles"]').click();
  await page.locator('[data-create-role]').click();
  await page.locator('[data-custom-role-form] [name="label"]').fill('Consultation RH personnalisée');
  await page.locator('[data-custom-role-form] [name="reason"]').fill('Création de poste pour la recette');
  await page.locator('[data-custom-role-form] [name="confirmed"]').check();
  await page.locator('[data-custom-role-form] button[type="submit"]').click();
  const permissionRow=page.locator('[data-composition-row="staff.read"]');
  await permissionRow.waitFor();
  await permissionRow.locator('[data-permission-check]').check();
  await permissionRow.locator('[data-permission-scope]').selectOption('school');
  await page.locator('[data-custom-role-form] [name="reason"]').fill('Autoriser la consultation RH');
  await page.locator('[data-custom-role-form] [name="confirmed"]').check();
  await page.locator('[data-custom-role-form] button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('[data-composition-row="staff.read"]')?.textContent.includes('Périmètre conservé'));
  const customRole=(await root.query('select id from iam.roles where school_id=$1 and label=$2',[school,'Consultation RH personnalisée'])).rows[0].id;
  await page.locator('[data-access-view="profiles"]').click();
  await page.locator(`[data-access-profile="${pid(3)}"]`).click();
  await page.locator(`[data-role-assign="${customRole}"]`).click(); await submit();
  await page.locator(`[data-role-revoke="${customRole}"]`).waitFor();
  await page.locator('[data-access-view="roles"]').click();
  await page.locator(`[data-access-role="${customRole}"]`).click();
  await page.getByText('1 profil(s) avec attribution active', { exact: true }).waitFor();
  assert.match(await page.locator('[data-access-detail]').innerText(),/Gestionnaire limité A3/);
  await page.locator('[data-composition-search]').fill('personnel');
  if(process.env.ACCESS_LIVE_QA_OUTPUT) await page.screenshot({path:process.env.ACCESS_LIVE_QA_OUTPUT.replace(/\.png$/,'-custom-desktop.png'),fullPage:true});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.getElementById('workspaceSidebar').getBoundingClientRect().right <= 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if(process.env.ACCESS_LIVE_QA_OUTPUT) await page.screenshot({path:process.env.ACCESS_LIVE_QA_OUTPUT.replace(/\.png$/,'-custom-mobile.png'),fullPage:true});
  await page.locator('[data-composition-row="staff.read"] [data-permission-effect]').selectOption('deny');
  await page.locator('[data-custom-role-form] [name="reason"]').fill('Restriction RH confirmée pour le profil');
  await page.locator('[data-custom-role-form] [name="confirmed"]').check();
  await page.locator('[data-custom-role-form] button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('[data-composition-row="staff.read"] [data-permission-effect]')?.value==='deny' && !document.querySelector('[data-custom-role-form] fieldset')?.disabled);
  await begin(first,3);
  assert.equal((await first.query("select api.check_access('staff.read') allowed")).rows[0].allowed,false,'UI composition enforces DENY on actual target');
  await first.query('commit');
  console.log('PASS A4 real browser: create/compose/assign, affected profiles, mobile dark, effective DENY');

  // Same cookie, real Access Law, no provider configured or called.
  const endpoint = 'http://127.0.0.1:8787/native/jaspe/chat';
  assert.equal((await context.request.post(endpoint, { data: { message: 'Bonjour' } })).status(), 503);
  await root.query("update iam.role_permission_grants set is_active=false where role_id=$1 and permission_id=(select id from iam.permissions where code='safe.assistant.use')", [rid(1)]);
  assert.equal((await context.request.post(endpoint, { data: { message: 'Bonjour' } })).status(), 403, 'JASPE respects immediately revoked access');
  assert.deepEqual(errors, []);
  console.log('PASS real browser/cookie/API/PG: confirmation, assignment, persistence, revoke, audit, conflict, mobile dark, JASPE revocation');
} finally {
  if (browser) await browser.close();
  if (app) await app.close();
  await Promise.allSettled([first.query('rollback'), second.query('rollback')]);
  await Promise.allSettled([root.end(), first.end(), second.end()]);
}
