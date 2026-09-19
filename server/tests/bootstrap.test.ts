import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AuthVerifier } from "../src/auth/session.js";
import {
  registerBootstrapRoutes,
  type BootstrapService,
} from "../src/bootstrap/routes.js";

const teacherBootstrap = {
  contract_version: "1" as const,
  profile: { id: "profile-teacher", display_name: "Teacher Test" },
  roles: ["teacher"],
  permissions: ["school.student.read"],
  scopes: [{ type: "school", id: "school-1", label: "Test school" }],
  school: { id: "school-1", name: "Test school" },
  academic_year: null,
  features: [],
  offline_policy: { max_offline_hours: 24 },
};

function verifier(result: { userId: string; email?: string } | null): AuthVerifier {
  return { verify: vi.fn().mockResolvedValue(result) };
}

describe("POST /session/bootstrap", () => {
  it("ignores a forged role from the request body", async () => {
    const app = Fastify();
    const service: BootstrapService = {
      load: vi.fn().mockResolvedValue(teacherBootstrap),
    };
    registerBootstrapRoutes(app, {
      authVerifier: verifier({ userId: "auth-teacher" }),
      service,
    });

    const response = await app.inject({
      method: "POST",
      url: "/session/bootstrap",
      headers: { authorization: "Bearer signed-token" },
      payload: { role: "admin", profileId: "forged-profile" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().roles).toEqual(["teacher"]);
    expect(response.json().roles).not.toContain("admin");
    expect(service.load).toHaveBeenCalledWith("signed-token");
    await app.close();
  });

  it("returns controlled access error when no application profile exists", async () => {
    const app = Fastify();
    registerBootstrapRoutes(app, {
      authVerifier: verifier({ userId: "auth-without-profile" }),
      service: { load: vi.fn().mockResolvedValue(null) },
    });

    const response = await app.inject({
      method: "POST",
      url: "/session/bootstrap",
      headers: { authorization: "Bearer signed-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "PERMISSION_DENIED", retryable: false });
    expect(JSON.stringify(response.json())).not.toContain("signed-token");
    await app.close();
  });

  it("returns AUTH_REQUIRED for an invalid bearer token", async () => {
    const app = Fastify();
    registerBootstrapRoutes(app, {
      authVerifier: verifier(null),
      service: { load: vi.fn() },
    });

    const response = await app.inject({
      method: "POST",
      url: "/session/bootstrap",
      headers: { authorization: "Bearer expired-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTH_REQUIRED", retryable: false });
    expect(JSON.stringify(response.json())).not.toContain("expired-token");
    await app.close();
  });

  it("returns all roles, effective permissions and scopes for a multi-role user", async () => {
    const multiRoleBootstrap = {
      contract_version: "1" as const,
      profile: { id: "profile-multi", display_name: "Multi Role Test" },
      roles: ["parent", "teacher"],
      permissions: ["school.student.read", "pedagogy.grade.read"],
      scopes: [
        { type: "school", id: "school-1", label: "Test school" },
        { type: "parent_of", id: "student-1", label: "Lucas Martin" },
      ],
      school: { id: "school-1", name: "Test school" },
      academic_year: null,
      features: [],
      offline_policy: { max_offline_hours: 24 },
    };

    const app = Fastify();
    registerBootstrapRoutes(app, {
      authVerifier: verifier({ userId: "auth-multi-role" }),
      service: { load: vi.fn().mockResolvedValue(multiRoleBootstrap) },
    });

    const response = await app.inject({
      method: "POST",
      url: "/session/bootstrap",
      headers: { authorization: "Bearer signed-token" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.roles).toEqual(["parent", "teacher"]);
    expect(body.permissions).toContain("school.student.read");
    expect(body.permissions).toContain("pedagogy.grade.read");
    expect(body.scopes).toHaveLength(2);
    await app.close();
  });
});
