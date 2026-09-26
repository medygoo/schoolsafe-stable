import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {installSchoolDatabase} from './install-school-db.mjs';
import {loadInstallationPlan,repositoryRoot} from './installation-plan.mjs';
import {renderAdditiveUpgrade} from './render-additive-upgrade.mjs';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {tsImport} from 'tsx/esm/api';
import {hash as argonHash,verify as argonVerify} from '@node-rs/argon2';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {validateTarget} from './install-school-db.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');

export async function qualifyInstallation({connectionString,passwords,log=console.log}){
 const target=new URL(connectionString);const database=decodeURIComponent(target.pathname.slice(1));
 assert.match(database,/^schoolsafe_test_[a-z0-9_]+$/,'Synthetic test database required');
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname),'Local synthetic test cluster required');
 validateTarget(connectionString,database);
 const clients=[];let phase='connect';let passed=0;
 async function connect(role){const url=new URL(connectionString);if(role){url.username='schoolsafe_'+role;url.password=passwords[role];}
  const c=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:5000});clients.push(c);await c.connect();return c;}
 async function check(name,fn){phase=name;await fn();passed++;log('PASS '+name);}
 async function context(client,actor,fn){await client.query('begin');try{
  await client.query('select api.set_request_context($1,$2,$3,$4)',[actor.user_id,actor.profile_id,actor.school_id,randomUUID()]);
  const result=await fn(client);await client.query('commit');return result;
 }catch(error){await client.query('rollback');throw error;}}
 const denied=promise=>assert.rejects(promise,error=>['42501','23503','23514'].includes(error.code));
 try{
  const admin=await connect();const auth=await connect('auth');const api=await connect('api');const migrator=await connect('migrator');
  await check('ledger belongs to owner and migrator must explicitly assume owner',async()=>{
   assert.equal((await admin.query("select pg_get_userbyid(relowner) owner from pg_class where oid='ops.installation_units'::regclass")).rows[0].owner,'schoolsafe_owner');
   for(const role of ['schoolsafe_migrator','schoolsafe_api','schoolsafe_auth','schoolsafe_worker'])
    assert.equal((await admin.query("select has_table_privilege($1,'ops.installation_units','SELECT,INSERT,UPDATE,DELETE') allowed",[role])).rows[0].allowed,false);
   await denied(migrator.query('select count(*) from ops.installation_units'));
   await migrator.query('begin');
   try {await migrator.query('set local role schoolsafe_owner');assert.equal((await migrator.query('select count(*)::int n from ops.installation_units')).rows[0].n,loadInstallationPlan().units.length);}
   finally {await migrator.query('rollback');}
  });
  await qualifyAdditiveUpgrade({admin,connectionString,passwords,check});
  await qualifyInstalled62Upgrade({admin,connectionString,passwords,check});
  await check('migrator cannot read setup authorizations directly',async()=>{
   const privileges=(await admin.query("select has_table_privilege('schoolsafe_migrator','auth.setup_authorizations','SELECT') direct_select, has_schema_privilege('schoolsafe_migrator','auth','USAGE') auth_usage")).rows[0];
   assert.equal(privileges.direct_select,false);assert.equal(privileges.auth_usage,false);
   await denied(migrator.query('select school_id from auth.setup_authorizations'));
  });
  await check('migrator resolves only an existing valid setup authorization',async()=>{
   const capability=digest(randomBytes(32));
   await migrator.query('select ops.authorize_school_setup($1,$2)',[capability,3600]);
   const expected=(await admin.query('select school_id from auth.setup_authorizations where token_hash=$1',[capability])).rows[0].school_id;
   const resolved=(await migrator.query('select ops.resolve_school_setup_authorization($1) school_id',[capability])).rows[0].school_id;
   assert.equal(resolved,expected);
  });
  await check('setup resolver is owner-controlled and executable only by migrator',async()=>{
   const metadata=(await admin.query("select pg_get_userbyid(proowner) owner,prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where oid='ops.resolve_school_setup_authorization(text)'::regprocedure")).rows[0];
   assert.equal(metadata.owner,'schoolsafe_owner');assert.equal(metadata.prosecdef,true);
   assert.deepEqual(metadata.proconfig,['search_path=pg_catalog']);assert.equal(metadata.result,'uuid');
   for(const role of ['schoolsafe_migrator','schoolsafe_api','schoolsafe_auth','schoolsafe_worker','schoolsafe_auditor']) {
    const allowed=(await admin.query("select has_function_privilege($1,'ops.resolve_school_setup_authorization(text)','EXECUTE') allowed",[role])).rows[0].allowed;
    assert.equal(allowed,role==='schoolsafe_migrator');
   }
   const publicGrant=(await admin.query("select exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid='ops.resolve_school_setup_authorization(text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') allowed")).rows[0].allowed;
   assert.equal(publicGrant,false);
   await denied(auth.query('select ops.resolve_school_setup_authorization($1)',[digest(randomBytes(32))]));
   await denied(api.query('select ops.resolve_school_setup_authorization($1)',[digest(randomBytes(32))]));
  });
  await check('unknown and malformed setup hashes fail closed without issuing authorization',async()=>{
   const before=(await admin.query('select count(*)::int n from auth.setup_authorizations')).rows[0].n;
   for(const capability of [digest(randomBytes(32)),null,'','not-a-hash','A'.repeat(64)]) {
    assert.equal((await migrator.query('select ops.resolve_school_setup_authorization($1) school_id',[capability])).rows[0].school_id,null);
   }
   assert.equal((await admin.query('select count(*)::int n from auth.setup_authorizations')).rows[0].n,before);
  });
  await check('expired setup authorization fails closed and is not renewed',async()=>{
   const capability=digest(randomBytes(32));
   await migrator.query('select ops.authorize_school_setup($1,$2)',[capability,60]);
   await admin.query("update auth.setup_authorizations set expires_at=clock_timestamp()-interval '1 second' where token_hash=$1",[capability]);
   const before=(await admin.query('select * from auth.setup_authorizations where token_hash=$1',[capability])).rows[0];
   assert.equal((await migrator.query('select ops.resolve_school_setup_authorization($1) school_id',[capability])).rows[0].school_id,null);
   assert.deepEqual((await admin.query('select * from auth.setup_authorizations where token_hash=$1',[capability])).rows[0],before);
  });
  const hash=await argonHash(randomBytes(32).toString('hex'),{memoryCost:19456,timeCost:2,parallelism:1});
  await qualifySetupResolverBinding({admin,auth,migrator,check,denied,hash});
  const schools=[];
  for(const label of ['A','B']){
   const tokenHash=digest(randomBytes(32));const email=`installation-${randomUUID()}@example.test`;
   const payload={identity:{name_fr:'Synthetic School '+label},cycles:['primary'],
    academic_year:{label:'2026-2027',starts_on:'2026-09-01',ends_on:'2027-07-31',periods:'Trimestres'},contact:{},brand:{}};
   await check('offline capability '+label,async()=>{await migrator.query('select ops.authorize_school_setup($1,$2)',[tokenHash,3600]);});
   await check('API cannot provision '+label,async()=>{await denied(api.query('select api.setup_stage_school($1,$2::jsonb)',[tokenHash,JSON.stringify(payload)]));});
   let staged;await check('stage school '+label,async()=>{
    staged=(await auth.query('select api.setup_stage_school($1,$2::jsonb) r',[tokenHash,JSON.stringify(payload)])).rows[0].r;
    assert.ok(staged.school_id&&staged.academic_year_id);
    assert.equal((await migrator.query('select ops.resolve_school_setup_authorization($1) school_id',[tokenHash])).rows[0].school_id,staged.school_id);
   });
   await check('staging creates no partial school '+label,async()=>{
    assert.equal((await admin.query('select count(*)::int n from app.schools where id=$1',[staged.school_id])).rows[0].n,0);
   });
   let created;await check('atomic school and admin '+label,async()=>{
    created=(await auth.query('select api.setup_complete_school($1,$2,$3,$4,$5,$6) r',[tokenHash,email,hash,'Synthetic','Admin '+label,null])).rows[0].r;
    assert.ok(created.user_id&&created.profile_id);
    assert.equal((await admin.query('select school_id from iam.profiles where id=$1',[created.profile_id])).rows[0].school_id,staged.school_id);
    assert.equal((await admin.query('select id from app.schools where id=$1',[staged.school_id])).rows[0].id,staged.school_id);
   });
   await check('consumed setup authorization fails closed '+label,async()=>{
    assert.equal((await migrator.query('select ops.resolve_school_setup_authorization($1) school_id',[tokenHash])).rows[0].school_id,null);
    assert.ok((await admin.query('select consumed_at from auth.setup_authorizations where token_hash=$1',[tokenHash])).rows[0].consumed_at);
   });
   const school={...staged,...created,email,tokenHash};schools.push(school);
   await check('setup token consumed '+label,()=>denied(auth.query('select api.setup_complete_school($1,$2,$3,$4,$5,$6)',[tokenHash,email,hash,'Synthetic','Again',null])));
   await check('school-scoped canonical admin '+label,async()=>{
    const r=(await admin.query(`select pr.school_id,r.school_id role_school,r.code from iam.profile_roles pr
      join iam.roles r on r.id=pr.role_id where pr.profile_id=$1`,[created.profile_id])).rows;
    assert.equal(r.length,1);assert.equal(r[0].school_id,staged.school_id);assert.equal(r[0].role_school,staged.school_id);assert.equal(r[0].code,'admin');
   });
  }
  const [a,b]=schools;
  await check('active identity resolves and preauth remains transaction-local',async()=>{
   const setting=async()=> (await auth.query("select coalesce(current_setting('schoolsafe.preauth',true),'') value")).rows[0].value;
   const before=await setting();assert.notEqual(before,'on');
   await auth.query('begin');
   try {
    const identities=(await auth.query('select * from api.auth_resolve_identity($1)',[a.email])).rows;
    assert.equal(identities.length,1);assert.equal(identities[0].user_id,a.user_id);
    assert.equal(identities[0].status,'active');assert.equal(await setting(),'on');
   } finally {await auth.query('rollback');}
   assert.equal(await setting(),before);
   await auth.query('begin');
   try {
    assert.equal((await auth.query('select * from api.auth_resolve_identity($1)',[a.email])).rowCount,1);
    await auth.query('commit');
   } catch(error) {await auth.query('rollback');throw error;}
   assert.equal(await setting(),before);
  });
  await check('pending school denies identity and session despite active user and profile',async()=>{
   const identity=(await admin.query('select id from auth.identities where user_id=$1',[b.user_id])).rows[0];
   const before=(await admin.query('select count(*)::int n from auth.sessions where identity_id=$1',[identity.id])).rows[0].n;
   assert.equal((await admin.query('select is_active from iam.users where id=$1',[b.user_id])).rows[0].is_active,true);
   assert.equal((await admin.query('select is_active from iam.profiles where id=$1',[b.profile_id])).rows[0].is_active,true);
   await admin.query('update app.schools set is_active=false where id=$1',[b.school_id]);
   try {
    assert.equal((await auth.query('select * from api.auth_resolve_identity($1)',[b.email])).rowCount,0);
    assert.equal((await auth.query('select * from api.auth_list_profiles($1)',[identity.id])).rowCount,0);
    await assert.rejects(auth.query('select * from api.auth_create_session($1,$2,$3,$4,$5,$6)',
     [identity.id,b.profile_id,digest(randomBytes(32)),3600,null,null]),e=>e.code==='42501'&&e.message==='School is not active');
    assert.equal((await admin.query('select count(*)::int n from auth.sessions where identity_id=$1',[identity.id])).rows[0].n,before);
   } finally {await admin.query('update app.schools set is_active=true where id=$1',[b.school_id]);}
   assert.equal((await auth.query('select * from api.auth_resolve_identity($1)',[b.email])).rowCount,1);
  });
  await check('invalid setup token rejected',()=>denied(auth.query('select api.setup_stage_school($1,$2)',[digest(randomBytes(32)),{}])));
  await check('runtime roles cannot issue capabilities',()=>denied(auth.query('select ops.authorize_school_setup($1,$2)',[digest(randomBytes(32)),3600])));
  await check('cross-school context rejected',()=>context(api,{...a,school_id:b.school_id},async()=>{}).then(()=>assert.fail('Forged context accepted'),e=>assert.equal(e.code,'42501')));
  await check('API direct tables refused',async()=>{
   for(const table of ['app.students','iam.profiles','auth.credentials','devicehub.devices'])await denied(api.query('select * from '+table));
  });
  for(const school of schools){
   school.class_id=randomUUID();
   await admin.query("insert into app.classes(id,school_id,academic_year_id,cycle_key,name) values($1,$2,$3,'primary','Synthetic class')",[school.class_id,school.school_id,school.academic_year_id]);
   await check('student draft '+school.school_id,async()=>{
    school.student_id=await context(api,school,async c=>(await c.query('select api.student_create_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id',
      [school.school_id,'SYN-'+randomUUID(),'Synthetic',null,'Student',null,null,school.academic_year_id,school.class_id,'2026-09-20'])).rows[0].id);
    assert.equal((await admin.query('select status from app.student_enrollments where student_id=$1',[school.student_id])).rows[0].status,'draft');
   });
  }
  await check('student creation refuses foreign school',()=>denied(context(api,a,c=>c.query('select api.student_create_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
   [b.school_id,'INVALID','Synthetic',null,'Student',null,null,a.academic_year_id,a.class_id,'2026-09-20']))));
  await check('student creation refuses foreign class',()=>denied(context(api,a,c=>c.query('select api.student_create_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
   [a.school_id,'INVALID','Synthetic',null,'Student',null,null,b.academic_year_id,b.class_id,'2026-09-20']))));
  await check('student list isolates both schools',async()=>{
   for(const school of schools){const rows=await context(api,school,async c=>(await c.query('select api.student_list() r')).rows[0].r);
    assert.equal(rows.total,1);assert.equal(rows.rows[0].id,school.student_id);assert.equal(rows.rows[0].school_id,school.school_id);
    const page=await context(api,school,async c=>(await c.query('select api.student_list(null,null,null,10,99) r')).rows[0].r);
    assert.equal(page.total,1);assert.equal(page.rows.length,0);
   }
  });
  await check('student read refuses other school',()=>denied(context(api,a,c=>c.query('select api.student_read($1)',[b.student_id]))));
  await check('list fails without request context',()=>denied(api.query('select api.student_list()')));
  const identity=(await auth.query('select * from api.auth_resolve_identity($1)',[a.email])).rows[0];
  let sessionHash=digest(randomBytes(32));
  await check('session authenticates exact profile',async()=>{
   await auth.query('select * from api.auth_create_session($1,$2,$3,$4,$5,$6)',[identity.identity_id,a.profile_id,sessionHash,3600,null,null]);
   const session=(await auth.query('select * from api.auth_resolve_session($1)',[sessionHash])).rows[0];
   assert.equal(session.school_id,a.school_id);assert.equal(session.profile_id,a.profile_id);
  });
  await check('session rejects foreign identity profile',()=>denied(auth.query('select * from api.auth_create_session($1,$2,$3,$4,$5,$6)',[identity.identity_id,b.profile_id,digest(randomBytes(32)),3600,null,null])));
  await check('unknown recovery is empty',async()=>assert.equal((await auth.query('select * from api.auth_create_recovery_request($1,$2)',['missing@example.test',digest(randomBytes(32))])).rowCount,0));
  const oldToken=digest(randomBytes(32));const nextToken=digest(randomBytes(32));
  await check('atomic recovery replaces previous token',async()=>{
   await auth.query('select * from api.auth_create_recovery_request($1,$2)',[a.email,oldToken]);
   const result=(await auth.query('select * from api.auth_create_recovery_request($1,$2)',[a.email,nextToken])).rows[0];
   assert.ok(result.recovery_id);assert.equal(result.email,a.email);
   assert.equal((await auth.query('select api.auth_reset_password($1,$2) ok',[oldToken,hash])).rows[0].ok,false);
  });
  await check('reset consumes token and revokes sessions',async()=>{
   assert.equal((await auth.query('select api.auth_reset_password($1,$2) ok',[nextToken,hash])).rows[0].ok,true);
   assert.equal((await auth.query('select api.auth_reset_password($1,$2) ok',[nextToken,hash])).rows[0].ok,false);
   assert.equal((await auth.query('select * from api.auth_resolve_session($1)',[sessionHash])).rowCount,0);
  });
  await check('expired recovery is refused',async()=>{
   const token=digest(randomBytes(32));const request=(await auth.query('select * from api.auth_create_recovery_request($1,$2)',[b.email,token])).rows[0];
   await admin.query("update auth.recovery_requests set expires_at=now()-interval '1 minute' where id=$1",[request.recovery_id]);
   assert.equal((await auth.query('select api.auth_reset_password($1,$2) ok',[token,hash])).rows[0].ok,false);
  });
  for(const school of schools){
   await check('device and mapping '+school.school_id,async()=>{
    const registered=await context(api,school,async c=>(await c.query('select api.device_register($1,$2,$3,$4,$5,$6,$7) r',
      ['D-'+randomUUID(),'synthetic','test','SER-'+randomUUID(),null,'mock','bridge'])).rows[0].r);
    school.device_id=registered.device_id;
    const mapped=await context(api,school,async c=>(await c.query('select api.device_mapping_ensure($1,$2,$3,$4) r',[school.device_id,school.student_id,'student','Synthetic'])).rows[0].r);
    school.mapping_id=mapped.mapping_id;
    school.external_id=(await admin.query('select external_person_id from devicehub.device_subject_mappings where id=$1',[mapped.mapping_id])).rows[0].external_person_id;
   });
  }
  await check('device mapping refuses foreign device',()=>denied(context(api,a,c=>c.query('select api.device_mapping_ensure($1,$2,$3,$4)',[b.device_id,a.student_id,'student',null]))));
  await check('device mapping refuses foreign student',()=>denied(context(api,a,c=>c.query('select api.device_mapping_ensure($1,$2,$3,$4)',[a.device_id,b.student_id,'student',null]))));
  await check('device event isolated and idempotent',async()=>{
   const params=[a.device_id,'terminal','TEST-EVENT-'+randomUUID(),a.external_id,'card','check_in','2026-09-20T07:00:00Z',{}];
   const first=await context(api,a,async c=>(await c.query('select api.device_event_ingest($1,$2,$3,$4,$5,$6,$7,$8) r',params)).rows[0].r);
   const second=await context(api,a,async c=>(await c.query('select api.device_event_ingest($1,$2,$3,$4,$5,$6,$7,$8) r',params)).rows[0].r);
   assert.equal(first.event_id,second.event_id);assert.equal(second.duplicate,true);
   const rows=(await admin.query('select school_id,student_id from devicehub.event_processing where event_id=$1',[first.event_id])).rows;
   assert.equal(rows.length,1);assert.equal(rows[0].school_id,a.school_id);assert.equal(rows[0].student_id,a.student_id);
   assert.equal((await admin.query('select count(*)::int n from devicehub.device_events where school_id=$1',[b.school_id])).rows[0].n,0);
  });
  await check('device event rejects other school',()=>denied(context(api,b,c=>c.query('select api.device_event_ingest($1,$2,$3,$4,$5,$6,$7,$8)',
    [a.device_id,'terminal','FORGED',a.external_id,'card','check_in','2026-09-20T07:00:00Z',{}]))));
  await check('machine bindings require offline authorization',()=>denied(api.query('select ops.bind_machine_device($1,$2,$3,$4,$5)',['synthetic-instance',a.device_id,a.school_id,a.user_id,a.profile_id])));
  await check('machine device school is deterministic',async()=>{
   for(const school of schools){
    await migrator.query('select ops.bind_machine_device($1,$2,$3,$4,$5)',['synthetic-instance',school.device_id,school.school_id,school.user_id,school.profile_id]);
    const result=(await api.query('select api.machine_device_context($1,$2,$3) r',['synthetic-instance',school.device_id,randomUUID()])).rows[0].r;
    assert.equal(result.schoolId,school.school_id);assert.equal(result.profileId,school.profile_id);
   }
  });
  await check('unknown instance binding rejected',()=>denied(api.query('select api.machine_device_context($1,$2,$3)',['unknown-instance',a.device_id,randomUUID()])));
  await check('disabled device binding rejected',async()=>{
   await admin.query("update devicehub.devices set status='disabled' where id=$1",[a.device_id]);
   await denied(api.query('select api.machine_device_context($1,$2,$3)',['synthetic-instance',a.device_id,randomUUID()]));
  });
  await check('cross-school composite keys refused',()=>denied(admin.query("insert into devicehub.event_processing(event_id,school_id,status,processing_version) select id,$1,'pending',2 from devicehub.device_events where school_id=$2 limit 1",[b.school_id,a.school_id])));
  await check('concurrent reset has one winner',async()=>{
   const token=digest(randomBytes(32));await auth.query('select * from api.auth_create_recovery_request($1,$2)',[b.email,token]);
   const other=await connect('auth');const responses=await Promise.all([auth,other].map(c=>c.query('select api.auth_reset_password($1,$2) ok',[token,hash])));
   assert.equal(responses.filter(r=>r.rows[0].ok).length,1);
  });
  await check('no privileged runtime roles',async()=>{
   const rows=(await admin.query("select rolsuper,rolbypassrls from pg_roles where rolname in ('schoolsafe_api','schoolsafe_auth','schoolsafe_worker','schoolsafe_migrator')")).rows;
   assert.equal(rows.length,4);assert.ok(rows.every(r=>!r.rolsuper&&!r.rolbypassrls));
  });
  await qualifyRecovery({admin,auth,connect,check,denied,a,b,hash});
  await qualifySetupHttp({admin,auth,migrator,check});
  await qualifyRegistrationPending({admin,auth,check,denied});
  await qualifyRegistrationApproval({admin,auth,check,denied});
  await qualifyAccountRegistrationOnboarding({admin,auth,api,connect,check,denied,hash,context});
  log(`POSTGRES_QUALIFICATION PASS (${passed} scenarios)`);return {passed,schools};
 }catch(error){
  throw new Error(`POSTGRES_QUALIFICATION FAIL: ${phase}; ${error.code??'assertion'}`,{cause:error});
 }finally{await Promise.allSettled(clients.map(c=>c.end()));}
}
async function qualifyRecovery({admin,auth,connect,check,denied,a,b,hash}) {
 const phone='+243812345678';
 let previousPassword='Synthetic previous '+randomBytes(16).toString('hex');
 const previousHash=await argonHash(previousPassword);
 async function person(school,name,role,profilePhone=phone) {
  const user=randomUUID(),profile=randomUUID(),identity=randomUUID(),email=`recovery-${randomUUID()}@example.test`;
  await admin.query('insert into iam.users(id,email) values($1,$2)',[user,email]);
  await admin.query('insert into iam.profiles(id,user_id,school_id,display_name,phone) values($1,$2,$3,$4,$5)',[profile,user,school.school_id,name,profilePhone]);
  await admin.query('insert into auth.identities(id,user_id,email) values($1,$2,$3)',[identity,user,email]);
  await admin.query('insert into auth.credentials(identity_id,password_hash) values($1,$2)',[identity,previousHash]);
  let roleId=(await admin.query('select id from iam.roles where school_id=$1 and code=$2',[school.school_id,role])).rows[0]?.id;
  if(!roleId) {roleId=randomUUID();await admin.query('insert into iam.roles(id,school_id,code,label) values($1,$2,$3,$3)',[roleId,school.school_id,role]);}
  await admin.query('insert into iam.profile_roles(school_id,profile_id,role_id) values($1,$2,$3)',[school.school_id,profile,roleId]);
  return {user,profile,identity,email,roleId};
 }
 const parent=await person(a,'Synthetic Parent','parent');
 await admin.query("update app.students set lifecycle_status='active' where id=$1",[a.student_id]);
 await admin.query("update app.student_enrollments set status='active',starts_on=current_date-1,ends_on=null where student_id=$1",[a.student_id]);
 const guardian=randomUUID();
 await admin.query("insert into app.student_guardians(id,school_id,student_id,profile_id,guardian_type,full_name,phone) values($1,$2,$3,$4,'pere','Deliberately different guardian name','unrelated')",[guardian,a.school_id,a.student_id,parent.profile]);
 const key=digest('recovery-parent-v1\n'+phone);
 const valid=['Synthetic Parent',phone,'Synthetic Student','Synthetic class'];
 async function proof(fields=valid,token=digest(randomBytes(32)),bucket=key) {
  return (await auth.query('select api.auth_recover_parent_account($1,$2,$3,$4,$5,$6) ok',[...fields,token,bucket])).rows[0].ok;
 }
 async function clearFailures(){await admin.query('delete from auth.recovery_failure_buckets');}
 await check('Recovery auth has no table privileges even with forged GUC',async()=>{
  await auth.query("set schoolsafe.recovery_preauth='on'");
  for(const t of ['iam.profiles','iam.roles','iam.profile_roles','app.students','app.student_guardians','app.student_enrollments','app.classes','auth.recovery_requests','auth.recovery_failure_buckets']) {
   await denied(auth.query('select * from '+t));
   const r=(await admin.query('select relrowsecurity,relforcerowsecurity from pg_class where oid=$1::regclass',[t])).rows[0];
   assert.equal(r.relrowsecurity,true);assert.equal(r.relforcerowsecurity,true);
  }
  await auth.query('reset schoolsafe.recovery_preauth');
  await denied(auth.query('select auth.recovery_issue($1,$2)',[parent.identity,digest(randomBytes(32))]));
 });
 await check('Recovery Parent canonical profile phone and complete normalized name',async()=>{
  assert.equal(await proof(['  SYNTHETIC   parent  ','243812345678',' synthetic  STUDENT ',' SYNTHETIC class ']),true);
  assert.notEqual((await auth.query("select current_setting('schoolsafe.recovery_preauth',true) v")).rows[0].v,'on');
 });
 for(const index of [0,1,2,3]) await check('Recovery Parent rejects wrong fact '+index,async()=>{
  await clearFailures();const fields=[...valid];fields[index]=index===1?'+243899999999':'Wrong';
  const token=digest(randomBytes(32));assert.equal(await proof(fields,token),false);
  assert.equal((await admin.query('select count(*)::int n from auth.recovery_requests where token_hash=$1',[token])).rows[0].n,0);
 });
 const mutations=[
  ['guardian inactive','update app.student_guardians set is_active=false where id=$1','update app.student_guardians set is_active=true where id=$1',guardian],
  ['child archived',"update app.students set lifecycle_status='archived' where id=$1","update app.students set lifecycle_status='active' where id=$1",a.student_id],
  ['enrollment inactive',"update app.student_enrollments set status='completed' where student_id=$1","update app.student_enrollments set status='active' where student_id=$1",a.student_id],
  ['enrollment future','update app.student_enrollments set starts_on=current_date+1 where student_id=$1','update app.student_enrollments set starts_on=current_date-1 where student_id=$1',a.student_id],
  ['enrollment expired','update app.student_enrollments set ends_on=current_date-1 where student_id=$1','update app.student_enrollments set ends_on=null where student_id=$1',a.student_id],
  ['class inactive','update app.classes set is_active=false where id=$1','update app.classes set is_active=true where id=$1',a.class_id],
  ['parent role inactive','update iam.profile_roles set is_active=false where profile_id=$1','update iam.profile_roles set is_active=true where profile_id=$1',parent.profile],
  ['not a parent role',"update iam.roles set code='recovery_not_parent' where id=$1","update iam.roles set code='parent' where id=$1",parent.roleId],
  ['role disabled','update iam.roles set is_active=false where id=$1','update iam.roles set is_active=true where id=$1',parent.roleId],
  ['future role','update iam.profile_roles set starts_at=clock_timestamp()+interval \'1 day\' where profile_id=$1','update iam.profile_roles set starts_at=clock_timestamp()-interval \'1 day\' where profile_id=$1',parent.profile],
  ['profile inactive','update iam.profiles set is_active=false where id=$1','update iam.profiles set is_active=true where id=$1',parent.profile],
  ['identity inactive',"update auth.identities set status='disabled' where id=$1","update auth.identities set status='active' where id=$1",parent.identity],
 ];
 for(const [name,change,restore,id] of mutations) await check('Recovery Parent '+name,async()=>{
  await clearFailures();await admin.query(change,[id]);assert.equal(await proof(),false);await admin.query(restore,[id]);
 });
 await check('Recovery Parent ambiguity rejected',async()=>{
  const other=await person(a,'Synthetic Parent','parent');
  await admin.query("insert into app.student_guardians(school_id,student_id,profile_id,guardian_type,full_name) values($1,$2,$3,'autre','Synthetic')",[a.school_id,a.student_id,other.profile]);
  await clearFailures();assert.equal(await proof(),false);
  await admin.query('update iam.profiles set is_active=false where id=$1',[other.profile]);
 });
 await check('Recovery Parent five failures block proof but not login',async()=>{
  await clearFailures();for(let n=0;n<5;n++)assert.equal(await proof(['Wrong',...valid.slice(1)]),false);
  assert.equal(await proof(),false);
  assert.equal((await admin.query('select failures from auth.recovery_failure_buckets where attempt_key=$1',[key])).rows[0].failures,5);
  assert.equal((await auth.query('select * from api.auth_resolve_identity($1)',[parent.email])).rows[0].identity_id,parent.identity);
  await admin.query("update auth.recovery_failure_buckets set window_started_at=clock_timestamp()-interval '31 minutes' where attempt_key=$1",[key]);
  assert.equal(await proof(),true);
 });
 await check('Recovery Parent cross-school child rejected',async()=>{
  await clearFailures();await admin.query("update app.students set first_name='Foreign' where id=$1",[b.student_id]);
  assert.equal(await proof([valid[0],valid[1],'Foreign Student',valid[3]]),false);
 });
 const schoolName=(await admin.query('select name from app.schools where id=$1',[a.school_id])).rows[0].name;
 for(const role of ['admin','teacher','cashier','guard','hr','staff']) await check('Recovery autonomous active '+role,async()=>{
  const p=await person(a,'Synthetic '+role,role);
  assert.equal((await auth.query('select api.auth_recover_profile_account($1,$2,$3,$4,$5) ok',['Synthetic '+role,phone,schoolName,role,digest(randomBytes(32))])).rows[0].ok,true);
  assert.equal((await auth.query('select api.auth_recover_profile_account($1,$2,$3,$4,$5) ok',['Synthetic '+role,phone,'Wrong school',role,digest(randomBytes(32))])).rows[0].ok,false);
  assert.equal((await auth.query('select api.auth_recover_profile_account($1,$2,$3,$4,$5) ok',['Synthetic '+role,phone,schoolName,'wrong role',digest(randomBytes(32))])).rows[0].ok,false);
  await admin.query('update iam.profiles set is_active=false where id=$1',[p.profile]);
 });
 async function generate(actor=a.profile_id,target=parent.identity,code='0123456789') {
  return (await auth.query('select api.auth_admin_generate_recovery_code($1,$2,$3) result',[actor,target,digest(code)])).rows[0].result;
 }
 async function redeem(code='0123456789',token=digest(randomBytes(32)),client=auth) {
  return (await client.query('select api.auth_redeem_admin_recovery_code($1,$2,$3) ok',[parent.email,digest(code),token])).rows[0].ok;
 }
 await check('Recovery Admin resolver validates role school and self',async()=>{
  assert.equal((await auth.query('select api.auth_resolve_admin_recovery_target($1,$2) id',[a.profile_id,parent.profile])).rows[0].id,parent.identity);
  for(const [actor,target] of [[b.profile_id,parent.profile],[parent.profile,a.profile_id],[a.profile_id,a.profile_id]])
   assert.equal((await auth.query('select api.auth_resolve_admin_recovery_target($1,$2) id',[actor,target])).rows[0].id,null);
  const own=(await auth.query('select * from api.auth_resolve_identity($1)',[a.email])).rows[0].identity_id;
  assert.equal(await generate(a.profile_id,own),null);assert.equal(await generate(b.profile_id),null);assert.equal(await generate(parent.profile),null);
 });
 await check('Recovery Admin code TTL60 canonical author and single use',async()=>{
  assert.equal(await generate(),'CODE_GENERATED');
  const item=(await admin.query('select authorized_by_profile_id,extract(epoch from (expires_at-created_at)) ttl from auth.admin_recovery_codes where identity_id=$1 and used_at is null',[parent.identity])).rows[0];
  assert.equal(item.authorized_by_profile_id,a.profile_id);assert.ok(Math.abs(Number(item.ttl)-3600)<1);
  assert.equal(await redeem(),true);assert.equal(await redeem(),false);
 });
 for(const table of ['iam.profiles','iam.profile_roles']) await check('Recovery Admin requires active '+table,async()=>{
  const column=table==='iam.profiles'?'id':'profile_id';
  await admin.query('update '+table+' set is_active=false where '+column+'=$1',[a.profile_id]);
  assert.equal(await generate(),null);
  await admin.query('update '+table+' set is_active=true where '+column+'=$1',[a.profile_id]);
 });
 await check('Recovery Admin five wrong attempts lock code',async()=>{
  await generate();for(let n=0;n<5;n++)assert.equal(await redeem('9999999999'),false);
  assert.equal(await redeem(),false);
 });
 await check('Recovery Admin expired and replaced codes rejected',async()=>{
  await generate();await admin.query("update auth.admin_recovery_codes set expires_at=clock_timestamp()-interval '1 second' where identity_id=$1",[parent.identity]);
  assert.equal(await redeem(),false);await generate();await generate(a.profile_id,parent.identity,'0000000001');
  assert.equal(await redeem(),false);assert.equal(await redeem('0000000001'),true);
 });
 await check('Recovery Admin concurrent code consumption exactly one winner',async()=>{
  await generate();const other=await connect('auth');
  const results=await Promise.all([auth,other].map(c=>redeem('0123456789',digest(randomBytes(32)),c)));
  assert.equal(results.filter(Boolean).length,1);
 });
 await check('Recovery Admin rollback code when token insertion fails',async()=>{
  await generate();
  await admin.query("create function auth.recovery_test_fail() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$");
  await admin.query('create trigger recovery_test_fail before insert on auth.recovery_requests for each row execute function auth.recovery_test_fail()');
  try {await assert.rejects(redeem(),e=>e.code==='P0001');}
  finally {await admin.query('drop trigger recovery_test_fail on auth.recovery_requests');await admin.query('drop function auth.recovery_test_fail()');}
  assert.equal((await admin.query('select count(*)::int n from auth.admin_recovery_codes where identity_id=$1 and used_at is null',[parent.identity])).rows[0].n,1);
  assert.equal(await redeem(),true);
 });
 for(const method of ['parent','admin']) await check('Recovery '+method+' token reset new login and session revocation',async()=>{
  await clearFailures();const token=digest(randomBytes(32)),session=digest(randomBytes(32));
  await auth.query('select * from api.auth_create_session($1,$2,$3,$4,$5,$6)',[parent.identity,parent.profile,session,3600,null,null]);
  if(method==='parent')assert.equal(await proof(valid,token),true);else {await generate();assert.equal(await redeem('0123456789',token),true);}
  const plain='Synthetic strong recovery '+randomBytes(16).toString('hex');const changed=await argonHash(plain);
  for(const candidate of ['243812345678','0812/345/678','[+243] 812-345-678'])
   assert.equal((await auth.query('select api.auth_reset_password($1,$2,$3) ok',[token,changed,candidate])).rows[0].ok,false);
  assert.equal((await auth.query('select api.auth_reset_password($1,$2,$3) ok',[token,changed,null])).rows[0].ok,true);
  assert.equal((await auth.query('select api.auth_reset_password($1,$2,$3) ok',[token,changed,null])).rows[0].ok,false);
  assert.equal((await auth.query('select * from api.auth_resolve_session($1)',[session])).rowCount,0);
  const login=(await auth.query('select * from api.auth_resolve_identity($1)',[parent.email])).rows[0];
  assert.equal(await argonVerify(login.password_hash,plain),true);
  assert.equal(await argonVerify(login.password_hash,previousPassword),false);
  previousPassword=plain;
 });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{await qualifyInstallation({connectionString:process.env.DATABASE_URL,
  passwords:Object.fromEntries(['api','auth','worker','migrator'].map(r=>[r,process.env['SCHOOLSAFE_'+r.toUpperCase()+'_PASSWORD']]))});}
 catch(error){console.error(error.message);process.exitCode=1;}
}

