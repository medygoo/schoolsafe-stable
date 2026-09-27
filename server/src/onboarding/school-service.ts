import type { AuthDatabase } from "../authnative/service.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { hashSessionToken, generateSessionToken } from "../authnative/tokens.js";
import { SchoolSafeError } from "../http/errors.js";
import { onboardingSchoolSchema } from "./school-schema.js";
export interface OnboardingIdentity { first_name: string; last_name: string; email: string | null; phone: string | null; status: "onboarding" }
export interface OnboardingSchoolResult { school_id: string; profile_id: string; status: "completed"; token: string }
const unavailable = () => new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Service temporairement indisponible", true);
const rateLimited = () => new SchoolSafeError(429, "RATE_LIMITED", "Trop de tentatives. Réessayez dans 15 minutes.", true);
export function createOnboardingSchoolService(db: AuthDatabase, activationCodeSha256?: string) {
  return {
    async me(token: string): Promise<OnboardingIdentity | null> {
      try {
        const result = await db.query<{result: OnboardingIdentity | null}>(
          "select api.auth_resolve_onboarding_session($1) result", [hashSessionToken(token)]);
        const row = result.rows[0]?.result;
        return row?.status === "onboarding" ? {first_name: row.first_name, last_name: row.last_name,
          email: row.email, phone: row.phone, status: "onboarding"} : null;
      } catch { throw unavailable(); }
    },
    async logout(token: string): Promise<void> {
      try { await db.query("select api.auth_revoke_onboarding_session($1)", [hashSessionToken(token)]); }
      catch { throw unavailable(); }
    },
    async createSchool(token: string, input: unknown): Promise<OnboardingSchoolResult> {
      const {activation_code, ...payload} = onboardingSchoolSchema.parse(input);
      if (!activationCodeSha256 || !/^[0-9a-f]{64}$/.test(activationCodeSha256)) throw unavailable();
      const expected = Buffer.from(activationCodeSha256, "hex");
      const supplied = createHash("sha256").update(activation_code, "utf8").digest();
      const matches = timingSafeEqual(supplied, expected);
      const tokenForSession = generateSessionToken();
      try {
        // SQL receives the authenticated session and comparison result only, never code material.
        const attempt = await db.query<{result: string}>(
          "select api.auth_record_activation_attempt($1,$2) result", [hashSessionToken(token), matches]);
        if (attempt.rows[0]?.result === "limited") throw rateLimited();
        if (!matches && attempt.rows[0]?.result === "denied") {
          throw new SchoolSafeError(403, "ACCESS_DENIED", "Code d’activation incorrect.", false);
        }
        if (!matches || attempt.rows[0]?.result !== "allowed") throw unavailable();
        const result = await db.query<{result: OnboardingSchoolResult}>(
          "select api.auth_activate_school($1,$2::jsonb,$3) result", [hashSessionToken(token), JSON.stringify(payload), hashSessionToken(tokenForSession)]);
        const row = result.rows[0]?.result;
        if (!row || row.status !== "completed") throw unavailable();
        return {school_id: row.school_id, profile_id: row.profile_id, status: row.status, token: tokenForSession};
      } catch (error) {
        if (error instanceof SchoolSafeError) throw error;
        const code = (error as {code?: string})?.code;
        if (code === "P0429") throw rateLimited();
        if (code === "42501") throw new SchoolSafeError(403, "ACCESS_DENIED", "Session invalide ou expirée", false);
        if (["23514", "22007", "22008"].includes(code ?? "")) throw new SchoolSafeError(400, "VALIDATION_INVALID", "Donnée invalide", false);
        throw unavailable();
      }
    },
  };
}
export type OnboardingSchoolService = ReturnType<typeof createOnboardingSchoolService>;
