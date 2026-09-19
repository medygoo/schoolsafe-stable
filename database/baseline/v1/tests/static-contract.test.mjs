import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselineDir = path.resolve(here, "..");
const repoRoot = path.resolve(baselineDir, "..", "..", "..");

const units = [
  "01_roles.sql",
  "02_schemas.sql",
  "03_extensions.sql",
  "04_app_tables.sql",
  "05_iam.sql",
  "06_audit_ops.sql",
  "07_constraints_indexes.sql",
  "08_internal_functions.sql",
  "09_api_rpc.sql",
  "10_triggers.sql",
  "11_rls_acl.sql",
  "12_seed_permissions.sql",
  "13_verification.sql",
];

const canonicalScopes = [
  "assigned_classes",
  "assigned_portal",
  "assigned_subjects",
  "none",
  "own",
  "own_children",
  "school",
];

const p0Functions = [
  "deactivate_other_academic_years",
  "next_document_number",
  "ensure_receipt_number",
  "record_payment",
  "cancel_payment",
  "increment_card_print_count",
  "create_student_draft",
  "compensate_student_draft_creation",
];

async function readUnits() {
  return Promise.all(
    units.map(async (name) => ({
      name,
      sql: await readFile(path.join(baselineDir, name), "utf8"),
    })),
  );
}

