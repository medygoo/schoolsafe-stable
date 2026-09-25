import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { AuthPool } from "../src/db/pool.js";
import { hashPassword } from "../src/authnative/passwords.js";
import { createRegistrationService } from "../src/setup/registration-service.js";
import type { RegistrationPayload } from "../src/setup/registration-schema.js";

function buildPayload(overrides: Partial<RegistrationPayload> = {}): RegistrationPayload {
  return {
    identity: { name_fr: "École Test", school_type: "Privée agréée" },
    cycles: ["primary"],
    academic_year: {
      label: "2026-2027",
      starts_on: "2026-09-01",
      ends_on: "2027-07-31",
      periods: "Trimestres",
    },
    contact: {
      country: "République démocratique du Congo",
      province: "Kinshasa",
      city: "Kinshasa",
      website_mode: "Créer un nouveau site SchoolSafe",
      public_news: "Après validation",
      public_gallery: "Après validation et consentement",
      public_honors: "Après validation",
    },
    brand: { primary_color: "#071a3d", accent_color: "#e9a515" },
    admin: {
      email: "admin@example.test",
      password: "SecretLongEnough1!",
      first_name: "Admin",
      last_name: "Test",
    },
    ...overrides,
  };
}

describe("prepareRegistration", () => {
  it("validates payload and rejects invalid input", async () => {
    const pool = { query: vi.fn() } as unknown as AuthPool;
    const service = createRegistrationService(pool);
    await expect(
      service.prepareRegistration({
        identity: { name_fr: "" },
        cycles: [],
        academic_year: { label: "", starts_on: "bad", ends_on: "bad", periods: "Trimestres" },
        contact: {},
        brand: {},
        admin: { email: "not-an-email", password: "short", first_name: "", last_name: "" },
      } as unknown as RegistrationPayload),
    ).rejects.toThrow();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("hashes password with Argon2id and never sends plaintext to PostgreSQL", async () => {
    const request_id = randomUUID();
    const captured: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        captured.push({ sql, params });
        return { rows: [{ result: { request_id, status: "pending" } }] };
      }),
    } as unknown as AuthPool;

    const service = createRegistrationService(pool);
    const payload = buildPayload();
    const result = await service.prepareRegistration(payload);

    expect(result).toEqual({ request_id, status: "pending" });
    expect(captured).toHaveLength(1);
    expect(captured[0].sql).toContain("api.school_registration_prepare");
    const [jsonParam, hashParam] = captured[0].params as [string, string];
    const parsed = JSON.parse(jsonParam);
    expect(parsed.admin?.password).toBeUndefined();
    expect(hashParam).toMatch(/^\$argon2id\$/);
  });

  it("calls the RPC exactly once and returns pending status", async () => {
    const request_id = randomUUID();
    const pool = {
      query: vi.fn(async () => ({ rows: [{ result: { request_id, status: "pending" } }] })),
    } as unknown as AuthPool;

    const service = createRegistrationService(pool);
    const result = await service.prepareRegistration(buildPayload());

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("pending");
    expect(result.request_id).toBe(request_id);
  });
});