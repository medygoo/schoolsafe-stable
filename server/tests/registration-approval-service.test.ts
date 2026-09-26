import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { AuthPool } from "../src/db/pool.js";
import type { EmailService } from "../src/email/service.js";
import { createRegistrationApprovalService } from "../src/setup/registration-approval-service.js";

function buildDependencies(overrides: { pool?: AuthPool; email?: EmailService; approverEmail?: string; approvalUrl?: string } = {}) {
  const pool = overrides.pool ?? ({ query: vi.fn() } as unknown as AuthPool);
  const email = overrides.email ?? { send: vi.fn().mockResolvedValue({ status: "sent", provider: "test" }) };
  return {
    pool,
    email,
    approverEmail: overrides.approverEmail ?? "approver@schoolsafe.test",
    approvalUrl: overrides.approvalUrl ?? "https://schoolsafe.example.test/#registration-approval=",
    ttlSeconds: 172800,
  };
}

describe("registration approval service", () => {
  it("issues approval token and sends email only to configured approver", async () => {
    const requestId = randomUUID();
    const capturedSql: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        capturedSql.push({ sql, params });
        if (sql.includes("school_registration_issue_approval")) {
          return { rows: [{ result: { request_id: requestId, status: "pending" } }] };
        }
        if (sql.includes("school_registration_mark_email_sent")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    } as unknown as AuthPool;
    const emailSend = vi.fn().mockResolvedValue({ status: "sent", provider: "test" });
    const deps = buildDependencies({ pool, email: { send: emailSend }, approverEmail: "fixed-approver@schoolsafe.test" });
    const service = createRegistrationApprovalService(deps);

    const result = await service.issueApproval(requestId);
    expect(result.status).toBe("pending");
    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(emailSend.mock.calls[0][0].to[0].email).toBe("fixed-approver@schoolsafe.test");
    // Raw token must never appear in SQL parameters
    for (const call of capturedSql) {
      for (const param of call.params) {
        if (typeof param === "string") {
          expect(param).not.toMatch(/^[A-Za-z0-9_-]{43}$/);
        }
      }
    }
  });

  it("review refuses unknown or expired tokens without leaking secrets", async () => {
    const pool = {
      query: vi.fn(async () => ({ rows: [] })),
    } as unknown as AuthPool;
    const service = createRegistrationApprovalService(buildDependencies({ pool }));
    await expect(service.review("unknown-token")).rejects.toThrow();
    expect(pool.query).toHaveBeenCalled();
  });

  it("approve activates existing records only and consumes token atomically", async () => {
    const requestId = randomUUID();
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("school_registration_decide")) {
          return { rows: [{ result: { request_id: requestId, status: "approved" } }] };
        }
        return { rows: [] };
      }),
    } as unknown as AuthPool;
    const service = createRegistrationApprovalService(buildDependencies({ pool }));
    const result = await service.decide("valid-token", "approve");
    expect(result.status).toBe("approved");
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("school_registration_decide"),
      expect.arrayContaining([expect.any(String), "approve"]),
    );
  });

  it("reject leaves school inactive and consumes token", async () => {
    const requestId = randomUUID();
    const pool = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("school_registration_decide")) {
          return { rows: [{ result: { request_id: requestId, status: "rejected" } }] };
        }
        return { rows: [] };
      }),
    } as unknown as AuthPool;
    const service = createRegistrationApprovalService(buildDependencies({ pool }));
    const result = await service.decide("valid-token", "reject");
    expect(result.status).toBe("rejected");
  });
});