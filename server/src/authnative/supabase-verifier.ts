import { createClient } from "@supabase/supabase-js";

// Vérifie un access token auprès de GoTrue. Le décodage local du JWT ne suffit pas.
const serverAuthOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

export type SupabasePrincipalIdentity = {
  id: string;
  email: string;
  phone: string | null;
};

type GoTrueUser = {
  id?: string;
  email?: string | null;
  phone?: string | null;
  email_confirmed_at?: string | null;
};

export type SupabasePrincipalClient = {
  auth: {
    getUser: (jwt: string) => Promise<{ data: { user: GoTrueUser | null }; error: unknown }>;
  };
};

export function createSupabasePrincipalVerifier(
  supabaseUrl: string,
  anonKey: string,
  createUserClient: (url: string, key: string) => SupabasePrincipalClient = (url, key) =>
    createClient(url, key, serverAuthOptions),
) {
  return async (token: string): Promise<SupabasePrincipalIdentity | null> => {
    const client = createUserClient(supabaseUrl, anonKey);
    const { data, error } = await client.auth.getUser(token);
    const user = data.user;
    if (error || !user?.id || !user.email || !user.email_confirmed_at) return null;
    return {
      id: user.id,
      email: user.email,
      phone: user.phone ?? null,
    };
  };
}
