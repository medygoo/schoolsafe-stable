const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const financeModule = fs.readFileSync(path.join(root, "app/modules/finance/finance-module.js"), "utf8");
const index = fs.readFileSync(path.join(root, "app/index.html"), "utf8");

function expect(pattern, message) {
  assert.match(financeModule, pattern, message);
}

assert.match(index, /data-finance-tab="assignments"/, "L'onglet Affectation des frais est absent.");
// Aligné sur le runtime actuel : FE-FIN-03 prépare un BROUILLON LOCAL (BACKEND_LATER)
// avec trois modes de ciblage (Cycle, Classe, Élèves ciblés) et ne crée jamais de student_fee.
expect(/function renderFeeAssignment\(\)/, "Le rendu FE-FIN-03 est absent.");
expect(/Affecter un frais/, "Le titre FE-FIN-03 est absent.");
expect(/Préparer une affectation/, "Le titre du workflow d'affectation est absent.");
expect(/Cycle/, "Le ciblage par cycle est absent.");
expect(/Classe/, "Le ciblage par classe est absent.");
expect(/Élèves ciblés/, "Le ciblage multi-élèves est absent.");
expect(/BROUILLON LOCAL · BACKEND_LATER/, "L'affectation doit rester un brouillon local explicitement non connecté.");
expect(/Aucune obligation officielle n’est créée/, "L'absence d'écriture officielle doit être explicite.");
expect(/Affectation préparée en BROUILLON LOCAL\. Aucun student_fee n’a été créé\./, "La confirmation non connectée est absente.");
expect(/student_fee non créé/, "Le brouillon doit rappeler qu'aucun student_fee n'est créé.");
assert.doesNotMatch(financeModule, /createStudentFee|createFeeAssignment|applyFeeAssignment|\/finance\/fee-assignments/i, "FE-FIN-03 ne doit pas créer de route ou d'API d'affectation.");
assert.doesNotMatch(financeModule, /queueOfflineOperation\(\s*["']finance["']\s*,\s*["'][^"']*affect/i, "FE-FIN-03 ne doit pas créer d'opération hors-ligne fictive.");

const assignmentRenderer = financeModule.slice(
  financeModule.indexOf("function renderFeeAssignment()"),
  financeModule.indexOf("function renderCash()")
);
assert.doesNotMatch(assignmentRenderer, /\.createStudentFee|\.createFeeAssignment|\.applyFeeAssignment|\.listStudentFees|localStorage|queueOfflineOperation/, "Le rendu d'affectation ne doit ni appeler d'API, ni persister une intention locale.");

console.log("FE-FIN-03 static contract: PASS");
