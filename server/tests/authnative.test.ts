import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/authnative/passwords.js";
import { generateSessionToken, hashSessionToken, isValidTokenHash } from "../src/authnative/tokens.js";
import { createAuthNativeService, type AuthDatabase } from "../src/authnative/service.js";
import { DUMMY_ARGON2ID_HASH_PROMISE } from "../src/authnative/passwords.js";

type Call = { sql: string; params: unknown[] };

function fakeDb(handlers: Record<string, (params: unknown[]) => unknown[]>) {
  const calls: Call[] = [];
  const db: AuthDatabase = {
    async query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
      calls.push({ sql, params });
      for (const [key, handler] of Object.entries(handlers)) {
        if (sql.includes(key)) return { rows: handler(params) as T[] };
      }
      return { rows: [] };
    },
  };
  return { db, calls };
}

describe("passwords argon2id", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("MotDePasse2026!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "MotDePasse2026!")).toBe(true);
    expect(await verifyPassword(hash, "mauvais")).toBe(false);
  });

  it("rejects short passwords and malformed hashes", async () => {
    await expect(hashPassword("court")).rejects.toThrow("8 characters");
    expect(await verifyPassword("bcrypt$xxx", "x")).toBe(false);
  });
});

describe("session tokens", () => {
  it("generates opaque tokens and sha256 hashes", () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThan(40);
    const hash = hashSessionToken(token);
    expect(isValidTokenHash(hash)).toBe(true);
    expect(hash).not.toContain(token);
  });
});

describe("loginWithPassword", () => {
  it("logs in with a single profile and binds the session to it", async () => {
    const passwordHash = await hashPassword("Joie2026!!");
    const { db, calls } = fakeDb({
      auth_is_locked: () => [{ auth_is_locked: false }],
      auth_resolve_identity: () => [
        { identity_id: "i1", user_id: "u1", password_hash: passwordHash, status: "active", must_change: false },
      ],
      auth_record_attempt: () => [{ auth_record_attempt: true }],
      auth_list_profiles: () => [{ profile_id: "pA", school_id: "schoolA", display_name: "Joyce" }],
      auth_create_session: () => [{ session_id: "s1", expires_at: "2026-09-05T00:00:00Z" }],
    });
    const service = createAuthNativeService({ db });
    const result = await service.loginWithPassword("joyce@ecole.cd", "Joie2026!!");

    expect(result.ok).toBe(true);
    const createCall = calls.find((c) => c.sql.includes("auth_create_session"));
    expect(createCall?.params[1]).toBe("pA"); // profil exact lié à la session
    expect(String(createCall?.params[2])).toMatch(/^[a-f0-9]{64}$/); // haché du jeton seulement
  });

  it("never picks a school arbitrarily: multi-profile user must choose", async () => {
    const passwordHash = await hashPassword("Joie2026!!");
    const { db, calls } = fakeDb({
      auth_is_locked: () => [{ auth_is_locked: false }],
      auth_resolve_identity: () => [
        { identity_id: "i1", user_id: "u1", password_hash: passwordHash, status: "active", must_change: false },
      ],
      auth_record_attempt: () => [{ auth_record_attempt: true }],
      auth_list_profiles: () => [
        { profile_id: "pA", school_id: "schoolA", display_name: "Joyce (École A)" },
        { profile_id: "pB", school_id: "schoolB", display_name: "Joyce (École B)" },
      ],
    });
    const service = createAuthNativeService({ db });
    const result = await service.loginWithPassword("joyce@ecole.cd", "Joie2026!!");

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "profile_choice_required") {
      expect(result.profiles.map((p) => p.schoolId).sort()).toEqual(["schoolA", "schoolB"]);
    } else {
      throw new Error("profile_choice_required attendu");
    }
    expect(calls.some((c) => c.sql.includes("auth_create_session"))).toBe(false);
  });

  it("multi-school user: chosen profile binds the exact school, never the wrong one", async () => {
    const passwordHash = await hashPassword("Joie2026!!");
    const { db, calls } = fakeDb({
      auth_is_locked: () => [{ auth_is_locked: false }],
      auth_resolve_identity: () => [
        { identity_id: "i1", user_id: "u1", password_hash: passwordHash, status: "active", must_change: false },
      ],
      auth_record_attempt: () => [{ auth_record_attempt: true }],
      auth_list_profiles: () => [
        { profile_id: "pA", school_id: "schoolA", display_name: "Joyce (École A)" },
        { profile_id: "pB", school_id: "schoolB", display_name: "Joyce (École B)" },
      ],
      auth_create_session: () => [{ session_id: "s1", expires_at: "2026-09-05T00:00:00Z" }],
      auth_resolve_session: (params) =>
        params[0] === hashSessionToken("token-B")
          ? [{ session_id: "s1", identity_id: "i1", user_id: "u1", profile_id: "pB", school_id: "schoolB", must_change: false }]
          : [],
    });
    const service = createAuthNativeService({ db });

    const login = await service.loginWithPassword("joyce@ecole.cd", "Joie2026!!", "pB");
    expect(login.ok).toBe(true);
    const createCall = calls.find((c) => c.sql.includes("auth_create_session"));
    expect(createCall?.params[1]).toBe("pB");

    const session = await service.resolveSession("token-B");
    expect(session?.profileId).toBe("pB");
    expect(session?.schoolId).toBe("schoolB");
    expect(session?.schoolId).not.toBe("schoolA");
  });

  it("refuses wrong password without revealing whether the login exists", async () => {
    const passwordHash = await hashPassword("Joie2026!!");
    const { db, calls } = fakeDb({
      auth_is_locked: () => [{ auth_is_locked: false }],
      auth_resolve_identity: () => [
        { identity_id: "i1", user_id: "u1", password_hash: passwordHash, status: "active", must_change: false },
      ],
      auth_record_attempt: () => [{ auth_record_attempt: true }],
    });
    const service = createAuthNativeService({ db });
    const result = await service.loginWithPassword("joyce@ecole.cd", "mauvais");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    const attempt = calls.find((c) => c.sql.includes("auth_record_attempt"));
    expect(attempt?.params[1]).toBe(false);
  });

  it("unknown login follows the same path (dummy verify, no enumeration)", async () => {
    const { db, calls } = fakeDb({
      auth_is_locked: () => [{ auth_is_locked: false }],
      auth_record_attempt: () => [{ auth_record_attempt: true }],
    });
    const service = createAuthNativeService({ db });
    const result = await service.loginWithPassword("inconnu@ecole.cd", "nimporte");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(calls.some((c) => c.sql.includes("auth_create_session"))).toBe(false);
    const attempt = calls.find((c) => c.sql.includes("auth_record_attempt"));
    expect(attempt?.params[1]).toBe(false);
    await expect(DUMMY_ARGON2ID_HASH_PROMISE).resolves.toMatch(/^\$argon2id\$/);
  });

  it("refuses a locked login without even resolving it", async () => {
    const { db, calls } = fakeDb({
      auth_is_locked: () => [{ auth_is_locked: true }],
    });
    const service = createAuthNativeService({ db });
    const result = await service.loginWithPassword("joyce@ecole.cd", "Joie2026!!");
    expect(result).toEqual({ ok: false, reason: "locked" });
    expect(calls.some((c) => c.sql.includes("auth_resolve_identity"))).toBe(false);
  });

  it("refuses a disabled identity", async () => {
    const passwordHash = await hashPassword("Joie2026!!");
    const { db } = fakeDb({
      auth_is_locked: () => [{ auth_is_locked: false }],
      auth_resolve_identity: () => [
        { identity_id: "i1", user_id: "u1", password_hash: passwordHash, status: "disabled", must_change: false },
      ],
      auth_record_attempt: () => [{ auth_record_attempt: true }],
    });
    const service = createAuthNativeService({ db });
    const result = await service.loginWithPassword("joyce@ecole.cd", "Joie2026!!");
    expect(result).toEqual({ ok: false, reason: "disabled" });
  });
});

