import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projDir = path.resolve(here, "..");

async function readUnit(name) {
  return readFile(path.join(projDir, name), "utf8");
}

test("projection unit is atomic and stops on error", async () => {
  const sql = await readUnit("01_student_read.sql");
  assert.match(sql, /\\set ON_ERROR_STOP on/);
  assert.equal((sql.match(/^begin;$/gim) ?? []).length, 1);
  assert.equal((sql.match(/^commit;$/gim) ?? []).length, 1);
});

test("student_read enforces Access_Law before returning anything", async () => {
  const sql = await readUnit("01_student_read.sql");
  assert.match(sql, /iam\.require_access\('school\.student\.read'/);
  // la classe est résolue côté serveur, jamais fournie par le client
  assert.match(sql, /from app\.student_enrollments e[\s\S]*?e\.status = 'active'/);
  assert.doesNotMatch(sql, /p_class_id/);
});

test("student_read returns a filtered projection, never the raw row", async () => {
  const sql = await readUnit("01_student_read.sql");
  assert.match(sql, /jsonb_build_object\(/);
  assert.doesNotMatch(sql, /return pg_catalog\.to_jsonb\(v_student\)/);
  assert.doesNotMatch(sql, /photo_path/);
  assert.doesNotMatch(sql, /return v_student/);
});

test("student_read refuses a student of another school", async () => {
  const sql = await readUnit("01_student_read.sql");
  assert.match(sql, /s\.school_id = v_school_id/);
  assert.match(sql, /Student not found in the active school/);
});

test("execute is granted to schoolsafe_api only, never public", async () => {
  const sql = await readUnit("01_student_read.sql");
  assert.match(sql, /grant execute on function api\.student_read\(uuid\) to schoolsafe_api/);
  assert.doesNotMatch(sql, /to public/i);
  assert.doesNotMatch(sql, /to schoolsafe_auth/i);
});

test("session_bootstrap: contexte valide exigé, DENY prioritaires, API seule", async () => {
  const sql = await readUnit("02_session_bootstrap.sql");
  assert.match(sql, /\\set ON_ERROR_STOP on/);
  assert.match(sql, /iam\.context_is_valid\(\)/);
  assert.match(sql, /g\.effect = 'allow'/);
  assert.match(sql, /dg\.effect = 'deny'/);
  assert.match(sql, /'childIds'/);
  assert.match(sql, /'assignedPortalIds'/);
  // Contrat canonique des portées : {permission, type, target} — jamais sans permission
  assert.match(sql, /jsonb_build_object\('permission', p\.code, 'type', gs\.scope_code, 'target', gs\.target_id\)/);
  // INC-6 : les exceptions portent leurs portées canoniques (iam.exception_scopes)
  assert.match(sql, /from iam\.exception_scopes es/);
  assert.match(sql, /'scopes', coalesce/);
  assert.match(sql, /grant execute on function api\.session_bootstrap\(\) to schoolsafe_api/);
  assert.doesNotMatch(sql, /to public/i);
  assert.doesNotMatch(sql, /to schoolsafe_auth/i);
});
