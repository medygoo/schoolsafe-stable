import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface AuditService {
  insert(event: {
    schoolId: string;
    actorProfileId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export type AuditEventInput = {
  event_type: string;
  actor_profile_id: string;
  target_profile_id?: string;
  payload: object;
  request_id?: string;
  success: boolean;
  reason?: string;
};

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createSupabaseAuditService(
  clientOrUrl: SupabaseClient | string,
  serviceRoleKey?: string,
): AuditService {
  const client = typeof clientOrUrl === "string" ? createServiceClient(clientOrUrl, serviceRoleKey!) : clientOrUrl;

  return {
    async insert(event) {
      const { error } = await client.from("audit_events").insert({
        school_id: event.schoolId,
        actor_profile_id: event.actorProfileId,
        event_type: event.eventType,
        payload: event.payload,
      });
      if (error) {
        throw new Error(`Failed to insert audit event ${event.eventType}: ${JSON.stringify(error)}`);
      }
    },
  };
}

/**
 * Insère un événement d'audit via la RPC `audit_event`.
 * Le champ `reason`, s'il est fourni, est fusionné dans le payload.
 */
export async function auditEvent(supabase: SupabaseClient, event: AuditEventInput): Promise<void> {
  const payload: Record<string, unknown> =
    event.reason === undefined ? { ...event.payload } : { ...event.payload, reason: event.reason };

  const { error } = await supabase.rpc("audit_event", {
    p_event_type: event.event_type,
    p_actor_profile_id: event.actor_profile_id,
    p_target_profile_id: event.target_profile_id ?? null,
    p_payload: payload,
    p_request_id: event.request_id ?? null,
    p_success: event.success,
  });

  if (error) {
    throw new Error(`Failed to record audit event ${event.event_type}: ${error.message}`);
  }
}
