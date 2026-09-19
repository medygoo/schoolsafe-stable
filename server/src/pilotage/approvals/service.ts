import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CreateApprovalRequestInput, DecideApprovalInput } from "./schema.js";
import { SchoolSafeError } from "../../http/errors.js";

export interface ApprovalRequest {
  id: string;
  school_id: string;
  request_type: string;
  entity_type: string;
  entity_id: string;
  requested_by: string;
  requested_at: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decided_by: string | null;
  decided_at: string | null;
  expected_version: number;
  payload: Record<string, unknown>;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalService {
  list(schoolId: string, options: { status?: string; limit: number; offset: number }): Promise<{ data: ApprovalRequest[]; count: number }>;
  create(schoolId: string, profileId: string, input: CreateApprovalRequestInput): Promise<ApprovalRequest>;
  decide(approvalId: string, schoolId: string, profileId: string, input: DecideApprovalInput): Promise<ApprovalRequest>;
}

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createApprovalService(supabaseUrl: string, serviceRoleKey: string): ApprovalService {
  const client = createServiceClient(supabaseUrl, serviceRoleKey);

  return {
    async list(schoolId, options) {
      let query = client
        .from("approval_requests")
        .select("*, requester:requested_by(id, display_name), decider:decided_by(id, display_name)", { count: "exact" })
        .eq("school_id", schoolId)
        .order("requested_at", { ascending: false })
        .range(options.offset, options.offset + options.limit - 1);
      if (options.status) query = query.eq("status", options.status);
      const { data, error, count } = await query;
      if (error) throw new Error(`Failed to list approval requests: ${error.message}`);
      return { data: (data ?? []) as unknown as ApprovalRequest[], count: count ?? 0 };
    },

    async create(schoolId, profileId, input) {
      const { data, error } = await client
        .from("approval_requests")
        .insert({
          school_id: schoolId,
          request_type: input.request_type,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          requested_by: profileId,
          expected_version: input.expected_version ?? 1,
          payload: input.payload ?? {},
          reason: input.reason ?? null,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(`Failed to create approval request: ${error?.message}`);
      return data as unknown as ApprovalRequest;
    },

    async decide(approvalId, schoolId, profileId, input) {
      const { data: existing, error: lookupError } = await client
        .from("approval_requests")
        .select("id, status, expected_version")
        .eq("id", approvalId)
        .eq("school_id", schoolId)
        .single();
      if (lookupError || !existing) throw new Error("Approval request not found");
      if (existing.status !== "pending") {
        throw new SchoolSafeError(403, "CONDITION_DENIED", `La demande est déjà ${existing.status}`, false);
      }

      const { data, error } = await client
        .from("approval_requests")
        .update({
          status: input.decision,
          decided_by: profileId,
          decided_at: new Date().toISOString(),
          reason: input.reason ?? null,
        })
        .eq("id", approvalId)
        .eq("status", "pending")
        .select("*")
        .single();
      if (error || !data) throw new Error(`Failed to decide approval request: ${error?.message}`);
      return data as unknown as ApprovalRequest;
    },
  };
}
