// Real, rollback-only regression: current session metadata versus Access Law.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
const url=new URL(process.env.SCHOOLSAFE_ACCESS_TEST_URL || 'about:blank');
assert.equal(url.protocol,'postgresql:'); assert.equal(url.search,'');
assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
assert.match(url.pathname,/^\/schoolsafe_access_test(?:_\d+)?$/); assert.equal(url.username,'schoolsafe_bootstrap');
const client=new pg.Client({connectionString:url.toString()}); await client.connect();
const school='b0000000-0000-4000-8000-000000000001', profile='b2000000-0000-4000-8000-000000000001', admin='b3000000-0000-4000-8000-000000000001', deny='b3000000-0000-4000-8000-000000000005';
const failures=[]; let passed=0;
async function asApi(){await client.query('set local role schoolsafe_api');}
async function snapshot(){return (await client.query("select api.session_bootstrap() data,api.check_access('staff.read') allowed")).rows[0];}
async function scenario(label,change,allowed,extra=()=>{}) {
  await client.query('savepoint session_case'); await client.query('reset role');
  try {
    await change(); await asApi(); const {data,allowed:actual}=await snapshot();
    assert.equal(actual,allowed,`${label}: actual Access Law`);
    const claims=data.permissions.includes('staff.read') || data.permissionExceptions.some(e=>e.permission==='staff.read' && e.effect==='allow');
    assert.equal(claims && !data.deniedPermissions.includes('staff.read'),allowed,`${label}: current session`);
    if(!allowed) assert.ok(!data.scopes.some(s=>s.permission==='staff.read'),`${label}: expired scopes hidden`);
    await extra(data); passed++;
  } catch(error) {failures.push(error.message);}
  finally {await client.query('rollback to session_case');}
}
try {
  const fixtures=await readFile(new URL('../database/access/v1/tests/role-assignments.test.sql',import.meta.url),'utf8');
  await client.query(fixtures.split('-- END FIXTURES')[0].replace(/^\\.*$/gm,''));
  await client.query('select api.set_request_context($1,$2,$3,$4)',['b1000000-0000-4000-8000-000000000001',profile,school,'b6000000-0000-4000-8000-000000000005']);
  const grant=(await client.query("select id from iam.role_permission_grants where role_id=$1 and permission_id=(select id from iam.permissions where code='staff.read')",[admin])).rows[0].id;
  await asApi();
  await scenario('active permission',async()=>{},true);
  await scenario('disabled role',()=>client.query('update iam.roles set is_active=false where id=$1',[admin]),false,d=>assert.ok(!d.roles.includes('admin')));
  for(const patch of ["is_active=false","starts_at=now()+interval '1 day'","starts_at=now()-interval '2 days',ends_at=now()-interval '1 day'"]) {
    await scenario(`assignment ${patch}`,()=>client.query(`update iam.profile_roles set ${patch} where profile_id=$1`,[profile]),false,d=>assert.ok(!d.roles.includes('admin')));
    await scenario(`grant ${patch}`,()=>client.query(`update iam.role_permission_grants set ${patch} where id=$1`,[grant]),false);
    await scenario(`scope ${patch}`,()=>client.query(`update iam.grant_scopes set ${patch} where grant_id=$1`,[grant]),false);
  }
  await scenario('disabled permission',()=>client.query("update iam.permissions set is_active=false where code='staff.read'"),false);
  await client.query('reset role');
  await client.query('insert into iam.profile_roles(school_id,profile_id,role_id) values($1,$2,$3)',[school,profile,deny]);
  await asApi();
  await scenario('current role DENY',async()=>{},false);
  for(const patch of ["is_active=false","starts_at=now()+interval '1 day'","starts_at=now()-interval '2 days',ends_at=now()-interval '1 day'"]) {
    await scenario(`DENY assignment ${patch}`,()=>client.query(`update iam.profile_roles set ${patch} where profile_id=$1 and role_id=$2`,[profile,deny]),true);
    await scenario(`DENY grant ${patch}`,()=>client.query(`update iam.role_permission_grants set ${patch} where role_id=$1`,[deny]),true);
    await scenario(`DENY scope ${patch}`,()=>client.query(`update iam.grant_scopes set ${patch} where grant_id in (select id from iam.role_permission_grants where role_id=$1)`,[deny]),true);
  }
  await scenario('inactive DENY role',()=>client.query('update iam.roles set is_active=false where id=$1',[deny]),true);
  await client.query('reset role');
  await client.query('update iam.profile_roles set is_active=false where role_id=$1',[deny]);
  const exception=(await client.query("insert into iam.profile_permission_exceptions(school_id,profile_id,permission_id,effect,reason,granted_by) select $1,$2,id,'deny','Synthetic session restriction',$2 from iam.permissions where code='staff.read' returning id",[school,profile])).rows[0].id;
  await client.query("insert into iam.exception_scopes(school_id,exception_id,scope_code) values($1,$2,'school')",[school,exception]); await asApi();
  await scenario('current exception DENY',async()=>{},false);
  for(const [table,selector,endColumn] of [['iam.profile_permission_exceptions','id','expires_at'],['iam.exception_scopes','exception_id','ends_at']]) {
    for(const patch of ['is_active=false',"starts_at=now()+interval '1 day'",`starts_at=now()-interval '2 days',${endColumn}=now()-interval '1 day'`]) {
      await scenario(`${table} ${patch}`,()=>client.query(`update ${table} set ${patch} where ${selector}=$1`,[exception]),true,d=>assert.equal(d.permissionExceptions.length,0));
    }
  }
  await client.query('reset role');
  await client.query("update iam.profile_permission_exceptions set effect='allow' where id=$1",[exception]);
  await client.query('update iam.profile_roles set is_active=false where profile_id=$1',[profile]); await asApi();
  await scenario('exception alone ALLOW',async()=>{},true);
  await scenario('future ALLOW exception',()=>client.query("update iam.profile_permission_exceptions set starts_at=now()+interval '1 day' where id=$1",[exception]),false,d=>assert.equal(d.permissionExceptions.length,0));

  // Links are metadata, not a grant. They must still exclude expired assignments
  // and children that Access Law no longer recognises as operational.
  await client.query('reset role');
  const year=(await client.query("insert into app.academic_years(school_id,label,starts_on,ends_on,periods) values($1,'Synthetic',current_date-30,current_date+365,'Trimestres') returning id",[school])).rows[0].id;
  const cls=(await client.query("insert into app.classes(school_id,academic_year_id,cycle_key,name) values($1,$2,'primary','Synthetic class') returning id",[school,year])).rows[0].id;
  const subject=(await client.query("insert into app.subjects(school_id,academic_year_id,code,name) values($1,$2,'SYNTH','Synthetic subject') returning id",[school,year])).rows[0].id;
  const assignment=(await client.query('insert into app.teacher_assignments(school_id,academic_year_id,class_id,subject_id,teacher_profile_id) values($1,$2,$3,$4,$5) returning id',[school,year,cls,subject,profile])).rows[0].id;
  const child=(await client.query("insert into app.students(school_id,class_id,matricule,first_name,last_name,lifecycle_status) values($1,$2,'A5-SYNTH','Synthetic','Child','active') returning id",[school,cls])).rows[0].id;
  await client.query("insert into app.student_guardians(school_id,student_id,profile_id,guardian_type,full_name) values($1,$2,$3,'tuteur','Synthetic guardian')",[school,child,profile]); await asApi();
  await scenario('current links',async()=>{},true,d=>{assert.deepEqual(d.assignedClassIds,[cls]);assert.deepEqual(d.assignedSubjectIds,[subject]);assert.deepEqual(d.childIds,[child]);});
  for(const patch of ['is_active=false',"starts_on=current_date+1","starts_on=current_date-2,ends_on=current_date-1"]){
    await scenario(`teacher link ${patch}`,()=>client.query(`update app.teacher_assignments set ${patch} where id=$1`,[assignment]),true,d=>{assert.deepEqual(d.assignedClassIds,[]);assert.deepEqual(d.assignedSubjectIds,[]);});
  }
  await scenario('draft child',()=>client.query("update app.students set lifecycle_status='draft',class_id=null where id=$1",[child]),true,d=>assert.deepEqual(d.childIds,[]));
  await scenario('inactive parent link',()=>client.query('update app.student_guardians set is_active=false where profile_id=$1',[profile]),true,d=>assert.deepEqual(d.childIds,[]));
  await client.query('reset role');
  await client.query('update iam.profile_roles set is_active=true where profile_id=$1 and role_id=$2',[profile,admin]);
  const portal=(await client.query("insert into app.security_portals(school_id,code,label) values($1,'SYNTH-A5','Synthetic portal') returning id",[school])).rows[0].id;
  const scanGrant=(await client.query("select id from iam.role_permission_grants where role_id=$1 and permission_id=(select id from iam.permissions where code='security.scan')",[admin])).rows[0].id;
  const portalScope=(await client.query("insert into iam.grant_scopes(school_id,grant_id,scope_code,target_id) values($1,$2,'assigned_portal',$3) returning id",[school,scanGrant,portal])).rows[0].id;
  await asApi();
  await scenario('current portal',async()=>{},true,d=>assert.deepEqual(d.assignedPortalIds,[portal]));
  for(const patch of ['is_active=false',"starts_at=now()+interval '1 day'","starts_at=now()-interval '2 days',ends_at=now()-interval '1 day'"]) {
    await scenario(`portal scope ${patch}`,()=>client.query(`update iam.grant_scopes set ${patch} where id=$1`,[portalScope]),true,d=>assert.deepEqual(d.assignedPortalIds,[]));
    await scenario(`portal grant ${patch}`,()=>client.query(`update iam.role_permission_grants set ${patch} where id=$1`,[scanGrant]),true,d=>assert.deepEqual(d.assignedPortalIds,[]));
  }
  await scenario('portal disabled',()=>client.query('update app.security_portals set is_active=false where id=$1',[portal]),true,d=>assert.deepEqual(d.assignedPortalIds,[]));
  await scenario('portal only on inactive role',()=>client.query('update iam.roles set is_active=false where id=$1',[admin]),true,d=>assert.deepEqual(d.assignedPortalIds,[]));
  assert.deepEqual(failures,[],`Session validity failures (${passed} scenarios passed)`);
  console.log(`PASS ${passed} real session validity scenarios: Access Law agrees for role/grant/scope/exception dates, DENY, parent and teacher links`);
} finally {await client.query('rollback');await client.end();}
