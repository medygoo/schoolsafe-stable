import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthVerifier } from "./session.js";

const serverAuthOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

export function createSupabaseAuthVerifier(
  supabaseUrl: string,
  anonKey: string,
): AuthVerifier {
  const client = createClient(supabaseUrl, anonKey, serverAuthOptions);

  return {
    async verify(token: string) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;

      return {
        userId: data.user.id,
        ...(data.user.email ? { email: data.user.email } : {}),
      };
    },
  };
}

export function createUserContextClient(
  supabaseUrl: string,
  anonKey: string,
  token: string,
): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    ...serverAuthOptions,
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
