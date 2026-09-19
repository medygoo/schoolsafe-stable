import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const baselineDir = path.resolve(here, "..");

async function read(name) {
  return readFile(path.join(baselineDir, name), "utf8");
}

async function allBaselineSql() {
  const units = await Promise.all(
    ["04_app_tables.sql", "05_iam.sql", "06_audit_ops.sql"].map(read),
  );
  return units.join("\n");
}

function tenantTables(sql) {
  const result = new Map();
  for (const match of sql.matchAll(
    /create table if not exists\s+([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\n\);/gi,
  )) {
    if (/^\s*school_id\s+uuid\b/im.test(match[2])) {
      result.set(match[1].toLowerCase(), match[2]);
    }
  }
  return result;
}

function tableBlock(sql, tableName) {
  const match = sql.match(
    new RegExp(`create table if not exists ${tableName.replace(".", "\\.")}\\s*\\(([\\s\\S]*?)\\n\\);`, "i"),
  );
  assert.ok(match, `missing ${tableName}`);
  return match[1];
}

test("authorization scopes are attached to the exact grant or exception", async () => {
  const iamSql = await read("05_iam.sql");
  const internalSql = await read("08_internal_functions.sql");
  const relatedSql = (
    await Promise.all(
      ["05_iam.sql", "07_constraints_indexes.sql", "08_internal_functions.sql", "10_triggers.sql", "11_rls_acl.sql", "13_verification.sql"].map(read),
    )
  ).join("\n");

  assert.doesNotMatch(
    relatedSql,
    /(?:create\s+table|from|join|into|update|alter\s+table)\s+(?:if\s+not\s+exists\s+)?iam\.scope_assignments\b/i,
  );
  assert.match(iamSql, /create table if not exists iam\.grant_scopes/i);
  assert.match(iamSql, /create table if not exists iam\.exception_scopes/i);

  const grantScopes = tableBlock(iamSql, "iam.grant_scopes");
  assert.match(grantScopes, /^\s*school_id\s+uuid\s+not null/im);
  assert.match(grantScopes, /^\s*grant_id\s+uuid\s+not null/im);
  assert.match(grantScopes, /^\s*scope_code\s+text\s+not null/im);
  assert.match(grantScopes, /^\s*target_id\s+uuid/im);
  assert.match(grantScopes, /^\s*is_active\s+boolean\s+not null/im);
  assert.match(grantScopes, /^\s*starts_at\s+timestamptz\s+not null/im);
  assert.match(grantScopes, /^\s*ends_at\s+timestamptz/im);

  const exceptionScopes = tableBlock(iamSql, "iam.exception_scopes");
  assert.match(exceptionScopes, /^\s*school_id\s+uuid\s+not null/im);
  assert.match(exceptionScopes, /^\s*exception_id\s+uuid\s+not null/im);
  assert.match(exceptionScopes, /^\s*scope_code\s+text\s+not null/im);
  assert.match(exceptionScopes, /^\s*target_id\s+uuid/im);

  const exceptions = tableBlock(iamSql, "iam.profile_permission_exceptions");
  assert.match(exceptions, /^\s*condition_code\s+text/im);
  assert.match(exceptions, /^\s*condition_params\s+jsonb\s+not null/im);

  assert.doesNotMatch(tableBlock(iamSql, "iam.role_permission_grants"), /^\s*scope_code\b/im);
  assert.doesNotMatch(exceptions, /^\s*scope_code\b/im);

  assert.match(internalSql, /from iam\.grant_scopes\s+gs[\s\S]*gs\.grant_id\s*=\s*p_grant_id/i);
  assert.match(internalSql, /from iam\.exception_scopes\s+es[\s\S]*es\.exception_id\s*=\s*p_exception_id/i);
  assert.match(internalSql, /when 'assigned_portal'[\s\S]*p_scope_target_id\s*=\s*p_portal_id/i);
});

test("every relationship between tenant tables is protected by a composite school foreign key", async () => {
  const tables = tenantTables(await allBaselineSql());
  const constraintsSql = await read("07_constraints_indexes.sql");

  assert.match(constraintsSql, /unique \(school_id, id\)/i);
  for (const [tableName, body] of tables) {
    if (!/^\s*id\s+uuid\b/im.test(body)) continue;
    const escaped = tableName.replace(".", "\\.");
    assert.match(
      constraintsSql,
      new RegExp(`'${escaped}'::regclass`, "i"),
      `${tableName} must be included in the tenant candidate-key list`,
    );
  }

  const foreignKeys = [...constraintsSql.matchAll(
    /\('([a-z_]+\.[a-z_]+)',\s*'[^']+',\s*'foreign key \(([^)]+)\) references ([a-z_]+\.[a-z_]+)\(([^)]+)\)/gi,
  )];
  assert.ok(foreignKeys.length > 0, "tenant foreign keys must be discoverable");

  for (const [, child, rawChildColumns, parent, rawParentColumns] of foreignKeys) {
    if (!tables.has(child.toLowerCase()) || !tables.has(parent.toLowerCase())) continue;
    const childColumns = rawChildColumns.split(",").map((value) => value.trim().toLowerCase());
    const parentColumns = rawParentColumns.split(",").map((value) => value.trim().toLowerCase());
    assert.equal(childColumns[0], "school_id", `${child} -> ${parent} must bind child school_id`);
    assert.equal(parentColumns[0], "school_id", `${child} -> ${parent} must bind parent school_id`);
    assert.equal(childColumns.length, parentColumns.length, `${child} -> ${parent} composite FK arity`);
  }
});

