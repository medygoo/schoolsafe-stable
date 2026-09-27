import { describe, it, expect, vi } from "vitest";
import { buildNativeApp } from "../src/native-app.js";
import { parseEnv } from "../src/config/env.js";
import type { VerifiedPools } from "../src/db/startpools.js";

function fixture(extraEnv: NodeJS.ProcessEnv = {}) {
  const authPool = { query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }), end: vi.fn().mockResolvedValue(undefined) };
  const businessPool = { query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }), end: vi.fn().mockResolvedValue(undefined) };
  const app = buildNativeApp(parseEnv({ NODE_ENV: "test", ...extraEnv }), { authPool, businessPool } as unknown as VerifiedPools);
  return { app, authPool, businessPool };
}

describe("application VPS native", () => {
  it("publie uniquement la configuration publique native", async () => {
    const { app } = fixture();
    try {
      const response = await app.inject({ method: "GET", url: "/config" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ auth_mode: "native", setup_available: false, account_registration_available: false });
    } finally { await app.close(); }
  });

  it("protège les données élèves et le bootstrap avec la session du VPS", async () => {
    const { app, businessPool } = fixture();
    try {
      for (const url of ["/native/students/11111111-1111-4111-8111-111111111111", "/native/session/bootstrap"]) {
        const response = await app.inject({ method: "GET", url });
        expect(response.statusCode).toBe(401);
      }
      expect(businessPool.query).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it("n’enregistre aucun ancien parcours de connexion Supabase", async () => {
    const { app } = fixture();
    try {
      for (const url of ["/session/bootstrap", "/auth/lookup-phone"]) {
        const response = await app.inject({ method: "POST", url, payload: {} });
        expect(response.statusCode).toBe(404);
      }
    } finally { await app.close(); }
  });

  it("signale un serveur indisponible lorsque PostgreSQL ne répond plus", async () => {
    const { app, businessPool } = fixture();
    try {
      expect((await app.inject({ method: "GET", url: "/ready" })).statusCode).toBe(200);
      businessPool.query.mockRejectedValueOnce(new Error("test database unavailable"));
      const response = await app.inject({ method: "GET", url: "/ready" });
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain("test database unavailable");
    } finally { await app.close(); }
  });

  it("accepte le cookie depuis le frontend local 4290", async () => {
    const { app } = fixture();
    try {
      const response = await app.inject({ method: "OPTIONS", url: "/auth/native/login", headers: {
        origin: "http://127.0.0.1:4290", "access-control-request-method": "POST",
      } });
      expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:4290");
      expect(response.headers["access-control-allow-credentials"]).toBe("true");
    } finally { await app.close(); }
  });

  it("ferme les deux pools en arrêtant le serveur", async () => {
    const { app, authPool, businessPool } = fixture();
    await app.ready();
    await app.close();
    expect(authPool.end).toHaveBeenCalledOnce();
    expect(businessPool.end).toHaveBeenCalledOnce();
  });
});


describe("legacy public entry points", () => {
  it("keeps only account-first public routes when all legacy environment variables are configured", async () => {
    const { app } = fixture({
      SETUP_TOKEN: "legacy-setup-token",
      SCHOOLSAFE_APPROVER_EMAIL: "approver@example.test",
      SCHOOLSAFE_APPROVAL_URL: "https://approval.example.test/",
      BREVO_API_KEY: "synthetic-brevo-key",
      BREVO_SENDER_EMAIL: "sender@example.test",
      SCHOOLSAFE_GOOGLE_MAIL_URL: "https://google-mail.example.test/exec",
      SCHOOLSAFE_GOOGLE_MAIL_SECRET: "synthetic-google-secret",
    });

    try {
      const legacyResponses = await Promise.all([
        app.inject({ method: "POST", url: "/setup/validate-token", payload: { token: "legacy-setup-token" } }),
        app.inject({ method: "POST", url: "/setup/school", payload: {} }),
        app.inject({ method: "POST", url: "/setup/admin", payload: {} }),
        app.inject({ method: "POST", url: "/setup/registrations", payload: {} }),
        app.inject({ method: "POST", url: "/setup/registrations/review", payload: {} }),
        app.inject({ method: "POST", url: "/setup/registrations/decision", payload: {} }),
      ]);
      expect(legacyResponses.map(response => response.statusCode)).toEqual([404, 404, 404, 404, 404, 404]);

      const config = await app.inject({ method: "GET", url: "/config" });
      expect(config.statusCode).toBe(200);
      expect(config.json()).toMatchObject({ auth_mode: "native", setup_available: false, account_registration_available: true });

      const canonicalResponses = await Promise.all([
        app.inject({ method: "POST", url: "/auth/registrations", payload: {} }),
        app.inject({ method: "POST", url: "/auth/registrations/review", payload: {} }),
        app.inject({ method: "POST", url: "/auth/registrations/decision", payload: {} }),
        app.inject({ method: "GET", url: "/auth/onboarding/me" }),
        app.inject({ method: "POST", url: "/auth/onboarding/school", payload: {} }),
        app.inject({ method: "POST", url: "/auth/native/login", payload: {} }),
      ]);
      expect(canonicalResponses.map(response => response.statusCode)).toEqual([400, 403, 403, 401, 401, 400]);
    } finally { await app.close(); }
  });
});
