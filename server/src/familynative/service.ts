// SchoolSafe Familles — service natif PostgreSQL (VPS).
// Cycle des accrédités externes à la récupération (spec V05–V11) :
// demande du principal, validation scolaire avec photo et slot borné,
// retrait à effet immédiat, liste des deux groupes pour le gardien.
// Toute requête s'exécute dans withRequestContext ; le serveur transporte
// la session, il ne recalcule jamais les permissions.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";

export function createFamilyNativeService(businessPool: BusinessPool) {
  return {
    async pickupAuthorizationRequest(context: RequestContext, input: {
      student_id: string;
      guardian_id: string;
      reason?: string;
      starts_on?: string;
      ends_on?: string;
    }): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select api.pickup_authorization_request($1, $2, $3, $4, $5) as result",
          [input.student_id, input.guardian_id, input.reason ?? null, input.starts_on ?? null, input.ends_on ?? null],
        );
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async pickupAuthorizationValidate(context: RequestContext, authorizationId: string): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.pickup_authorization_validate($1) as result", [authorizationId]);
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async pickupAuthorizationRevoke(context: RequestContext, input: {
      authorization_id: string;
      reason?: string;
      mode?: "revoked" | "suspended";
    }): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select api.pickup_authorization_revoke($1, $2, $3) as result",
          [input.authorization_id, input.reason ?? null, input.mode ?? "revoked"],
        );
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async pickupAuthorizationList(context: RequestContext, studentId: string): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.pickup_authorization_list($1) as result", [studentId]);
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    // V16/R16-R17 : confirmation de remise transactionnelle (gardien).
    async pickupConfirm(context: RequestContext, input: {
      student_id: string;
      guardian_id: string;
      request_key: string;
      note?: string;
    }): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select api.pickup_confirm($1, $2, $3, $4, $5) as result",
          [input.student_id, input.guardian_id, context.profileId, input.request_key, input.note ?? null],
        );
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    // V12/T04 : transfert atomique du responsable principal (école habilitée).
    async familyPrimaryTransfer(context: RequestContext, input: {
      student_id: string;
      new_guardian_id: string;
      reason: string;
    }): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select api.family_primary_transfer($1, $2, $3) as result",
          [input.student_id, input.new_guardian_id, input.reason],
        );
        return r.rows[0].result as Record<string, unknown>;
      });
    },
  };
}

export type FamilyNativeService = ReturnType<typeof createFamilyNativeService>;