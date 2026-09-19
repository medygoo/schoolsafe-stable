// SchoolSafe — service Trial : statut de licence + porte d'application.
// La porte est fail-closed : pas de licence en base = accès refusé.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";

export type TrialStatus = {
  status: "active" | "grace" | "expired" | "converted" | "no_license";
  started_at?: string;
  expires_at?: string;
  grace_ends_at?: string;
  days_remaining?: number;
};

export function createTrialNativeService(businessPool: BusinessPool) {
  return {
    async readStatus(context: RequestContext): Promise<TrialStatus> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const result = await client.query<{ trial_status_read: TrialStatus }>(
          "select api.trial_status_read() as trial_status_read",
        );
        return result.rows[0].trial_status_read;
      });
    },

    async gateAllows(context: RequestContext): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const result = await client.query<{ allowed: boolean }>(
          "select iam.trial_gate($1) as allowed",
          [context.schoolId],
        );
        return result.rows[0].allowed === true;
      });
    },
  };
}

export type TrialNativeService = ReturnType<typeof createTrialNativeService>;
