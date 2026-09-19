// SchoolSafe — jonction Access_Law : contexte + permission avant toute action.
// La permission est vérifiée DANS la transaction contextualisée, par la base
// (api.check_access → iam.can_access) : le serveur ne décide jamais lui-même.
import type { PoolClient } from "pg";
import { SchoolSafeError } from "../http/errors.js";
import { withRequestContext, type RequestContext } from "./context.js";
import type { BusinessPool } from "./pool.js";

export type AccessTarget = {
  targetProfileId?: string | null;
  studentId?: string | null;
  classId?: string | null;
  subjectId?: string | null;
  portalId?: string | null;
  runtimeContext?: Record<string, unknown>;
};

export async function withAuthorizedContext<T>(
  pool: BusinessPool,
  context: RequestContext,
  permission: string,
  target: AccessTarget,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withRequestContext(pool, context, async (client) => {
    const allowed = await client.query<{ allowed: boolean }>(
      "select api.check_access($1, $2, $3, $4, $5, $6, $7) as allowed",
      [
        permission,
        target.targetProfileId ?? null,
        target.studentId ?? null,
        target.classId ?? null,
        target.subjectId ?? null,
        target.portalId ?? null,
        JSON.stringify(target.runtimeContext ?? {}),
      ],
    );
    if (allowed.rows[0]?.allowed !== true) {
      throw new SchoolSafeError(403, "PERMISSION_DENIED", "Permission refusée", false);
    }
    return fn(client);
  });
}
