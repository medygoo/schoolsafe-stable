// SchoolSafe Finance v1 — service natif PostgreSQL complet (VPS).
// Couvre : structures de frais, frais élèves, paiements, caisse, rapports, reçus, campagnes, scans.
// Toute requête humaine s'exécute dans withRequestContext : BEGIN → api.set_request_context
// → api.* → COMMIT. Le serveur transporte la session, il ne recalcule jamais les permissions.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";

export interface FeeStructureProjection {
  id: string;
  academic_year_id: string;
  cycle_key: string | null;
  label: string;
  amount: number;
  currency: string;
  due_date: string | null;
  is_active: boolean;
}

export interface StudentFeeProjection {
  id: string;
  student_id: string;
  fee_structure_id: string;
  label: string;
  amount_expected: number;
  amount_paid: number;
  amount_remaining: number;
  status: string;
  due_date: string | null;
  currency: string;
}

export interface PaymentProjection {
  id: string;
  student_fee_id: string;
  amount: number;
  currency: string;
  received_at: string;
  receipt_no: string | null;
  mode: string;
  status: string;
}

export interface DailyReportProjection {
  date: string;
  total_paid: number;
  payment_count: number;
}

export interface ReceiptProjection {
  payment_id: string;
  receipt_no: string | null;
  student_fee_id: string;
  amount: number;
  currency: string;
  received_at: string;
  mode: string;
  reference: string | null;
  student_matricule: string;
  student_name: string;
  fee_label: string;
}

export interface CampaignProjection {
  id: string;
  fee_structure_id: string;
  label: string;
  description: string | null;
  classes: unknown;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  created_by: string;
  created_at: string;
}

