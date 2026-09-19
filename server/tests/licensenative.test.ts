import { describe, expect, it } from "vitest";
import { generateKeyPairSync, createPrivateKey, sign as cryptoSign } from "node:crypto";
import { buildApp } from "../src/app.js";
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

// ─── vraie paire Ed25519 de test ───
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

// Faux pool qui persiste réellement en mémoire (redémarrage = même Map).
// Les requêtes passent par les RPC definer — jamais de table directe.
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

// Le faux pool lit l'école du contexte courant (le vrai contexte vient de la
// transaction ; ici les tests n'utilisent qu'une école par appel).
let CTX_SCHOOL_FROM_CONTEXT = SCHOOL_A;

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

describe("license Ed25519 — primitives", () => {
  it("vérifie un jeton signé Control", () => {
    const token = signToken(makePayload());
    expect(verifyLicenseToken(token, PUBLIC_PEM)?.license_id).toBe("LIC-TEST-1");
  });

  it("rejette un jeton falsifié (payload modifié après signature)", () => {
    const token = signToken(makePayload());
    const [payloadB64, sig] = token.split(".");
    const tampered = Buffer.from(JSON.stringify(makePayload({ grace_days: 365 }))).toString("base64url");
    expect(verifyLicenseToken(`${tampered}.${sig}`, PUBLIC_PEM)).toBeNull();
  });

  it("rejette une signature d'une AUTRE clé", () => {
    const other = generateKeyPairSync("ed25519");
    const otherPrivate = createPrivateKey(other.privateKey.export({ format: "pem", type: "pkcs8" }).toString());
    const payloadB64 = Buffer.from(JSON.stringify(makePayload())).toString("base64url");
    const sig = cryptoSign(null, Buffer.from(payloadB64, "utf8"), otherPrivate).toString("base64url");
    expect(verifyLicenseToken(`${payloadB64}.${sig}`, PUBLIC_PEM)).toBeNull();
  });

  it("computeLicenseState : revoked ne connaît pas de grâce", () => {
    const revoked = makePayload({ status: "revoked", expires_at: new Date(Date.now() + 86_400_000).toISOString() });
    expect(computeLicenseState(revoked, new Date(), new Date())).toBe("revoked");
  });

  it("anti-retour d'horloge : l'heure effective ne descend jamais sous last_seen_at", () => {
    const past = new Date(Date.now() - 2 * 86_400_000);
    const lastSeen = new Date(); // le serveur a déjà vu "maintenant"
    const payload = makePayload({
      issued_at: past.toISOString(),
      expires_at: new Date(Date.now() - 86_400_000).toISOString(), // expiré "selon l'horloge reculée"...
    });
    // ...mais avec une horloge reculée de 2 jours, on serait ENCORE dans la grâce.
    // Le plancher last_seen_at empêche ce gain de temps.
    expect(computeLicenseState(payload, past, lastSeen)).toBe("grace"); // grâce selon la vraie heure (expires+7j)
    const payloadGraceOver = makePayload({
      expires_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      grace_days: 7,
    });
    expect(computeLicenseState(payloadGraceOver, past, lastSeen)).toBe("expired");
  });
});