async function setupSnapshot(admin, capability) {
 const counts=(await admin.query('select (select count(*)::int from app.schools) schools, (select count(*)::int from iam.profiles) profiles, (select count(*)::int from auth.identities) identities')).rows[0];
 const authorization=(await admin.query('select school_id,payload,expires_at,consumed_at from auth.setup_authorizations where token_hash=$1',[capability])).rows[0];
 return {counts,authorization};
}

async function qualifySetupResolverBinding({admin,auth,migrator,check,denied,hash}) {
 const payload={identity:{name_fr:'Synthetic resolver binding'},cycles:['primary'],
  academic_year:{label:'2026',starts_on:'2026-01-01',ends_on:'2026-12-31'},contact:{},brand:{}};
 for(const operation of ['stage','complete']) {
  const capability=digest(randomBytes(32));
  await migrator.query('select ops.authorize_school_setup($1,$2)',[capability,3600]);
  const resolved=(await migrator.query('select ops.resolve_school_setup_authorization($1) school_id',[capability])).rows[0].school_id;
  assert.ok(resolved);
  if(operation==='complete') await auth.query('select api.setup_stage_school($1,$2::jsonb)',[capability,JSON.stringify(payload)]);
  for(const failure of ['null','error','mismatched-school']) {
   await check(`setup ${operation} fails closed when resolver returns ${failure}`,async()=>{
    const before=await setupSnapshot(admin,capability);
    const body=failure==='error' ? 'raise insufficient_privilege;' : `return ${failure==='null'?'null':`'${randomUUID()}'::uuid`};`;
    await admin.query('begin');
    try {
     // Transaction-local fault injection: prove both real RPCs consume the resolver result.
     await admin.query(`create or replace function ops.resolve_school_setup_authorization(p_token_hash text) returns uuid language plpgsql security definer set search_path=pg_catalog as $test$ begin ${body} end $test$`);
     await admin.query('set session authorization schoolsafe_auth');
     if(operation==='stage') await denied(admin.query('select api.setup_stage_school($1,$2::jsonb)',[capability,JSON.stringify(payload)]));
     else await denied(admin.query('select api.setup_complete_school($1,$2,$3,$4,$5,$6)',[capability,`binding-${randomUUID()}@example.test`,hash,'Synthetic','Admin',null]));
    } finally {
     await admin.query('rollback');
     await admin.query('reset session authorization');
    }
    assert.deepEqual(await setupSnapshot(admin,capability),before);
    assert.equal((await migrator.query('select ops.resolve_school_setup_authorization($1) school_id',[capability])).rows[0].school_id,resolved);
   });
  }
 }
}

