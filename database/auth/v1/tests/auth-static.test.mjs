import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.resolve(here, "..");

async function readUnit(name) {
  return readFile(path.join(authDir, name), "utf8");
}

test("auth units are atomic and stop on error", async () => {
  for (const name of ["01_auth_tables.sql", "02_auth_api.sql"]) {
    const sql = await readUnit(name);
    assert.match(sql, /\\set ON_ERROR_STOP on/);
    assert.equal((sql.match(/^begin;$/gim) ?? []).length, 1);
    assert.equal((sql.match(/^commit;$/gim) ?? []).length, 1);
  }
});

test("auth schema stores no plaintext secrets and hashes sessions", async () => {
  const tables = await readUnit("01_auth_tables.sql");
  assert.match(tables, /password_hash/);
  assert.match(tables, /token_hash/);
  assert.doesNotMatch(tables, /\bpassword\s+text\b/i);
  assert.doesNotMatch(tables, /\btoken\s+text\b/i);
  assert.match(tables, /references iam\.users/);
});

test("sessions carry the exact chosen profile (no ambiguous LIMIT 1)", async () => {
  const tables = await readUnit("01_auth_tables.sql");
  assert.match(tables, /profile_id uuid not null references iam\.profiles \(id\)/);

  const api = await readUnit("02_auth_api.sql");
  assert.match(api, /join iam\.profiles p on p\.id = s\.profile_id/);
  assert.doesNotMatch(api, /auth_resolve_session[\s\S]*?limit 1/i);
  assert.match(api, /p\.user_id = v_identity\.user_id\s+and p\.is_active = true/);
});

test("auth tables are FORCE RLS with zero policy (defense in depth)", async () => {
  const tables = await readUnit("01_auth_tables.sql");
  const enables = tables.match(/enable row level security/g) ?? [];
  const forces = tables.match(/force row level security/g) ?? [];
  assert.ok(enables.length >= 1);
  assert.ok(forces.length >= 1);
  assert.doesNotMatch(tables, /create policy/i);
});

test("a canonical normalize_login feeds resolution, lock and attempt log", async () => {
  const api = await readUnit("02_auth_api.sql");
  assert.match(api, /create or replace function auth\.normalize_login/);
  const uses = api.match(/auth\.normalize_login/g) ?? [];
  assert.ok(uses.length >= 4, "normalize_login utilisé par les 3 fonctions + définition");
  assert.match(api, /regexp_replace\(v, '\\D', '', 'g'\)/);
  assert.match(api, /pg_catalog\.lower\(v\)/);
});

test("auth functions are granted to schoolsafe_auth, never to schoolsafe_api", async () => {
  const api = await readUnit("02_auth_api.sql");
  assert.match(api, /create role schoolsafe_auth login/);
  assert.match(api, /revoke all on all tables in schema auth from schoolsafe_api/);
  assert.doesNotMatch(api, /grant execute[\s\S]{0,120}to schoolsafe_api/i);
  const grants = api.match(/grant execute on function api\.\w+\([^)]*\) to schoolsafe_auth/g) ?? [];
  assert.equal(grants.length, 9);
});

test("auth api is fail-closed and enforces argon2id and token hash shape", async () => {
  const api = await readUnit("02_auth_api.sql");
  assert.match(api, /\$argon2id\$/);
  assert.match(api, /\^\[a-f0-9\]\{64\}/);
  assert.match(api, /status = 'active'/);
  assert.match(api, /revoked_at is null[\s\S]*?expires_at > /);
});

test("sliding expiry is real (touch extends only past mid-life)", async () => {
  const api = await readUnit("02_auth_api.sql");
  assert.match(api, /create or replace function api\.auth_touch_session/);
  assert.match(api, /expires_at < pg_catalog\.now\(\) \+ pg_catalog\.make_interval\(secs => p_ttl_seconds \/ 2\)/);
});
