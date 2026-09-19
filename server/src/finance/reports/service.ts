import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CloseCashRegisterInput } from "./schema.js";

export interface ReceiptData {
  receiptNumber: string;
  generatedAt: string;
  school: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
    logo_url?: string;
    currency?: string;
    activeAcademicYear?: { id: string; label: string };
  };
  student: {
    id: string;
    matricule: string;
    first_name: string;
    last_name: string;
    class_name?: string;
    photo_url?: string;
  };
  payment: {
    id: string;
    amount: number;
    currency: string;
    received_at: string;
    mode?: string;
    reference?: string;
    fee_label: string;
    expected_amount: number;
    remaining_amount: number;
    cashier_name?: string;
    verification_code?: string;
  };
}

export interface ModeBreakdown {
  mode: string;
  amount: number;
  count: number;
}

export interface FeeTypeBreakdown {
  fee_label: string;
  amount: number;
  count: number;
}

export interface DailyReportPayment {
  id: string;
  amount: number;
  currency: string;
  received_at: string;
  mode?: string;
  reference?: string;
  student: { id: string; matricule: string; first_name: string; last_name: string };
  fee_label: string;
}

export interface DailyReport {
  date: string;
  total_amount: number;
  transaction_count: number;
  currency: string;
  by_mode: ModeBreakdown[];
  by_fee_type: FeeTypeBreakdown[];
  payments: DailyReportPayment[];
}

