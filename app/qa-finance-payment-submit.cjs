const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "modules/finance/finance-module.js"), "utf8");

function makeElement(attributes) {
  const listeners = {};
  return {
    attributes: attributes || {},
    fields: {},
    value: (attributes && (attributes["data-value"] || attributes.value)) || "",
    addEventListener: function (type, listener) { listeners[type] = listener; },
    trigger: function (type) { listeners[type].call(this, { preventDefault: function () {} }); },
    getAttribute: function (name) { return this.attributes[name] || null; }
  };
}

function attributesFromMarkup(markup) {
  const attributes = {};
  String(markup || "").replace(/([\w-]+)="([^"]*)"/g, function (_match, key, value) { attributes[key] = value; return _match; });
  return attributes;
}

function primitives(tag) {
  return function (props) {
    props = props || {};
    if (tag === "state") return '<section class="ss-state">' + (props.title || "") + " " + (props.message || "") + "</section>";
    if (tag === "field") return props.inputHtml || "";
    if (tag === "table") return "<table>" + (props.rows || "") + "</table>";
    if (tag === "badge" || tag === "icon") return "<span>" + (props.label || "") + "</span>";
    if (tag === "input") return '<input id="' + (props.id || "") + '" name="' + (props.name || "") + '" type="' + (props.type || "text") + '" min="' + (props.min == null ? "" : props.min) + '" max="' + (props.max == null ? "" : props.max) + '" step="' + (props.step == null ? "" : props.step) + '" value="' + (props.value || "") + '">';
    if (tag === "select") return '<select id="' + (props.id || "") + '" name="' + (props.name || "") + '" data-value="' + (props.value || "") + '">' + (props.options || []).map(function (option) { return '<option value="' + option.value + '">' + option.label + "</option>"; }).join("") + "</select>";
    if (tag === "button") { const attrs = Object.keys(props.attrs || {}).map(function (key) { return " " + key + '="' + props.attrs[key] + '"'; }).join(""); return '<button type="' + (props.type || "button") + '"' + attrs + ">" + (props.label || "") + "</button>"; }
    return "";
  };
}

function loadModule(options) {
  options = options || {};
  const elements = {
    financeModule: makeElement(),
    financeModuleTitle: makeElement(),
    workspaceTitle: makeElement(),
    cardsProtected: makeElement()
  };
  let html = "";
  const content = makeElement();
  Object.defineProperty(content, "innerHTML", {
    get: function () { return html; },
    set: function (value) {
      html = value;
      ["financeCashStudent", "financeCashStudentFee", "paymentForm"].forEach(function (id) {
        const match = html.match(new RegExp("<(?:select|form)[^>]*id=\\\"" + id + "\\\"[^>]*>"));
        if (match) elements[id] = makeElement(attributesFromMarkup(match[0]));
        else delete elements[id];
      });
    }
  });
  elements.financeContent = content;
  const calls = [];
  const window = {
    schoolSafeDemoMode: options.demoMode !== false,
    location: { hostname: options.demoMode === false ? "schoolsafe.example" : "127.0.0.1" },
    localStorage: { getItem: function () { return null; } },
    currentSession: options.session || { role: "admin", permissions: [] },
    SchoolSafeAccess: { canAccess: function (user, permission) { return !!(user && (user.role === "admin" || (user.permissions || []).includes(permission))); } },
    SchoolSafeFinanceAPI: options.api || { createPayment: function (input) { calls.push(input); return Promise.resolve({ payment: { id: "payment-confirmed", student_fee_id: input.student_fee_id } }); } },
    ssState: primitives("state"), ssField: primitives("field"), ssTable: primitives("table"), ssBadge: primitives("badge"), ssIconButton: primitives("icon"), ssInput: primitives("input"), ssSelect: primitives("select"), ssButton: primitives("button"),
    money: function (amount) { return String(amount); }, certificationStatusClass: function () { return "info"; }, icons: function () {}, notify: function () {}
  };
  const document = {
    getElementById: function (id) { return elements[id] || null; },
    querySelector: function (selector) {
      if (selector === ".workspace-grid") return makeElement();
      if (selector === ".workspace-content") return { scrollTo: function () {} };
      // Bouton de confirmation démo : capturé uniquement si le rendu courant l'affiche.
      if (selector === "[data-confirm-demo-payment]") {
        if (html.indexOf("data-confirm-demo-payment") === -1) return null;
        if (!elements.confirmDemoPayment) elements.confirmDemoPayment = makeElement();
        return elements.confirmDemoPayment;
      }
      return null;
    },
    querySelectorAll: function () { return []; }
  };
  function FormData(form) { this.get = function (name) { return form.fields[name] == null ? "" : form.fields[name]; }; }
  vm.runInNewContext(source, { window: window, document: document, console: console, Date: Date, Promise: Promise, Object: Object, Array: Array, Number: Number, String: String, RegExp: RegExp, JSON: JSON, setTimeout: setTimeout, FormData: FormData, navigator: options.navigator || { onLine: true } });
  return { module: window.SchoolSafeFinanceModule, elements: elements, calls: calls };
}

