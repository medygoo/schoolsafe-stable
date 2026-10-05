import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { AuthDatabase } from "../src/authnative/service.js";
import { createAuthNativeService } from "../src/authnative/service.js";
import { createSupabasePrincipalVerifier } from "../src/authnative/supabase-verifier.js";

type StoredUser = {
  id: string;
  auth_provider: string;
  external_subject: string;
  email: string | null;
  phone: string | null;
  must_change_password?: boolean;
};

type StoredProfile = { id: string; user_id: string; school_id: string };

const SUBJECT = "11111111-1111-4111-8111-111111111111";
const OTHER_SUBJECT = "22222222-2222-4222-8222-222222222222";
const SCHOOL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SCHOOL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function memoryDatabase(profiles: StoredProfile[] = []) {
  const users: StoredUser[] = [];
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes("api.auth_supabase_password_pending")) {
      const user = users.find((item) => item.id === params[0]);
      return { rows: [{ pending: user?.must_change_password === true }] };
    }
    if (!sql.includes("api.auth_link_supabase_principal")) return { rows: [] };
    expect(params).toHaveLength(3);
    const [subject, email, phone] = params as [string, string, string | null];
    const existing = users.find((user) => user.auth_provider === "supabase" && user.external_subject === subject);
    if (!existing) {
      const clash = users.find((user) =>
        (email !== null && user.email === email.toLowerCase()) || (phone !== null && user.phone === phone));
      if (clash) {
        const error = new Error("IDENTITY_CONFLICT") as Error & { code: string };
        error.code = "23505";
        throw error;
      }
      users.push({
        id: randomUUID(),
        auth_provider: "supabase",
        external_subject: subject,
        email: email.toLowerCase(),
        phone,
        must_change_password: true,
      });
    }
    const user = users.find((item) => item.auth_provider === "supabase" && item.external_subject === subject);
    if (!user) throw new Error("link failed");
    const linked = profiles.filter((profile) => profile.user_id === user.id);
    const created = !existing;
    if (linked.length === 0) {
      return { rows: [{ user_id: user.id, created, profile_id: null, school_id: null }] };
    }
    return {
      rows: linked.map((profile) => ({
        user_id: user.id,
        created,
        profile_id: profile.id,
        school_id: profile.school_id,
      })),
    };
  });
  return { users, query: query as AuthDatabase["query"] };
}

function verified(overrides: Partial<{ id: string; email: string; phone: string | null }> = {}) {
  return {
    id: SUBJECT,
    email: "Principal@Ecole.cd",
    phone: "+243812345678",
    ...overrides,
  };
}

function appFor(database: ReturnType<typeof memoryDatabase>, verifier: (token: string) => Promise<{ id: string; email: string; phone: string | null } | null>) {
  const service = createAuthNativeService({ db: { query: database.query } });
  return buildApp({ authNative: { service, cookieSecure: true, supabaseVerifier: verifier } });
}

async function exchange(app: ReturnType<typeof buildApp>, token: string, body: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/auth/native/supabase/exchange",
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
}

