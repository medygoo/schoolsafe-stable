const fs = require('node:fs');
const assert = require('node:assert/strict');

const read = relativePath => fs.readFileSync(relativePath, 'utf8');
const entryCss = read('app/styles/screens/entry.css');
const assistant = read('app/modules/safe/safe-assistant.js');
const html = read('app/index.html');
const app = read('app/app.js');
const qaFiles = [
  'app/qa-dashboard.cjs',
  'app/qa-i18n.cjs',
  'app/qa-pwa.cjs',
  'app/qa-smoke.cjs',
].map(read).join('\n');

for (const selector of ['.guardian', '.guardian-copy', '.children-line', '.overlay-brand', '.gallery-source']) {
  assert.ok(!entryCss.includes(selector), `style obsolète encore présent : ${selector}`);
}
assert.ok(!/\[\s*["']splash["']\s*,\s*["']guardian["']/.test(assistant), 'guardian reste déclaré comme surface JASPE');
assert.ok(!/id=["']guardian["']|continueGuardian|backGuardian/.test(html + app), 'l’ancien écran guardian reste raccordé');
assert.ok(!/continueGuardian|backGuardian|#guardian(?:\.|["'])/.test(qaFiles), 'un ancien test attend encore guardian');
assert.ok(app.includes('school.guardian.read'), 'la permission métier des tuteurs doit être conservée');

console.log('Legacy guardian screen removal: PASS');
