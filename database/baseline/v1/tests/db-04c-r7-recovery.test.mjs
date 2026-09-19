import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselineDir = path.resolve(here, "..");
const wrapperPath = path.join(
  baselineDir,
  "scripts",
  "schoolsafe-db-test-apply-baseline",
);

async function readBaseline(name) {
  return readFile(path.join(baselineDir, name), "utf8");
}

test("unit 10 uses a non-reserved VALUES alias and remains atomic", async () => {
  const sql = await readBaseline("10_triggers.sql");

  assert.doesNotMatch(sql, /\bas\s+references\s*\(/i);
  assert.match(
    sql,
    /\bas\s+tenant_refs\s*\(table_name,\s*column_name,\s*reference_table\s*\)/i,
  );
  assert.equal((sql.match(/^begin;$/gim) ?? []).length, 1);
  assert.equal((sql.match(/^commit;$/gim) ?? []).length, 1);
});

test("unit 10 trigger definitions remain idempotent", async () => {
  const sql = await readBaseline("10_triggers.sql");
  const functions = [
    "ops.set_updated_at",
    "app.guard_same_school_reference",
    "app.validate_student_enrollment",
    "app.project_active_enrollment_class",
    "app.require_operational_student",
    "audit.capture_access_change",
    "audit.prevent_event_mutation",
  ];

  for (const functionName of functions) {
    assert.match(
      sql,
      new RegExp(`create\\s+or\\s+replace\\s+function\\s+${functionName.replace(".", "\\.")}\\s*\\(`, "i"),
    );
  }
  assert.match(sql, /drop trigger if exists student_enrollments_validate/i);
  assert.match(sql, /drop trigger if exists student_enrollments_project_class/i);
  assert.match(sql, /drop trigger if exists audit_events_immutable/i);
  assert.match(sql, /drop trigger if exists %I on %s/i);
});

test("wrapper exposes only the five reviewed recovery states", async () => {
  const wrapper = await readFile(wrapperPath, "utf8");
  const states = [...wrapper.matchAll(/preapply_state=([A-Z0-9_]+)/g)].map(
    (match) => match[1],
  );

  assert.deepEqual(states.sort(), [
    "FROM_ZERO",
    "SAFE_PARTIAL_UNIT01",
    "SAFE_PARTIAL_UNIT09",
    "SAFE_PARTIAL_UNIT12",
    "SAFE_PARTIAL_UNIT13",
  ]);
  assert.doesNotMatch(wrapper, /BASELINE_SOURCE_GIT_SHA/);
});

test("SAFE_PARTIAL_UNIT13 requires exact versions 1 through 13 and re-verifies only", async () => {
  const wrapper = await readFile(wrapperPath, "utf8");
  const manifest = JSON.parse(await readBaseline("manifest.json"));

  assert.match(wrapper, /preapply_state=SAFE_PARTIAL_UNIT13/);
  assert.match(wrapper, /exact recovered schema versions 1 through 13/);
  assert.match(wrapper, /FIRST_PASS_START_INDEX=13/);
  assert.match(wrapper, /verify-13-only/);
  for (const unit of manifest.units) {
    assert.match(wrapper, new RegExp(unit.sha256));
  }
});

test("SAFE_PARTIAL_UNIT12 requires exact versions 1 through 12 and applies only unit 13", async () => {
  const wrapper = await readFile(wrapperPath, "utf8");
  const manifest = JSON.parse(await readBaseline("manifest.json"));
  const firstTwelve = manifest.units.slice(0, 12);

  assert.match(wrapper, /preapply_state=SAFE_PARTIAL_UNIT12/);
  assert.match(wrapper, /exact recovered schema versions 1 through 12/);
  assert.match(wrapper, /FIRST_PASS_START_INDEX=12/);
  assert.match(wrapper, /apply-13-only/);
  for (const unit of firstTwelve) {
    assert.match(wrapper, new RegExp(unit.file.replace(".", "\\.")));
    assert.match(wrapper, new RegExp(unit.sha256));
  }
  assert.match(wrapper, /permission seed presence[\s\S]*?'60'/i);
  assert.match(wrapper, /scope seed presence[\s\S]*?'7'/i);
});

test("SAFE_PARTIAL_UNIT09 requires exact versions 1 through 9 from the manifest", async () => {
  const wrapper = await readFile(wrapperPath, "utf8");
  const manifest = JSON.parse(await readBaseline("manifest.json"));
  const firstNine = manifest.units.slice(0, 9);

  assert.match(wrapper, /preapply_state=SAFE_PARTIAL_UNIT09/);
  assert.match(wrapper, /schema version row count[\s\S]*?'9'/i);
  assert.match(wrapper, /exact recovered schema versions 1 through 9[\s\S]*?'9'/i);
  for (const unit of firstNine) {
    assert.match(wrapper, new RegExp(unit.file.replace(".", "\\.")));
    assert.match(wrapper, new RegExp(unit.sha256));
  }
  assert.match(wrapper, /baseline_version\s*=\s*'schoolsafe-vps-v1'/i);
});

test("SAFE_PARTIAL_UNIT09 rejects unit 10 residue and units 11 or 12 state", async () => {
  const wrapper = await readFile(wrapperPath, "utf8");
  for (const functionName of [
    "set_updated_at",
    "guard_same_school_reference",
    "validate_student_enrollment",
    "project_active_enrollment_class",
    "require_operational_student",
    "capture_access_change",
    "prevent_event_mutation",
  ]) {
    assert.match(wrapper, new RegExp(`'${functionName}'`));
  }

  assert.match(wrapper, /pg_catalog\.pg_trigger/);
  assert.match(wrapper, /not\s+t\.tgisinternal/i);
  assert.match(wrapper, /unit 10 function residue/i);
  assert.match(wrapper, /unit 10 trigger residue/i);
  assert.match(wrapper, /pg_catalog\.pg_policy/);
  assert.match(wrapper, /unit 11 policy residue/i);
  assert.match(wrapper, /permission seed residue/i);
  assert.match(wrapper, /scope seed residue/i);
});

test("SAFE_PARTIAL_UNIT09 requires exact schemas, extension and unit 09 RPCs", async () => {
  const wrapper = await readFile(wrapperPath, "utf8");

  for (const schema of ["app", "iam", "audit", "ops", "api", "legacy_cloud", "auth"]) {
    assert.match(wrapper, new RegExp(`'${schema}'`));
  }
  assert.match(wrapper, /pg_stat_statements installation in ops/i);
  assert.match(wrapper, /SchoolSafe schema owner mismatch count/i);
  assert.match(wrapper, /schema_versions relation count/i);
  for (const rpc of [
    "check_access",
    "deactivate_other_academic_years",
    "next_document_number",
    "ensure_receipt_number",
    "record_payment",
    "cancel_payment",
    "increment_card_print_count",
    "create_student_draft",
    "compensate_student_draft_creation",
  ]) {
    assert.match(wrapper, new RegExp(`'${rpc}'`));
  }
  assert.match(wrapper, /unit 09 SECURITY DEFINER RPC count/i);
});

test("SAFE_PARTIAL_UNIT09 resumes at unit 10 and preserves the second full pass", async () => {
  const wrapper = await readFile(wrapperPath, "utf8");

  assert.match(wrapper, /FIRST_PASS_START_INDEX=9/);
  assert.match(wrapper, /CURRENT_STEP='apply-10-12'/);
  assert.match(wrapper, /for \(\(index = FIRST_PASS_START_INDEX; index <= 11; index\+\+\)\)/);
  assert.match(wrapper, /CURRENT_STEP='Second full pass'[\s\S]*?for index in "\$\{!UNITS\[@\]\}"/);
});

test("recovery remains fail-closed before backup and performs no cleanup", async () => {
  const wrapper = await readFile(wrapperPath, "utf8");
  const unit09Gate = wrapper.indexOf("preapply_state=SAFE_PARTIAL_UNIT09");
  const backupStep = wrapper.indexOf('CURRENT_STEP="backup"');

  assert.ok(unit09Gate > -1 && unit09Gate < backupStep);
  assert.match(wrapper, /invalid SchoolSafe (?:role )?recovery state/i);
  assert.doesNotMatch(wrapper, /drop\s+(?:role|schema|extension)/i);
  assert.doesNotMatch(wrapper, /delete\s+from\s+ops\.schema_versions/i);
});

test("SAFE_PARTIAL_UNIT09 rejects pre-existing data and residual RLS flags", async () => {
  const wrapper = await readFile(wrapperPath, "utf8");

  // Residual ENABLE or FORCE RLS flags on the four schemas are rejected.
  assert.match(wrapper, /pre-existing ENABLE or FORCE RLS flag count/);
  assert.match(
    wrapper,
    /c\.relkind in \('r','p'\) and \(c\.relrowsecurity or c\.relforcerowsecurity\)/,
  );

  // The data check examines every ordinary or partitioned table of app, iam,
  // audit and ops through exact per-table existence probes built with escaped
  // identifiers, and refuses any table holding at least one row.
  assert.match(wrapper, /do \$/i);
  assert.match(
    wrapper,
    /pg_catalog\.format\('select exists \(select 1 from %I\.%I\)'/,
  );
  assert.match(wrapper, /raise exception/i);
  assert.match(wrapper, /already contains data/i);

  // ops.schema_versions is the only table allowed to contain rows.
  assert.match(wrapper, /<> \('ops','schema_versions'\)/);

  // RLS flags are checked before data counting so residual RLS cannot hide
  // rows, and the whole gate runs before the backup step.
  const rlsFlagCheck = wrapper.indexOf(
    "pre-existing ENABLE or FORCE RLS flag count",
  );
  const dataCheck = wrapper.indexOf("raise exception");
  const unit09Assignment = wrapper.indexOf(
    "PREAPPLY_STATE='SAFE_PARTIAL_UNIT09'",
  );
  const backupStep = wrapper.indexOf('CURRENT_STEP="backup"');
  assert.ok(rlsFlagCheck > -1 && rlsFlagCheck < dataCheck);
  assert.ok(dataCheck > -1 && dataCheck < unit09Assignment);
  assert.ok(unit09Assignment > -1 && unit09Assignment < backupStep);

  // Recovery never deletes or truncates data automatically.
  assert.doesNotMatch(wrapper, /\bdelete\s+from\b/i);
  assert.doesNotMatch(wrapper, /\btruncate\b/i);
});
