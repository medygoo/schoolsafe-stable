import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventService, SchoolSafeEvent, EmitOptions, EmitResult, EventServiceOptions } from "./types.js";

export type { EventService } from "./types.js";

export function createEventService(client: SupabaseClient, options?: EventServiceOptions): EventService {
  return {
    async emit(event, emitOptions): Promise<EmitResult> {
      const { data, error } = await client
        .from("system_events")
        .insert({
          school_id: event.schoolId,
          event_type: event.type,
          entity_type: event.entityType ?? null,
          entity_id: event.entityId ?? null,
          user_id: event.userId ?? null,
          payload: event.payload,
          status: "pending",
        })
        .select("id, status")
        .single();
      if (error || !data) {
        throw new Error(`Failed to emit event: ${error?.message ?? "unknown"}`);
      }
      if (emitOptions?.dispatchImmediately && options?.dispatcher) {
        await options.dispatcher.dispatch({ ...event, id: data.id as string });
      }
      return { id: data.id as string, status: data.status as string };
    },
  };
}
