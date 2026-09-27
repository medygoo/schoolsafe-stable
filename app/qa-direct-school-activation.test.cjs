const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app/app.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'app/modules/authnative/auth-native.js'), 'utf8');

test('direct school activation replaces the approval entry point', () => {
  assert.doesNotMatch(html, /id="createAccount"|Nouveau compte SchoolSafe|Créer un compte/);
  assert.doesNotMatch(html, /account-approval=/);
  assert.doesNotMatch(app + client, /accountRegistrationForm|registerAccount|reviewAccountRegistration|decideAccountRegistration|account-approval=|\/auth\/registrations/);
  assert.match(app, /type="password"[^>]*id="schoolActivationCode"|id="schoolActivationCode"[^>]*type="password"/);
  assert.match(app, /ACTIVER MON ÉCOLE/);
});

test('the seven existing setup stages remain in their canonical order', () => {
  const labels = ['Identité', 'Cycles', 'Année scolaire', 'Coordonnées', 'Identité visuelle', 'Administrateur', 'Vérification'];
  const sourceLabels = JSON.parse(app.match(/var stepLabels = (\[[\s\S]*?\]);/)[1]);
  assert.deepEqual(sourceLabels, labels);
});
