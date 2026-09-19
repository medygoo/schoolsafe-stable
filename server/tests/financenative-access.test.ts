import { describe, expect, it } from "vitest";
import type { BusinessPool } from "../src/db/pool.js";
import { createFinanceNativeService } from "../src/financenative/service.js";
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
      if (sql.includes("api.fee_structure_list")) return { rows: [{ fee_structure_list: [] }] };
      if (sql.includes("api.payment_create")) return { rows: [{ payment_create: "pay-1" }] };
      return { rows: [] };
    },
    release() {},
  };
  return { connect: async () => client } as unknown as BusinessPool;
}

function context(): RequestContext {
  return { ...SESSION, requestId: "req-1" };
}

describe("financenative — contexte de requête (phase A tâche 4)", () => {
  it("lecture fee_structure_list : BEGIN → ctx → api.* → COMMIT", async () => {
    const log: QueryCall[] = [];
    const service = createFinanceNativeService(fakePool(log));
    await service.listFeeStructures(context());
    expect(log.map((call) => call.sql)).toEqual([
      "BEGIN",
      expect.stringContaining("api.set_request_context"),
      expect.stringContaining("api.fee_structure_list"),
      "COMMIT",
    ]);
    expect(log[1].params.slice(0, 3)).toEqual([
      SESSION.userId,
      SESSION.profileId,
      SESSION.schoolId,
    ]);
  });

  it("écriture payment_create : BEGIN → ctx → api.* → COMMIT", async () => {
    const log: QueryCall[] = [];
    const service = createFinanceNativeService(fakePool(log));
    await service.createPayment(context(), "fee-1", 100, "USD", SESSION.profileId, "cash");
    expect(log.map((call) => call.sql)).toEqual([
      "BEGIN",
      expect.stringContaining("api.set_request_context"),
      expect.stringContaining("api.payment_create"),
      "COMMIT",
    ]);
    expect(log[1].params.slice(0, 3)).toEqual([
      SESSION.userId,
      SESSION.profileId,
      SESSION.schoolId,
    ]);
  });
});
