import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withAuthorizedContext } from "../db/access.js";
import type { RequestContext } from "../db/context.js";
import { SchoolSafeError } from "../http/errors.js";

export type AccessPageInput = { query: string; limit: number; offset: number };
export type AccessProfile = { id: string; display_name: string; is_active: boolean; account_status: string };
export type AccessRole = { id: string; code: string; label: string; is_active: boolean; delegatable: boolean };
export type RoleChange = { roleId: string; action: "assign" | "revoke"; revision: string; reason: string; confirmed: true };
export type RoleChangeResult = { schoolId: string; profileId: string; roleId: string; revision: string; changed: boolean };
export type RoleCreate = { label: string; templateId: string | null; revision: string; reason: string; confirmed: true };
export type RoleComposition = { label: string; isActive: boolean; grants: { permission: string; effect: "allow" | "deny"; scope?: string }[]; revision: string; reason: string; confirmed: true };
export type AccessRoleDetail = { schoolId: string; revision: string; role: AccessRole; grants: (Pick<AccessGrant, "permission" | "effect" | "is_active" | "starts_at" | "ends_at" | "scopes"> & { conditions: string[] })[] };
export type AccessPage<T> = { schoolId: string; rows: T[]; total: number; limit: number; offset: number };
type Validity = { is_active: boolean; starts_at: string; ends_at: string | null };
export type AccessScope = Validity & { type: string; target: string | null };
export type AccessGrant = Validity & {
  id: string; role_id: string; permission: string; permission_active: boolean;
  effect: "allow" | "deny"; scopes: AccessScope[];
  conditions: { code: string; is_active: boolean }[];
};
export type AccessProfileDetail = {
  schoolId: string; revision: string; profile: AccessProfile;
  roles: (Omit<AccessRole, "delegatable"> & { assignment: Validity })[];
  grants: AccessGrant[];
  exceptions: (Validity & {
    id: string; permission: string; permission_active: boolean;
    effect: "allow" | "deny"; condition_code: string | null; scopes: AccessScope[];
  })[];
};

export function createAccessNativeService(pool: BusinessPool) {
  async function read<T>(context: RequestContext, sql: string, params: unknown[]): Promise<T> {
    try {
      // No targetProfileId here: even consulting oneself requires school-level management.
      return await withAuthorizedContext(pool, context, "roles.manage", {}, async (client: PoolClient) => {
        const result = await client.query<{ data: T }>(sql, params);
        if (!result.rows.length) throw new Error("Missing access projection");
        return result.rows[0].data;
      });
    } catch (error) {
      // Includes a context/permission revoked between the first check and the RPC.
      if ((error as { code?: string }).code === "42501") {
        throw new SchoolSafeError(403, "PERMISSION_DENIED", "Accès refusé", false);
      }
      if ((error as { code?: string }).code === "40001") {
        throw new SchoolSafeError(409, "VERSION_CONFLICT", "Les accès ont changé. Actualisez et confirmez à nouveau.", false);
      }
      if ((error as { code?: string }).code === "P0002") {
        throw new SchoolSafeError(404, "NOT_FOUND", "Profil ou rôle introuvable dans cette école", false);
      }
      if ((error as { code?: string }).code === "22023") {
        throw new SchoolSafeError(400, "VALIDATION_INVALID", "Modification invalide", false);
      }
      if ((error as { code?: string }).code === "P0001" && (error as Error).message === "LAST_ACCESS_ADMIN") {
        throw new SchoolSafeError(409, "VERSION_CONFLICT", "Un administrateur actif doit conserver la gestion des accès.", false);
      }
      throw error;
    }
  }
  return {
    listProfiles(context: RequestContext, input: AccessPageInput) {
      return read<AccessPage<AccessProfile>>(context, "select api.access_profiles_list($1, $2, $3) as data", [input.query, input.limit, input.offset]);
    },
    listRoles(context: RequestContext, input: AccessPageInput) {
      return read<AccessPage<AccessRole>>(context, "select api.access_roles_list($1, $2, $3) as data", [input.query, input.limit, input.offset]);
    },
    readProfile(context: RequestContext, profileId: string) {
      return read<AccessProfileDetail | null>(context, "select api.access_profile_read($1) as data", [profileId]);
    },
    readRole(context: RequestContext, roleId: string) {
      return read<AccessRoleDetail | null>(context, "select api.access_role_read($1) as data", [roleId]);
    },
    changeRole(context: RequestContext, profileId: string, input: RoleChange) {
      return read<RoleChangeResult>(context, "select api.access_role_assign($1,$2,$3,$4,$5,$6) as data",
        [profileId, input.roleId, input.action, input.revision, input.reason, input.confirmed]);
    },
    roleEditor(context: RequestContext, roleId: string | null) {
      return read<Record<string, unknown> | null>(context, "select api.access_role_editor($1) as data", [roleId]);
    },
    createRole(context: RequestContext, input: RoleCreate) {
      return read<{ schoolId: string; roleId: string; revision: string }>(context, "select api.access_role_create($1,$2,$3,$4,$5) as data",
        [input.label, input.templateId, input.revision, input.reason, input.confirmed]);
    },
    saveRole(context: RequestContext, roleId: string, input: RoleComposition) {
      return read<{ schoolId: string; roleId: string; revision: string }>(context, "select api.access_role_save($1,$2,$3,$4,$5,$6,$7) as data",
        [roleId, input.label, input.isActive, JSON.stringify(input.grants), input.revision, input.reason, input.confirmed]);
    },
  };
}
export type AccessNativeService = ReturnType<typeof createAccessNativeService>;
