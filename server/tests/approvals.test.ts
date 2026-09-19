import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { ApprovalService } from "../src/pilotage/approvals/service.js";
import type { AccessService } from "../src/access/service.js";

const mockService: ApprovalService = {
  async list(schoolId, options) {
    return {
      data: [
        {
          id: "approval-1",
          school_id: schoolId,
          request_type: "payment_cancel",
          entity_type: "payment",
          entity_id: "payment-1",
          requested_by: "profile-1",
          requested_at: new Date().toISOString(),
          status: "pending",
          decided_by: null,
          decided_at: null,
          expected_version: 1,
          payload: {},
          reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      count: 1,
    };
  },
  async create(schoolId, profileId, input) {
    return {
      id: "approval-new",
      school_id: schoolId,
      request_type: input.request_type,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      requested_by: profileId,
      requested_at: new Date().toISOString(),
      status: "pending",
      decided_by: null,
      decided_at: null,
      expected_version: input.expected_version ?? 1,
      payload: input.payload ?? {},
      reason: input.reason ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  },
  async decide(approvalId, schoolId, profileId, input) {
    return {
      id: approvalId,
      school_id: schoolId,
      request_type: "payment_cancel",
      entity_type: "payment",
      entity_id: "payment-1",
      requested_by: "profile-1",
      requested_at: new Date().toISOString(),
      status: input.decision,
      decided_by: profileId,
      decided_at: new Date().toISOString(),
      expected_version: 1,
      payload: {},
      reason: input.reason ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
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
    approvals: {
      service: mockService,
      resolveProfileAndSchool: mockResolve,
      access: mockAccess,
    },
  });
}

describe("GET /pilotage/approvals", () => {
  it("lists approval requests", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/pilotage/approvals?limit=10",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().count).toBe(1);
    await app.close();
  });
});

describe("POST /pilotage/approvals", () => {
  it("creates an approval request", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/pilotage/approvals",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        request_type: "payment_cancel",
        entity_type: "payment",
        entity_id: "00000000-0000-0000-0000-000000000001",
        expected_version: 2,
        reason: "Erreur de saisie",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("pending");
    expect(res.json().data.expected_version).toBe(2);
    await app.close();
  });
});

describe("POST /pilotage/approvals/:id/decide", () => {
  it("approves an approval request", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/pilotage/approvals/approval-1/decide",
      headers: { authorization: "Bearer valid-token" },
      payload: { decision: "approved", reason: "Validé par la direction" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("approved");
    expect(res.json().data.decided_by).toBe("resolved-profile-id");
    await app.close();
  });

  it("rejects an approval request", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/pilotage/approvals/approval-1/decide",
      headers: { authorization: "Bearer valid-token" },
      payload: { decision: "rejected", reason: "Refusé" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("rejected");
    await app.close();
  });
});
