import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {tsImport} from 'tsx/esm/api';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const digest=v=>createHash('sha256').update(v).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
export async function qualifyDirectActivation({admin,auth,api,migrator,connect,check,denied,hash,context}) {
 const create=async(login='control-'+randomUUID()+'@example.test',client=auth,accessId=randomUUID())=>{
  const phone=login.startsWith('+')?login:null;
  const row=(await client.query('select * from api.auth_control_resolve_identity($1,$2,$3)',[accessId,phone?null:login,phone])).rows[0];
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
  const before=await snapshot();email=await create();phone=await create('+243891234567');
  assert.deepEqual(await snapshot(),before);
  assert.equal((await admin.query('select phone,email from auth.identities where id=$1',[phone.identity_id])).rows[0].phone,'+243891234567');
  assert.equal((await auth.query('select * from api.auth_resolve_identity($1)',[email.login])).rowCount,0);
  assert.equal((await admin.query('select count(*)::int n from auth.credentials where identity_id=any($1::uuid[])',[[email.identity_id,phone.identity_id]])).rows[0].n,0);
  emailSession=await session(email);phoneSession=await session(phone);
 });
 await check('Control identity resolution is idempotent and refuses disabled identities or local takeover',async()=>{
  const again=await create(email.login,auth,email.access_id);assert.equal(again.identity_id,email.identity_id);
  await denied(create(email.login));
  await admin.query("update auth.identities set status='disabled' where id=$1",[email.identity_id]);
  await denied(create(email.login,auth,email.access_id));await denied(activate(emailSession));
  await admin.query("update auth.identities set status='active' where id=$1",[email.identity_id]);
 });
 await check('Control admission validates canonical identities and retires public self-admission',async()=>{
  for(const login of ['invalid','+123','x@y','','abc0891234567']) await denied(create(login));
  await denied(auth.query('select * from api.auth_create_direct_identity($1,$2,$3)',[email.login,hash,'198.18.2.3']));
 });
 await check('Control concurrent identity resolution reuses a single local identity',async()=>{
  const other=await connect('auth'),login='race-'+randomUUID()+'@example.test',id=randomUUID();
  const results=await Promise.all([auth,other].map(c=>create(login,c,id)));
  assert.equal(results[0].identity_id,results[1].identity_id);
 });
 await check('direct tables and retired approval RPCs deny runtime access',async()=>{
  for(const c of [auth,api,migrator]) {
   await denied(c.query('select * from auth.direct_onboarding_accounts'));
   await denied(c.query('select * from auth.control_admin_links'));
   await denied(c.query('select auth.control_activation_core($1,$2,$3)',[digest(emailSession),school,digest(token())]));
  }
  await denied(api.query('select * from api.auth_control_resolve_identity($1,$2,$3)',[randomUUID(),email.login,null]));
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
  assert.equal((await auth.query('select * from api.auth_control_link($1)',[email.identity_id])).rows[0].school_id,created.school_id);
  assert.equal((await admin.query('select count(*)::int n from auth.credentials where identity_id=$1',[email.identity_id])).rows[0].n,0);
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

 const {default:Fastify}=await import('fastify');
 const control=Fastify({logger:false}),records=new Map(),bootstrapSecret=token();let bindUnavailable=false;
 control.addHook('onRequest',async(req,reply)=>{if(req.headers['x-schoolsafe-bootstrap-secret']!==bootstrapSecret)return reply.code(401).send({code:'AUTH_INVALID'});});
 control.post('/internal/school-admin-access/verify',async(req,reply)=>{
  const r=[...records.values()].find(r=>[r.email,r.phone].includes(req.body.login));
  if(!r||req.body.password!==r.password)return reply.code(401).send({code:'AUTH_INVALID'});
  if(r.status!=='active')return reply.code(403).send({code:r.status==='suspended'?'ACCESS_SUSPENDED':'ACCESS_REVOKED'});
  return {data:{access_id:r.access_id,status:r.status,school_id:r.school_id,onboarding_required:r.school_id===null,email:r.email,phone:r.phone}};
 });
 control.get('/internal/school-admin-access/:id/status',async(req,reply)=>{
  const r=records.get(req.params.id);if(!r)return reply.code(404).send({code:'NOT_FOUND'});
  return {data:{access_id:r.access_id,status:r.status,school_id:r.school_id}};
 });
 control.post('/internal/school-admin-access/:id/bind-school',async(req,reply)=>{
  if(bindUnavailable)return reply.code(503).send({code:'DEPENDENCY_UNAVAILABLE'});
  const r=records.get(req.params.id);
  if(!r||r.status!=='active')return reply.code(403).send({code:'ACCESS_DENIED'});
  if(r.school_id&&r.school_id!==req.body.school_id)return reply.code(409).send({code:'SCHOOL_BIND_CONFLICT'});
  r.school_id=req.body.school_id;return {data:{access_id:r.access_id,status:r.status,school_id:r.school_id}};
 });
 const controlUrl=await control.listen({host:'127.0.0.1',port:0});
 const {buildNativeApp}=await tsImport(pathToFileURL(path.resolve('server/src/native-app.ts')).href,import.meta.url);
 const {parseEnv}=await tsImport(pathToFileURL(path.resolve('server/src/config/env.ts')).href,import.meta.url);
 const business=await connect('api'),sqlCalls=[];
 const pools={authPool:{query:async(sql,params)=>{sqlCalls.push({sql,params});return auth.query(sql,params);},end:async()=>{}},businessPool:{query:business.query.bind(business),connect:async()=>({query:business.query.bind(business),release(){}}),end:async()=>{}}};
 const app=buildNativeApp(parseEnv({NODE_ENV:'test',CONTROL_APP_URL:controlUrl,SCHOOLSAFE_BOOTSTRAP_SECRET:bootstrapSecret}),pools);
 const cookies=r=>[r.headers['set-cookie']].flat().filter(Boolean);
 const cookieOf=(r,name)=>cookies(r).find(c=>c.startsWith(name+'=')).split(';')[0];
 const login=(account,password=account.password)=>app.inject({method:'POST',url:'/auth/native/login',payload:{login:account.email??account.phone,password}});
 const register=()=>{
  const r={access_id:randomUUID(),email:'http-'+randomUUID()+'@example.test',phone:null,password:'Synthetic-Control-'+token(),status:'active',school_id:null};records.set(r.access_id,r);return r;
 };
 const submit=cookie=>app.inject({method:'POST',url:'/auth/onboarding/school',headers:{cookie},payload:school});
 let account,ordinary,completed;
 try {
  await check('Control unknown login cannot create SchoolSafe identities or schools',async()=>{
   const before=await snapshot(),count=(await admin.query('select count(*)::int n from auth.identities')).rows[0].n;
   const r=await login({email:'unknown@example.test',password:'Synthetic-Unknown-2026!'});assert.equal(r.statusCode,401);assert.equal(r.headers['set-cookie'],undefined);
   assert.deepEqual(await snapshot(),before);assert.equal((await admin.query('select count(*)::int n from auth.identities')).rows[0].n,count);
  });
  await check('Control ACTIVE first login creates credentialless onboarding then principal and workspace without code',async()=>{
   account=register();const first=await login(account);assert.equal(first.statusCode,200,first.body);assert.equal(first.json().code,'ONBOARDING_REQUIRED');
   const cookie=cookieOf(first,'schoolsafe_onboarding');
   assert.equal((await app.inject({url:'/auth/onboarding/me',headers:{cookie}})).statusCode,200);
   assert.equal((await app.inject({url:'/native/session/bootstrap',headers:{cookie}})).statusCode,401);
   const response=await submit(cookie);assert.equal(response.statusCode,201,response.body);completed=response.json();ordinary=cookieOf(response,'schoolsafe_session');
   assert.equal(account.school_id,completed.school_id);
   const link=(await auth.query('select * from api.auth_control_resolve_identity($1,$2,$3)',[account.access_id,account.email,null])).rows[0];
   assert.equal(link.school_id,completed.school_id);
   assert.equal((await admin.query('select count(*)::int n from auth.credentials where identity_id=$1',[link.identity_id])).rows[0].n,0);
   await context(api,{user_id:link.user_id,profile_id:link.profile_id,school_id:link.school_id},async c=>assert.equal((await c.query("select api.check_access('roles.manage') ok")).rows[0].ok,true));
   const workspace=await app.inject({url:'/native/session/bootstrap',headers:{cookie:ordinary}});assert.equal(workspace.statusCode,200,workspace.body);assert.ok(workspace.json().data);
   assert.equal((await submit(cookie)).statusCode,403);
  });
  await check('Control subsequent login opens the existing workspace directly',async()=>{
   const before=await snapshot(),r=await login(account);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().profile_id,completed.profile_id);assert.notEqual(r.json().code,'ONBOARDING_REQUIRED');
   ordinary=cookieOf(r,'schoolsafe_session');assert.equal((await snapshot()).schools,before.schools);
  });
  for(const status of ['suspended','revoked'])await check('Control '+status+' blocks login and revokes open sessions',async()=>{
   account.status=status;
   assert.equal((await login(account)).statusCode,403);
   const r=await app.inject({url:'/native/session/bootstrap',headers:{cookie:ordinary}});assert.ok([401,403].includes(r.statusCode),r.body);
   assert.equal((await auth.query('select * from api.auth_resolve_session($1)',[digest(ordinary.split('=')[1])])).rowCount,0);
   account.status='active';ordinary=cookieOf(await login(account),'schoolsafe_session');
  });
  await check('Control bind outage commits one school and next login repairs bind without duplication',async()=>{
   const r=register();r.phone='+243899123456';r.email=null;
   const first=await login(r);assert.equal(first.statusCode,200,first.body);const cookie=cookieOf(first,'schoolsafe_onboarding');
   const before=await snapshot();bindUnavailable=true;
   const made=await submit(cookie);assert.equal(made.statusCode,201,made.body);assert.equal(r.school_id,null);
   const workspace=await app.inject({url:'/native/session/bootstrap',headers:{cookie:cookieOf(made,'schoolsafe_session')}});assert.equal(workspace.statusCode,200,workspace.body);
   const outageLogin=await login(r);assert.equal(outageLogin.statusCode,200,outageLogin.body);assert.equal(outageLogin.json().profile_id,made.json().profile_id);
   bindUnavailable=false;
   const retry=await login(r);assert.equal(retry.statusCode,200,retry.body);assert.equal(r.school_id,made.json().school_id);assert.equal((await snapshot()).schools,before.schools+1);
  });
  await check('Existing local school users still authenticate after Control AUTH_INVALID',async()=>{
   const {hashPassword}=await tsImport(pathToFileURL(path.resolve('server/src/authnative/passwords.ts')).href,import.meta.url);
   const user=randomUUID(),identity=randomUUID(),profile=randomUUID(),email='local-'+randomUUID()+'@example.test',password='Synthetic-Local-'+token();
   await admin.query('insert into iam.users(id,email) values($1,$2)',[user,email]);
   await admin.query('insert into iam.profiles(id,user_id,school_id,display_name) values($1,$2,$3,$4)',[profile,user,completed.school_id,'Local school staff']);
   await admin.query('insert into auth.identities(id,user_id,email) values($1,$2,$3)',[identity,user,email]);
   await admin.query('insert into auth.credentials(identity_id,password_hash) values($1,$2)',[identity,await hashPassword(password)]);
   const r=await login({email,password});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().profile_id,profile);
   const localCookie=cookieOf(r,'schoolsafe_session');
   const me=await app.inject({url:'/auth/native/me',headers:{cookie:localCookie}});assert.equal(me.statusCode,200,me.body);
   assert.equal((await auth.query('select * from api.auth_control_link($1)',[identity])).rowCount,0);
  });
  await check('Control passwords hashes and bootstrap secrets never enter SchoolSafe SQL',async()=>{
   const dump=JSON.stringify(sqlCalls);assert.ok(!dump.includes(bootstrapSecret));
   for(const r of records.values()){assert.ok(!dump.includes(r.password));assert.ok(!dump.includes(digest(r.password)));}
   assert.equal((await admin.query('select count(*)::int n from auth.credentials c join auth.control_admin_links l on l.identity_id=c.identity_id')).rows[0].n,0);
  });
 }finally{await app.close();await control.close();}
}
