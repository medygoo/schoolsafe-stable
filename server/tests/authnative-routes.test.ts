import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { AuthNativeService, LoginResult } from "../src/authnative/service.js";

function serviceStub(overrides: Partial<AuthNativeService>): AuthNativeService {
  return {
    loginWithPassword: async () => ({ ok: false, reason: "invalid_credentials" }),
    resolveSession: async () => null,
    touchSession: async () => null,
    logout: async () => false,
    ...overrides,
  } as AuthNativeService;
}

function appWith(service: AuthNativeService) {
  return buildApp({ authNative: { service, cookieSecure: true } });
}

describe("POST /auth/native/login", () => {
  it("sets an opaque HttpOnly+Secure+SameSite=Lax cookie and never exposes the token twice", async () => {
    const login: LoginResult = {
      ok: true,
      token: "jeton-opaque-de-test",
      session: {
        sessionId: "s1",
        identityId: "i1",
        userId: "u1",
        profileId: "p1",
        schoolId: "",
        mustChange: false,
        expiresAt: "2026-09-05T00:00:00Z",
      },
    };
    const app = appWith(serviceStub({ loginWithPassword: async () => login }));
    const response = await app.inject({
      method: "POST",
      url: "/auth/native/login",
      payload: { login: "joyce@ecole.cd", password: "Joie2026!!" },
    });
    expect(response.statusCode).toBe(200);
    const cookie = response.headers["set-cookie"] as string;
    expect(cookie).toContain("schoolsafe_session=jeton-opaque-de-test");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(response.body).not.toContain("jeton-opaque-de-test");
    expect(response.json().profile_id).toBe("p1");
    await app.close();
  });

  it("answers identically for unknown login and wrong password (no enumeration)", async () => {
    const app = appWith(serviceStub({}));
    for (const payload of [
      { login: "inconnu@ecole.cd", password: "x" },
      { login: "joyce@ecole.cd", password: "mauvais" },
    ]) {
      const response = await app.inject({ method: "POST", url: "/auth/native/login", payload });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe("AUTH_REQUIRED");
    }
    await app.close();
  });

  it("returns the school choice when the user has several active profiles", async () => {
    const login: LoginResult = {
      ok: false,
      reason: "profile_choice_required",
      profiles: [
        { profileId: "pA", schoolId: "schoolA", schoolCode: "ECOLE-A", schoolName: "École A", displayName: "Joyce (A)" },
        { profileId: "pB", schoolId: "schoolB", schoolCode: "ECOLE-B", schoolName: "École B", displayName: "Joyce (B)" },
      ],
    };
    const app = appWith(serviceStub({ loginWithPassword: async () => login }));
    const response = await app.inject({
      method: "POST",
      url: "/auth/native/login",
      payload: { login: "joyce@ecole.cd", password: "Joie2026!!" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().code).toBe("PROFILE_CHOICE_REQUIRED");
    expect(response.json().profiles).toHaveLength(2);
    expect(response.headers["set-cookie"]).toBeUndefined();
    await app.close();
  });
});

describe("GET /auth/native/me", () => {
  it("401 without cookie", async () => {
    const app = appWith(serviceStub({}));
    const response = await app.inject({ method: "GET", url: "/auth/native/me" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("resolves the session from the cookie and renews it past mid-life", async () => {
    let sawToken: string | null = null;
    const service = serviceStub({
      resolveSession: async (token: string) => {
        sawToken = token;
        return {
          sessionId: "s1",
          identityId: "i1",
          userId: "u1",
          profileId: "p1",
          schoolId: "schoolA",
          mustChange: false,
          expiresAt: "",
        };
      },
      touchSession: async () => "2026-09-05T12:00:00Z",
    });
    const app = appWith(service);
    const response = await app.inject({
      method: "GET",
      url: "/auth/native/me",
      headers: { cookie: "schoolsafe_session=jeton-opaque-de-test" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().school_id).toBe("schoolA");
    expect(sawToken).toBe("jeton-opaque-de-test");
    // sliding : cookie renouvelé avec la même valeur opaque
    expect(response.headers["set-cookie"]).toContain("schoolsafe_session=jeton-opaque-de-test");
    await app.close();
  });
});

describe("POST /auth/native/logout", () => {
  it("revokes and clears the cookie", async () => {
    let revokedWith: string | null = null;
    const service = serviceStub({
      logout: async (token: string) => {
        revokedWith = token;
        return true;
      },
    });
    const app = appWith(service);
    const response = await app.inject({
      method: "POST",
      url: "/auth/native/logout",
      headers: { cookie: "schoolsafe_session=jeton-opaque-de-test" },
    });
    expect(response.statusCode).toBe(200);
    expect(revokedWith).toBe("jeton-opaque-de-test");
    expect(response.headers["set-cookie"]).toContain("Max-Age=0");
    await app.close();
  });
});
