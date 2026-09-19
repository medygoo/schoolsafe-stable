const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "modules/finance/finance-module.js"), "utf8");

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
  let dailyCalls = 0;
  const root = {
    schoolSafeDemoMode: options.demoMode === true,
    location: { hostname: options.demoMode === true ? "localhost" : "schoolsafe.example" },
    localStorage: { getItem: function () { return null; } },
    currentSession: options.session || { role: "guard", permissions: [] },
    SchoolSafeAccess: { canAccess: function (user, permission) { return !!(user && (user.role === "admin" || (user.permissions || []).indexOf(permission) !== -1)); } },
    SchoolSafeFinanceAPI: {
      getDailyReport: function () { dailyCalls += 1; return Promise.resolve({ total_amount: 101, currency: "CDF", payments: [] }); },
      listFeeStructures: function () { return Promise.resolve([]); },
      listStudentFees: function () { return Promise.resolve([]); }
    },
    ssState: primitive("state"), ssTable: primitive("table"), ssBadge: primitive("badge"), ssField: primitive("field"), ssInput: primitive("input"), ssSelect: primitive("select"), ssButton: primitive("button"), ssIconButton: primitive("button"),
    money: function (value) { return String(value); }, certificationStatusClass: function () { return "info"; }, icons: function () {}, notify: function () {}, queueOfflineOperation: function () { return Promise.resolve(null); }
  };
  const document = {
    getElementById: function (id) { return elements[id] || null; },
    querySelector: function (selector) { if (selector === ".workspace-grid") return { hidden: false }; if (selector === ".workspace-content") return { scrollTo: function () {} }; return null; },
    querySelectorAll: function () { return []; }
  };
  vm.runInNewContext(source, { window: root, document, console, Date, Promise, Object, Array, Number, String, RegExp, JSON, setTimeout });
  return { module: root.SchoolSafeFinanceModule, elements, dailyCalls: function () { return dailyCalls; } };
}

async function renderReports(subject) {
  subject.module.render("financeModule", { action: "rapport" });
  await Promise.resolve();
  await Promise.resolve();
  return subject.elements.financeContent.innerHTML;
}

async function main() {
  const denied = load({ demoMode: false, session: { role: "guard", permissions: ["finance.payment.record"] } });
  const deniedHtml = await renderReports(denied);
  assert.equal(denied.dailyCalls(), 0, "Sans finance.report.read, aucun rapport ne doit être chargé.");
  assert.doesNotMatch(deniedHtml, /Rapport journalier|Encaissements|101/, "Sans permission, aucune surface Rapports ne doit être exposée.");

  const authorised = load({ demoMode: false, session: { role: "finance", permissions: ["finance.report.read"] } });
  const realHtml = await renderReports(authorised);
  assert.equal(authorised.dailyCalls(), 0, "Le rapport journalier actuel ne doit pas être appelé comme rapport officiel.");
  assert.match(realHtml, /BACKEND_LATER/, "Le mode réel doit rendre le contrat serveur manquant explicite.");
  assert.match(realHtml, /devise|multi-devise|CDF|USD/i, "Le blocage multi-devise doit être expliqué.");
  assert.doesNotMatch(realHtml, /Rapport journalier du|Encaissements|Espèces constatées|Autres moyens constatés|101/, "Le rapport journalier legacy ne doit pas être présenté comme officiel.");
  assert.doesNotMatch(realHtml, /data-export|<button[^>]*>[^<]*(?:CSV|Excel|PDF|export)/i, "Aucun faux export réel ne doit être exposé.");

  const demo = load({ demoMode: true, session: { role: "admin", permissions: [] } });
  const demoHtml = await renderReports(demo);
  assert.match(demoHtml, /DÉMO[\s\S]*Non officiel|Non officiel[\s\S]*DÉMO/i, "La surface de démonstration doit être explicitement non officielle.");
  assert.match(demoHtml, /CDF[\s\S]*USD|USD[\s\S]*CDF/, "La démonstration doit séparer les devises.");
  assert.match(demoHtml, /Aucun total CDF \+ USD/i, "La démonstration ne doit jamais combiner les devises.");
  assert.equal(demo.dailyCalls(), 0, "La démonstration n'appelle aucune API de rapport.");

  assert.match(source, /function canReadFinanceReports\(\)/, "La permission Rapports doit être isolée dans une garde dédiée.");
  assert.doesNotMatch(source, /role\s*===\s*["'](?:cashier|school_head|finance)["'][\s\S]{0,100}reports/, "La visibilité Rapports ne doit plus être autorisée par rôle.");
  assert.doesNotMatch(source, /exportCashReportPdf\(\)[\s\S]{0,350}renderReports|renderReports[\s\S]{0,350}exportCashReportPdf\(\)/, "La surface Rapports ne doit pas réexposer le PDF de caisse legacy.");
}

main().then(function () { console.log("FE-FIN-12A honest finance reports: PASS"); }).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
