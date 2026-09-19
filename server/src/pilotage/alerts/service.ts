import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ListAlertsInput, AcknowledgeAlertInput, ResolveAlertInput } from "./schema.js";
import { evaluateAlertRules, type AlertRuleContext } from "./rules.js";

export interface AlertService {
  list(input: ListAlertsInput & { schoolId: string }): Promise<{ data: unknown[]; count: number }>;
  acknowledge(alertId: string, input: AcknowledgeAlertInput & { profileId: string }): Promise<unknown>;
  resolve(alertId: string, input: ResolveAlertInput & { profileId: string }): Promise<unknown>;
  evaluateRules(context: AlertRuleContext): Promise<import("./rules.js").AlertRuleResult[]>;
}

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export function createAlertService(supabaseUrl: string, serviceRoleKey: string): AlertService {
  const client = createServiceClient(supabaseUrl, serviceRoleKey);

  return {
    async list(input) {
      let query = client
        .from("alerts")
        .select("*", { count: "exact" })
        .eq("school_id", input.schoolId)
        .order("detected_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.status) query = query.eq("status", input.status);
      if (input.severity) query = query.eq("severity", input.severity);
      if (input.domain) query = query.eq("source_module", input.domain);
      if (input.assigned_to) query = query.eq("assigned_to", input.assigned_to);

      const { data, error, count } = await query;
      if (error) throw new Error(`Failed to list alerts: ${error.message}`);
      return { data: data ?? [], count: count ?? 0 };
    },

    async acknowledge(alertId, input) {
      const { data, error } = await client
        .from("alerts")
        .update({
          status: "acknowledged",
          assigned_to: input.assigned_to ?? input.profileId,
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: input.profileId,
        })
        .eq("id", alertId)
        .select("*")
        .single();
      if (error || !data) throw new Error(`Failed to acknowledge alert: ${error?.message}`);
      return data;
    },

    async resolve(alertId, input) {
      const { data, error } = await client
        .from("alerts")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
          resolved_by: input.profileId,
          resolution_note: input.note ?? null,
        })
        .eq("id", alertId)
        .select("*")
        .single();
      if (error || !data) throw new Error(`Failed to resolve alert: ${error?.message}`);
      return data;
    },

    async evaluateRules(context) {
      return evaluateAlertRules(client, context);
    },
  };
}
