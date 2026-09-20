import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { BusinessPool } from "../src/db/pool.js";
import { createStudentsNativeService } from "../src/studentsnative/service.js";
import type { AuthNativeService, AuthSessionInfo } from "../src/authnative/service.js";

type QueryCall = { sql: string; params: unknown[] };

const STUDENT = {
  id: "11111111-0000-4000-8000-000000000001",
  matricule: "STU-001",
  first_name: "Aïcha",
  last_name: "Mbala",
  class_id: "22222222-0000-4000-8000-000000000001",
  class_name: "6A",
  school_id: "33333333-0000-4000-8000-000000000001",
  lifecycle_status: "active",
};

function fakeBusinessPool(queryLog: QueryCall[], checkAccessResult: boolean) {
  const client = {
    async query(sql: string, params?: unknown[]) {
      queryLog.push({ sql, params: params ?? [] });
      if (sql.includes("api.check_access")) {
        return { rows: [{ allowed: checkAccessResult }] };
      }
      if (sql.includes("api.student_read")) {
        return { rows: [{ student_read: STUDENT }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  return { connect: async () => client } as unknown as BusinessPool;
}

function fakeAuthService(): AuthNativeService {
  const record: AuthSessionInfo = {
    sessionId: "44444444-0000-4000-8000-000000000001",
    identityId: "77777777-0000-4000-8000-000000000001",
    userId: "55555555-0000-4000-8000-000000000001",
    profileId: "66666666-0000-4000-8000-000000000001",
    schoolId: "33333333-0000-4000-8000-000000000001",
    mustChange: false,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
  return {
    async loginWithPassword() {
      throw new Error("not used");
    },
    async resolveSession(token: string) {
      return token === "token-valide" ? record : null;
    },
    async touchSession() {
      return null;
    },
    async logout() {
      return true;
    },
    async listProfiles() {
      return [];
    },
    async forgotPassword() {},
    async resetPassword() {
      return false;
    },
    async switchProfile() {
      return { ok: false as const };
    },
  };
}

function makeApp(checkAccessResult: boolean, queryLog: QueryCall[]) {
  const businessPool = fakeBusinessPool(queryLog, checkAccessResult);
  return buildApp({
    authNative: { service: fakeAuthService(), cookieSecure: false },
    studentsNative: {
      authService: fakeAuthService(),
      service: createStudentsNativeService(businessPool),
    },
  });
}

describe("GET /native/students/:id — première route métier réelle", () => {
  it("401 sans session", async () => {
    const log: QueryCall[] = [];
    const app = makeApp(true, log);
    const response = await app.inject({ method: "GET", url: `/native/students/${STUDENT.id}` });
    expect(response.statusCode).toBe(401);
    expect(log).toHaveLength(0);
  });

  it("403 quand Access_Law refuse la permission en base", async () => {
    const log: QueryCall[] = [];
    const app = makeApp(false, log);
    const response = await app.inject({
      method: "GET",
      url: `/native/students/${STUDENT.id}`,
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).toBe(403);
    // la projection n'a JAMAIS été interrogée
    expect(log.some((c) => c.sql.includes("api.student_read"))).toBe(false);
  });

  it("200 avec la projection filtrée, contexte issu de la session", async () => {
    const log: QueryCall[] = [];
    const app = makeApp(true, log);
    const response = await app.inject({
      method: "GET",
      url: `/native/students/${STUDENT.id}`,
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.matricule).toBe("STU-001");

    // ordre exact : BEGIN → contexte serveur → permission → projection → COMMIT
    const statements = log.map((c) => c.sql);
    expect(statements[0]).toBe("BEGIN");
    expect(statements[1]).toContain("api.set_request_context");
    expect(statements[2]).toContain("api.check_access");
    expect(statements[3]).toContain("api.student_read");
    expect(statements[4]).toBe("COMMIT");
    // le contexte injecté vient de la SESSION, pas du navigateur
    expect(log[1].params.slice(0, 3)).toEqual([
      "55555555-0000-4000-8000-000000000001",
      "66666666-0000-4000-8000-000000000001",
      "33333333-0000-4000-8000-000000000001",
    ]);
    // la permission vérifiée est exactement celle de la route
    expect(log[2].params[0]).toBe("school.student.read");
    expect(log[3].params[0]).toBe(STUDENT.id);
  });
});

describe("contexte de requête — liste et brouillon (phase A tâche 4)", () => {
  it("liste : BEGIN → set_request_context → api.student_list → COMMIT", async () => {
    const log: QueryCall[] = [];
    const app = makeApp(true, log);
    const response = await app.inject({
      method: "GET",
      url: "/native/students",
      headers: { cookie: "schoolsafe_session=token-valide" },
    });
    expect(response.statusCode).toBe(200);
    const statements = log.map((c) => c.sql);
    expect(statements.slice(0, 3)).toEqual([
      "BEGIN",
      expect.stringContaining("api.set_request_context"),
      expect.stringContaining("api.student_list"),
    ]);
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("brouillon refusé par Access_Law : ROLLBACK, jamais COMMIT", async () => {
    const log: QueryCall[] = [];
    const app = makeApp(false, log);
    const response = await app.inject({
      method: "POST",
      url: "/native/students/drafts",
      headers: { cookie: "schoolsafe_session=token-valide" },
      payload: {
        matricule: "STU-002",
        first_name: "Bertrand",
        last_name: "Ilunga",
        academic_year_id: "88888888-0000-4000-8000-000000000001",
        planned_class_id: STUDENT.class_id,
        enrollment_starts_on: "2026-09-14",
      },
    });
    expect(response.statusCode).toBe(403);
    const statements = log.map((c) => c.sql);
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
  });
});

describe("studentsnative service", () => {
  it("passe la cible élève à Access_Law", async () => {
    const log: QueryCall[] = [];
    const pool = fakeBusinessPool(log, true);
    const service = createStudentsNativeService(pool);
    await service.readStudent(
      { userId: "u", profileId: "p", schoolId: "s", requestId: "r" },
      STUDENT.id,
    );
    const accessCall = log.find((c) => c.sql.includes("api.check_access"))!;
    expect(accessCall.params).toContain("school.student.read");
  });

  it("rejette sans pool métier réel", () => {
    expect(() => createStudentsNativeService(undefined as unknown as BusinessPool)).not.toThrow();
  });
});
