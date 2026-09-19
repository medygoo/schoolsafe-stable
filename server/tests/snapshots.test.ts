import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { SnapshotService } from "../src/pilotage/snapshots/service.js";
import type { AccessService } from "../src/access/service.js";

const mockService: SnapshotService = {
  async capture(schoolId) {
    return [
      { indicator_code: "open_alerts", value: 2, unit: "count" },
      { indicator_code: "today_events", value: 15, unit: "count" },
    ];
  },
  async getTrend(schoolId, indicatorCode, days) {
    return [
      { snapshot_date: "2026-08-17", value: 1 },
      { snapshot_date: "2026-08-18", value: 2 },
      { snapshot_date: "2026-08-19", value: 3 },
    ];
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
    snapshots: {
      service: mockService,
      resolveProfileAndSchool: mockResolve,
      access: mockAccess,
    },
  });
}

describe("POST /pilotage/snapshots/capture", () => {
  it("captures daily snapshots", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/pilotage/snapshots/capture",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(2);
    await app.close();
  });
});

describe("GET /pilotage/snapshots/trend", () => {
  it("returns indicator trend", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/pilotage/snapshots/trend?indicator_code=open_alerts&days=7",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(3);
    expect(res.json().data[0].snapshot_date).toBe("2026-08-17");
    await app.close();
  });
});