async function qualifySetupHttp({admin,auth,migrator,check}) {
 const {buildApp}=await tsImport('../server/src/app.ts',import.meta.url);
 const {createSetupNativeService}=await tsImport('../server/src/setup/service.ts',import.meta.url);
 const token=randomBytes(32).toString('hex'), capability=digest(token);
 const payload={token,identity:{name_fr:'Synthetic HTTP setup'},cycles:['primary'],
  academic_year:{label:'2026',starts_on:'2026-01-01',ends_on:'2026-12-31',periods:'Trimestres'},contact:{},brand:{}};
 const adminPayload={token,email:`http-setup-${randomUUID()}@example.test`,password:randomBytes(24).toString('hex'),first_name:'Synthetic',last_name:'Admin'};
 const app=buildApp({setup:{service:createSetupNativeService(auth,undefined,token)}});
 const post=(url,payload)=>app.inject({method:'POST',url,payload});
 try {
  await check('HTTP false setup token creates no school or administrator',async()=>{
   const before=await setupSnapshot(admin,capability);
   assert.deepEqual((await post('/setup/validate-token',{token:'synthetic-wrong-token'})).json(),{valid:false});
   assert.equal((await post('/setup/school',{...payload,token:'synthetic-wrong-token'})).statusCode,403);
   assert.equal((await post('/setup/admin',{...adminPayload,token:'synthetic-wrong-token'})).statusCode,403);
   assert.deepEqual(await setupSnapshot(admin,capability),before);
  });
  await check('HTTP matching token without SQL authorization fails closed',async()=>{
   const before=await setupSnapshot(admin,capability);
   assert.ok((await post('/setup/school',payload)).statusCode>=400);
   assert.ok((await post('/setup/admin',adminPayload)).statusCode>=400);
   assert.deepEqual(await setupSnapshot(admin,capability),before);
  });
  await migrator.query('select ops.authorize_school_setup($1,$2)',[capability,3600]);
  const resolved=(await migrator.query('select ops.resolve_school_setup_authorization($1) school_id',[capability])).rows[0].school_id;
  await check('HTTP setup creates exactly the resolver school and its administrator',async()=>{
   assert.ok(resolved);
   const validation=await post('/setup/validate-token',{token});
   assert.equal(validation.statusCode,200);assert.deepEqual(validation.json(),{valid:true});
   const staged=await post('/setup/school',payload);
   assert.equal(staged.statusCode,201);assert.equal(staged.json().school_id,resolved);
   const before=await setupSnapshot(admin,capability);
   const created=await post('/setup/admin',adminPayload);
   assert.equal(created.statusCode,201);
   assert.equal((await admin.query('select id from app.schools where id=$1',[resolved])).rows[0].id,resolved);
   assert.equal((await admin.query('select school_id from iam.profiles where id=$1',[created.json().profile_id])).rows[0].school_id,resolved);
   const after=await setupSnapshot(admin,capability);
   assert.equal(after.counts.schools,before.counts.schools+1);assert.equal(after.counts.identities,before.counts.identities+1);
   assert.ok(after.authorization.consumed_at);
  });
  await check('HTTP consumed setup cannot create another school or administrator',async()=>{
   const before=await setupSnapshot(admin,capability);
   assert.equal((await migrator.query('select ops.resolve_school_setup_authorization($1) school_id',[capability])).rows[0].school_id,null);
   assert.ok((await post('/setup/school',payload)).statusCode>=400);
   assert.ok((await post('/setup/admin',adminPayload)).statusCode>=400);
   assert.deepEqual(await setupSnapshot(admin,capability),before);
  });
 } finally {await app.close();}
}

