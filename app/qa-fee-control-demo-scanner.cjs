const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const moduleSource = fs.readFileSync(path.join(__dirname, "modules/finance/fee-control-module.js"), "utf8");
const accessSource = fs.readFileSync(path.join(__dirname, "modules/core/access.js"), "utf8");

function state(props) {
  props = props || {};
  return '<section data-state="' + (props.type || "") + '"><h3>' + (props.title || "") + "</h3><p>" + (props.message || "") + "</p><small>" + (props.details || "") + "</small></section>";
}

function button(props) {
  props = props || {};
  return '<button type="' + (props.type || "button") + '"' + (props.disabled ? " disabled" : "") + ">" + (props.label || "") + "</button>";
}

function createElement(id, elements, controls) {
  const listeners = {};
  let html = "";
  const element = {
    value: "",
    classList: { remove: function () {}, add: function () {} },
    addEventListener: function (type, listener) { listeners[type] = listener; },
    hasListener: function (type) { return typeof listeners[type] === "function"; },
    trigger: function (type, event) {
      if (listeners[type]) listeners[type].call(this, event || { preventDefault: function () {}, key: "" });
    },
    querySelectorAll: function (selector) {
      if (selector === "input[name='feeControlCampaign']") return controls.radios;
      return [];
    },
    querySelector: function (selector) {
      if (selector === "#feeControlQrInput") return elements.feeControlQrInput || null;
      if (selector === "#feeControlResult") return elements.feeControlResult || null;
      if (selector === "#feeControlDemoScanForm") return elements.feeControlDemoScanForm || null;
      return null;
    }
  };
  Object.defineProperty(element, "innerHTML", {
    get: function () { return html; },
    set: function (value) {
      html = String(value || "");
      if (id === "feeControlContent") {
        ["feeControlQrInput", "feeControlResult", "feeControlDemoScanForm", "feeControlCampaigns"].forEach(function (childId) {
          if (new RegExp('id="' + childId + '"').test(html)) elements[childId] = createElement(childId, elements, controls);
        });
      }
      if (id === "feeControlCampaigns") {
        controls.radios = Array.from(html.matchAll(/name="feeControlCampaign" value="([^"]+)"/g), function (match) {
          const radio = createElement("campaign-" + match[1], elements, controls);
          radio.value = match[1];
          return radio;
        });
      }
    }
  });
  return element;
}

function loadAccess() {
  const context = { window: {} };
  vm.runInNewContext(accessSource, context);
  return context.window.SchoolSafeAccess;
}

function load(options) {
  options = options || {};
  const elements = {};
  const controls = { radios: [] };
  const calls = { securityScan: 0, createScan: 0 };
  // Alignement M : forme actuelle d'un contrôleur démo — permission + portée assigned_classes
  // + classes affectées (cf. DEMO_ACCESS_CONTEXT_BY_ROLE), résolu via SchoolSafeAppContext.
  const controller = {
    role: "guard",
    permissions: ["finance.control.scan"],
    scopes: [{ permission: "finance.control.scan", type: "assigned_classes", classIds: ["demo-class-5"] }],
    assignedClassIds: ["demo-class-5"]
  };
  const session = options.live ? Object.assign({ token: "live-session" }, controller) : controller;
  const root = {
    schoolSafeDemoMode: !options.live,
    location: { hostname: options.live ? "schoolsafe.example" : "localhost" },
    localStorage: { getItem: function () { return null; } },
    SchoolSafeAppContext: { getCurrentUser: function () { return session; } },
    SchoolSafeAccess: loadAccess(),
    SchoolSafeSecurityAPI: { scan: function () { calls.securityScan += 1; return Promise.resolve({}); } },
    SchoolSafeFinanceAPI: { createScan: function () { calls.createScan += 1; return Promise.resolve({}); } },
    ssState: state,
    ssBadge: function (props) { return "<span>" + (props.label || "") + "</span>"; },
    ssButton: button
  };
  const document = { getElementById: function (id) { if (!elements[id]) elements[id] = createElement(id, elements, controls); return elements[id]; } };
  vm.runInNewContext(moduleSource, { window: root, document: document, Promise: Promise, Object: Object, Array: Array, String: String, Number: Number, RegExp: RegExp, console: console });
  return { module: root.SchoolSafeFeeControlModule, elements: elements, calls: calls };
}

async function render(subject) {
  subject.module.render("feeControlContent");
  await Promise.resolve();
  await Promise.resolve();
}

