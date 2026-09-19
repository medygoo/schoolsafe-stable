import { createUserContextClient } from "../auth/supabase.js";
import { createScopeResolver, type ScopeTarget } from "./scope-resolvers.js";

export interface AccessService {
  hasPermission(token: string, permissionCode: string): Promise<boolean>;
  hasScope(token: string, scopeType: string, scopeId?: string | null): Promise<boolean>;
  /**
   * Vérification de scope métier (own, own_children, assigned_classes, …).
   * Optionnelle : les consommateurs doivent retomber sur hasScope si absente.
   */
  checkScope?(token: string, scopeType: string, target?: ScopeTarget): Promise<boolean>;
  /** Vrai si le profil courant a au moins un lien tuteur (student_guardians). */
  hasGuardianLinks?(token: string): Promise<boolean>;
}

export function createSupabaseAccessService(
  supabaseUrl: string,
  anonKey: string,
): AccessService {
  const scopeResolver = createScopeResolver({
    createClient: (token: string) => createUserContextClient(supabaseUrl, anonKey, token),
  });

  return {
    async hasPermission(token: string, permissionCode: string) {
      const client = createUserContextClient(supabaseUrl, anonKey, token);
      const { data, error } = await client.rpc("has_permission", {
        permission_code: permissionCode,
      });
      if (error) {
        console.error(`[access] has_permission error for ${permissionCode}:`, error.message);
        return false;
      }
      return data === true;
    },

    async hasScope(token: string, scopeType: string, scopeId?: string | null) {
      const client = createUserContextClient(supabaseUrl, anonKey, token);
      const { data, error } = await client.rpc("has_scope", {
        requested_scope_type: scopeType,
        requested_scope_id: scopeId ?? null,
      });
      if (error) {
        console.error(`[access] has_scope error for ${scopeType}:`, error.message);
        return false;
      }
      return data === true;
    },

    async checkScope(token: string, scopeType: string, target?: ScopeTarget) {
      return scopeResolver.checkScope(token, scopeType, target ?? {});
    },

    async hasGuardianLinks(token: string) {
      return scopeResolver.hasGuardianLinks(token);
    },
  };
}
