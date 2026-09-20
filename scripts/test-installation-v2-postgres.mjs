import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import pg from 'pg';
import {hash as argonHash} from '@node-rs/argon2';
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
  const hash=await argonHash(randomBytes(32).toString('hex'),{memoryCost:19456,timeCost:2,parallelism:1});
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
   });
   await check('staging creates no partial school '+label,async()=>{
    assert.equal((await admin.query('select count(*)::int n from app.schools where id=$1',[staged.school_id])).rows[0].n,0);
   });
   let created;await check('atomic school and admin '+label,async()=>{
    created=(await auth.query('select api.setup_complete_school($1,$2,$3,$4,$5,$6) r',[tokenHash,email,hash,'Synthetic','Admin '+label,null])).rows[0].r;
    assert.ok(created.user_id&&created.profile_id);
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
  log(`POSTGRES_QUALIFICATION PASS (${passed} scenarios)`);return {passed,schools};
 }catch(error){
  throw new Error(`POSTGRES_QUALIFICATION FAIL: ${phase}; ${error.code??'assertion'}`,{cause:error});
 }finally{await Promise.allSettled(clients.map(c=>c.end()));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{await qualifyInstallation({connectionString:process.env.DATABASE_URL,
  passwords:Object.fromEntries(['api','auth','worker','migrator'].map(r=>[r,process.env['SCHOOLSAFE_'+r.toUpperCase()+'_PASSWORD']]))});}
 catch(error){console.error(error.message);process.exitCode=1;}
}
