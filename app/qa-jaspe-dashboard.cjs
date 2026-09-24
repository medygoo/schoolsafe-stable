/* Existing Chrome only: desktop/mobile panel, lifecycle, conversation and audio. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const baseUrl = process.env.SCHOOLSAFE_URL || 'http://127.0.0.1:4176/';
const chromePath = process.env.CHROME_PATH || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
].find(candidate => fs.existsSync(candidate));

async function preview(page, role = "admin") {
  await page.evaluate(() => window.schoolSafeShow("auth"));
  await page.locator("#demoRole").selectOption(role);
  await page.locator("#demoEntry").click();
  await page.waitForFunction(() =>
    document.body.classList.contains("screen-workspace") &&
    document.getElementById("workspace")?.classList.contains("active")
  );
}

async function bounds(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'HORIZONTAL_OVERFLOW');
  const box = await page.locator('#jaspePanelOverlay').boundingBox();
  const size = page.viewportSize();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1, 'panel stays in viewport');
}

(async () => {
  assert.ok(chromePath && fs.existsSync(chromePath), 'INVALID_RED: CHROME_MISSING');
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/auth/native/me', route => route.fulfill({ status: 401, contentType: 'application/json',
      body: JSON.stringify({ code: 'AUTH_REQUIRED', message: 'Authentification requise' }) }));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await preview(page);
    console.log('DEMO_ENTRY: #demoEntry PASS; WORKSPACE_ACTIVE: PASS');
    const desktopLauncher = page.locator("#desktopJaspeLauncher");
    assert.equal(await desktopLauncher.count(), 1, "DESKTOP_JASPE_LAUNCHER_MISSING");
    const desktop = desktopLauncher;
    await expect(desktop).toBeVisible();
    await expect(desktop).toHaveAttribute('aria-controls', 'jaspePanelOverlay');
    assert.equal(await desktop.evaluate(el => el.previousElementSibling.id === 'topbarMessagesWrap' && el.nextElementSibling.id === 'topbarCampus'), true);
    assert.equal(await desktop.evaluate(el => el.getBoundingClientRect().height), 44);
    await expect(desktop.locator('span')).toBeVisible();
    await expect(page.locator('.jaspe-hero, #jaspeHeroLauncher')).toHaveCount(0);
    await expect(page.locator('#jaspeDashboardCharacter')).toHaveCount(0);
    const panel = page.locator('#jaspePanelOverlay');
    const character = page.locator('#jaspeFullStage #jaspeDashboardCharacter');
    const renderer = character.locator('.jaspe2d');
    async function opened(button) {
      await button.click();
      await expect(panel).toHaveAttribute('open', '');
      await expect(character, 'JASPE_CHARACTER_NOT_MOUNTED').toBeVisible();
      await expect(renderer, 'JASPE_CHARACTER_NOT_MOUNTED').toBeVisible();
      await expect(renderer).toHaveCount(1);
      await expect(page.locator('#jaspeDashboardCharacter')).toHaveCount(1);
      await expect.poll(() => renderer.evaluate(el => !!el.querySelector('canvas') || [...el.querySelectorAll('img')].some(img => img.complete && img.naturalWidth > 0))).toBe(true);
      await bounds(page);
      if (process.env.JASPE_QA_OUTPUT) {
        fs.mkdirSync(process.env.JASPE_QA_OUTPUT, { recursive: true });
        await page.screenshot({ path: path.join(process.env.JASPE_QA_OUTPUT, 'jaspe-' + page.viewportSize().width + '.png') });
      }
    }
    async function closed(button, escape = false) {
      if (escape) await page.keyboard.press('Escape');
      else await page.locator('#jaspePanelClose').click();
      await expect(panel).not.toHaveAttribute('open', '');
      await expect(character).toHaveCount(0);
      await expect(page.locator('#jaspeDashboardCharacter')).toHaveCount(0);
      await expect(page.locator('body')).not.toHaveClass(/jaspe-is-out/);
      await expect(page.locator('#jaspePanelInput')).toHaveValue('');
      await expect(button).toBeFocused();
    }
    await opened(desktop);
    await closed(desktop);
    await opened(desktop);
    // Existing SafeAssistant still owns the response and keeps no chat archive.
    await page.locator('#jaspePanelInput').fill('merci');
    await page.locator('#jaspePanelSend').click();
    await expect(page.locator('#jaspePanelBody')).toContainText('Avec plaisir !');
    assert.equal(await page.evaluate(() => SafeAssistant.getHistory().length), 1);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => /history|conversation/i.test(key))), false);
    await closed(desktop, true);
    console.log('DESKTOP_1440_LAUNCHER, PANEL_OPEN, CHARACTER_VISIBLE_IN_FULL_STAGE, CLOSE_UNMOUNT, REOPEN_NO_DUPLICATE, ESCAPE_CLOSE, SAFEASSISTANT_PRESERVED: PASS');
    await page.setViewportSize({ width: 900, height: 800 });
    await expect(desktop).toBeVisible();
    await expect(desktop.locator('span')).toBeHidden();
    assert.deepEqual(await desktop.evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })), { width: 44, height: 44 });
    await opened(desktop);
    await closed(desktop);
    console.log('DESKTOP_900_LAUNCHER: PASS');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(desktop).toBeHidden();
    const mobile = page.locator('[data-bottom-nav="jaspe"]');
    await expect(mobile).toBeVisible();
    await opened(mobile);
    // Deterministic Web Speech adapter: no real microphone or personal audio.
    await page.evaluate(() => {
      window.qaSpoken = [];
      window.qaAborted = 0;
      window.qaCancelled = 0;
      window.SpeechRecognition = class {
        start() { window.qaRecognition = this; }
        abort() { window.qaAborted++; }
      };
      speechSynthesis.speak = utterance => { window.qaSpoken.push(utterance.text); window.qaUtterance = utterance; utterance.onstart?.(); };
      speechSynthesis.cancel = () => { window.qaCancelled++; };
    });
    await page.locator('[data-jaspe-mode="audio"]').click();
    await expect(page.locator('#jaspePanelMic')).toBeVisible();
    await page.locator('#jaspePanelMic').click();
    await expect(page.locator('#jaspePanelMic')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.qaRecognition.onresult({ results: [[{ transcript: 'merci' }]] }));
    await expect.poll(() => page.evaluate(() => window.qaSpoken)).toEqual(['Avec plaisir !']);
    await closed(mobile);
    assert.ok(await page.evaluate(() => window.qaAborted > 0 && window.qaCancelled > 0));
    await opened(mobile);
    await closed(mobile, true);
    assert.deepEqual(errors, [], 'JS_PAGEERROR');
    console.log('MOBILE_EXISTING_BUTTON, AUDIO_PANEL_PRESERVED: PASS; JS_PAGEERROR: 0; HORIZONTAL_OVERFLOW: 0');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