function extractValues(sql, marker) {
  const start = sql.indexOf(marker);
  assert.notEqual(start, -1, `missing seed marker ${marker}`);
  const tail = sql.slice(start + marker.length);
  const end = tail.indexOf("-- END CANONICAL SEED");
  assert.notEqual(end, -1, `missing end marker for ${marker}`);
  return [...tail.slice(0, end).matchAll(/\('([^']+)'\s*,/g)].map((match) => match[1]);
}

test("baseline exposes exactly the 13 ordered units", async () => {
  const files = (await readdir(baselineDir))
    .filter((name) => /^\d{2}_.+\.sql$/.test(name))
    .sort();
  assert.deepEqual(files, units);
});

test("baseline uses PostgreSQL transaction context and never Supabase auth.uid", async () => {
  const allSql = (await readUnits()).map(({ sql }) => sql).join("\n");
  for (const setting of ["user_id", "profile_id", "school_id", "request_id"]) {
    assert.match(allSql, new RegExp(`schoolsafe\\.${setting}`, "i"));
  }
  assert.doesNotMatch(allSql, /auth\.uid\s*\(/i);
  assert.doesNotMatch(allSql, /\b(?:anon|authenticated|service_role)\b/i);
});

test("all SchoolSafe SQL roles are explicitly NOBYPASSRLS", async () => {
  const rolesSql = await readFile(path.join(baselineDir, "01_roles.sql"), "utf8");
  for (const role of [
    "schoolsafe_owner",
    "schoolsafe_migrator",
    "schoolsafe_api",
    "schoolsafe_worker",
    "schoolsafe_auditor",
  ]) {
    const block = new RegExp(`ALTER ROLE ${role}[\\s\\S]{0,220}?NOBYPASSRLS`, "i");
    assert.match(rolesSql, block, `${role} must be NOBYPASSRLS`);
  }
});

test("only migrator, API and worker are LOGIN roles and no password is embedded", async () => {
  const rolesSql = await readFile(path.join(baselineDir, "01_roles.sql"), "utf8");
  const allSql = (await readUnits()).map(({ sql }) => sql).join("\n");
  const runner = await readFile(
    path.join(baselineDir, "scripts", "run-from-zero-test.sh"),
    "utf8",
  );
  for (const role of ["schoolsafe_migrator", "schoolsafe_api", "schoolsafe_worker"]) {
    assert.match(rolesSql, new RegExp(`alter role ${role} with login`, "i"));
  }
  for (const role of ["schoolsafe_owner", "schoolsafe_auditor"]) {
    assert.match(rolesSql, new RegExp(`alter role ${role} with nologin`, "i"));
  }
  assert.doesNotMatch(rolesSql, /\bpassword\b/i);
  assert.doesNotMatch(allSql, /\b(?:create|alter)\s+role[^;]*\bpassword\b/i);
  assert.doesNotMatch(runner, /(?:--env\s+|\bexport\s+)POSTGRES_PASSWORD=/i);
  assert.match(runner, /postgres_bootstrap_password/);
});

test("seed matches the canonical 64 permissions and seven scopes", async () => {
  const catalog = JSON.parse(
    await readFile(path.join(repoRoot, "shared", "permissions.json"), "utf8"),
  );
  assert.equal(catalog.length, 64);

  const seedSql = await readFile(path.join(baselineDir, "12_seed_permissions.sql"), "utf8");
  const seededPermissions = extractValues(seedSql, "-- BEGIN CANONICAL PERMISSIONS");
  const seededScopes = extractValues(seedSql, "-- BEGIN CANONICAL SCOPES");

  assert.equal(new Set(seededPermissions).size, 64);
  assert.deepEqual(seededPermissions.sort(), catalog.map(({ code }) => code).sort());
  assert.deepEqual([...new Set(seededScopes)].sort(), canonicalScopes);
});

test("all eight P0 RPCs derive actor and school from context", async () => {
  const rpcSql = await readFile(path.join(baselineDir, "09_api_rpc.sql"), "utf8");
  for (const functionName of p0Functions) {
    assert.match(rpcSql, new RegExp(`function api\\.${functionName}\\s*\\(`, "i"));
  }
  assert.doesNotMatch(rpcSql, /\bp_(?:actor_profile_id|school_id)\b/i);
  assert.match(rpcSql, /iam\.current_profile_id\s*\(\s*\)/i);
  assert.match(rpcSql, /iam\.current_school_id\s*\(\s*\)/i);
});

test("teacher authorization requires one active exact class-subject assignment", async () => {
  const internalSql = await readFile(path.join(baselineDir, "08_internal_functions.sql"), "utf8");
  assert.match(internalSql, /function iam\.has_exact_teacher_assignment/i);
  assert.match(internalSql, /ta\.class_id\s*=\s*p_class_id/i);
  assert.match(internalSql, /ta\.subject_id\s*=\s*p_subject_id/i);
  assert.match(internalSql, /ta\.is_active\s*=\s*true/i);
  assert.doesNotMatch(internalSql, /ta\.class_id\s*=\s*p_class_id\s+or\s+ta\.subject_id/i);
});

test("tenant-aware tables are forced behind RLS and API gets functions only", async () => {
  const rlsSql = await readFile(path.join(baselineDir, "11_rls_acl.sql"), "utf8");
  assert.match(rlsSql, /force row level security/i);
  assert.match(rlsSql, /revoke all on all tables in schema app from schoolsafe_api/i);
  assert.doesNotMatch(rlsSql, /grant execute on all functions in schema api to schoolsafe_api/i);
  assert.match(rlsSql, /grant execute on function api\.check_access\s*\(/i);
  assert.doesNotMatch(rlsSql, /grant\s+(?:select|insert|update|delete|all)[^;]+to\s+schoolsafe_api/i);
});

test("manifest records a SHA-256 for every unit", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(baselineDir, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.baseline_version, "schoolsafe-vps-v1");
  assert.deepEqual(manifest.units.map(({ file }) => file), units);

  for (const unit of manifest.units) {
    const bytes = await readFile(path.join(baselineDir, unit.file));
    const actual = createHash("sha256").update(bytes).digest("hex");
    assert.equal(unit.sha256, actual, `${unit.file} checksum mismatch`);
  }
});

test("every baseline unit is atomic and configured to stop on SQL errors", async () => {
  for (const { name, sql } of await readUnits()) {
    assert.match(sql, /^\\set ON_ERROR_STOP on\s+/i, `${name} must enable ON_ERROR_STOP`);
    assert.equal((sql.match(/^begin;$/gim) ?? []).length, 1, `${name} must have one BEGIN`);
    assert.equal((sql.match(/^commit;$/gim) ?? []).length, 1, `${name} must have one COMMIT`);
  }
});

test("future runner is TEST-only, refuses public PostgreSQL and performs two passes", async () => {
  const runner = await readFile(
    path.join(baselineDir, "scripts", "run-from-zero-test.sh"),
    "utf8",
  );
  assert.match(runner, /schoolsafe-postgres-test/);
  assert.match(runner, /schoolsafe_test/);
  assert.match(runner, /APPLY_SCHOOLSAFE_TEST_FROM_ZERO/);
  assert.match(runner, /docker port "\$CONTAINER" 5432\/tcp/);
  assert.match(runner, /schoolsafe-test-internal/);
  assert.match(runner, /Second full pass proves SQL-unit idempotence/i);
  assert.match(runner, /from-zero-access-law\.test\.sql/);
  assert.doesNotMatch(runner, /schoolsafe[_-](?:postgres[_-])?prod/i);
});

test("semantic Access_Law test is synthetic and rollback-only", async () => {
  const semanticTest = await readFile(
    path.join(baselineDir, "tests", "from-zero-access-law.test.sql"),
    "utf8",
  );
  assert.match(semanticTest, /missing context must be denied/i);
  assert.match(semanticTest, /exact active class-subject assignment must be allowed/i);
  assert.match(semanticTest, /explicit DENY must override/i);
  assert.match(semanticTest, /parent must be denied for an unlinked child/i);
  assert.match(semanticTest, /example\.invalid/i);
  assert.match(semanticTest, /^rollback;$/im);
  assert.doesNotMatch(semanticTest, /^commit;$/im);
});

test("extension unit and runner block until pg_stat_statements is preloaded", async () => {
  const extensionSql = await readFile(path.join(baselineDir, "03_extensions.sql"), "utf8");
  const runner = await readFile(
    path.join(baselineDir, "scripts", "run-from-zero-test.sh"),
    "utf8",
  );

  assert.match(extensionSql, /shared_preload_libraries/i);
  assert.match(extensionSql, /create extension if not exists pg_stat_statements/i);
  assert.match(extensionSql, /pg_extension/i);

  const preloadGate = runner.indexOf("shared_preload_libraries");
  const firstApply = runner.indexOf('for index in {0..7}');
  assert.notEqual(preloadGate, -1, "runner must inspect shared_preload_libraries");
  assert.ok(preloadGate < firstApply, "preload gate must run before unit 01");
});

test("semantic Access_Law test covers three-school isolation and cross-school denial", async () => {
  const semanticTest = await readFile(
    path.join(baselineDir, "tests", "from-zero-access-law.test.sql"),
    "utf8",
  );

  for (const school of ["School A", "School B", "School C"]) {
    assert.match(semanticTest, new RegExp(`'${school}'`));
  }
  for (const expectedAssertion of [
    "School A must not read School B or C",
    "School B must not read School A or C",
    "School C must not read School A or B",
    "own_children must remain bounded to school_id",
    "assigned class-subject access must remain bounded to school_id",
    "explicit DENY must not cross school boundaries",
    "cross-school RPC resource must be rejected",
    "incoherent injected school context must be denied",
  ]) {
    assert.match(semanticTest, new RegExp(expectedAssertion, "i"));
  }
  assert.doesNotMatch(semanticTest, /create\s+table[^;]*\btrial\b/i);
});

test("critical SQL passes the requested static privilege and definer guards", async () => {
  const allSql = (await readUnits()).map(({ sql }) => sql).join("\n");
  const rolesSql = await readFile(path.join(baselineDir, "01_roles.sql"), "utf8");
  const internalSql = await readFile(path.join(baselineDir, "08_internal_functions.sql"), "utf8");

  assert.doesNotMatch(allSql, /\bauth\.uid\s*\(/i);
  assert.doesNotMatch(allSql, /\bBYPASSRLS\b/i);
  assert.doesNotMatch(rolesSql, /\bSUPERUSER\b/i);
  assert.doesNotMatch(rolesSql, /\bPASSWORD\b/i);
  assert.doesNotMatch(allSql, /\bgrant\b[^;]*\bto\s+public\b/i);
  assert.doesNotMatch(allSql, /\bcreate\s+(?:table|function|view|sequence)\s+(?:if\s+not\s+exists\s+)?public\./i);
  assert.doesNotMatch(allSql, /\bservice_role\b|\bsupabase_[a-z][a-z0-9_]*\b/i);

  const definerFunctions = [...allSql.matchAll(
    /create or replace function[\s\S]*?security definer[\s\S]*?\$schoolsafe\$;/gi,
  )];
  assert.ok(definerFunctions.length > 0);
  for (const [block] of definerFunctions) {
    assert.match(block, /set search_path\s*=\s*pg_catalog/i);
  }

  assert.ok(
    internalSql.indexOf("not iam.has_explicit_deny") < internalSql.indexOf("e.effect = 'allow'"),
    "explicit deny must be evaluated before allow paths",
  );
  assert.doesNotMatch(
    internalSql,
    /assigned_classes[\s\S]{0,200}\bor\b[\s\S]{0,200}assigned_subjects/i,
  );
});
