import { createClient } from "@supabase/supabase-js";

export class IdentityConflict extends Error {
  constructor() {
    super("IDENTITY_CONFLICT");
    this.name = "IdentityConflict";
  }
}

export type ExternalIdentityAdmin = {
  createUser(input: { email: string; phone: string; password: string }): Promise<{ id: string }>;
  deleteUser(id: string): Promise<boolean>;
};

function isConflict(error: { status?: number; code?: string; message?: string }): boolean {
  const message = error.message ?? "";
  return error.status === 409
    || error.status === 422
    || /already|duplicate|exists/i.test(`${error.code ?? ""} ${message}`);
}

export function verifySupabaseSubject(url: string, anonKey: string): (token: string) => Promise<{ id: string; email: string } | null> {
  return async (token) => {
    const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = await response.json() as { id?: string; email?: string };
    if (!body.id || !body.email) return null;
    return { id: body.id, email: body.email.trim().toLowerCase() };
  };
}

export function createSupabaseIdentityAdmin(url: string, serviceRoleKey: string): ExternalIdentityAdmin {
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    async createUser(input) {
      const { data, error } = await client.auth.admin.createUser({
        email: input.email,
        phone: input.phone,
        password: input.password,
        email_confirm: true,
        phone_confirm: true,
      });
      if (error) {
        if (isConflict(error)) throw new IdentityConflict();
        throw new Error("SUPABASE_CREATE_FAILED");
      }
      if (!data.user?.id) throw new Error("SUPABASE_CREATE_FAILED");
      return { id: data.user.id };
    },
    async deleteUser(id) {
      const { error } = await client.auth.admin.deleteUser(id);
      return !error;
    },
  };
}
