const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const moduleSource = fs.readFileSync(path.join(__dirname, "modules/finance/finance-module.js"), "utf8");

function attrsFrom(props) {
  return Object.entries(props || {}).map(function ([key, value]) {
    if (value === false || value == null) return "";
    if (value === true) return " " + key;
    return " " + key + '=\"' + String(value) + '\"';
  }).join("");
}

function primitive(tagName) {
  return function (props) {
    props = props || {};
    if (tagName === "table") return '<table class="finance-table">' + (props.rows || "") + "</table>";
    if (tagName === "state") return '<section class="ss-state" data-state="' + (props.type || "") + '"><h3>' + (props.title || "") + "</h3><p>" + (props.message || "") + "</p></section>";
    if (tagName === "field") return props.inputHtml || "";
    if (tagName === "input") return '<input' + attrsFrom({ id: props.id, name: props.name, type: props.type, min: props.min, max: props.max, step: props.step, value: props.value, disabled: props.disabled, required: props.required }) + ">";
    if (tagName === "select") return '<select' + attrsFrom({ id: props.id, name: props.name, "data-value": props.value, disabled: props.disabled, required: props.required }) + ">" + (props.options || []).map(function (option) {
      return '<option value="' + option.value + '"' + (option.value === props.value ? " selected" : "") + ">" + option.label + "</option>";
    }).join("") + "</select>";
    if (tagName === "button") return '<button' + attrsFrom({ type: props.type, disabled: props.disabled }) + ">" + (props.label || "") + "</button>";
    return '<span class="ss-' + tagName + '">' + (props.label || "") + "</span>";
  };
}

function loadModule(options) {
  options = options || {};
  const elements = {
    financeModule: { hidden: true },
    financeContent: { innerHTML: "" },
    financeModuleTitle: { textContent: "" },
    workspaceTitle: { textContent: "" },
    cardsProtected: { hidden: false }
  };
  const window = {
    schoolSafeDemoMode: options.demoMode !== false,
    location: { hostname: options.demoMode === false ? "schoolsafe.example" : "127.0.0.1" },
    localStorage: { getItem: function () { return null; } },
    SchoolSafeAccess: { canAccess: function (user, permission) { return !!(user && (user.role === "admin" || (user.permissions || []).includes(permission))); } },
    currentSession: options.session || { role: "admin", permissions: [] },
    ssState: primitive("state"), ssTable: primitive("table"), ssBadge: primitive("badge"), ssField: primitive("field"), ssInput: primitive("input"), ssSelect: primitive("select"), ssButton: primitive("button"), ssIconButton: primitive("icon-button"),
    money: function (value) { return Number(value || 0).toLocaleString("fr-FR") + " FC"; },
    certificationStatusClass: function () { return "info"; }, icons: function () {}, notify: function () {}, queueOfflineOperation: function () { return Promise.resolve(null); }
  };
  const document = {
    getElementById: function (id) { return elements[id] || null; },
    querySelector: function (selector) { if (selector === ".workspace-grid") return { hidden: false }; if (selector === ".workspace-content") return { scrollTo: function () {} }; return null; },
    querySelectorAll: function () { return []; }
  };
  vm.runInNewContext(moduleSource, { window: window, document: document, console: console, Date: Date, Promise: Promise, Object: Object, Array: Array, Number: Number, String: String, RegExp: RegExp, JSON: JSON, setTimeout: setTimeout });
  return { module: window.SchoolSafeFinanceModule, elements: elements };
}

async function renderCash(subject) {
  subject.module.render("financeModule", { action: "encaissement" });
  await Promise.resolve();
  await Promise.resolve();
  return subject.elements.financeContent.innerHTML;
}

async function main() {
  const paymentAccessFunction = moduleSource.match(/function canRecordPayment\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(paymentAccessFunction, "Le contrôle d’accès d’encaissement doit être isolé.");
  assert.doesNotMatch(paymentAccessFunction[1], /currentRole\(/, "Le contrôle final d’encaissement ne doit pas dépendre d’un rôle.");

  const subject = loadModule();
  const state = subject.module._state;
  let html = await renderCash(subject);

  assert.match(html, /id="financeCashStudent"/, "La Caisse doit sélectionner un élève unique.");
  assert.match(html, /id="financeCashStudentFee"/, "La Caisse doit sélectionner un student_fee explicite.");
  assert.doesNotMatch(html, /name="fee"/, "Le select global décoratif des frais doit disparaître du flux actif.");

  const studentOptions = html.match(/<select[^>]*id="financeCashStudent"[^>]*>([\s\S]*?)<\/select>/)[1].match(/<option /g) || [];
  assert.equal(studentOptions.length, state.studentFinancialProfiles.length, "Chaque élève doit apparaître une seule fois.");
  assert.match(html, /value="demo-sf-lucas-school"/, "Scolarité doit porter son student_fee_id.");
  assert.match(html, /value="demo-sf-lucas-transport"/, "Transport doit porter son student_fee_id.");
  assert.match(html, /name="amount"[^>]*max="100000"[^>]*step="1"/, "Le frais CDF doit utiliser son restant et step=1.");
  assert.match(html, /CDF/, "La devise CDF doit être affichée depuis le frais sélectionné.");

  state.selectedCashStudentId = "demo-s1";
  state.selectedCashStudentFeeId = "demo-sf-lucas-transport";
  html = await renderCash(subject);
  assert.match(html, /data-value="demo-sf-lucas-transport"/, "Le contrôle actif doit conserver le student_fee_id Transport.");
  assert.match(html, /name="amount"[^>]*max="100000"[^>]*step="0.01"/, "Le frais USD doit utiliser son restant et step=0.01.");
  assert.match(html, /USD/, "USD ne doit jamais devenir CDF par fallback.");

  state.selectedCashStudentId = "demo-s2";
  state.selectedCashStudentFeeId = "demo-sf-emma-school";
  html = await renderCash(subject);
  assert.match(html, /Paiement normal indisponible/, "Un frais paid doit bloquer le paiement normal.");
  assert.doesNotMatch(html, /id="paymentForm"/, "Un frais paid ne doit pas afficher le formulaire de paiement.");

  state.selectedCashStudentId = "demo-s5";
  state.selectedCashStudentFeeId = "demo-sf-aline-school";
  html = await renderCash(subject);
  assert.match(html, /exempté/, "Un frais exempted doit communiquer son blocage.");
  assert.doesNotMatch(html, /id="paymentForm"/, "Un frais exempted ne doit pas afficher le formulaire de paiement.");

  const paymentOnly = loadModule({ session: { role: "guard", permissions: ["finance.payment.record"] } });
  html = await renderCash(paymentOnly);
  assert.match(html, /id="financeCashStudent"/, "finance.payment.record doit rendre l’encaissement visible sans dépendre d’un rôle Caisse.");

  const controlOnly = loadModule({ session: { role: "guard", permissions: ["finance.control.scan"] } });
  html = await renderCash(controlOnly);
  assert.doesNotMatch(html, /id="financeCashStudent"/, "finance.control.scan seul ne doit pas ouvrir l’encaissement.");

  const paymentWithoutProjection = loadModule({ demoMode: false, session: { role: "cashier", permissions: ["finance.payment.record"] } });
  html = await renderCash(paymentWithoutProjection);
  assert.match(html, /Encaissement indisponible/, "finance.payment.record sans projection autorisée doit rester indisponible, sans contourner finance.fee.read.");
}

main().then(function () { console.log("FE-FIN-05 payment by student_fee: PASS"); }).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
