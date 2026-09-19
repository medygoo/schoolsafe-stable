import { describe, it, expect } from "vitest";
import { createFinancePaymentService } from "../src/finance/payments/service.js";
import type { SupabaseClient } from "@supabase/supabase-js";

type FeePayment = {
  id: string;
  school_id: string;
  student_fee_id: string;
  amount: number;
  status: string;
  cancelled_at?: string;
  cancelled_by?: string;
  cancellation_reason?: string;
  created_at?: string;
  updated_at?: string;
};

type StudentFee = {
  id: string;
  school_id: string;
  amount_expected: number;
  amount_paid: number;
  amount_remaining: number;
  status: string;
  updated_at?: string;
};

class FakeCancelPaymentDatabase {
  fees: Map<string, StudentFee>;
  payments: Map<string, FeePayment>;

  constructor(seed: { fees: StudentFee[]; payments: FeePayment[] }) {
    this.fees = new Map(seed.fees.map((fee) => [fee.id, fee]));
    this.payments = new Map(seed.payments.map((payment) => [payment.id, payment]));
  }

  from(table: string) {
    if (table === "fee_payments") {
      return {
        select: () => ({
          eq: (_column: string, paymentId: string) => ({
            eq: (_column: string, _schoolId: string) => ({
              single: () => {
                const payment = this.payments.get(paymentId);
                if (!payment) {
                  return Promise.resolve({ data: null, error: { message: "Paiement introuvable" } });
                }
                return Promise.resolve({
                  data: { id: payment.id, created_at: payment.created_at ?? new Date().toISOString() },
                  error: null,
                });
              },
            }),
          }),
        }),
      };
    }
    if (table === "audit_events") {
      return {
        insert: () => ({ error: null }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  }

  async rpc(name: string, args: Record<string, unknown>) {
    if (name !== "cancel_payment") {
      throw new Error(`Unexpected RPC: ${name}`);
    }

    const pSchoolId = args.p_school_id as string;
    const pProfileId = args.p_profile_id as string;
    const pPaymentId = args.p_payment_id as string;
    const pReason = args.p_reason as string;

    const payment = this.payments.get(pPaymentId);
    if (!payment) {
      throw new Error("Paiement introuvable");
    }
    if (payment.status === "cancelled") {
      throw new Error("Le paiement est déjà annulé");
    }

    const fee = [...this.fees.values()].find(
      (f) => f.id === payment.student_fee_id && f.school_id === pSchoolId,
    );
    if (!fee) {
      throw new Error("Frais étudiant introuvable");
    }

    const now = new Date().toISOString();

    payment.status = "cancelled";
    payment.cancelled_at = now;
    payment.cancelled_by = pProfileId;
    payment.cancellation_reason = pReason;
    payment.updated_at = now;

    const newPaid = [...this.payments.values()]
      .filter((p) => p.student_fee_id === fee.id && p.status !== "cancelled")
      .reduce((sum, p) => sum + p.amount, 0);

    const newRemaining = Math.max(fee.amount_expected - newPaid, 0);
    const newStatus = newRemaining <= 0 ? "paid" : newPaid > 0 ? "partial" : "pending";

    fee.amount_paid = newPaid;
    fee.amount_remaining = newRemaining;
    fee.status = newStatus;
    fee.updated_at = now;

    return {
      data: {
        payment: {
          id: payment.id,
          status: payment.status,
          cancelled_at: payment.cancelled_at,
          cancelled_by: payment.cancelled_by,
          cancellation_reason: payment.cancellation_reason,
        },
        student_fee: {
          id: fee.id,
          amount_expected: fee.amount_expected,
          amount_paid: fee.amount_paid,
          amount_remaining: fee.amount_remaining,
          status: fee.status,
        },
      },
      error: null,
    };
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

describe("cancel_payment RPC balance recomputation", () => {
  it("paid (overpaid) -> stays paid when remaining payments still cover the expected amount", async () => {
    const db = new FakeCancelPaymentDatabase({
      fees: [
        {
          id: "sf-1",
          school_id: "school-1",
          amount_expected: 300,
          amount_paid: 400,
          amount_remaining: 0,
          status: "paid",
        },
      ],
      payments: [
        { id: "pay-1", school_id: "school-1", student_fee_id: "sf-1", amount: 300, status: "valid" },
        { id: "pay-2", school_id: "school-1", student_fee_id: "sf-1", amount: 100, status: "valid" },
      ],
    });

    const service = createFinancePaymentService(db.asClient());
    const result = (await service.cancelPayment("school-1", "profile-1", "pay-2", "Erreur de saisie")) as {
      student_fee: { amount_paid: number; amount_remaining: number; status: string };
    };

    expect(result.student_fee.amount_paid).toBe(300);
    expect(result.student_fee.amount_remaining).toBe(0);
    expect(result.student_fee.status).toBe("paid");

    const fee = db.fees.get("sf-1");
    expect(fee?.amount_paid).toBe(300);
    expect(fee?.amount_remaining).toBe(0);
    expect(fee?.status).toBe("paid");
  });

  it("paid -> partial when the cancelled payment uncovers a remaining balance", async () => {
    const db = new FakeCancelPaymentDatabase({
      fees: [
        {
          id: "sf-1",
          school_id: "school-1",
          amount_expected: 300,
          amount_paid: 300,
          amount_remaining: 0,
          status: "paid",
        },
      ],
      payments: [
        { id: "pay-1", school_id: "school-1", student_fee_id: "sf-1", amount: 200, status: "valid" },
        { id: "pay-2", school_id: "school-1", student_fee_id: "sf-1", amount: 100, status: "valid" },
      ],
    });

    const service = createFinancePaymentService(db.asClient());
    const result = (await service.cancelPayment("school-1", "profile-1", "pay-2", "Remboursement partiel")) as {
      student_fee: { amount_paid: number; amount_remaining: number; status: string };
    };

    expect(result.student_fee.amount_paid).toBe(200);
    expect(result.student_fee.amount_remaining).toBe(100);
    expect(result.student_fee.status).toBe("partial");

    const fee = db.fees.get("sf-1");
    expect(fee?.status).toBe("partial");
  });

  it("partial -> partial when other payments still cover part of the expected amount", async () => {
    const db = new FakeCancelPaymentDatabase({
      fees: [
        {
          id: "sf-1",
          school_id: "school-1",
          amount_expected: 300,
          amount_paid: 250,
          amount_remaining: 50,
          status: "partial",
        },
      ],
      payments: [
        { id: "pay-1", school_id: "school-1", student_fee_id: "sf-1", amount: 200, status: "valid" },
        { id: "pay-2", school_id: "school-1", student_fee_id: "sf-1", amount: 50, status: "valid" },
      ],
    });

    const service = createFinancePaymentService(db.asClient());
    const result = (await service.cancelPayment("school-1", "profile-1", "pay-2", "Erreur de saisie")) as {
      student_fee: { amount_paid: number; amount_remaining: number; status: string };
    };

    expect(result.student_fee.amount_paid).toBe(200);
    expect(result.student_fee.amount_remaining).toBe(100);
    expect(result.student_fee.status).toBe("partial");
  });

  it("partial -> pending when cancelling the only remaining payment", async () => {
    const db = new FakeCancelPaymentDatabase({
      fees: [
        {
          id: "sf-1",
          school_id: "school-1",
          amount_expected: 300,
          amount_paid: 100,
          amount_remaining: 200,
          status: "partial",
        },
      ],
      payments: [
        { id: "pay-1", school_id: "school-1", student_fee_id: "sf-1", amount: 100, status: "valid" },
      ],
    });

    const service = createFinancePaymentService(db.asClient());
    const result = (await service.cancelPayment("school-1", "profile-1", "pay-1", "Paiement rejeté")) as {
      student_fee: { amount_paid: number; amount_remaining: number; status: string };
    };

    expect(result.student_fee.amount_paid).toBe(0);
    expect(result.student_fee.amount_remaining).toBe(300);
    expect(result.student_fee.status).toBe("pending");

    const fee = db.fees.get("sf-1");
    expect(fee?.status).toBe("pending");
  });

  it("pending -> pending when cancelling a zero-amount payment", async () => {
    const db = new FakeCancelPaymentDatabase({
      fees: [
        {
          id: "sf-1",
          school_id: "school-1",
          amount_expected: 300,
          amount_paid: 0,
          amount_remaining: 300,
          status: "pending",
        },
      ],
      payments: [
        { id: "pay-1", school_id: "school-1", student_fee_id: "sf-1", amount: 0, status: "valid" },
      ],
    });

    const service = createFinancePaymentService(db.asClient());
    const result = (await service.cancelPayment("school-1", "profile-1", "pay-1", "Paiement annulé")) as {
      student_fee: { amount_paid: number; amount_remaining: number; status: string };
    };

    expect(result.student_fee.amount_paid).toBe(0);
    expect(result.student_fee.amount_remaining).toBe(300);
    expect(result.student_fee.status).toBe("pending");
  });

  it("updates the cancelled payment metadata", async () => {
    const db = new FakeCancelPaymentDatabase({
      fees: [
        {
          id: "sf-1",
          school_id: "school-1",
          amount_expected: 300,
          amount_paid: 300,
          amount_remaining: 0,
          status: "paid",
        },
      ],
      payments: [
        { id: "pay-1", school_id: "school-1", student_fee_id: "sf-1", amount: 300, status: "valid" },
      ],
    });

    const service = createFinancePaymentService(db.asClient());
    const result = (await service.cancelPayment("school-1", "profile-admin", "pay-1", "Erreur de saisie")) as {
      payment: { status: string; cancelled_by: string; cancellation_reason: string };
    };

    expect(result.payment.status).toBe("cancelled");
    expect(result.payment.cancelled_by).toBe("profile-admin");
    expect(result.payment.cancellation_reason).toBe("Erreur de saisie");

    const payment = db.payments.get("pay-1");
    expect(payment?.status).toBe("cancelled");
    expect(payment?.cancelled_by).toBe("profile-admin");
  });

  it("rejects cancelling an already cancelled payment", async () => {
    const db = new FakeCancelPaymentDatabase({
      fees: [
        {
          id: "sf-1",
          school_id: "school-1",
          amount_expected: 300,
          amount_paid: 0,
          amount_remaining: 300,
          status: "pending",
        },
      ],
      payments: [
        { id: "pay-1", school_id: "school-1", student_fee_id: "sf-1", amount: 300, status: "cancelled" },
      ],
    });

    const service = createFinancePaymentService(db.asClient());
    await expect(
      service.cancelPayment("school-1", "profile-1", "pay-1", "Tentative d'annulation"),
    ).rejects.toThrow("Le paiement est déjà annulé");
  });
});
