import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const trialDir = path.resolve(here, "..");

async function readUnit(name) {
  return readFile(path.join(trialDir, name), "utf8");
}

test("trial unit is atomic and stops on error", async () => {
  const sql = await readUnit("01_trial.sql");
  assert.match(sql, /\\set ON_ERROR_STOP on/);
  assert.equal((sql.match(/^begin;$/gim) ?? []).length, 1);
  assert.equal((sql.match(/^commit;$/gim) ?? []).length, 1);
});

test("la licence est tenant-FORCE-RLS, une par école, durées bornées", async () => {
  const sql = await readUnit("01_trial.sql");
  assert.match(sql, /force row level security/);
  assert.match(sql, /school_id uuid not null unique/);
  assert.match(sql, /check \(expires_at > started_at\)/);
  assert.match(sql, /p_trial_days > 90/);
  assert.match(sql, /p_grace_days > 30/);
});

test("la machine à états est active → grace → expired, converted définitif", async () => {
  const sql = await readUnit("01_trial.sql");
  assert.match(sql, /when p_status = 'converted' then 'converted'/);
  assert.match(sql, /when pg_catalog\.now\(\) < p_expires_at then 'active'/);
  assert.match(sql, /when pg_catalog\.now\(\) < p_grace_ends_at then 'grace'/);
  assert.match(sql, /else 'expired'/);
});

test("les opérations sensibles sont migrator-only, auditées, jamais publiques", async () => {
  const sql = await readUnit("01_trial.sql");
  for (const fn of ["trial_start", "trial_reap", "trial_convert"]) {
    assert.match(sql, new RegExp(`grant execute on function ops\\.${fn}\\([a-z, ]*\\) to schoolsafe_migrator`));
    assert.doesNotMatch(sql, new RegExp(`grant execute on function ops\\.${fn}[\\s\\S]{0,80}to public`, "i"));
  }
  assert.match(sql, /'trial\.started'/);
  assert.match(sql, /'trial\.status\.changed'/);
  assert.match(sql, /'trial\.converted'/);
  // jamais de suppression automatique d'école en v1
  assert.doesNotMatch(sql, /delete from app\.schools/i);
});

test("la lecture du statut exige un contexte tenant valide, rien d'autre", async () => {
  const sql = await readUnit("01_trial.sql");
  assert.match(sql, /create or replace function api\.trial_status_read\(\)/);
  assert.match(sql, /iam\.context_is_valid\(\)/);
  assert.match(sql, /grant execute on function api\.trial_status_read\(\) to schoolsafe_api/);
  assert.doesNotMatch(sql, /grant execute on function api\.trial_status_read[\s\S]{0,120}to schoolsafe_auth/);
});

test("la porte applicative est fail-closed (pas de licence = refus)", async () => {
  const sql = await readUnit("01_trial.sql");
  assert.match(sql, /create or replace function iam\.trial_gate\(p_school_id uuid\)/);
  assert.match(sql, /\), false\)/);
});
