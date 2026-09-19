import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { AlertService } from "../src/pilotage/alerts/service.js";
import type { DashboardService } from "../src/pilotage/dashboard/service.js";
import type { AccessService } from "../src/access/service.js";

const mockAlertService: AlertService = {
  async list(input) {
    return { data: [], count: 0 };
  },
  async acknowledge(alertId, input) {
    return { id: alertId, status: "acknowledged" };
  },
  async resolve(alertId, input) {
    return { id: alertId, status: "resolved" };
  },
  async evaluateRules(context) {
    return [{ created: true, alertId: "alert-eval-1", title: "Règle déclenchée", severity: "important" }];
  },
};

const mockDashboardService: DashboardService = {
  async load(schoolId) {
    return { school_id: schoolId, kpis: [] };
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
    alerts: {
      service: mockAlertService,
      resolveProfileAndSchool: mockResolve,
      access: mockAccess,
    },
    dashboard: {
      service: mockDashboardService,
      resolveProfileAndSchool: mockResolve,
      access: mockAccess,
    },
  });
}

describe("GET /pilotage/dashboard", () => {
  it("returns 401 without authorization header", async () => {
    const app = makeApp();
    const res = await app.inject({ method: "GET", url: "/pilotage/dashboard" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("AUTH_REQUIRED");
  });

  it("returns dashboard data for authenticated user", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/pilotage/dashboard",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.school_id).toBe("school-1");
  });
});

describe("GET /pilotage/alerts", () => {
  it("lists alerts", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/pilotage/alerts?limit=10",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });
});

describe("POST /pilotage/alerts/:id/acknowledge", () => {
  it("acknowledges an alert", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/pilotage/alerts/alert-1/acknowledge",
      headers: { authorization: "Bearer valid-token" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("acknowledged");
  });
});

describe("POST /pilotage/alerts/:id/resolve", () => {
  it("resolves an alert", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/pilotage/alerts/alert-1/resolve",
      headers: { authorization: "Bearer valid-token" },
      payload: { note: "Résolu" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("resolved");
  });
});

describe("POST /pilotage/alerts/evaluate", () => {
  it("evaluates alert rules for an event", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/pilotage/alerts/evaluate",
      headers: { authorization: "Bearer valid-token" },
      payload: { event_type: "FEE_OVERDUE_CHECK", student_id: "00000000-0000-0000-0000-000000000001" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([{ created: true, alertId: "alert-eval-1", title: "Règle déclenchée", severity: "important" }]);
  });
});
