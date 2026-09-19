/* QA A5.1 - DENY cibles vs DENY globaux (projection deniedRules).
   Charge core/access.js dans Node via vm, verifie le contrat frontend.
   Usage : node app/qa-a51-targeted-denies.cjs */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "modules/core/access.js"), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const access = sandbox.window.SchoolSafeAccess;

function assert(cond, msg) {
  if (!cond) { console.error("FAIL: " + msg); process.exit(1); }
  console.log("ok - " + msg);
}

// Cas 1 : DENY global (sans cible ni condition) bloque la permission.
const globalDenyUser = {
  permissions: ["school.student.read"],
  deniedRules: [{ permission: "school.student.read", source: "role", originId: "g1", effect: "deny", scopeType: "school", target: null, conditionCode: null, conditionParams: null, startsAt: null, endsAt: null }]
};
assert(access.explicitDeny(globalDenyUser, "school.student.read") === true, "global deny blocks permission");
assert(access.canAccess(globalDenyUser, "school.student.read") === false, "global deny denies canAccess");

// Cas 2 : DENY cible (une classe) n'aplatit PAS la permission entiere.
const targetedUser = {
  permissions: ["school.student.read"],
  deniedRules: [{ permission: "school.student.read", source: "role", originId: "g2", effect: "deny", scopeType: "assigned_classes", target: "class-uuid-1", conditionCode: null, conditionParams: null, startsAt: null, endsAt: null }]
};
assert(access.explicitDeny(targetedUser, "school.student.read") === false, "targeted deny does not flatten globally");
assert(access.canAccess(targetedUser, "school.student.read") === true, "targeted deny keeps canAccess true");
assert(access.targetedDenies(targetedUser, "school.student.read").length === 1, "targeted deny exposed via targetedDenies");
assert(access.isGlobalDeny(targetedUser.deniedRules[0]) === false, "scoped rule is not global");

// Cas 3 : DENY conditionnel non global.
const conditionalUser = {
  permissions: ["finance.fee.read"],
  deniedRules: [{ permission: "finance.fee.read", source: "exception", originId: "e1", effect: "deny", scopeType: "school", target: null, conditionCode: "academic_year_active", conditionParams: {}, startsAt: null, endsAt: null }]
};
assert(access.explicitDeny(conditionalUser, "finance.fee.read") === false, "conditional deny is not flattened globally");
assert(access.targetedDenies(conditionalUser, "finance.fee.read").length === 1, "conditional deny listed as targeted");

// Cas 4 : repli legacy - deniedPermissions aplati sans deniedRules.
const legacyUser = { permissions: ["school.student.read"], deniedPermissions: ["school.student.read"] };
assert(access.explicitDeny(legacyUser, "school.student.read") === true, "legacy flat deniedPermissions still blocks");
assert(access.canAccess(legacyUser, "school.student.read") === false, "legacy deny denies canAccess");

// Cas 5 : pas de deny du tout.
const cleanUser = { permissions: ["school.student.read"] };
assert(access.explicitDeny(cleanUser, "school.student.read") === false, "no deny, no block");
assert(access.targetedDenies(cleanUser, "school.student.read").length === 0, "no targeted denies");

// Cas 6 : ancien serveur sans projection detaillee, refus conserve par prudence.
const exceptionTargetedUser = {
  permissions: ["school.student.read"],
  permissionExceptions: [{ permission: "school.student.read", effect: "deny", reason: "restriction", expires_at: null, scopes: [{ permission: "school.student.read", type: "assigned_classes", target: "class-uuid-2" }] }]
};
assert(access.explicitDeny(exceptionTargetedUser, "school.student.read") === true, "legacy exception denial remains conservative");

console.log("QA A5.1 targeted denies (frontend projection): PASS");