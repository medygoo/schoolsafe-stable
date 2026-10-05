import { describe, expect, it } from "vitest";
import { generateKeyPairSync, createPrivateKey, sign as cryptoSign } from "node:crypto";
import { buildApp } from "../src/app.js";
import { lot4AuthStubs } from "./helpers/lot4-auth-stubs.js";
import { registerLicenseGate } from "../src/licensenative/gate.js";
import type { BusinessPool } from "../src/db/pool.js";
import {
  computeLicenseStateV1,
  verifySignedLicenseV1,
  canonicalizePayloadV1,
  type LicensePayloadV1,
  type PublicKeyRegistry,
} from "../src/licensenative/license.js";
import {
  createLicenseNativeService,
} from "../src/licensenative/service.js";
import type { ActivationServiceClient } from "../src/licensenative/activation-client.js";
import type { InstallationKey } from "../src/licensenative/installation-key.js";
import type { AuthNativeService, AuthSessionInfo } from "../src/authnative/service.js";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLIC_PEM = publicKey.export({ format: "pem", type: "spki" }).toString();
const PRIVATE_KEY = createPrivateKey(privateKey.export({ format: "pem", type: "pkcs8" }).toString());
const KEY_ID = "test-key-1";
const REGISTRY: PublicKeyRegistry = new Map([[KEY_ID, PUBLIC_PEM]]);
const INSTALLATION_ID = "11111111-2222-3333-4444-555555555555";

const SCHOOL_A = "33333333-0000-4000-8000-000000000001";
const SCHOOL_B = "33333333-0000-4000-8000-000000000002";

function makeEnvelope(payload: LicensePayloadV1) {
  const canonical = canonicalizePayloadV1(payload);
  const signature = cryptoSign(null, Buffer.from(canonical, "utf8"), PRIVATE_KEY).toString("base64url");
  return { payload, signature };
}

