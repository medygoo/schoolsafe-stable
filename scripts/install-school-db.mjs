#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {planAdditiveUpgrade} from './render-additive-upgrade.mjs';
import {loadInstallationPlan,repositoryRoot,transactionalSql} from './installation-plan.mjs';

export function validateTarget(connectionString,database){
 assert.ok(connectionString,'DATABASE_URL must be supplied explicitly');
 assert.match(database??'',/^schoolsafe(?:_test_[a-z0-9_]+)?$/,'Explicit --database schoolsafe or schoolsafe_test_* required');
 let target;try{target=new URL(connectionString);}catch{throw Error('Invalid PostgreSQL target URL');}
 assert.ok(['postgres:','postgresql:'].includes(target.protocol),'PostgreSQL URL required');
 assert.equal(decodeURIComponent(target.pathname.slice(1)),database,'URL and expected database differ');
 assert.ok(target.hostname&&target.username&&target.password,'Explicit host and bootstrap credentials required');
 assert.ok(!/^schoolsafe_(api|auth|worker)$/.test(decodeURIComponent(target.username)),'Runtime credentials cannot install the database');
 return target;
}

export async function installSchoolDatabase({connectionString,database,mode='check',passwords={},root=repositoryRoot,log=console.log}){
 validateTarget(connectionString,database);
 assert.ok(['check','dry-run','apply'].includes(mode),'Unknown installation mode');
 const plan=loadInstallationPlan(root);
 const sqlUnits=plan.units.map(unit=>({...unit,sql:transactionalSql(fs.readFileSync(path.join(root,unit.file)))}));
 if(mode==='dry-run'){
  for(const unit of sqlUnits)log(`PLAN ${unit.order} ${unit.file} ${unit.sha256}`);
  log('DRY_RUN PASS: manifests verified; no database connection');return {status:'dry-run',units:sqlUnits.length};
 }
 if(mode==='apply'){
  for(const role of ['api','auth','worker','migrator'])assert.ok(typeof passwords[role]==='string'&&passwords[role].length>=32,`Strong ${role} credential required`);
  assert.equal(new Set(Object.values(passwords)).size,4,'Runtime role passwords must be distinct');
 }
 const client=new pg.Client({connectionString,connectionTimeoutMillis:5000,application_name:'schoolsafe-installer-v2'});
 let active='preflight';let transaction=false;
 try{
  await client.connect();
  assert.equal((await client.query('select current_database() name')).rows[0].name,database,'Connected to unexpected database');
  assert.equal((await client.query('show server_version_num')).rows[0].server_version_num,'170011','PostgreSQL 17.11 required');
  assert.ok((await client.query('show shared_preload_libraries')).rows[0].shared_preload_libraries.split(',').map(s=>s.trim()).includes('pg_stat_statements'),'pg_stat_statements must be preloaded');
  assert.ok(['auto','on'].includes((await client.query('show compute_query_id')).rows[0].compute_query_id),'compute_query_id must be auto/on');
  await client.query(mode==='check'?'begin read only':'begin');transaction=true;
  if(mode==='apply')await client.query("select pg_advisory_xact_lock(hashtextextended('schoolsafe-install-v2',0))");
  const ledger=(await client.query("select to_regclass('ops.installation_units') ledger")).rows[0].ledger;
  if(ledger){
   const rows=(await client.query('select unit_order,file_name,sha256,plan_sha256 from ops.installation_units order by unit_order')).rows;
   assert.equal(planAdditiveUpgrade(rows,plan).missing.length,0,'Installed versions differ; use the controlled additive upgrade');
   assert.ok(rows.every(r=>r.plan_sha256===plan.digest),'Installation plan digest differs');
   await verifySecurity(client);
   await client.query('rollback');transaction=false;log('CHECK PASS: exact installation already present; no changes');return {status:'installed',units:rows.length};
  }
  const schemas=(await client.query("select nspname from pg_namespace where nspname not in ('public','information_schema') and nspname not like 'pg_%'")).rows;
  assert.equal(schemas.length,0,'Nonempty/unmanaged database refused; no automatic reset');
  assert.equal((await client.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S')")).rows[0].n,0,'Existing public objects refused');
  if(mode==='check'){await client.query('rollback');transaction=false;log('CHECK PASS: empty compatible target; nothing installed');return {status:'empty',units:0};}
  for(const role of ['api','auth','worker','migrator'])await client.query('select set_config($1,$2,true)',['schoolsafe.install_'+role+'_password',passwords[role]]);
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'database/baseline/v1/manifest.json'),'utf8'));
  for(const unit of sqlUnits){
   active=unit.file;log(`APPLY ${unit.order} ${unit.file}`);
   await client.query('reset role');await client.query(unit.sql);await client.query('reset role');
   if(unit.file.startsWith('database/baseline/v1/')){
    const entry=baseline.units.find(u=>unit.file.endsWith('/'+u.file));
    if(entry.order>=6)for(const record of entry.order===6?baseline.units.slice(0,6):[entry])
     await client.query('insert into ops.schema_versions(unit_order,baseline_version,unit_name,file_name,sha256) values($1,$2,$3,$4,$5)',[record.order,baseline.baseline_version,record.name,record.file,record.sha256]);
   }
  }
  active='security verification';await verifySecurity(client);
  await client.query(`create table ops.installation_units(
   unit_order integer primary key,file_name text not null unique,sha256 text not null,
   plan_sha256 text not null,installed_at timestamptz not null default clock_timestamp());
   alter table ops.installation_units owner to schoolsafe_owner;
   revoke all on ops.installation_units from public,schoolsafe_api,schoolsafe_auth,schoolsafe_worker`);
  for(const unit of plan.units)await client.query('insert into ops.installation_units(unit_order,file_name,sha256,plan_sha256) values($1,$2,$3,$4)',[unit.order,unit.file,unit.sha256,plan.digest]);
  await client.query('commit');transaction=false;log(`INSTALL PASS: ${sqlUnits.length} units committed atomically`);
  return {status:'created',units:sqlUnits.length};
 }catch(error){
  if(transaction)await client.query('rollback').catch(()=>{});
  // Deliberately exclude query text, arguments, connection strings and DB error detail.
  if(error.code&&/^[0-9A-Z]{5}$/.test(error.code))throw Error(`Installation stopped at ${active}; SQLSTATE ${error.code}; transaction rolled back`,{cause:error});
  throw error;
 }finally{await client.end().catch(()=>{});}
}

