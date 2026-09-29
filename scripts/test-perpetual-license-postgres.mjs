import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

const url=new URL(process.env.LICENSE_TEST_DATABASE_URL);
assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
assert.match(url.pathname,/^\/schoolsafe_test_[a-z0-9_]+$/);
const client=new pg.Client({connectionString:url.toString()});
await client.connect();
try {
  await client.query('BEGIN');
  const row={id:randomUUID(),issued:'2026-09-29T00:00:00Z'};
  const insert=(expiry,payload,grace=0)=>client.query(`insert into ops.license_states
    (school_id,signed_token,payload,license_id,status,issued_at,expires_at,grace_days)
    values ($1,'synthetic-db-constraint-test',$2,'synthetic-test','active',$3,$4,$5)`,[row.id,payload,row.issued,expiry,grace]);
  await insert('2027-09-29T00:00:00Z',{});
  await client.query('DELETE FROM ops.license_states WHERE school_id=$1',[row.id]);
  for(const [payload,grace] of [[{},0],[{perpetual:false,expires_at:null},0],[{perpetual:true},0],[{perpetual:'true',expires_at:null},0],[{perpetual:true,expires_at:null},1]]) {
    await client.query('SAVEPOINT rejected');
    await assert.rejects(insert(null,payload,grace),e=>e.code==='23514');
    await client.query('ROLLBACK TO SAVEPOINT rejected');
  }
  await insert(null,{perpetual:true,expires_at:null});
  assert.equal((await client.query('SELECT expires_at FROM ops.license_states WHERE school_id=$1',[row.id])).rows[0].expires_at,null);
  await client.query('SAVEPOINT protected');
  await client.query('SET LOCAL ROLE schoolsafe_api');
  await assert.rejects(client.query('SELECT * FROM ops.license_states'),e=>e.code==='42501');
  await client.query('ROLLBACK TO SAVEPOINT protected');
  const rls=(await client.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='ops.license_states'::regclass")).rows[0];
  assert.deepEqual(rls,{relrowsecurity:true,relforcerowsecurity:true});
  console.log('PERPETUAL_POSTGRES=PASS; dated compatibility, explicit-null checks, API ACL and FORCE RLS; transaction rolled back');
} finally {await client.query('ROLLBACK');await client.end();}
