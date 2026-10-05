vi.mock("../src/licensenative/service.js", () => ({ createLicenseNativeService: () => ({ readState: async () => ({ state: "active", payload: null }) }) }));
vi.mock("../src/licensenative/installation-key.js", () => ({ loadInstallationKey: () => ({ publicKeyBase64Url: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", sign: () => "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }) }));
vi.mock("../src/licensenative/activation-client.js", () => ({ createActivationServiceClient: () => ({ redeem: async () => null, refresh: async () => null }) }));
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildNativeApp } from "../src/native-app.js";
import { parseEnv } from "../src/config/env.js";
import type { VerifiedPools } from "../src/db/startpools.js";
import { createAdultProvisioner } from "../src/accessnative/provision.js";
import { IdentityConflict } from "../src/accessnative/supabase-admin.js";
import { SchoolSafeError } from "../src/http/errors.js";
import type { BusinessPool } from "../src/db/pool.js";

const school = "33333333-0000-4000-8000-000000000001";
const actor = "66666666-0000-4000-8000-000000000001";
const user = "55555555-0000-4000-8000-000000000001";
const subject = "77777777-0000-4000-8000-000000000001";
const teacherUser = "88888888-0000-4000-8000-000000000001";
const teacherProfile = "99999999-0000-4000-8000-000000000001";
const apps: ReturnType<typeof buildNativeApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

const headers = { cookie: "schoolsafe_session=synthetic-test-token", "x-schoolsafe-action": "access-write" };
const body = { email: "Teacher.A@example.com", phone: "+243810000001", role_code: "teacher" as const };