async function qualifyAdditiveUpgrade({admin,connectionString,passwords,check}){
 const target=new URL(connectionString);const name=decodeURIComponent(target.pathname.slice(1))+'_upgrade';
 assert.match(name,/^schoolsafe_test_[a-z0-9_]+$/);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'schoolsafe-additive-test-'));
 const plan=loadInstallationPlan();
 // Historical units are identified by file, not by position in the current plan.
 const additions=new Set([
  'database/auth/v2/02_identity_verification.sql',
  'database/auth/v2/03_webauthn_credentials.sql',
  'database/auth/v2/04_admin_recovery.sql',
  'database/documents/v1/01_document_sequences.sql',
  'database/documents/v1/02_documents.sql',
  'database/documents/v1/03_document_access.sql',
  'database/auth/v2/05_parent_recovery.sql',
  'database/auth/v2/06_admin_assisted_recovery.sql',
  'database/setup/v3/01_resolve_setup_authorization.sql',
  'database/setup/v3/02_bind_setup_resolver.sql',
  'database/auth/v3/01_inactive_school_auth_gate.sql',
  'database/setup/v4/01_registration_pending.sql',
  'database/auth/v4/01_auth_resolve_identity_preauth.sql',
   'database/setup/v5/01_registration_approval.sql',
   'database/auth/v5/01_account_registration_onboarding.sql',
 ]);
 assert.equal(additions.size,plan.units.length-48,'Additions must cover the current plan beyond historical 48');
 assert.ok(additions.has('database/auth/v3/01_inactive_school_auth_gate.sql'),'auth v3 gate must be in additions');
 assert.ok(additions.has('database/setup/v4/01_registration_pending.sql'),'setup v4 registration must be in additions');
 assert.ok(additions.has('database/auth/v4/01_auth_resolve_identity_preauth.sql'),'auth v4 preauth must be in additions');
 assert.ok(additions.has('database/setup/v5/01_registration_approval.sql'),'setup v5 approval must be in additions');
 let owner,migrator,created=false;
 try{
  fs.cpSync(path.join(repositoryRoot,'database'),path.join(root,'database'),{recursive:true});
  const historical={...plan,units:plan.units.filter(u=>!additions.has(u.file)).map((u,i)=>({...u,order:i+1}))};delete historical.digest;
  for(const file of additions)fs.unlinkSync(path.join(root,file));
  for(const dir of new Set([...additions].map(f=>path.dirname(f)))){
   const manifestPath=path.join(root,dir,'manifest.json');const manifest=JSON.parse(fs.readFileSync(manifestPath));
   manifest.units=manifest.units.filter(u=>!additions.has(dir.replaceAll('\\','/')+'/'+u.file)).map((u,i)=>({...u,order:i+1}));
   fs.writeFileSync(manifestPath,JSON.stringify(manifest));
   fs.writeFileSync(path.join(root,dir,'manifest.sha256'),manifest.units.map(u=>u.sha256+'  '+u.file).join('\n')+'\n');
  }
  fs.writeFileSync(path.join(root,'database/installation/v2/manifest.json'),JSON.stringify(historical));
  await admin.query('create database "'+name+'"');created=true;target.pathname='/'+name;
  await installSchoolDatabase({connectionString:target.toString(),database:name,mode:'apply',passwords,root,log:()=>{}});
  owner=new pg.Client({connectionString:target.toString()});await owner.connect();
  target.username='schoolsafe_migrator';target.password=passwords.migrator;
  migrator=new pg.Client({connectionString:target.toString()});await migrator.connect();
  const ledger=async()=> (await owner.query('select unit_order,file_name,sha256 from ops.installation_units order by unit_order')).rows;
  const initial=await ledger();assert.equal(initial.length,48);
  const sql=renderAdditiveUpgrade({installed:initial});
  await check('additive SQL rejects runtime membership in migration authority',async()=>{
   await owner.query('grant schoolsafe_owner to schoolsafe_api');
   try {
    await assert.rejects(migrator.query(sql),/UPGRADE_REFUSED: runtime migration authority/);await migrator.query('rollback');
    assert.deepEqual(await ledger(),initial);
   } finally {await migrator.query('rollback');await owner.query('revoke schoolsafe_owner from schoolsafe_api');}
  });
  await check('additive SQL rejects a stale snapshot and preserves tampered history',async()=>{
   await owner.query("update ops.installation_units set sha256=repeat('0',64) where unit_order=1");
   await assert.rejects(migrator.query(sql),/UPGRADE_REFUSED/);await migrator.query('rollback');
   assert.equal((await ledger()).length,48);
   await owner.query('update ops.installation_units set sha256=$1 where unit_order=1',[initial[0].sha256]);
  });
  const lastUnit=plan.units.at(-1);
  const lastMarker=`-- APPLY ${lastUnit.order} ${lastUnit.file}`;
  await check('additive SQL rolls back all additive migrations when the last unit fails',async()=>{
   const faulty=sql.replace(lastMarker,'select 1/0;\n'+lastMarker);
   await assert.rejects(migrator.query(faulty),e=>e.code==='22012');await migrator.query('rollback');
   assert.deepEqual(await ledger(),initial);
   assert.equal((await owner.query("select to_regprocedure('ops.resolve_school_setup_authorization(text)') resolver")).rows[0].resolver,null);
   assert.equal((await owner.query("select to_regclass('app.documents') documents")).rows[0].documents,null);
  });
  await check('additive SQL upgrades historical 48 to current plan with immutable append-only rows',async()=>{
   await migrator.query(sql);const after=await ledger();
   assert.equal(after.length,plan.units.length);assert.deepEqual(after.slice(0,48),initial);
   assert.deepEqual(after.slice(48).map(u=>u.file_name),plan.units.filter(u=>additions.has(u.file)).map(u=>u.file));
  });
  await check('additive SQL second upgrade is idempotent including timestamps',async()=>{
   const before=(await owner.query('select * from ops.installation_units order by unit_order')).rows;
   const currentSql=renderAdditiveUpgrade({installed:await ledger()});assert.ok(!currentSql.includes('-- APPLY'));
   await migrator.query(currentSql);
   assert.deepEqual((await owner.query('select * from ops.installation_units order by unit_order')).rows,before);
  });
 } finally {
  await migrator?.end();await owner?.end();
  if(created)await admin.query('drop database "'+name+'"');
  const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('schoolsafe-additive-test-'));fs.rmSync(resolved,{recursive:true});
 }
}

