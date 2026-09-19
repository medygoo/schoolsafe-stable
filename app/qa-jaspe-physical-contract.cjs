const fs = require('node:fs');
const assert = require('node:assert/strict');

const live = fs.readFileSync('app/modules/jaspe2d/live-companion.js', 'utf8');
const app = fs.readFileSync('app/app.js', 'utf8');
const facade = fs.readFileSync('app/modules/jaspe2d/jaspe2d.js', 'utf8');
const html = fs.readFileSync('app/index.html', 'utf8');

assert.ok(/isVisible/.test(live), 'v12 doit recevoir isVisible');
assert.ok(/isTyping/.test(live), 'v12 doit recevoir isTyping');
assert.ok(/isBust/.test(live), 'v12 doit recevoir isBust');
assert.ok(/destroy\s*[:(]/.test(live), 'le handle v12 doit exposer destroy');
assert.ok(/stop\s*[:(]/.test(live), 'le handle v12 doit exposer stop');
assert.ok(!/closest\(['"]\.auth-screen/.test(live), 'v12 ne doit plus dépendre de .auth-screen');
assert.ok(!/if\(typing&&!wasTyping\)\{[^}]*controller\.request\('idle'\)/s.test(live), 'le focus de saisie ne doit pas annuler listen');
assert.ok(!/\['walk','joySway','attentive'\]\.includes/.test(live), 'la saisie ne doit pas annuler la posture attentive explicite');
assert.ok(/presentation-controller\.js/.test(facade), 'la façade doit charger le contrôleur');
assert.ok(/live-companion\.js\?v=physical-controller-02/.test(facade), 'le moteur v12 corrigé doit contourner l’ancien cache');
assert.ok(/jaspe2d\.js\?v=jaspe-dashboard-01/.test(html), 'la façade JASPE doit contourner l’ancien cache');
assert.ok(/app\.js\?v=jaspe-dashboard-01/.test(html), 'les intentions de connexion doivent contourner l’ancien cache');
assert.ok(/sc\.dispatch\s*=/.test(facade), 'mountShowcase doit exposer dispatch');
assert.ok(/sc\.destroy\s*=/.test(facade), 'mountShowcase doit exposer destroy');
assert.ok(/sc\.bubble\.textContent\s*=\s*sc\.pendingBubble/.test(facade), 'le texte doit apparaître sans attendre la préparation de l’image de repli');
assert.ok(!/showcase\.react\s*\(\s*\{\s*pack:/.test(app), 'app.js ne doit plus commander un pack');
for (const kind of ['listen', 'think', 'explain', 'error', 'success']) {
  assert.ok(app.includes(`kind: "${kind}"`), `intention ${kind} absente de la connexion`);
}
assert.ok(/pack:\s*"pack2",\s*key:\s*"speaking",\s*rotate:\s*false/.test(app), 'le repli SPEAKING doit exister sur la connexion');
for (const forbidden of ['speechSynthesis', 'AudioContext', 'viseme', 'phoneme']) {
  assert.ok(!facade.includes(forbidden) && !live.includes(forbidden), `${forbidden} est hors périmètre`);
}

console.log('JASPE physical v12 contract: PASS');
