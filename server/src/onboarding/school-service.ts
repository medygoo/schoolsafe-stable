import type { AuthDatabase } from "../authnative/service.js";
import { hashSessionToken } from "../authnative/tokens.js";
import { SchoolSafeError } from "../http/errors.js";
import { onboardingSchoolSchema } from "./school-schema.js";
export interface OnboardingIdentity { first_name: string; last_name: string; email: string; phone: string; status: "approved" }
export interface OnboardingSchoolResult { school_id: string; profile_id: string; status: "completed" }
const unavailable = () => new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Service temporairement indisponible", true);
export function createOnboardingSchoolService(db: AuthDatabase) {
  return {
    async me(token: string): Promise<OnboardingIdentity | null> {
      try {
        const result = await db.query<{result: OnboardingIdentity | null}>(
          "select api.auth_resolve_onboarding_session($1) result", [hashSessionToken(token)]);
        const row = result.rows[0]?.result;
        return row?.status === "approved" ? {first_name: row.first_name, last_name: row.last_name,
          email: row.email, phone: row.phone, status: "approved"} : null;
      } catch { throw unavailable(); }
    },
    async logout(token: string): Promise<void> {
      try { await db.query("select api.auth_revoke_onboarding_session($1)", [hashSessionToken(token)]); }
      catch { throw unavailable(); }
    },
    async createSchool(token: string, input: unknown): Promise<OnboardingSchoolResult> {
      const payload = onboardingSchoolSchema.parse(input);
      try {
        const result = await db.query<{result: OnboardingSchoolResult}>(
          "select api.account_onboarding_create_school($1,$2::jsonb) result", [hashSessionToken(token), JSON.stringify(payload)]);
        const row = result.rows[0]?.result;
        if (!row || row.status !== "completed") throw unavailable();
        return {school_id: row.school_id, profile_id: row.profile_id, status: row.status};
      } catch (error) {
        const code = (error as {code?: string})?.code;
        if (code === "42501") throw new SchoolSafeError(403, "ACCESS_DENIED", "Session indisponible", false);
        if (["23514", "22007", "22008"].includes(code ?? "")) throw new SchoolSafeError(400, "VALIDATION_INVALID", "Donnée invalide", false);
        throw unavailable();
      }
    },
  };
}
export type OnboardingSchoolService = ReturnType<typeof createOnboardingSchoolService>;
