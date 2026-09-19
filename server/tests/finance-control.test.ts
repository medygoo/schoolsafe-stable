import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { FeeControlService } from "../src/finance/control/service.js";
import type { AccessService } from "../src/access/service.js";

const mockService: FeeControlService = {
  async listFeeStructures() {
    return [{ id: "fee-1", label: "Frais scolaires" }];
  },
  async createFeeStructure(schoolId, profileId, input) {
    return { id: "fee-new", ...input };
  },
  async listStudentFees() {
    return [{ id: "sf-1", status: "pending" }];
  },
  async listCampaigns() {
    return [{ id: "camp-1", label: "Contrôle 2e tranche" }];
  },
  async createCampaign(schoolId, profileId, input) {
    return { id: "camp-new", ...input };
  },
  async createScan(schoolId, profileId, input) {
    return { id: "scan-1", ...input };
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
    feeControl: {
      service: mockService,
      resolveProfileAndSchool: mockResolve,
      access: mockAccess,
    },
  });
}

describe("GET /finance/fee-structures", () => {
  it("lists fee structures", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/finance/fee-structures",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
  });
});

describe("POST /finance/fee-structures", () => {
  it("creates a fee structure", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/finance/fee-structures",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        cycle_key: "primary",
        label: "Frais scolaires",
        amount: 300,
        currency: "USD",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.label).toBe("Frais scolaires");
  });
});

describe("POST /finance/fee-control/scans", () => {
  it("creates a fee control scan", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/finance/fee-control/scans",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        campaign_id: "550e8400-e29b-41d4-a716-446655440000",
        student_id: "550e8400-e29b-41d4-a716-446655440001",
        result: "ok",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.result).toBe("ok");
  });
});
