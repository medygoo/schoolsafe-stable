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
    if (kind === "input") return '<input id="' + (props.id || "") + '" name="' + (props.name || "") + '" type="' + (props.type || "text") + '" value="' + (props.value || "") + '"' + (props.required ? " required" : "") + (props.readonly ? " readonly" : "") + (props.disabled ? " disabled" : "") + ">";
    if (kind === "select") return '<select id="' + (props.id || "") + '" name="' + (props.name || "") + '" data-value="' + (props.value || "") + '"' + (props.required ? " required" : "") + (props.disabled ? " disabled" : "") + ">" + (props.options || []).map(function (option) { return '<option value="' + option.value + '">' + option.label + "</option>"; }).join("") + "</select>";
    if (kind === "button") return '<button type="' + (props.type || "button") + '"' + (props.disabled ? " disabled" : "") + ">" + (props.label || "") + "</button>";
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
      ["financeCampaignName", "financeCampaignFee", "financeCampaignStart", "financeCampaignEnd", "financeCampaignInstruction", "financeCampaignForm"].forEach(function (id) {
        const match = html.match(new RegExp("<(?:select|input|textarea|form)[^>]*id=\\\"" + id + "\\\"[^>]*>"));
        if (match) elements[id] = element(attrs(match[0]));
        else delete elements[id];
      });
    }
  });
  elements.financeContent = content;
  const apiCalls = [];
  const api = {
    listFeeStructures: function () { return Promise.resolve([{ id: "fee-real-1", label: "Excursion culturelle", cycle_key: "primary", amount: 25, currency: "USD", due_date: null, is_active: true }]); },
    listStudentFees: function () { return Promise.resolve([]); },
    getDailyReport: function () { return Promise.resolve({ payments: [] }); },
    createCampaign: function (input) { apiCalls.push(input); return Promise.resolve({ id: "campaign-server" }); }
  };
  const win = {
    schoolSafeDemoMode: false,
    location: { hostname: "schoolsafe.example" },
    localStorage: { getItem: function () { return null; } },
    currentSession: options.session || { role: "finance", permissions: ["finance.control.manage", "finance.fee.read"] },
    SchoolSafeAccess: { canAccess: function (user, permission) { return !!(user && (user.role === "admin" || (user.permissions || []).includes(permission))); } },
    SchoolSafeFinanceAPI: api,
    ssState: primitive("state"), ssField: primitive("field"), ssTable: primitive("table"), ssBadge: primitive("badge"), ssIconButton: primitive("icon"), ssInput: primitive("input"), ssSelect: primitive("select"), ssButton: primitive("button"),
    money: function (amount) { return String(amount); }, certificationStatusClass: function () { return "info"; }, icons: function () {}, notify: function () {}, queueOfflineOperation: function () { throw new Error("Une campagne ne doit pas créer une opération offline."); }
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
  subject.module.render("financeModule", { action: "campagnes de contrôle" });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
}

async function submit(subject, fields) {
  subject.elements.financeCampaignForm.fields = fields;
  subject.elements.financeCampaignForm.trigger("submit");
  await Promise.resolve();
  await Promise.resolve();
}

async function main() {
  assert.match(indexSource, /data-finance-tab="campaigns"/, "La navigation Finance doit contenir l’entrée Campagnes de contrôle.");

  const accessFunction = source.match(/function canManageControlCampaigns\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(accessFunction, "La garde temporaire de gestion de campagne doit être isolée.");
  assert.doesNotMatch(accessFunction[1], /currentRole\(/, "La garde de campagne ne doit pas introduire de contrôle de rôle.");

  const subject = load();
  await render(subject);
  let html = subject.elements.financeContent.innerHTML;
  assert.match(html, /id="financeCampaignForm"/, "La gestion doit présenter le formulaire de campagne.");
  assert.match(html, /id="financeCampaignFee"/, "Le formulaire doit sélectionner un fee_structure précis.");
  assert.match(html, /value="fee-real-1"/, "Le fee_structure_id réel doit être conservé dans la sélection.");
  assert.match(html, /Excursion culturelle/, "Le libellé doit provenir du catalogue, sans type codé en dur.");
  assert.match(html, /id="financeCampaignStart"/, "La date de début doit être présente.");
  assert.match(html, /id="financeCampaignEnd"/, "La date de fin doit être présente.");
  assert.match(html, /id="financeCampaignInstruction"/, "La consigne doit être obligatoire.");
  assert.match(html, /Classes[\s\S]*BACKEND_LATER/, "Les classes non projetées doivent rester BACKEND_LATER.");
  assert.match(html, /Élèves individuels[\s\S]*BACKEND_LATER/, "Les élèves non projetés doivent rester BACKEND_LATER.");
  assert.match(html, /Contrôleurs[\s\S]*BACKEND_LATER/, "Les contrôleurs non projetés doivent rester BACKEND_LATER.");
  assert.match(html, /Brouillon/, "Les statuts de campagne doivent être représentés visuellement.");
  assert.match(html, /Publiée/, "Les statuts de campagne doivent inclure Publiée.");
  assert.match(html, /Fermée/, "Les statuts de campagne doivent inclure Fermée.");
  assert.match(html, /Archivée/, "Les statuts de campagne doivent inclure Archivée.");

  await submit(subject, { label: "", fee_structure_id: "fee-real-1", starts_at: "2026-09-01", ends_at: "2026-09-30", description: "Contrôle au portail" });
  assert.equal(subject.module._state.campaignDraft.prepared, false, "Le nom est obligatoire.");

  await submit(subject, { label: "Contrôle excursion", fee_structure_id: "fee-real-1", starts_at: "2026-09-30", ends_at: "2026-09-01", description: "Contrôle au portail" });
  assert.equal(subject.module._state.campaignDraft.prepared, false, "La période doit respecter début < fin.");

  await submit(subject, { label: "Contrôle excursion", fee_structure_id: "fee-real-1", starts_at: "2026-09-01", ends_at: "2026-09-30", description: "" });
  assert.equal(subject.module._state.campaignDraft.prepared, false, "La consigne est obligatoire.");

  await submit(subject, { label: "Contrôle excursion", fee_structure_id: "fee-real-1", starts_at: "2026-09-01", ends_at: "2026-09-30", description: "Vérifier avant l’accès" });
  assert.equal(subject.module._state.campaignDraft.prepared, true, "Une configuration valide doit être préparée seulement en mémoire.");
  assert.equal(subject.module._state.campaignDraft.preparedSummary.fee_structure_id, "fee-real-1", "Le résumé doit conserver le fee_structure exact.");
  assert.equal(subject.apiCalls.length, 0, "Préparer une campagne ne doit jamais appeler createCampaign().");
  assert.match(subject.elements.financeContent.innerHTML, /Configuration prête — connexion backend requise pour publier\/activer/, "Le succès doit rester explicitement non connecté.");

  const scanOnly = load({ session: { role: "guard", permissions: ["finance.control.scan"] } });
  await render(scanOnly);
  assert.doesNotMatch(scanOnly.elements.financeContent.innerHTML, /id="financeCampaignForm"/, "finance.control.scan seul ne doit pas ouvrir la gestion Finance des campagnes.");

  const catalogueOnly = load({ session: { role: "finance", permissions: ["finance.fee.read"] } });
  await render(catalogueOnly);
  assert.doesNotMatch(catalogueOnly.elements.financeContent.innerHTML, /id="financeCampaignForm"/, "La lecture du catalogue seule ne doit pas ouvrir la gestion des campagnes.");
}

main().then(function () { console.log("FE-FIN-07A campaign management frontend: PASS"); }).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
