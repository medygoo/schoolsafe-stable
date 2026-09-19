import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { AccessService } from "../src/access/service.js";

const SCHOOL_ID = "10000000-0000-0000-0000-000000000001";
const PROFILE_ID = "50000000-0000-0000-0000-000000000001";
const STUDENT_ID = "60000000-0000-0000-0000-000000000001";
const PARENT_ID = "50000000-0000-0000-0000-000000000002";
const YEAR_ID = "70000000-0000-0000-0000-000000000001";
const CLASS_ID = "80000000-0000-0000-0000-000000000001";

function accessService(allowed = true): AccessService {
  return {
    hasPermission: vi.fn().mockResolvedValue(allowed),
    hasScope: vi.fn().mockResolvedValue(allowed),
  };
}

function existingParentPayload() {
  return {
    matricule: "B1-001",
    first_name: "Amina",
    middle_name: "Grâce",
    last_name: "Mbuyi",
    date_of_birth: "2015-04-03",
    gender: "F",
    academic_year_id: YEAR_ID,
    planned_class_id: CLASS_ID,
    enrollment_starts_on: "2026-09-01",
    primary_parent: {
      mode: "existing",
      profile_id: PARENT_ID,
      guardian_type: "mere",
    },
  };
}

function invitedParentPayload() {
  return {
    ...existingParentPayload(),
    matricule: "B1-002",
    primary_parent: {
      mode: "invite",
      email: "parent.b1@example.test",
      first_name: "Sarah",
      last_name: "Mbuyi",
      phone: "+243810000000",
      guardian_type: "mere",
    },
  };
}

function createStudentsService() {
  return {
    createDraft: vi.fn().mockResolvedValue({
      id: STUDENT_ID,
      lifecycle_status: "draft",
      class_id: null,
      enrollment_status: "draft",
      parent: { id: PARENT_ID, account_status: "active" },
    }),
    listStudents: vi.fn().mockResolvedValue([
      {
        id: STUDENT_ID,
        matricule: "B1-001",
        first_name: "Amina",
        last_name: "Mbuyi",
        lifecycle_status: "draft",
        class_id: null,
      },
    ]),
    getStudent: vi.fn().mockResolvedValue({
      id: STUDENT_ID,
      matricule: "B1-001",
      first_name: "Amina",
      last_name: "Mbuyi",
      lifecycle_status: "draft",
      class_id: null,
      enrollment: { status: "draft", planned_class_id: CLASS_ID },
      primary_parent: { id: PARENT_ID, account_status: "active" },
    }),
    listParents: vi.fn().mockResolvedValue([
      { id: PARENT_ID, display_name: "Sarah Mbuyi", account_status: "active" },
    ]),
  };
}

function buildStudentsApp(service = createStudentsService(), access = accessService()) {
  return buildApp({
    students: {
      service,
      access,
      resolveProfileAndSchool: vi.fn().mockResolvedValue({ profileId: PROFILE_ID, schoolId: SCHOOL_ID }),
    },
  } as never);
}

describe("B1 student draft routes", () => {
  it("creates a draft with an existing parent", async () => {
    const service = createStudentsService();
    const app = buildStudentsApp(service);
    const payload = existingParentPayload();

    const response = await app.inject({
      method: "POST",
      url: "/school/students/drafts",
      headers: { authorization: "Bearer valid-token" },
      payload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ lifecycle_status: "draft", class_id: null, enrollment_status: "draft" });
    expect(service.createDraft).toHaveBeenCalledWith(SCHOOL_ID, PROFILE_ID, payload);
    await app.close();
  });

  it("creates a draft with an invited parent in pending_activation", async () => {
    const service = createStudentsService();
    service.createDraft.mockResolvedValueOnce({
      id: STUDENT_ID,
      lifecycle_status: "draft",
      class_id: null,
      enrollment_status: "draft",
      parent: { id: PARENT_ID, account_status: "pending_activation" },
    });
    const app = buildStudentsApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/school/students/drafts",
      headers: { authorization: "Bearer valid-token" },
      payload: invitedParentPayload(),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      lifecycle_status: "draft",
      class_id: null,
      parent: { account_status: "pending_activation" },
    });
    await app.close();
  });

  it("rejects every password field", async () => {
    const service = createStudentsService();
    const app = buildStudentsApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/school/students/drafts",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        ...invitedParentPayload(),
        primary_parent: { ...invitedParentPayload().primary_parent, password: "SchoolMustNeverKnowThis" },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(service.createDraft).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a forced active lifecycle", async () => {
    const service = createStudentsService();
    const app = buildStudentsApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/school/students/drafts",
      headers: { authorization: "Bearer valid-token" },
      payload: { ...existingParentPayload(), lifecycle_status: "active" },
    });

    expect(response.statusCode).toBe(400);
    expect(service.createDraft).not.toHaveBeenCalled();
    await app.close();
  });

  it("refuses creation without school.student.create", async () => {
    const service = createStudentsService();
    const access = accessService(false);
    const app = buildStudentsApp(service, access);

    const response = await app.inject({
      method: "POST",
      url: "/school/students/drafts",
      headers: { authorization: "Bearer valid-token" },
      payload: existingParentPayload(),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "ACCESS_DENIED" });
    expect(access.hasPermission).toHaveBeenCalledWith("valid-token", "school.student.create");
    expect(service.createDraft).not.toHaveBeenCalled();
    await app.close();
  });

  it("lists students by explicit lifecycle status and search query", async () => {
    const service = createStudentsService();
    const app = buildStudentsApp(service);

    const response = await app.inject({
      method: "GET",
      url: "/school/students?status=draft&query=Amina",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(service.listStudents).toHaveBeenCalledWith("valid-token", SCHOOL_ID, { status: "draft", query: "Amina" });
    expect(response.json()).toHaveLength(1);
    await app.close();
  });

  it("returns a read-only student detail", async () => {
    const service = createStudentsService();
    const app = buildStudentsApp(service);

    const response = await app.inject({
      method: "GET",
      url: `/school/students/${STUDENT_ID}`,
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(service.getStudent).toHaveBeenCalledWith("valid-token", SCHOOL_ID, STUDENT_ID);
    expect(response.json()).toMatchObject({ lifecycle_status: "draft", class_id: null });
    await app.close();
  });

  it("searches same-school parents for the draft workflow", async () => {
    const service = createStudentsService();
    const app = buildStudentsApp(service);

    const response = await app.inject({
      method: "GET",
      url: "/school/parents?query=Sarah",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(service.listParents).toHaveBeenCalledWith("valid-token", SCHOOL_ID, "Sarah");
    await app.close();
  });

  it("does not expose an activation route", async () => {
    const app = buildStudentsApp();
    const response = await app.inject({
      method: "POST",
      url: `/school/students/${STUDENT_ID}/activate`,
      headers: { authorization: "Bearer valid-token" },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
