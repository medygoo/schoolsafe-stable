import { controlUnavailable } from "../authnative/control-client.js";
import type { AuthDatabase } from "../authnative/service.js";
import type { SupabasePrincipalVerifier } from "../authnative/supabase-exchange.js";
import { SchoolSafeError } from "../http/errors.js";
import { onboardingSchoolSchema } from "./school-schema.js";

export type SupabaseSchoolResult = {
  school_id: string;
  profile_id: string;
  status: "completed";
  school_created: true;
  principal_profile_created: true;
  must_change: boolean;
};

export async function createSupabasePrincipalSchool(
  db: AuthDatabase | undefined,
  verifier: SupabasePrincipalVerifier | undefined,
  token: string,
  input: unknown,
): Promise<SupabaseSchoolResult> {
  if (!db || !verifier) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
  const identity = await verifier(token);
  if (!identity) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
  const payload = onboardingSchoolSchema.parse(input);
  try {
    const result = await db.query<{ result: SupabaseSchoolResult & { user_id: string; role: string } }>(
      "select api.auth_supabase_principal_create_school($1, $2::jsonb) result",
      [identity.id, JSON.stringify(payload)],
    );
    const row = result.rows[0]?.result;
    if (!row || row.status !== "completed" || row.school_created !== true || row.principal_profile_created !== true || row.role !== "admin") {
      throw controlUnavailable();
    }
    return {
      school_id: row.school_id,
      profile_id: row.profile_id,
      status: "completed",
      school_created: true,
      principal_profile_created: true,
      must_change: row.must_change === true,
    };
  } catch (error) {
    if (error instanceof SchoolSafeError) throw error;
    const code = (error as { code?: string }).code;
    if (code === "23505") throw new SchoolSafeError(409, "VERSION_CONFLICT", "École déjà rattachée", false);
    if (code === "42501") throw new SchoolSafeError(403, "ACCESS_DENIED", "Session invalide ou expirée", false);
    if (code === "23514" || code === "22023" || code === "22007" || code === "22008") {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Donnée invalide", false);
    }
    throw error;
  }
}
