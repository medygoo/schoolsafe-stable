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

function createElement(id, elements, controls) {
  const listeners = {};
  let html = "";
  const element = {
    value: "",
    classList: { remove: function () {}, add: function () {} },
    addEventListener: function (type, listener) { listeners[type] = listener; },
    hasListener: function (type) { return typeof listeners[type] === "function"; },
    trigger: function (type, event) { if (listeners[type]) listeners[type].call(this, event || { preventDefault: function () {} }); },
    querySelectorAll: function (selector) {
      if (selector === "input[name='feeControlCampaign']") return controls.radios;
      return [];
    },
    querySelector: function (selector) {
      const idMatch = selector.match(/^#(.+)$/);
      return idMatch ? (elements[idMatch[1]] || null) : null;
    }
  };
  Object.defineProperty(element, "innerHTML", {
    get: function () { return html; },
    set: function (value) {
      html = String(value || "");
      if (id === "feeControlContent") {
        // Alignement M : les filtres d'historique (campagne/résultat/recherche) et la liste
        // séparée ont été retirés du runtime lors de la consolidation (périmètre minimal).
        ["feeControlCampaigns", "feeControlHistory"].forEach(function (childId) {
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
  const calls = { securityScan: 0, createScan: 0, listCampaigns: 0 };
  // Alignement M : la lecture de l'historique exige finance.control.read (portée school),
  // cf. DEMO_PERMISSIONS_BY_ROLE.finance / DEMO_ACCESS_CONTEXT_BY_ROLE.finance dans app.js.
  const financeReader = {
    role: "finance",
    permissions: ["finance.control.read"],
    scopes: [{ permission: "finance.control.read", type: "school" }]
  };
  const session = options.live ? Object.assign({ token: "live-session" }, financeReader) : financeReader;
  const root = {
    schoolSafeDemoMode: !options.live,
    location: { hostname: options.live ? "schoolsafe.example" : "localhost" },
    localStorage: { getItem: function () { return null; } },
    SchoolSafeAppContext: { getCurrentUser: function () { return session; } },
    SchoolSafeAccess: loadAccess(),
    SchoolSafeSecurityAPI: { scan: function () { calls.securityScan += 1; return Promise.resolve({}); } },
    SchoolSafeFinanceAPI: {
      createScan: function () { calls.createScan += 1; return Promise.resolve({}); },
      listCampaigns: function () { calls.listCampaigns += 1; return Promise.resolve([]); }
    },
    ssState: state,
    ssBadge: function (props) { return "<span>" + (props.label || "") + "</span>"; },
    ssButton: function (props) { return "<button>" + (props.label || "") + "</button>"; },
    // Alignement M : stub du rendu tabulaire consolidé (window.ssTable).
    ssTable: function (props) {
      props = props || {};
      const head = (props.headers || []).map(function (header) { return "<th>" + header + "</th>"; }).join("");
      return '<table data-ss-table><thead><tr>' + head + "</tr></thead><tbody>" + (props.rows || "") + "</tbody></table>";
    }
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

async function main() {
  const demo = load({});
  await render(demo);
  assert.ok(demo.elements.feeControlHistory, "Le mode démo doit créer la surface Historique autorisé.");
  assert.match(demo.elements.feeControlContent.innerHTML, /Historique local autorisé/i, "Le mode démo doit rendre l’historique autorisé.");
  assert.match(demo.elements.feeControlContent.innerHTML, /DÉMO/, "L’historique local doit être explicitement démo.");
  assert.match(demo.elements.feeControlContent.innerHTML, /En règle/, "Le résultat ok doit être rendu.");
  assert.match(demo.elements.feeControlContent.innerHTML, /Paiement partiel/, "Le résultat partial doit être rendu.");
  assert.match(demo.elements.feeControlContent.innerHTML, /Non en règle/, "Le résultat unpaid doit être rendu.");
  assert.match(demo.elements.feeControlContent.innerHTML, /Exempté/, "Le résultat exempted doit être rendu.");
  // Alignement M : le code NO_STUDENT_FEE et le marqueur « Doublon démo » ont été retirés lors
  // de la consolidation ; l'anomalie reste un résultat explicite, sans doublon affiché.
  assert.match(demo.elements.feeControlContent.innerHTML, /Anomalie/, "L’anomalie doit rester un résultat explicite.");
  // Alignement M : le bandeau « Aucune donnée de caisse ou transactionnelle n'est exposée » est
  // un avertissement, pas une donnée ; le filtre de données sensibles cible le corps du tableau.
  const tableBody = (demo.elements.feeControlContent.innerHTML.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || "";
  assert.ok(tableBody, "Le tableau d'historique démo doit être rendu.");
  assert.doesNotMatch(tableBody, /Montant|Devise|Solde|Reçu|Transaction|Caisse|Tél|téléphone|personnes autorisées|photo|location_id|Security/i, "Aucune donnée financière ou Sécurité sensible ne doit être rendue.");

  // Les cinq lignes démo bornées doivent être rendues dans le tableau consolidé.
  ["DÉMO-HIST-001", "DÉMO-HIST-002", "DÉMO-HIST-003", "DÉMO-HIST-004", "DÉMO-HIST-005"].forEach(function (reference) {
    assert.ok(demo.elements.feeControlContent.innerHTML.indexOf(reference) !== -1, "La référence " + reference + " doit être rendue.");
  });

  assert.equal(demo.calls.listCampaigns, 0, "La projection démo ne doit charger aucune liste réelle.");
  assert.equal(demo.calls.securityScan, 0, "L’historique démo ne doit appeler aucune API Sécurité.");
  assert.equal(demo.calls.createScan, 0, "L’historique démo ne doit créer aucun scan réel.");
  assert.doesNotMatch(moduleSource, /listScans\s*[:(]/, "Le lot ne doit pas inventer listScans().");
  // Seule demoControlUser() mentionne un rôle : c'est la projection démo des permissions
  // (équivalent de DEMO_PERMISSIONS_BY_ROLE), pas un contrôle d'accès par rôle.
  const sourceWithoutDemoProjection = moduleSource.replace(/function demoControlUser\(\) \{[\s\S]*?\n  \}/, "");
  assert.doesNotMatch(sourceWithoutDemoProjection, /role\s*===|role\s*!==/, "Le lot ne doit pas introduire de contrôle de rôle.");

  // Session réelle (token) : l'état indisponible unifié remplace toute fixture d'historique.
  const real = load({ live: true });
  await render(real);
  assert.equal(real.elements.feeControlHistory, undefined, "Le mode réel ne doit rendre aucune fixture d’historique.");
  assert.match(real.elements.feeControlContent.innerHTML, /BACKEND_LATER/, "Le mode réel doit rester BACKEND_LATER.");
  assert.match(real.elements.feeControlContent.innerHTML, /ne sont pas connectés/i, "Le mode réel doit annoncer que les historiques réels ne sont pas connectés.");
  assert.equal(real.calls.listCampaigns, 0, "Le mode réel ne doit pas charger une liste globale pour l’historique.");
  assert.equal(real.calls.securityScan, 0, "Le mode réel ne doit appeler aucune API Sécurité.");
  assert.equal(real.calls.createScan, 0, "Le mode réel ne doit créer aucun scan.");
}

main().then(function () { console.log("FE-FIN-09A demo authorized history: PASS"); }).catch(function (error) { console.error(error.stack || error.message); process.exitCode = 1; });