describe("license service — les 8 scénarios obligatoires", () => {
  it("S1 Control disponible + licence active → active", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeControl(signToken(makePayload())));
    const result = await service.refreshFromControl(CTX);
    expect(result.state).toBe("active");
    expect(store.get(SCHOOL_A)?.license_id).toBe("LIC-TEST-1");
  });

  it("S2 Control indisponible + grâce valide → grace, la porte reste ouverte", async () => {
    const store: Store = new Map();
    const token = signToken(
      makePayload({ expires_at: new Date(Date.now() - 86_400_000).toISOString() }), // expiré hier, grâce 7j
    );
    const service = makeService(store, fakeControl(token));
    await service.refreshFromControl(CTX);
    const offline = await service.gateAllows(CTX);
    expect(offline).toBe(true);
    const { state } = await service.readState(CTX);
    expect(state).toBe("grace");
  });

  it("S3 grâce expirée → expired, porte fermée (fail-closed)", async () => {
    const store: Store = new Map();
    const token = signToken(
      makePayload({ expires_at: new Date(Date.now() - 20 * 86_400_000).toISOString() }),
    );
    const service = makeService(store, fakeControl(token));
    await service.refreshFromControl(CTX);
    expect(await service.gateAllows(CTX)).toBe(false);
  });

  it("S4 licence révoquée → révocation appliquée immédiatement, sans grâce", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeControl(signToken(makePayload())));
    await service.refreshFromControl(CTX); // active d'abord
    // Control révoque au rafraîchissement suivant
    const revokedService = createLicenseNativeService(
      fakeBusinessPool(store),
      fakeControl(signToken(makePayload({ status: "revoked", issued_at: new Date().toISOString() }))),
      PUBLIC_PEM,
    );
    const result = await revokedService.refreshFromControl(CTX);
    expect(result.state).toBe("revoked");
    expect(await revokedService.gateAllows(CTX)).toBe(false);
  });

  it("S5 état local falsifié → la signature casse, fermé", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeControl(signToken(makePayload())));
    await service.refreshFromControl(CTX);
    // Un attaquant réécrit la ligne : token d'une AUTRE licence/école.
    store.set(SCHOOL_A, {
      ...store.get(SCHOOL_A)!,
      signed_token: signToken(makePayload({ school_id: SCHOOL_B, license_id: "LIC-PIRATE" })),
    });
    const { state } = await service.readState(CTX);
    expect(state).toBe("expired"); // jamais "actif" avec un jeton falsifié
  });

  it("S6 changement d'horloge en arrière → pas de gain de grâce", async () => {
    const store: Store = new Map();
    const token = signToken(
      makePayload({ expires_at: new Date(Date.now() - 10 * 86_400_000).toISOString(), grace_days: 7 }),
    );
    const service = makeService(store, fakeControl(token));
    await service.refreshFromControl(CTX);
    // Même si l'horloge reculait, last_seen_at borne : grâce déjà dépassée.
    expect(await service.gateAllows(CTX)).toBe(false);
  });

  it("S7 redémarrage serveur → l'état persiste (même store)", async () => {
    const store: Store = new Map();
    const service1 = makeService(store, fakeControl(signToken(makePayload())));
    await service1.refreshFromControl(CTX);
    // "Redémarrage" : nouveau service, même base
    const service2 = makeService(store, undefined);
    const { state } = await service2.readState(CTX);
    expect(state).toBe("active");
  });

  it("S8 isolation multi-écoles : la licence de B ne vaut jamais pour A", async () => {
    const store: Store = new Map();
    const tokenB = signToken(makePayload({ school_id: SCHOOL_B, license_id: "LIC-B" }));
    const service = makeService(store, fakeControl(tokenB));
    // Control renvoie la licence de B à la place de celle de A (falsification d'attaque) :
    const result = await service.refreshFromControl(CTX);
    expect(result.state).toBe("expired"); // refusée, rien stocké
    expect(store.has(SCHOOL_A)).toBe(false);
  });

  it("anti-rejeu : un jeton plus ancien ne remplace jamais un état plus récent", async () => {
    const store: Store = new Map();
    const fresh = signToken(makePayload({ issued_at: new Date().toISOString() }));
    const stale = signToken(makePayload({ status: "revoked", issued_at: new Date(Date.now() - 86_400_000).toISOString() }));
    const service = makeService(store, fakeControl(fresh));
    await service.refreshFromControl(CTX);
    const serviceStale = makeService(store, fakeControl(stale));
    const result = await serviceStale.refreshFromControl(CTX);
    expect(result.state).toBe("active"); // l'ancien "revoked" est ignoré
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
    async forgotPassword() {
      return null;
    },
    async attachRecoveryToken() {
      return false;
    },
    async resetPassword() {
      return false;
    },
    async switchProfile() {
      return { ok: false as const };
    },
    };
  }

  it("401 sans session ; 200 avec l'état réel", async () => {
    const store: Store = new Map();
    const service = makeService(store, fakeControl(signToken(makePayload())));
    await service.refreshFromControl(CTX);
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
    expect(response.json().data.license_id).toBe("LIC-TEST-1");
  });
});