export async function qualifyRegistrationPending({admin,auth,check,denied}){
 await check('registration RPC exists with required signature',async()=>{
  const row=(await admin.query("select pg_get_userbyid(proowner) owner,prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where oid='api.school_registration_prepare(jsonb,text)'::regprocedure")).rows[0];
  assert.ok(row,'api.school_registration_prepare(jsonb,text) must exist');
  assert.equal(row.owner,'schoolsafe_owner');
  assert.equal(row.prosecdef,true);
  assert.deepEqual(row.proconfig,['search_path=pg_catalog']);
  assert.equal(row.result,'jsonb');
 });
 await check('registration table auth.school_registration_requests exists',async()=>{
  const row=(await admin.query("select relrowsecurity,relforcerowsecurity from pg_class where oid='auth.school_registration_requests'::regclass")).rows[0];
  assert.ok(row,'auth.school_registration_requests must exist');
  assert.equal(row.relrowsecurity,true);
  assert.equal(row.relforcerowsecurity,true);
 });
 await check('runtime roles cannot access registration requests directly',async()=>{
  for(const role of ['schoolsafe_api','schoolsafe_auth','schoolsafe_worker','schoolsafe_migrator','schoolsafe_auditor']){
   const privileges=(await admin.query("select has_table_privilege($1,'auth.school_registration_requests','SELECT,INSERT,UPDATE,DELETE') allowed",[role])).rows[0];
   assert.equal(privileges.allowed,false,`${role} must not access auth.school_registration_requests`);
  }
 });
 await check('only schoolsafe_auth can execute registration RPC',async()=>{
  for(const role of ['schoolsafe_api','schoolsafe_worker','schoolsafe_migrator','schoolsafe_auditor']){
   const allowed=(await admin.query("select has_function_privilege($1,'api.school_registration_prepare(jsonb,text)','EXECUTE') allowed",[role])).rows[0].allowed;
   assert.equal(allowed,false,`${role} must not execute api.school_registration_prepare`);
  }
  const authAllowed=(await admin.query("select has_function_privilege('schoolsafe_auth','api.school_registration_prepare(jsonb,text)','EXECUTE') allowed")).rows[0].allowed;
  assert.equal(authAllowed,true);
 });
}

