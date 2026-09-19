import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const licenseDir = path.resolve(here, "..");

async function readUnit(name) {
  return readFile(path.join(licenseDir, name), "utf8");
}

test("license unit is atomic and stops on error", async () => {
  const sql = await readUnit("01_license.sql");
  assert.match(sql, /\\set ON_ERROR_STOP on/);
  assert.equal((sql.match(/^begin;$/gim) ?? []).length, 1);
  assert.equal((sql.match(/^commit;$/gim) ?? []).length, 1);
});

test("l'état de licence est signé, tenant-forcé et anti-retour d'horloge", async () => {
  const sql = await readUnit("01_license.sql");
  assert.match(sql, /signed_token text not null/);
  assert.match(sql, /last_seen_at timestamptz not null/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /school_id uuid primary key/);
  assert.match(sql, /grace_days integer not null check \(grace_days between 0 and 90\)/);
});

test("revoked est un état signé distinct, jamais un booléen local", async () => {
  const sql = await readUnit("01_license.sql");
  assert.match(sql, /check \(status in \('active', 'suspended', 'revoked'\)\)/);
  assert.doesNotMatch(sql, /is_licensed boolean/i);
});

test("la lecture d'affichage exige un contexte valide, API seule", async () => {
  const sql = await readUnit("01_license.sql");
  assert.match(sql, /iam\.context_is_valid\(\)/);
  assert.match(sql, /grant execute on function api\.license_status_read\(\) to schoolsafe_api/);
  assert.doesNotMatch(sql, /to public/i);
  assert.doesNotMatch(sql, /to schoolsafe_auth/i);
});
