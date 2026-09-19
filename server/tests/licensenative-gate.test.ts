import { describe, expect, it } from "vitest";
import { generateKeyPairSync, createPrivateKey, sign as cryptoSign } from "node:crypto";
import { buildApp } from "../src/app.js";
import { registerLicenseGate } from "../src/licensenative/gate.js";
import type { BusinessPool } from "../src/db/pool.js";
import {
  computeLicenseState,
  verifyLicenseToken,
  type LicensePayload,
} from "../src/licensenative/license.js";
import {
  createLicenseNativeService,
  type ControlLicenseClient,
} from "../src/licensenative/service.js";
import type { AuthNativeService, AuthSessionInfo } from "../src/authnative/service.js";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLIC_PEM = publicKey.export({ format: "pem", type: "spki" }).toString();
const PRIVATE_KEY = createPrivateKey(privateKey.export({ format: "pem", type: "pkcs8" }).toString());

const SCHOOL_A = "33333333-0000-4000-8000-000000000001";
const SCHOOL_B = "33333333-0000-4000-8000-000000000002";

function signToken(payload: LicensePayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = cryptoSign(null, Buffer.from(payloadB64, "utf8"), PRIVATE_KEY).toString("base64url");
  return `${payloadB64}.${signature}`;
}

function makePayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  const now = Date.now();
  return {
    license_id: "LIC-TEST-1",
    school_id: SCHOOL_A,
    status: "active",
    issued_at: new Date(now - 3600_000).toISOString(),
    expires_at: new Date(now + 14 * 86_400_000).toISOString(),
    grace_days: 7,
    ...overrides,
  };
}

type Store = Map<string, { signed_token: string; license_id: string; status: string; issued_at: string; expires_at: string; grace_days: number; last_seen_at: string }>;

let CTX_SCHOOL_FROM_CONTEXT = SCHOOL_A;

