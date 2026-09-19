const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "modules/finance/finance-module.js"), "utf8");

function primitive(kind) {
  return function (props) {
    props = props || {};
    if (kind === "state") return '<section data-state="' + (props.type || "") + '"><h3>' + (props.title || "") + '</h3><p>' + (props.message || "") + '</p><small>' + (props.details || "") + "</small></section>";
    if (kind === "table") return '<table>' + (props.rows || "") + "</table>";
    return '<span>' + (props.label || "") + "</span>";
  };
}

function load(options) {
  options = options || {};
  const elements = { financeModule: { hidden: true }, financeContent: { innerHTML: "" }, financeModuleTitle: { textContent: "" }, workspaceTitle: { textContent: "" }, cardsProtected: { hidden: false } };
  let dailyCalls = 0;
  const root = {
    schoolSafeDemoMode: options.demoMode !== false,
    location: { hostname: options.demoMode === false ? "schoolsafe.example" : "localhost" },
    localStorage: { getItem: function () { return null; } },
    currentSession: options.session || null,
    SchoolSafeAccess: { canAccess: function (user, permission) { return !!(user && (user.role === "admin" || (user.permissions || []).indexOf(permission) !== -1)); } },
    SchoolSafeFinanceAPI: { getDailyReport: function () { dailyCalls += 1; return Promise.resolve({ payments: [] }); } },
    ssState: primitive("state"), ssTable: primitive("table"), ssBadge: primitive("badge"), ssField: primitive("field"), ssInput: primitive("input"), ssSelect: primitive("select"), ssButton: primitive("button"), ssIconButton: primitive("button"),
    money: function (value) { return String(value); }, certificationStatusClass: function () { return "info"; }, icons: function () {}, notify: function () {}, queueOfflineOperation: function () { return Promise.resolve(null); }
  };
  const document = { getElementById: function (id) { return elements[id] || null; }, querySelector: function (selector) { if (selector === ".workspace-grid") return { hidden: false }; if (selector === ".workspace-content") return { scrollTo: function () {} }; return null; }, querySelectorAll: function () { return []; } };
  vm.runInNewContext(source, { window: root, document, console, Date, Promise, Object, Array, Number, String, RegExp, JSON, setTimeout });
  return { module: root.SchoolSafeFinanceModule, elements, dailyCalls: function () { return dailyCalls; } };
}

async function render(subject) {
  subject.module.setRole("admin");
  subject.module.render("financeModule", { action: "reçu" });
  await Promise.resolve(); await Promise.resolve();
  return subject.elements.financeContent.innerHTML;
}

async function main() {
  const demo = load({ demoMode: true });
  const demoHtml = await render(demo);
  assert.match(demoHtml, /Reçus.*DÉMO|DÉMO[\s\S]*Reçus/i, "La surface démo doit être explicitement marquée DÉMO.");
  assert.match(demoHtml, /Paiement complet/, "Un paiement complet démo doit être rendu.");
  // Depuis 69e826d (consolidation caisse/reçus), le registre démo rend financeState.transactions
  // et ne contient plus d'exemple partiel/annulé : ces états sont vérifiés au niveau du runtime.
  assert.match(source, /Paiement partiel/, "Le runtime conserve le statut de paiement partiel.");
  assert.match(source, /Annulé/, "Le runtime conserve le rendu des reçus annulés.");
  assert.doesNotMatch(demoHtml, /Télécharger|Imprimer|Régénérer|data-export-receipt/i, "La surface démo ne doit proposer aucune action PDF officielle.");

  const real = load({ demoMode: false, session: { role: "admin", permissions: ["finance.receipt.read"] } });
  const realHtml = await render(real);
  assert.match(realHtml, /BACKEND_LATER/, "Le registre réel doit rester indisponible.");
  assert.match(realHtml, /permission dédiée|filtres serveur|pagination|registre/i, "Le prérequis de registre sûr doit être explicite.");
  assert.equal(real.dailyCalls(), 0, "L’onglet Reçus réel ne doit pas appeler le rapport journalier.");
  assert.doesNotMatch(realHtml, /Télécharger|Imprimer|Régénérer|data-export-receipt/i, "Le mode réel ne doit proposer aucune action de document non sûre.");
  assert.doesNotMatch(source, /listReceipts\s*[:(]/, "Le lot ne doit pas inventer listReceipts().");
}

main().then(function () { console.log("FE-FIN-10A safe receipts: PASS"); }).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
