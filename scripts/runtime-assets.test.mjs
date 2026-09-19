import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ALL_PATRIMOINS } from '../app/modules/cards/assets/card-data.js';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
function verify(base, record, file = record.file) {
  const bytes = fs.readFileSync(path.resolve(base, file));
  assert.equal(bytes.length, record.bytes, file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, file);
}
test('all JASPE v12 logical poses, portraits, fallback packs and seated sheets resolve with unchanged pixels', () => {
  const root = 'app/assets/jaspe2d';
  const v12 = read(`${root}/v12/manifest.json`);
  assert.equal(Object.keys(v12.files).length, 33);
  for (const record of Object.values(v12.files)) verify(`${root}/v12`, record, record.url);
  const portraits = Object.values(read(`${root}/originals/manifest.json`).poses);
  assert.equal(portraits.length, 7);
  for (const record of portraits) verify(`${root}/originals`, record);
  const fallback = Object.values(read(`${root}/jaspe2d-manifest.json`).packs).flatMap(Object.values);
  assert.equal(fallback.length, 21);
  for (const record of fallback) verify(root, record);
  const seated = read(`${root}/assise-v1/manifest.json`).files;
  assert.equal(seated.length, 14);
  for (const record of seated) verify(`${root}/assise-v1`, record);
  assert.ok(fs.existsSync(`${root}/attente-v13/adossee-detouree.png`));
});
test('all 60 card illustrations have nonempty PNGs; QR and HD capture libraries remain local', () => {
  assert.equal(ALL_PATRIMOINS.length, 60);
  for (const record of ALL_PATRIMOINS) {
    const bytes = fs.readFileSync(`app/modules/cards/assets/patrimoine/${record.value}.png`);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0);
  }
  for (const file of ['qrcode.min.js', 'html2canvas.min.js']) assert.ok(fs.statSync(`app/vendor/${file}`).size > 1000);
});
