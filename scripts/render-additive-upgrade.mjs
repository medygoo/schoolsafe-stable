import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {loadInstallationPlan,repositoryRoot,transactionalSql} from './installation-plan.mjs';

export const historicalPlanCommit='ee57304883d2d370aaa17ea53bfecffa27f1a8d3';
const historicalIdentityDigest='9c5d54331e9bd8d2da9d3771d7258ee34eb0c021aa499da0e5cebdcb45c0dc61';
const identityDigest=rows=>createHash('sha256').update(rows.map(r=>`${r.unit_order}|${r.file_name}|${r.sha256}`).join('\n')).digest('hex');
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";

export function planAdditiveUpgrade(installed,plan){
 assert.ok(Array.isArray(installed)&&installed.length>0,'UPGRADE_REFUSED: nonempty ledger required');
 assert.ok(installed.length<=plan.units.length,'DOWNGRADE_REFUSED');
 const seen=new Set();
 for(const [i,row] of installed.entries()){
  assert.equal(row.unit_order,i+1,'UPGRADE_REFUSED: installation sequence changed');
  assert.ok(!seen.has(row.file_name),'UPGRADE_REFUSED: duplicate historical file');seen.add(row.file_name);
  const unit=plan.units.find(u=>u.file===row.file_name);
  assert.ok(unit&&unit.sha256===row.sha256,'UPGRADE_REFUSED: immutable migration identity changed');
 }
 const historical=installed.length>=48&&identityDigest(installed.slice(0,48))===historicalIdentityDigest;
 const segments=historical?[installed.slice(0,48),installed.slice(48)]:[installed];
 for(const segment of segments){
  let previous=0;
  for(const row of segment){const order=plan.units.find(u=>u.file===row.file_name).order;
   assert.ok(order>previous,'UPGRADE_REFUSED: historical relative order inverted');previous=order;
  }
 }
 // The production lineage is pinned; an unknown 48-unit history is never accepted.
 if(installed.length===48)assert.ok(historical,'UPGRADE_REFUSED: unrecognized historical lineage');
 return {missing:plan.units.filter(u=>!seen.has(u.file)),historical};
}

export function renderAdditiveUpgrade({installed,root=repositoryRoot}){
 const plan=loadInstallationPlan(root);
 const {missing,historical}=planAdditiveUpgrade(installed,plan);
 const snapshot=installed.map(r=>({unit_order:r.unit_order,file_name:r.file_name,sha256:r.sha256}));
 const sql=[`begin;
select pg_advisory_xact_lock(hashtextextended('schoolsafe-install-v2',0));
set local role schoolsafe_owner;
set local search_path = pg_catalog;
lock table ops.installation_units in share row exclusive mode;
do $ledger_guard$
begin
 if (select server_version_num::int from (select current_setting('server_version_num') server_version_num) s) <> 170011 then
  raise exception 'UPGRADE_REFUSED: PostgreSQL 17.11 required';
 end if;
 if (select coalesce(jsonb_agg(jsonb_build_object('unit_order',unit_order,'file_name',file_name,'sha256',sha256) order by unit_order),'[]'::jsonb) from ops.installation_units)
    is distinct from ${literal(JSON.stringify(snapshot))}::jsonb then
  raise exception 'UPGRADE_REFUSED: ledger changed after validated snapshot';
 end if;
end
$ledger_guard$;`];
 for(const [i,unit] of missing.entries()){
  sql.push(`-- APPLY ${unit.order} ${unit.file}\n`+transactionalSql(fs.readFileSync(path.join(root,unit.file))));
  sql.push('set local role schoolsafe_owner;');
  sql.push(`insert into ops.installation_units(unit_order,file_name,sha256,plan_sha256) values (${installed.length+i+1},${literal(unit.file)},${literal(unit.sha256)},${literal(plan.digest)});`);
 }
 sql.push(`set local role schoolsafe_owner;
do $security_guard$
begin
 if (select pg_get_userbyid(relowner) from pg_class where oid='ops.installation_units'::regclass) <> 'schoolsafe_owner' then
  raise exception 'UPGRADE_REFUSED: unsafe ledger owner';
 end if;
 if exists(select 1 from unnest(array['schoolsafe_api','schoolsafe_auth','schoolsafe_worker','schoolsafe_migrator']) r
   where has_table_privilege(r,'ops.installation_units','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) then
  raise exception 'UPGRADE_REFUSED: direct ledger access';
 end if;
 if (select count(*) from pg_roles where rolname=any(array['schoolsafe_owner','schoolsafe_migrator','schoolsafe_api','schoolsafe_auth','schoolsafe_worker','schoolsafe_auditor'])
   and not rolsuper and not rolbypassrls and not rolcreatedb and not rolcreaterole and not rolreplication) <> 6 then
  raise exception 'UPGRADE_REFUSED: unsafe roles';
 end if;
 if exists(select 1 from unnest(array['schoolsafe_api','schoolsafe_auth','schoolsafe_worker']) r
   where pg_has_role(r,'schoolsafe_owner','MEMBER') or pg_has_role(r,'schoolsafe_migrator','MEMBER')) then
  raise exception 'UPGRADE_REFUSED: runtime migration authority';
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in ('app','auth','devicehub') and c.relkind='r' and
   (not c.relrowsecurity or not c.relforcerowsecurity or
    has_table_privilege('schoolsafe_api',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or
    has_table_privilege('schoolsafe_auth',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))) then
  raise exception 'UPGRADE_REFUSED: RLS or runtime privileges';
 end if;
 if has_table_privilege('schoolsafe_migrator','auth.setup_authorizations','SELECT') or
    has_schema_privilege('schoolsafe_migrator','auth','USAGE') then
  raise exception 'UPGRADE_REFUSED: direct setup authorization access';
 end if;
end
$security_guard$;`);
 if(missing.length)sql.push(`update ops.installation_units set plan_sha256=${literal(plan.digest)};`);
 sql.push(`commit;\nselect '${missing.length?'DATABASE_UPGRADE=PASS':'ALREADY_CURRENT'}' as result, ${missing.length} as applied_units, '${historical?historicalPlanCommit:'current-plan'}' as lineage;`);
 return sql.join('\n')+'\n';
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2);
  assert.ok(args.length===2&&args[0]==='--installed-units'&&/^[1-9][0-9]*$/.test(args[1]),'Usage: --installed-units N; ledger JSON required on stdin');
  const installed=JSON.parse(fs.readFileSync(0,'utf8'));
  assert.equal(installed.length,Number(args[1]),'UPGRADE_REFUSED: ledger count differs');
  process.stdout.write(renderAdditiveUpgrade({installed}));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
