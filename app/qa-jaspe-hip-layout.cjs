/* Real browser: reference placement, registered V12 gestures and pause lifecycle. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.SCHOOLSAFE_URL || 'http://127.0.0.1:4176/';
const output = process.env.JASPE_QA_OUTPUT;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const errors = [], deskRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/assise-v1/')) deskRequests.push(request.url()); });
    await page.goto(base);
    await page.evaluate(() => {
      schoolSafeShow('auth');
      const mount = SchoolSafeJaspe2d.mountShowcase;
      SchoolSafeJaspe2d.mountShowcase = (...args) => (window.qaShowcase = mount(...args));
    });
    await page.locator('#demoRole').selectOption('parent');
    await page.locator('#previewWorkspace').evaluate(el => el.click());
    await page.waitForFunction(() => document.querySelector('#jaspeDashboardCharacter .jaspe2d--live'));
    await page.evaluate(() => window.qaEngine = document.getElementById('jaspeDashboardCharacter').jaspePresentation);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const width of [320, 390, 768, 1100, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      const bounds = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        const scene = box('.jaspe-hero__scene'), person = box('#jaspeHeroLauncher');
        const speech = box('.jaspe-hero__speech'), chat = box('.jaspe-hero__chat');
        const canvas = box('#jaspeDashboardCharacter canvas');
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          beside: person.right <= speech.left + 1 && person.top < speech.bottom,
          below: chat.top >= scene.bottom - 1,
          ratio: canvas.width / canvas.height,
          crop: (person.bottom - canvas.top) / canvas.height * 1537,
          // Original guide hand and hair anchors must remain inside the crop.
          handFits: canvas.left + 803 / 1023 * canvas.width < person.right && canvas.top + 595 / 1537 * canvas.height < person.bottom,
          headFits: canvas.left + 245 / 1023 * canvas.width >= person.left - 1 && canvas.top + 110 / 1537 * canvas.height >= person.top - 1
        };
      });
      assert.equal(bounds.overflow, false, `${width}/${theme}: no page overflow`);
      assert.equal(bounds.beside, true, 'character left, speech right');
      assert.equal(bounds.below, true, 'input below scene');
      assert.ok(Math.abs(bounds.ratio - 1023 / 1537) < .001, `${width}/${theme}: no image stretching ${JSON.stringify(bounds)}`);
      assert.ok(bounds.crop > 780 && bounds.crop < 850, 'crop at original hip line');
      assert.ok(bounds.handFits && bounds.headFits, `${width}/${theme}: hands and head fit`);
      assert.equal(await page.locator('.jaspe-hero .jaspe-seated__desk').count(), 0);
      if (output && [390, 1440].includes(width)) {
        fs.mkdirSync(output, { recursive: true });
        await page.locator('#jaspeDashboardWelcome').screenshot({ path: path.join(output, `jaspe-sans-table-${width}-${theme}.png`) });
      }
    }
    assert.deepEqual(deskRequests, [], 'no desk sheet is requested by the dashboard');
    const still = await page.evaluate(() => qaEngine.getState().clock);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => qaEngine.getState().clock), still, 'reduced motion stays still');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      qaShowcase.stop();
      qaShowcase.dispatch({ kind: 'explain', holdMs: 0, source: 'qa-trusted-ui' });
    });
    await page.waitForFunction(() => qaEngine.getState()?.action === 'guide');
    await page.waitForFunction(() => qaEngine.getState()?.frame.to === 'guide');
    assert.equal(await page.evaluate(() => qaShowcase.getState().engine), 'v12');
    if (output) await page.locator('#jaspeDashboardWelcome').screenshot({ path: path.join(output, 'jaspe-sans-table-geste.png') });
    await page.evaluate(() => {
      qaShowcase.stop();
      const spacer = document.createElement('div');
      spacer.id = 'qaSpacer'; spacer.style.height = '3000px'; document.body.appendChild(spacer);
      scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(150);
    const paused = await page.evaluate(() => qaEngine.getState().clock);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => qaEngine.getState().clock), paused, 'off-screen rendering paused');
    await page.evaluate(() => { document.getElementById('qaSpacer').remove(); scrollTo(0, 0); });
    await page.waitForFunction(clock => qaEngine.getState().clock > clock, paused);
    assert.deepEqual(errors, []);
    console.log('PASS hip layout: 10 viewport/theme pairs, original ratio, hip crop, hand/head bounds, chat below, no desk, real V12 gesture, reduced motion and viewport pause.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
