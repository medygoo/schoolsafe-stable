// SchoolSafe M1.1 — Native School Settings Service (PostgreSQL via RPC)
// Replaces Supabase-based school/service.ts for "Mon école" screen.
// All queries use withRequestContext; school_id comes from session only.
// No direct table access: uses SECURITY DEFINER RPCs api.school_settings_read/update.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";
import type { UpdateSchoolSettingsPayload } from "./schema.js";

export interface SchoolNativeService {
  getSettings(context: RequestContext): Promise<Record<string, unknown>>;
  updateSettings(context: RequestContext, payload: UpdateSchoolSettingsPayload): Promise<Record<string, unknown>>;
}

export function createSchoolNativeService(businessPool: BusinessPool): SchoolNativeService {
  return {
    async getSettings(context: RequestContext): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.school_settings_read() as result");
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async updateSettings(context: RequestContext, payload: UpdateSchoolSettingsPayload): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select api.school_settings_update($1::jsonb) as result",
          [JSON.stringify(payload)],
        );
        return r.rows[0].result as Record<string, unknown>;
      });
    },
  };
}