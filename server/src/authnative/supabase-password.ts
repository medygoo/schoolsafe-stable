import { SchoolSafeError } from "../http/errors.js";
import type { AuthDatabase } from "./service.js";
import type { SupabasePrincipalVerifier } from "./supabase-exchange.js";
import { z } from "zod";

const changeSchema = z.object({
  new_password: z.string().min(1).max(128),
}).strict();

export type SupabasePasswordUpdate = "changed" | "rejected" | "unavailable";

export type SupabasePasswordUpdater = (token: string, nextPassword: string) => Promise<SupabasePasswordUpdate>;

export function supabasePasswordUpdaterFromEnv(): SupabasePasswordUpdater {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return async () => "unavailable";
  }
  return (token, nextPassword) => updateSupabasePassword(url, anonKey, token, nextPassword);
}

export async function updateSupabasePassword(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  nextPassword: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SupabasePasswordUpdate> {
  try {
    const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: nextPassword }),
    });
    if (response.ok) return "changed";
    if (response.status >= 500) return "unavailable";
    return "rejected";
  } catch {
    return "unavailable";
  }
}

export async function changeSupabasePrincipalPassword(
  db: AuthDatabase | undefined,
  verifier: SupabasePrincipalVerifier | undefined,
  updater: SupabasePasswordUpdater,
  token: string,
  input: unknown,
): Promise<{ status: "password_changed"; password_change_required: false; reauthenticate: true }> {
  if (!db || !verifier) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
  const identity = await verifier(token);
  if (!identity) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
  const payload = changeSchema.parse(input);
  const pending = await db.query<{ pending: boolean }>(
    "select api.auth_supabase_password_pending_subject($1) as pending",
    [identity.id],
  );
  if (pending.rows[0]?.pending !== true) {
    throw new SchoolSafeError(403, "ACCESS_DENIED", "Changement indisponible", false);
  }
  const updated = await updater(token, payload.new_password);
  if (updated !== "changed") {
    throw new SchoolSafeError(
      updated === "unavailable" ? 503 : 400,
      updated === "unavailable" ? "DEPENDENCY_UNAVAILABLE" : "VALIDATION_INVALID",
      updated === "unavailable" ? "Service temporairement indisponible" : "Donnée invalide",
      updated === "unavailable",
    );
  }
  const cleared = await db.query<{ cleared: boolean }>(
    "select api.auth_supabase_clear_password_change($1) as cleared",
    [identity.id],
  );
  if (cleared.rows[0]?.cleared !== true) {
    throw new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Service temporairement indisponible", true);
  }
  return { status: "password_changed", password_change_required: false, reauthenticate: true };
}
