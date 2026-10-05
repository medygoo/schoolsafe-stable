import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { requireAuthSession } from "../src/authnative/middleware.js";
import { createAuthNativeService, type AuthDatabase, type AuthNativeService } from "../src/authnative/service.js";
import { updateSupabasePassword } from "../src/authnative/supabase-password.js";

const SUBJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NEXT = "Correct-Horse-Battery-94";

function passwordApp(options: {
  pending?: boolean;
  otherPending?: boolean;
  verifier?: (token: string) => Promise<{ id: string; email: string; phone: string | null } | null>;
  update?: (token: string, nextPassword: string) => Promise<"changed" | "rejected" | "unavailable">;
  clear?: () => Promise<{ rows: Array<{ cleared: boolean }> }>;
}) {
  const flags = new Map<string, boolean>([
    [SUBJECT, options.pending ?? true],
    [OTHER, options.otherPending ?? true],
  ]);
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes("auth.credentials")) throw new Error("credential write");
    if (sql.includes("pending_subject")) {
      return { rows: [{ pending: flags.get(String(params[0])) === true }] };
    }
    if (sql.includes("clear_password_change")) {
      if (options.clear) return options.clear();
      const subject = String(params[0]);
      if (flags.get(subject) !== true) return { rows: [{ cleared: false }] };
      flags.set(subject, false);
      return { rows: [{ cleared: true }] };
    }
    return { rows: [] };
  });
  const updater = vi.fn(options.update ?? (async () => "changed" as const));
  const service = createAuthNativeService({ db: { query: query as AuthDatabase["query"] } });
  const app = buildApp({
    authNative: {
      service,
      cookieSecure: true,
      supabaseVerifier: options.verifier ?? (async () => ({ id: SUBJECT, email: "principal@ecole.cd", phone: null })),
      supabasePasswordUpdater: updater,
    },
  });
  return { app, flags, query, updater };
}

async function change(app: ReturnType<typeof buildApp>, token: string | null, body: Record<string, string>) {
  return app.inject({
    method: "POST",
    url: "/auth/native/supabase/change-password",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body,
  });
}

describe("POST /auth/native/supabase/change-password", () => {
  it("rejects a missing or invalid token before any password call", async () => {
    const missing = passwordApp({});
    const absent = await change(missing.app, null, { new_password: NEXT });
    expect(absent.statusCode).toBe(401);
    expect(missing.updater).not.toHaveBeenCalled();

    const invalid = passwordApp({ verifier: async () => null });
    const rejected = await change(invalid.app, "bad-token", { new_password: NEXT });
    expect(rejected.statusCode).toBe(401);
    expect(invalid.updater).not.toHaveBeenCalled();
    expect(invalid.query).not.toHaveBeenCalled();
    await missing.app.close();
    await invalid.app.close();
  });

  it("ignores a client identity and changes only the verified subject", async () => {
    const database = passwordApp({});
    const response = await change(database.app, "token-a", {
      new_password: NEXT,
      user_id: OTHER,
      external_subject: OTHER,
      school_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      profile_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_INVALID");
    expect(JSON.stringify(response.json())).not.toContain(NEXT);
    expect(database.updater).not.toHaveBeenCalled();
    expect(database.flags.get(SUBJECT)).toBe(true);
    expect(database.flags.get(OTHER)).toBe(true);
    await database.app.close();
  });

  it("keeps the flag when Supabase rejects the password or cannot be reached", async () => {
    const rejected = passwordApp({ update: async () => "rejected" });
    const refusal = await change(rejected.app, "token-a", { new_password: NEXT });
    expect(refusal.statusCode).toBe(400);
    expect(rejected.flags.get(SUBJECT)).toBe(true);
    expect(rejected.query.mock.calls.some((call) => String(call[0]).includes("clear_password_change"))).toBe(false);

    const offline = passwordApp({ update: async () => "unavailable" });
    const failure = await change(offline.app, "token-a", { new_password: NEXT });
    expect(failure.statusCode).toBe(503);
    expect(offline.flags.get(SUBJECT)).toBe(true);
    await rejected.app.close();
    await offline.app.close();
  });

  it("clears the flag only after Supabase accepts the password and requires a new sign-in", async () => {
    const database = passwordApp({ otherPending: true });
    const response = await change(database.app, "token-a", { new_password: NEXT });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "password_changed",
      password_change_required: false,
      reauthenticate: true,
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(JSON.stringify(response.json())).not.toContain(NEXT);
    expect(database.updater).toHaveBeenCalledWith("token-a", NEXT);
    expect(database.flags.get(SUBJECT)).toBe(false);
    expect(database.flags.get(OTHER)).toBe(true);
    await database.app.close();
  });

  it("stays locked when the local flag update fails after Supabase accepts the password", async () => {
    const database = passwordApp({
      clear: async () => {
        throw Object.assign(new Error("local update failed"), { code: "57014" });
      },
    });
    const response = await change(database.app, "token-a", { new_password: NEXT });
    expect(response.statusCode).toBe(500);
    expect(response.json().status).not.toBe("password_changed");
    expect(JSON.stringify(response.json())).not.toContain(NEXT);
    expect(database.flags.get(SUBJECT)).toBe(true);
    await database.app.close();
  });
});

describe("Supabase password gate", () => {
  it("blocks a normal session when the resolved session still requires a password change", async () => {
    const service = {
      async resolveSession() {
        return {
          sessionId: "s",
          identityId: "i",
          userId: "u",
          profileId: "p",
          schoolId: "school",
          mustChange: true,
          expiresAt: "",
        };
      },
    };
    const guard = requireAuthSession(service as unknown as AuthNativeService);
    await expect(guard({ headers: { cookie: "schoolsafe_session=opaque" } } as never, {} as never)).rejects.toMatchObject({
      statusCode: 403,
      code: "ACCESS_DENIED",
    });
  });
});

describe("Supabase password SQL", () => {
  it("stores only a boolean and never a Supabase credential", () => {
    const sql = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../database/auth/v8/04_supabase_password_state.sql"), "utf8").toLowerCase();
    expect(sql).toContain("must_change_password boolean not null default false");
    expect(sql).toContain("must_change_password");
    expect(sql).toContain("true, true");
    expect(sql).toContain("or (u.auth_provider = 'supabase' and u.must_change_password)");
    expect(sql).not.toContain("insert into auth.credentials");
    expect(sql).not.toContain("password_hash");
    expect(sql).not.toContain("bypassrls");
    expect(sql).not.toContain("service_role");
  });
});

describe("GoTrue password update", () => {
  it("uses the caller token and reports refusal without unlocking", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.method).toBe("PUT");
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer caller-token");
      expect(String(init.body)).toContain(NEXT);
      return new Response("", { status: 422 });
    });
    const result = await updateSupabasePassword("https://supabase.example.test", "anon", "caller-token", NEXT, fetchImpl as unknown as typeof fetch);
    expect(result).toBe("rejected");
  });

  it("reports a network failure without treating the password as changed", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const result = await updateSupabasePassword("https://supabase.example.test", "anon", "caller-token", NEXT, fetchImpl as unknown as typeof fetch);
    expect(result).toBe("unavailable");
  });
});
