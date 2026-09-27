import { describe, expect, it, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { AuthDatabase } from "../src/authnative/service.js";

// Stub DB qui simule api.prodeli_list_registrations sans PostgreSQL réel
function createStubProdeliDb(): AuthDatabase {
  return {
    query: async (text: string, params?: unknown[]) => {
      if (text.includes("api.prodeli_list_registrations")) {
        const status = params?.[0] as string | null;
        const limit = (params?.[1] as number) ?? 50;
        const rows = [
          {
            request_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            first_name: "Jean",
            last_name: "Dupont",
            email: "jean.dupont@example.com",
            phone: "+243812345678",
            status: status ?? "pending",
            created_at: "2026-09-27T10:00:00Z",
            approved_at: null,
            rejected_at: null,
            completed_at: null,
          },
        ].slice(0, limit);
        return { rows, rowCount: rows.length } as any;
      }
      return { rows: [], rowCount: 0 } as any;
    },
  } as unknown as AuthDatabase;
}

function buildTestApp(): FastifyInstance {
  return buildApp({
    prodeli: {
      auth: {
        serviceToken: "test-prodeli-service-token-minimum-32-chars!",
        allowedOperators: ["operator@prodeli.example.com"],
      },
      registrations: { db: createStubProdeliDb() },
    },
  });
}

describe("PRODELI registrations API - GREEN tests", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.inject({ method: "GET", url: "/prodeli/v1/registrations" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 with invalid Bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/prodeli/v1/registrations",
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 with valid token but unauthorized operator", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/prodeli/v1/registrations",
      headers: {
        authorization: "Bearer test-prodeli-service-token-minimum-32-chars!",
        "x-prodeli-operator": "unknown@evil.com",
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 200 with valid token and authorized operator", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/prodeli/v1/registrations",
      headers: {
        authorization: "Bearer test-prodeli-service-token-minimum-32-chars!",
        "x-prodeli-operator": "operator@prodeli.example.com",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("count");
  });

  it("never exposes password, token_hash, or approval_token in response", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/prodeli/v1/registrations",
      headers: {
        authorization: "Bearer test-prodeli-service-token-minimum-32-chars!",
        "x-prodeli-operator": "operator@prodeli.example.com",
      },
    });
    const body = JSON.stringify(res.json());
    expect(body).not.toContain("password");
    expect(body).not.toContain("password_hash");
    expect(body).not.toContain("token_hash");
    expect(body).not.toContain("approval_token");
    expect(body).not.toContain("onboarding_token");
    expect(body).not.toContain("secret");
  });

  it("returns 400 for invalid status filter", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/prodeli/v1/registrations?status=invalid",
      headers: {
        authorization: "Bearer test-prodeli-service-token-minimum-32-chars!",
        "x-prodeli-operator": "operator@prodeli.example.com",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for limit > 100", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/prodeli/v1/registrations?limit=200",
      headers: {
        authorization: "Bearer test-prodeli-service-token-minimum-32-chars!",
        "x-prodeli-operator": "operator@prodeli.example.com",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns pending registration with only safe fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/prodeli/v1/registrations?status=pending&limit=10",
      headers: {
        authorization: "Bearer test-prodeli-service-token-minimum-32-chars!",
        "x-prodeli-operator": "operator@prodeli.example.com",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    const row = body.data[0];
    expect(row).toHaveProperty("request_id");
    expect(row).toHaveProperty("first_name");
    expect(row).toHaveProperty("last_name");
    expect(row).toHaveProperty("email");
    expect(row).toHaveProperty("phone");
    expect(row).toHaveProperty("status");
    expect(row).toHaveProperty("created_at");
    expect(row).not.toHaveProperty("password_hash");
    expect(row).not.toHaveProperty("approval_token_hash");
    expect(row).not.toHaveProperty("identity_id");
  });
});