describe("sessions", () => {
  it("resolves a valid session and revokes on logout", async () => {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const { db, calls } = fakeDb({
      auth_resolve_session: (params) =>
        params[0] === tokenHash
          ? [{ session_id: "s1", identity_id: "i1", user_id: "u1", profile_id: "p1", school_id: "e1", must_change: false }]
          : [],
      auth_revoke_session: (params) => [{ auth_revoke_session: params[0] === tokenHash }],
    });
    const service = createAuthNativeService({ db });

    const session = await service.resolveSession(token);
    expect(session?.userId).toBe("u1");
    expect(session?.schoolId).toBe("e1");

    expect(await service.logout(token)).toBe(true);
    expect(await service.resolveSession("token-invalide")).toBeNull();
    const revokeCall = calls.find((c) => c.sql.includes("auth_revoke_session"));
    expect(revokeCall?.params[0]).toBe(tokenHash);
    expect(revokeCall?.params[0]).not.toBe(token);
  });

  it("touch implements real sliding expiry", async () => {
    const token = generateSessionToken();
    const { db, calls } = fakeDb({
      auth_touch_session: () => [{ auth_touch_session: "2026-09-05T12:00:00Z" }],
    });
    const service = createAuthNativeService({ db });
    const newExpiry = await service.touchSession(token);
    expect(newExpiry).toBe("2026-09-05T12:00:00Z");
    const touchCall = calls.find((c) => c.sql.includes("auth_touch_session"));
    expect(String(touchCall?.params[0])).toMatch(/^[a-f0-9]{64}$/);
  });
});