export async function qualifyRegistrationApproval({admin,auth,check,denied}){
 await check('approval RPCs exist with required signatures',async()=>{
  const issue=(await admin.query("select pg_get_userbyid(proowner) owner,prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where oid='api.school_registration_issue_approval(uuid,text,timestamptz)'::regprocedure")).rows[0];
  assert.ok(issue,'api.school_registration_issue_approval must exist');
  assert.equal(issue.owner,'schoolsafe_owner');assert.equal(issue.prosecdef,true);
  assert.deepEqual(issue.proconfig,['search_path=pg_catalog']);assert.equal(issue.result,'jsonb');
  const review=(await admin.query("select pg_get_userbyid(proowner) owner,prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where oid='api.school_registration_review(text)'::regprocedure")).rows[0];
  assert.ok(review,'api.school_registration_review must exist');
  assert.equal(review.owner,'schoolsafe_owner');assert.equal(review.prosecdef,true);
  assert.deepEqual(review.proconfig,['search_path=pg_catalog']);assert.equal(review.result,'jsonb');
  const decide=(await admin.query("select pg_get_userbyid(proowner) owner,prosecdef,proconfig,pg_get_function_result(oid) result from pg_proc where oid='api.school_registration_decide(text,text)'::regprocedure")).rows[0];
  assert.ok(decide,'api.school_registration_decide must exist');
  assert.equal(decide.owner,'schoolsafe_owner');assert.equal(decide.prosecdef,true);
  assert.deepEqual(decide.proconfig,['search_path=pg_catalog']);assert.equal(decide.result,'jsonb');
 });
 await check('approval columns exist on school_registration_requests',async()=>{
  const cols=(await admin.query("select column_name from information_schema.columns where table_schema='auth' and table_name='school_registration_requests' and column_name in ('approval_token_hash','approval_expires_at','approval_token_consumed_at','approval_email_sent_at') order by column_name")).rows.map(r=>r.column_name);
  assert.deepEqual(cols,['approval_email_sent_at','approval_expires_at','approval_token_consumed_at','approval_token_hash']);
 });
 await check('approval token hash constraint enforces format',async()=>{
  await assert.rejects(admin.query("insert into auth.school_registration_requests(id,school_id,user_id,profile_id,identity_id,academic_year_id,status,approval_token_hash) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'pending','INVALID')"),/approval_token_hash_format|check_violation/i);
 });
 await check('only schoolsafe_auth can execute approval RPCs',async()=>{
  for(const fn of ['api.school_registration_issue_approval(uuid,text,timestamptz)','api.school_registration_mark_email_sent(uuid,text)','api.school_registration_review(text)','api.school_registration_decide(text,text)']){
   for(const role of ['schoolsafe_api','schoolsafe_worker','schoolsafe_migrator','schoolsafe_auditor']){
    const allowed=(await admin.query(`select has_function_privilege($1,'${fn}','EXECUTE') allowed`,[role])).rows[0].allowed;
    assert.equal(allowed,false,`${role} must not execute ${fn}`);
   }
   const authAllowed=(await admin.query(`select has_function_privilege('schoolsafe_auth','${fn}','EXECUTE') allowed`)).rows[0].allowed;
   assert.equal(authAllowed,true,`schoolsafe_auth must execute ${fn}`);
  }
 });
}