function fakeBusinessPool(store: Store) {
  const client = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("api.license_state_read")) {
        const row = store.get(CTX_SCHOOL_FROM_CONTEXT);
        return { rows: [{ license_state_read: row ?? null }] };
      }
      if (sql.includes("api.license_state_write")) {
        const p = params!;
        const schoolId = CTX_SCHOOL_FROM_CONTEXT;
        const current = store.get(schoolId);
        const issuedAt = String(p[4]);
        if (current && new Date(issuedAt).getTime() < new Date(current.issued_at).getTime()) {
          return { rows: [{ license_state_write: { stored: false, reason: "stale" } }] };
        }
        store.set(schoolId, {
          signed_token: String(p[0]),
          license_id: String(p[2]),
          status: String(p[3]),
          issued_at: String(p[4]),
          expires_at: String(p[5]),
          grace_days: Number(p[6]),
          last_seen_at: String(p[7]),
        });
        return { rows: [{ license_state_write: { stored: true } }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  return { connect: async () => client } as unknown as BusinessPool;
}

function fakeControl(token: string | null, fail = false): ControlLicenseClient {
  return {
    async fetchLicenseState() {
      if (fail) throw new Error("Control indisponible");
      return token;
    },
  };
}

const CTX = { userId: "u1", profileId: "p1", schoolId: SCHOOL_A, requestId: "r1" };

function makeService(store: Store, control?: ControlLicenseClient) {
  return createLicenseNativeService(fakeBusinessPool(store), control, PUBLIC_PEM);
}

function fakeAuthForGate(schoolId: string = SCHOOL_A): AuthNativeService {
  const record: AuthSessionInfo = {
    sessionId: "55555555-0000-4000-8000-000000000001",
    identityId: "77777777-0000-4000-8000-000000000001",
    userId: "u1",
    profileId: "p1",
    schoolId,
    mustChange: false,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  return {
    async loginWithPassword() { throw new Error("not used"); },
    async resolveSession(token: string) {
      return token === "token-valide" ? record : null;
    },
    async touchSession() { return null; },
    async logout() { return true; },
    async listProfiles() { return []; },
    async forgotPassword() { return null; },
    async attachRecoveryToken() { return false; },
    async resetPassword() { return false; },
    async switchProfile() { return { ok: false as const }; },
  };
}

describe("license gate — enforcement backend (P3)", () => {
  it("bloque /native/students quand la licence est inactive", async () => {
    const store: Store = new Map();
    const expiredToken = signToken(
      makePayload({ expires_at: new Date(Date.now() - 20 * 86_400_000).toISOString() }),
    );
    const service = makeService(store, fakeControl(expiredToken));
    await service.refreshFromControl(CTX);
    const app = buildApp({
      authNative: { service: fakeAuthForGate(), cookieSecure: false },
      licenseNative: { authService: fakeAuthForGate(), service },
      studentsNative: {
        authService: fakeAuthForGate(),
        service: { listStudents: async () => [] } as any,
      },
    });
    registerLicenseGate(app, { authService: fakeAuthForGate(), licenseService: service });
    const response = await app.inject({
      method: "GET",
      url: "/native/students",
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("LICENSE_INACTIVE");
  });

  it("laisse passer /native/license même avec licence inactive", async () => {
    const store: Store = new Map();
    const expiredToken = signToken(
      makePayload({ expires_at: new Date(Date.now() - 20 * 86_400_000).toISOString() }),
    );
    const service = makeService(store, fakeControl(expiredToken));
    await service.refreshFromControl(CTX);
    const app = buildApp({
      authNative: { service: fakeAuthForGate(), cookieSecure: false },
      licenseNative: { authService: fakeAuthForGate(), service },
    });
    registerLicenseGate(app, { authService: fakeAuthForGate(), licenseService: service });
    const response = await app.inject({
      method: "GET",
      url: "/native/license/status",
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).toBe(200);
  });

  it("laisse passer /native/trial même avec licence inactive", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeControl(signToken(makePayload({ status: "revoked" }))));
    await service.refreshFromControl(CTX);
    const app = buildApp({
      authNative: { service: fakeAuthForGate(), cookieSecure: false },
      licenseNative: { authService: fakeAuthForGate(), service },
      trialNative: {
        authService: fakeAuthForGate(),
        service: { getTrialStatus: async () => ({ active: false }) } as any,
      },
    });
    registerLicenseGate(app, { authService: fakeAuthForGate(), licenseService: service });
    const response = await app.inject({
      method: "GET",
      url: "/native/trial/status",
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).not.toBe(403);
  });

  it("autorise /native/finance quand la licence est en grâce", async () => {
    const store: Store = new Map();
    const graceToken = signToken(
      makePayload({ expires_at: new Date(Date.now() - 86_400_000).toISOString(), grace_days: 7 }),
    );
    const service = makeService(store, fakeControl(graceToken));
    await service.refreshFromControl(CTX);
    const app = buildApp({
      authNative: { service: fakeAuthForGate(), cookieSecure: false },
      licenseNative: { authService: fakeAuthForGate(), service },
      financeNative: {
        authService: fakeAuthForGate(),
        service: { listFees: async () => [] } as any,
      },
    });
    registerLicenseGate(app, { authService: fakeAuthForGate(), licenseService: service });
    const response = await app.inject({
      method: "GET",
      url: "/native/finance/fees",
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).not.toBe(403);
  });

  it("isolation gate : la licence de B ne débloque pas A", async () => {
    const store: Store = new Map();
    const tokenB = signToken(makePayload({ school_id: SCHOOL_B, license_id: "LIC-B" }));
    const service = makeService(store, fakeControl(tokenB));
    await service.refreshFromControl(CTX);
    const app = buildApp({
      authNative: { service: fakeAuthForGate(SCHOOL_A), cookieSecure: false },
      licenseNative: { authService: fakeAuthForGate(SCHOOL_A), service },
      studentsNative: {
        authService: fakeAuthForGate(SCHOOL_A),
        service: { listStudents: async () => [] } as any,
      },
    });
    registerLicenseGate(app, { authService: fakeAuthForGate(SCHOOL_A), licenseService: service });
    const response = await app.inject({
      method: "GET",
      url: "/native/students",
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("LICENSE_INACTIVE");
  });
});
