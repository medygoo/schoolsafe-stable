const fs = require('node:fs');
const assert = require('node:assert/strict');

const html = fs.readFileSync('app/index.html', 'utf8');
const app = fs.readFileSync('app/app.js', 'utf8');
const moduleSource = fs.readFileSync('app/modules/reports/reports-demo.js', 'utf8');
const permissions = fs.readFileSync('shared/permissions.json', 'utf8');

// Section HTML du module
assert.ok(/id="reportsModule"/.test(html), 'la section #reportsModule doit exister');
assert.ok(/id="reportsTabs"/.test(html), 'la navigation d’onglets doit exister');
assert.ok(/id="reportsContent"/.test(html), 'le conteneur de contenu doit exister');
assert.ok(/id="closeReportsModule"/.test(html), 'le bouton retour doit exister');
for (const tab of ['history', 'audit', 'administrative', 'exports']) {
  assert.ok(html.includes(`data-reports-tab="${tab}"`), `l’onglet ${tab} doit exister`);
}
assert.ok(/modules\/reports\/reports-demo\.js\?v=reports-module-2026-09-17/.test(html), 'le script du module doit être chargé avec cache-busting');

// Câblage app.js
assert.ok(!/branchKey === "reports"\) \{ notify\(/.test(app), 'la branche reports ne doit plus être un bouton fantôme');
assert.ok(/branchKey === "reports"\) \{ openReportsModule\(\); return; \}/.test(app), 'openModuleByBranch doit ouvrir le module rapports');
assert.ok(/branchKey === "reports"\) \{ openReportsModule\(actionName\); return; \}/.test(app), 'openActionByBranch doit ouvrir l’onglet correspondant');
assert.ok(/function openReportsModule\(/.test(app), 'openReportsModule doit être définie');
assert.ok(/function closeReportsModule\(/.test(app), 'closeReportsModule doit être définie');
assert.ok(/bindIfExists\("closeReportsModule", "click", closeReportsModule\)/.test(app), 'le bouton retour doit être câblé');

// Contrats du module
assert.ok(/SchoolSafeReportsDemo\s*=/.test(moduleSource), 'l’API SchoolSafeReportsDemo doit être exposée');
for (const api of ['render', 'open', 'close', 'canReadReports']) {
  assert.ok(new RegExp(`\\b${api}\\s*:`).test(moduleSource), `l’API ${api} doit être exportée`);
}
// Gardes de permission : les 4 reports.* du catalogue, portée school
for (const code of ['reports.operational.read', 'reports.financial.read', 'reports.security.read', 'reports.hr.read']) {
  assert.ok(moduleSource.includes(code), `la permission ${code} doit être contrôlée`);
  assert.ok(permissions.includes(code), `la permission ${code} doit exister dans le catalogue`);
}
assert.ok(!/fetch\(|XMLHttpRequest/.test(moduleSource), 'le module démo ne doit faire aucun appel réseau');
assert.ok(/BACKEND_LATER/.test(moduleSource), 'le badge démonstration doit être présent');

console.log('qa-reports-module: PASS');