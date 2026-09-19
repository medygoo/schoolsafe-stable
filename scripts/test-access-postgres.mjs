// Reproducible A2 proof on a fresh, explicitly designated LOCAL test database.
// Does not create/drop a database, install PostgreSQL or touch a running application.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { sha256Sql } from './migration-manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = process.env.SCHOOLSAFE_ACCESS_TEST_URL;
assert.ok(raw, 'Set SCHOOLSAFE_ACCESS_TEST_URL to a dedicated, empty local test database');
const url = new URL(raw);
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.search, '', 'No connection overrides in the test URL');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only loopback test PostgreSQL is allowed');
assert.match(url.pathname, /^\/schoolsafe_access_test(?:_\d+)?$/, 'Dedicated test database name required');
assert.equal(url.username, 'schoolsafe_bootstrap', 'Dedicated bootstrap test identity required');
const psql = process.env.SCHOOLSAFE_PSQL || 'psql';
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: url.pathname.slice(1), PGUSER: url.username, PGPASSWORD: decodeURIComponent(url.password), PGCLIENTENCODING: 'UTF8' };
function runFile(file) {
  const result = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', file], { env, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`SQL failed: ${path.relative(root, file)}\n${result.stderr || result.error?.message}`);
}
const admin = new pg.Client({ connectionString: raw });
await admin.connect();
try {
  assert.equal((await admin.query('show server_version_num')).rows[0].server_version_num, '170011');
  assert.equal((await admin.query("select count(*)::int n from pg_namespace where nspname in ('app','iam','api','auth','ops')")).rows[0].n, 0, 'Database must be empty; never reset an existing database');
  for (const set of ['baseline', 'auth', 'access', 'projections']) {
    const dir = path.join(root, 'database', set, 'v1');
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    const applied = [];
    for (const unit of manifest.units) {
      const file = path.join(dir, unit.file);
      assert.equal(sha256Sql(await readFile(file)), unit.sha256, `Unverified SQL: ${unit.file}`);
      runFile(file);
      applied.push(unit);
      if (set === 'baseline' && unit.order >= 6) {
        for (const prior of unit.order === 6 ? applied : [unit]) {
          await admin.query('insert into ops.schema_versions(unit_order,baseline_version,unit_name,file_name,sha256) values ($1,$2,$3,$4,$5)', [prior.order, manifest.baseline_version, prior.name, prior.file, prior.sha256]);
        }
      }
      console.log(`APPLIED ${set}/${unit.file}`);
    }
  }
  const projection = path.join(root, 'database/projections/v1/04_access_assignment_views.sql');
  runFile(projection); // CREATE OR REPLACE is replayable without changing assignments.
  runFile(path.join(root, 'database/projections/v1/05_session_validity.sql'));
  runFile(path.join(root, 'database/projections/v1/tests/access-read.test.sql'));
  runFile(path.join(root, 'database/access/v1/04_role_assignments.sql'));
  runFile(path.join(root, 'database/access/v1/05_custom_roles.sql'));
  runFile(path.join(root, 'database/access/v1/tests/role-assignments.test.sql'));
  console.log('PASS access SQL: real PostgreSQL 17.11, API role, two schools, no persisted fixture');
} finally { await admin.end(); }