export function createFinanceNativeService(businessPool: BusinessPool) {
  return {
    // --- Structures de frais ---
    async listFeeStructures(context: RequestContext): Promise<FeeStructureProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ fee_structure_list: FeeStructureProjection[] }>(
          "select api.fee_structure_list() as fee_structure_list",
        );
        return r.rows[0]?.fee_structure_list ?? [];
      });
    },

    async createFeeStructure(context: RequestContext, input: {
      academic_year_id: string;
      cycle_key?: string;
      label: string;
      amount: number;
      currency?: string;
      due_date?: string;
    }): Promise<string> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ fee_structure_create: string }>(
          "select api.fee_structure_create($1, $2, $3, $4, $5, $6) as fee_structure_create",
          [input.academic_year_id, input.cycle_key ?? null, input.label, input.amount, input.currency ?? "USD", input.due_date ?? null],
        );
        return r.rows[0].fee_structure_create;
      });
    },

    // --- Frais étudiants ---
    async listStudentFees(context: RequestContext, studentId: string): Promise<StudentFeeProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ student_fee_list: StudentFeeProjection[] }>(
          "select api.student_fee_list($1) as student_fee_list",
          [studentId],
        );
        return r.rows[0]?.student_fee_list ?? [];
      });
    },

    async getStudentFee(context: RequestContext, studentFeeId: string): Promise<StudentFeeProjection | null> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const fs = (
          await client.query<{ sf_id: string; student_id: string; amount_expected: string; amount_paid: string; amount_remaining: string; status: string }>(
            "select id as sf_id, student_id, amount_expected, amount_paid, amount_remaining, status from app.student_fees where id = $1",
            [studentFeeId],
          )
        ).rows[0];
        if (!fs) return null;
        const structure = (
          await client.query<{ label: string; due_date: string | null; currency: string }>(
            "select fs.label, fs.due_date, fs.currency from app.fee_structures fs join app.student_fees sf on sf.fee_structure_id = fs.id where sf.id = $1",
            [studentFeeId],
          )
        ).rows[0];
        return {
          id: studentFeeId,
          student_id: fs.student_id,
          fee_structure_id: studentFeeId,
          label: structure?.label ?? "",
          amount_expected: Number(fs.amount_expected),
          amount_paid: Number(fs.amount_paid),
          amount_remaining: Number(fs.amount_remaining),
          status: fs.status,
          due_date: structure?.due_date ?? null,
          currency: structure?.currency ?? "USD",
        };
      });
    },

    async createStudentFee(
      context: RequestContext,
      studentId: string,
      feeStructureId: string,
      academicYearId: string,
    ): Promise<string> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ student_fee_create: string }>(
          "select api.student_fee_create($1, $2, $3) as student_fee_create",
          [studentId, feeStructureId, academicYearId],
        );
        return r.rows[0].student_fee_create;
      });
    },

    // --- Paiements ---
    async listStudentPayments(context: RequestContext, studentId: string): Promise<PaymentProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ student_payment_list: PaymentProjection[] }>(
          "select api.student_payment_list($1) as student_payment_list",
          [studentId],
        );
        return r.rows[0]?.student_payment_list ?? [];
      });
    },

    async createPayment(
      context: RequestContext,
      studentFeeId: string,
      amount: number,
      currency: string,
      receivedBy: string,
      mode: string,
      reference?: string,
    ): Promise<string> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ payment_create: string }>(
          "select api.payment_create($1, $2, $3, $4, $5, $6) as payment_create",
          [studentFeeId, amount, currency, receivedBy, mode, reference ?? null],
        );
        return r.rows[0].payment_create;
      });
    },

    async cancelPayment(context: RequestContext, paymentId: string, reason: string): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ payment_cancel: boolean }>(
          "select api.payment_cancel($1, $2) as payment_cancel",
          [paymentId, reason],
        );
        return r.rows[0]?.payment_cancel === true;
      });
    },

    async getReceipt(context: RequestContext, paymentId: string): Promise<ReceiptProjection | null> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ payment_receipt: ReceiptProjection }>(
          "select api.payment_receipt($1) as payment_receipt",
          [paymentId],
        );
        return r.rows[0]?.payment_receipt ?? null;
      });
    },

    // --- Caisse ---
    async openCashRegister(context: RequestContext): Promise<string> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ cash_register_open: string }>(
          "select api.cash_register_open() as cash_register_open",
        );
        return r.rows[0].cash_register_open;
      });
    },

    async closeCashRegister(context: RequestContext, registerId: string): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ cash_register_close: boolean }>(
          "select api.cash_register_close($1) as cash_register_close",
          [registerId],
        );
        return r.rows[0]?.cash_register_close === true;
      });
    },

    // --- Rapports ---
    async getDailyReport(context: RequestContext, date: string): Promise<DailyReportProjection | null> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ finance_daily_report: DailyReportProjection }>(
          "select api.finance_daily_report($1::date) as finance_daily_report",
          [date],
        );
        return r.rows[0]?.finance_daily_report ?? null;
      });
    },

    // --- Campagnes ---
    async listCampaigns(context: RequestContext): Promise<CampaignProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ fee_control_campaign_list: CampaignProjection[] }>(
          "select api.fee_control_campaign_list() as fee_control_campaign_list",
        );
        return r.rows[0]?.fee_control_campaign_list ?? [];
      });
    },

    async createCampaign(context: RequestContext, input: {
      fee_structure_id: string;
      label: string;
      description?: string;
      classes?: unknown;
      starts_at?: string;
      ends_at?: string;
    }): Promise<string> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ fee_control_campaign_create: string }>(
          "select api.fee_control_campaign_create($1, $2, $3, $4, $5, $6) as fee_control_campaign_create",
          [
            input.fee_structure_id,
            input.label,
            input.description ?? null,
            input.classes ? JSON.stringify(input.classes) : '[]',
            input.starts_at ?? null,
            input.ends_at ?? null,
          ],
        );
        return r.rows[0].fee_control_campaign_create;
      });
    },

    // --- Scans ---
    async createScan(context: RequestContext, input: {
      campaign_id: string;
      student_id: string;
      result: string;
      notes?: string;
      student_fee_status?: string;
    }): Promise<string> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ fee_control_scan_create: string }>(
          "select api.fee_control_scan_create($1, $2, $3, $4, $5) as fee_control_scan_create",
          [input.campaign_id, input.student_id, input.result, input.notes ?? null, input.student_fee_status ?? null],
        );
        return r.rows[0].fee_control_scan_create;
      });
    },
  };
}

export type FinanceNativeService = ReturnType<typeof createFinanceNativeService>;
