/* Browser races and failure states; API deliberately substituted here. Real proof: scripts/qa-access-live.mjs. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const schoolId = '33333333-0000-4000-8000-000000000001';
const actor = '66666666-0000-4000-8000-000000000001';
const first = '66666666-0000-4000-8000-000000000002';
const second = '66666666-0000-4000-8000-000000000003';
const bootstrap = { profile: { id: actor, display_name: 'Admin de test' }, schoolId,
  school: { id: schoolId, name: 'École de test' }, roles: ['admin'], permissions: ['roles.manage'],
  scopes: [{ permission: 'roles.manage', type: 'school', target: null }], deniedPermissions: [], permissionExceptions: [], childIds: [] };
const person = (id, name) => ({ id, display_name: name, is_active: true, account_status: 'active' });
const detail = (id, name) => ({ schoolId, profile: person(id, name), roles: [], grants: [], exceptions: [] });

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [], writes = [], queries = [];
    page.on('pageerror', e => errors.push(e.message));
    let fail = false, holdFirst = null, holdList = null, wrongSchool = false;
    await page.route('http://127.0.0.1:8787/**', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      if (!['GET', 'OPTIONS'].includes(req.method())) writes.push(path);
      let status = 200, body = {};
      if (path === '/config') body = { api_base: 'http://127.0.0.1:8787' };
      else if (path === '/auth/native/me') body = { profile_id: actor };
      else if (path === '/native/session/bootstrap') body = { data: bootstrap };
      else if (path === '/native/access/profiles') {
        const q = url.searchParams.get('query'), offset = Number(url.searchParams.get('offset'));
        queries.push({ q, offset });
        status = fail ? 503 : 200;
        body = { data: { schoolId: wrongSchool ? 'other-school' : schoolId, total: q ? 0 : 26, limit: 25, offset,
          rows: q ? [] : offset ? [person(second, 'Dernière personne')] : [person(first, 'Personne A'), person(second, 'Personne B')] } };
        if (holdList) await holdList;
      } else if (path === '/native/access/profiles/' + first) {
        body = { data: detail(first, 'Personne A') };
        if (holdFirst) await holdFirst;
      } else if (path === '/native/access/profiles/' + second) body = { data: detail(second, '<img src=x onerror=alert(1)> Personne B') };
      else if (path === '/native/access/roles') body = { data: { schoolId, rows: [], total: 0, limit: 25, offset: 0 } };
      else { status = 404; body = { message: 'Not connected' }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(process.env.SCHOOLSAFE_URL || 'http://127.0.0.1:4176/');
    await page.waitForFunction(() => currentSession?.native && currentSession?.profile);
    await page.evaluate(() => schoolSafeShow('workspace'));
    await page.locator('#permissionsNav').click();
    await page.locator('[data-access-view="profiles"]').click();
    await page.locator(`[data-access-profile="${first}"]`).waitFor();
    await page.locator('[data-page="next"]').click();
    await page.getByText('Dernière personne', { exact: true }).waitFor();
    assert.equal(queries.at(-1).offset, 25);
    await page.locator('[data-page="previous"]').click();
    await page.locator(`[data-access-profile="${first}"]`).waitFor();
    let release;
    holdFirst = new Promise(resolve => { release = resolve; });
    const started = page.waitForRequest(r => r.url().endsWith('/profiles/' + first));
    await page.locator(`[data-access-profile="${first}"]`).click(); await started;
    await page.locator(`[data-access-profile="${second}"]`).click();
    await page.locator('[data-access-detail] h3').waitFor();
    const late = page.waitForResponse(r => r.url().endsWith('/profiles/' + first));
    holdFirst = null; release(); await late;
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.match(await page.locator('[data-access-detail] h3').innerText(), /Personne B/);
    assert.equal(await page.locator('[data-access-detail] img').count(), 0, 'names are escaped');
    assert.equal(await page.evaluate(() => currentSession.profile.id), actor);

    // Failed search clears old list AND detail; retry never invents fixtures.
    fail = true;
    await page.locator('[data-access-search] button').click();
    await page.locator('[data-access-list] [role="alert"]').waitFor();
    assert.equal(await page.locator('[data-access-profile]').count(), 0);
    assert.equal(await page.locator('[data-access-detail] h3').count(), 0);
    fail = false;
    await page.locator('[data-access-list] button').click();
    await page.locator(`[data-access-profile="${first}"]`).waitFor();

    // An old directory response cannot replace a newer search.
    holdList = new Promise(resolve => { release = resolve; });
    const listStarted = page.waitForRequest(r => r.url().includes('/access/profiles?'));
    await page.locator('[data-access-search] button').click(); await listStarted;
    holdList = null;
    await page.locator('[data-access-search] input').fill('introuvable');
    await page.locator('[data-access-search] button').click();
    await page.getByText('Aucun résultat dans cette école.').waitFor();
    const oldList = page.waitForResponse(r => r.url().includes('query=&'));
    release(); await oldList; await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.locator('[data-access-profile]').count(), 0);

    // Closing while the directory loads invalidates the result.
    holdList = new Promise(resolve => { release = resolve; });
    const closeStarted = page.waitForRequest(r => r.url().includes('/access/profiles?'));
    await page.locator('[data-access-search] input').fill('');
    await page.locator('[data-access-search] button').click(); await closeStarted;
    await page.locator('#closeAccessConsole').click();
    const closedResponse = page.waitForResponse(r => r.url().includes('/access/profiles?'));
    holdList = null; release(); await closedResponse; await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.locator('[data-access-profile]').count(), 0);
    assert.equal(await page.locator('#accessConsole').isVisible(), false);

    // A changed school payload clears the session, rather than displaying it.
    await page.locator('#permissionsNav').click();
    wrongSchool = true;
    await page.locator('[data-access-view="profiles"]').click();
    await page.waitForFunction(() => !window.currentSession);
    assert.equal(await page.locator('[data-access-profile]').count(), 0);
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    console.log('PASS directory UI: pagination, search races, late selection/close, retry, XSS, actor identity, school change, zero mutations');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
