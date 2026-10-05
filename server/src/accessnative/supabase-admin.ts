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
