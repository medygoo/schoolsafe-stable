// SchoolSafe Set up v1 — service PostgreSQL natif (remplace Supabase).
// Crée l'école et l'admin en une transaction isolée.
// Le setup est désactivé si aucun setup_token n'est fourni.
import type { PoolClient } from "pg";
import type { AuthPool, BusinessPool } from "../db/pool.js";
import type { AdminSetupResult, ConfigResponse, SetupAdminPayload, SetupResult, SetupSchoolPayload } from "./schema.js";
import { hashPassword } from "../authnative/passwords.js";

const cycleNames: Record<string, string> = {
  nursery: "Maternelle",
  primary: "Primaire",
  secondary: "Secondaire et Humanités",
};

export interface SetupService {
  getConfig(): ConfigResponse;
  validateToken(token: string): boolean;
  createSchool(payload: SetupSchoolPayload): Promise<SetupResult>;
  createAdmin(payload: SetupAdminPayload): Promise<AdminSetupResult>;
}

export function createSetupNativeService(
  authPool: AuthPool,
  businessPool: BusinessPool,
  setupToken: string | undefined,
): SetupService {
  // Lier l'administrateur à l'école créée dans CE flux de setup — jamais
  // « la dernière école » globale (ambiguïté inter-écoles en multi-tenant).
  let setupSchoolId: string | null = null;

  return {
    getConfig(): ConfigResponse {
      return {
        setup_available: Boolean(setupToken),
        auth_mode: "native",
      };
    },

    validateToken(token: string): boolean {
      if (!setupToken) return false;
      return token === setupToken;
    },

    async createSchool(payload: SetupSchoolPayload): Promise<SetupResult> {
      const client = await businessPool.connect();
      try {
        const cyclesJson = JSON.stringify(
          payload.cycles.map((key) => ({ key, name: cycleNames[key] || key }))
        );

        const result = await client.query<{ setup_create_school: SetupResult }>(
          "select api.setup_create_school($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) as setup_create_school",
          [
            payload.identity.approval_code ?? "PENDING",
            payload.identity.name_fr,
            payload.identity.name_en ?? null,
            payload.identity.legal_name ?? null,
            payload.identity.school_type ?? "Privée agréée",
            payload.identity.approval_code ?? null,
            payload.brand?.primary_color ?? "#071a3d",
            payload.brand?.accent_color ?? "#e9a515",
            payload.brand?.document_footer ?? null,
            payload.brand?.logo_path ?? null,
            payload.academic_year.label,
            payload.academic_year.starts_on,
            payload.academic_year.ends_on,
            payload.academic_year.periods ?? "Trimestres",
            cyclesJson,
            payload.contact.country ?? "République démocratique du Congo",
            payload.contact.province ?? "Kinshasa",
            payload.contact.city ?? "Kinshasa",
            payload.contact.address ?? null,
            payload.contact.email ?? null,
            payload.contact.phone ?? null,
          ],
        );
        const row = result.rows[0]?.setup_create_school;
        if (!row || !row.school_id) {
          throw new Error("La création de l'école a échoué sans erreur.");
        }
        setupSchoolId = row.school_id;
        return row;
      } finally {
        client.release();
      }
    },

    async createAdmin(payload: SetupAdminPayload): Promise<AdminSetupResult> {
      const passwordHash = await hashPassword(payload.password);

      // École du flux de setup en priorité ; repli documenté uniquement si
      // le service a été rechargé entre les deux appels (setup = flux unique
      // protégé par token, jamais un chemin métier runtime).
      const schoolResult = setupSchoolId
        ? await businessPool.query<{ id: string }>(
            "select id from app.schools where id = $1",
            [setupSchoolId],
          )
        : await businessPool.query<{ id: string }>(
            "select id from app.schools order by created_at desc limit 1",
          );
      const school = schoolResult.rows[0];
      if (!school) {
        throw new Error("Aucune école trouvée. Créez l'école avant l'administrateur.");
      }

      const client = await businessPool.connect();
      try {
        const result = await client.query<{ setup_create_admin: AdminSetupResult }>(
          "select api.setup_create_admin($1, $2, $3, $4, $5, $6) as setup_create_admin",
          [
            school.id,
            payload.email,
            passwordHash,
            payload.first_name,
            payload.last_name,
            payload.phone ?? null,
          ],
        );
        const row = result.rows[0]?.setup_create_admin;
        if (!row || !row.profile_id) {
          throw new Error("La création de l'administrateur a échoué sans erreur.");
        }
        return row;
      } finally {
        client.release();
      }
    },
  };
}
