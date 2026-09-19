// Fresh browser profile only: replace an old manifest cache after deduplication.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    const base = process.env.SCHOOLSAFE_URL;
    await page.route(base, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic cache regression</title>' }));
    await page.goto(base);
    await page.evaluate(async () => {
      const old = await caches.open('schoolsafe-v2-a51-session-denials-2026-09-19');
      await old.put(new URL('assets/jaspe2d/v12/manifest.json', location.href), new Response(JSON.stringify({ stale: true })));
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(async () => navigator.serviceWorker.controller && !(await caches.keys()).includes('schoolsafe-v2-a51-session-denials-2026-09-19'));
    const result = await page.evaluate(async () => {
      const root = new URL('assets/jaspe2d/', location.href);
      const manifest = await fetch(new URL('v12/manifest.json', root)).then(r => r.json());
      const originals = await fetch(new URL('originals/manifest.json', root)).then(r => r.json());
      const packs = await fetch(new URL('jaspe2d-manifest.json', root)).then(r => r.json());
      const seated = await fetch(new URL('assise-v1/manifest.json', root)).then(r => r.json());
      const records = [
        ...Object.values(manifest.files).map(r => ({ ...r, url: new URL(r.url, new URL('v12/', root)).href })),
        ...Object.values(originals.poses).map(r => ({ ...r, url: new URL(r.file, new URL('originals/', root)).href })),
        ...Object.values(packs.packs).flatMap(Object.values).map(r => ({ ...r, url: new URL(r.file, root).href })),
        ...seated.files.map(r => ({ ...r, url: new URL(r.file, new URL('assise-v1/', root)).href })),
      ];
      const failures = [];
      for (const record of records) {
        const response = await fetch(record.url), bytes = await response.arrayBuffer();
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (!response.ok || bytes.byteLength !== record.bytes || digest !== record.sha256) failures.push(record.url);
      }
      return { keys: await caches.keys(), poses: Object.keys(manifest.files).length, alias: manifest.files['images/chin2.png'].url, resources: records.length, failures };
    });
    assert.equal(result.alias, '../originals/chin1.png');
    assert.equal(result.poses, 33); assert.equal(result.resources, 75);
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.keys, ['schoolsafe-v2-bolt-assets-2026-09-19']);
    console.log('PASS: old cache removed; 33 logical poses and 75 JASPE resource mappings fetched with exact SHA-256; duplicate alias works.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