test("business RLS is operation-specific with no unapproved FOR ALL", async () => {
  const rlsSql = await read("11_rls_acl.sql");
  const verificationSql = await read("13_verification.sql");

  assert.doesNotMatch(rlsSql, /create policy[\s\S]{0,240}\bfor all\b/i);
  assert.match(rlsSql, /for select\b/i);
  assert.match(rlsSql, /for insert\b/i);
  assert.match(rlsSql, /for update\b/i);
  assert.match(rlsSql, /for delete\b/i);
  assert.match(verificationSql, /polcmd\s*=\s*'\*'/i);

  for (const tableStem of [
    "student_enrollment_events",
    "security_events",
    "fee_control_scans",
    "audit_events",
    "indicator_snapshots",
  ]) {
    assert.doesNotMatch(
      rlsSql,
      new RegExp(`create policy\\s+${tableStem}[^\\n]*_owner_(?:update|delete)`, "i"),
    );
  }
});

test("IAM RLS bootstrap predicate cannot recurse through context validation", async () => {
  const rlsSql = await read("11_rls_acl.sql");
  assert.match(rlsSql, /context_is_valid\(\) reads iam\.profiles/i);
  assert.match(
    rlsSql,
    /'iam\.exception_scopes'::regclass[\s\S]{0,700}'school_id = iam\.current_school_id\(\)'[\s\S]{0,120}'school_id = iam\.current_school_id\(\)'/i,
  );
});

test("API function execution is an explicit signature allowlist", async () => {
  const rlsSql = await read("11_rls_acl.sql");
  assert.doesNotMatch(rlsSql, /grant execute on all functions in schema api/i);

  const expectedFunctions = [
    "set_request_context",
    "check_access",
    "deactivate_other_academic_years",
    "next_document_number",
    "ensure_receipt_number",
    "record_payment",
    "cancel_payment",
    "increment_card_print_count",
    "create_student_draft",
    "compensate_student_draft_creation",
  ];
  for (const functionName of expectedFunctions) {
    assert.match(
      rlsSql,
      new RegExp(`grant execute on function api\\.${functionName}\\s*\\(`, "i"),
      `${functionName} must be explicitly allowlisted`,
    );
  }

  const grantedFunctions = [...rlsSql.matchAll(
    /grant execute on function api\.([a-z_]+)\s*\([^;]+?\)\s+to schoolsafe_api\s*;/gi,
  )].map((match) => match[1]);
  assert.deepEqual(grantedFunctions.sort(), expectedFunctions.sort());
});

test("from-zero semantic tests prove physical cross-school FK isolation", async () => {
  const semanticSql = await read("tests/from-zero-access-law.test.sql");
  for (const assertion of [
    "School A student to School B class FK must be rejected",
    "School A guardian to School B student FK must be rejected",
    "School A teacher assignment to School B subject FK must be rejected",
    "School A payment to School B fee FK must be rejected",
  ]) {
    assert.match(semanticSql, new RegExp(assertion, "i"));
  }
  assert.match(semanticSql, /foreign_key_violation/i);
  assert.match(semanticSql, /disable trigger app_students_class_id_tenant_guard/i);
  assert.match(semanticSql, /enable trigger app_students_class_id_tenant_guard/i);
});
