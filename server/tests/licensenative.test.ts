import { describe, expect, it } from "vitest";
import { generateKeyPairSync, createPrivateKey, sign as cryptoSign } from "node:crypto";
import { buildApp } from "../src/app.js";
import { lot4AuthStubs } from "./helpers/lot4-auth-stubs.js";
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

// ─── vraie paire Ed25519 de test ───
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

let CTX_SCHOOL_FROM_CONTEXT = SCHOOL_A;

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

describe("license Activation Service V1 — primitives", () => {
  it("vérifie une enveloppe SignedLicenseV1 valide", () => {
    const envelope = makeEnvelope(makePayload());
    const verified = verifySignedLicenseV1(envelope, REGISTRY);
    expect(verified).not.toBeNull();
    expect(verified!.payload.license_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("rejette une enveloppe falsifiée (payload modifié après signature)", () => {
    const envelope = makeEnvelope(makePayload());
    const tampered = { ...envelope, payload: { ...envelope.payload, plan: "tampered" } };
    expect(verifySignedLicenseV1(tampered, REGISTRY)).toBeNull();
  });

  it("rejette une signature d'une AUTRE clé", () => {
    const other = generateKeyPairSync("ed25519");
    const otherPrivate = createPrivateKey(other.privateKey.export({ format: "pem", type: "pkcs8" }).toString());
    const payload = makePayload();
    const canonical = canonicalizePayloadV1(payload);
    const sig = cryptoSign(null, Buffer.from(canonical, "utf8"), otherPrivate).toString("base64url");
    expect(verifySignedLicenseV1({ payload, signature: sig }, REGISTRY)).toBeNull();
  });

  it("computeLicenseStateV1 : revoked ne connaît pas de grâce", () => {
    const revoked = makePayload({ status: "revoked", expires_at: new Date(Date.now() + 86_400_000).toISOString() });
    expect(computeLicenseStateV1(revoked, new Date())).toBe("revoked");
  });

  it("perpetual=true + expires_at=null reste active indéfiniment", () => {
    const perpetual = makePayload({ perpetual: true, expires_at: null });
    expect(computeLicenseStateV1(perpetual, new Date("2126-01-01"))).toBe("active");
  });

  it("licence datée expirée retourne expired", () => {
    const expired = makePayload({ expires_at: new Date(Date.now() - 86_400_000).toISOString() });
    expect(computeLicenseStateV1(expired, new Date())).toBe("expired");
  });
});

describe("license service — scénarios Activation Service V1", () => {
  it("S1 Activation Service disponible + licence active → active", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeActivationClient(makeEnvelope(makePayload())));
    const result = await service.redeem(CTX, "synthetic-activation-code");
    expect(result.state).toBe("active");
    expect(store.get(SCHOOL_A)?.license_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("S2 Activation Service indisponible + licence locale active → active", async () => {
    const store: Store = new Map();
    const serviceWithClient = makeService(store, fakeActivationClient(makeEnvelope(makePayload())));
    await serviceWithClient.redeem(CTX, "synthetic-activation-code");
    // Nouveau service sans client → lecture locale uniquement
    const offlineService = makeService(store, undefined);
    const { state } = await offlineService.readState(CTX);
    expect(state).toBe("active");
    const allowed = await offlineService.gateAllows(CTX);
    expect(allowed).toBe(true);
  });

  it("S3 licence expirée → expired, porte fermée (fail-closed)", async () => {
    const store: Store = new Map();
    const expired = makePayload({ expires_at: new Date(Date.now() - 20 * 86_400_000).toISOString() });
    const service = makeService(store, fakeActivationClient(makeEnvelope(expired)));
    await service.redeem(CTX, "synthetic-activation-code");
    expect(await service.gateAllows(CTX)).toBe(false);
  });

  it("S4 licence révoquée → révocation appliquée immédiatement", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeActivationClient(makeEnvelope(makePayload())));
    await service.redeem(CTX, "synthetic-activation-code");
    const revoked = makePayload({ status: "revoked", issued_at: new Date().toISOString() });
    const revokedService = makeService(store, fakeActivationClient(makeEnvelope(revoked)));
    const result = await revokedService.refreshFromActivation(CTX);
    expect(result.state).toBe("revoked");
    expect(await revokedService.gateAllows(CTX)).toBe(false);
  });

  it("S5 état local falsifié → la signature casse, fermé", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeActivationClient(makeEnvelope(makePayload())));
    await service.redeem(CTX, "synthetic-activation-code");
    const otherEnvelope = makeEnvelope(makePayload({ school_id: SCHOOL_B, license_id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff" }));
    store.set(SCHOOL_A, {
      ...store.get(SCHOOL_A)!,
      signed_token: JSON.stringify(otherEnvelope),
    });
    const { state } = await service.readState(CTX);
    expect(state).toBe("expired");
  });

  it("S7 redémarrage serveur → l'état persiste (même store)", async () => {
    const store: Store = new Map();
    const service1 = makeService(store, fakeActivationClient(makeEnvelope(makePayload())));
    await service1.redeem(CTX, "synthetic-activation-code");
    const service2 = makeService(store, undefined);
    const { state } = await service2.readState(CTX);
    expect(state).toBe("active");
  });

  it("S8 isolation multi-écoles : la licence de B ne vaut jamais pour A", async () => {
    const store: Store = new Map();
    const envelopeB = makeEnvelope(makePayload({ school_id: SCHOOL_B, license_id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff" }));
    const service = makeService(store, fakeActivationClient(envelopeB));
    const result = await service.redeem(CTX, "synthetic-activation-code");
    expect(result.state).toBe("expired");
    expect(store.has(SCHOOL_A)).toBe(false);
  });

  it("anti-rejeu : un jeton plus ancien ne remplace jamais un état plus récent", async () => {
    const store: Store = new Map();
    const fresh = makeEnvelope(makePayload({ issued_at: new Date().toISOString() }));
    const stale = makeEnvelope(makePayload({ status: "revoked", issued_at: new Date(Date.now() - 86_400_000).toISOString() }));
    const service = makeService(store, fakeActivationClient(fresh));
    await service.redeem(CTX, "synthetic-activation-code");
    const serviceStale = makeService(store, fakeActivationClient(stale));
    const result = await serviceStale.refreshFromActivation(CTX);
    expect(result.state).toBe("active");
    expect(store.get(SCHOOL_A)?.status).toBe("active");
  });
});

describe("routes license", () => {
  function fakeAuth(): AuthNativeService {
    const record: AuthSessionInfo = {
      sessionId: "44444444-0000-4000-8000-000000000001",
      identityId: "77777777-0000-4000-8000-000000000001",
      userId: "u1",
      profileId: "p1",
      schoolId: SCHOOL_A,
      mustChange: false,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    return {
      async loginWithPassword() { throw new Error("not used"); },
      async resolveSession(token: string) { return token === "token-valide" ? record : null; },
      async touchSession() { return null; },
      async logout() { return true; },
      async listProfiles() { return []; },
      async forgotPassword() {},
      async resetPassword() { return false; },
      async switchProfile() { return { ok: false as const }; },
      ...lot4AuthStubs,
    };
  }

  it("401 sans session ; 200 avec l'état réel", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeActivationClient(makeEnvelope(makePayload())));
    await service.refreshFromActivation(CTX);
    const app = buildApp({
      authNative: { service: fakeAuth(), cookieSecure: false },
      licenseNative: { authService: fakeAuth(), service },
    });
    const unauthenticated = await app.inject({ method: "GET", url: "/native/license/status" });
    expect(unauthenticated.statusCode).toBe(401);
    const response = await app.inject({
      method: "GET",
      url: "/native/license/status",
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.state).toBe("active");
    expect(response.json().data.license_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });
});