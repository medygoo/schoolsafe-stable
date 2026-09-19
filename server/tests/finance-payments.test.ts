import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createFinancePaymentService } from "../src/finance/payments/service.js";
import type { FinancePaymentService } from "../src/finance/payments/service.js";
import type { AccessService } from "../src/access/service.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockService: FinancePaymentService = {
  async getStudentFeeWithPayments(schoolId, studentFeeId) {
    return {
      id: studentFeeId,
      school_id: schoolId,
      status: "partial",
      amount_expected: 300,
      amount_paid: 100,
      amount_remaining: 200,
      payments: [
        { id: "pay-1", amount: 100, status: "valid" },
      ],
    };
  },
  async recordPayment(schoolId, profileId, input) {
    return {
      payment: {
        id: "pay-new",
        school_id: schoolId,
        student_fee_id: input.student_fee_id,
        amount: input.amount,
        currency: input.currency,
        received_by: profileId,
        mode: input.mode,
        reference: input.reference,
        status: "valid",
      },
      student_fee: {
        id: input.student_fee_id,
        amount_expected: 300,
        amount_paid: 200,
        amount_remaining: 100,
        status: "partial",
      },
    };
  },
  async cancelPayment(schoolId, profileId, paymentId, reason) {
    return {
      payment: {
        id: paymentId,
        school_id: schoolId,
        cancelled_by: profileId,
        status: "cancelled",
        cancellation_reason: reason,
      },
      student_fee: {
        id: "sf-1",
        amount_expected: 300,
        amount_paid: 0,
        amount_remaining: 300,
        status: "pending",
      },
    };
  },
};

const mockAccess: AccessService = {
  hasPermission: vi.fn().mockResolvedValue(true),
  hasScope: vi.fn().mockResolvedValue(true),
};

const mockResolve = async (token: string) =>
  token === "valid-token" ? { profileId: "resolved-profile-id", schoolId: "school-1" } : { profileId: null, schoolId: null };

function makeApp() {
  return buildApp({
    financePayments: {
      service: mockService,
      resolveProfileAndSchool: mockResolve,
      access: mockAccess,
    },
  });
}

describe("POST /finance/payments", () => {
  it("records a payment and returns payment plus updated student fee", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/finance/payments",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        student_fee_id: "550e8400-e29b-41d4-a716-446655440000",
        amount: 100,
        currency: "USD",
        mode: "cash",
        reference: "Deuxième tranche",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.payment.amount).toBe(100);
    expect(body.data.payment.mode).toBe("cash");
    expect(body.data.payment.reference).toBe("Deuxième tranche");
    expect(body.data.student_fee.status).toBe("partial");
  });
});

describe("GET /finance/student-fees/:studentFeeId", () => {
  it("returns a student fee with payment history", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/finance/student-fees/550e8400-e29b-41d4-a716-446655440000",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(body.data.payments).toHaveLength(1);
    expect(body.data.payments[0].status).toBe("valid");
  });
});

describe("POST /finance/payments/:id/cancel", () => {
  it("cancels a payment and returns cancellation metadata", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/finance/payments/550e8400-e29b-41d4-a716-446655440001/cancel",
      headers: { authorization: "Bearer valid-token" },
      payload: { reason: "Erreur de saisie" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.payment.status).toBe("cancelled");
    expect(body.data.payment.cancellation_reason).toBe("Erreur de saisie");
    expect(body.data.student_fee.status).toBe("pending");
  });

  it("rejects a cancellation without a reason", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/finance/payments/550e8400-e29b-41d4-a716-446655440001/cancel",
      headers: { authorization: "Bearer valid-token" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_INVALID");
  });
});

function makeRpcClient(rpcResult: unknown) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
    from: vi.fn((table: string) => {
      if (table === "fee_payments") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { id: "pay-1", created_at: new Date().toISOString() },
                    error: null,
                  }),
                ),
              })),
            })),
          })),
        };
      }
      if (table === "audit_events") {
        return {
          insert: vi.fn(() => ({ error: null })),
        };
      }
      return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
      };
    }),
  } as unknown as SupabaseClient;
}

