import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("teacher Supabase screen", () => {
  it("creates a teacher through the native access route and shows the password once", () => {
    const moduleSource = source("app/modules/school/school-module.js");
    const start = moduleSource.indexOf("function teacherCreatePayload");
    const end = moduleSource.indexOf("function openInviteModal");
    const form = moduleSource.slice(start, end);
    expect(form).toContain('role_code: "teacher"');
    expect(form).toContain("temporary_password");
    expect(form).toContain("navigator.clipboard");
    expect(form).toContain("data-temporary-password");
    expect(form).not.toContain("role_ids");
    expect(form).not.toContain("inviteStaff");
    expect(form).not.toContain("/school/staff/invite");
    expect(form).not.toContain("localStorage");
    expect(form).not.toContain("sessionStorage");
    expect(form).not.toContain("console.log");
    expect(moduleSource).toContain('id: "createTeacherBtn"');
    expect(moduleSource).toContain('addEventListener("click", openTeacherModal)');
    expect(moduleSource).not.toContain("PILOT_SCHOOL_ID");
    expect(moduleSource).not.toContain("ACTIVATION_");

    const api = source("app/modules/school/school-api.js");
    const createStart = api.indexOf("createTeacher:");
    const createBody = api.slice(createStart, api.indexOf("updateStaffRoles:"));
    expect(createBody).toContain('"/native/access/users"');
    expect(createBody).toContain('credentials: "include"');
    expect(createBody).toContain('"x-schoolsafe-action": "access-write"');
    expect(createBody).toContain('role_code: "teacher"');
    expect(createBody).not.toContain("role_ids");
    expect(createBody).not.toContain("school_id");
    expect(api).toContain('"/school/staff/invite"');
  });

  it("keeps the service role out of the browser and exchanges through the anon key", () => {
    const browser = [
      source("app/app.js"),
      source("app/modules/authnative/auth-native.js"),
      source("app/modules/school/school-module.js"),
      source("app/modules/school/school-api.js"),
    ].join("\n");
    expect(browser).not.toContain("SUPABASE_SERVICE_ROLE");
    expect(browser).not.toContain("service_role");
    expect(browser).not.toContain("PILOT_SCHOOL_ID");
    expect(browser).not.toContain("ACTIVATION_");
    const auth = source("app/modules/authnative/auth-native.js");
    expect(auth).toContain('"/auth/native/supabase/exchange"');
    expect(auth).toContain('"/auth/native/supabase/change-password"');
    expect(auth).toContain("Authorization");
    const login = source("app/app.js");
    expect(login).toContain("supabase_anon_key");
    expect(login).toContain("grant_type=password");
    expect(login).toContain("data-supabase-password-change");
    expect(login).toContain("Reconnectez-vous avec le nouveau mot de passe");
  });
});
