// FE-SEC-A3A4 — Access_Law : pas de bypass admin dans canAccess/canAccessAny,
// Jaspe (safe-assistant) gated par safe.assistant.use + suggestions filtrées par branche.
// Usage : node app/qa-safe-assistant-access.cjs
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert");

const accessSource = fs.readFileSync(path.join(__dirname, "modules/core/access.js"), "utf8");
// Runtime actuel : l'assistant route via la gouvernance + le routeur central de capacités.
const jaspeGovernanceSource = fs.readFileSync(path.join(__dirname, "modules/safe/jaspe-governance.js"), "utf8");
const jaspeRouterSource = fs.readFileSync(path.join(__dirname, "modules/safe/jaspe-capability-router.js"), "utf8");
const assistantSource = fs.readFileSync(path.join(__dirname, "modules/safe/safe-assistant.js"), "utf8");

function loadAccess(context) {
  context.window = context.window || {};
  vm.runInNewContext(accessSource, context);
  return context.window.SchoolSafeAccess;
}

// --- A3 : canAccess/canAccessAny sans bypass admin ---
{
  const access = loadAccess({});
  const adminNoPerm = { role: "admin", permissions: [] };
  const adminWithPerm = { role: "admin", permissions: ["school.student.read"] };
  const teacher = { role: "teacher", permissions: ["pedagogy.grade.read"] };

  assert.strictEqual(access.canAccess(adminNoPerm, "finance.payment.record"), false, "admin sans permission doit être refusé");
  assert.strictEqual(access.canAccessAny(adminWithPerm, ["finance.fee.read", "finance.payment.record"]), false, "admin : DENY/exception doit l’emporter");
  assert.strictEqual(access.canAccess(adminWithPerm, "school.student.read"), true, "admin avec permission réelle doit passer");
  assert.strictEqual(access.canAccess(teacher, "pedagogy.grade.read"), true, "permission enseignant conservée");
  assert.strictEqual(access.canAccess(teacher, "finance.fee.read"), false, "DENY par défaut conservé");
  assert.strictEqual(access.canAccessAny(teacher, []), false, "liste vide = false");
  assert.strictEqual(access.isAdmin(adminNoPerm), true, "isAdmin() conservé comme helper");
}

// --- A4 : safe-assistant ---
function makeDom() {
  const appended = [];
  const container = {
    innerHTML: "", hidden: false, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  };
  const document = {
    readyState: "complete",
    body: { classList: { contains: (name) => name === "screen-workspace" }, appendChild(el) { appended.push(el); } },
    createElement() { return container; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  return { appended, container, document };
}

function loadAssistant(options) {
  const dom = makeDom();
  const stored = options.storedSession === undefined ? null : JSON.stringify(options.storedSession);
  const sandbox = {
    document: dom.document,
    localStorage: { getItem() { return stored; }, setItem() {} },
    sessionStorage: { getItem() { return stored; }, setItem() {} },
    addEventListener() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    innerWidth: 1440,
    innerHeight: 900,
    currentSession: options.liveSession || null,
    console,
  };
  sandbox.window = sandbox;
  loadAccess(sandbox);
  vm.runInNewContext(jaspeGovernanceSource, sandbox);
  vm.runInNewContext(jaspeRouterSource, sandbox);
  vm.runInNewContext(assistantSource, sandbox);
  return { dom, sandbox };
}

// Démo (aucune session) : comportement inchangé, Jaspe s’initialise.
{
  const { dom } = loadAssistant({});
  assert.strictEqual(dom.appended.length, 1, "démo : Jaspe doit s’initialiser");
  assert.ok(dom.container.innerHTML.includes("safe-avatar"), "démo : avatar rendu");
  assert.ok(dom.container.innerHTML.includes("safe-avatar-stage"), "démo : la scène de l’avatar doit rester explicitement 2D");
  assert.ok(!dom.container.innerHTML.includes(["safe", "3d", "stage"].join("-")), "démo : aucun conteneur 3D ne doit être rendu");
}

// Session réelle sans safe.assistant.use : pas d’initialisation (même admin).
{
  const { dom } = loadAssistant({ liveSession: { token: "t", role: "admin", permissions: ["school.student.read"] } });
  assert.strictEqual(dom.appended.length, 0, "session réelle sans safe.assistant.use : pas d’init");
}

// Session réelle restaurée depuis localStorage (bootstrap async) sans permission : pas d’init.
{
  const { dom } = loadAssistant({ storedSession: { token: "t", role: "teacher", permissions: ["pedagogy.grade.read"] } });
  assert.strictEqual(dom.appended.length, 0, "session persistée sans safe.assistant.use : pas d’init");
}

// Session réelle avec safe.assistant.use : init + suggestions filtrées par branche.
// Runtime actuel : la portée own est exigée en plus de la permission (allowsScope own).
{
  const { dom, sandbox } = loadAssistant({
    liveSession: { token: "t", role: "teacher", permissions: ["safe.assistant.use", "school.student.read", "pedagogy.grade.read"], scopes: [{ permission: "safe.assistant.use", type: "own" }] },
  });
  assert.strictEqual(dom.appended.length, 1, "avec safe.assistant.use : init");
  sandbox.SafeAssistant.openWithQuery("");
  const html = dom.container.innerHTML;
  assert.ok(html.includes("Comment ajouter un élève ?"), "branche school accessible : suggestion visible");
  assert.ok(html.includes("Comment faire l’appel ?"), "branche pedagogy accessible : suggestion visible");
  assert.ok(!html.includes("Comment enregistrer un paiement ?"), "branche finance inaccessible : suggestion masquée");
}

// Session réelle : requête finance sans capacité finance → refus explicite du routeur central.
{
  const { dom, sandbox } = loadAssistant({
    liveSession: {
      token: "t", role: "teacher",
      permissions: ["safe.assistant.use", "pedagogy.grade.read"],
      scopes: [
        { permission: "safe.assistant.use", type: "own" },
        { permission: "pedagogy.grade.read", type: "assigned_classes" },
      ],
      assignedClassIds: ["demo-class-1"],
    },
  });
  sandbox.SafeAssistant.openWithQuery("comment enregistrer un paiement à la caisse ?");
  assert.ok(dom.container.innerHTML.includes("Jaspe refuse cette demande"), "refus Jaspe explicite sans capacité finance");
  assert.ok(!dom.container.innerHTML.includes("Dans Caisse"), "réponse finance masquée sans accès branche");
  // Le routeur exige le module cible : on fournit un module enseignant minimal qui délègue à la FAQ.
  sandbox.SchoolSafeTeacherPedagogy = { answerJaspe: function () { return null; } };
  sandbox.SafeAssistant.openWithQuery("c’est quoi le palmarès ?");
  assert.ok(dom.container.innerHTML.includes("Top 10"), "réponse pedagogy visible avec accès branche");
}

// Une session cookie ne porte aucun bearer : elle doit garder ses vrais refus.
for (const source of ["liveSession", "storedSession"]) {
  const { dom } = loadAssistant({ [source]: {
    native: true, token: null, profile: { id: "native-profile" }, role: "admin",
    permissions: ["school.student.read"], scopes: [],
  } });
  assert.strictEqual(dom.appended.length, 0, source + " native sans permission : aucune init démo");
}

console.log("FE-SEC-A3A4 access law + safe assistant gate: PASS");
