import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { BusinessPool } from "../src/db/pool.js";
import { lot4AuthStubs } from "./helpers/lot4-auth-stubs.js";
import { createTrialNativeService } from "../src/trialnative/service.js";
import type { AuthNativeService, AuthSessionInfo } from "../src/authnative/service.js";

type QueryCall = { sql: string; params: unknown[] };

const TRIAL_ACTIVE = {
  status: "active",
  expires_at: "2026-09-19T00:00:00Z",
  grace_ends_at: "2026-09-26T00:00:00Z",
  days_remaining: 12,
};

function fakeBusinessPool(queryLog: QueryCall[], gateAllowed: boolean, status: unknown = TRIAL_ACTIVE) {
  const client = {
    async query(sql: string, params?: unknown[]) {
      queryLog.push({ sql, params: params ?? [] });
      if (sql.includes("iam.trial_gate")) {
        return { rows: [{ allowed: gateAllowed }] };
      }
      if (sql.includes("api.trial_status_read")) {
        return { rows: [{ trial_status_read: status }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  return { connect: async () => client } as unknown as BusinessPool;
}

function fakeAuthService(): AuthNativeService {
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
      return token === "token-valide" ? record : null;
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

describe("GET /native/trial/status — statut d'essai", () => {
  it("401 sans session, zéro requête SQL", async () => {
    const log: QueryCall[] = [];
    const app = buildApp({
      authNative: { service: fakeAuthService(), cookieSecure: false },
      trialNative: { authService: fakeAuthService(), service: createTrialNativeService(fakeBusinessPool(log, true)) },
    });
    const response = await app.inject({ method: "GET", url: "/native/trial/status" });
    expect(response.statusCode).toBe(401);
    expect(log).toHaveLength(0);
  });

  it("200 avec le statut réel, contexte transactionnel exact", async () => {
    const log: QueryCall[] = [];
    const app = buildApp({
      authNative: { service: fakeAuthService(), cookieSecure: false },
      trialNative: { authService: fakeAuthService(), service: createTrialNativeService(fakeBusinessPool(log, true)) },
    });
    const response = await app.inject({
      method: "GET",
      url: "/native/trial/status",
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe("active");
    expect(response.json().data.days_remaining).toBe(12);
    const statements = log.map((c) => c.sql);
    expect(statements[0]).toBe("BEGIN");
    expect(statements[1]).toContain("api.set_request_context");
    expect(statements[2]).toContain("api.trial_status_read");
    expect(statements[3]).toBe("COMMIT");
  });

  it("la porte refuse quand le gate dit non (fail-closed)", async () => {
    const log: QueryCall[] = [];
    const service = createTrialNativeService(fakeBusinessPool(log, false));
    const allowed = await service.gateAllows({
      userId: "u", profileId: "p", schoolId: "s", requestId: "r",
    });
    expect(allowed).toBe(false);
    const gateCall = log.find((c) => c.sql.includes("iam.trial_gate"))!;
    expect(gateCall.params).toEqual(["s"]);
  });

  it("pas de licence en base = statut no_license", async () => {
    const log: QueryCall[] = [];
    const app = buildApp({
      authNative: { service: fakeAuthService(), cookieSecure: false },
      trialNative: {
        authService: fakeAuthService(),
        service: createTrialNativeService(fakeBusinessPool(log, true, { status: "no_license" })),
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/native/trial/status",
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe("no_license");
  });
});
