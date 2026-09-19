const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const financeSource = fs.readFileSync(path.join(__dirname, "modules/finance/finance-module.js"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

function primitive(kind) {
  return function (props) {
    props = props || {};
    if (kind === "state") return '<section class="ss-state" data-state="' + (props.type || "") + '"><h3>' + (props.title || "") + "</h3><p>" + (props.message || "") + "</p><small>" + (props.details || "") + "</small></section>";
    if (kind === "table") return "<table>" + (props.rows || "") + "</table>";
    return "<span>" + (props.label || "") + "</span>";
  };
}

function load(options) {
  options = options || {};
  const elements = {
    financeModule: { hidden: true }, financeContent: { innerHTML: "" }, financeModuleTitle: { textContent: "" }, workspaceTitle: { textContent: "" }, cardsProtected: { hidden: false }
  };
  const calls = { feeStructures: 0, studentFees: 0, dailyReport: 0 };
  const root = {
    schoolSafeDemoMode: options.demoMode === true,
    location: { hostname: options.demoMode === true ? "localhost" : "schoolsafe.example" },
    localStorage: { getItem: function () { return null; } },
    currentSession: options.session || { role: "guard", permissions: [] },
    SchoolSafeAccess: { canAccess: function (user, permission) { return !!(user && (user.role === "admin" || (user.permissions || []).indexOf(permission) !== -1)); } },
    SchoolSafeFinanceAPI: {
      getDailyReport: function () { calls.dailyReport += 1; return Promise.resolve({ total_amount: 999, currency: "CDF", payments: [] }); },
      listFeeStructures: function () { calls.feeStructures += 1; return Promise.resolve([]); },
      listStudentFees: function () { calls.studentFees += 1; return Promise.resolve([]); }
    },
    ssState: primitive("state"), ssTable: primitive("table"), ssBadge: primitive("badge"), ssField: primitive("field"), ssInput: primitive("input"), ssSelect: primitive("select"), ssButton: primitive("button"), ssIconButton: primitive("button"),
    money: function (value) { return String(value); }, certificationStatusClass: function () { return "info"; }, icons: function () {}, notify: function () {}, queueOfflineOperation: function () { return Promise.resolve(null); }
  };
  const document = {
    getElementById: function (id) { return elements[id] || null; },
    querySelector: function (selector) { if (selector === ".workspace-grid") return { hidden: false }; if (selector === ".workspace-content") return { scrollTo: function () {} }; return null; },
    querySelectorAll: function () { return []; }
  };
  vm.runInNewContext(financeSource, { window: root, document, console, Date, Promise, Object, Array, Number, String, RegExp, JSON, setTimeout });
  return { module: root.SchoolSafeFinanceModule, elements, calls };
}

async function render(subject, action) {
  subject.module.render("financeModule", action === undefined ? {} : { action });
  await Promise.resolve();
  await Promise.resolve();
  return subject.elements.financeContent.innerHTML;
}

async function main() {
  const realOverview = load({ demoMode: false, session: { role: "finance", permissions: ["finance.fee.read"] } });
  const realOverviewHtml = await render(realOverview, "finance");
  assert.match(realOverviewHtml, /BACKEND_LATER|indisponible/i, "La vue d’ensemble réelle doit déclarer les agrégats non connectés.");
  assert.doesNotMatch(realOverviewHtml, /<small>Frais attendus|<small>Montants enregistrés|<small>Soldes à régulariser|% de recouvrement|<small>Encaissements du jour/i, "Aucun KPI financier non vérifié ne doit être présenté comme réel.");
  assert.deepEqual(realOverview.calls, { feeStructures: 0, studentFees: 0, dailyReport: 0 }, "La vue d’ensemble réelle ne doit pas charger la projection globale legacy.");

  const demoOverview = load({ demoMode: true, session: { role: "admin", permissions: [] } });
  const demoOverviewHtml = await render(demoOverview, "finance");
  // Aligné sur le runtime actuel : la vue d'ensemble démo porte le badge DÉMONSTRATION
  // et déclare explicitement « aucune donnée officielle » (marquage non officiel requis).
  assert.match(demoOverviewHtml, /DÉMONSTRATION[\s\S]*aucune donnée officielle|aucune donnée officielle[\s\S]*DÉMONSTRATION/i, "La vue d’ensemble de démonstration doit être explicitement non officielle.");
  assert.match(demoOverviewHtml, /CDF[\s\S]*USD|USD[\s\S]*CDF/, "Les devises de démonstration doivent rester séparées.");
  assert.match(demoOverviewHtml, /Aucun total CDF \+ USD/i, "La démonstration ne doit jamais additionner CDF et USD.");

  const controlOnly = load({ demoMode: false, session: { role: "guard", permissions: ["finance.control.scan"] } });
  const controlOnlyHtml = await render(controlOnly, "encaissement");
  assert.match(controlOnlyHtml, /Finance générale non autorisée|Accès non autorisé/i, "Une permission de contrôle seule doit refuser Finance générale.");
  assert.doesNotMatch(controlOnlyHtml, /Encaissements|Catalogue des frais|Caisse/i, "Le contrôle seul ne doit ouvrir aucune surface Finance générale.");
  assert.deepEqual(controlOnly.calls, { feeStructures: 0, studentFees: 0, dailyReport: 0 }, "Le contrôle seul ne doit charger aucune donnée Finance générale.");

  const paymentOnly = load({ demoMode: false, session: { role: "cashier", permissions: ["finance.payment.record"] } });
  const paymentOnlyHtml = await render(paymentOnly);
  assert.match(paymentOnlyHtml, /Encaissement non connecté|Encaissement indisponible|Projection Finance non disponible|Encaissements/i, "Le point d’entrée doit choisir la première surface réellement autorisée (encaissement). ");
  assert.doesNotMatch(paymentOnlyHtml, /Catalogue des frais|Frais attendus|Montants enregistrés/i, "finance.payment.record ne doit pas exposer le catalogue ni un aperçu agrégé.");

  const reportsOnly = load({ demoMode: false, session: { role: "finance", permissions: ["finance.report.read"] } });
  const reportsHtml = await render(reportsOnly, "rapport");
  assert.match(reportsHtml, /BACKEND_LATER/, "finance.report.read doit préserver l’état honnête des rapports.");
  assert.equal(reportsOnly.calls.dailyReport, 0, "Rapports ne doit pas réintroduire l’endpoint journalier legacy.");

  const noFinance = load({ demoMode: false, session: { role: "guard", permissions: [] } });
  const noFinanceHtml = await render(noFinance);
  assert.match(noFinanceHtml, /Finance générale non autorisée|Accès non autorisé/i, "Sans permission Finance générale, aucune redirection par rôle n’est autorisée.");
  assert.deepEqual(noFinance.calls, { feeStructures: 0, studentFees: 0, dailyReport: 0 }, "Sans surface autorisée, aucun chargement Finance ne doit être lancé.");

  assert.match(financeSource, /function canReadFinanceReceipts\(\)/, "Les reçus doivent avoir leur garde dédiée.");
  assert.doesNotMatch(financeSource, /role\s*===\s*["'](?:cashier|school_head|finance)["'][\s\S]{0,150}tabs/, "Les onglets Finance couverts par permission ne doivent plus être accordés par rôle.");
  assert.match(financeSource, /canManageControlCampaigns\(\)\s*&&\s*hasFinanceGeneralSurface\(tabs\)/, "finance.control.* doit exiger une surface Finance générale déjà autorisée.");
  assert.match(appSource, /branchKey\s*===\s*["']finance["']\)\s*\{\s*openFinanceModule\(\);\s*return;/, "L’entrée Finance ne doit plus forcer Encaissements.");
  assert.doesNotMatch(appSource, /branchKey\s*===\s*["']finance["']\)\s*\{\s*openFinanceModule\(["']Encaissements["']\)/, "L’entrée Finance ne doit jamais forcer la caisse.");
}

main().then(function () { console.log("FE-FIN-13A final Finance coherence: PASS"); }).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
