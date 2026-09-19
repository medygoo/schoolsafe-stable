import { createUserContextClient } from "../auth/supabase.js";
import type { BootstrapResponse } from "./schema.js";

export interface BootstrapService {
  load(accessToken: string): Promise<BootstrapResponse | null>;
}

type QueryResult<T> = { data: T | null; error: unknown };

function assertQuery<T>(result: QueryResult<T>, label: string): T | null {
  if (result.error) {
    throw new Error(`Bootstrap query failed: ${label}`);
  }
  return result.data;
}

export function createBootstrapService(
  supabaseUrl: string,
  anonKey: string,
): BootstrapService {
  return {
    async load(accessToken: string) {
      const client = createUserContextClient(supabaseUrl, anonKey, accessToken);

      const profile = assertQuery(
        await client
          .from("profiles")
          .select("id,display_name,school_id")
          .maybeSingle(),
        "profile",
      ) as { id: string; display_name: string; school_id: string } | null;

      if (!profile) return null;

      const profileRoles = (assertQuery(
        await client.from("profile_roles").select("role_id"),
        "profile_roles",
      ) ?? []) as Array<{ role_id: string }>;
      const roleIds = profileRoles.map((row) => row.role_id);

      const roles = roleIds.length
        ? ((assertQuery(
            await client.from("roles").select("id,code").in("id", roleIds),
            "roles",
          ) ?? []) as Array<{ id: string; code: string }> )
        : [];

      const [allowedGrants, deniedGrants] = roleIds.length
        ? await Promise.all([
            assertQuery(
              await client
                .from("role_permission_grants")
                .select("permission_id")
                .in("role_id", roleIds)
                .eq("allowed", true),
              "role_permission_grants_allowed",
            ) ?? [],
            assertQuery(
              await client
                .from("role_permission_grants")
                .select("permission_id")
                .in("role_id", roleIds)
                .eq("allowed", false),
              "role_permission_grants_denied",
            ) ?? [],
          ])
        : [[], []];

      const deniedPermissionIds = new Set(
        (deniedGrants as Array<{ permission_id: string }>).map((row) => row.permission_id),
      );
      const effectivePermissionIds = [
        ...new Set(
          (allowedGrants as Array<{ permission_id: string }>)
            .map((row) => row.permission_id)
            .filter((id) => !deniedPermissionIds.has(id)),
        ),
      ];

      const permissions = effectivePermissionIds.length
        ? ((assertQuery(
            await client.from("permissions").select("id,code").in("id", effectivePermissionIds),
            "permissions",
          ) ?? []) as Array<{ id: string; code: string }> )
        : [];

      // Exceptions individuelles (profile_permission_exceptions), résolues par code :
      // - exception ALLOW active AJOUTE la permission (sauf si un DENY de rôle la couvre) ;
      // - exception DENY active la RETIRE (prioritaire sur ALLOW, cohérent avec has_permission SQL) ;
      // - exception expirée (expires_at passée) ignorée.
      // La table n'est pas forcément lisible en contexte utilisateur : en cas d'erreur,
      // on dégrade gracieusement vers les permissions de rôle seules.
      const exceptionsResult = await client
        .from("profile_permission_exceptions")
        .select("permission_code,allowed,expires_at");
      if (exceptionsResult.error) {
        console.error(
          "[bootstrap] profile_permission_exceptions unreadable, role permissions only:",
          (exceptionsResult.error as { message?: string }).message ?? exceptionsResult.error,
        );
      }
      const exceptions = (exceptionsResult.error ? [] : exceptionsResult.data ?? []) as Array<{
        permission_code: string;
        allowed: boolean;
        expires_at: string | null;
      }>;

      const now = Date.now();
      const activeExceptions = exceptions.filter(
        (row) => !row.expires_at || new Date(row.expires_at).getTime() > now,
      );
      const exceptionAllowCodes = new Set(
        activeExceptions.filter((row) => row.allowed).map((row) => row.permission_code),
      );
      const exceptionDenyCodes = new Set(
        activeExceptions.filter((row) => !row.allowed).map((row) => row.permission_code),
      );

      // Un DENY de rôle l'emporte même sur une exception ALLOW (cohérent avec has_permission SQL).
      let roleDeniedCodes = new Set<string>();
      if (deniedPermissionIds.size > 0 && exceptionAllowCodes.size > 0) {
        const deniedRows = (assertQuery(
          await client
            .from("permissions")
            .select("code")
            .in("id", [...deniedPermissionIds]),
          "permissions_denied",
        ) ?? []) as Array<{ code: string }>;
        roleDeniedCodes = new Set(deniedRows.map((row) => row.code));
      }

      const effectivePermissionCodes = new Set(permissions.map((row) => row.code));
      for (const code of exceptionAllowCodes) {
        if (!roleDeniedCodes.has(code) && !exceptionDenyCodes.has(code)) {
          effectivePermissionCodes.add(code);
        }
      }
      for (const code of exceptionDenyCodes) {
        effectivePermissionCodes.delete(code);
      }

      const scopes = (assertQuery(
        await client.from("scope_assignments").select("scope_type,scope_id,label"),
        "scope_assignments",
      ) ?? []) as Array<{ scope_type: string; scope_id: string | null; label: string | null }>;

      const school = assertQuery(
        await client.from("school").select("id,name,logo_path").eq("id", profile.school_id).maybeSingle(),
        "school",
      ) as { id: string; name: string; logo_path?: string | null } | null;
      if (!school) return null;

      const settings = assertQuery(
        await client
          .from("school_settings")
          .select("max_offline_hours")
          .eq("school_id", profile.school_id)
          .maybeSingle(),
        "school_settings",
      ) as { max_offline_hours: number } | null;

      return {
        contract_version: "1",
        profile: { id: profile.id, display_name: profile.display_name },
        roles: roles.map((row) => row.code).sort(),
        permissions: [...effectivePermissionCodes].sort(),
        // Contrat canonique transitoire {permission, type, target} : la table
        // legacy scope_assignments n'a pas de lien permission — permission: null
        // est explicite et le frontend les écarte (fail-closed, rien n'apparaît
        // à tort). INC-1/INC-2 : harmonisation transitoire documentée.
        scopes: scopes.map((row) => ({ permission: null, type: row.scope_type, target: row.scope_id, label: row.label })),
        school: { id: school.id, name: school.name, logo_path: school.logo_path ?? null },
        academic_year: null,
        features: [],
        offline_policy: { max_offline_hours: settings?.max_offline_hours ?? 24 },
      };
    },
  };
}
