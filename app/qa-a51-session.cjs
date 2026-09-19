// Run from repository root: node app/qa-a51-session.cjs
// Actual source functions; DOM/storage substitutes. Not a browser or SQL proof.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const accessSource = fs.readFileSync('app/modules/core/access.js', 'utf8');
const appSource = fs.readFileSync('app/app.js', 'utf8');
function extract(source, first, last) {
  const start = source.indexOf(first), end = source.indexOf(last, start);
  assert(start >= 0 && end > start, 'Actual source function boundaries');
  return source.slice(start, end);
}
const bootstrapSource = extract(appSource, '  function applyBootstrap(bootstrap)', '  function initialsFromName(name)');
const permission = 'school.student.read';
const rule = { permission, source: 'role', originId: 'synthetic-grant', effect: 'deny', scopeType: 'assigned_classes', target: 'class-1', conditionCode: null, conditionParams: null, startsAt: '2020-01-01T00:00:00Z', endsAt: null };
const bootstrap = () => ({ native: true, profile: { id: 'synthetic-profile', display_name: 'Fixture' }, schoolId: 'school-a', school: { id: 'school-a', name: 'Fixture' }, roles: ['teacher'], permissions: [permission], scopes: [{ permission, type: 'school', target: null }], deniedPermissions: [permission], permissionExceptions: [] });
function context() {
  const c = { window: {}, console, currentSession: { native: true }, storageGet: () => null, storageSet: () => {}, document: { getElementById: () => null }, roleCatalog: {}, initialsFromName: () => 'F', scopeSummary: () => '', renderWorkspace: () => {} };
  c.storeSession = value => { c.currentSession = value; };
  c.clearSession = () => { c.currentSession = null; };
  vm.createContext(c); vm.runInContext(accessSource, c); vm.runInContext(bootstrapSource, c);
  return c;
}
const core = context().window.SchoolSafeAccess;
let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); ++passed; console.log('PASS ' + name); }
  catch (error) { ++failed; console.log('FAIL ' + name + ': ' + error.message.split('\n')[0]); }
}
check('login retains deniedRules structure', () => {
  const c = context(); c.applyBootstrap({ ...bootstrap(), deniedRules: [rule] });
  assert.equal(JSON.stringify(c.currentSession.deniedRules), JSON.stringify([rule]), 'deniedRules lost');
});
check('refresh replaces deniedRules', () => {
  const c = context(); c.currentSession.deniedRules = [rule];
  const next = { ...rule, target: 'class-2' }; c.applyBootstrap({ ...bootstrap(), deniedRules: [next] });
  assert.equal(JSON.stringify(c.currentSession.deniedRules), JSON.stringify([next]), 'refreshed rules lost');
});
check('empty array differs from absent field', () => {
  const c = context(); c.applyBootstrap({ ...bootstrap(), deniedPermissions: [], deniedRules: [] });
  assert.equal(Array.isArray(c.currentSession.deniedRules), true, 'empty array became absent');
});
check('legacy absent field retains flat deny', () => {
  const c = context(); c.applyBootstrap(bootstrap());
  assert.equal(Object.hasOwn(c.currentSession, 'deniedRules'), false);
  assert.equal(core.canAccess(c.currentSession, permission), false);
});
for (const value of [null, {}, [null], [{ ...rule, startsAt: 'invalid' }], [{ ...rule, scopeType: 'invented' }]]) {
  check('invalid projection rejected before replacing session: ' + JSON.stringify(value), () => {
    const c = context();
    c.applyBootstrap({ ...bootstrap(), deniedRules: [rule] });
    assert.equal(core.canAccess(c.currentSession, permission), true);
    assert.throws(() => c.applyBootstrap({ ...bootstrap(), deniedRules: value }));
    assert.equal(core.canAccess(c.currentSession, permission), false, 'invalid refresh must close old session');
  });
  check('invalid direct rules fail closed: ' + JSON.stringify(value), () => {
    assert.equal(core.canAccess({ ...bootstrap(), deniedRules: value }, permission), false);
  });
}
for (const scopeType of ['school', 'none']) check(scopeType + ' unconditional deny wins', () => {
  assert.equal(core.canAccess({ ...bootstrap(), deniedRules: [{ ...rule, scopeType, target: null }] }, permission), false);
});
for (const source of ['role', 'exception']) for (const scopeType of ['school', 'none']) for (const target of [null, 'school-a']) {
  check(`${source} ${scopeType} general DENY target=${target}`, () => {
    const general = { ...rule, source, scopeType, target };
    const c = context(); c.applyBootstrap({ ...bootstrap(), deniedRules: [general] });
    assert.equal(c.currentSession.deniedRules[0].target, target, 'Target metadata must survive normalization');
    assert.equal(core.explicitDeny(c.currentSession, permission), true, 'General scope must remain a DENY even with a target');
    assert.equal(core.canAccess(c.currentSession, permission), false);
    assert.equal(core.targetedDenies(c.currentSession, permission).length, 0);
    // The target fix must not turn contextual or non-current rules into a general veto.
    for (const patch of [{ conditionCode: 'academic_year_active', conditionParams: {} }, { startsAt: '2999-01-01T00:00:00Z' }, { endsAt: '2020-01-02T00:00:00Z' }]) {
      assert.equal(core.canAccess({ ...bootstrap(), deniedRules: [{ ...general, ...patch }] }, permission), true);
    }
    const teacherRules = [general, { ...rule, source }, { ...rule, source, scopeType: 'assigned_subjects', target: 'subject-1' }];
    assert.equal(core.canAccess({ ...bootstrap(), deniedRules: teacherRules }, permission), true, 'Same-origin class AND subject stays contextual');
    assert.equal(core.canAccess({ ...bootstrap(), deniedRules: [general, { ...rule, source, originId: 'different-origin' }] }, permission), false, 'Another origin cannot neutralize a general DENY');
  });
}
check('canonical target keeps navigation ALLOW', () => {
  assert.equal(core.canAccess({ ...bootstrap(), deniedRules: [rule] }, permission), true);
});
check('no ALLOW means no access', () => {
  assert.equal(core.canAccess({ ...bootstrap(), permissions: [], deniedRules: [rule] }, permission), false);
});
check('conditional deny stays contextual', () => {
  assert.equal(core.canAccess({ ...bootstrap(), deniedRules: [{ ...rule, scopeType: 'school', target: null, conditionCode: 'academic_year_active', conditionParams: {} }] }, permission), true);
});
for (const [name, patch] of [['future', { startsAt: '2999-01-01T00:00:00Z' }], ['expired', { endsAt: '2020-01-02T00:00:00Z' }]]) check(name + ' deny is not current', () => {
  assert.equal(core.explicitDeny({ ...bootstrap(), deniedRules: [{ ...rule, scopeType: 'school', target: null, ...patch }] }, permission), false);
});
check('missing detailed rule retains legacy denial', () => {
  assert.equal(core.canAccess({ ...bootstrap(), deniedRules: [{ ...rule, permission: 'staff.read' }] }, permission), false);
});
check('legacy scoped exceptions remain conservative', () => {
  assert.equal(core.canAccess({ permissions: [permission], permissionExceptions: [{ permission, effect: 'deny', scopes: [{ permission, type: 'assigned_classes', target: 'c1' }] }] }, permission), false);
});
check('teacher conjunction is not school-wide', () => {
  assert.equal(core.canAccess({ ...bootstrap(), deniedRules: [{ ...rule, scopeType: 'school', target: null }, rule] }, permission), true);
});
const gates = [
  ['parent/parent-portal-demo.js', 'explicitDeny(user, permission)', 'scopeFor(user, permission)'],
  ['school/academic-structure-demo.js', 'explicitDeny(user, permission)', 'scopeFor(user, permission)'],
  ['school/student-dossier-demo.js', 'explicitDeny(user, permission)', 'scopeFor(user, permission)'],
  ['school/student-card-preparation-demo.js', 'explicitDeny(user, permission)', 'scopeFor(user, permission)'],
  ['school/student-lifecycle-demo.js', 'isExplicitlyDenied(user, permission)', 'scopeType(user, permission)'],
  ['pedagogy/palmares-module.js', 'explicitDeny(session, permission)', 'scopeFor(session, permission)'],
  ['school/school-module.js', 'isExplicitlyDenied(permission)', 'scopeFor(permission)']
];
for (const [file, first, last] of gates) check(file + ' delegates targeted and general denials', () => {
  const source = fs.readFileSync('app/modules/' + file, 'utf8');
  const c = { root: { SchoolSafeAccess: core }, global: { SchoolSafeAccess: core }, window: { SchoolSafeAccess: core } };
  vm.createContext(c); vm.runInContext(extract(source, '  function ' + first, '  function ' + last), c);
  for (const [rules, expected] of [[[rule], true], [[{ ...rule, scopeType: 'school', target: null }], false]]) {
    c.currentUser = { ...bootstrap(), deniedRules: rules };
    const actual = file === 'school/school-module.js' ? c.hasPermission(permission) : c.hasPermission(c.currentUser, permission);
    assert.equal(actual, expected, 'local gate must agree with canonical engine');
  }
});
console.log(JSON.stringify({ passed, failed, proof: 'source with DOM/storage substitutes' }));
process.exitCode = failed ? 1 : 0;
