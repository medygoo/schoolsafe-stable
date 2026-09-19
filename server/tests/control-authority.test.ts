import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { buildApp } from "../src/app.js";
import { createControlPrintNativeService } from "../src/controlprintnative/service.js";
import type { BusinessPool } from "../src/db/pool.js";
import type { AuthNativeService, AuthSessionInfo } from "../src/authnative/service.js";

type QueryCall = { sql: string; params: unknown[] };

const CONTROL = {
  instanceId: "instance-ctrl-1",
  requestId: "req-ctrl-1",
  schoolId: "33333333-0000-4000-8000-000000000001",
  secret: "secret-de-test-jamais-reel",
};

function fakePool(log: QueryCall[], connects: { count: number }): BusinessPool {
  const client = {
    async query(sql: string, params?: unknown[]) {
      log.push({ sql, params: params ?? [] });
      if (sql.includes("api.card_print_request_update_status")) {
        return { rows: [{ card_print_request_update_status: true }] };
      }
      if (sql.includes("from app.students")) {
        return { rows: [{ student_name: "A B", class_name: "6A" }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  return {
    // Toute requête directe sur le pool humain/machine est interdite : le
    // callback signé doit passer par connect() uniquement après vérification.
    query: async () => {
      throw new Error("businessPool.query direct interdit dans ce test");
    },
    connect: async () => {
      connects.count += 1;
      return client;
    },
  } as unknown as BusinessPool;
}

function fakeAuthService(): AuthNativeService {
  const record: AuthSessionInfo = {
    sessionId: "44444444-0000-4000-8000-000000000001",
    identityId: "77777777-0000-4000-8000-000000000001",
    userId: "55555555-0000-4000-8000-000000000001",
    profileId: "66666666-0000-4000-8000-000000000001",
    schoolId: CONTROL.schoolId,
    mustChange: false,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  return {
    async loginWithPassword() { throw new Error("not used"); },
    async resolveSession(token: string) { return token === "token-valide" ? record : null; },
    async touchSession() { return null; },
    async logout() { return true; },
    async listProfiles() { return []; },
    async forgotPassword() { return null; },
    async attachRecoveryToken() { return false; },
    async resetPassword() { return false; },
    async switchProfile() { return { ok: false as const }; },
  };
}

function makeApp(log: QueryCall[], connects: { count: number }) {
  const businessPool = fakePool(log, connects);
  return buildApp({
    authNative: { service: fakeAuthService(), cookieSecure: false },
    controlPrintNative: {
      authService: fakeAuthService(),
      businessPool,
      controlConfig: {
        url: "https://control.example.test",
        instanceId: CONTROL.instanceId,
        hmacSecret: CONTROL.secret,
      },
      service: createControlPrintNativeService(businessPool, {
        url: "https://control.example.test",
        instanceId: CONTROL.instanceId,
        hmacSecret: CONTROL.secret,
      }),
    },
  });
}

function signedHeaders(body: unknown, timestamp: string) {
  const bodyString = JSON.stringify(body);
  const data = `POST\n/native/control/print/status\n${timestamp}\n${bodyString}`;
  const signature = createHmac("sha256", CONTROL.secret).update(data).digest("hex");
  return {
    "x-schoolsafe-instance": CONTROL.instanceId,
    "x-schoolsafe-timestamp": timestamp,
    "x-schoolsafe-signature": signature,
  };
}

const VALID_BODY = {
  request_id: CONTROL.requestId,
  school_id: CONTROL.schoolId,
  print_request_id: "99999999-0000-4000-8000-000000000001",
  status: "printed",
};

describe("POST /native/control/print/status — autorité machine Control", () => {
  it("rejette un callback non signé avant tout SQL", async () => {
    const log: QueryCall[] = [];
    const connects = { count: 0 };
    const app = makeApp(log, connects);
    const response = await app.inject({
      method: "POST",
      url: "/native/control/print/status",
      payload: VALID_BODY,
    });
    expect(response.statusCode).toBe(401);
    expect(connects.count).toBe(0);
    expect(log).toHaveLength(0);
  });

  it("rejette une signature invalide avant tout SQL", async () => {
    const log: QueryCall[] = [];
    const connects = { count: 0 };
    const app = makeApp(log, connects);
    const response = await app.inject({
      method: "POST",
      url: "/native/control/print/status",
      payload: VALID_BODY,
      headers: {
        "x-schoolsafe-instance": CONTROL.instanceId,
        "x-schoolsafe-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-schoolsafe-signature": "signature-falsifiee",
      },
    });
    expect(response.statusCode).toBe(401);
    expect(connects.count).toBe(0);
    expect(log).toHaveLength(0);
  });

  it("callback signé : seuls instance/request/school sont transmis, jamais de profile", async () => {
    const log: QueryCall[] = [];
    const connects = { count: 0 };
    const app = makeApp(log, connects);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await app.inject({
      method: "POST",
      url: "/native/control/print/status",
      payload: VALID_BODY,
      headers: signedHeaders(VALID_BODY, timestamp),
    });
    expect(response.statusCode).toBe(200);

    // ordre machine : BEGIN → api.set_control_context → api.* → COMMIT
    expect(log[0].sql).toBe("BEGIN");
    expect(log[1].sql).toContain("api.set_control_context");
    expect(log[1].params).toEqual([CONTROL.instanceId, CONTROL.requestId, CONTROL.schoolId]);
    expect(log[2].sql).toContain("api.card_print_request_update_status");
    expect(log.at(-1)!.sql).toBe("COMMIT");

    // aucun paramètre ne ressemble à un profil humain
    const allParams = log.flatMap((call) => call.params);
    expect(allParams.some((p) => typeof p === "string" && /profile/i.test(p))).toBe(false);
  });
});
