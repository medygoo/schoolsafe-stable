import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import pg from 'pg';
import {installSchoolDatabase} from './install-school-db.mjs';
import {repositoryRoot,loadInstallationPlan} from './installation-plan.mjs';
import {sha256Sql} from './migration-manifest.mjs';
export async function proveAtomicRollback({connectionString,database,passwords,log=console.log}){
 assert.match(database,/^schoolsafe_test_[a-z0-9_]+$/);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'schoolsafe-rollback-test-'));
 const probe=new pg.Client({connectionString});await probe.connect();
 try{
  fs.cpSync(path.join(repositoryRoot,'database'),path.join(root,'database'),{recursive:true});
  const plan=loadInstallationPlan(root);const last=plan.units.at(-1);const file=path.join(root,last.file);
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace(/commit;\s*$/i,'select 1/0;\ncommit;\n'));
  const digest=sha256Sql(fs.readFileSync(file));
  const localFile=path.join(path.dirname(file),'manifest.json');const local=JSON.parse(fs.readFileSync(localFile));local.units.at(-1).sha256=digest;
  fs.writeFileSync(localFile,JSON.stringify(local));fs.writeFileSync(path.join(path.dirname(file),'manifest.sha256'),local.units.map(u=>u.sha256+'  '+u.file).join('\n')+'\n');
  const globalFile=path.join(root,'database/installation/v2/manifest.json');const global=JSON.parse(fs.readFileSync(globalFile));global.units.at(-1).sha256=digest;fs.writeFileSync(globalFile,JSON.stringify(global));
  await assert.rejects(installSchoolDatabase({connectionString,database,passwords,mode:'apply',root,log:()=>{}}),e=>e.cause?.code==='22012');
  assert.equal((await probe.query("select count(*)::int n from pg_namespace where nspname not in ('public','information_schema') and nspname not like 'pg_%'")).rows[0].n,0,'Failed installation left partial schemas');
  log('ATOMIC_ROLLBACK PASS: final-unit failure leaves no installed schema');
 }finally{await probe.end();const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('schoolsafe-rollback-test-'));fs.rmSync(resolved,{recursive:true});}
}
