import { describe, expect, it } from "vitest";
import type { BusinessPool } from "../src/db/pool.js";
import { createPedagogyNativeService } from "../src/pedagogynative/service.js";
import type { RequestContext } from "../src/db/context.js";

type QueryCall = { sql: string; params: unknown[] };

const SESSION = {
  userId: "55555555-0000-4000-8000-000000000001",
  profileId: "66666666-0000-4000-8000-000000000001",
  schoolId: "33333333-0000-4000-8000-000000000001",
};

function fakePool(log: QueryCall[]): BusinessPool {
  const client = {
    async query(sql: string, params?: unknown[]) {
      log.push({ sql, params: params ?? [] });
      if (sql.includes("api.assignment_list")) return { rows: [{ assignment_list: [] }] };
      if (sql.includes("api.grades_save")) return { rows: [{ grades_save: true }] };
      return { rows: [] };
    },
    release() {},
  };
  return { connect: async () => client } as unknown as BusinessPool;
}

function context(): RequestContext {
  return { ...SESSION, requestId: "req-1" };
}

describe("pedagogynative — contexte de requête (phase A tâche 4)", () => {
  it("lecture assignment_list : BEGIN → ctx → api.* → COMMIT", async () => {
    const log: QueryCall[] = [];
    const service = createPedagogyNativeService(fakePool(log));
    await service.listAssignments(context());
    expect(log.map((call) => call.sql)).toEqual([
      "BEGIN",
      expect.stringContaining("api.set_request_context"),
      expect.stringContaining("api.assignment_list"),
      "COMMIT",
    ]);
    expect(log[1].params.slice(0, 3)).toEqual([
      SESSION.userId,
      SESSION.profileId,
      SESSION.schoolId,
    ]);
  });

  it("écriture grades_save : BEGIN → ctx → api.* → COMMIT", async () => {
    const log: QueryCall[] = [];
    const service = createPedagogyNativeService(fakePool(log));
    await service.saveGrades(context(), "assignment-1", [
      { student_id: "student-1", score: 15 },
    ]);
    expect(log.map((call) => call.sql)).toEqual([
      "BEGIN",
      expect.stringContaining("api.set_request_context"),
      expect.stringContaining("api.grades_save"),
      "COMMIT",
    ]);
    expect(log[1].params.slice(0, 3)).toEqual([
      SESSION.userId,
      SESSION.profileId,
      SESSION.schoolId,
    ]);
  });
});
