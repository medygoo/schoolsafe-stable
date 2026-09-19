// Dedicated A5.1 proof. Requires unit 08 already installed; replays only 08
// inside the rolled-back SQL transaction to verify preservation of fixture data.
// node --import tsx scripts/qa-a51-live.mjs [--sql-only] [--allow-old-projection]
// Requires an explicitly named, freshly installed, EMPTY synthetic local database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { randomBytes } from 'node:crypto';

const url = new URL(process.env.SCHOOLSAFE_ACCESS_TEST_URL || 'about:blank');
assert.equal(url.protocol, 'postgresql:'); assert.equal(url.search, '');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.match(url.pathname, /^\/schoolsafe_access_test_\d+$/);
assert.equal(url.username, 'schoolsafe_bootstrap');
const config = { host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1) };
const admin = new pg.Client({ ...config, user: url.username, password: decodeURIComponent(url.password), connectionTimeoutMillis: 5000 });
const permission = 'school.student.read';
const school = 'a0000000-0000-4000-8000-000000000001', foreignSchool = 'a0000000-0000-4000-8000-000000000002';
const user = 'a1000000-0000-4000-8000-000000000001', actor = 'a2000000-0000-4000-8000-000000000001';
const role = 'a3000000-0000-4000-8000-000000000001';
const restrictionRole = 'a3000000-0000-4000-8000-000000000051';
const request = 'a6000000-0000-4000-8000-000000000051';
let ids, passed = 0;
const failures = [];
async function fixture() {
  const source = await readFile(new URL('../database/projections/v1/tests/access-read.test.sql', import.meta.url), 'utf8');
  await admin.query(source.split('set local role schoolsafe_api;')[0].replace(/^\\.*$/gm, ''));
  const year = (await admin.query("insert into app.academic_years(school_id,label,starts_on,ends_on,periods,is_active) values($1,'A51 synthetic',current_date-30,current_date+365,'Trimestres',true) returning id", [school])).rows[0].id;
  const cls = (await admin.query("insert into app.classes(school_id,academic_year_id,cycle_key,name) values($1,$2,'primary','A51 synthetic class') returning id", [school, year])).rows[0].id;
  const children = [];
  for (let i = 0; i < 2; i++) children.push((await admin.query("insert into app.students(school_id,class_id,matricule,first_name,last_name,lifecycle_status) values($1,$2,$3,'Synthetic','A51','active') returning id", [school, cls, 'A51-' + i])).rows[0].id);
  await admin.query("insert into app.student_guardians(school_id,student_id,profile_id,guardian_type,full_name) values($1,$2,$3,'tuteur','Synthetic A51 guardian')", [school, children[0], actor]);
  await admin.query("insert into iam.roles(id,school_id,code,label) values($1,$2,'z_a51_restriction','A51 restriction')", [restrictionRole, school]);
  await admin.query('insert into iam.profile_roles(school_id,profile_id,role_id) values($1,$2,$3)', [school, actor, restrictionRole]);
  const allow = (await admin.query("insert into iam.role_permission_grants(school_id,role_id,permission_id,effect) select $1,$2,id,'allow' from iam.permissions where code=$3 returning id", [school, role, permission])).rows[0].id;
  const deny = (await admin.query("insert into iam.role_permission_grants(school_id,role_id,permission_id,effect) select $1,$2,id,'deny' from iam.permissions where code=$3 returning id", [school, restrictionRole, permission])).rows[0].id;
  await admin.query("insert into iam.grant_scopes(school_id,grant_id,scope_code) values($1,$2,'school'),($1,$3,'own_children')", [school, allow, deny]);
  await admin.query('select api.set_request_context($1,$2,$3,$4)', [user, actor, school, request]);
  return { year, cls, deniedChild: children[0], allowedChild: children[1], allow, deny };
}
async function snapshot() {
  await admin.query('set local role schoolsafe_api');
  const data = (await admin.query('select api.session_bootstrap() as data')).rows[0].data;
  const denied = (await admin.query('select api.check_access($1,null,$2) as allowed', [permission, ids.deniedChild])).rows[0].allowed;
  const allowed = (await admin.query('select api.check_access($1,null,$2) as allowed', [permission, ids.allowedChild])).rows[0].allowed;
  return { data, denied, allowed };
}
async function checkTarget({ profile = null, child = null, cls = null, subject = null, portal = null, runtime = {} } = {}) {
  return (await admin.query('select api.check_access($1,$2,$3,$4,$5,$6,$7) as allowed', [permission, profile, child, cls, subject, portal, runtime])).rows[0].allowed;
}
async function setGeneralDeny(source, scopeType, target) {
  await admin.query('update iam.role_permission_grants set is_active=$2 where id=$1', [ids.deny, source === 'role']);
  await admin.query('update iam.grant_scopes set scope_code=$2,target_id=$3 where grant_id=$1', [ids.deny, scopeType, target]);
  await admin.query('update iam.profile_permission_exceptions set is_active=false where school_id=$1 and profile_id=$2 and permission_id=(select id from iam.permissions where code=$3)', [school, actor, permission]);
  if (source === 'role') return ids.deny;
  const exception = (await admin.query("insert into iam.profile_permission_exceptions(school_id,profile_id,permission_id,effect,reason,granted_by) select $1,$2,id,'deny','Synthetic A51 general target',$2 from iam.permissions where code=$3 on conflict(school_id,profile_id,permission_id) do update set is_active=true,condition_code=null,starts_at=now(),expires_at=null returning id", [school, actor, permission])).rows[0].id;
  await admin.query('delete from iam.exception_scopes where exception_id=$1 and school_id=$2', [exception, school]);
  await admin.query('insert into iam.exception_scopes(school_id,exception_id,scope_code,target_id) values($1,$2,$3,$4)', [school, exception, scopeType, target]);
  return exception;
}
async function fingerprint() {
  const result = {};
  for (const table of ['app.schools', 'app.students', 'iam.profiles', 'iam.roles', 'iam.profile_roles', 'iam.role_permission_grants', 'iam.grant_scopes', 'iam.permission_conditions', 'iam.profile_permission_exceptions', 'iam.exception_scopes']) {
    result[table] = (await admin.query(`select md5(coalesce(string_agg(row_to_json(t)::text, ',' order by row_to_json(t)::text), '')) as hash from ${table} t`)).rows[0].hash;
  }
  return result;
}
async function scenario(name, change, verify) {
  await admin.query('savepoint a51_case'); await admin.query('reset role');
  try { await change(); await verify(await snapshot()); passed++; console.log('PASS SQL ' + name); }
  catch (error) { failures.push(name + ': ' + error.message); console.log('FAIL SQL ' + name + ': ' + error.message.split('\n')[0]); }
  finally { await admin.query('rollback to a51_case'); }
}
const noop = async () => {};
const visible = data => data.permissions.includes(permission) && data.scopes.some(s => s.permission === permission);
let app, browser, ownsFixture = false;
await admin.connect();
try {
  assert.equal((await admin.query('select count(*)::int n from app.schools')).rows[0].n, 0, 'Fresh synthetic database required; no existing school data may be modified');
  const definition = (await admin.query("select pg_get_functiondef('api.session_bootstrap()'::regprocedure) as sql")).rows[0].sql;
  if (!process.argv.includes('--allow-old-projection')) assert.match(definition, /A51_CURRENT_PROJECTION/, 'Final projection must be unit 08, never a later replay of 05');
  ids = await fixture();
  if (!process.argv.includes('--allow-old-projection')) {
    const before = await fingerprint();
    const migration = await readFile(new URL('../database/projections/v1/08_session_denial_contract.sql', import.meta.url), 'utf8');
    await admin.query(migration.replace(/^\\.*$/gm, '').replace(/^begin;\s*$/gm, '').replace(/^commit;\s*$/gm, ''));
    await admin.query('reset role');
    assert.deepEqual(await fingerprint(), before, 'Replaying 08 must preserve existing fixture data');
    console.log('PASS migration 08 replay preserves ten fixture tables; rollback after SQL proof');
  }
  await scenario('targeted DENY preserves ALLOW outside linked children', noop, ({ data, denied, allowed }) => {
    assert.equal(denied, false); assert.equal(allowed, true);
    assert.equal(visible(data), true, 'targeted DENY globally erased ALLOW/scopes');
    assert.ok(data.deniedRules.some(r => r.originId === ids.deny && r.scopeType === 'own_children'));
  });
  await scenario('general school DENY wins', () => admin.query("update iam.grant_scopes set scope_code='school' where grant_id=$1", [ids.deny]), ({ data, denied, allowed }) => {
    assert.equal(denied, false); assert.equal(allowed, false); assert.equal(visible(data), false);
  });
  for (const source of ['role', 'exception']) for (const scopeType of ['school', 'none']) for (const target of [null, school]) {
    let origin;
    await scenario(`${source} ${scopeType} general DENY target=${target}`, async () => {
      origin = await setGeneralDeny(source, scopeType, target);
    }, async ({ data, denied, allowed }) => {
      // Check the server decision first: the regression is in metadata, not IAM.
      assert.equal(denied, false); assert.equal(allowed, false);
      assert.equal(visible(data), false, 'General DENY with target must remove descriptive ALLOW/scopes');
      const detail = data.deniedRules.find(r => r.originId === origin);
      assert.equal(detail.source, source); assert.equal(detail.scopeType, scopeType); assert.equal(detail.target, target);
      for (const active of [true, false]) {
        await admin.query('reset role');
        if (source === 'role') await admin.query("insert into iam.permission_conditions(school_id,grant_id,condition_code) values($1,$2,'academic_year_active') on conflict(grant_id,condition_code) do update set is_active=true", [school, origin]);
        else await admin.query("update iam.profile_permission_exceptions set condition_code='academic_year_active' where id=$1", [origin]);
        await admin.query('update app.academic_years set is_active=$1 where id=$2', [active, ids.year]);
        const conditional = await snapshot();
        assert.equal(conditional.denied, !active); assert.equal(conditional.allowed, !active); assert.equal(visible(conditional.data), true);
      }
      await admin.query('reset role');
      if (source === 'role') await admin.query('update iam.permission_conditions set is_active=false where grant_id=$1', [origin]);
      else await admin.query('update iam.profile_permission_exceptions set condition_code=null where id=$1', [origin]);
      const table = source === 'role' ? 'iam.role_permission_grants' : 'iam.profile_permission_exceptions';
      const end = source === 'role' ? 'ends_at' : 'expires_at';
      for (const patch of ["starts_at=now()+interval '1 day'", `starts_at=now()-interval '2 days',${end}=now()-interval '1 day'`, `${end}=null,is_active=false`]) {
        await admin.query('reset role'); await admin.query(`update ${table} set ${patch} where id=$1`, [origin]);
        const inactive = await snapshot();
        assert.equal(inactive.denied, true); assert.equal(inactive.allowed, true); assert.equal(visible(inactive.data), true);
        assert.ok(!inactive.data.deniedRules.some(r => r.originId === origin));
      }
    });
  }
  for (const active of [true, false]) await scenario('condition academic_year_active=' + active, async () => {
    await admin.query("update iam.grant_scopes set scope_code='school' where grant_id=$1", [ids.deny]);
    await admin.query("insert into iam.permission_conditions(school_id,grant_id,condition_code) values($1,$2,'academic_year_active')", [school, ids.deny]);
    await admin.query('update app.academic_years set is_active=$1 where id=$2', [active, ids.year]);
  }, ({ data, denied, allowed }) => {
    assert.equal(denied, !active); assert.equal(allowed, !active);
    assert.equal(visible(data), true, 'conditional DENY must leave descriptive ALLOW');
    assert.equal(data.deniedRules.find(r => r.originId === ids.deny).conditionCode, 'academic_year_active');
  });
  for (const [name, patch] of [['future', "starts_at=now()+interval '1 day'"], ['expired', "starts_at=now()-interval '2 days',ends_at=now()-interval '1 day'"], ['revoked', 'is_active=false']]) {
    for (const [table, selector] of [['iam.role_permission_grants', 'id'], ['iam.grant_scopes', 'grant_id']]) await scenario(table + ' DENY ' + name,
      () => admin.query(`update ${table} set ${patch} where ${selector}=$1`, [ids.deny]), ({ data, denied, allowed }) => {
        assert.equal(denied, true); assert.equal(allowed, true); assert.equal(visible(data), true);
        assert.ok(!data.deniedRules.some(r => r.originId === ids.deny));
      });
  }
  await scenario('no ALLOW cannot grant access', () => admin.query('update iam.role_permission_grants set is_active=false where id=$1', [ids.allow]), ({ data, denied, allowed }) => {
    assert.equal(denied, false); assert.equal(allowed, false); assert.equal(visible(data), false);
  });
  await scenario('other school cannot inherit the first school ALLOW or DENY', async () => {
    await admin.query('select api.set_request_context($1,$2,$3,$4)', ['a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000003', foreignSchool, request]);
  }, ({ data, denied, allowed }) => {
    assert.equal(data.schoolId, foreignSchool); assert.equal(denied, false); assert.equal(allowed, false);
    assert.equal(data.deniedRules.length, 0); assert.equal(visible(data), false);
  });
  await scenario('scope expiry bounds projected rule', async () => {
    await admin.query("update iam.grant_scopes set ends_at=now()+interval '1 hour' where grant_id=$1", [ids.deny]);
  }, ({ data }) => { assert.ok(data.deniedRules.find(r => r.originId === ids.deny).endsAt, 'scope expiry missing'); });
  await scenario('none is general within the active school', () => admin.query("update iam.grant_scopes set scope_code='none' where grant_id=$1", [ids.deny]), ({ data, denied, allowed }) => {
    assert.equal(denied, false); assert.equal(allowed, false); assert.equal(visible(data), false);
  });
  await scenario('own only refuses the current profile target', () => admin.query("update iam.grant_scopes set scope_code='own' where grant_id=$1", [ids.deny]), async ({ data }) => {
    assert.equal(visible(data), true); assert.equal(await checkTarget({ profile: actor }), false);
    assert.equal(await checkTarget({ profile: 'a2000000-0000-4000-8000-000000000002' }), true);
  });
  for (const schoolAlongside of [false, true]) await scenario('assigned_classes AND assigned_subjects; school alongside=' + schoolAlongside, async () => {
    const subject = (await admin.query("insert into app.subjects(school_id,academic_year_id,code,name) values($1,$2,'A51','Synthetic subject') returning id", [school, ids.year])).rows[0].id;
    ids.subject = subject;
    await admin.query('insert into app.teacher_assignments(school_id,academic_year_id,class_id,subject_id,teacher_profile_id) values($1,$2,$3,$4,$5)', [school, ids.year, ids.cls, subject, actor]);
    await admin.query("update iam.grant_scopes set scope_code='assigned_classes',target_id=$2 where grant_id=$1", [ids.deny, ids.cls]);
    await admin.query("insert into iam.grant_scopes(school_id,grant_id,scope_code,target_id) values($1,$2,'assigned_subjects',$3)", [school, ids.deny, subject]);
    if (schoolAlongside) await admin.query("insert into iam.grant_scopes(school_id,grant_id,scope_code) values($1,$2,'school')", [school, ids.deny]);
  }, async ({ data }) => {
    assert.equal(visible(data), true);
    assert.equal(await checkTarget({ cls: ids.cls, subject: ids.subject }), false);
    assert.equal(await checkTarget({ cls: ids.cls }), true, 'Incomplete class/subject context is outside this DENY');
  });
  await scenario('assigned_portal limits DENY to the assigned portal', async () => {
    ids.portal = (await admin.query("insert into app.security_portals(school_id,code,label) values($1,'A51','Synthetic portal') returning id", [school])).rows[0].id;
    await admin.query("update iam.grant_scopes set scope_code='assigned_portal',target_id=$2 where grant_id=$1", [ids.deny, ids.portal]);
  }, async ({ data }) => {
    assert.equal(visible(data), true); assert.equal(await checkTarget({ portal: ids.portal }), false); assert.equal(await checkTarget(), true);
  });
  await scenario('assigned_fee_classes requires the assigned published campaign', async () => {
    const fee = (await admin.query("insert into app.fee_structures(school_id,academic_year_id,label,amount) values($1,$2,'Synthetic fee',1) returning id", [school, ids.year])).rows[0].id;
    ids.campaign = (await admin.query("insert into app.fee_control_campaigns(school_id,fee_structure_id,label,classes,status,created_by) values($1,$2,'Synthetic campaign',$3,'published',$4) returning id", [school, fee, JSON.stringify([ids.cls]), actor])).rows[0].id;
    await admin.query('insert into app.fee_control_assignees(school_id,campaign_id,profile_id) values($1,$2,$3)', [school, ids.campaign, actor]);
    await admin.query("update iam.grant_scopes set scope_code='assigned_fee_classes',target_id=$2 where grant_id=$1", [ids.deny, ids.cls]);
  }, async ({ data }) => {
    assert.equal(visible(data), true);
    assert.equal(await checkTarget({ cls: ids.cls, runtime: { campaign_id: ids.campaign } }), false);
    assert.equal(await checkTarget({ cls: ids.cls }), true);
  });
  for (const variant of ['targeted', 'general', 'conditional-true', 'conditional-false', 'future', 'expired', 'revoked', 'scope-expiry']) await scenario('individual exception ' + variant, async () => {
    await admin.query('update iam.role_permission_grants set is_active=false where id=$1', [ids.deny]);
    ids.exception = (await admin.query("insert into iam.profile_permission_exceptions(school_id,profile_id,permission_id,effect,reason,granted_by) select $1,$2,id,'deny','Synthetic A51 exception',$2 from iam.permissions where code=$3 returning id", [school, actor, permission])).rows[0].id;
    await admin.query('insert into iam.exception_scopes(school_id,exception_id,scope_code) values($1,$2,$3)', [school, ids.exception, variant.startsWith('conditional') || variant === 'general' ? 'school' : 'own_children']);
    if (variant.startsWith('conditional')) {
      await admin.query("update iam.profile_permission_exceptions set condition_code='academic_year_active',condition_params='{}' where id=$1", [ids.exception]);
      await admin.query('update app.academic_years set is_active=$1 where id=$2', [variant === 'conditional-true', ids.year]);
    }
    if (variant === 'future') await admin.query("update iam.profile_permission_exceptions set starts_at=now()+interval '1 day' where id=$1", [ids.exception]);
    if (variant === 'expired') await admin.query("update iam.profile_permission_exceptions set starts_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1", [ids.exception]);
    if (variant === 'revoked') await admin.query('update iam.profile_permission_exceptions set is_active=false where id=$1', [ids.exception]);
    if (variant === 'scope-expiry') await admin.query("update iam.exception_scopes set ends_at=now()+interval '1 hour' where exception_id=$1", [ids.exception]);
  }, ({ data, denied, allowed }) => {
    const inactive = ['future', 'expired', 'revoked'].includes(variant);
    assert.equal(visible(data), variant !== 'general');
    assert.equal(allowed, !['general', 'conditional-true'].includes(variant));
    assert.equal(denied, inactive || variant === 'conditional-false');
    const detail = data.deniedRules.find(r => r.originId === ids.exception);
    assert.equal(!!detail, !inactive);
    if (detail) assert.equal(detail.source, 'exception');
    if (variant === 'scope-expiry') assert.ok(detail.endsAt);
  });
  await scenario('school A general DENY cannot erase school B independent ALLOW', async () => {
    await admin.query("update iam.grant_scopes set scope_code='school' where grant_id=$1", [ids.deny]);
    const otherRole = 'a3000000-0000-4000-8000-000000000003', otherActor = 'a2000000-0000-4000-8000-000000000003', otherUser = 'a1000000-0000-4000-8000-000000000002';
    await admin.query('insert into iam.profile_roles(school_id,profile_id,role_id) values($1,$2,$3)', [foreignSchool, otherActor, otherRole]);
    const grant = (await admin.query("insert into iam.role_permission_grants(school_id,role_id,permission_id,effect) select $1,$2,id,'allow' from iam.permissions where code=$3 returning id", [foreignSchool, otherRole, permission])).rows[0].id;
    await admin.query("insert into iam.grant_scopes(school_id,grant_id,scope_code) values($1,$2,'school')", [foreignSchool, grant]);
    await admin.query('select api.set_request_context($1,$2,$3,$4)', [otherUser, otherActor, foreignSchool, request]);
  }, async ({ data }) => {
    assert.equal(data.schoolId, foreignSchool); assert.equal(visible(data), true); assert.equal(data.deniedRules.length, 0);
    assert.equal(await checkTarget(), true);
  });
  await admin.query('rollback');
  assert.deepEqual(failures, [], 'A5.1 SQL regression failures');
  console.log('PASS SQL A5.1: ' + passed + ' scenarios on ' + config.database);
  if (!process.argv.includes('--sql-only')) {
    const { chromium } = await import('playwright');
    const { buildNativeApp } = await import('../server/src/native-app.ts');
    const { parseEnv } = await import('../server/src/config/env.ts');
    const { hashPassword } = await import('../server/src/authnative/passwords.ts');
    const preview = 'http://127.0.0.1:4176';
    assert.equal((await (await fetch(preview + '/modules/core/access.js')).text()).replaceAll('\r\n', '\n'),
      (await readFile(new URL('../app/modules/core/access.js', import.meta.url), 'utf8')).replaceAll('\r\n', '\n'), 'Preview must serve this working tree');
    browser = await chromium.launch({ channel: process.env.A51_BROWSER_CHANNEL || 'chrome', headless: true });
    ids = await fixture();
    const password = randomBytes(24).toString('base64url'); // ephemeral synthetic identity; never logged
    const identity = (await admin.query("insert into auth.identities(user_id,email) values($1,'a51@example.invalid') returning id", [user])).rows[0].id;
    await admin.query('insert into auth.credentials(identity_id,password_hash,must_change) values($1,$2,false)', [identity, await hashPassword(password)]);
    await admin.query('commit'); ownsFixture = true;
    app = buildNativeApp(parseEnv({ NODE_ENV: 'test' }), {
      authPool: new pg.Pool({ ...config, user: 'schoolsafe_auth' }),
      businessPool: new pg.Pool({ ...config, user: 'schoolsafe_api' })
    });
    await app.listen({ host: '127.0.0.1', port: 8787 }); // Fails rather than taking over another API.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(preview);
    await page.evaluate(() => schoolSafeShow('auth'));
    await page.locator('#emailIdentifier').fill('a51@example.invalid');
    await page.locator('#password').fill(password);
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForFunction(() => window.currentSession?.native && window.currentSession?.profile);
    const boot = await context.request.get('http://127.0.0.1:8787/native/session/bootstrap');
    assert.equal(boot.status(), 200); const raw = (await boot.json()).data;
    assert.deepEqual(await page.evaluate(() => currentSession.deniedRules), raw.deniedRules);
    assert.ok(await page.locator('#workspaceNav [data-branch="school"]').count());
    assert.equal((await context.request.get('http://127.0.0.1:8787/native/students/' + ids.allowedChild)).status(), 200);
    assert.equal((await context.request.get('http://127.0.0.1:8787/native/students/' + ids.deniedChild)).status(), 403, 'Direct HTTP cannot bypass target DENY');
    const foreign = await context.request.get('http://127.0.0.1:8787/native/access/profiles/a2000000-0000-4000-8000-000000000003');
    assert.equal(foreign.status(), 404, 'Other school remains hidden');
    console.log('PASS HTTP/UI real login -> SQL -> service -> applyBootstrap -> visible navigation; targeted action denied');
    await page.locator('#permissionsNav').click();
    await page.locator('#refreshNativeAccess').waitFor();
    assert.deepEqual(await page.evaluate(() => currentSession.deniedRules), raw.deniedRules, 'Actual console refresh retains structured rules');
    // Conditions are evaluated by SQL on each request, never reimplemented by UI.
    await admin.query("update iam.grant_scopes set scope_code='school' where grant_id=$1", [ids.deny]);
    await admin.query("insert into iam.permission_conditions(school_id,grant_id,condition_code) values($1,$2,'academic_year_active')", [school, ids.deny]);
    for (const active of [false, true]) {
      await admin.query('update app.academic_years set is_active=$1 where id=$2', [active, ids.year]);
      assert.equal((await context.request.get('http://127.0.0.1:8787/native/students/' + ids.allowedChild)).status(), active ? 403 : 200);
    }
    await admin.query('update iam.permission_conditions set is_active=false where grant_id=$1', [ids.deny]);
    // Stale UI still has ALLOW; actual request must already refuse the general DENY.
    assert.equal(await page.evaluate(() => SchoolSafeAccess.canAccess(currentSession, 'school.student.read')), true);
    assert.equal((await context.request.get('http://127.0.0.1:8787/native/students/' + ids.allowedChild)).status(), 403);
    await page.locator('#refreshNativeAccess').click();
    await page.waitForFunction(() => !SchoolSafeAccess.canAccess(currentSession, 'school.student.read'));
    assert.equal(await page.locator('#workspaceNav [data-branch="school"]').count(), 0);
    await admin.query('update iam.role_permission_grants set is_active=false where id=$1', [ids.deny]);
    await page.locator('#refreshNativeAccess').click();
    await page.waitForFunction(() => Array.isArray(currentSession?.deniedRules) && currentSession.deniedRules.length === 0);
    assert.equal(await page.evaluate(() => SchoolSafeAccess.canAccess(currentSession, 'school.student.read')), true);
    await page.reload();
    await page.waitForFunction(() => currentSession?.native && Array.isArray(currentSession.deniedRules));
    assert.equal(await page.evaluate(() => currentSession.deniedRules.length), 0);
    await page.evaluate(() => schoolSafeShow('workspace')); // Restoration does not navigate from the entry screen.
    console.log('PASS HTTP/UI refresh, condition true/false, stale-screen bypass refused, general DENY, revocation, reload');
    await page.locator('#permissionsNav').click();
    await page.locator('#refreshNativeAccess').waitFor();
    for (const source of ['role', 'exception']) for (const scopeType of ['school', 'none']) for (const target of [null, school]) {
      const origin = await setGeneralDeny(source, scopeType, target);
      assert.equal((await context.request.get('http://127.0.0.1:8787/native/students/' + ids.allowedChild)).status(), 403);
      const response = await context.request.get('http://127.0.0.1:8787/native/session/bootstrap');
      assert.equal(response.status(), 200); const projected = (await response.json()).data;
      assert.equal(visible(projected), false);
      await page.locator('#refreshNativeAccess').click();
      await page.waitForFunction(({ origin, scopeType, target }) => currentSession?.deniedRules?.some(r => r.originId === origin && r.scopeType === scopeType && r.target === target), { origin, scopeType, target });
      assert.deepEqual(await page.evaluate(() => currentSession.deniedRules), projected.deniedRules);
      assert.equal(await page.evaluate(() => SchoolSafeAccess.canAccess(currentSession, 'school.student.read')), false);
      assert.equal(await page.locator('#workspaceNav [data-branch="school"]').count(), 0);
      // Revoke this restriction and refresh before the next matrix entry.
      const table = source === 'role' ? 'iam.role_permission_grants' : 'iam.profile_permission_exceptions';
      await admin.query(`update ${table} set is_active=false where id=$1`, [origin]);
      await page.locator('#refreshNativeAccess').click();
      await page.waitForFunction(() => currentSession?.deniedRules?.length === 0 && SchoolSafeAccess.canAccess(currentSession, 'school.student.read'));
      assert.ok(await page.locator('#workspaceNav [data-branch="school"]').count());
      assert.equal((await context.request.get('http://127.0.0.1:8787/native/students/' + ids.allowedChild)).status(), 200);
      console.log(`PASS HTTP/UI ${source} ${scopeType} general DENY target=${target}; revocation restores ALLOW`);
    }
    // Deliberately substituted responses ONLY for old/invalid protocol cases.
    await admin.query("update iam.role_permission_grants set is_active=true where id=$1", [ids.deny]);
    await admin.query("update iam.grant_scopes set scope_code='own_children',target_id=null where grant_id=$1", [ids.deny]);
    const pattern = '**/native/session/bootstrap';
    await page.route(pattern, async route => {
      const response = await route.fetch(); const body = await response.json(); delete body.data.deniedRules;
      await route.fulfill({ response, json: body });
    });
    await page.locator('#refreshNativeAccess').click();
    await page.waitForFunction(() => currentSession && !Object.hasOwn(currentSession, 'deniedRules'));
    assert.equal(await page.evaluate(() => SchoolSafeAccess.canAccess(currentSession, 'school.student.read')), false);
    await page.unroute(pattern);
    await page.route(pattern, async route => {
      const response = await route.fetch(); const body = await response.json(); body.data.deniedRules = [null];
      await route.fulfill({ response, json: body });
    });
    await page.locator('#refreshNativeAccess').click();
    await page.waitForFunction(() => window.currentSession === null);
    assert.equal(await page.locator('#accessConsole').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('PASS UI old response remains conservative; invalid response closes session (response substitution explicitly limited to these two cases)');
    await context.close();
  }
} finally {
  await admin.query('rollback').catch(() => {});
  if (browser) await browser.close();
  if (app) await app.close();
  if (ownsFixture) {
    // Only the two schools inserted after the empty-database guard, in this test DB.
    await admin.query('begin');
    for (const table of ['auth.sessions', 'auth.credentials', 'auth.recovery_requests']) {
      await admin.query(`delete from ${table} where identity_id in (select id from auth.identities where user_id=$1)`, [user]);
    }
    await admin.query('delete from auth.identities where user_id=$1', [user]);
    await admin.query('delete from app.schools where id=any($1::uuid[])', [[school, foreignSchool]]);
    await admin.query('delete from iam.users where id=any($1::uuid[])', [[user, 'a1000000-0000-4000-8000-000000000002']]);
    await admin.query("delete from auth.login_attempts where login='a51@example.invalid'");
    await admin.query('commit');
  }
  await admin.end();
}
