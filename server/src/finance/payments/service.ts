import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CreatePaymentInput } from "../control/schema.js";
import { SchoolSafeError } from "../../http/errors.js";

export interface FinancePaymentService {
  getStudentFeeWithPayments(schoolId: string, studentFeeId: string): Promise<unknown>;
  recordPayment(schoolId: string, profileId: string, input: CreatePaymentInput): Promise<unknown>;
  cancelPayment(schoolId: string, profileId: string, paymentId: string, reason: string): Promise<unknown>;
}

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function insertAuditEvent(
  client: SupabaseClient,
  schoolId: string,
  actorProfileId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from("audit_events").insert({
    school_id: schoolId,
    actor_profile_id: actorProfileId,
    event_type: eventType,
    payload,
  });
  if (error) {
    throw new Error(`Failed to insert audit event ${eventType}: ${JSON.stringify(error)}`);
  }
}

export function createFinancePaymentService(
  clientOrUrl: SupabaseClient | string,
  serviceRoleKey?: string,
): FinancePaymentService {
  const client = typeof clientOrUrl === "string" ? createServiceClient(clientOrUrl, serviceRoleKey!) : clientOrUrl;

  return {
    async getStudentFeeWithPayments(schoolId, studentFeeId) {
      const { data: studentFee, error: feeError } = await client
        .from("student_fees")
        .select("*, students!inner(id, matricule, first_name, last_name), fee_structures(id, label, amount, currency)")
        .eq("id", studentFeeId)
        .eq("school_id", schoolId)
        .single();
      if (feeError || !studentFee) {
        const notFound = !studentFee || feeError?.code === "PGRST116";
        if (notFound) {
          throw new SchoolSafeError(404, "NOT_FOUND", "Frais étudiant introuvable", false);
        }
        throw new Error(`Frais étudiant introuvable : ${feeError?.message ?? "inconnu"}`);
      }

      const { data: payments, error: paymentsError } = await client
        .from("fee_payments")
        .select("*")
        .eq("student_fee_id", studentFeeId)
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      if (paymentsError) throw new Error(`Échec du chargement des paiements : ${paymentsError.message}`);

      return { ...studentFee, payments: payments ?? [] };
    },

    async recordPayment(schoolId, profileId, input) {
      const { data, error } = await client.rpc("record_payment", {
        p_school_id: schoolId,
        p_profile_id: profileId,
        p_student_fee_id: input.student_fee_id,
        p_amount: input.amount,
        p_currency: input.currency,
        p_received_at: input.received_at ?? new Date().toISOString(),
        p_receipt_no: input.receipt_no ?? null,
        p_mode: input.mode,
        p_reference: input.reference,
        p_metadata: input.metadata,
      });

      if (error || !data) {
        throw new Error(`Échec de l'enregistrement du paiement : ${error?.message ?? "inconnu"}`);
      }

      return data;
    },

    async cancelPayment(schoolId, profileId, paymentId, reason) {
      const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

      const { data: payment, error: paymentError } = await client
        .from("fee_payments")
        .select("id, created_at")
        .eq("id", paymentId)
        .eq("school_id", schoolId)
        .single();
      if (paymentError || !payment) throw new Error(`Paiement introuvable : ${paymentError?.message ?? "inconnu"}`);

      const createdAt = new Date(payment.created_at as string).getTime();
      if (Date.now() - createdAt > CANCELLATION_WINDOW_MS) {
        await insertAuditEvent(client, schoolId, profileId, "finance.payment.cancel.denied", {
          payment_id: paymentId,
          reason: "outside_cancellation_window",
        });
        throw new SchoolSafeError(403, "CONDITION_DENIED", "Délai d'annulation dépassé", false);
      }

      const { data, error } = await client.rpc("cancel_payment", {
        p_school_id: schoolId,
        p_profile_id: profileId,
        p_payment_id: paymentId,
        p_reason: reason,
      });
      if (error || !data) throw new Error(`Échec de l'annulation : ${error?.message ?? "inconnu"}`);

      await insertAuditEvent(client, schoolId, profileId, "finance.payment.cancelled", {
        payment_id: paymentId,
        cancellation_reason: reason,
      });

      return data;
    },
  };
}
