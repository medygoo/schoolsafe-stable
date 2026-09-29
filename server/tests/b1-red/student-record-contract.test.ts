import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../..");

function readRepo(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function expectContains(source: string, fragment: string): void {
  expect(source.includes(fragment), `Expected source to contain: ${fragment}`).toBe(true);
}

describe("B1 Child Record Contract — GREEN acceptance", () => {
  const identityEmergencySql = readRepo("database/studentrecord/v1/01_student_identity_emergency.sql");
  const healthDietarySql = readRepo("database/studentrecord/v1/02_health_dietary.sql");
  const confirmationsSql = readRepo("database/studentrecord/v1/03_confirmations_permissions.sql");
  const rpcSql = readRepo("database/studentrecord/v1/04_student_record_rpc.sql");
  const routes = readRepo("server/src/studentrecordnative/routes.ts");
  const permissions = JSON.parse(readRepo("shared/permissions.json")) as Array<{ code: string }>;
  const apiAdapter = readRepo("app/modules/school/student-record-api.js");
  const realFrontend = readRepo("app/modules/school/student-record-real.js");

  it("declares the student emergency contacts table", () => {
    expectContains(identityEmergencySql, "create table if not exists app.student_emergency_contacts");
    expectContains(identityEmergencySql, "slot_no");
  });

  it("declares the student health profile table", () => {
    expectContains(healthDietarySql, "create table if not exists app.student_health_profiles");
    expectContains(healthDietarySql, "medical_declaration_completed");
  });

  it("declares the student allergies table", () => {
    expectContains(healthDietarySql, "create table if not exists app.student_allergies");
    expectContains(healthDietarySql, "status");
  });

  it("declares the student dietary profile table", () => {
    expectContains(healthDietarySql, "create table if not exists app.student_dietary_profiles");
    expectContains(healthDietarySql, "dietary_declaration_completed");
  });

  it("declares confirmations with the four locked confirmation keys", () => {
    expectContains(confirmationsSql, "create table if not exists app.student_record_confirmations");
    for (const key of ["family", "medical", "dietary", "pickup"]) {
      expectContains(confirmationsSql, `'${key}'`);
    }
  });

  it("declares explicit student consents", () => {
    expectContains(confirmationsSql, "create table if not exists app.student_consents");
    expectContains(confirmationsSql, "decision boolean not null");
    expectContains(confirmationsSql, "'photo_video'");
    expectContains(confirmationsSql, "'emergency_care'");
  });

  it("exposes the unified student record endpoint", () => {
    expectContains(routes, 'app.get("/native/students/:id/record"');
  });

  it("exposes the completeness endpoint", () => {
    expectContains(routes, 'app.get("/native/students/:id/completeness"');
  });

  it("exposes the canteen-safe dietary projection endpoint", () => {
    expectContains(routes, 'app.get("/native/canteen/students/:studentId/dietary"');
  });

  it("exposes the parent multi-children endpoint", () => {
    expectContains(routes, 'app.get("/native/parent/children"');
  });

  it("registers the health permissions in the shared catalog", () => {
    const codes = new Set(permissions.map((permission) => permission.code));
    expect(codes.has("school.student.health.read")).toBe(true);
    expect(codes.has("school.student.health.manage")).toBe(true);
    expect(codes.has("school.student.health.confirm")).toBe(true);
  });

  it("registers the dietary permissions in the shared catalog", () => {
    const codes = new Set(permissions.map((permission) => permission.code));
    expect(codes.has("school.student.dietary.read")).toBe(true);
    expect(codes.has("school.student.dietary.manage")).toBe(true);
    expect(codes.has("school.student.dietary.confirm")).toBe(true);
  });

  it("calculates completeness with exactly 12 checkpoints without activating lifecycle", () => {
    expect(rpcSql).toMatch(/v_total\s+integer\s*:=\s*12\s*;/);
    expectContains(rpcSql, "'READY_TO_VALIDATE'");
    expectContains(rpcSql, "'INCOMPLETE'");
    expect(rpcSql).not.toMatch(/update\s+app\.students\s+set\s+lifecycle_status/i);
  });

  it("keeps reported food allergies visible to canteen before confirmation", () => {
    const start = rpcSql.indexOf("create or replace function api.canteen_student_dietary");
    const end = rpcSql.indexOf("grant execute on function api.canteen_student_dietary", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const canteenProjection = rpcSql.slice(start, end);
    expectContains(canteenProjection, "a.category = 'food'");
    expect(canteenProjection).toMatch(/a\.status\s+in\s*\(\s*'reported'\s*,\s*'confirmed'\s*\)/);
    expect(canteenProjection).not.toContain("primary_doctor");
    expect(canteenProjection).not.toContain("student_medications");
    expect(canteenProjection).not.toContain("medical_notes");
  });

  it("keeps parent multi-child projection free of other guardians private contacts", () => {
    const start = rpcSql.indexOf("create or replace function api.parent_children()");
    const end = rpcSql.indexOf("grant execute on function api.parent_children()", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const parentProjection = rpcSql.slice(start, end);
    expectContains(parentProjection, "g.profile_id = v_profile_id");
    expect(parentProjection).not.toContain("'email'");
    expect(parentProjection).not.toContain("'phone'");
  });

  it("connects the browser adapter to native APIs instead of business localStorage", () => {
    expectContains(apiAdapter, "fetch(buildUrl(url), opts)");
    expectContains(apiAdapter, 'getRecord: function (studentId)');
    expectContains(apiAdapter, 'getParentChildren: function ()');
    expect(apiAdapter).not.toMatch(/\blocalStorage\s*\./);
  });

  it("connects the real student-record UI to StudentRecordAPI", () => {
    expectContains(realFrontend, "root.StudentRecordAPI.getRecord(studentId)");
    expectContains(realFrontend, "root.StudentRecordAPI.getCompleteness(studentId)");
    expectContains(realFrontend, "root.StudentRecordReal");
  });

  it("forces RLS on the new sensitive record tables", () => {
    for (const table of [
      "student_health_profiles",
      "student_allergies",
      "student_dietary_profiles",
      "student_record_confirmations",
      "student_consents",
    ]) {
      const source = table === "student_record_confirmations" || table === "student_consents"
        ? confirmationsSql
        : healthDietarySql;
      expectContains(source, `alter table app.${table} enable row level security`);
      expectContains(source, `alter table app.${table} force row level security`);
    }
  });
});
