import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import type { BusinessPool } from "../src/db/pool.js";
import { withRequestContext, ContextInjectionError } from "../src/db/context.js";
import { withAuthorizedContext } from "../src/db/access.js";

type QueryCall = { sql: string; params: unknown[] };

function fakePool(queryLog: QueryCall[], checkAccessResult: boolean) {
  const client = {
    async query(sql: string, params?: unknown[]) {
      queryLog.push({ sql, params: params ?? [] });
      if (sql.includes("api.check_access")) {
        return { rows: [{ allowed: checkAccessResult }] };
      }
      return { rows: [] };
    },
    released: false,
    release() {
      this.released = true;
    },
  };
  const pool = {
    connect: async () => client,
  } as unknown as BusinessPool;
  return { pool, client: client as PoolClient & { released: boolean } };
}

const CTX = { userId: "u1", profileId: "p1", schoolId: "e1", requestId: "r1" };

describe("withRequestContext", () => {
  it("opens a transaction, injects the exact server-resolved context, commits", async () => {
    const log: QueryCall[] = [];
    const { pool, client } = fakePool(log, true);

    const result = await withRequestContext(pool, CTX, async () => "métier-ok");

    expect(result).toBe("métier-ok");
    expect(log.map((c) => c.sql)).toEqual([
      "BEGIN",
      "select api.set_request_context($1, $2, $3, $4)",
      "COMMIT",
    ]);
    expect(log[1].params).toEqual(["u1", "p1", "e1", "r1"]);
    expect(client.released).toBe(true);
  });

  it("rolls back and releases on business error", async () => {
    const log: QueryCall[] = [];
    const { pool, client } = fakePool(log, true);

    await expect(
      withRequestContext(pool, CTX, async () => {
        throw new Error("métier en échec");
      }),
    ).rejects.toThrow("métier en échec");

    expect(log.map((c) => c.sql).at(-1)).toBe("ROLLBACK");
    expect(client.released).toBe(true);
  });

  it("refuses an incomplete context before touching the database (fail-closed)", async () => {
    const log: QueryCall[] = [];
    const { pool } = fakePool(log, true);

    await expect(
      withRequestContext(pool, { ...CTX, schoolId: "" }, async () => "jamais"),
    ).rejects.toBeInstanceOf(ContextInjectionError);
    expect(log).toHaveLength(0);
  });

  it("rolls back when set_request_context itself rejects the identity", async () => {
    const log: QueryCall[] = [];
    const client = {
      async query(sql: string, params?: unknown[]) {
        log.push({ sql, params: params ?? [] });
        if (sql.includes("set_request_context")) {
          throw new Error("SchoolSafe request context does not match an active identity");
        }
        return { rows: [] };
      },
      released: false,
      release() {
        this.released = true;
      },
    };
    const pool = { connect: async () => client } as unknown as BusinessPool;

    await expect(withRequestContext(pool, CTX, async () => "jamais")).rejects.toThrow(
      "does not match an active identity",
    );
    expect(log.map((c) => c.sql)).toEqual([
      "BEGIN",
      "select api.set_request_context($1, $2, $3, $4)",
      "ROLLBACK",
    ]);
  });
});

describe("withAuthorizedContext (jonction Access_Law)", () => {
  it("executes only when the database grants the permission", async () => {
    const log: QueryCall[] = [];
    const { pool } = fakePool(log, true);

    const result = await withAuthorizedContext(pool, CTX, "finance.payment.record", {}, async () => "payé");
    expect(result).toBe("payé");

    const check = log.find((c) => c.sql.includes("api.check_access"));
    expect(check?.params[0]).toBe("finance.payment.record");
    expect(log.map((c) => c.sql).at(-1)).toBe("COMMIT");
  });

  it("denies with PERMISSION_DENIED and rolls back when the database refuses", async () => {
    const log: QueryCall[] = [];
    const { pool } = fakePool(log, false);

    let businessRan = false;
    await expect(
      withAuthorizedContext(pool, CTX, "finance.payment.record", {}, async () => {
        businessRan = true;
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "PERMISSION_DENIED" });

    expect(businessRan).toBe(false);
    expect(log.map((c) => c.sql).at(-1)).toBe("ROLLBACK");
  });

  it("passes the scope target to the database, never trusting the client context", async () => {
    const log: QueryCall[] = [];
    const { pool } = fakePool(log, true);

    await withAuthorizedContext(
      pool,
      CTX,
      "pedagogy.grade.manage",
      { classId: "classe-6A", subjectId: "maths" },
      async () => "ok",
    );

    const check = log.find((c) => c.sql.includes("api.check_access"));
    expect(check?.params).toEqual([
      "pedagogy.grade.manage",
      null,
      null,
      "classe-6A",
      "maths",
      null,
      "{}",
    ]);
  });
});
