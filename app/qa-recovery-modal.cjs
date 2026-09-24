const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, expect } = require('@playwright/test');

const baseURL = process.env.SCHOOLSAFE_URL || 'http://127.0.0.1:4175/';
const chromePath = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
].find(candidate => fs.existsSync(candidate));

async function accessible(page) {
  const modal = page.locator('.ss-modal-overlay.is-open .ss-modal');
  await expect(modal).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Page horizontal overflow');
  assert.equal(await modal.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && el.scrollWidth <= el.clientWidth;
  }), true, 'Modal outside viewport or horizontal overflow');
  for (const control of await modal.locator('input, select, button').all()) {
    if (await control.isVisible()) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
    }
  }
}

async function scenario(browser, name, viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  const recoveryRequests = [];
  page.on('request', request => {
    if (/\/auth\/(recover\/|recovery\/|native\/reset)/.test(request.url())) recoveryRequests.push(request);
  });
  page.on('pageerror', error => errors.push('pageerror: ' + error.message));
  let authMocks = 0;
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const expected401 = message.location().url === 'http://127.0.0.1:8787/auth/native/me'
      && /^Failed to load resource: the server responded with a status of 401 /.test(message.text());
    if (!expected401) errors.push('console: ' + message.text());
  });
  await page.route('**/auth/native/me', route => {
    assert.equal(route.request().method(), 'GET');
    authMocks++;
    return route.fulfill({ status: 401, contentType: 'application/json',
      body: JSON.stringify({ code: 'AUTH_REQUIRED', message: 'Authentification requise' }) });
  });
  try {
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.locator('#enterSplash').click();
    await expect(page.locator('#auth.active')).toBeVisible();
    assert.deepEqual(errors, [], 'STOP: global error before Recovery');
    assert.equal(authMocks, 1, 'Anonymous 401 intercepted');
    console.log(name + ': Auth visible; AUTH_TEST_ISOLATION: 401 MOCK PASS; prior errors: 0');
    const overlay = page.locator('.ss-modal-overlay.is-open');
    async function openRecovery() {
      await expect(page.locator('#forgotPassword')).toBeVisible();
      await page.locator('#forgotPassword').click();
      console.log(name + ': forgotPassword exists; real click executed; DS overlay count: ' + await overlay.count());
      await expect(overlay).toBeVisible();
      await expect(overlay.getByRole('heading', { name: 'Récupérer mon compte', exact: true })).toBeVisible();
      await expect(overlay.getByRole('button', { name: 'Vérifier mes informations', exact: true })).toBeVisible();
      await expect(overlay.getByRole('button', { name: "J'ai un code de récupération de mon école", exact: true })).toBeVisible();
      await accessible(page);
    }
    await openRecovery();
    await overlay.getByRole('button', { name: 'Vérifier mes informations', exact: true }).click();
    await expect(overlay.locator('[name="category"]')).toHaveValue('parent');
    for (const field of ['fullName', 'phoneNumber', 'childFullName', 'className']) {
      await expect(overlay.locator(`[name="${field}"]`)).toBeVisible();
    }
    await accessible(page);
    await overlay.locator('[name="category"]').selectOption('profile');
    for (const field of ['fullName', 'phoneNumber', 'schoolName', 'roleName']) {
      await expect(overlay.locator(`[name="${field}"]`)).toBeVisible();
    }
    await expect(overlay.locator('[name="childFullName"], [name="className"]')).toHaveCount(0);
    await accessible(page);
    await overlay.locator('#recoveryCancel').click();
    await expect(page.locator('.ss-modal-overlay, .ss-overlay')).toHaveCount(0);
    await openRecovery();
    await overlay.getByRole('button', { name: "J'ai un code de récupération de mon école", exact: true }).click();
    await expect(overlay.locator('[name="login"]')).toBeVisible();
    await expect(overlay.locator('[name="code"]')).toBeVisible();
    await expect(overlay.locator('[name="code"]')).toHaveAttribute('pattern', '[0-9]{10}');
    await expect(overlay.locator('[name="code"]')).toHaveAttribute('minlength', '10');
    await expect(overlay.locator('[name="code"]')).toHaveAttribute('maxlength', '10');
    await accessible(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ss-modal-overlay, .ss-overlay')).toHaveCount(0);
    await openRecovery();
    await overlay.locator('[data-modal-close]').click();
    await expect(page.locator('.ss-modal-overlay, .ss-overlay')).toHaveCount(0);
    assert.equal(recoveryRequests.length, 0, 'Opening and choosing Recovery must not call the API');
    // Only the identity-validation response is substituted; no connected session.
    await page.route('**/auth/recovery/admin/redeem', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ reset_token: 'qa-recovery-token' }),
    }));
    await page.route('**/auth/native/reset', route => route.fulfill({
      status: 200, contentType: 'application/json', body: '{}',
    }));
    await openRecovery();
    await overlay.locator('[data-choice="admin"]').click();
    await overlay.locator('[name="login"]').fill('qa@example.test');
    await overlay.locator('[name="code"]').fill('0123456789');
    await overlay.locator('#recoveryActionBtn').click();
    await expect(overlay.getByRole('heading', { name: 'Nouveau mot de passe', exact: true })).toBeVisible();
    await expect(overlay.locator('[name="password"]')).toBeVisible();
    await expect(overlay.locator('[name="confirmation"]')).toBeVisible();
    await accessible(page);
    await overlay.locator('[name="password"]').fill('Recovery-QA-2026!');
    await overlay.locator('[name="confirmation"]').fill('Recovery-QA-2026!');
    await overlay.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.locator('.ss-modal-overlay, .ss-overlay')).toHaveCount(0);
    assert.equal(recoveryRequests.length, 2);
    assert.deepEqual(recoveryRequests[0].postDataJSON(), { login: 'qa@example.test', code: '0123456789' });
    assert.deepEqual(recoveryRequests[1].postDataJSON(), { token: 'qa-recovery-token', password: 'Recovery-QA-2026!' });
    assert.deepEqual(errors, [], 'Errors during Recovery');
    console.log(`${name}: PASS; autonomous, school code, close, Escape, accessibility; JS_ERRORS: 0`);
  } finally {
    if (errors.length) console.error(JSON.stringify({ viewport: name, errors }, null, 2));
    await context.close();
  }
}

(async () => {
  assert.ok(chromePath, 'Existing Chrome required; set CHROME_PATH (no browser download).');
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    await scenario(browser, 'DESKTOP', { width: 1440, height: 1000 });
    await scenario(browser, 'MOBILE', { width: 390, height: 844 });
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
