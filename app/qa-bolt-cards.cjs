// Actual renderer, QR library, images and PNG capture; synthetic data only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.SCHOOLSAFE_URL);
    await page.evaluate(() => window.schoolSafeShow('auth'));
    await page.locator('#demoRole').selectOption('admin');
    await page.locator('#previewWorkspace').evaluate(element => element.click());
    await page.evaluate(async () => {
      window.cardQA = await import('./modules/cards/card-renderer.js');
      const data = await import('./modules/cards/assets/card-data.js');
      await Promise.all(data.ALL_PATRIMOINS.map(p => new Promise((resolve, reject) => {
        const image = new Image(); image.onload = resolve;
        image.onerror = () => reject(new Error('Missing patrimoine: ' + p.value));
        image.src = './modules/cards/assets/patrimoine/' + p.value + '.png';
      })));
      window.cardDataQA = data;
      document.querySelector('#cardsStudio').hidden = false;
    });
    assert.equal(await page.evaluate(() => cardDataQA.ALL_PATRIMOINS.length), 60);
    const output = process.env.BOLT_QA_OUTPUT;
    if (output) fs.mkdirSync(output, { recursive: true });
    const files = [];
    const captureErrors = [];
    for (const [name, cycle, expectedType] of [['1ere primaire', 'primaire', 'badge'], ['5e secondaire', 'secondaire', 'carte']]) {
      const rendered = await page.evaluate(({ name, cycle }) => {
        const container = document.querySelector('#cardsPreview');
        return cardQA.renderCardPreview(container,
          { id: 'synthetic-student', mat: 'SYNTHETIC-001', name: 'Eleve Synthetique Test' },
          { name, cycle, card_family: 'A', card_variant: 0 },
          { name: 'Enseignant Synthetique' }, '2026-2027', { name: 'Ecole Synthetique' }, '/schoolsafe-logo.png');
      }, { name, cycle });
      assert.equal(rendered.type, expectedType);
      await page.waitForFunction(() => document.querySelectorAll('#cardsPreview [id^="ss-qr-"] canvas').length === 2);
      await page.waitForFunction(() => [...document.querySelectorAll('#cardsPreview img')].every(i => i.complete && i.naturalWidth > 0));
      if (output) await page.locator('#cardsPreview').screenshot({ path: path.join(output, expectedType + '-preview.png') });
      for (const selector of expectedType === 'badge' ? ['#ss-br', '#ss-bv'] : ['#ss-cr', '#ss-cv']) {
        try {
        const result = await page.evaluate(async selector => {
          const container = document.querySelector('#cardsPreview');
          const rect = container.querySelector(selector).getBoundingClientRect();
          return { data: await cardQA.captureCardPng(container, selector), width: rect.width, height: rect.height };
        }, selector);
        const bytes = Buffer.from(result.data.split(',')[1], 'base64');
        assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
        assert.equal(bytes.readUInt32BE(16), Math.round(result.width * 2));
        assert.equal(bytes.readUInt32BE(20), Math.round(result.height * 2));
        const filename = selector.slice(1) + '.png';
        if (output) fs.writeFileSync(path.join(output, filename), bytes);
        files.push({ filename, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length });
        } catch (error) {
          captureErrors.push({ selector, error: error.message.split('\n')[0] });
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ renderAndQR: 'PASS', pngExport: captureErrors.length ? 'FAIL' : 'PASS', patrimoine: 60, qrCanvasesPerCard: 2, files, captureErrors, backend: 'not contacted' }));
    assert.deepEqual(captureErrors, [], 'HD PNG export must work; failures are not waived by packaging QA');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
