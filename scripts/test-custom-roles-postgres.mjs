// Actual PostgreSQL/Access Law; synthetic rollback-only A4 acceptance.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const url = new URL(process.env.SCHOOLSAFE_ACCESS_TEST_URL || 'about:blank');
assert.equal(url.protocol, 'postgresql:'); assert.equal(url.search, '');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.match(url.pathname, /^\/schoolsafe_access_test(?:_\d+)?$/);
assert.equal(url.username, 'schoolsafe_bootstrap');
const client = new pg.Client({ connectionString: url.toString() }); await client.connect();
const school = 'b0000000-0000-4000-8000-000000000001';
const pid = n => `b2000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const rid = n => `b3000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function actor(n) { await client.query('select api.set_request_context($1,$2,$3,$4)', [`b1000000-0000-4000-8000-${String(n).padStart(12, '0')}`,pid(n),school,randomUUID()]); }
async function editor(id = null) { return (await client.query('select api.access_role_editor($1) data',[id])).rows[0].data; }
async function create(label, template = null) { const v=(await editor()).revision; return (await client.query('select api.access_role_create($1,$2,$3,$4,true) data',[label,template,v,'Synthetic A4 creation'])).rows[0].data.roleId; }
async function save(id,grants,label='Poste test',active=true,revision=null) { return client.query('select api.access_role_save($1,$2,$3,$4,$5,$6,true)',[id,label,active,JSON.stringify(grants),revision || (await editor()).revision,'Synthetic A4 composition']); }
async function assign(profile,role,action='assign') { return client.query('select api.access_role_assign($1,$2,$3,$4,$5,true)',[pid(profile),role,action,(await editor()).revision,'Synthetic A4 assignment']); }
async function denied(code,fn) {
  await client.query('savepoint expected_refusal');
  let error; try { await fn(); } catch (e) { error=e; }
  await client.query('rollback to expected_refusal');
  assert.equal(error?.code,code,`Expected refusal ${code}, got ${error?.message || 'success'}`);
}
try {
  const sql = await readFile(new URL('../database/access/v1/tests/role-assignments.test.sql',import.meta.url),'utf8');
  await client.query(sql.split('-- END FIXTURES')[0].replace(/^\\.*$/gm,''));
  await client.query('set local role schoolsafe_api');
  await denied('42501',()=>editor());
  await actor(1);
  const catalogue=await editor();
  assert.ok(catalogue.catalog.length>50);
  assert.ok(!catalogue.catalog.some(p=>p.code==='cards.print.manage'));
  assert.equal(await editor(rid(6)),null);
  assert.equal((await editor(rid(1))).detail.editable,false,'canonical school role protected');
  await denied('42501',()=>save(rid(1),[]));
  await denied('P0002',()=>save(rid(6),[]));
  const custom=await create('Consultation RH');
  await save(custom,[{permission:'staff.read',effect:'allow',scope:'school'}]);
  await assign(2,custom);
  const read=await editor(custom);
  assert.equal(read.detail.memberCount,1);
  assert.equal(read.detail.members[0].id,pid(2));
  await actor(2);
  assert.equal((await client.query("select api.check_access('staff.read') allowed")).rows[0].allowed,true);
  await denied('42501',()=>editor(custom));
  await actor(1);
  await denied('42501',()=>save(custom,[{permission:'cards.print.manage',effect:'allow',scope:'school'}]));
  await denied('42501',()=>save(custom,[{permission:'invented.permission',effect:'allow',scope:'school'}]));
  await denied('22023',()=>save(custom,[{permission:'staff.read',effect:'allow'},{permission:'staff.read',effect:'deny'}]));
  await denied('22023',()=>save(custom,[{permission:'staff.read',effect:'allow',scope:'school'}])); // existing scope cannot silently change
  await denied('40001',()=>save(custom,[],'Stale',true,'999999'));
  // The explicit audit event is written after composition. Its failure must
  // roll back the already-updated role, grants and school revision together.
  await client.query('savepoint audit_storage_failure');
  await client.query('reset role');
  await client.query("create function pg_temp.reject_custom_audit() returns trigger language plpgsql as $$ begin raise exception 'synthetic audit unavailable' using errcode='XX000'; end $$");
  await client.query("create trigger a4_test_audit_failure before insert on audit.events for each row when (new.event_type in ('access.role.created','access.role.composed')) execute function pg_temp.reject_custom_audit()");
  await client.query('set local role schoolsafe_api');
  const beforeFailure=await editor(custom);
  await denied('XX000',()=>save(custom,[],'Ne doit pas persister',false));
  assert.deepEqual(await editor(custom),beforeFailure,'failed audit preserves role, grants and revision');
  const roleCount=(await client.query("select api.access_roles_list('',100,0) data")).rows[0].data.total;
  await denied('XX000',()=>create('Création annulée'));
  assert.equal((await client.query("select api.access_roles_list('',100,0) data")).rows[0].data.total,roleCount);
  await client.query('rollback to audit_storage_failure');
  await save(custom,[{permission:'staff.read',effect:'allow'}],'Renommé',false);
  await actor(2);
  assert.equal((await client.query("select api.check_access('staff.read') allowed")).rows[0].allowed,false);
  await actor(1);
  await save(custom,[{permission:'staff.read',effect:'allow'}],'Renommé',true);
  const denyRole=await create('Restriction RH');
  await save(denyRole,[{permission:'staff.read',effect:'deny',scope:'school'}]); await assign(2,denyRole);
  await actor(2);
  assert.equal((await client.query("select api.check_access('staff.read') allowed")).rows[0].allowed,false,'DENY wins across two roles');
  await actor(1);
  await save(denyRole,[]);
  await actor(2);
  assert.equal((await client.query("select api.check_access('staff.read') allowed")).rows[0].allowed,true);
  await actor(1);
  const cashier=await create('Caisse adaptée',catalogue.templates.find(t=>t.code==='cashier').id);
  const before=(await editor(cashier)).detail.grants;
  await save(cashier,before.map(g=>({permission:g.permission,effect:g.effect})),'Nouveau nom caisse');
  assert.deepEqual((await editor(cashier)).detail.grants,before,'scope/condition/validity preserved by rename');
  assert.ok(before.find(g=>g.permission==='finance.payment.cancel').conditions.includes('within_cancellation_window'));
  await assign(3,rid(3));
  await actor(3);
  assert.ok((await editor()).catalog.every(p=>p.code==='roles.manage'));
  await denied('42501',()=>create('Escalade',catalogue.templates.find(t=>t.code==='admin').id));
  await denied('42501',()=>save(custom,[]));
  await actor(1);
  await client.query('savepoint last_admin');
  const last=await create('Administration personnalisée',catalogue.templates.find(t=>t.code==='admin').id);
  await assign(1,last); await assign(1,rid(1),'revoke');
  // Remove the temporary limited backup: only our custom admin remains.
  await assign(3,rid(3),'revoke');
  await denied('P0001',()=>save(last,[],'Dernier administrateur',false));
  await client.query('rollback to last_admin');
  await client.query('reset role');
  assert.ok((await client.query("select count(*)::int n from audit.events where event_type='access.role.composed' and payload->>'reason'='Synthetic A4 composition' and actor_profile_id=$1",[pid(1)])).rows[0].n>=5);
  assert.equal((await client.query('select count(*)::int n from iam.role_permission_grants where role_id=$1',[denyRole])).rows[0].n,1,'removed grant history retained');
  console.log('PASS A4 real PostgreSQL: create/copy/compose/rename/disable/reactivate, preserved scopes/conditions, effective access, DENY, isolation, delegation, last admin, audit');
} finally { await client.query('rollback'); await client.end(); }