export async function qualifyAccountRegistrationOnboarding({admin,auth,api,connect,check,denied,hash,context}) {
 const snapshot=async()=> (await admin.query(`select (select count(*)::int from iam.users) users,
 (select count(*)::int from auth.identities) identities,(select count(*)::int from auth.credentials) credentials,
 (select count(*)::int from app.schools) schools,(select count(*)::int from iam.profiles) profiles,
 (select count(*)::int from iam.roles) roles,(select count(*)::int from app.academic_years) years,
 (select count(*)::int from app.school_contacts) contacts,(select count(*)::int from app.school_settings) settings,
 (select count(*)::int from app.school_cycles) cycles,(select count(*)::int from iam.profile_roles) assignments,
 (select count(*)::int from audit.events) audit_events,(select count(*)::int from auth.setup_authorizations) capabilities`)).rows[0];
 let serial=0;
 const payload=()=>({first_name:' Synthetic ',last_name:' Applicant ',email:`account-${randomUUID()}@example.test`,phone:'+24389'+String(++serial).padStart(7,'0')});
 const prepare=async(p=payload(),ip='198.51.100.'+(serial%250+1),client=auth)=>({...(await client.query('select api.account_registration_prepare($1,$2,$3) r',[p,hash,ip])).rows[0].r,payload:p});
 const issue=async(id,capability=digest(randomBytes(32)))=>{await auth.query('select api.account_registration_issue_approval($1,$2,$3)',[id,capability,new Date(Date.now()+600000)]);return capability;};
 let pending,identity,approval;
 await check('account-first pending creates only one inactive account and no school objects',async()=>{
  const before=await snapshot();pending=await prepare();assert.equal(pending.status,'pending');assert.ok(pending.request_id);
  const after=await snapshot();assert.deepEqual(after,{...before,users:before.users+1,identities:before.identities+1,credentials:before.credentials+1});
  identity=(await admin.query('select r.*,i.status identity_status,u.is_active from auth.account_registration_requests r join auth.identities i on i.id=r.identity_id join iam.users u on u.id=r.user_id where r.id=$1',[pending.request_id])).rows[0];
  assert.equal(identity.identity_status,'disabled');assert.equal(identity.is_active,false);
  assert.equal((await auth.query('select * from api.auth_resolve_identity($1)',[pending.payload.email])).rowCount,0);
  assert.equal((await auth.query('select * from api.auth_resolve_onboarding_identity($1)',[pending.payload.email])).rowCount,0);
 });
 await check('account-first approval activates exact account without school/profile creation',async()=>{
  const before=await snapshot();approval=await issue(pending.request_id);
  const review=(await auth.query('select api.account_registration_review($1) r',[approval])).rows[0].r;
  assert.deepEqual(Object.keys(review).sort(),['request_id','first_name','last_name','email','phone','status'].sort());assert.equal(review.first_name,'Synthetic');
  assert.equal((await auth.query('select api.account_registration_decide($1,$2) r',[approval,'approve'])).rows[0].r.status,'approved');
  assert.deepEqual(await snapshot(),before);
  const resolved=(await auth.query('select * from api.auth_resolve_onboarding_identity($1)',[pending.payload.email])).rows;
  assert.equal(resolved.length,1);assert.equal(resolved[0].identity_id,identity.identity_id);assert.equal(resolved[0].user_id,identity.user_id);assert.equal(resolved[0].password_hash,hash);
  await denied(auth.query('select api.account_registration_decide($1,$2)',[approval,'approve']));
 });
 const schoolPayload={identity:{name_fr:'Synthetic account-first school'},cycles:['primary'],academic_year:{label:'2026-2027',starts_on:'2026-09-01',ends_on:'2027-07-31',periods:'Trimestres'},contact:{website_url:'https://example.test',website_mode:'External',public_news:'Yes',public_gallery:'No',public_honors:'Yes'},brand:{}};
 let sessionHash=digest(randomBytes(32)),created;
 await check('account-first onboarding session creates no ordinary auth session',async()=>{
  const before=(await admin.query('select count(*)::int n from auth.sessions')).rows[0].n;
  const session=(await auth.query('select * from api.auth_create_onboarding_session($1,$2,$3,$4,$5)',[identity.identity_id,sessionHash,3600,'192.0.2.1','synthetic-agent'])).rows[0];assert.ok(session.session_id);
  assert.equal((await admin.query('select count(*)::int n from auth.sessions')).rows[0].n,before);
  const me=(await auth.query('select api.auth_resolve_onboarding_session($1) r',[sessionHash])).rows[0].r;assert.equal(me.email,pending.payload.email);assert.equal(me.status,'approved');
 });
 await check('account-first creates school with same identity and canonical administrator atomically',async()=>{
  const before=await snapshot();created=(await auth.query('select api.account_onboarding_create_school($1,$2) r',[sessionHash,schoolPayload])).rows[0].r;
  assert.equal(created.status,'completed');assert.ok(created.school_id&&created.profile_id);
  const after=await snapshot();assert.equal(after.users,before.users);assert.equal(after.identities,before.identities);assert.equal(after.credentials,before.credentials);assert.equal(after.schools,before.schools+1);assert.equal(after.profiles,before.profiles+1);
  const profile=(await admin.query('select user_id,school_id from iam.profiles where id=$1',[created.profile_id])).rows[0];assert.equal(profile.user_id,identity.user_id);assert.equal(profile.school_id,created.school_id);
  const roles=(await admin.query('select r.code from iam.profile_roles pr join iam.roles r on r.id=pr.role_id and r.school_id=pr.school_id where pr.profile_id=$1',[created.profile_id])).rows;assert.deepEqual(roles,[{code:'admin'}]);
  assert.equal((await auth.query('select * from api.auth_resolve_onboarding_identity($1)',[pending.payload.email])).rowCount,0);
  assert.equal((await auth.query('select * from api.auth_resolve_identity($1)',[pending.payload.email])).rows[0].identity_id,identity.identity_id);
  assert.equal((await auth.query('select api.auth_resolve_onboarding_session($1) r',[sessionHash])).rows[0].r,null);
  await denied(auth.query('select api.account_onboarding_create_school($1,$2)',[sessionHash,schoolPayload]));
 });
 const calls=[
 'api.account_registration_prepare(jsonb,text,inet)','api.account_registration_issue_approval(uuid,text,timestamptz)',
 'api.account_registration_mark_email_sent(uuid)','api.account_registration_review(text)','api.account_registration_decide(text,text)',
 'api.account_registration_cancel_delivery_failure(uuid)','api.auth_resolve_onboarding_identity(text)',
 'api.auth_create_onboarding_session(uuid,text,integer,inet,text)','api.auth_resolve_onboarding_session(text)',
 'api.auth_revoke_onboarding_session(text)','api.account_onboarding_create_school(text,jsonb)'];
 await check('account-first tables FORCE RLS and new RPCs expose only owner-controlled auth execution',async()=>{
  for(const name of ['account_registration_requests','onboarding_sessions','account_registration_events']){
   const table='auth.'+name;
   const meta=(await admin.query('select relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner from pg_class where oid=$1::regclass',[table])).rows[0];
   assert.deepEqual(meta,{relrowsecurity:true,relforcerowsecurity:true,owner:'schoolsafe_owner'});
   for(const role of ['schoolsafe_api','schoolsafe_auth','schoolsafe_worker','schoolsafe_migrator','schoolsafe_auditor'])assert.equal((await admin.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') allowed",[role,table])).rows[0].allowed,false);
   await denied(auth.query('select * from '+table));
   assert.equal((await admin.query("select count(*)::int n from pg_policy where polrelid=$1::regclass and polroles<>array[(select oid from pg_roles where rolname='schoolsafe_owner')]",[table])).rows[0].n,0);
  }
  for(const fn of calls){
   const meta=(await admin.query('select pg_get_userbyid(proowner) owner,prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[fn])).rows[0];assert.deepEqual(meta,{owner:'schoolsafe_owner',prosecdef:true,proconfig:['search_path=pg_catalog']});
   for(const role of ['schoolsafe_api','schoolsafe_auth','schoolsafe_worker','schoolsafe_migrator','schoolsafe_auditor'])assert.equal((await admin.query("select has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed,role==='schoolsafe_auth');
   assert.equal((await admin.query("select exists(select 1 from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=$1::regprocedure and a.grantee=0) allowed",[fn])).rows[0].allowed,false);
  }
  await denied(api.query('select api.account_registration_review($1)',[approval]));
 });
 await check('account-first input rejects school and password fields and invalid identity values',async()=>{
  const before=await snapshot();
  for(const change of [{password:'forbidden'},{school_id:randomUUID()},{admin:{}},{first_name:' '},{email:'invalid'},{phone:'123'},{last_name:12}])await assert.rejects(prepare({...payload(),...change}),e=>e.code==='23514');
  await assert.rejects(auth.query('select api.account_registration_prepare($1,$2,$3)',[payload(),'plaintext','192.0.2.1']),e=>e.code==='23514');
  assert.deepEqual(await snapshot(),before);
 });
 await check('account-first duplicate email or phone is atomic with identical generic refusal',async()=>{
  const before=await snapshot();const errors=[];
  for(const p of [{...payload(),email:pending.payload.email.toUpperCase()},{...payload(),phone:pending.payload.phone}]){
   await assert.rejects(prepare(p),e=>{errors.push(e.message);return e.code==='23505';});
  }
  assert.equal(errors[0],errors[1]);assert.deepEqual(await snapshot(),before);
 });
 const peer=await connect('auth');
 await check('account-first concurrent duplicate email and phone each have exactly one winner',async()=>{
  for(const field of ['email','phone']){
   const one=payload(),two={...payload(),[field]:one[field]};const before=await snapshot();
   const results=await Promise.allSettled([prepare(one,'198.18.1.1',auth),prepare(two,'198.18.1.2',peer)]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'23505');
   const after=await snapshot();assert.equal(after.users,before.users+1);assert.equal(after.identities,before.identities+1);
  }
 });
 await check('account-first serialized IP window admits five and rejects concurrent sixth even after compensation',async()=>{
  const clients=await Promise.all(Array.from({length:6},()=>connect('auth')));
  const results=await Promise.allSettled(clients.map(c=>prepare(payload(),'198.18.2.1',c)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,5);assert.equal(results.find(r=>r.status==='rejected').reason.code,'P0001');
  const id=results.find(r=>r.status==='fulfilled').value.request_id;
  assert.equal((await auth.query('select api.account_registration_cancel_delivery_failure($1) ok',[id])).rows[0].ok,true);
  await assert.rejects(prepare(payload(),'198.18.2.1'),e=>e.code==='P0001');
 });
 await check('account-first consumed or invalid approval tokens cannot review decide or be reissued',async()=>{
  for(const token of [null,'bad',digest(randomBytes(32)),approval]){
   await denied(auth.query('select api.account_registration_review($1)',[token]));await denied(auth.query('select api.account_registration_decide($1,$2)',[token,'approve']));
  }
  await denied(issue(pending.request_id));
  await auth.query('select api.account_registration_mark_email_sent($1)',[pending.request_id]);
  assert.ok((await admin.query('select approval_email_sent_at from auth.account_registration_requests where id=$1',[pending.request_id])).rows[0].approval_email_sent_at);
  assert.equal((await auth.query('select api.account_registration_cancel_delivery_failure($1) ok',[pending.request_id])).rows[0].ok,false);
 });
 await check('account-first expiry bounds and expired approval fail closed',async()=>{
  const p=await prepare();
  for(const values of [[null,new Date(Date.now()+60000)],['bad',new Date(Date.now()+60000)],[digest(randomBytes(32)),null],[digest(randomBytes(32)),new Date(Date.now()-1000)],[digest(randomBytes(32)),new Date(Date.now()+172801000)]])await assert.rejects(auth.query('select api.account_registration_issue_approval($1,$2,$3)',[p.request_id,...values]),e=>e.code==='23514');
  const token=await issue(p.request_id);await admin.query("update auth.account_registration_requests set approval_expires_at=clock_timestamp()-interval '1 second' where id=$1",[p.request_id]);
  await denied(auth.query('select api.account_registration_review($1)',[token]));await denied(auth.query('select api.account_registration_decide($1,$2)',[token,'approve']));
 });
 await check('account-first rejection leaves account disabled without school creation',async()=>{
  const p=await prepare(),token=await issue(p.request_id);const before=await snapshot();
  assert.equal((await auth.query('select api.account_registration_decide($1,$2) r',[token,'reject'])).rows[0].r.status,'rejected');assert.deepEqual(await snapshot(),before);
  assert.equal((await auth.query('select * from api.auth_resolve_onboarding_identity($1)',[p.payload.email])).rowCount,0);
  assert.equal((await auth.query('select * from api.auth_resolve_identity($1)',[p.payload.email])).rowCount,0);
  const state=(await admin.query('select u.is_active,i.status from auth.account_registration_requests r join iam.users u on u.id=r.user_id join auth.identities i on i.id=r.identity_id where r.id=$1',[p.request_id])).rows[0];assert.deepEqual(state,{is_active:false,status:'disabled'});
 });
 await check('account-first double decision has one winner and one event',async()=>{
  const p=await prepare(),token=await issue(p.request_id);
  const results=await Promise.allSettled([auth.query('select api.account_registration_decide($1,$2)',[token,'approve']),peer.query('select api.account_registration_decide($1,$2)',[token,'reject'])]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'42501');
  assert.equal((await admin.query("select count(*)::int n from auth.account_registration_events where request_id=$1 and event_type<>'account.registration.pending'",[p.request_id])).rows[0].n,1);
 });
 await check('account-first failed delivery removes only pending account and supports retry',async()=>{
  const before=await snapshot(),p=await prepare();await issue(p.request_id);
  assert.equal((await auth.query('select api.account_registration_cancel_delivery_failure($1) ok',[p.request_id])).rows[0].ok,true);assert.deepEqual(await snapshot(),before);
  assert.equal((await admin.query('select count(*)::int n from auth.account_registration_events where request_id=$1',[p.request_id])).rows[0].n,0);
  assert.equal((await prepare(p.payload)).status,'pending');
 });
 await check('account-first cancellation and approval race cannot delete an approved account',async()=>{
  const p=await prepare(),token=await issue(p.request_id);
  const result=await Promise.allSettled([auth.query('select api.account_registration_decide($1,$2) r',[token,'approve']),peer.query('select api.account_registration_cancel_delivery_failure($1) ok',[p.request_id])]);
  const row=(await admin.query('select status from auth.account_registration_requests where id=$1',[p.request_id])).rows[0];
  if(row){assert.equal(row.status,'approved');assert.equal(result[0].status,'fulfilled');assert.equal(result[1].value.rows[0].ok,false);}else{assert.equal(result[0].status,'rejected');assert.equal(result[1].value.rows[0].ok,true);}
 });
 await check('account-first approval refuses altered identity binding and leaves decision pending',async()=>{
  const p=await prepare(),token=await issue(p.request_id);const row=(await admin.query('select user_id from auth.account_registration_requests where id=$1',[p.request_id])).rows[0];
  await admin.query('update iam.users set phone=$1 where id=$2',['+243888888888',row.user_id]);
  try{await denied(auth.query('select api.account_registration_decide($1,$2)',[token,'approve']));}finally{await admin.query('update iam.users set phone=$1 where id=$2',[p.payload.phone,row.user_id]);}
  assert.equal((await auth.query('select api.account_registration_review($1) r',[token])).rows[0].r.status,'pending');
 });
 const freshApproved=async()=>{const p=await prepare();await auth.query('select api.account_registration_decide($1,$2)',[await issue(p.request_id),'approve']);const id=(await auth.query('select * from api.auth_resolve_onboarding_identity($1)',[p.payload.email])).rows[0];return {...p,...id};};
 const session=async(id,token=digest(randomBytes(32)))=>{await auth.query('select * from api.auth_create_onboarding_session($1,$2,$3,$4,$5)',[id,token,3600,null,'synthetic']);return token;};
 const ready=await freshApproved();
 await check('account-first onboarding rejects unknown pending rejected and completed identities',async()=>{
  const p=await prepare();const id=(await admin.query('select identity_id from auth.account_registration_requests where id=$1',[p.request_id])).rows[0].identity_id;
  for(const candidate of [randomUUID(),id,identity.identity_id])await denied(session(candidate));
  for(const ttl of [null,0,3601])await assert.rejects(auth.query('select * from api.auth_create_onboarding_session($1,$2,$3,$4,$5)',[ready.identity_id,digest(randomBytes(32)),ttl,null,null]),e=>e.code==='23514');
  for(const token of [null,'raw-token','A'.repeat(64)])await assert.rejects(auth.query('select * from api.auth_create_onboarding_session($1,$2,$3,$4,$5)',[ready.identity_id,token,3600,null,null]),e=>e.code==='23514');
 });
 await check('account-first onboarding rejects expired revoked and unknown session hashes',async()=>{
  const expired=await session(ready.identity_id),revoked=await session(ready.identity_id);
  await admin.query("update auth.onboarding_sessions set created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' where token_hash=$1",[expired]);
  await auth.query('select api.auth_revoke_onboarding_session($1)',[revoked]);
  for(const token of [expired,revoked,digest(randomBytes(32)),null]){
   assert.equal((await auth.query('select api.auth_resolve_onboarding_session($1) r',[token])).rows[0].r,null);
   await denied(auth.query('select api.account_onboarding_create_school($1,$2)',[token,schoolPayload]));
  }
 });
 let readyToken=await session(ready.identity_id);
 await check('account-first inactive user or identity immediately invalidates onboarding capabilities',async()=>{
  for(const candidate of ['user','identity']){
   if(candidate==='user')await admin.query('update iam.users set is_active=false where id=$1',[ready.user_id]);else await admin.query("update auth.identities set status='disabled' where id=$1",[ready.identity_id]);
   try{
    assert.equal((await auth.query('select * from api.auth_resolve_onboarding_identity($1)',[ready.payload.email])).rowCount,0);
    assert.equal((await auth.query('select api.auth_resolve_onboarding_session($1) r',[readyToken])).rows[0].r,null);
    await denied(session(ready.identity_id));await denied(auth.query('select api.account_onboarding_create_school($1,$2)',[readyToken,schoolPayload]));
   }finally{if(candidate==='user')await admin.query('update iam.users set is_active=true where id=$1',[ready.user_id]);else await admin.query("update auth.identities set status='active' where id=$1",[ready.identity_id]);}
  }
 });
 await check('account-first existing active school profile blocks all onboarding entry points',async()=>{
  const profile=randomUUID();await admin.query('insert into iam.profiles(id,user_id,school_id,display_name,is_active) values($1,$2,$3,$4,true)',[profile,ready.user_id,created.school_id,'Synthetic conflicting membership']);
  try{
   assert.equal((await auth.query('select * from api.auth_resolve_onboarding_identity($1)',[ready.payload.email])).rowCount,0);
   assert.equal((await auth.query('select api.auth_resolve_onboarding_session($1) r',[readyToken])).rows[0].r,null);
   await denied(session(ready.identity_id));await denied(auth.query('select api.account_onboarding_create_school($1,$2)',[readyToken,schoolPayload]));
  }finally{await admin.query('delete from iam.profiles where id=$1',[profile]);}
 });
 await check('account-first school refuses admin password school identifier and inline logo',async()=>{
  const before=await snapshot();
  for(const change of [{admin:{}},{password:'forbidden'},{school_id:randomUUID()},{brand:{logo_base64:'forbidden'}},{brand:{logo_path:'data:image/png;base64,x'}},{cycles:['invalid']}])await assert.rejects(auth.query('select api.account_onboarding_create_school($1,$2)',[readyToken,{...schoolPayload,...change}]),e=>e.code==='23514');
  assert.deepEqual(await snapshot(),before);
 });
 await check('account-first school completion rolls back all writes and session changes on event failure',async()=>{
  const before=await snapshot();const requestBefore=(await admin.query('select * from auth.account_registration_requests where id=$1',[ready.request_id])).rows[0];
  await admin.query("create function auth.account_test_fail() returns trigger language plpgsql as $$ begin if new.event_type='account.registration.completed' then raise exception 'synthetic completion failure'; end if;return new;end $$");
  await admin.query('create trigger account_test_fail before insert on auth.account_registration_events for each row execute function auth.account_test_fail()');
  try{await assert.rejects(auth.query('select api.account_onboarding_create_school($1,$2)',[readyToken,schoolPayload]),/synthetic completion failure/);}finally{await admin.query('drop trigger account_test_fail on auth.account_registration_events');await admin.query('drop function auth.account_test_fail()');}
  assert.deepEqual(await snapshot(),before);assert.deepEqual((await admin.query('select * from auth.account_registration_requests where id=$1',[ready.request_id])).rows[0],requestBefore);
  assert.ok((await auth.query('select api.auth_resolve_onboarding_session($1) r',[readyToken])).rows[0].r);
 });
 await check('account-first distinct concurrent sessions create one school and revoke all onboarding sessions',async()=>{
  const second=await session(ready.identity_id),before=await snapshot();
  const results=await Promise.allSettled([auth.query('select api.account_onboarding_create_school($1,$2) r',[readyToken,schoolPayload]),peer.query('select api.account_onboarding_create_school($1,$2) r',[second,schoolPayload])]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'42501');
  assert.equal((await snapshot()).schools,before.schools+1);assert.equal((await admin.query('select count(*)::int n from auth.onboarding_sessions where identity_id=$1 and revoked_at is null',[ready.identity_id])).rows[0].n,0);
 });
 await check('account-first completed account supports ordinary exact profile sessions with school isolation',async()=>{
  const profiles=(await auth.query('select * from api.auth_list_profiles($1)',[identity.identity_id])).rows;assert.equal(profiles.length,1);assert.equal(profiles[0].profile_id,created.profile_id);
  const ordinaryHash=digest(randomBytes(32));await auth.query('select * from api.auth_create_session($1,$2,$3,$4,$5,$6)',[identity.identity_id,created.profile_id,ordinaryHash,3600,null,null]);
  const resolved=(await auth.query('select * from api.auth_resolve_session($1)',[ordinaryHash])).rows;assert.equal(resolved.length,1);assert.equal(resolved[0].school_id,created.school_id);
  const foreign=(await admin.query('select school_id from iam.profiles where user_id=$1',[ready.user_id])).rows[0].school_id;
  await denied(context(api,{user_id:identity.user_id,profile_id:created.profile_id,school_id:foreign},async()=>{}));
  await context(api,{user_id:identity.user_id,profile_id:created.profile_id,school_id:created.school_id},async c=>{
   const result=(await c.query('select api.student_list() r')).rows[0].r;assert.equal(result.total,0);assert.deepEqual(result.rows,[]);
  });
  const contact=(await admin.query('select website_url,website_mode,public_news,public_gallery,public_honors from app.school_contacts where school_id=$1',[created.school_id])).rows[0];assert.deepEqual(contact,schoolPayload.contact);
 });
 await check('account-first event records contain no hashes or secrets and context is restored',async()=>{
  assert.equal((await admin.query("select count(*)::int n from auth.account_registration_events where payload<>'{}'::jsonb")).rows[0].n,0);
  assert.equal((await admin.query("select count(*)::int n from auth.onboarding_sessions where token_hash !~ '^[0-9a-f]{64}$'")).rows[0].n,0);
  assert.equal((await admin.query("select count(*)::int n from audit.events where event_type='school.onboarding.completed' and entity_id=$1",[created.school_id])).rows[0].n,1);
  await auth.query('begin');try{
   const setting=async()=> (await auth.query("select coalesce(current_setting('schoolsafe.preauth',true),'') value")).rows[0].value;
   const before=await setting();await auth.query('select * from api.auth_resolve_onboarding_identity($1)',[ready.payload.email]);assert.equal(await setting(),before);
  }finally{await auth.query('rollback');}
 });
}

async function qualifyInstalled62Upgrade({admin,connectionString,passwords,check}) {
 const plan=loadInstallationPlan();const unit=plan.units.at(-1);
 assert.equal(unit.file,'database/auth/v5/01_account_registration_onboarding.sql');assert.equal(plan.units.length,63);
 const target=new URL(connectionString),name=decodeURIComponent(target.pathname.slice(1))+'_upgrade62';
 assert.match(name,/^schoolsafe_test_[a-z0-9_]+$/);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'schoolsafe-account-upgrade-'));let created=false,owner,migrator,auth;
 try {
  fs.cpSync(path.join(repositoryRoot,'database'),path.join(root,'database'),{recursive:true});
  fs.unlinkSync(path.join(root,unit.file));
  fs.writeFileSync(path.join(root,'database/auth/v5/manifest.json'),JSON.stringify({schema:'schoolsafe-migrations-v5',name:'auth',version:5,units:[]}));
  fs.writeFileSync(path.join(root,'database/auth/v5/manifest.sha256'),'\n');
  const initialPlan={...plan,units:plan.units.slice(0,62)};delete initialPlan.digest;
  fs.writeFileSync(path.join(root,'database/installation/v2/manifest.json'),JSON.stringify(initialPlan));
  await admin.query('create database "'+name+'"');created=true;target.pathname='/'+name;
  await installSchoolDatabase({connectionString:target.toString(),database:name,mode:'apply',passwords,root,log:()=>{}});
  owner=new pg.Client({connectionString:target.toString()});await owner.connect();
  target.username='schoolsafe_migrator';target.password=passwords.migrator;migrator=new pg.Client({connectionString:target.toString()});await migrator.connect();
  target.username='schoolsafe_auth';target.password=passwords.auth;auth=new pg.Client({connectionString:target.toString()});await auth.connect();
  const ledger=async()=> (await owner.query('select unit_order,file_name,sha256 from ops.installation_units order by unit_order')).rows;
  const initial=await ledger();assert.equal(initial.length,62);const sql=renderAdditiveUpgrade({installed:initial});
  assert.equal((sql.match(/-- APPLY /g)??[]).length,1);
  await check('account-first upgrade 62 rollback leaves all historical units and no new tables',async()=>{
   const faulty=sql.replace(/^commit;$/im,'select 1/0;\ncommit;');assert.ok(faulty!==sql,'Upgrade commit marker required');
   await assert.rejects(migrator.query(faulty),e=>e.code==='22012');await migrator.query('rollback');
   assert.deepEqual(await ledger(),initial);assert.equal((await owner.query("select to_regclass('auth.account_registration_requests') object")).rows[0].object,null);
  });
  await check('account-first upgrade 62 to 63 appends exactly one immutable ledger unit',async()=>{
   await migrator.query(sql);const after=await ledger();assert.equal(after.length,63);assert.deepEqual(after.slice(0,62),initial);assert.equal(after[62].file_name,unit.file);assert.equal(after[62].sha256,unit.sha256);
   const before=(await owner.query('select * from ops.installation_units order by unit_order')).rows;await migrator.query(renderAdditiveUpgrade({installed:after}));assert.deepEqual((await owner.query('select * from ops.installation_units order by unit_order')).rows,before);
   const hash=await argonHash(randomBytes(32).toString('hex'),{memoryCost:19456,timeCost:2,parallelism:1});
   const result=(await auth.query('select api.account_registration_prepare($1,$2,$3) r',[{first_name:'Upgrade',last_name:'Proof',email:'upgrade-'+randomUUID()+'@example.test',phone:'+243899999999'},hash,'198.19.0.1'])).rows[0].r;assert.equal(result.status,'pending');
  });
 } finally {
  await Promise.allSettled([auth?.end(),migrator?.end(),owner?.end()]);if(created)await admin.query('drop database "'+name+'"');
  const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('schoolsafe-account-upgrade-'));fs.rmSync(resolved,{recursive:true});
 }
}