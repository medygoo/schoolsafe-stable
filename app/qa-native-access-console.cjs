/* Native session and access console: browser proof using a substituted API. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.SCHOOLSAFE_URL || 'http://127.0.0.1:4176/';
const schoolId = '33333333-0000-4000-8000-000000000001';
const profileId = '66666666-0000-4000-8000-000000000001';
function bootstrap() {
  return {
    profile: { id: profileId, display_name: 'Compte de vérification' },
    schoolId, school: { id: schoolId, code: 'QA', name: 'École de vérification' },
    roles: ['admin'], permissions: ['roles.manage', 'school.student.read', 'staff.read'],
    scopes: [
      { permission: 'roles.manage', type: 'school', target: null },
      { permission: 'staff.read', type: 'school', target: null },
      { permission: 'school.student.read', type: 'assigned_classes', target: 'classe-a' },
      { permission: 'school.student.read', type: 'assigned_classes', target: 'classe-b' },
    ],
    deniedPermissions: ['finance.payment.record'], permissionExceptions: [],
    assignedClassIds: ['classe-a', 'classe-b'], assignedPortalIds: [], childIds: [],
    offline_policy: { max_offline_hours: 24 },
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let current = bootstrap(), refused = false, unavailable = false, calls = 0, hold = null;
    const writes = [];
    await page.route('http://127.0.0.1:8787/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      let status = 200, body = {};
      if (!['GET', 'OPTIONS'].includes(request.method())) writes.push(pathname);
      if (pathname === '/config') body = { api_base: 'http://127.0.0.1:8787', setup_available: false };
      else if (pathname === '/auth/native/me') body = { profile_id: profileId };
      else if (pathname === '/native/session/bootstrap') {
        calls++;
        status = unavailable ? 503 : refused ? 401 : 200;
        body = status === 200 ? { data: current } : { message: 'Session indisponible' };
        if (hold) await hold;
      } else { status = 404; body = { message: 'Source non raccordée' }; }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(base);
    await page.waitForFunction(() => window.currentSession?.native === true && window.currentSession?.profile);
    await page.evaluate(() => schoolSafeShow('workspace'));
    const user = await page.evaluate(() => SchoolSafeAppContext.getCurrentUser());
    assert.equal(user.schoolId, schoolId, 'native cookie session must never inherit demo school/permissions');
    assert.deepEqual(user.permissions, current.permissions);
    assert.equal(await page.evaluate(() => schoolSafeDemoMode), false);
    assert.equal(await page.locator('#workspaceNav [data-branch="finance"]').count(), 0, 'admin label must not grant finance');
    assert.equal(await page.locator('#workspaceDemoBanner').isVisible(), false);
    await page.waitForFunction(() => document.getElementById('jaspeHeroLauncher').disabled);
    assert.equal(await page.locator('#jaspeAccessMessage').isVisible(), true, 'Jaspe stays permission-bound');
    assert.deepEqual(await page.evaluate(() => {
      const user = SchoolSafeAppContext.getCurrentUser();
      return [SchoolSafeFinanceModule.isDemoMode(), SchoolSafeInventoryDemo.isDemoMode(user), SchoolSafeCommunication.isDemoMode(user), SchoolSafeFeeControlModule.canManage()];
    }), [false, false, false, false], 'cookie-only session cannot fall back to demo finance, inventory, communication or finance permissions');
    await page.locator('#workspaceNav [data-branch="people"]').click();
    await page.locator('[data-hr-live-unavailable]').waitFor();

    await page.locator('#permissionsNav').click();
    await page.locator('#nativeAccessContent [data-access-permission="roles.manage"]').waitFor();
    assert.ok(calls >= 2, 'opening console refreshes server permissions');
    assert.equal(await page.locator('#accessDemoLayout').isVisible(), false);
    assert.equal(await page.locator('#savePermissions').isVisible(), false);
    const studentRow = page.locator('[data-access-permission="school.student.read"]');
    assert.match(await studentRow.innerText(), /classe-a/);
    assert.match(await studentRow.innerText(), /classe-b/);
    assert.match(await page.locator('[data-access-permission="finance.payment.record"]').innerText(), /Refus explicite/);
    assert.match(await page.locator('[data-access-permission="finance.fee.read"]').innerText(), /Non attribuée/);
    assert.doesNotMatch(await page.locator('#nativeAccessContent').innerText(), /M\. X|Mme Y|demo-school/);
    await page.locator('#accessPermissionSearch').fill('finance.payment');
    assert.equal(await page.locator('[data-access-permission]:visible').count(), 2);
    await page.locator('#accessPermissionSearch').fill('');
    if (process.env.ACCESS_QA_OUTPUT) await page.screenshot({ path: process.env.ACCESS_QA_OUTPUT.replace(/\.png$/, '-desktop.png'), animations: 'disabled' });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.getElementById('workspaceSidebar').getBoundingClientRect().right <= 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile fits viewport');
    if (process.env.ACCESS_QA_OUTPUT) await page.screenshot({ path: process.env.ACCESS_QA_OUTPUT, animations: 'disabled' });
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    if (process.env.ACCESS_QA_OUTPUT) await page.screenshot({ path: process.env.ACCESS_QA_OUTPUT.replace(/\.png$/, '-dark.png'), animations: 'disabled' });
    await page.evaluate(() => document.documentElement.dataset.theme = 'light');
    await page.setViewportSize({ width: 1440, height: 1000 });

    // A failed refresh hides stale rights, with an explicit retry; never demo.
    unavailable = true;
    await page.locator('#refreshNativeAccess').click();
    await page.locator('#nativeAccessContent [role="alert"]').waitFor();
    assert.equal(await page.locator('[data-access-permission]').count(), 0);
    assert.equal(await page.locator('#accessDemoLayout').isVisible(), false);
    unavailable = false;
    await page.locator('#retryNativeAccess').click();
    await page.locator('[data-access-permission="roles.manage"]').waitFor();

    // Closing while a request is pending must not reopen the console.
    let release;
    hold = new Promise(resolve => { release = resolve; });
    await page.locator('#refreshNativeAccess').click();
    await page.locator('#closeAccessConsole').click();
    const late = page.waitForResponse(response => response.url().endsWith('/native/session/bootstrap'));
    hold = null;
    release();
    await late;
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.locator('#accessConsole').isVisible(), false);
    assert.equal(await page.locator('[data-access-permission]').count(), 0);
    await page.locator('#permissionsNav').click();
    await page.locator('[data-access-permission="roles.manage"]').waitFor();

    // Same admin role, but explicit DENY: console and navigation must close.
    current.deniedPermissions.push('roles.manage');
    await page.locator('#refreshNativeAccess').click();
    await page.waitForFunction(() => SchoolSafeAppContext.getCurrentUser().deniedPermissions.includes('roles.manage'));
    assert.equal(await page.locator('#permissionsNav').isVisible(), false);
    assert.equal(await page.locator('[data-access-permission]').count(), 0);
    assert.equal(await page.locator('#savePermissions').isVisible(), false);
    assert.equal(await page.evaluate(() => SchoolSafeAppContext.getCurrentUser().schoolId), schoolId);

    // Expired sessions must not be revived by the local snapshot.
    current = bootstrap();
    await page.reload();
    await page.waitForFunction(() => window.currentSession?.native && window.currentSession?.profile);
    await page.evaluate(() => schoolSafeShow('workspace'));
    await page.locator('#permissionsNav').click();
    await page.locator('[data-access-permission="roles.manage"]').waitFor();
    refused = true;
    await page.locator('#refreshNativeAccess').click();
    await page.waitForFunction(() => window.currentSession === null);
    assert.equal(await page.locator('#accessConsole').isVisible(), false);
    refused = false;
    await page.reload();
    await page.waitForFunction(() => window.currentSession?.native && window.currentSession?.profile);
    await page.evaluate(() => schoolSafeShow('workspace'));
    current = { ...bootstrap(), schoolId: 'autre-ecole' };
    await page.locator('#permissionsNav').click();
    await page.waitForFunction(() => window.currentSession === null);
    assert.equal(await page.locator('[data-access-permission]').count(), 0, 'a response from another school cannot replace the selected context');
    assert.deepEqual(writes, [], 'reading permissions never queues or sends privilege changes');
    // The existing editor remains available in explicit demo, without a server write.
    await page.locator('#demoRole').selectOption('admin');
    await page.locator('#previewWorkspace').evaluate(element => element.click());
    await page.locator('#permissionsNav').click();
    await page.locator('#accessDemoLayout').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#nativeAccessContent').isVisible(), false);
    await page.locator('#savePermissions').click();
    assert.equal(await page.evaluate(() => SchoolSafeAppContext.getCurrentUser().schoolId), 'demo-school-1');
    assert.deepEqual(writes, [], 'demo editor is preserved without server privilege mutations');
    assert.deepEqual(errors, [], 'no browser exceptions');
    await context.close();
    console.log('PASS native access console: cookie context, module boundaries, permissions, DENY, scopes, mobile, retry, late response, expiry, changed school, zero writes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
