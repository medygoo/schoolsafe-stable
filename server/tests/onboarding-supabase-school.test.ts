import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { BusinessPool } from "../src/db/pool.js";
import type { AuthDatabase } from "../src/authnative/service.js";
import { createAuthNativeService } from "../src/authnative/service.js";

const SUBJECT = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const OTHER_SCHOOL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const school = {
  admin: { first_name: "Ada", last_name: "Test" },
  identity: { name_fr: "Ecole Principale" },
  cycles: ["primary"],
  academic_year: { label: "2026-2027", starts_on: "2026-09-01", ends_on: "2027-07-01" },
  contact: {
    country: "RDC",
    province: "Province",
    city: "City",
    address: "Address",
    email: "school@example.test",
    phone: "+243812345678",
    website_url: "https://example.test",
    website_mode: "Mode",
    public_news: "News",
    public_gallery: "Gallery",
    public_honors: "Honors",
  },
  brand: { primary_color: "#112233", accent_color: "#abcdef", document_footer: "Footer" },
};

type StoredSchool = { id: string; name: string };
type StoredProfile = { id: string; user_id: string; school_id: string };
type StoredRole = { school_id: string; profile_id: string; code: string };

function memoryDatabase(options: { failAt?: "role" } = {}) {
  const users = [{ id: USER, auth_provider: "supabase", external_subject: SUBJECT }];
  const schools: StoredSchool[] = [{ id: OTHER_SCHOOL, name: "Autre ecole" }];
  const profiles: StoredProfile[] = [];
  const roles: StoredRole[] = [];
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    if (!sql.includes("api.auth_supabase_principal_create_school")) return { rows: [] };
    expect(params).toHaveLength(2);
    const [subject, payloadText] = params as [string, string];
    const payload = JSON.parse(payloadText) as Record<string, unknown>;
    for (const key of ["school_id", "user_id", "profile_id", "role"]) {
      expect(payload).not.toHaveProperty(key);
    }
    const user = users.find((item) => item.auth_provider === "supabase" && item.external_subject === subject);
    if (!user) {
      const error = new Error("missing user") as Error & { code: string };
      error.code = "42501";
      throw error;
    }
    if (profiles.some((profile) => profile.user_id === user.id)) {
      const error = new Error("PRINCIPAL_ONBOARDING_EXISTS") as Error & { code: string };
      error.code = "23505";
      throw error;
    }
    if (options.failAt === "role") throw new Error("role provisioning failed");
    const schoolId = randomUUID();
    const profileId = randomUUID();
    const identity = payload.identity as { name_fr: string };
    schools.push({ id: schoolId, name: identity.name_fr });
    profiles.push({ id: profileId, user_id: user.id, school_id: schoolId });
    roles.push({ school_id: schoolId, profile_id: profileId, code: "admin" });
    return {
      rows: [{
        result: {
          school_id: schoolId,
          profile_id: profileId,
          user_id: user.id,
          status: "completed",
          school_created: true,
          principal_profile_created: true,
          must_change: true,
          role: "admin",
        },
      }],
    };
  });
  return { users, schools, profiles, roles, query: query as AuthDatabase["query"] };
}

function appFor(database: ReturnType<typeof memoryDatabase>, verifier: (token: string) => Promise<{ id: string; email: string; phone: string | null } | null>) {
  const service = createAuthNativeService({ db: { query: database.query } });
  const pool = { query: vi.fn(async () => ({ rows: [{ total: 9 }] })) } as unknown as BusinessPool;
  return buildApp({
    authNative: { service, cookieSecure: true, supabaseVerifier: verifier },
    lot5Dashboard: { pool, authService: service },
  });
}

function create(app: ReturnType<typeof buildApp>, token: string, body: Record<string, unknown> = school) {
  return app.inject({
    method: "POST",
    url: "/auth/native/supabase/school",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: body,
  });
}

