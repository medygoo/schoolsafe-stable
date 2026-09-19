// Local synthetic proof of the historical installation blockers, not a migrator.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import { sha256Sql } from './migration-manifest.mjs';

const database = process.env.SCHOOLSAFE_STABLE_TEST_DATABASE;
assert.match(database || '', /^schoolsafe_access_test_\d+$/, 'Explicit, new synthetic test database required');
const options = { host: '127.0.0.1', port: 55432, user: 'schoolsafe_bootstrap', password: '', connectionTimeoutMillis: 3000 };
const admin = new pg.Client({ ...options, database: 'schoolsafe_access_test_519' });
const sql = file => fs.readFileSync(file, 'utf8').replace(/^\\set ON_ERROR_STOP on\r?\n/, '');
await admin.connect();
try {
  assert.equal((await admin.query('show server_version_num')).rows[0].server_version_num, '170011');
  assert.equal((await admin.query('select count(*)::int n from app.schools')).rows[0].n, 0, 'Reference test database must contain no schools');
  assert.equal((await admin.query('select count(*)::int n from auth.identities')).rows[0].n, 0, 'Reference test database must contain no identities');
  assert.equal((await admin.query('select count(*)::int n from pg_database where datname=$1', [database])).rows[0].n, 0, 'Never overwrite or reset a database');
  await admin.query(`create database "${database}"`); // Name restricted above; isolated cluster only.
} finally { await admin.end(); }

const client = new pg.Client({ ...options, database });
await client.connect();
let installed = 0;
try {
  for (const set of ['baseline', 'auth', 'access', 'projections']) {
    const manifest = JSON.parse(fs.readFileSync(`database/${set}/v1/manifest.json`, 'utf8'));
    const applied = [];
    for (const unit of manifest.units) {
      const file = `database/${set}/v1/${unit.file}`;
      assert.equal(sha256Sql(fs.readFileSync(file)), unit.sha256, file);
      await client.query(sql(file));
      applied.push(unit);
      if (set === 'baseline' && unit.order >= 6) {
        for (const prior of unit.order === 6 ? applied : [unit]) {
          await client.query('insert into ops.schema_versions(unit_order,baseline_version,unit_name,file_name,sha256) values ($1,$2,$3,$4,$5)',
            [prior.order, manifest.baseline_version, prior.name, prior.file, prior.sha256]);
        }
      }
      installed++;
    }
  }
  console.log(`PASS: ${installed} existing foundation units installed; projection 08 last; no business fixture.`);
  await assert.rejects(client.query(sql('database/projections/v1/02_student_list.sql')), error => {
    assert.equal(error.code, '42P13');
    console.log(`EXPECTED BLOCKER student_list: ${error.code} ${error.message}`);
    return true;
  });
  await client.query('rollback');
  assert.equal((await client.query("select to_regprocedure('api.student_list(text,text,uuid,integer,integer)') as fn")).rows[0].fn, null);

  // Do not install provisioning. Create its unchanged function definitions in a
  // transaction solely for an isolated synthetic call, then roll everything back.
  const setup = sql('database/setup/v1/01_setup_native.sql').replace(/commit;\s*$/i, '');
  await client.query(setup);
  await client.query('reset role');
  const schoolId = '91900000-0000-4000-8000-000000000001';
  await client.query("insert into app.schools(id,code,name) values($1,'STABLE-SYNTHETIC','Synthetic installation proof')", [schoolId]);
  await client.query("insert into iam.roles(school_id,code,label) values($1,'super_admin','Historical synthetic role')", [schoolId]);
  await client.query('savepoint setup_probe');
  await assert.rejects(client.query("select api.setup_create_admin($1,'stable-synthetic@example.test','not-a-usable-password-hash','Synthetic','Only',null)", [schoolId]), error => {
    // Record the first failure actually encountered; never invent a deeper proof.
    assert.ok(['23502', '42501'].includes(error.code), error.code);
    console.log(`EXPECTED BLOCKER setup: ${error.code} ${error.message}`);
    return true;
  });
  await client.query('rollback');
  assert.equal((await client.query('select count(*)::int n from app.schools')).rows[0].n, 0);
  assert.equal((await client.query('select count(*)::int n from auth.identities')).rows[0].n, 0);
  assert.equal((await client.query("select to_regprocedure('api.setup_create_admin(uuid,text,text,text,text,text)') as fn")).rows[0].fn, null);
  console.log('PASS: both historical blockers reproduced; zero schools/identities; setup not persisted. Database retained for inspection.');
} finally {
  await client.query('rollback').catch(() => {});
  await client.end();
}
