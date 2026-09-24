import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { BusinessPool } from "../src/db/pool.js";
import { lot4AuthStubs } from "./helpers/lot4-auth-stubs.js";
import { createSessionNativeService } from "../src/sessionnative/service.js";
import type { AuthNativeService, AuthSessionInfo } from "../src/authnative/service.js";

type QueryCall = { sql: string; params: unknown[] };

const BOOTSTRAP = {
  profile: { id: "66666666-0000-4000-8000-000000000001", display_name: "Admin École" },
  schoolId: "33333333-0000-4000-8000-000000000001",
  school: { id: "33333333-0000-4000-8000-000000000001", code: "TEST-1", name: "École Test" },
  roles: ["admin"],
  permissions: ["school.student.read", "roles.manage"],
  scopes: [
    { permission: "school.student.read", type: "school", target: null },
    { permission: "roles.manage", type: "school", target: null },
  ],
  childIds: [],
  assignedClassIds: [],
  assignedSubjectIds: [],
  assignedPortalIds: [],
  deniedPermissions: [],
  deniedRules: [{ permission: "school.student.read", source: "role", originId: "synthetic-grant",
    effect: "deny", scopeType: "own_children", target: null, conditionCode: null,
    conditionParams: null, startsAt: "2020-01-01T00:00:00Z", endsAt: null }],
  offline_policy: { max_offline_hours: 24 },
};

function fakeBusinessPool(queryLog: QueryCall[]) {
  const client = {
    async query(sql: string, params?: unknown[]) {
      queryLog.push({ sql, params: params ?? [] });
      if (sql.includes("api.session_bootstrap")) {
        return { rows: [{ session_bootstrap: BOOTSTRAP }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  return { connect: async () => client } as unknown as BusinessPool;
}

function fakeAuthService(valid: boolean): AuthNativeService {
  const record: AuthSessionInfo = {
    sessionId: "44444444-0000-4000-8000-000000000001",
    identityId: "77777777-0000-4000-8000-000000000001",
    userId: "55555555-0000-4000-8000-000000000001",
    profileId: "66666666-0000-4000-8000-000000000001",
    schoolId: "33333333-0000-4000-8000-000000000001",
    mustChange: false,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  return {
    async loginWithPassword() {
      throw new Error("not used");
    },
    async resolveSession(token: string) {
      return valid && token === "token-valide" ? record : null;
    },
    async touchSession() {
      return null;
    },
    async logout() {
      return true;
    },
    async listProfiles() {
      return [];
    },
    async forgotPassword() {},
    async resetPassword() {
      return false;
    },
    async switchProfile() {
      return { ok: false as const };
    },
    ...lot4AuthStubs,
    async recoverParentAccount() { return null; },
    async recoverBySchoolCode() { return null; },
  };
}

describe("GET /native/session/bootstrap — paquet de session natif", () => {
  it("401 sans cookie, zéro SQL", async () => {
    const log: QueryCall[] = [];
    const app = buildApp({
      authNative: { service: fakeAuthService(true), cookieSecure: false },
      sessionNative: { authService: fakeAuthService(true), service: createSessionNativeService(fakeBusinessPool(log)) },
    });
    const response = await app.inject({ method: "GET", url: "/native/session/bootstrap" });
    expect(response.statusCode).toBe(401);
    expect(log).toHaveLength(0);
  });

  it("401 avec un cookie invalide", async () => {
    const log: QueryCall[] = [];
    const app = buildApp({
      authNative: { service: fakeAuthService(false), cookieSecure: false },
      sessionNative: { authService: fakeAuthService(false), service: createSessionNativeService(fakeBusinessPool(log)) },
    });
    const response = await app.inject({
      method: "GET",
      url: "/native/session/bootstrap",
      headers: { cookie: "schoolsafe_session=mauvais" },
    });
    expect(response.statusCode).toBe(401);
    expect(log).toHaveLength(0);
  });

  it("200 : le paquet vient de la base, contexte = session", async () => {
    const log: QueryCall[] = [];
    const app = buildApp({
      authNative: { service: fakeAuthService(true), cookieSecure: false },
      sessionNative: { authService: fakeAuthService(true), service: createSessionNativeService(fakeBusinessPool(log)) },
    });
    const response = await app.inject({
      method: "GET",
      url: "/native/session/bootstrap",
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.roles).toEqual(["admin"]);
    expect(data.permissions).toContain("school.student.read");
    expect(data.deniedRules).toEqual(BOOTSTRAP.deniedRules);
    expect(data.offline_policy.max_offline_hours).toBe(24);

    const statements = log.map((c) => c.sql);
    expect(statements[0]).toBe("BEGIN");
    expect(statements[1]).toContain("api.set_request_context");
    expect(statements[2]).toContain("api.session_bootstrap");
    expect(statements[3]).toBe("COMMIT");
    expect(log[1].params.slice(0, 3)).toEqual([
      "55555555-0000-4000-8000-000000000001",
      "66666666-0000-4000-8000-000000000001",
      "33333333-0000-4000-8000-000000000001",
    ]);
  });
});
