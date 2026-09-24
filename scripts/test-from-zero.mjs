import {proveAtomicRollback} from './test-installer-rollback.mjs';
import assert from 'node:assert/strict';
import {installSchoolDatabase} from './install-school-db.mjs';
import {qualifyInstallation} from './test-installation-v2-postgres.mjs';
import {runRlsTests} from './run-rls-tests.mjs';
const connectionString=process.env.DATABASE_URL;
try{
 const url=new URL(connectionString);const database=decodeURIComponent(url.pathname.slice(1));
 assert.match(database,/^schoolsafe_test_[a-z0-9_]+$/);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const passwords=Object.fromEntries(['api','auth','worker','migrator'].map(r=>[r,process.env['SCHOOLSAFE_'+r.toUpperCase()+'_PASSWORD']]));
 const check=await installSchoolDatabase({connectionString,database,mode:'check'});
 assert.equal(check.status,'empty','From-zero requires an empty disposable database');
 await proveAtomicRollback({connectionString,database,passwords});
 await installSchoolDatabase({connectionString,database,mode:'apply',passwords});
 const second=await installSchoolDatabase({connectionString,database,mode:'apply',passwords});
 assert.equal(second.status,'installed','Identical second install must be a no-op');
 runRlsTests(connectionString);
 await qualifyInstallation({connectionString,passwords});
 console.log('FROM_ZERO PASS');
}catch(error){console.error('FROM_ZERO FAIL: '+error.message);if(process.env.SCHOOLSAFE_TEST_DEBUG==='1')console.error(error.cause?.message??'');process.exitCode=1;}
