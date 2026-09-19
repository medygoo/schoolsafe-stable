import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import {
  registerSetupRoutes,
  type SetupRouteDependencies,
} from "../src/setup/routes.js";
import type { SetupService } from "../src/setup/service.js";

function createMockService(
  overrides: Partial<SetupService> = {},
): SetupService {
  return {
    getConfig: vi.fn().mockReturnValue({
      supabase_url: "https://test.supabase.co",
      supabase_anon_key: "test-anon-key",
    }),
    validateToken: vi
      .fn()
      .mockImplementation((token) => token === "valid-setup-token"),
    createSchool: vi.fn().mockResolvedValue({
      school_id: "school-1",
      academic_year_id: "year-1",
    }),
    createAdmin: vi.fn().mockResolvedValue({
      user_id: "user-1",
      profile_id: "profile-1",
    }),
    ...overrides,
  };
}

function buildTestApp(service: SetupService) {
  const app = Fastify();
  const deps: SetupRouteDependencies = { service };
  registerSetupRoutes(app, deps);
  return app;
}

const validSchoolPayload = {
  token: "valid-setup-token",
  identity: {
    name_fr: "École Test",
    legal_name: "École Test SARL",
    school_type: "Privée agréée",
    approval_code: "TEST-001",
  },
  cycles: ["primary"],
  academic_year: {
    label: "2026-2027",
    starts_on: "2026-09-01",
    ends_on: "2027-07-15",
    periods: "Trimestres",
  },
  contact: {
    country: "République démocratique du Congo",
    province: "Kinshasa",
    city: "Kinshasa",
    email: "contact@ecole.cd",
    phone: "+243 81 000 00 00",
  },
  brand: {
    primary_color: "#071a3d",
    accent_color: "#e9a515",
  },
};

const validAdminPayload = {
  token: "valid-setup-token",
  email: "admin@ecole.cd",
  password: "SecurePass123!",
  first_name: "Jean",
  last_name: "Admin",
  phone: "+243 82 000 00 00",
};

describe("GET /config", () => {
  it("returns supabase configuration", async () => {
    const service = createMockService();
    const app = buildTestApp(service);

    const response = await app.inject({ method: "GET", url: "/config" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      supabase_url: "https://test.supabase.co",
      supabase_anon_key: "test-anon-key",
    });
    await app.close();
  });
});
describe("POST /setup/validate-token", () => {
  it("accepts a valid setup token", async () => {
    const service = createMockService();
    const app = buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/setup/validate-token",
      payload: { token: "valid-setup-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ valid: true });
    await app.close();
  });

  it("rejects an invalid setup token", async () => {
    const service = createMockService();
    const app = buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/setup/validate-token",
      payload: { token: "wrong-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ valid: false });
    await app.close();
  });
});

describe("POST /setup/school", () => {
  it("creates a school with valid token and payload", async () => {
    const service = createMockService();
    const app = buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/setup/school",
      payload: validSchoolPayload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      school_id: "school-1",
      academic_year_id: "year-1",
    });
    expect(service.createSchool).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("rejects school creation with invalid token", async () => {
    const service = createMockService();
    const app = buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/setup/school",
      payload: { ...validSchoolPayload, token: "wrong-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "SETUP_TOKEN_INVALID" });
    expect(service.createSchool).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects invalid payload", async () => {
    const service = createMockService();
    const app = buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/setup/school",
      payload: { token: "valid-setup-token" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "VALIDATION_INVALID" });
    await app.close();
  });
});

describe("POST /setup/admin", () => {
  it("creates an admin with valid token and payload", async () => {
    const service = createMockService();
    const app = buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/setup/admin",
      payload: validAdminPayload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      user_id: "user-1",
      profile_id: "profile-1",
    });
    expect(service.createAdmin).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("rejects admin creation with invalid token", async () => {
    const service = createMockService();
    const app = buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/setup/admin",
      payload: { ...validAdminPayload, token: "wrong-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "SETUP_TOKEN_INVALID" });
    expect(service.createAdmin).not.toHaveBeenCalled();
    await app.close();
  });
});
