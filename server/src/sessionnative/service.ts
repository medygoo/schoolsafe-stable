// SchoolSafe — paquet de session natif (lot 2.4) : profil + rôles +
// permissions + portées + liens, entièrement calculés en base sous Access_Law.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";

export type SessionBootstrap = {
  profile: { id: string; display_name: string };
  schoolId: string;
  school: { id: string; code: string; name: string };
  roles: string[];
  permissions: string[];
  scopes: { permission: string; type: string; target: string | null }[];
  childIds: string[];
  assignedClassIds: string[];
  assignedSubjectIds: string[];
  assignedPortalIds: string[];
  deniedPermissions: string[];
  deniedRules: {
    permission: string;
    source: "role" | "exception";
    originId: string;
    effect: "deny";
    scopeType: string;
    target: string | null;
    conditionCode: string | null;
    conditionParams: Record<string, unknown> | null;
    startsAt: string | null;
    endsAt: string | null;
  }[];
  permissionExceptions: {
    permission: string;
    effect: "allow" | "deny";
    reason: string;
    expires_at: string | null;
    scopes: { permission: string; type: string; target: string | null }[];
  }[];
  offline_policy: { max_offline_hours: number };
};

export function createSessionNativeService(businessPool: BusinessPool) {
  return {
    async readBootstrap(context: RequestContext): Promise<SessionBootstrap> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const result = await client.query<{ session_bootstrap: SessionBootstrap }>(
          "select api.session_bootstrap() as session_bootstrap",
        );
        return result.rows[0].session_bootstrap;
      });
    },
  };
}

export type SessionNativeService = ReturnType<typeof createSessionNativeService>;
