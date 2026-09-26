import { describe, expect, it, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerRegistrationRoutes } from "../src/setup/registration-routes.js";
import type { RegistrationService } from "../src/setup/registration-service.js";
import type { RegistrationApprovalService } from "../src/setup/registration-approval-service.js";

function buildDeps(overrides: {
  registration?: Partial<RegistrationService>;
  approval?: Partial<RegistrationApprovalService>;
} = {}) {
  const registrationService = {
    prepareRegistration: overrides.registration?.prepareRegistration ?? vi.fn().mockResolvedValue({ request_id: "req-1", status: "pending" }),
  } as RegistrationService;
  const approvalService = {
    issueApproval: overrides.approval?.issueApproval ?? vi.fn().mockResolvedValue({ request_id: "req-1", status: "pending" }),
    review: overrides.approval?.review ?? vi.fn().mockResolvedValue({
      request_id: "req-1",
      school_name: "École Test",
      school_type: "Privée agréée",
      cycles: ["primary"],
      academic_year_label: "2026-2027",
      contact: { country: "CD", province: "Kinshasa", city: "Kinshasa", address: null, email: null, phone: null },
      admin: { first_name: "Admin", last_name: "Test", email: "admin@test.com", phone: null },
      status: "pending",
    }),
    decide: overrides.approval?.decide ?? vi.fn().mockResolvedValue({ request_id: "req-1", status: "approved" }),
  } as RegistrationApprovalService;
  return { registrationService, approvalService };
}

describe("registration routes", () => {
  it("POST /setup/registrations returns 202 and never exposes token", async () => {
    const deps = buildDeps();
    const app = Fastify();
    registerRegistrationRoutes(app, deps);
    const res = await app.inject({
      method: "POST",
      url: "/setup/registrations",
      payload: {
        identity: { name_fr: "École Test", school_type: "Privée agréée" },
        cycles: ["primary"],
        academic_year: { label: "2026-2027", starts_on: "2026-09-01", ends_on: "2027-07-31", periods: "Trimestres" },
        contact: { country: "CD", province: "Kinshasa", city: "Kinshasa", website_mode: "Créer un nouveau site SchoolSafe", public_news: "Après validation", public_gallery: "Après validation et consentement", public_honors: "Après validation" },
        brand: { primary_color: "#071a3d", accent_color: "#e9a515" },
        admin: { email: "admin@test.com", password: "SecretLongEnough1!", first_name: "Admin", last_name: "Test" },
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.request_id).toBe("req-1");
    expect(body.status).toBe("pending");
    expect(JSON.stringify(body)).not.toMatch(/[A-Za-z0-9_-]{43}/);
    expect(deps.approvalService.issueApproval).toHaveBeenCalledWith("req-1");
  });

  it("POST /setup/registrations/review returns 200 for valid token without secrets", async () => {
    const deps = buildDeps();
    const app = Fastify();
    registerRegistrationRoutes(app, deps);
    const res = await app.inject({
      method: "POST",
      url: "/setup/registrations/review",
      payload: { token: "valid-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.request_id).toBe("req-1");
    expect(body.school_name).toBe("École Test");
    expect(JSON.stringify(body)).not.toContain("password_hash");
    expect(JSON.stringify(body)).not.toContain("token_hash");
    expect(JSON.stringify(body)).not.toContain("SecretLongEnough");
  });

  it("POST /setup/registrations/decision approve returns approved status", async () => {
    const deps = buildDeps();
    const app = Fastify();
    registerRegistrationRoutes(app, deps);
    const res = await app.inject({
      method: "POST",
      url: "/setup/registrations/decision",
      payload: { token: "valid-token", decision: "approve" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("approved");
    expect(deps.approvalService.decide).toHaveBeenCalledWith("valid-token", "approve");
  });

  it("POST /setup/registrations/decision reject returns rejected status", async () => {
    const decideMock = vi.fn().mockResolvedValue({ request_id: "req-1", status: "rejected" });
    const deps = buildDeps({ approval: { decide: decideMock } });
    const app = Fastify();
    registerRegistrationRoutes(app, deps);
    const res = await app.inject({
      method: "POST",
      url: "/setup/registrations/decision",
      payload: { token: "valid-token", decision: "reject" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("rejected");
    expect(decideMock).toHaveBeenCalledWith("valid-token", "reject");
  });

  it("GET /setup/registrations/review does not exist (no mutation via GET)", async () => {
    const deps = buildDeps();
    const app = Fastify();
    registerRegistrationRoutes(app, deps);
    const res = await app.inject({ method: "GET", url: "/setup/registrations/review" });
    expect(res.statusCode).toBe(404);
    expect(deps.approvalService.review).not.toHaveBeenCalled();
  });

  it("GET /setup/registrations/decision does not exist (no mutation via GET)", async () => {
    const deps = buildDeps();
    const app = Fastify();
    registerRegistrationRoutes(app, deps);
    const res = await app.inject({ method: "GET", url: "/setup/registrations/decision" });
    expect(res.statusCode).toBe(404);
    expect(deps.approvalService.decide).not.toHaveBeenCalled();
  });

  it("invalid token returns generic ACCESS_DENIED error", async () => {
    const deps = buildDeps({
      approval: { review: vi.fn().mockRejectedValue(new Error("Invalid or expired approval token")) },
    });
    const app = Fastify();
    registerRegistrationRoutes(app, deps);
    const res = await app.inject({
      method: "POST",
      url: "/setup/registrations/review",
      payload: { token: "bad-token" },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe("ACCESS_DENIED");
    expect(body.message).not.toContain("approval_token_hash");
    expect(body.message).not.toContain("schoolsafe_auth");
  });
});