function realPaymentSubject(calls) {
  const studentFees = [
    { id: "demo-sf-lucas-school", student_id: "demo-s1", fee_structure_id: "demo-2", amount_expected: 450000, amount_paid: 350000, amount_remaining: 100000, status: "partial", students: { id: "demo-s1", first_name: "Lucas", last_name: "Martin" } },
    { id: "demo-sf-lucas-transport", student_id: "demo-s1", fee_structure_id: "demo-4", amount_expected: 100000, amount_paid: 0, amount_remaining: 100000, status: "pending", students: { id: "demo-s1", first_name: "Lucas", last_name: "Martin" } }
  ];
  const subject = loadModule({
    demoMode: false,
    session: { role: "cashier", permissions: ["finance.payment.record", "finance.fee.read"] },
    api: {
      listFeeStructures: function () { return Promise.resolve([{ id: "demo-2", label: "Frais scolaires", cycle_key: "primary", amount: 450000, currency: "CDF", is_active: true }, { id: "demo-4", label: "Transport scolaire", cycle_key: "primary", amount: 100000, currency: "USD", is_active: true }]); },
      listStudentFees: function () { return Promise.resolve(studentFees); },
      getDailyReport: function () { return Promise.resolve({ payments: [] }); },
      createPayment: function (input) { calls.push(input); return Promise.resolve({ payment: { id: "payment-confirmed", student_fee_id: input.student_fee_id } }); }
    }
  });
  return subject;
}

async function render(subject) {
  subject.module.render("financeModule", { action: "encaissement" });
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
}

