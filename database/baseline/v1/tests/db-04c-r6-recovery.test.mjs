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

test("unit 02 creates all schemas as bootstrap with schoolsafe_owner authorization", async () => {
  const sql = await readBaseline("02_schemas.sql");
  const schemaNames = [
    "app",
    "iam",
    "audit",
    "ops",
    "api",
    "legacy_cloud",
    "auth",
  ];

  assert.doesNotMatch(sql, /^set\s+local\s+role\s+schoolsafe_owner\s*;/im);
  for (const schema of schemaNames) {
    assert.match(
      sql,
      new RegExp(
        `create\\s+schema\\s+if\\s+not\\s+exists\\s+${schema}\\s+authorization\\s+schoolsafe_owner\\s*;`,
        "i",
      ),
      `${schema} must be created by bootstrap and owned by schoolsafe_owner`,
    );
  }
});

test("unit 11 resets to bootstrap before database ACL and never grants owner CREATE", async () => {
  const sql = await readBaseline("11_rls_acl.sql");
  const allSql = (
    await Promise.all(
      Array.from({ length: 13 }, (_, index) =>
        readBaseline(`${String(index + 1).padStart(2, "0")}_${[
          "roles",
          "schemas",
          "extensions",
          "app_tables",
          "iam",
          "audit_ops",
          "constraints_indexes",
          "internal_functions",
          "api_rpc",
          "triggers",
          "rls_acl",
          "seed_permissions",
          "verification",
        ][index]}.sql`),
      ),
    )
  ).join("\n");

  const resetRole = sql.search(/^reset\s+role\s*;/im);
  const databaseAcl = sql.search(/revoke all on database/i);
  assert.notEqual(resetRole, -1, "unit 11 must reset to bootstrap");
  assert.ok(resetRole < databaseAcl, "RESET ROLE must precede database ACL");
  assert.doesNotMatch(
    allSql,
    /grant\s+create\s+on\s+database[\s\S]*?to\s+schoolsafe_owner/i,
  );
});

test("wrapper accepts only FROM_ZERO or the exact SAFE_PARTIAL_UNIT01 role state", async () => {
  const wrapper = await readFile(wrapperPath, "utf8");

  assert.match(wrapper, /preapply_state=FROM_ZERO/);
  assert.match(wrapper, /preapply_state=SAFE_PARTIAL_UNIT01/);
  assert.match(wrapper, /pg_catalog\.pg_roles/);
  for (const attribute of [
    "rolbypassrls",
    "rolsuper",
    "rolcreatedb",
    "rolcreaterole",
    "rolreplication",
    "rolinherit",
    "rolcanlogin",
  ]) {
    assert.match(wrapper, new RegExp(`\\b${attribute}\\b`));
  }
  assert.match(wrapper, /pg_catalog\.pg_auth_members/);
  assert.match(wrapper, /schoolsafe_migrator>schoolsafe_owner/);
  assert.match(wrapper, /schoolsafe_bootstrap>schoolsafe_owner/);
  assert.match(wrapper, /schoolsafe_bootstrap>schoolsafe_migrator/);
  assert.match(wrapper, /invalid SchoolSafe role recovery state/i);
});

test("wrapper rejects dangerous partial state before backup or SQL application", async () => {
  const wrapper = await readFile(wrapperPath, "utf8");
  const recoveryGate = wrapper.indexOf("preapply_state=SAFE_PARTIAL_UNIT01");
  const backupStep = wrapper.indexOf('CURRENT_STEP="backup"');

  assert.ok(recoveryGate > -1 && recoveryGate < backupStep);
  assert.match(wrapper, /pre-existing pg_stat_statements extension/);
  assert.match(wrapper, /public schema relation count/);
  assert.match(wrapper, /SchoolSafe schemas exist/);
  assert.match(wrapper, /schema_versions relation count/);
  assert.match(wrapper, /unexpected SchoolSafe role/i);
  assert.match(wrapper, /unexpected SchoolSafe membership/i);
  assert.doesNotMatch(wrapper, /drop\s+role/i);
});
