import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import type { AccessService } from "../src/access/service.js";
import type { SchoolService } from "../src/school/service.js";

function accessService(mock: { permission?: boolean; scope?: boolean } = {}): AccessService {
  return {
    hasPermission: vi.fn().mockResolvedValue(mock.permission ?? true),
    hasScope: vi.fn().mockResolvedValue(mock.scope ?? true),
  };
}

function buildMultipartBody(
  boundary: string,
  fields: Array<{ name: string; filename?: string; contentType?: string; value: Buffer | string }>,
): Buffer {
  const chunks: Buffer[] = [];
  for (const field of fields) {
    let header = `--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"`;
    if (field.filename) header += `; filename="${field.filename}"`;
    if (field.contentType) header += `\r\nContent-Type: ${field.contentType}`;
    header += "\r\n\r\n";
    chunks.push(Buffer.from(header, "utf-8"));
    chunks.push(Buffer.isBuffer(field.value) ? field.value : Buffer.from(field.value, "utf-8"));
    chunks.push(Buffer.from("\r\n", "utf-8"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf-8"));
  return Buffer.concat(chunks);
}

type AuditEvent = {
  event_type: string;
  school_id: string;
  actor_profile_id: string;
  payload: unknown;
};

type MockSchoolService = SchoolService & { auditEvents: AuditEvent[] };

function createMockService(): MockSchoolService {
  const auditEvents: AuditEvent[] = [];
  return {
    getSettings: vi.fn().mockResolvedValue({
      identity: { name: "École Test", name_en: null, legal_name: null, school_type: "Privée", approval_code: "TEST-001" },
      brand: { primary_color: "#071a3d", accent_color: "#e9a515", document_footer: null, logo_path: null },
      contact: {
        country: "RDC", province: "Kinshasa", city: "Kinshasa", address: null,
        email: "contact@ecole.cd", phone: null, website_url: null, website_mode: "Créer un nouveau site SchoolSafe",
        public_news: "Après validation", public_gallery: "Après validation", public_honors: "Après validation",
      },
    }),
    updateSettings: vi.fn().mockResolvedValue({
      identity: { name: "École Test Mise à jour", name_en: null, legal_name: null, school_type: "Privée", approval_code: "TEST-001" },
      brand: { primary_color: "#071a3d", accent_color: "#e9a515", document_footer: null, logo_path: null },
      contact: {
        country: "RDC", province: "Kinshasa", city: "Kinshasa", address: null,
        email: "contact@ecole.cd", phone: null, website_url: null, website_mode: "Créer un nouveau site SchoolSafe",
        public_news: "Après validation", public_gallery: "Après validation", public_honors: "Après validation",
      },
    }),
    listStaff: vi.fn().mockResolvedValue([
      {
        id: "profile-1",
        first_name: "Jean",
        last_name: "Admin",
        display_name: "Jean Admin",
        email: "admin@ecole.cd",
        phone: null,
        is_active: true,
        auth_user_id: "auth-user-1",
        school_id: "school-1",
        roles: [{ id: "20000000-0000-0000-0000-000000000001", code: "admin", label: "Administrateur" }],
      },
    ]),
    getStaffDetail: vi.fn().mockResolvedValue({
      id: "profile-1",
      first_name: "Jean",
      last_name: "Admin",
      display_name: "Jean Admin",
      email: "admin@ecole.cd",
      phone: null,
      is_active: true,
      auth_user_id: "auth-user-1",
      school_id: "school-1",
      roles: [{ id: "20000000-0000-0000-0000-000000000001", code: "admin", label: "Administrateur" }],
      scopes: [],
    }),
    auditEvents,
    inviteStaff: vi.fn(async (schoolId, actorProfileId, payload) => {
      auditEvents.push({
        event_type: "staff.invited",
        school_id: schoolId,
        actor_profile_id: actorProfileId,
        payload,
      });
      return { profile_id: "profile-2", user_id: "user-2" };
    }),
    resendStaffInvite: vi.fn().mockResolvedValue(undefined),
    updateStaffRoles: vi.fn(async (profileId, schoolId, actorProfileId, payload) => {
      auditEvents.push({
        event_type: "staff.roles_changed",
        school_id: schoolId,
        actor_profile_id: actorProfileId,
        payload: { profile_id: profileId, ...payload },
      });
    }),
    toggleStaffActive: vi.fn(async (profileId, schoolId, actorProfileId, payload) => {
      auditEvents.push({
        event_type: "staff.toggled",
        school_id: schoolId,
        actor_profile_id: actorProfileId,
        payload: { profile_id: profileId, ...payload },
      });
    }),
    listRoles: vi.fn().mockResolvedValue([
      { id: "20000000-0000-0000-0000-000000000001", code: "admin", label: "Administrateur" },
      { id: "20000000-0000-0000-0000-000000000002", code: "teacher", label: "Enseignant" },
    ]),
    listPermissions: vi.fn().mockResolvedValue([
      { id: "perm-1", code: "school.manage", description: "Gérer l'école" },
      { id: "perm-2", code: "staff.manage", description: "Gérer le personnel" },
    ]),
    listAcademicYears: vi.fn().mockResolvedValue([
      { id: "year-1", label: "2025-2026", starts_on: "2025-09-01", ends_on: "2026-06-30", periods: "Trimestres", is_active: true },
    ]),
    createAcademicYear: vi.fn().mockResolvedValue({ id: "year-2" }),
    updateAcademicYear: vi.fn().mockResolvedValue(undefined),
    activateAcademicYear: vi.fn().mockResolvedValue(undefined),
    listCycles: vi.fn().mockResolvedValue([
      { cycle_key: "nursery", cycle_name: "Maternelle", is_active: true },
      { cycle_key: "primary", cycle_name: "Primaire", is_active: true },
      { cycle_key: "secondary", cycle_name: "Secondaire", is_active: false },
    ]),
    toggleCycle: vi.fn().mockResolvedValue(undefined),
    saveLogoPath: vi.fn().mockResolvedValue(undefined),
    listStudentsByClass: vi.fn().mockResolvedValue([
      { id: "student-1", matricule: "MAT001", first_name: "Alice", last_name: "Mukendi", photo_path: null },
    ]),
  } as MockSchoolService;
}

function buildTestApp(service: SchoolService, access: AccessService, logoUploadDir?: string) {
  return buildApp({
    school: {
      service,
      resolveProfileAndSchool: vi.fn().mockResolvedValue({ profileId: "profile-1", schoolId: "school-1" }),
      access,
      logoUploadDir,
    },
    access,
  });
}

describe("School & Staff routes", () => {
  it("GET /school/settings returns school settings", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "GET",
      url: "/school/settings",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ identity: { name: "École Test" } });
    await app.close();
  });

  it("PUT /school/settings updates school settings", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "PUT",
      url: "/school/settings",
      headers: { authorization: "Bearer valid-token" },
      payload: { identity: { name: "École Test Mise à jour" } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ identity: { name: "École Test Mise à jour" } });
    await app.close();
  });

  it("GET /school/staff returns staff list", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "GET",
      url: "/school/staff",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    await app.close();
  });

  it("POST /school/staff/invite creates a staff member", async () => {
    const service = createMockService();
    const app = buildTestApp(service, accessService());
    const response = await app.inject({
      method: "POST",
      url: "/school/staff/invite",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        email: "teacher@ecole.cd",
        first_name: "Marie",
        last_name: "Enseignante",
        role_ids: ["20000000-0000-0000-0000-000000000002"],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ profile_id: "profile-2" });
    expect(service.inviteStaff).toHaveBeenCalledWith("school-1", "profile-1", {
      email: "teacher@ecole.cd",
      first_name: "Marie",
      last_name: "Enseignante",
      role_ids: ["20000000-0000-0000-0000-000000000002"],
    });
    await app.close();
  });

  it("GET /school/staff/:id returns staff detail", async () => {
    const service = createMockService();
    const app = buildTestApp(service, accessService());
    const response = await app.inject({
      method: "GET",
      url: "/school/staff/profile-1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: "profile-1", email: "admin@ecole.cd", scopes: [] });
    expect(service.getStaffDetail).toHaveBeenCalledWith("profile-1", "school-1");
    await app.close();
  });

  it("POST /school/staff/:id/resend-invite resends invite", async () => {
    const service = createMockService();
    const app = buildTestApp(service, accessService());
    const response = await app.inject({
      method: "POST",
      url: "/school/staff/profile-1/resend-invite",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(service.resendStaffInvite).toHaveBeenCalledWith("profile-1", "school-1");
    await app.close();
  });

  it("GET /school/staff/:id rejects cross-school access", async () => {
    const service = createMockService();
    service.getStaffDetail = vi.fn().mockRejectedValue(new Error("Staff member does not belong to this school"));
    const app = buildTestApp(service, accessService());
    const response = await app.inject({
      method: "GET",
      url: "/school/staff/profile-2",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(500);
    await app.close();
  });

  it("PUT /school/staff/:id/roles updates roles", async () => {
    const service = createMockService();
    const app = buildTestApp(service, accessService());
    const response = await app.inject({
      method: "PUT",
      url: "/school/staff/profile-1/roles",
      headers: { authorization: "Bearer valid-token" },
      payload: { role_ids: ["20000000-0000-0000-0000-000000000001", "20000000-0000-0000-0000-000000000002"] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(service.updateStaffRoles).toHaveBeenCalledWith(
      "profile-1",
      "school-1",
      "profile-1",
      { role_ids: ["20000000-0000-0000-0000-000000000001", "20000000-0000-0000-0000-000000000002"] },
    );
    await app.close();
  });

  it("POST /school/staff/:id/toggle toggles active state", async () => {
    const service = createMockService();
    const app = buildTestApp(service, accessService());
    const response = await app.inject({
      method: "POST",
      url: "/school/staff/profile-1/toggle",
      headers: { authorization: "Bearer valid-token" },
      payload: { is_active: false },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(service.toggleStaffActive).toHaveBeenCalledWith("profile-1", "school-1", "profile-1", { is_active: false });
    await app.close();
  });

  it("GET /school/roles returns roles", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "GET",
      url: "/school/roles",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
    await app.close();
  });

  it("GET /school/permissions returns permissions", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "GET",
      url: "/school/permissions",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
    await app.close();
  });

  it("rejects requests without permission", async () => {
    const app = buildTestApp(createMockService(), accessService({ permission: false }));
    const response = await app.inject({
      method: "GET",
      url: "/school/staff",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "ACCESS_DENIED" });
    await app.close();
  });

  it("GET /school/academic-years returns academic years", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "GET",
      url: "/school/academic-years",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    await app.close();
  });

  it("POST /school/academic-years creates an academic year", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "POST",
      url: "/school/academic-years",
      headers: { authorization: "Bearer valid-token" },
      payload: { label: "2026-2027", starts_on: "2026-09-01", ends_on: "2027-06-30", periods: "Trimestres" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ id: "year-2" });
    await app.close();
  });

  it("PUT /school/academic-years/:id updates an academic year", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "PUT",
      url: "/school/academic-years/year-1",
      headers: { authorization: "Bearer valid-token" },
      payload: { label: "2025-2026 (updated)" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("POST /school/academic-years/:id/activate activates an academic year", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "POST",
      url: "/school/academic-years/year-1/activate",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("GET /school/cycles returns cycles", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "GET",
      url: "/school/cycles",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(3);
    await app.close();
  });

  it("PUT /school/cycles/:key/toggle toggles a cycle", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "PUT",
      url: "/school/cycles/secondary/toggle",
      headers: { authorization: "Bearer valid-token" },
      payload: { is_active: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("POST /school/logo rejects invalid file type", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const boundary = "----formdata-test";
    const body = buildMultipartBody(boundary, [
      { name: "logo", filename: "file.txt", contentType: "text/plain", value: "not an image" },
    ]);
    const response = await app.inject({
      method: "POST",
      url: "/school/logo",
      headers: {
        authorization: "Bearer valid-token",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "FILE_INVALID" });
    await app.close();
  });

  it("POST /school/logo uploads a logo", async () => {
    const service = createMockService();
    const logoUploadDir = mkdtempSync(path.join(tmpdir(), "schoolsafe-logo-test-"));
    const app = buildTestApp(service, accessService(), logoUploadDir);
    const boundary = "----formdata-test";
    const body = buildMultipartBody(boundary, [
      { name: "logo", filename: "logo.png", contentType: "image/png", value: Buffer.from("fake-png-bytes") },
    ]);
    try {
      const response = await app.inject({
        method: "POST",
        url: "/school/logo",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.logo_path).toMatch(/^\/uploads\/logos\/.+\.png$/);
      expect(service.saveLogoPath).toHaveBeenCalledWith("school-1", json.logo_path);
      expect(readdirSync(logoUploadDir)).toHaveLength(1);
    } finally {
      await app.close();
      rmSync(logoUploadDir, { recursive: true, force: true });
    }
  });

  it("POST /school/logo removes the file when persistence fails", async () => {
    const service = createMockService();
    vi.mocked(service.saveLogoPath).mockRejectedValueOnce(new Error("database unavailable"));
    const logoUploadDir = mkdtempSync(path.join(tmpdir(), "schoolsafe-logo-test-"));
    const app = buildTestApp(service, accessService(), logoUploadDir);
    const boundary = "----formdata-test";
    const body = buildMultipartBody(boundary, [
      { name: "logo", filename: "logo.png", contentType: "image/png", value: Buffer.from("fake-png-bytes") },
    ]);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/school/logo",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(response.statusCode).toBe(500);
      expect(readdirSync(logoUploadDir)).toEqual([]);
    } finally {
      await app.close();
      rmSync(logoUploadDir, { recursive: true, force: true });
    }
  });

  it("POST /school/staff/invite records staff.invited audit event", async () => {
    const service = createMockService();
    const app = buildTestApp(service, accessService());
    const response = await app.inject({
      method: "POST",
      url: "/school/staff/invite",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        email: "teacher@ecole.cd",
        first_name: "Marie",
        last_name: "Enseignante",
        role_ids: ["20000000-0000-0000-0000-000000000002"],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(service.auditEvents).toHaveLength(1);
    expect(service.auditEvents[0]).toMatchObject({
      event_type: "staff.invited",
      school_id: "school-1",
      actor_profile_id: "profile-1",
    });
    await app.close();
  });

  it("PUT /school/staff/:id/roles records staff.roles_changed audit event", async () => {
    const service = createMockService();
    const app = buildTestApp(service, accessService());
    const response = await app.inject({
      method: "PUT",
      url: "/school/staff/profile-1/roles",
      headers: { authorization: "Bearer valid-token" },
      payload: { role_ids: ["20000000-0000-0000-0000-000000000001"] },
    });
    expect(response.statusCode).toBe(200);
    expect(service.auditEvents).toHaveLength(1);
    expect(service.auditEvents[0]).toMatchObject({
      event_type: "staff.roles_changed",
      school_id: "school-1",
      actor_profile_id: "profile-1",
    });
    await app.close();
  });

  it("POST /school/staff/:id/toggle records staff.toggled audit event", async () => {
    const service = createMockService();
    const app = buildTestApp(service, accessService());
    const response = await app.inject({
      method: "POST",
      url: "/school/staff/profile-1/toggle",
      headers: { authorization: "Bearer valid-token" },
      payload: { is_active: false },
    });
    expect(response.statusCode).toBe(200);
    expect(service.auditEvents).toHaveLength(1);
    expect(service.auditEvents[0]).toMatchObject({
      event_type: "staff.toggled",
      school_id: "school-1",
      actor_profile_id: "profile-1",
    });
    await app.close();
  });

  it("GET /school/academic-years rejects without school.manage permission", async () => {
    const app = buildTestApp(createMockService(), accessService({ permission: false }));
    const response = await app.inject({
      method: "GET",
      url: "/school/academic-years",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "ACCESS_DENIED" });
    await app.close();
  });

  it("GET /school/cycles rejects without school.manage permission", async () => {
    const app = buildTestApp(createMockService(), accessService({ permission: false }));
    const response = await app.inject({
      method: "GET",
      url: "/school/cycles",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "ACCESS_DENIED" });
    await app.close();
  });

  it("GET /school/staff/:id rejects without staff.manage permission", async () => {
    const app = buildTestApp(createMockService(), accessService({ permission: false }));
    const response = await app.inject({
      method: "GET",
      url: "/school/staff/profile-1",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "ACCESS_DENIED" });
    await app.close();
  });

  it("POST /school/academic-years rejects missing periods", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "POST",
      url: "/school/academic-years",
      headers: { authorization: "Bearer valid-token" },
      payload: { label: "2026-2027", starts_on: "2026-09-01", ends_on: "2027-06-30" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "VALIDATION_INVALID" });
    await app.close();
  });

  it("POST /school/academic-years rejects invalid payload", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "POST",
      url: "/school/academic-years",
      headers: { authorization: "Bearer valid-token" },
      payload: { label: "", starts_on: "not-a-date", ends_on: "2027-06-30", periods: "Invalid" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "VALIDATION_INVALID" });
    await app.close();
  });

  it("POST /school/staff/invite rejects invalid payload", async () => {
    const app = buildTestApp(createMockService(), accessService());
    const response = await app.inject({
      method: "POST",
      url: "/school/staff/invite",
      headers: { authorization: "Bearer valid-token" },
      payload: { email: "not-an-email", first_name: "", last_name: "Doe", role_ids: [] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "VALIDATION_INVALID" });
    await app.close();
  });

  it("GET /school/classes/:id/students returns students", async () => {
    const service = createMockService();
    const app = buildTestApp(service, accessService());
    const response = await app.inject({
      method: "GET",
      url: "/school/classes/class-1/students",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(service.listStudentsByClass).toHaveBeenCalledWith("school-1", "class-1");
    await app.close();
  });
});
