import { SchoolSafeError } from "../http/errors.js";
import type { AuthDatabase } from "./service.js";
import { createSupabasePrincipalVerifier, type SupabasePrincipalIdentity } from "./supabase-verifier.js";

export type SupabasePrincipalVerifier = (token: string) => Promise<SupabasePrincipalIdentity | null>;

export type SupabaseExchangeResult =
  | { status: "onboarding_required" }
  | { status: "password_change_required" }
  | { status: "profile_resolved"; profileId: string; schoolId: string }
  | { status: "profile_choice_required"; profiles: Array<{ profileId: string; schoolId: string }> };

export function verifierFromEnv(): SupabasePrincipalVerifier | undefined {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return undefined;
  return createSupabasePrincipalVerifier(url, anonKey);
}

export async function exchangeSupabasePrincipal(
  db: AuthDatabase | undefined,
  verifier: SupabasePrincipalVerifier | undefined,
  token: string,
): Promise<SupabaseExchangeResult> {
  if (!db || !verifier) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
  const identity = await verifier(token);
  if (!identity) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
  try {
    const result = await db.query<{
      user_id: string;
      created: boolean;
      profile_id: string | null;
      school_id: string | null;
    }>(
      "select user_id, created, profile_id, school_id from api.auth_link_supabase_principal($1, $2, $3)",
      [identity.id, identity.email, identity.phone],
    );
    const profiles = result.rows.filter((row) => row.profile_id !== null && row.school_id !== null);
    if (profiles.length === 0) return { status: "onboarding_required" };
    const gate = await db.query<{ pending: boolean }>(
      "select api.auth_supabase_password_pending($1) as pending",
      [profiles[0].user_id],
    );
    if (gate.rows[0]?.pending === true) return { status: "password_change_required" };
    if (profiles.length === 1) {
      return {
        status: "profile_resolved",
        profileId: profiles[0].profile_id as string,
        schoolId: profiles[0].school_id as string,
      };
    }
    return {
      status: "profile_choice_required",
      profiles: profiles.map((row) => ({
        profileId: row.profile_id as string,
        schoolId: row.school_id as string,
      })),
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") throw new SchoolSafeError(409, "VERSION_CONFLICT", "Conflit d'identité", false);
    if (code === "23514" || code === "22023") throw new SchoolSafeError(400, "VALIDATION_INVALID", "Donnée invalide", false);
    throw error;
  }
}