describe("Supabase principal school onboarding", () => {
  it("creates one school, one principal profile and the existing admin role", async () => {
    const database = memoryDatabase();
    const app = appFor(database, async () => ({ id: SUBJECT, email: "principal@ecole.cd", phone: "+243812345678" }));
    const response = await create(app, "valid-token");
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe("completed");
    expect(body.school_created).toBe(true);
    expect(body.principal_profile_created).toBe(true);
    expect(body.school_id).not.toBe(OTHER_SCHOOL);
    expect(database.schools.filter((item) => item.id !== OTHER_SCHOOL)).toHaveLength(1);
    expect(database.profiles).toEqual([
      { id: body.profile_id, user_id: USER, school_id: body.school_id },
    ]);
    expect(database.roles).toEqual([
      { school_id: body.school_id, profile_id: body.profile_id, code: "admin" },
    ]);
    await app.close();
  });

  it("rolls back the school when profile or role creation fails", async () => {
    const database = memoryDatabase({ failAt: "role" });
    const before = database.schools.length;
    const app = appFor(database, async () => ({ id: SUBJECT, email: "principal@ecole.cd", phone: "+243812345678" }));
    const response = await create(app, "valid-token");
    expect(database.query).toHaveBeenCalled();
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(database.schools).toHaveLength(before);
    expect(database.profiles).toHaveLength(0);
    expect(database.roles).toHaveLength(0);
    await app.close();
  });

  it("refuses a second principal onboarding", async () => {
    const database = memoryDatabase();
    const app = appFor(database, async () => ({ id: SUBJECT, email: "principal@ecole.cd", phone: "+243812345678" }));
    const first = await create(app, "valid-token");
    expect(first.statusCode).toBe(201);
    const again = await create(app, "valid-token");
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe("VERSION_CONFLICT");
    expect(database.schools.filter((item) => item.id !== OTHER_SCHOOL)).toHaveLength(1);
    expect(database.profiles).toHaveLength(1);
    await app.close();
  });

  it("rejects a client external subject before any query", async () => {
    const database = memoryDatabase();
    const app = appFor(database, async () => ({ id: SUBJECT, email: "principal@ecole.cd", phone: "+243812345678" }));
    const response = await create(app, "valid-token", { ...school, external_subject: "forged-subject" });
    expect(response.statusCode).toBe(400);
    expect(database.query).not.toHaveBeenCalled();
    expect(database.profiles).toHaveLength(0);
    await app.close();
  });

  it("rejects a client school_id and keeps the server school", async () => {
    const database = memoryDatabase();
    const app = appFor(database, async () => ({ id: SUBJECT, email: "principal@ecole.cd", phone: "+243812345678" }));
    const response = await create(app, "valid-token", { ...school, school_id: OTHER_SCHOOL, access_status: "active" });
    expect(response.statusCode).toBe(400);
    expect(database.query).not.toHaveBeenCalled();
    expect(database.profiles).toHaveLength(0);
    await app.close();
  });

  it("does not attach the principal to another user's school", async () => {
    const database = memoryDatabase();
    const app = appFor(database, async () => ({ id: SUBJECT, email: "principal@ecole.cd", phone: "+243812345678" }));
    const response = await create(app, "valid-token", { ...school, school_id: OTHER_SCHOOL, user_id: USER, role: "admin" });
    expect([400, 409]).toContain(response.statusCode);
    expect(database.profiles.some((profile) => profile.school_id === OTHER_SCHOOL)).toBe(false);
    await app.close();
  });

  it("blocks dashboard access while the provisional password still requires a change", async () => {
    const database = memoryDatabase();
    const app = appFor(database, async () => ({ id: SUBJECT, email: "principal@ecole.cd", phone: "+243812345678" }));
    const created = await create(app, "valid-token");
    expect(created.statusCode).toBe(201);
    expect(created.json().must_change).toBe(true);
    const cookies = [created.headers["set-cookie"]].flat().filter(Boolean).join(";");
    expect(cookies).not.toContain("schoolsafe_session=");
    const dashboard = await app.inject({ method: "GET", url: "/dashboard/stats", headers: { cookie: cookies } });
    expect(dashboard.statusCode).toBe(401);
    expect(dashboard.json().code).toBe("AUTH_REQUIRED");
    await app.close();
  });
});

describe("additive Supabase school SQL", () => {
  it("reuses the admin role inside one transaction and does not create other accounts", () => {
    const sqlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../database/auth/v8/02_supabase_principal_school.sql");
    const sql = readFileSync(sqlPath, "utf8").toLowerCase();
    expect(sql).toContain("api.auth_supabase_principal_create_school");
    expect(sql).toContain("iam.provision_school_roles");
    expect(sql).toContain("'admin'");
    expect(sql).not.toContain("school_memberships");
    expect(sql).not.toContain("insert into auth.credentials");
    expect(sql.match(/\bcommit\s*;/g)).toHaveLength(1);
    expect(sql).not.toContain("p_school_id");
  });

  it("gates the first Supabase school on a one-time bootstrap instead of legacy activation", () => {
    const sqlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../database/auth/v8/03_supabase_principal_bootstrap.sql");
    const sql = readFileSync(sqlPath, "utf8").toLowerCase();
    expect(sql).toContain("auth.supabase_principal_bootstrap_allows");
    expect(sql).toContain("auth_provider = 'supabase'");
    expect(sql).toContain("not exists (select 1 from iam.profiles");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("schools_supabase_bootstrap_insert");
    expect(sql).toContain("years_supabase_bootstrap_insert");
    expect(sql).toContain("cycles_supabase_bootstrap_insert");
    expect(sql).toContain("contacts_supabase_bootstrap_insert");
    expect(sql).toContain("'external_subject'");
    expect(sql).not.toContain("direct_activation_allows");
    expect(sql).not.toContain("direct_onboarding_accounts");
    expect(sql).not.toContain("bypassrls");
    expect(sql).not.toContain("school_memberships");
    expect(sql).not.toContain("drop policy");
    expect(sql.match(/\bcommit\s*;/g)).toHaveLength(1);
  });

  it("opens school access only when the validated bootstrap completes", () => {
    const sqlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../database/auth/v8/06_supabase_school_access.sql");
    const sql = readFileSync(sqlPath, "utf8").toLowerCase();
    expect(sql).toContain("ops.supabase_school_access");
    expect(sql).toContain("access_status in ('active', 'suspended', 'revoked')");
    expect(sql).toContain("'supabase_principal_onboarding'");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("old.completed_at is null");
    expect(sql).toContain("old.bootstrap_school_id is not null");
    expect(sql).toContain("on conflict (school_id) do nothing");
    expect(sql).toContain("grant execute on function api.supabase_school_access_read() to schoolsafe_api");
    expect(sql).not.toContain("bypassrls");
    expect(sql).not.toContain("grant select");
    expect(sql).not.toContain("grant insert");
    expect(sql).not.toContain("grant update");
    expect(sql.match(/\bcommit\s*;/g)).toHaveLength(1);
  });
});