function makePayload(overrides: Partial<LicensePayloadV1> = {}): LicensePayloadV1 {
  const now = Date.now();
  return {
    version: 1,
    license_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    school_id: SCHOOL_A,
    installation_id: INSTALLATION_ID,
    status: "active",
    plan: "basic",
    modules: [],
    issued_at: new Date(now - 3600_000).toISOString(),
    expires_at: new Date(now + 14 * 86_400_000).toISOString(),
    perpetual: false,
    key_id: KEY_ID,
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

function fakeActivationClient(envelope: ReturnType<typeof makeEnvelope> | null, fail = false): ActivationServiceClient {
  return {
    async redeem() { return envelope; },
    async refresh() {
      if (fail) throw new Error("Activation Service indisponible");
      return envelope;
    },
  };
}

function fakeInstallationKey(): InstallationKey {
  return {
    publicKeyBase64Url: Buffer.alloc(32, 0xaa).toString("base64url"),
    sign(message: string) {
      return cryptoSign(null, Buffer.from(message, "utf8"), PRIVATE_KEY).toString("base64url");
    },
  };
}

const CTX = { userId: "u1", profileId: "p1", schoolId: SCHOOL_A, requestId: "r1" };

function makeService(store: Store, client?: ActivationServiceClient) {
  return createLicenseNativeService(
    fakeBusinessPool(store),
    client,
    REGISTRY,
    INSTALLATION_ID,
    fakeInstallationKey(),
  );
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
    async forgotPassword() {},
    async resetPassword() { return false; },
    async switchProfile() { return { ok: false as const }; },
    ...lot4AuthStubs,
  };
}

describe("license gate — enforcement backend (P3)", () => {
  it("opens the authenticated CORE session bootstrap without licensing business routes", async () => {
    const authService = fakeAuthForGate();
    const app = buildApp({sessionNative:{authService,service:{readBootstrap:async()=>({profile:{id:"p1"},roles:["admin"]})} as any}});
    app.get("/native/business-proof",async()=>({ok:true}));
    registerLicenseGate(app,{authService,licenseService:undefined});
    try {
      expect((await app.inject({url:"/native/session/bootstrap"})).statusCode).toBe(401);
      const headers={cookie:"schoolsafe_session=token-valide"};
      expect((await app.inject({url:"/native/session/bootstrap",headers})).statusCode).toBe(200);
      expect((await app.inject({url:"/native/business-proof",headers})).statusCode).toBe(403);
    } finally {await app.close()}
  });
  it("bloque /native/students quand la licence est inactive", async () => {
    const store: Store = new Map();
    const expiredEnvelope = makeEnvelope(
      makePayload({ expires_at: new Date(Date.now() - 20 * 86_400_000).toISOString() }),
    );
    const service = makeService(store, fakeActivationClient(expiredEnvelope));
    await service.refreshFromActivation(CTX);
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
    const expiredEnvelope = makeEnvelope(
      makePayload({ expires_at: new Date(Date.now() - 20 * 86_400_000).toISOString() }),
    );
    const service = makeService(store, fakeActivationClient(expiredEnvelope));
    await service.refreshFromActivation(CTX);
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
    const revokedEnvelope = makeEnvelope(makePayload({ status: "revoked" }));
    const service = makeService(store, fakeActivationClient(revokedEnvelope));
    await service.refreshFromActivation(CTX);
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

  it("isolation gate : la licence de B ne débloque pas A", async () => {
    const store: Store = new Map();
    const envelopeB = makeEnvelope(makePayload({ school_id: SCHOOL_B, license_id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff" }));
    const service = makeService(store, fakeActivationClient(envelopeB));
    await service.refreshFromActivation(CTX);
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

describe("license gate — one explicit pilot school", () => {
  it.each([
    { name: "allows school A when A is the pilot without a license", schoolId: SCHOOL_A, pilotSchoolId: SCHOOL_A, status: 200 },
    { name: "denies school A when B is the pilot without a license", schoolId: SCHOOL_A, pilotSchoolId: SCHOOL_B, status: 403 },
    { name: "denies school A without pilot configuration or license", schoolId: SCHOOL_A, pilotSchoolId: undefined, status: 403 },
    { name: "does not extend pilot A access to school B", schoolId: SCHOOL_B, pilotSchoolId: SCHOOL_A, status: 403 },
  ])("$name", async ({ schoolId, pilotSchoolId, status }) => {
    const authService = fakeAuthForGate(schoolId);
    const app = buildApp({
      studentsNative: {
        authService,
        service: { listStudents: async () => [] } as any,
      },
    });
    registerLicenseGate(app, { authService, licenseService: undefined, pilotSchoolId });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/native/students",
        headers: { cookie: "schoolsafe_session=token-valide" },
      });
      expect(response.statusCode).toBe(status);
      if (status === 403) expect(response.json().code).toBe("LICENSE_INACTIVE");
      else expect(response.json().data).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it.each([undefined, "schoolsafe_session=invalid-session"])("still requires a valid session with cookie %s", async (cookie) => {
    const authService = fakeAuthForGate(SCHOOL_A);
    const app = buildApp({
      studentsNative: {
        authService,
        service: { listStudents: async () => [] } as any,
      },
    });
    registerLicenseGate(app, { authService, licenseService: undefined, pilotSchoolId: SCHOOL_A });
    try {
      const response = await app.inject({
        method: "GET",
        url: "/native/students",
        headers: cookie ? { cookie } : {},
      });
      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe("license gate — Supabase school access", () => {
  function reader(status: "active" | "suspended" | "revoked" | null, seen: { schoolId?: string } = {}) {
    return {
      async read(context: { schoolId: string }) {
        seen.schoolId = context.schoolId;
        return status;
      },
    };
  }

  async function inject(options: {
    schoolId?: string;
    access: ReturnType<typeof reader>;
    licenseService?: ReturnType<typeof makeService>;
    url?: string;
  }) {
    const authService = fakeAuthForGate(options.schoolId ?? SCHOOL_A);
    const app = buildApp({
      studentsNative: {
        authService,
        service: { listStudents: async () => [] } as any,
      },
    });
    registerLicenseGate(app, {
      authService,
      licenseService: options.licenseService,
      schoolAccess: options.access,
    });
    try {
      return await app.inject({
        method: "GET",
        url: options.url ?? "/native/students",
        headers: { cookie: "schoolsafe_session=token-valide" },
      });
    } finally {
      await app.close();
    }
  }

  it("allows an active Supabase school without a pilot id or activation service", async () => {
    const seen: { schoolId?: string } = {};
    const response = await inject({
      access: reader("active", seen),
      url: `/native/students?school_id=${SCHOOL_B}&access_status=active`,
    });
    expect(response.statusCode).toBe(200);
    expect(seen.schoolId).toBe(SCHOOL_A);
  });

  it("refuses a suspended Supabase school", async () => {
    const response = await inject({ access: reader("suspended") });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("SCHOOL_SUSPENDED");
  });

  it("refuses a revoked Supabase school", async () => {
    const response = await inject({ access: reader("revoked") });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("SCHOOL_REVOKED");
  });

  it("fail-closes when the new school has no access row and no signed license", async () => {
    const response = await inject({ access: reader(null) });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("LICENSE_INACTIVE");
  });

  it("fail-closes when the access reader is unavailable", async () => {
    const response = await inject({
      access: {
        async read() {
          throw new Error("database unavailable");
        },
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("LICENSE_INACTIVE");
  });

  it("keeps a valid signed license when the school has no Supabase access row", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeActivationClient(makeEnvelope(makePayload())));
    await service.redeem(CTX, "legacy-code");
    const response = await inject({ access: reader(null), licenseService: service });
    expect(response.statusCode).toBe(200);
  });

  it("keeps refusing an expired signed license", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeActivationClient(makeEnvelope(makePayload({
      expires_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    }))));
    await service.redeem(CTX, "legacy-code");
    const response = await inject({ access: reader(null), licenseService: service });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("LICENSE_INACTIVE");
  });

  it("keeps refusing an invalid signed license", async () => {
    const store: Store = new Map();
    store.set(SCHOOL_A, {
      signed_token: "not-a-license",
      license_id: "x",
      status: "active",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      grace_days: 0,
      last_seen_at: new Date().toISOString(),
    });
    const service = makeService(store);
    const response = await inject({ access: reader(null), licenseService: service });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("LICENSE_INACTIVE");
  });

  it("keeps a valid perpetual signed license", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeActivationClient(makeEnvelope(makePayload({
      perpetual: true,
      expires_at: null,
    }))));
    await service.redeem(CTX, "legacy-code");
    const response = await inject({ access: reader(null), licenseService: service });
    expect(response.statusCode).toBe(200);
  });

  it("does not let school B inherit school A access", async () => {
    const response = await inject({
      schoolId: SCHOOL_B,
      access: {
        async read(context) {
          return context.schoolId === SCHOOL_A ? "active" : "suspended";
        },
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("SCHOOL_SUSPENDED");
  });

  it("does not let a suspended access row fall through to a signed license", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeActivationClient(makeEnvelope(makePayload())));
    await service.redeem(CTX, "legacy-code");
    const response = await inject({ access: reader("suspended"), licenseService: service });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("SCHOOL_SUSPENDED");
  });
});