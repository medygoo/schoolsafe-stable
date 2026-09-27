import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {tsImport} from 'tsx/esm/api';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const digest=v=>createHash('sha256').update(v).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
export async function qualifyDirectActivation({admin,auth,api,migrator,connect,check,denied,hash,context}) {
 let serial=0;
 const create=async(login='direct-'+randomUUID()+'@example.test',client=auth)=>{
  const row=(await client.query('select * from api.auth_create_direct_identity($1,$2,$3)',[login,hash,'198.18.1.'+(++serial)])).rows[0];
  assert.ok(row?.identity_id);return {...row,login};
 };
 const session=async(identity)=>{const raw=token();await auth.query('select * from api.auth_create_onboarding_session($1,$2,$3,$4,$5)',[identity.identity_id,digest(raw),3600,'198.18.0.1','synthetic']);return raw;};
 const school={identity:{name_fr:'Synthetic Direct School',school_type:'Privée agréée'},cycles:['primary'],academic_year:{label:'2026-2027',starts_on:'2026-09-01',ends_on:'2027-07-01'},contact:{email:'school@example.test',phone:'+243812345678'},brand:{primary_color:'#071a3d'},admin:{first_name:'Synthetic',last_name:'Administrator'}};
 const activate=(sessionToken,payload=school,normal=token(),client=auth)=>client.query('select api.auth_activate_school($1,$2,$3) result',[digest(sessionToken),payload,digest(normal)]);
 const snapshot=async()=> (await admin.query(`select
  (select count(*)::int from app.schools) schools,(select count(*)::int from iam.profiles) profiles,
  (select count(*)::int from iam.roles) roles,(select count(*)::int from iam.profile_roles) assignments,
  (select count(*)::int from app.academic_years) years,(select count(*)::int from app.school_contacts) contacts,
  (select count(*)::int from app.school_settings) settings,(select count(*)::int from app.school_cycles) cycles,
  (select count(*)::int from audit.events) audit_events,(select count(*)::int from auth.sessions) sessions,
  (select count(*)::int from auth.setup_authorizations where consumed_at is not null) consumed`)).rows[0];
 let email,phone,emailSession,phoneSession;
 await check('direct email and normalized phone create identities without school or admin',async()=>{
  const before=await snapshot();email=await create();phone=await create('0891234567');
  assert.deepEqual(await snapshot(),before);
  assert.equal((await admin.query('select phone,email from auth.identities where id=$1',[phone.identity_id])).rows[0].phone,'+243891234567');
  assert.equal((await auth.query('select * from api.auth_resolve_identity($1)',[email.login])).rowCount,0);
  assert.equal((await auth.query('select * from api.auth_resolve_onboarding_identity($1)',[email.login])).rows[0].identity_id,email.identity_id);
  emailSession=await session(email);phoneSession=await session(phone);
 });
 await check('direct disabled and existing identities cannot be recreated or overwritten',async()=>{
  for(const state of ['active','disabled']){
   await admin.query('update auth.identities set status=$1 where id=$2',[state,email.identity_id]);
   assert.equal((await auth.query('select * from api.auth_create_direct_identity($1,$2,$3)',[email.login,hash,'198.18.2.1'])).rowCount,0);
  }
  await denied(activate(emailSession));
  await admin.query("update auth.identities set status='active' where id=$1",[email.identity_id]);
 });
 await check('direct admission validates identifier and enforces IP limit',async()=>{
  for(const login of ['invalid','+123','x@y','','abc0891234567'])assert.equal((await auth.query('select * from api.auth_create_direct_identity($1,$2,$3)',[login,hash,'198.18.2.2'])).rowCount,0);
  for(let n=0;n<6;n++)assert.equal((await auth.query('select * from api.auth_create_direct_identity($1,$2,$3)',['rate-'+n+'-'+randomUUID()+'@example.test',hash,'198.18.2.3'])).rowCount,n<5?1:0);
 });
 await check('direct identity duplicate concurrent creation has a single winner',async()=>{
  const other=await connect('auth'),login='race-'+randomUUID()+'@example.test';
  const results=await Promise.all([auth,other].map((c,i)=>c.query('select * from api.auth_create_direct_identity($1,$2,$3)',[login,hash,'198.18.3.'+(i+1)])));
  assert.equal(results.reduce((n,r)=>n+r.rowCount,0),1);
 });
 await check('direct tables and retired approval RPCs deny runtime access',async()=>{
  for(const c of [auth,api,migrator])await denied(c.query('select * from auth.direct_onboarding_accounts'));
  for(const sql of ["select api.account_registration_prepare('{}',null,null)","select api.account_registration_review(null)","select api.account_registration_decide(null,'approve')","select api.account_onboarding_create_school(null,'{}')"])
   await denied(auth.query(sql));
  await denied(api.query('select * from api.auth_create_direct_identity($1,$2,$3)',[email.login,hash,'198.18.0.1']));
  await denied(api.query('select api.auth_activate_school($1,$2,$3)',[digest(emailSession),school,digest(token())]));
  await denied(api.query('select api.auth_record_activation_attempt($1,true)',[digest(emailSession)]));
  await denied(auth.query('select auth.direct_activation_allows($1)',[randomUUID()]));
  await denied(auth.query('update auth.direct_onboarding_accounts set activating_school_id=$1,activating_txid=txid_current()',[randomUUID()]));
 });
 await check('direct invalid and expired sessions create no partial data',async()=>{
  const before=await snapshot();
  await denied(activate(token()));
  const expiredSession=await session(email);await admin.query("update auth.onboarding_sessions set expires_at=created_at+interval '1 microsecond' where token_hash=$1",[digest(expiredSession)]);
  await denied(activate(expiredSession));assert.deepEqual(await snapshot(),before);
 });
 await check('direct forged admin role school or payload and missing names are refused',async()=>{
  const before=await snapshot();
  for(const change of [{admin:{first_name:'',last_name:'X'}},{admin:{...school.admin,role:'super_admin'}},{school_id:randomUUID()},{cycles:[]},{brand:{logo_path:'data:x'}},{academic_year:{...school.academic_year,ends_on:school.academic_year.starts_on}}])
   await denied(activate(emailSession,{...school,...change}));
  assert.deepEqual(await snapshot(),before);
 });
 await check('direct late audit failure rolls back school admin code and normal session',async()=>{
  const before=await snapshot();
  await admin.query("create function public.direct_test_fail() returns trigger language plpgsql as $$begin if new.event_type='school.onboarding.completed' then raise exception 'synthetic failure'; end if; return new; end$$; create trigger direct_test_fail before insert on audit.events for each row execute function public.direct_test_fail()");
  try {await assert.rejects(activate(emailSession),e=>e.code==='P0001');assert.deepEqual(await snapshot(),before);}
  finally {await admin.query('drop trigger direct_test_fail on audit.events; drop function public.direct_test_fail()');}
  assert.equal((await auth.query('select api.auth_resolve_onboarding_session($1) r',[digest(emailSession)])).rows[0].r.status,'onboarding');
 });
 let created,normal=token();
 await check('direct final session failure rolls back completed account and onboarding revocation',async()=>{
  const before=await snapshot();
  const accounts=(await admin.query('select * from auth.direct_onboarding_accounts order by identity_id')).rows;
  const sessions=(await admin.query('select * from auth.onboarding_sessions order by id')).rows;
  await admin.query("create function public.direct_session_fail() returns trigger language plpgsql as $$begin raise exception 'synthetic session failure'; end$$; create trigger direct_session_fail before insert on auth.sessions for each row execute function public.direct_session_fail()");
  try {await assert.rejects(activate(emailSession),e=>e.code==='P0001');assert.deepEqual(await snapshot(),before);
   assert.deepEqual((await admin.query('select * from auth.direct_onboarding_accounts order by identity_id')).rows,accounts);
   assert.deepEqual((await admin.query('select * from auth.onboarding_sessions order by id')).rows,sessions);
  } finally {await admin.query('drop trigger direct_session_fail on auth.sessions; drop function public.direct_session_fail()');}
 });
 await check('direct activation creates canonical school admin and normal session atomically',async()=>{
  created=(await activate(emailSession,school,normal)).rows[0].result;assert.equal(created.status,'completed');
  const resolved=(await auth.query('select * from api.auth_resolve_session($1)',[digest(normal)])).rows[0];
  assert.equal(resolved.school_id,created.school_id);assert.equal(resolved.profile_id,created.profile_id);
  assert.equal(resolved.identity_id,email.identity_id);
  assert.equal((await auth.query('select * from api.auth_resolve_identity($1)',[email.login])).rows[0].identity_id,email.identity_id);
  assert.equal((await auth.query('select api.auth_resolve_onboarding_session($1) r',[digest(emailSession)])).rows[0].r,null);
  await denied(activate(emailSession));
  await context(api,{user_id:email.user_id,profile_id:created.profile_id,school_id:created.school_id},async c=>{
   assert.equal((await c.query("select api.check_access('roles.manage') ok")).rows[0].ok,true);
  });
 });
 await check('direct same identity concurrent activation creates only one school',async()=>{
  const other=await connect('auth'),before=await snapshot();
  const results=await Promise.allSettled([activate(phoneSession),activate(phoneSession,school,token(),other)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await snapshot()).schools,before.schools+1);
 });
 await check('direct activation limit serializes failures across sessions of the same identity',async()=>{
  const identity=await create(),sessions=[await session(identity),await session(identity)];
  const contenders=await Promise.all(Array.from({length:8},()=>connect('auth')));
  const results=await Promise.all(contenders.map((client,n)=>client.query('select api.auth_record_activation_attempt($1,false) result',[digest(sessions[n%2])])));
  assert.equal(results.filter(r=>r.rows[0].result==='denied').length,5);
  assert.equal(results.filter(r=>r.rows[0].result==='limited').length,3);
  await assert.rejects(activate(sessions[0]),e=>e.code==='P0429');
  assert.equal((await auth.query('select api.auth_record_activation_attempt($1,true) result',[digest(sessions[1])])).rows[0].result,'limited');
  const bucket='direct-activation:'+identity.identity_id;
  const attempts=(await admin.query('select login,succeeded from auth.login_attempts where login=$1',[bucket])).rows;
  assert.equal(attempts.length,5);assert.ok(attempts.every(r=>r.login===bucket&&!r.succeeded));
  await admin.query("update auth.login_attempts set attempted_at=clock_timestamp()-interval '16 minutes' where login=$1",[bucket]);
  assert.equal((await auth.query('select api.auth_record_activation_attempt($1,true) result',[digest(sessions[0])])).rows[0].result,'allowed');
  assert.equal((await activate(sessions[0])).rows[0].result.status,'completed');
 });
 const {buildNativeApp}=await tsImport(pathToFileURL(path.resolve('server/src/native-app.ts')).href,import.meta.url);
 const {parseEnv}=await tsImport(pathToFileURL(path.resolve('server/src/config/env.ts')).href,import.meta.url);
 const business=await connect('api'),master='Synthetic-Master-Code-2026!',sqlCalls=[];
 const pools={authPool:{query:async(sql,params)=>{sqlCalls.push({sql,params});return auth.query(sql,params);},end:async()=>{}},businessPool:{query:business.query.bind(business),connect:async()=>({query:business.query.bind(business),release(){}}),end:async()=>{}}};
 const app=buildNativeApp(parseEnv({NODE_ENV:'test',SCHOOLSAFE_SCHOOL_ACTIVATION_CODE_SHA256:digest(master)}),pools);
 const cookies=r=>[r.headers['set-cookie']].flat().filter(Boolean);
 const loginNew=async()=>{
  const login='http-'+randomUUID()+'@example.test',password='Synthetic-Direct-2026!';
  const first=await app.inject({method:'POST',url:'/auth/native/login',payload:{login,password}});
  assert.equal(first.statusCode,200,first.body);assert.equal(first.json().code,'ONBOARDING_REQUIRED');
  return {login,password,cookie:cookies(first).find(c=>c.startsWith('schoolsafe_onboarding=')).split(';')[0]};
 };
 const submit=(account,code=master,target=app)=>target.inject({method:'POST',url:'/auth/onboarding/school',headers:{cookie:account.cookie},payload:{...school,activation_code:code}});
 try {
  await check('master missing or malformed server configuration fails closed with no SQL',async()=>{
   const account=await loginNew();
   for(const secret of [undefined,'malformed','A'.repeat(64)]) {
    const unavailable=buildNativeApp(parseEnv({NODE_ENV:'test',SCHOOLSAFE_SCHOOL_ACTIVATION_CODE_SHA256:secret}),pools);
    try{const before=sqlCalls.length,r=await submit(account,master,unavailable);assert.equal(r.statusCode,503);assert.equal(r.json().code,'DEPENDENCY_UNAVAILABLE');assert.equal(sqlCalls.length,before);}finally{await unavailable.close();}
   }
  });
  await check('master five wrong codes persist, sixth and correct code while locked return 429',async()=>{
   const account=await loginNew(),before=await snapshot();
   for(let n=0;n<5;n++) {const r=await submit(account,'Wrong-Code-'+n);assert.equal(r.statusCode,403);assert.equal(r.json().message,'Code d’activation incorrect.');}
   for(const code of ['Wrong-Code-6',master]) {const r=await submit(account,code);assert.equal(r.statusCode,429);assert.equal(r.json().code,'RATE_LIMITED');}
   assert.deepEqual(await snapshot(),before);
   const attempts=(await admin.query("select l.login,l.succeeded from auth.login_attempts l join auth.identities i on l.login='direct-activation:'||i.id::text where i.email=$1",[account.login])).rows;
   assert.equal(attempts.length,5);assert.ok(attempts.every(r=>!r.succeeded));
  });
  await check('master same code creates two distinct schools without setup authorization and opens workspace',async()=>{
   const authorizations=(await admin.query('select * from auth.setup_authorizations order by token_hash')).rows;
   assert.ok(!authorizations.some(row=>row.token_hash===digest(master)));
   const results=[];
   for(let n=0;n<2;n++) {
    const account=await loginNew();
    assert.equal((await app.inject({url:'/native/session/bootstrap',headers:{cookie:account.cookie}})).statusCode,401);
    const wrong=await app.inject({method:'POST',url:'/auth/native/login',payload:{login:account.login,password:'Wrong-password-123'}});assert.equal(wrong.statusCode,401);
    const response=await submit(account);assert.equal(response.statusCode,201,response.body);assert.ok(!response.body.includes('token'));
    results.push(response.json());
    const ordinary=cookies(response).find(c=>c.startsWith('schoolsafe_session='));assert.ok(ordinary.includes('HttpOnly'));
    const cookie=ordinary.split(';')[0];
    const me=await app.inject({url:'/auth/native/me',headers:{cookie}});assert.equal(me.statusCode,200);assert.equal(me.json().profile_id,response.json().profile_id);
    const bootstrap=await app.inject({url:'/native/session/bootstrap',headers:{cookie}});assert.equal(bootstrap.statusCode,200,bootstrap.body);assert.ok(bootstrap.json().data);
    const loginAgain=await app.inject({method:'POST',url:'/auth/native/login',payload:{login:account.login,password:account.password}});assert.equal(loginAgain.statusCode,200);assert.equal(loginAgain.json().profile_id,response.json().profile_id);
    assert.equal((await submit(account)).statusCode,403);
   }
   assert.notEqual(results[0].school_id,results[1].school_id);assert.notEqual(results[0].profile_id,results[1].profile_id);
   assert.deepEqual((await admin.query('select * from auth.setup_authorizations order by token_hash')).rows,authorizations);
   const years=(await admin.query('select id from app.academic_years where school_id=any($1::uuid[])',[results.map(r=>r.school_id)])).rows;
   assert.equal(years.length,2);assert.notEqual(years[0].id,years[1].id);
   assert.equal((await admin.query('select count(*)::int n from auth.direct_onboarding_accounts where activating_school_id is not null or activating_txid is not null')).rows[0].n,0);
   assert.ok(!JSON.stringify(sqlCalls).includes(master));assert.ok(!JSON.stringify(sqlCalls).includes(digest(master)));
   assert.ok(!JSON.stringify(sqlCalls).includes('Wrong-Code'));
   for(const call of sqlCalls.filter(c=>c.sql.includes('auth_activate_school')))assert.equal(call.params.length,3);
   console.log('FIRST_SCHOOL_WITH_TEST_CODE='+results[0].school_id+' SECOND_SCHOOL_WITH_SAME_TEST_CODE='+results[1].school_id);
  });
 }finally{await app.close();}
}
