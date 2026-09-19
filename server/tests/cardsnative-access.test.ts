import { describe, expect, it } from "vitest";
import type { BusinessPool } from "../src/db/pool.js";
import { createCardsNativeService } from "../src/cardsnative/service.js";
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
      if (sql.includes("api.card_print_request_list")) return { rows: [{ card_print_request_list: [] }] };
      if (sql.includes("api.card_print_request_create")) {
        return { rows: [{ card_print_request_create: { id: "cpr-1", version: 1, is_duplicate: false } }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  return { connect: async () => client } as unknown as BusinessPool;
}

function context(): RequestContext {
  return { ...SESSION, requestId: "req-1" };
}

describe("cardsnative — contexte de requête (phase A tâche 4)", () => {
  it("lecture card_print_request_list : BEGIN → ctx → api.* → COMMIT", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(fakePool(log));
    await service.listPrintRequests(context());
    expect(log.map((call) => call.sql)).toEqual([
      "BEGIN",
      expect.stringContaining("api.set_request_context"),
      expect.stringContaining("api.card_print_request_list"),
      "COMMIT",
    ]);
    expect(log[1].params.slice(0, 3)).toEqual([
      SESSION.userId,
      SESSION.profileId,
      SESSION.schoolId,
    ]);
  });

  it("écriture card_print_request_create : BEGIN → ctx → api.* → COMMIT", async () => {
    const log: QueryCall[] = [];
    const service = createCardsNativeService(fakePool(log));
    await service.createPrintRequest(context(), {
      student_id: "student-1",
      format: "carte",
    });
    expect(log.map((call) => call.sql)).toEqual([
      "BEGIN",
      expect.stringContaining("api.set_request_context"),
      expect.stringContaining("api.card_print_request_create"),
      "COMMIT",
    ]);
    expect(log[1].params.slice(0, 3)).toEqual([
      SESSION.userId,
      SESSION.profileId,
      SESSION.schoolId,
    ]);
  });
});