function httpFixture(options: { allowed?: boolean } = {}) {
  const log: { sql: string; params?: unknown[] }[] = [];
  const client = {
    async query(sql: string, params?: unknown[]) {
      log.push({ sql, params });
      if (sql.includes("api.check_access")) return { rows: [{ allowed: options.allowed !== false }] };
      if (sql.includes("provision_school_adult_prepare")) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  const authPool = {
    async query(sql: string) {
      return { rows: sql.includes("auth_resolve_session") ? [{
        session_id: "44444444-0000-4000-8000-000000000001", identity_id: user,
        user_id: user, profile_id: actor, school_id: school, must_change: false,
      }] : [] };
    },
    async end() {},
  };
  const businessPool = { async connect() { return client; }, async end() {} };
  const app = buildNativeApp(parseEnv({
    NODE_ENV: "test",
    ACTIVATION_SERVICE_URL: "https://activation.example.test",
    ACTIVATION_INSTALLATION_ID: "11111111-2222-3333-4444-555555555555",
    ACTIVATION_INSTALLATION_PRIVATE_KEY_PATH: "/synthetic/test-only-installation.pem",
    ACTIVATION_LICENSE_PUBLIC_KEYS_JSON: JSON.stringify({ "test-key": "synthetic-test-public-key" }),
  }), { authPool, businessPool } as unknown as VerifiedPools);
  apps.push(app);
  return { app, log };
}

function memoryPool(options: { prepareCode?: string; writeCode?: string; schoolId?: string } = {}) {
  const log: { sql: string; params?: unknown[] }[] = [];
  const client = {
    async query(sql: string, params?: unknown[]) {
      log.push({ sql, params });
      if (sql.includes("api.check_access")) return { rows: [{ allowed: true }] };
      if (sql.includes("provision_school_adult_prepare")) {
        if (options.prepareCode) throw Object.assign(new Error("IDENTITY_CONFLICT"), { code: options.prepareCode });
        return { rows: [] };
      }
      if (sql.includes("api.provision_school_adult($1")) {
        if (options.writeCode) throw Object.assign(new Error("IDENTITY_CONFLICT"), { code: options.writeCode });
        return { rows: [{ data: {
          user_id: teacherUser, profile_id: teacherProfile, school_id: options.schoolId ?? school, role_code: "teacher",
        } }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  return { log, pool: { async connect() { return client; }, async end() {} } as unknown as BusinessPool };
}

function admin(options: { conflict?: boolean; failDelete?: boolean } = {}) {
  const created: { email: string; phone: string; password: string }[] = [];
  const deleted: string[] = [];
  return {
    created,
    deleted,
    client: {
      async createUser(input: { email: string; phone: string; password: string }) {
        created.push(input);
        if (options.conflict) throw new IdentityConflict();
        return { id: subject };
      },
      async deleteUser(id: string) {
        deleted.push(id);
        return !options.failDelete;
      },
    },
  };
}

const context = { userId: user, profileId: actor, schoolId: school, requestId: "aaaaaaaa-0000-4000-8000-000000000001" };

describe("adult teacher provisioning", () => {
  it("creates one teacher and returns the temporary password once", async () => {
    const db = memoryPool();
    const identity = admin();
    const result = await createAdultProvisioner(db.pool, identity.client).provisionTeacher(context, {
      email: "teacher.a@example.com", phone: "+243810000001", role_code: "teacher",
    });
    expect(result.role_code).toBe("teacher");
    expect(result.school_id).toBe(school);
    expect(result.temporary_password).toHaveLength(32);
    expect(identity.created).toEqual([{ email: "teacher.a@example.com", phone: "+243810000001", password: result.temporary_password }]);
    expect(identity.deleted).toEqual([]);
    const serialized = JSON.stringify(db.log);
    expect(serialized).not.toContain(result.temporary_password);
    expect(serialized).not.toContain("auth.credentials");
    expect(db.log.some((entry) => entry.sql.includes("api.provision_school_adult($1"))).toBe(true);
    expect(db.log.find((entry) => entry.sql.includes("api.provision_school_adult($1"))?.params?.[0]).toBe(subject);
  });

  it("refuses a caller without staff.manage before any external identity", async () => {
    const { app, log } = httpFixture({ allowed: false });
    const response = await app.inject({ method: "POST", url: "/native/access/users", headers, payload: body });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("PERMISSION_DENIED");
    expect(log.some((entry) => entry.sql.includes("provision_school_adult"))).toBe(false);
  });

  it("refuses another role and any client identity field", async () => {
    const { app, log } = httpFixture();
    for (const payload of [
      { ...body, role_code: "admin" },
      { ...body, role_code: "parent" },
      { ...body, school_id: school },
      { ...body, user_id: user },
      { ...body, profile_id: actor },
      { ...body, role_id: actor },
      { ...body, external_subject: subject },
      { ...body, must_change_password: false },
    ]) {
      const response = await app.inject({ method: "POST", url: "/native/access/users", headers, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_INVALID");
    }
    expect(log).toEqual([]);
  });

  it("returns 409 for a known email or phone without creating an external identity", async () => {
    const db = memoryPool({ prepareCode: "23505" });
    const identity = admin();
    await expect(createAdultProvisioner(db.pool, identity.client).provisionTeacher(context, {
      email: "teacher.a@example.com", phone: "+243810000001", role_code: "teacher",
    })).rejects.toMatchObject({ statusCode: 409, code: "VERSION_CONFLICT" });
    expect(identity.created).toEqual([]);
  });

  it("deletes the external identity when the school write fails", async () => {
    const db = memoryPool({ writeCode: "23505" });
    const identity = admin();
    await expect(createAdultProvisioner(db.pool, identity.client).provisionTeacher(context, {
      email: "teacher.a@example.com", phone: "+243810000001", role_code: "teacher",
    })).rejects.toMatchObject({ statusCode: 409 });
    expect(identity.deleted).toEqual([subject]);
    expect(JSON.stringify(db.log)).not.toContain(identity.created[0]?.password);
  });

  it("stops closed when compensation fails and never echoes the password", async () => {
    const db = memoryPool({ writeCode: "23505" });
    const identity = admin({ failDelete: true });
    const lines: string[] = [];
    await expect(createAdultProvisioner(db.pool, identity.client).provisionTeacher(context, {
      email: "teacher.a@example.com", phone: "+243810000001", role_code: "teacher",
    }, (message) => lines.push(message))).rejects.toMatchObject({ statusCode: 503, code: "ORPHAN_COMPENSATION_FAILED" });
    expect(lines).toEqual(["ORPHAN_COMPENSATION=FAILED"]);
    expect(lines.join("")).not.toContain(identity.created[0]?.password);
  });

  it("does not call Supabase when the server key is absent", async () => {
    const { app } = httpFixture();
    const response = await app.inject({ method: "POST", url: "/native/access/users", headers, payload: body });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(JSON.stringify(response.json())).not.toContain("SERVICE_ROLE");
  });

  it("keeps the service role out of the browser and the password out of SchoolSafe credentials", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const frontend: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(js|html|css|mjs|cjs)$/.test(name)) frontend.push(readFileSync(full, "utf8"));
      }
    };
    walk(path.join(root, "app"));
    expect(frontend.join("\n")).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    const sql = readFileSync(path.join(root, "database/auth/v8/05_provision_school_adult.sql"), "utf8");
    expect(sql).toContain("must_change_password");
    expect(sql).toContain("true, true");
    expect(sql).not.toContain("auth.credentials");
    expect(sql).not.toContain("BYPASSRLS");
    expect(sql).toContain("search_path = pg_catalog");
    expect(sql).toContain("security definer");
    expect(sql).toContain("'teacher'");
    expect(readFileSync(path.join(root, "app/modules/school/school-api.js"), "utf8")).toContain('"/school/staff/invite"');
    expect(readFileSync(path.join(root, "server/src/accessnative/provision.ts"), "utf8")).not.toContain("console.");
  });

  it("requires a session and the access write header", async () => {
    const { app, log } = httpFixture();
    expect((await app.inject({ method: "POST", url: "/native/access/users", payload: body })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/native/access/users", headers: { cookie: headers.cookie }, payload: body })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/native/access/users" })).statusCode).toBe(404);
    expect(log.some((entry) => entry.sql.includes("provision_school_adult"))).toBe(false);
  });

  it("maps an existing external identity to 409", async () => {
    const db = memoryPool();
    const identity = admin({ conflict: true });
    try {
      await createAdultProvisioner(db.pool, identity.client).provisionTeacher(context, {
        email: "teacher.a@example.com", phone: "+243810000001", role_code: "teacher",
      });
      throw new Error("expected conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(SchoolSafeError);
      expect((error as SchoolSafeError).statusCode).toBe(409);
      expect((error as SchoolSafeError).message).not.toContain("password");
    }
    expect(identity.deleted).toEqual([]);
  });
});
