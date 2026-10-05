import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";
import { SchoolSafeError } from "../http/errors.js";

export type SchoolAccessStatus = "active" | "suspended" | "revoked";

export type SchoolAccessReader = {
  read(context: RequestContext): Promise<SchoolAccessStatus | null>;
};

export function createSupabaseSchoolAccessReader(pool: BusinessPool): SchoolAccessReader {
  return {
    async read(context) {
      return withRequestContext(pool, context, async (client: PoolClient) => {
        const result = await client.query<{ status: string | null }>(
          "select api.supabase_school_access_read() as status",
        );
        const status = result.rows[0]?.status ?? null;
        if (status === null) return null;
        if (status === "active" || status === "suspended" || status === "revoked") return status;
        throw new SchoolSafeError(403, "LICENSE_INACTIVE", "Accès école indisponible", false);
      });
    },
  };
}