describe("createFinancePaymentService.cancelPayment", () => {
  it("returns paid status when the balance is cleared", async () => {
    const client = makeRpcClient({
      payment: { id: "pay-1", status: "cancelled", cancellation_reason: "Erreur" },
      student_fee: {
        id: "sf-1",
        amount_expected: 300,
        amount_paid: 300,
        amount_remaining: 0,
        status: "paid",
      },
    });
    const service = createFinancePaymentService(client);

    const result = (await service.cancelPayment("school-1", "profile-1", "pay-1", "Erreur")) as {
      student_fee: { amount_paid: number; amount_remaining: number; status: string };
    };

    expect(client.rpc).toHaveBeenCalledWith("cancel_payment", {
      p_school_id: "school-1",
      p_profile_id: "profile-1",
      p_payment_id: "pay-1",
      p_reason: "Erreur",
    });
    expect(result.student_fee.status).toBe("paid");
    expect(result.student_fee.amount_paid).toBe(300);
    expect(result.student_fee.amount_remaining).toBe(0);
  });

  it("returns partial status when some amount remains", async () => {
    const client = makeRpcClient({
      payment: { id: "pay-1", status: "cancelled", cancellation_reason: "Remboursement partiel" },
      student_fee: {
        id: "sf-1",
        amount_expected: 300,
        amount_paid: 100,
        amount_remaining: 200,
        status: "partial",
      },
    });
    const service = createFinancePaymentService(client);

    const result = (await service.cancelPayment("school-1", "profile-1", "pay-1", "Remboursement partiel")) as {
      student_fee: { amount_paid: number; amount_remaining: number; status: string };
    };

    expect(result.student_fee.status).toBe("partial");
    expect(result.student_fee.amount_paid).toBe(100);
    expect(result.student_fee.amount_remaining).toBe(200);
  });

  it("returns pending status when nothing remains paid", async () => {
    const client = makeRpcClient({
      payment: { id: "pay-1", status: "cancelled", cancellation_reason: "Erreur" },
      student_fee: {
        id: "sf-1",
        amount_expected: 300,
        amount_paid: 0,
        amount_remaining: 300,
        status: "pending",
      },
    });
    const service = createFinancePaymentService(client);

    const result = (await service.cancelPayment("school-1", "profile-1", "pay-1", "Erreur")) as {
      student_fee: { amount_paid: number; amount_remaining: number; status: string };
    };

    expect(result.student_fee.status).toBe("pending");
    expect(result.student_fee.amount_paid).toBe(0);
    expect(result.student_fee.amount_remaining).toBe(300);
  });
});

describe("createFinancePaymentService.recordPayment", () => {
  it("calls the record_payment RPC with the correct parameters", async () => {
    const client = makeRpcClient({
      payment: {
        id: "pay-new",
        school_id: "school-1",
        student_fee_id: "sf-1",
        amount: 100,
        currency: "USD",
        received_by: "profile-1",
        received_at: "2026-08-18T10:00:00.000Z",
        receipt_no: null,
        mode: "cash",
        reference: "Deuxième tranche",
        status: "valid",
      },
      student_fee: {
        id: "sf-1",
        amount_expected: 300,
        amount_paid: 200,
        amount_remaining: 100,
        status: "partial",
      },
    });
    const service = createFinancePaymentService(client);

    const result = (await service.recordPayment("school-1", "profile-1", {
      student_fee_id: "sf-1",
      amount: 100,
      currency: "USD",
      received_at: "2026-08-18T10:00:00.000Z",
      mode: "cash",
      reference: "Deuxième tranche",
      metadata: { note: "test" },
    })) as {
      payment: { amount: number; mode: string; reference: string };
      student_fee: { amount_paid: number; amount_remaining: number; status: string };
    };

    expect(client.rpc).toHaveBeenCalledWith("record_payment", {
      p_school_id: "school-1",
      p_profile_id: "profile-1",
      p_student_fee_id: "sf-1",
      p_amount: 100,
      p_currency: "USD",
      p_received_at: "2026-08-18T10:00:00.000Z",
      p_receipt_no: null,
      p_mode: "cash",
      p_reference: "Deuxième tranche",
      p_metadata: { note: "test" },
    });
    expect(result.payment.amount).toBe(100);
    expect(result.payment.mode).toBe("cash");
    expect(result.student_fee.status).toBe("partial");
    expect(result.student_fee.amount_paid).toBe(200);
    expect(result.student_fee.amount_remaining).toBe(100);
  });
});
