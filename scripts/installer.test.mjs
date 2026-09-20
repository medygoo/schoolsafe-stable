import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateTarget,installSchoolDatabase} from './install-school-db.mjs';
import {loadInstallationPlan,transactionalSql,repositoryRoot} from './installation-plan.mjs';
const target='postgresql://bootstrap:synthetic-password@127.0.0.1:5432/schoolsafe_test_contract';
test('target must be explicit and match expected SchoolSafe database',()=>{
 for(const [url,name] of [[undefined,'schoolsafe'],[target,'schoolsafe'],[target,'control'],[target.replace('postgresql:','https:'),'schoolsafe_test_contract'],[target.replace('bootstrap:','schoolsafe_api:'),'schoolsafe_test_contract'],[target.replace(':synthetic-password',''),'schoolsafe_test_contract']])assert.throws(()=>validateTarget(url,name));
 assert.ok(validateTarget(target,'schoolsafe_test_contract'));
});
test('dry-run verifies all units without connecting even to an unavailable server',async()=>{
 const lines=[];const result=await installSchoolDatabase({connectionString:target,database:'schoolsafe_test_contract',mode:'dry-run',log:line=>lines.push(line)});
 assert.equal(result.status,'dry-run');assert.equal(result.units,loadInstallationPlan().units.length);assert.ok(!lines.join('\n').includes('synthetic-password'));
});
test('framing refuses additional transaction boundaries and psql execution',()=>{
 assert.throws(()=>transactionalSql('begin;\ncommit;\nbegin;\nselect 1;\ncommit;'));
 assert.throws(()=>transactionalSql('begin;\n\\! echo unsafe\ncommit;'));
});
test('checksums reject a tampered additive SQL unit',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'schoolsafe-manifest-test-'));
 try{fs.cpSync(path.join(repositoryRoot,'database'),path.join(directory,'database'),{recursive:true});
  fs.appendFileSync(path.join(directory,'database/setup/v2/01_setup_native.sql'),'\nselect 1;\n');assert.throws(()=>loadInstallationPlan(directory),/Checksum mismatch/);
 }finally{const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('schoolsafe-manifest-test-'));fs.rmSync(resolved,{recursive:true});}
});