async function submit(subject, fields) {
  subject.elements.paymentForm.fields = fields;
  subject.elements.paymentForm.trigger("submit");
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function main() {
  // Contrat actuel (Phase F) : la soumission prépare un paymentDraft local vérifié ;
  // aucune écriture serveur (createPayment) n'est déclenchée et la confirmation
  // officielle reste explicitement BACKEND_LATER. Seule la démo confirme, en fictif.
  const transportCalls = [];
  const transport = realPaymentSubject(transportCalls);
  transport.module._state.selectedCashStudentId = "demo-s1";
  transport.module._state.selectedCashStudentFeeId = "demo-sf-lucas-transport";
  await render(transport);
  await submit(transport, { amount: "40.50", mode: "mobile_money", reference: "Transport août" });
  assert.equal(transportCalls.length, 0, "La préparation ne doit produire aucun appel API.");
  const transportDraft = transport.module._state.paymentDraft;
  assert.ok(transportDraft, "Une soumission valide doit préparer un brouillon de paiement local.");
  assert.equal(transportDraft.studentFeeId, "demo-sf-lucas-transport", "Transport affiché doit préparer exactement son student_fee_id.");
  assert.equal(transportDraft.currency, "USD", "Transport doit conserver USD.");
  assert.equal(transportDraft.amount, 40.5, "Le montant USD doit conserver ses décimales.");
  assert.equal(transportDraft.mode, "mobile_money", "Le mode sélectionné doit être conservé.");
  assert.equal(transportDraft.reference, "Transport août", "La référence doit être conservée.");
  assert.match(transport.elements.financeContent.innerHTML, /Confirmation officielle — BACKEND_LATER/, "La confirmation officielle doit rester explicitement non connectée.");

  const schoolCalls = [];
  const school = realPaymentSubject(schoolCalls);
  school.module._state.selectedCashStudentId = "demo-s1";
  school.module._state.selectedCashStudentFeeId = "demo-sf-lucas-school";
  await render(school);
  await submit(school, { amount: "1000", mode: "cash", reference: "Scolarité" });
  assert.equal(schoolCalls.length, 0, "La préparation CDF ne doit produire aucun appel API.");
  assert.equal(school.module._state.paymentDraft.studentFeeId, "demo-sf-lucas-school", "Scolarité affichée doit préparer son student_fee_id.");
  assert.equal(school.module._state.paymentDraft.currency, "CDF", "CDF doit être conservé sans conversion.");

  const mismatchCalls = [];
  const mismatch = realPaymentSubject(mismatchCalls);
  mismatch.module._state.selectedCashStudentId = "demo-s1";
  mismatch.module._state.selectedCashStudentFeeId = "demo-sf-lucas-transport";
  await render(mismatch);
  mismatch.elements.paymentForm.attributes["data-student-fee-id"] = "demo-sf-lucas-school";
  await submit(mismatch, { amount: "10", mode: "cash", reference: "Ne doit pas passer" });
  assert.equal(mismatchCalls.length, 0, "Un formulaire dont le student_fee affiché diffère de la sélection active doit être bloqué.");
  assert.equal(mismatch.module._state.paymentDraft, null, "Une sélection modifiée ne doit produire aucun brouillon.");

  const tooHighCalls = [];
  const tooHigh = realPaymentSubject(tooHighCalls);
  tooHigh.module._state.selectedCashStudentId = "demo-s1";
  tooHigh.module._state.selectedCashStudentFeeId = "demo-sf-lucas-transport";
  await render(tooHigh);
  await submit(tooHigh, { amount: "100001", mode: "cash", reference: "Trop élevé" });
  assert.equal(tooHighCalls.length, 0, "Un montant supérieur au restant doit être refusé.");
  assert.equal(tooHigh.module._state.paymentDraft, null, "Un montant supérieur au restant ne doit produire aucun brouillon.");

  const fractionalCdfCalls = [];
  const fractionalCdf = realPaymentSubject(fractionalCdfCalls);
  fractionalCdf.module._state.selectedCashStudentId = "demo-s1";
  fractionalCdf.module._state.selectedCashStudentFeeId = "demo-sf-lucas-school";
  await render(fractionalCdf);
  await submit(fractionalCdf, { amount: "0.5", mode: "cash", reference: "Décimale CDF" });
  assert.equal(fractionalCdfCalls.length, 0, "CDF doit refuser les décimales côté JavaScript.");
  assert.equal(fractionalCdf.module._state.paymentDraft, null, "Une décimale CDF ne doit produire aucun brouillon.");

  const overPreciseUsdCalls = [];
  const overPreciseUsd = realPaymentSubject(overPreciseUsdCalls);
  overPreciseUsd.module._state.selectedCashStudentId = "demo-s1";
  overPreciseUsd.module._state.selectedCashStudentFeeId = "demo-sf-lucas-transport";
  await render(overPreciseUsd);
  await submit(overPreciseUsd, { amount: "40.501", mode: "cash", reference: "Trop de décimales" });
  assert.equal(overPreciseUsdCalls.length, 0, "USD doit refuser plus de deux décimales côté JavaScript.");
  assert.equal(overPreciseUsd.module._state.paymentDraft, null, "Un montant USD trop précis ne doit produire aucun brouillon.");

  const demo = loadModule();
  demo.module._state.selectedCashStudentId = "demo-s1";
  demo.module._state.selectedCashStudentFeeId = "demo-sf-lucas-transport";
  await render(demo);
  await submit(demo, { amount: "40.5", mode: "cash", reference: "Démo transport" });
  assert.equal(demo.calls.length, 0, "Le mode démo ne doit jamais appeler l’API de paiement.");
  assert.ok(demo.module._state.paymentDraft, "La démo prépare d’abord un brouillon local.");
  assert.ok(demo.elements.confirmDemoPayment, "La démo doit proposer une confirmation explicitement fictive.");
  demo.elements.confirmDemoPayment.trigger("click");
  await Promise.resolve();
  assert.equal(demo.calls.length, 0, "La confirmation démo ne doit jamais appeler l’API de paiement.");
  assert.equal(demo.module._state.transactions[0].status, "Démonstration", "Le paiement démo doit rester explicitement non officiel.");
  assert.equal(demo.module._state.transactions[0].currency, "USD", "Le journal démo doit conserver la devise du student_fee.");
  assert.match(demo.elements.financeContent.innerHTML, /Montants mixtes non cumulés/, "Le journal de caisse ne doit jamais cumuler silencieusement CDF et USD.");

  const offlineCalls = [];
  const studentFee = { id: "sf-real", student_id: "student-real", fee_structure_id: "fee-real", amount_expected: 50, amount_paid: 0, amount_remaining: 50, status: "pending", students: { id: "student-real", first_name: "Jean", last_name: "Mbala" } };
  const offline = loadModule({
    demoMode: false,
    navigator: { onLine: false },
    session: { role: "cashier", permissions: ["finance.payment.record", "finance.fee.read"] },
    api: {
      listFeeStructures: function () { return Promise.resolve([{ id: "fee-real", label: "Transport", cycle_key: "primary", amount: 50, currency: "USD", is_active: true }]); },
      listStudentFees: function () { return Promise.resolve([studentFee]); },
      getDailyReport: function () { return Promise.resolve({ payments: [] }); },
      createPayment: function (input) { offlineCalls.push(input); return Promise.resolve({}); }
    }
  });
  await render(offline);
  assert.ok(offline.elements.paymentForm, "Le paiement réel doit être prêt avant le test offline.");
  await submit(offline, { amount: "10", mode: "cash", reference: "Hors connexion" });
  assert.equal(offlineCalls.length, 0, "Le mode réel hors connexion ne doit pas créer de paiement API.");
  assert.equal(offline.module._state.transactions.length, 0, "Le mode réel hors connexion ne doit pas créer de transaction locale fictive.");
}

main().then(function () { console.log("FE-FIN-05 payment payload: PASS"); }).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
