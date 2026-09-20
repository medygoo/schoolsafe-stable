import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {validateTarget} from './install-school-db.mjs';
import {repositoryRoot} from './installation-plan.mjs';
export function runRlsTests(connectionString,log=console.log){
 const url=new URL(connectionString),database=decodeURIComponent(url.pathname.slice(1));
 if(!/^schoolsafe_test_[a-z0-9_]+$/.test(database)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Local disposable test database required');
 validateTarget(connectionString,database);
 const files=['baseline/v1/tests/from-zero-access-law.test.sql','installation/v2/tests/bootstrap.test.sql',
  'installation/v2/tests/school-replay.test.sql','access/v1/tests/role-assignments.test.sql',
  'access/v1/tests/fee-control.test.sql','projections/v1/tests/access-read.test.sql'];
 for(const file of files){
  const result=spawnSync(process.env.PSQL_BIN??'psql',['-X','-q','-v','ON_ERROR_STOP=1','-f',path.join(repositoryRoot,'database',file)],{
   encoding:'utf8',env:{...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:database,PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)},maxBuffer:4*1024*1024});
  if(result.status!==0)throw new Error('RLS FAIL: '+file,{cause:new Error(result.stderr||'psql unavailable')});
  log('RLS PASS: '+file);
 }
 return files.length;
}
if(process.argv[1]?.endsWith('run-rls-tests.mjs')){
 try{runRlsTests(process.env.DATABASE_URL);}catch(error){console.error(error.message);process.exitCode=1;}
}
