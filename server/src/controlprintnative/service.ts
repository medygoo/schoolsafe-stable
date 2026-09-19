// SchoolSafe Control — service d'impression de cartes côté serveur SchoolSafe.
// Deux chemins strictement séparés :
//   - humain : withRequestContext (session) — soumission et suivi côté école ;
//   - machine : le callback Control signé HMAC s'exécute via withControlAuthority
//     (db/control-authority.ts) qui fournit le client ; jamais de profileId.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";
import { pushCardPrintRequest, type ControlAppConfig } from "../control-app/client.js";

export interface CardPrintRequestProjection {
  id: string;
  school_id: string;
  student_id: string;
  student_name: string;
  class_name: string;
  academic_year: string;
  status: string;
  format: string;
  is_duplicate: boolean;
  created_at: string;
  printed_at?: string;
}

export function createControlPrintNativeService(
  businessPool: BusinessPool,
  controlConfig?: ControlAppConfig,
) {
  return {
    /** Envoyer une demande d'impression à Control App (utilisateur école) */
    async submitPrintRequest(context: RequestContext, input: {
      student_id: string;
      student_name: string;
      class_name: string;
      academic_year: string;
      front_key: string;
      back_key: string;
      front_signed_url: string;
      back_signed_url: string;
      signed_url_expires_at: string;
      format: "badge" | "carte";
      is_duplicate?: boolean;
      metadata?: Record<string, unknown>;
    }): Promise<{ id: string } | null> {
      if (!controlConfig) return null;

      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ school_id: string }>(
          "select iam.current_school_id() as school_id",
        );
        const schoolId = r.rows[0]?.school_id;
        if (!schoolId) return null;

        return pushCardPrintRequest(controlConfig, {
          school_id: schoolId,
          student_id: input.student_id,
          student_name: input.student_name,
          class_name: input.class_name,
          academic_year: input.academic_year,
          front_key: input.front_key,
          back_key: input.back_key,
          front_signed_url: input.front_signed_url,
          back_signed_url: input.back_signed_url,
          signed_url_expires_at: input.signed_url_expires_at,
          format: input.format,
          version: 1,
          is_duplicate: input.is_duplicate ?? false,
          metadata: input.metadata,
        });
      });
    },

    /** Liste des demandes d'impression de l'école (utilisateur école) */
    async listPrintRequests(context: RequestContext, limit = 50, offset = 0): Promise<CardPrintRequestProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<CardPrintRequestProjection>(
          `select id, school_id, student_id, student_name, class_name,
                  academic_year, status, format, is_duplicate, created_at, printed_at
           from app.card_print_requests
           where school_id = iam.current_school_id()
           order by created_at desc
           limit $1 offset $2`,
          [limit, offset],
        );
        return r.rows;
      });
    },

    /** Résolution élève pour l'impression rapide (utilisateur école) */
    async getStudentForQuickPrint(context: RequestContext, studentId: string): Promise<{ student_name: string; class_name: string } | null> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ student_name: string; class_name: string }>(
          `select s.first_name || ' ' || s.last_name as student_name,
                  c.name as class_name
           from app.students s
           left join app.classes c on c.id = s.class_id
           where s.id = $1 and s.school_id = iam.current_school_id()`,
          [studentId],
        );
        return r.rows[0] ?? null;
      });
    },

    /**
     * Appliquer un statut depuis Control App — s'exécute UNIQUEMENT sur le
     * client machine fourni par withControlAuthority (callback signé HMAC).
     */
    async applyStatusFromControl(client: PoolClient, input: {
      print_request_id: string;
      status: "pending" | "submitted" | "printed" | "failed";
      control_app_reference?: string;
      error_message?: string;
    }): Promise<boolean> {
      const r = await client.query<{ card_print_request_update_status: boolean }>(
        "select api.card_print_request_update_status($1, $2, $3, $4) as card_print_request_update_status",
        [input.print_request_id, input.status, input.control_app_reference ?? null, input.error_message ?? null],
      );
      return r.rows[0]?.card_print_request_update_status === true;
    },
  };
}

export type ControlPrintNativeService = ReturnType<typeof createControlPrintNativeService>;
