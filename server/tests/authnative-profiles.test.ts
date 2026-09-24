import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AuthNativeService, AuthSessionInfo, ProfileChoice } from "../src/authnative/service.js";
import { lot4AuthStubs } from "./helpers/lot4-auth-stubs.js";

const PROFILES: ProfileChoice[] = [
  {
    profileId: "66666666-0000-4000-8000-000000000001",
    schoolId: "33333333-0000-4000-8000-000000000001",
    schoolCode: "ECOLE-A",
    schoolName: "École A",
    displayName: "Admin École A",
  },
  {
    profileId: "66666666-0000-4000-8000-000000000002",
    schoolId: "33333333-0000-4000-8000-000000000002",
    schoolCode: "ECOLE-B",
    schoolName: "École B",
    displayName: "Parent École B",
  },
];

function fakeAuth(opts: { switchOk?: boolean } = {}): AuthNativeService & { switchedTo: string | null; loggedOut: string[] } {
  const record: AuthSessionInfo = {
    sessionId: "44444444-0000-4000-8000-000000000001",
    identityId: "77777777-0000-4000-8000-000000000001",
    userId: "55555555-0000-4000-8000-000000000001",
    profileId: PROFILES[0].profileId,
    schoolId: PROFILES[0].schoolId,
    mustChange: false,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  const state = { switchedTo: null as string | null, loggedOut: [] as string[] };
  return {
    ...state,
    async loginWithPassword() {
      throw new Error("not used");
    },
    async resolveSession(token: string) {
      return token === "token-valide" ? record : null;
    },
    async touchSession() {
      return null;
    },
    async logout(token: string) {
      state.loggedOut.push(token);
      return true;
    },
    async listProfiles() {
      return PROFILES;
    },
    async forgotPassword() {},
    async resetPassword() {
      return false;
    },
    async switchProfile(token: string, profileId: string) {
      if (opts.switchOk === false) return { ok: false as const };
      state.loggedOut.push(token); // le vrai service révoque l'ancienne session
      state.switchedTo = profileId;
      return {
        ok: true as const,
        token: "nouveau-token",
        session: { ...record, profileId, schoolId: PROFILES[1].schoolId },
      };
    },
    ...lot4AuthStubs,
    async recoverParentAccount() { return false; },
    async adminGenerateRecoveryCode() { return false; },
    async redeemAdminRecoveryCode() { return null; },
    async createRecoveryRequest() { return null; },
    db: {} as any,
  };
}

describe("INC-7 — routes de choix explicite du profil", () => {
  it("GET /auth/native/profiles : 401 sans session", async () => {
    const app = buildApp({ authNative: { service: fakeAuth(), cookieSecure: false } });
    const response = await app.inject({ method: "GET", url: "/auth/native/profiles" });
    expect(response.statusCode).toBe(401);
  });

  it("GET /auth/native/profiles : école + profil affichés", async () => {
    const app = buildApp({ authNative: { service: fakeAuth(), cookieSecure: false } });
    const response = await app.inject({
      method: "GET",
      url: "/auth/native/profiles",
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).toBe(200);
    const profiles = response.json().profiles;
    expect(profiles).toHaveLength(2);
    expect(profiles[1].schoolName).toBe("École B");
    expect(profiles[1].displayName).toBe("Parent École B");
  });

  it("POST /auth/native/switch-profile : nouveau cookie, ancienne session révoquée", async () => {
    const service = fakeAuth();
    const app = buildApp({ authNative: { service, cookieSecure: false } });
    const response = await app.inject({
      method: "POST",
      url: "/auth/native/switch-profile",
      headers: { cookie: "schoolsafe_session=token-valide" },
      payload: { profileId: PROFILES[1].profileId },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().profile_id).toBe(PROFILES[1].profileId);
    // l'ancienne session a été révoquée — l'ancien contexte est mort
    expect(service.loggedOut).toContain("token-valide");
    // un NOUVEAU cookie est posé
    const setCookie = response.headers["set-cookie"];
    expect(String(setCookie)).toContain("schoolsafe_session=nouveau-token");
  });

  it("POST /auth/native/switch-profile : profil refusé → 401, aucune énumération", async () => {
    const app = buildApp({ authNative: { service: fakeAuth({ switchOk: false }), cookieSecure: false } });
    const response = await app.inject({
      method: "POST",
      url: "/auth/native/switch-profile",
      headers: { cookie: "schoolsafe_session=token-valide" },
      payload: { profileId: "99999999-0000-4000-8000-000000000001" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("POST /auth/native/switch-profile : session expirée → 401 fail-closed", async () => {
    const app = buildApp({ authNative: { service: fakeAuth(), cookieSecure: false } });
    const response = await app.inject({
      method: "POST",
      url: "/auth/native/switch-profile",
      payload: { profileId: PROFILES[1].profileId },
    });
    expect(response.statusCode).toBe(401);
  });
});