describe("POST /auth/native/supabase/exchange", () => {
  it("links an unknown verified Supabase user once", async () => {
    const database = memoryDatabase();
    const app = appFor(database, async () => verified());
    const response = await exchange(app, "valid-token", { school_id: SCHOOL_B });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "onboarding_required" });
    expect(response.json()).not.toHaveProperty("school_id");
    expect(database.users).toHaveLength(1);
    expect(database.users[0]).toMatchObject({
      auth_provider: "supabase",
      external_subject: SUBJECT,
      email: "principal@ecole.cd",
      phone: "+243812345678",
      must_change_password: true,
    });
    await app.close();
  });

  it("does not create a second iam.users for the same Supabase subject", async () => {
    const database = memoryDatabase();
    const app = appFor(database, async () => verified());
    await exchange(app, "valid-token");
    const again = await exchange(app, "valid-token");
    expect(again.statusCode).toBe(200);
    expect(again.json().status).toBe("onboarding_required");
    expect(database.users).toHaveLength(1);
    await app.close();
  });

  it("refuses to merge an email or phone that already belongs to another subject", async () => {
    const database = memoryDatabase();
    database.users.push({
      id: randomUUID(),
      auth_provider: "local",
      external_subject: "control:other",
      email: "principal@ecole.cd",
      phone: "+243800000000",
    });
    const emailApp = appFor(database, async () => verified());
    const emailConflict = await exchange(emailApp, "valid-token");
    expect(emailConflict.statusCode).toBe(409);
    expect(emailConflict.json().code).toBe("VERSION_CONFLICT");
    expect(database.users).toHaveLength(1);

    const phoneDatabase = memoryDatabase();
    phoneDatabase.users.push({
      id: randomUUID(),
      auth_provider: "local",
      external_subject: OTHER_SUBJECT,
      email: "other@ecole.cd",
      phone: "+243812345678",
    });
    const phoneApp = appFor(phoneDatabase, async () => verified());
    const phoneConflict = await exchange(phoneApp, "valid-token");
    expect(phoneConflict.statusCode).toBe(409);
    expect(phoneDatabase.users).toHaveLength(1);
    await emailApp.close();
    await phoneApp.close();
  });

  it("rejects an invalid Supabase token and creates nobody", async () => {
    const database = memoryDatabase();
    const app = appFor(database, async () => null);
    const response = await exchange(app, "not-a-token", { school_id: SCHOOL_A });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("AUTH_REQUIRED");
    expect(database.users).toHaveLength(0);
    expect(database.query).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns onboarding without a school when the principal has zero profiles", async () => {
    const database = memoryDatabase();
    const app = appFor(database, async () => verified());
    const response = await exchange(app, "valid-token", { school_id: SCHOOL_A });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "onboarding_required" });
    await app.close();
  });

  it("resolves one existing profile from the database and ignores the client school", async () => {
    const userId = randomUUID();
    const database = memoryDatabase([{ id: "profile-a", user_id: userId, school_id: SCHOOL_A }]);
    database.users.push({
      id: userId,
      auth_provider: "supabase",
      external_subject: SUBJECT,
      email: "principal@ecole.cd",
      phone: "+243812345678",
    });
    const app = appFor(database, async () => verified());
    const response = await exchange(app, "valid-token", { school_id: SCHOOL_B });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "profile_resolved",
      profile_id: "profile-a",
      school_id: SCHOOL_A,
    });
    await app.close();
  });

  it("blocks normal profile access while a new Supabase principal must change password", async () => {
    const userId = randomUUID();
    const database = memoryDatabase([{ id: "profile-a", user_id: userId, school_id: SCHOOL_A }]);
    database.users.push({
      id: userId,
      auth_provider: "supabase",
      external_subject: SUBJECT,
      email: "principal@ecole.cd",
      phone: "+243812345678",
      must_change_password: true,
    });
    const app = appFor(database, async () => verified());
    const response = await exchange(app, "valid-token");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "password_change_required", password_change_required: true });
    expect(response.json()).not.toHaveProperty("school_id");
    await app.close();
  });

  it("lists several profiles without choosing the client school", async () => {
    const userId = randomUUID();
    const database = memoryDatabase([
      { id: "profile-a", user_id: userId, school_id: SCHOOL_A },
      { id: "profile-b", user_id: userId, school_id: SCHOOL_B },
    ]);
    database.users.push({
      id: userId,
      auth_provider: "supabase",
      external_subject: SUBJECT,
      email: "principal@ecole.cd",
      phone: "+243812345678",
    });
    const app = appFor(database, async () => verified());
    const response = await exchange(app, "valid-token", { school_id: SCHOOL_B });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "profile_choice_required",
      profiles: [
        { profile_id: "profile-a", school_id: SCHOOL_A },
        { profile_id: "profile-b", school_id: SCHOOL_B },
      ],
    });
    await app.close();
  });
});

describe("Supabase principal verifier", () => {
  it("asks GoTrue getUser and refuses an unconfirmed email", async () => {
    const getUser = vi.fn()
      .mockResolvedValueOnce({
        data: { user: { id: SUBJECT, email: "principal@ecole.cd", phone: "+243812345678", email_confirmed_at: "2026-10-04T00:00:00Z" } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { user: { id: SUBJECT, email: "principal@ecole.cd", phone: "+243812345678", email_confirmed_at: null } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { user: null }, error: new Error("invalid") });
    const verifier = createSupabasePrincipalVerifier("http://127.0.0.1:54321", "local-anon-key-not-a-secret", () => ({ auth: { getUser } }));
    await expect(verifier("signed-token")).resolves.toEqual({
      id: SUBJECT,
      email: "principal@ecole.cd",
      phone: "+243812345678",
    });
    expect(getUser).toHaveBeenCalledWith("signed-token");
    await expect(verifier("unconfirmed")).resolves.toBeNull();
    await expect(verifier("rejected")).resolves.toBeNull();
  });
});

describe("additive Supabase link SQL", () => {
  it("keeps the bridge additive and refuses a silent merge or a school insert", () => {
    const sqlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../database/auth/v8/01_supabase_principal_link.sql");
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain("api.auth_link_supabase_principal");
    expect(sql).toContain("'supabase'");
    expect(sql).toContain("IDENTITY_CONFLICT");
    expect(sql).toContain("auth.normalize_login");
    expect(sql.toLowerCase()).not.toContain("insert into app.schools");
    expect(sql.toLowerCase()).not.toContain("school_memberships");
  });
});
