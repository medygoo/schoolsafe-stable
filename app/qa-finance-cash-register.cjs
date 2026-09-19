const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "modules/finance/finance-module.js"), "utf8");
const indexSource = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

function primitive(kind) {
  return function (props) {
    props = props || {};
    if (kind === "state") return '<section class="ss-state" data-state="' + (props.type || "") + '"><h3>' + (props.title || "") + "</h3><p>" + (props.message || "") + "</p><small>" + (props.details || "") + "</small></section>";
    if (kind === "table") return "<table><thead><tr>" + (props.headers || []).map(function (header) { return "<th>" + header + "</th>"; }).join("") + "</tr></thead><tbody>" + (props.rows || "") + "</tbody></table>";
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
    schoolSafeDemoMode: options.demoMode !== false,
    location: { hostname: options.demoMode === false ? "schoolsafe.example" : "localhost" },
    localStorage: { getItem: function () { return null; } },
    currentSession: options.session || { role: "admin", permissions: [] },
    SchoolSafeAccess: { canAccess: function (user, permission) { return !!(user && (user.role === "admin" || (user.permissions || []).indexOf(permission) !== -1)); } },
    SchoolSafeFinanceAPI: {
      getDailyReport: function () { dailyCalls += 1; return Promise.resolve({ payments: [] }); },
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

async function renderCashRegister(subject) {
  subject.module.render("financeModule", { action: "caisse" });
  await Promise.resolve();
  await Promise.resolve();
  return subject.elements.financeContent.innerHTML;
}

async function main() {
  assert.match(indexSource, /data-finance-tab="cash"[\s\S]*?Encaissements/, "Encaissements doit rester une entrée distincte.");
  assert.match(indexSource, /data-finance-tab="cash-register"[\s\S]*?Caisse/, "La navigation doit exposer une entrée Caisse distincte.");

  const demo = load({ demoMode: true });
  const demoHtml = await renderCashRegister(demo);
  assert.match(demoHtml, /Caisse[\s\S]*DÉMO|DÉMO[\s\S]*Caisse/, "La Caisse démo doit être explicitement identifiée comme fictive.");
  assert.match(demoHtml, /CDF[\s\S]*Espèces[\s\S]*Autres moyens/, "La projection démo doit séparer les moyens pour CDF.");
  assert.match(demoHtml, /USD[\s\S]*Espèces[\s\S]*Autres moyens/, "La projection démo doit séparer les moyens pour USD.");
  assert.doesNotMatch(demoHtml, /Clôturer|Soumettre|PDF|Dépenses à approuver|dayStatus/i, "La Caisse démo ne doit proposer aucune action ou donnée officielle legacy.");
  assert.match(demoHtml, /Aucun total CDF \+ USD/i, "La Caisse démo doit indiquer explicitement que les devises ne sont pas additionnées.");
  assert.doesNotMatch(demoHtml, /Total global|Total combiné|Total unique/i, "La Caisse démo ne doit jamais afficher un total unique multi-devise.");

  const real = load({ demoMode: false, session: { role: "admin", permissions: [] } });
  const realHtml = await renderCashRegister(real);
  assert.match(realHtml, /BACKEND_LATER/, "La Caisse réelle doit rester explicitement indisponible.");
  assert.match(realHtml, /projection serveur|devise|moyen|scope/i, "Les prérequis de la Caisse réelle doivent être expliqués.");
  assert.equal(real.dailyCalls(), 0, "La Caisse réelle ne doit pas appeler le rapport journalier comme faux journal officiel.");
  assert.doesNotMatch(realHtml, /id="closeCashRegister"|id="submitCashDay"|Clôturer la caisse|Journée soumise|Caisse ouverte|Dépenses à approuver|Rapport de caisse PDF/i, "La Caisse réelle ne doit présenter aucune action ou état local comme officiel.");

  const noAccess = load({ demoMode: false, session: { role: "cashier", permissions: ["finance.payment.record"] } });
  const deniedHtml = await renderCashRegister(noAccess);
  assert.doesNotMatch(deniedHtml, /Caisse.*BACKEND_LATER|BACKEND_LATER.*Caisse/i, "Sans permission existante de clôture, la surface Caisse ne doit pas contourner ACCESS_LAW.");

  assert.doesNotMatch(source, /var canClose\s*=\s*role\s*===\s*"cashier"\s*\|\|\s*role\s*===\s*"admin"/, "La clôture legacy ne doit plus être pilotée par rôle.");
  assert.doesNotMatch(source, /data-export-receipt-id[\s\S]{0,120}Journal de caisse|Journal de caisse[\s\S]{0,160}data-export-receipt-id/, "Encaissements ne doit plus présenter un PDF de reçu comme composante de Caisse.");
}

main().then(function () { console.log("FE-FIN-11A honest cash register: PASS"); }).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