export interface FinanceReportsService {
  getReceiptData(schoolId: string, paymentId: string): Promise<ReceiptData | null>;
  getDailyReport(schoolId: string, date: string): Promise<DailyReport>;
  closeCashRegister(schoolId: string, profileId: string, input: CloseCashRegisterInput): Promise<unknown>;
  /** Résout paymentId → student_id (via student_fees). Null si le paiement est introuvable. */
  getPaymentStudentId(schoolId: string, paymentId: string): Promise<string | null>;
}

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function toDateRange(date: string): { start: string; end: string } {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function createFinanceReportsService(
  clientOrUrl: SupabaseClient | string,
  serviceRoleKey?: string,
): FinanceReportsService {
  const client = typeof clientOrUrl === "string" ? createServiceClient(clientOrUrl, serviceRoleKey!) : clientOrUrl;

  async function ensureReceiptNumber(paymentId: string, schoolId: string): Promise<string> {
    const { data, error } = await client.rpc("ensure_receipt_number", {
      p_payment_id: paymentId,
      p_school_id: schoolId,
    });

    if (error || !data) {
      throw new Error(`Échec de la génération du numéro de reçu : ${error?.message ?? "inconnu"}`);
    }

    return data as string;
  }

  async function getPaymentStudentId(schoolId: string, paymentId: string): Promise<string | null> {
    const { data, error } = await client
      .from("fee_payments")
      .select("student_fees!inner(student_id)")
      .eq("id", paymentId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (error || !data) return null;
    const studentFee = (data as Record<string, unknown>).student_fees as Record<string, unknown> | undefined;
    return (studentFee?.student_id as string | undefined) ?? null;
  }

  async function getReceiptData(schoolId: string, paymentId: string): Promise<ReceiptData | null> {
    const { data: payment, error: paymentError } = await client
      .from("fee_payments")
      .select("*, student_fees!inner(*, fee_structures(*), students!inner(*, classes(name), photo_path))")
      .eq("id", paymentId)
      .eq("school_id", schoolId)
      .single();
    if (paymentError || !payment) return null;

    const feePayment = payment as Record<string, unknown>;
    const studentFee = (feePayment.student_fees ?? {}) as Record<string, unknown>;
    const feeStructure = (studentFee.fee_structures ?? {}) as Record<string, unknown>;
    const student = (studentFee.students ?? {}) as Record<string, unknown>;
    const studentClass = (student.classes ?? {}) as Record<string, unknown> | undefined;

    const receiptNumber = await ensureReceiptNumber(feePayment.id as string, schoolId);

    const [{ data: schoolData }, { data: contactsData }, { data: academicYearData }, { data: cashierData }] =
      await Promise.all([
        client.from("school").select("*").eq("id", schoolId).single(),
        client.from("school_contacts").select("*").eq("school_id", schoolId).maybeSingle(),
        client.from("academic_years").select("id, label").eq("school_id", schoolId).eq("is_active", true).maybeSingle(),
        client.from("profiles").select("display_name, first_name, last_name").eq("id", feePayment.received_by).maybeSingle(),
      ]);

    const school = (schoolData ?? {}) as Record<string, unknown>;
    const contacts = (contactsData ?? {}) as Record<string, unknown>;
    const academicYear = academicYearData as { id: string; label: string } | null;
    const cashier = (cashierData ?? {}) as Record<string, unknown>;

    const cashierName =
      (cashier.display_name as string) ||
      `${(cashier.first_name as string) ?? ""} ${(cashier.last_name as string) ?? ""}`.trim() ||
      undefined;

    const metadata = (feePayment.metadata ?? {}) as Record<string, unknown>;

    return {
      receiptNumber,
      generatedAt: new Date().toISOString(),
      school: {
        name: (school.name as string) ?? "",
        address: (contacts.address as string) ?? undefined,
        phone: (contacts.phone as string) ?? undefined,
        email: (contacts.email as string) ?? undefined,
        website: (contacts.website_url as string) ?? undefined,
        logo_url: (school.logo_path as string) ?? undefined,
        currency: (school.currency as string) ?? undefined,
        activeAcademicYear: academicYear ?? undefined,
      },
      student: {
        id: (student.id as string) ?? "",
        matricule: (student.matricule as string) ?? "",
        first_name: (student.first_name as string) ?? "",
        last_name: (student.last_name as string) ?? "",
        class_name: (studentClass?.name as string) ?? undefined,
        photo_url: (student.photo_path as string) ?? undefined,
      },
      payment: {
        id: (feePayment.id as string) ?? "",
        amount: Number(feePayment.amount ?? 0),
        currency: (feePayment.currency as string) ?? "USD",
        received_at: (feePayment.received_at as string) ?? new Date().toISOString(),
        mode: ((feePayment.mode as string) ?? (metadata.mode as string)) || undefined,
        reference: ((feePayment.reference as string) ?? (metadata.reference as string)) || undefined,
        fee_label: (feeStructure.label as string) ?? "",
        expected_amount: Number(studentFee.amount_expected ?? 0),
        remaining_amount: Number(studentFee.amount_remaining ?? 0),
        cashier_name: cashierName,
        verification_code: (metadata.verification_code as string) ?? undefined,
      },
    };
  }

  async function getDailyReport(schoolId: string, date: string): Promise<DailyReport> {
    const { start, end } = toDateRange(date);

    const { data: payments, error } = await client
      .from("fee_payments")
      .select(
        "*, student_fees!inner(amount_expected, amount_remaining, fee_structures(label), students!inner(id, matricule, first_name, last_name))",
      )
      .eq("school_id", schoolId)
      .gte("received_at", start)
      .lt("received_at", end)
      .eq("status", "valid")
      .order("received_at", { ascending: false });

    if (error) throw new Error(`Échec du chargement du rapport journalier : ${error.message}`);

    const rows = (payments ?? []) as Record<string, unknown>[];
    const currencyCode = (rows[0]?.currency as string) ?? "USD";

    const { byMode, byFeeType, total } = rows.reduce<{
      byMode: Map<string, ModeBreakdown>;
      byFeeType: Map<string, FeeTypeBreakdown>;
      total: number;
    }>(
      (acc, row) => {
        const amount = Number(row.amount ?? 0);
        const studentFee = (row.student_fees ?? {}) as Record<string, unknown>;
        const feeStructure = (studentFee.fee_structures ?? {}) as Record<string, unknown>;
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        const mode = (((row.mode as string) ?? (metadata.mode as string)) ?? "unknown").toLowerCase();
        const feeLabel = (feeStructure.label as string) ?? "Non spécifié";

        const nextByMode = new Map(acc.byMode);
        const prevMode = nextByMode.get(mode) ?? { mode, amount: 0, count: 0 };
        nextByMode.set(mode, { ...prevMode, amount: prevMode.amount + amount, count: prevMode.count + 1 });

        const nextByFeeType = new Map(acc.byFeeType);
        const prevFee = nextByFeeType.get(feeLabel) ?? { fee_label: feeLabel, amount: 0, count: 0 };
        nextByFeeType.set(feeLabel, {
          ...prevFee,
          amount: prevFee.amount + amount,
          count: prevFee.count + 1,
        });

        return { byMode: nextByMode, byFeeType: nextByFeeType, total: acc.total + amount };
      },
      { byMode: new Map(), byFeeType: new Map(), total: 0 },
    );

    const reportPayments: DailyReportPayment[] = rows.map((row) => {
      const amount = Number(row.amount ?? 0);
      const studentFee = (row.student_fees ?? {}) as Record<string, unknown>;
      const feeStructure = (studentFee.fee_structures ?? {}) as Record<string, unknown>;
      const student = (studentFee.students ?? {}) as Record<string, unknown>;
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const feeLabel = (feeStructure.label as string) ?? "Non spécifié";

      return {
        id: (row.id as string) ?? "",
        amount,
        currency: (row.currency as string) ?? currencyCode,
        received_at: (row.received_at as string) ?? "",
        mode: ((row.mode as string) ?? (metadata.mode as string)) || undefined,
        reference: ((row.reference as string) ?? (metadata.reference as string)) || undefined,
        student: {
          id: (student.id as string) ?? "",
          matricule: (student.matricule as string) ?? "",
          first_name: (student.first_name as string) ?? "",
          last_name: (student.last_name as string) ?? "",
        },
        fee_label: feeLabel,
      };
    });

    return {
      date,
      total_amount: total,
      transaction_count: rows.length,
      currency: currencyCode,
      by_mode: Array.from(byMode.values()),
      by_fee_type: Array.from(byFeeType.values()),
      payments: reportPayments,
    };
  }

  async function closeCashRegister(
    schoolId: string,
    profileId: string,
    input: CloseCashRegisterInput,
  ): Promise<unknown> {
    const { date, expected_amount, notes } = input;

    const report = await getDailyReport(schoolId, date);
    const totalAmount = report.total_amount;
    const expectedAmount = expected_amount ?? totalAmount;
    const difference = totalAmount - expectedAmount;

    const { data: closure, error } = await client
      .from("cash_register_closures")
      .insert({
        school_id: schoolId,
        closure_date: date,
        closed_by: profileId,
        total_amount: totalAmount,
        expected_amount: expectedAmount,
        difference,
        notes: notes ?? null,
        status: "closed",
        metadata: {},
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: existingClosure, error: existingError } = await client
          .from("cash_register_closures")
          .select("*")
          .eq("school_id", schoolId)
          .eq("closure_date", date)
          .single();
        if (existingError || !existingClosure) {
          throw new Error(`Échec de la récupération de la clôture existante : ${existingError?.message ?? "inconnu"}`);
        }
        return { closure: existingClosure, alreadyClosed: true };
      }
      throw new Error(`Échec de la clôture de caisse : ${error.message}`);
    }

    return { closure, alreadyClosed: false };
  }

  return { getReceiptData, getDailyReport, closeCashRegister, getPaymentStudentId };
}
