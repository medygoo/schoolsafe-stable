import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { SecurityService } from "../src/security/service.js";
import type { SecurityScanResult } from "../src/security/schema.js";
import type { AccessService } from "../src/access/service.js";

const mockService: SecurityService = {
  async createCard() {
    return { card_number: "SS-SCH-MAT-123456789", signature: "sig" };
  },
  async scan(input) {
    return {
      decision: "allowed",
      student: {
        id: "student-1",
        matricule: "MAT-001",
        first_name: "Grâce",
        last_name: "Kabamba",
        class_name: "4e primaire",
        photo_path: null,
      },
      authorized_persons: [],
      event: {
        id: "evt-1",
        event_type: input.event_type,
        decision: "allowed",
        occurred_at: new Date().toISOString(),
      },
    };
  },
  async setLockdown(active) {
    return { active, activated_at: active ? new Date().toISOString() : null, activated_by: "profile-1" };
  },
  async listEvents(options) {
    return { data: [], count: 0 };
  },
};

const mockAccess: AccessService = {
  hasPermission: vi.fn().mockResolvedValue(true),
  hasScope: vi.fn().mockResolvedValue(true),
};

const mockResolve = async (token: string) =>
  token === "valid-token" ? { profileId: "resolved-profile-id", schoolId: "school-1" } : { profileId: null, schoolId: null };

function makeApp() {
  return buildApp({
    security: {
      service: mockService,
      resolveProfileAndSchool: mockResolve,
      access: mockAccess,
    },
  });
}

describe("POST /security/scan", () => {
  const validPayload = {
    qr_payload: "schoolsafe://card/SS-SCH-MAT-123456789/sig",
    event_type: "entry",
    location_id: "550e8400-e29b-41d4-a716-446655440000",
  };

  it("returns 401 without authorization header", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/security/scan",
      payload: validPayload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("AUTH_REQUIRED");
  });

  it("returns 401 when profile cannot be resolved", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/security/scan",
      headers: { authorization: "Bearer invalid-token" },
      payload: validPayload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("AUTH_REQUIRED");
  });

  it("returns 403 when permission is denied", async () => {
    const app = buildApp({
      security: {
        service: mockService,
        resolveProfileAndSchool: mockResolve,
        access: { hasPermission: vi.fn().mockResolvedValue(false), hasScope: vi.fn().mockResolvedValue(true) },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/security/scan",
      headers: { authorization: "Bearer valid-token" },
      payload: validPayload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("ACCESS_DENIED");
  });

  it("returns 403 and audits when scope is denied", async () => {
    const auditInsert = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({
      security: {
        service: mockService,
        resolveProfileAndSchool: mockResolve,
        access: { hasPermission: vi.fn().mockResolvedValue(true), hasScope: vi.fn().mockResolvedValue(false) },
        audit: { insert: auditInsert },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/security/scan",
      headers: { authorization: "Bearer valid-token" },
      payload: validPayload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("SCOPE_DENIED");
    expect(auditInsert).toHaveBeenCalledWith({
      schoolId: "school-1",
      actorProfileId: "resolved-profile-id",
      eventType: "access.denied",
      payload: {
        permission: "security.scan",
        resource_type: "security.scan",
        resource_id: validPayload.location_id,
        reason: "SCOPE_DENIED",
        scope_type: "assigned_portal",
        scope_id: validPayload.location_id,
      },
    });
  });

  it("returns 400 with invalid body", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/security/scan",
      headers: { authorization: "Bearer valid-token" },
      payload: { qr_payload: "bad" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_INVALID");
  });

  it("returns scan result for valid request", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/security/scan",
      headers: { authorization: "Bearer valid-token" },
      payload: validPayload,
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.data.decision).toBe("allowed");
    expect(json.data.student).toBeDefined();
    expect(json.data.event).toBeDefined();
  });
});

describe("POST /security/lockdown", () => {
  it("toggles lockdown state", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/security/lockdown",
      headers: { authorization: "Bearer valid-token" },
      payload: { active: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.active).toBe(true);
  });
});

describe("GET /security/events", () => {
  it("lists events", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/security/events?limit=10&offset=0",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(res.json().count).toBe(0);
  });
});

describe("Security scan business cases", () => {
  function makeAppWithScanResult(result: Partial<SecurityScanResult>) {
    const service: SecurityService = {
      ...mockService,
      async scan(input) {
        return {
          decision: result.decision ?? "allowed",
          reason: result.reason,
          student: result.student ?? null,
          authorized_persons: result.authorized_persons ?? [],
          event: result.event ?? { id: "evt-1", event_type: input.event_type, decision: "allowed", occurred_at: new Date().toISOString() },
          alert: result.alert,
        };
      },
    };
    return buildApp({
      security: {
        service,
        resolveProfileAndSchool: mockResolve,
        access: mockAccess,
      },
    });
  }

  it("returns denied with reason when exit is not authorized", async () => {
    const app = makeAppWithScanResult({
      decision: "denied",
      reason: "no_authorized_person",
      student: { id: "student-1", matricule: "MAT-001", first_name: "Grâce", last_name: "Kabamba", class_name: "4e primaire", photo_path: null },
    });
    const res = await app.inject({
      method: "POST",
      url: "/security/scan",
      headers: { authorization: "Bearer valid-token" },
      payload: { qr_payload: "schoolsafe://card/SS-SCH-MAT-123456789/sig", event_type: "exit", location_id: "550e8400-e29b-41d4-a716-446655440000" },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.data.decision).toBe("denied");
    expect(json.data.reason).toBe("no_authorized_person");
    expect(json.data.student).toBeDefined();
    await app.close();
  });

  it("returns allowed for a valid entry scan", async () => {
    const app = makeAppWithScanResult({
      decision: "allowed",
      student: { id: "student-1", matricule: "MAT-001", first_name: "Grâce", last_name: "Kabamba", class_name: "4e primaire", photo_path: null },
    });
    const res = await app.inject({
      method: "POST",
      url: "/security/scan",
      headers: { authorization: "Bearer valid-token" },
      payload: { qr_payload: "schoolsafe://card/SS-SCH-MAT-123456789/sig", event_type: "entry", location_id: "550e8400-e29b-41d4-a716-446655440000" },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.data.decision).toBe("allowed");
    expect(json.data.reason).toBeUndefined();
    expect(json.data.event).toBeDefined();
    await app.close();
  });
});
