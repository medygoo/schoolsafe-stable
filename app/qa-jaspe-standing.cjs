/* Registered rise/stand/sit sequence, lifecycle and missing-asset fallback. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = process.env.SCHOOLSAFE_URL || 'http://127.0.0.1:4176/';
const output = process.env.JASPE_QA_OUTPUT;
const waitAction = (page, action) => page.waitForFunction(action => document.getElementById('light').dataset.action === action, action);

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('jaspe-assise-preview.html', base).href);
    await page.waitForFunction(() => document.querySelectorAll('[data-ready="true"]').length === 2);
    await page.evaluate(() => {
      window.qaFrames = [];
      const host = document.getElementById('light');
      new MutationObserver(() => {
        const item = host.dataset.action + ':' + host.dataset.frame;
        if (qaFrames.at(-1) !== item) qaFrames.push(item);
      }).observe(host, { attributes: true, attributeFilter: ['data-action', 'data-frame'] });
    });
    await page.locator('[data-action="standExplain"]').click();
    await waitAction(page, 'standExplain');
    assert.deepEqual(await page.evaluate(() => qaFrames.filter(f => f.startsWith('rise:'))), ['rise:0', 'rise:1', 'rise:2', 'rise:3']);
    await page.waitForFunction(() => document.getElementById('light').dataset.frame !== '0');
    for (const [id, suffix] of [['light', '-clair.png'], ['dark', '-sombre.png']]) {
      assert.equal(await page.locator('#' + id).getAttribute('data-posture'), 'standing');
      assert.equal(await page.locator('#' + id + ' .jaspe-seated__frame').evaluateAll((els, suffix) => els.some(el => el.style.opacity === '1' && el.style.backgroundImage.includes('debout-parole' + suffix)), suffix), true);
    }
    if (output) {
      fs.mkdirSync(output, { recursive: true });
      await page.screenshot({ path: path.join(output, 'jaspe-debout-comparaison.png'), fullPage: true });
    }
    await page.evaluate(() => qaFrames = []);
    await page.locator('[data-action="idle"]').click();
    await waitAction(page, 'idle');
    assert.deepEqual(await page.evaluate(() => qaFrames.filter(f => f.startsWith('sit:'))), ['sit:3', 'sit:2', 'sit:1', 'sit:0']);

    // Interrupt halfway through rising; do not finish rising before sitting again.
    await page.evaluate(() => qaFrames = []);
    await page.locator('[data-action="standExplain"]').click();
    await page.waitForFunction(() => document.getElementById('light').dataset.action === 'rise' && document.getElementById('light').dataset.frame === '1');
    await page.locator('[data-action="idle"]').click();
    await waitAction(page, 'idle');
    assert.equal(await page.evaluate(() => qaFrames.some(f => f.startsWith('standExplain:'))), false);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-action="standExplain"]').click();
    await waitAction(page, 'standExplain');
    assert.equal(await page.locator('#light').getAttribute('data-playing'), 'false');
    assert.equal(await page.locator('#light').getAttribute('data-frame'), '0');
    await page.locator('[data-action="idle"]').click();
    await waitAction(page, 'idle');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // A timed explanation returns seated; hiding/deactivating cancels pending work.
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'qaLifecycle';
      Object.assign(host.style, { position: 'fixed', top: '0', left: '0', width: '200px', zIndex: '20' });
      document.body.appendChild(host);
      window.qaPlayer = SchoolSafeJaspeSeated.mount(host, { autoRead: false });
      qaPlayer.setAction('standExplain', { duration: 1600 });
    });
    await page.waitForFunction(() => document.getElementById('qaLifecycle').dataset.action === 'standExplain');
    await page.waitForFunction(() => document.getElementById('qaLifecycle').dataset.action === 'idle');
    await page.evaluate(() => { qaPlayer.setAction('standExplain'); qaPlayer.setActive(false); });
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('#qaLifecycle').getAttribute('data-playing'), 'false');
    await page.evaluate(() => { qaPlayer.setActive(true); });
    await page.waitForFunction(() => document.getElementById('qaLifecycle').dataset.action === 'idle');
    // Automatic theme selection keeps the same action when the root theme changes.
    await page.evaluate(() => { qaPlayer.setAction('standExplain'); });
    await page.waitForFunction(() => document.getElementById('qaLifecycle').dataset.action === 'standExplain');
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    await page.waitForFunction(() => document.getElementById('qaLifecycle').dataset.theme === 'dark');
    assert.equal(await page.locator('#qaLifecycle').getAttribute('data-action'), 'standExplain');
    await page.evaluate(() => { qaPlayer.destroy(); document.getElementById('qaLifecycle').remove(); });

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    assert.deepEqual(errors, []);
    await page.close();

    const missing = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    let failedLoads = 0;
    await missing.route('**/debout-parole-*.png', route => { failedLoads++; return route.fulfill({ status: 404, body: '' }); });
    await missing.goto(new URL('jaspe-assise-preview.html#debout', base).href);
    await waitAction(missing, 'speakBoth');
    await missing.locator('[data-action="standExplain"]').click();
    await waitAction(missing, 'speakBoth');
    assert.equal(failedLoads, 2, 'missing sheet is not retried endlessly');
    await missing.close();
    console.log('PASS: rise 0-1-2-3, standing gestures, return 3-2-1-0, interruption, duration, theme, reduced motion, deactivation, missing-asset fallback, 390/320px.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