async function verifySecurity(client){
 const roles=(await client.query("select rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication from pg_roles where rolname=any($1::text[])",[['schoolsafe_owner','schoolsafe_migrator','schoolsafe_api','schoolsafe_worker','schoolsafe_auditor','schoolsafe_auth']])).rows;
 assert.equal(roles.length,6,'All six SchoolSafe roles must exist');
 assert.ok(roles.every(r=>!r.rolsuper&&!r.rolbypassrls&&!r.rolcreatedb&&!r.rolcreaterole&&!r.rolreplication),'Unsafe SchoolSafe SQL role');
 const unsafe=(await client.query(`select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('app','auth','devicehub') and c.relkind='r'
  and (not c.relrowsecurity or not c.relforcerowsecurity
    or has_table_privilege('schoolsafe_api',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    or has_table_privilege('schoolsafe_auth',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))`)).rows;
 assert.deepEqual(unsafe,[],'Business/auth tables must have FORCE RLS and no direct API/auth privileges');
 for(const role of ['schoolsafe_api','schoolsafe_auth']){
  assert.equal((await client.query("select pg_has_role($1,'schoolsafe_owner','MEMBER') or pg_has_role($1,'schoolsafe_migrator','MEMBER') unsafe",[role])).rows[0].unsafe,false,'Runtime role can assume migration authority');
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2);let mode;let database;
  for(let i=0;i<args.length;i++){
   if(['--check','--dry-run','--apply'].includes(args[i])){assert.ok(!mode,'Choose one mode');mode=args[i].slice(2);}
   else if(args[i]==='--database'){assert.ok(!database,'Duplicate database argument');database=args[++i];}
   else throw Error('Usage: DATABASE_URL=<explicit target> node scripts/install-school-db.mjs --database <expected name> --check|--dry-run|--apply');
  }
  assert.ok(mode,'Choose --check, --dry-run or --apply');
  await installSchoolDatabase({connectionString:process.env.DATABASE_URL,database,mode,
   passwords:Object.fromEntries(['api','auth','worker','migrator'].map(r=>[r,process.env['SCHOOLSAFE_'+r.toUpperCase()+'_PASSWORD']]))});
 }catch(error){console.error('INSTALLATION_REFUSED: '+(error instanceof Error?error.message:'failed'));process.exitCode=1;}
}