async function analyse(subject, payload) {
  subject.elements.feeControlQrInput.value = payload;
  subject.elements.feeControlDemoScanForm.trigger("submit");
  await Promise.resolve();
  await Promise.resolve();
}

async function main() {
  const demo = load({});
  await render(demo);
  assert.match(demo.elements.feeControlContent.innerHTML, /Scanner de contrôle · démonstration/i, "Le mode démo doit nommer explicitement le scanner démo.");
  assert.ok(demo.elements.feeControlDemoScanForm, "Le scanner démo doit rendre son formulaire prêt avant toute analyse.");
  assert.ok(demo.elements.feeControlQrInput, "Le scanner démo doit rendre le champ QR avant toute analyse.");
  // Alignement M : le runtime consolidé ne branche plus de keydown, Enter soumet nativement le formulaire démo.
  assert.equal(demo.elements.feeControlDemoScanForm.hasListener("submit"), true, "L’action Analyser doit déclencher le scanner démo.");

  await analyse(demo, "schoolsafe://card/DEMO-PAID/verification");
  assert.match(demo.elements.feeControlResult.innerHTML, /En règle/i, "paid doit devenir En règle.");
  await analyse(demo, "schoolsafe://card/DEMO-PARTIAL/verification");
  assert.match(demo.elements.feeControlResult.innerHTML, /Paiement partiel/i, "partial doit devenir Paiement partiel.");
  await analyse(demo, "schoolsafe://card/DEMO-PENDING/verification");
  assert.match(demo.elements.feeControlResult.innerHTML, /Non en règle/i, "pending doit devenir Non en règle.");
  await analyse(demo, "schoolsafe://card/DEMO-EXEMPTED/verification");
  assert.match(demo.elements.feeControlResult.innerHTML, /Exempté/i, "exempted doit devenir Exempté.");
  await analyse(demo, "schoolsafe://card/DEMO-NO-FEE/verification");
  assert.match(demo.elements.feeControlResult.innerHTML, /Anomalie/i, "L’absence de student_fee doit devenir une anomalie.");
  // Alignement M : le code NO_STUDENT_FEE a été retiré lors de la consolidation ; l'anomalie
  // reste explicite via le libellé « Anomalie » et l'orientation vers Finance sans décision déduite.
  assert.match(demo.elements.feeControlResult.innerHTML, /Aucun statut exploitable/i, "L’anomalie démo doit expliquer l’absence de statut exploitable.");
  await analyse(demo, "not-a-qr");
  assert.match(demo.elements.feeControlResult.innerHTML, /QR/i, "Un QR invalide doit produire une erreur explicite.");

  assert.equal(demo.calls.securityScan, 0, "Le scanner démo ne doit jamais appeler Security scan.");
  assert.equal(demo.calls.createScan, 0, "Le scanner démo ne doit jamais appeler createScan.");
  assert.doesNotMatch(demo.elements.feeControlContent.innerHTML, /Montant|Devise|Solde|Reçu|Transaction|Caisse|Tél|personnes autorisées/i, "La surface contrôleur ne doit pas exposer de données sensibles.");
  // Seule demoControlUser() mentionne un rôle : c'est la projection démo des permissions
  // (équivalent de DEMO_PERMISSIONS_BY_ROLE), pas un contrôle d'accès par rôle.
  const sourceWithoutDemoProjection = moduleSource.replace(/function demoControlUser\(\) \{[\s\S]*?\n  \}/, "");
  assert.doesNotMatch(sourceWithoutDemoProjection, /role\s*===|role\s*!==/, "Le lot ne doit pas introduire de contrôle par rôle.");

  // Une session réelle (token) doit rester sur l'état indisponible unifié, sans formulaire démo.
  const real = load({ live: true });
  await render(real);
  assert.match(real.elements.feeControlContent.innerHTML, /BACKEND_LATER/, "Le mode réel doit rester indisponible.");
  assert.equal(real.elements.feeControlDemoScanForm, undefined, "Le mode réel ne doit pas rendre le formulaire démo.");
  assert.equal(real.calls.securityScan, 0, "Le mode réel ne doit appeler aucun scan Sécurité.");
  assert.equal(real.calls.createScan, 0, "Le mode réel ne doit appeler aucun createScan.");
}

main().then(function () { console.log("FE-FIN-08A demo scanner: PASS"); }).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
