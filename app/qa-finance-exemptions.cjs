const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "modules/finance/finance-module.js"), "utf8");
const indexSource = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

function attrs(markup) {
  const result = {};
  String(markup || "").replace(/([\w-]+)="([^"]*)"/g, function (_match, key, value) {
    result[key] = value;
    return _match;
  });
  return result;
}

function element(attributes) {
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

function primitive(kind) {
  return function (props) {
    props = props || {};
    if (kind === "state") return '<section class="ss-state" data-state="' + (props.type || "") + '"><h3>' + (props.title || "") + "</h3><p>" + (props.message || "") + "</p><small>" + (props.details || "") + "</small></section>";
    if (kind === "field") return props.inputHtml || "";
    if (kind === "table") return "<table>" + (props.rows || "") + "</table>";
    if (kind === "badge" || kind === "icon") return "<span>" + (props.label || "") + "</span>";
    if (kind === "input") return '<input id="' + (props.id || "") + '" name="' + (props.name || "") + '" type="' + (props.type || "text") + '" min="' + (props.min == null ? "" : props.min) + '" max="' + (props.max == null ? "" : props.max) + '" step="' + (props.step == null ? "" : props.step) + '" value="' + (props.value || "") + '"' + (props.required ? " required" : "") + (props.disabled ? " disabled" : "") + ">";
    if (kind === "select") return '<select id="' + (props.id || "") + '" name="' + (props.name || "") + '" data-value="' + (props.value || "") + '"' + (props.required ? " required" : "") + '>' + (props.options || []).map(function (option) { return '<option value="' + option.value + '">' + option.label + "</option>"; }).join("") + "</select>";
    if (kind === "button") return '<button type="' + (props.type || "button") + '">' + (props.label || "") + "</button>";
    return "";
  };
}

function load(options) {
  options = options || {};
  const elements = {
    financeModule: element(), financeModuleTitle: element(), workspaceTitle: element(), cardsProtected: element()
  };
  let html = "";
  const content = element();
  Object.defineProperty(content, "innerHTML", {
    get: function () { return html; },
    set: function (value) {
      html = value;
      ["financeExemptionStudent", "financeExemptionStudentFee", "financeExemptionType", "financeExemptionAmount", "financeExemptionReason", "financeExemptionForm"].forEach(function (id) {
        const match = html.match(new RegExp("<(?:select|input|textarea|form)[^>]*id=\\\"" + id + "\\\"[^>]*>"));
        if (match) elements[id] = element(attrs(match[0]));
        else delete elements[id];
      });
    }
  });
  elements.financeContent = content;
  const apiCalls = [];
  const win = {
    schoolSafeDemoMode: options.demoMode !== false,
    location: { hostname: options.demoMode === false ? "schoolsafe.example" : "127.0.0.1" },
    localStorage: { getItem: function () { return null; } },
    currentSession: options.session || { role: "admin", permissions: [] },
    SchoolSafeAccess: { canAccess: function (user, permission) { return !!(user && (user.role === "admin" || (user.permissions || []).includes(permission))); } },
    SchoolSafeFinanceAPI: { createPayment: function (input) { apiCalls.push(input); return Promise.resolve({}); } },
    ssState: primitive("state"), ssField: primitive("field"), ssTable: primitive("table"), ssBadge: primitive("badge"), ssIconButton: primitive("icon"), ssInput: primitive("input"), ssSelect: primitive("select"), ssButton: primitive("button"),
    money: function (amount) { return String(amount); }, certificationStatusClass: function () { return "info"; }, icons: function () {}, notify: function () {}
  };
  const doc = {
    getElementById: function (id) { return elements[id] || null; },
    querySelector: function (selector) { if (selector === ".workspace-grid") return element(); if (selector === ".workspace-content") return { scrollTo: function () {} }; return null; },
    querySelectorAll: function () { return []; }
  };
  function FormData(form) { this.get = function (name) { return form.fields[name] == null ? "" : form.fields[name]; }; }
  vm.runInNewContext(source, { window: win, document: doc, console: console, Date: Date, Promise: Promise, Object: Object, Array: Array, Number: Number, String: String, RegExp: RegExp, JSON: JSON, setTimeout: setTimeout, FormData: FormData, navigator: { onLine: true } });
  return { module: win.SchoolSafeFinanceModule, elements: elements, apiCalls: apiCalls };
}

async function render(subject) {
  subject.module.render("financeModule", { action: "exemptions" });
  await Promise.resolve();
  await Promise.resolve();
}

async function submit(subject, fields) {
  subject.elements.financeExemptionForm.fields = fields;
  subject.elements.financeExemptionForm.trigger("submit");
  await Promise.resolve();
  await Promise.resolve();
}

async function main() {
  assert.match(indexSource, /data-finance-tab="exemptions"/, "La navigation Finance doit contenir l’entrée Exemptions.");

  const accessFunction = source.match(/function canPrepareExemption\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(accessFunction, "La garde temporaire d’exemption doit être isolée.");
  assert.doesNotMatch(accessFunction[1], /currentRole\(/, "La garde d’exemption ne doit pas introduire de contrôle de rôle.");

  const subject = load();
  await render(subject);
  let html = subject.elements.financeContent.innerHTML;
  assert.match(html, /id="financeExemptionStudent"/, "L’exemption doit sélectionner un élève unique.");
  assert.match(html, /id="financeExemptionStudentFee"/, "L’exemption doit sélectionner le student_fee exact.");
  assert.match(html, /value="demo-sf-lucas-transport"/, "Le select doit porter les identifiants student_fee réels.");

  const state = subject.module._state;
  state.exemptionDraft.studentId = "demo-s1";
  state.exemptionDraft.studentFeeId = "demo-sf-lucas-transport";
  state.exemptionDraft.type = "total";
  await render(subject);
  html = subject.elements.financeContent.innerHTML;
  assert.doesNotMatch(html, /id="financeExemptionAmount"/, "Une exemption totale ne demande pas de montant partiel.");

  state.exemptionDraft.type = "partial";
  await render(subject);
  html = subject.elements.financeContent.innerHTML;
  assert.match(html, /id="financeExemptionAmount"/, "Une exemption partielle doit demander un montant.");
  assert.match(html, /max="100000"/, "Le montant partiel doit être borné par le restant du student_fee exact.");

  await submit(subject, { exemption_type: "partial", amount: "0", reason: "Motif" });
  assert.equal(state.exemptionDraft.prepared, false, "Un montant partiel nul doit être refusé.");

  await submit(subject, { exemption_type: "partial", amount: "100", reason: "" });
  assert.equal(state.exemptionDraft.prepared, false, "Le motif doit être obligatoire.");

  const before = JSON.stringify(state.studentFees);
  await submit(subject, { exemption_type: "partial", amount: "100", reason: "Bourse transport" });
  assert.equal(state.exemptionDraft.prepared, true, "Une demande locale valide doit seulement être préparée.");
  assert.equal(JSON.stringify(state.studentFees), before, "Préparer une demande ne doit jamais appliquer une exemption réelle.");
  assert.equal(subject.apiCalls.length, 0, "Le flux d’exemption ne doit appeler aucune API inventée.");
  assert.match(subject.elements.financeContent.innerHTML, /connexion backend requise/i, "Le succès doit rester explicitement BACKEND_LATER.");

  state.exemptionDraft.studentFeeId = "demo-sf-lucas-school";
  state.exemptionDraft.type = "total";
  state.exemptionDraft.prepared = false;
  await render(subject);
  html = subject.elements.financeContent.innerHTML;
  assert.match(html, /paiement déjà enregistré/i, "Une exemption rétroactive doit être indisponible sans politique serveur.");
  assert.doesNotMatch(html, /id="financeExemptionForm"/, "Le cas rétroactif ne doit pas présenter de fausse confirmation.");

  const controlOnly = load({ session: { role: "guard", permissions: ["finance.control.scan"] } });
  await render(controlOnly);
  assert.doesNotMatch(controlOnly.elements.financeContent.innerHTML, /id="financeExemptionStudent"/, "finance.control.scan seul ne doit pas ouvrir les exemptions.");
}

main().then(function () { console.log("FE-FIN-06 exemptions frontend: PASS"); }).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
