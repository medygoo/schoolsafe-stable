import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import type { AccessService } from "./service.js";
import type { ScopeTarget } from "./scope-resolvers.js";
import type { AuditService } from "../audit/service.js";

export interface PermissionScope {
  type: string;
  id?: string | null;
  /**
   * Cible métier optionnelle. Si fournie et que l'AccessService expose checkScope,
   * la vérification passe par les résolveurs métier ; sinon hasScope est utilisé.
   */
  target?: ScopeTarget;
}

export function extractBearerToken(header?: string): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

export type ResolveProfileAndSchool = (token: string) => Promise<{ profileId: string | null; schoolId: string | null }>;

export type PermissionAuditConfig = {
  service: AuditService;
  resolveProfileAndSchool: ResolveProfileAndSchool;
  resource: { type: string; id?: string | ((request: FastifyRequest) => string | undefined) };
};

export function requirePermission(
  access: AccessService,
  permissionCode: string,
  scope?: PermissionScope,
  audit?: PermissionAuditConfig,
): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
    }

    const allowed = await access.hasPermission(token, permissionCode);
    if (!allowed) {
      if (audit) {
        await recordAccessDenial(audit, request, token, permissionCode, "ACCESS_DENIED");
      }
      throw new SchoolSafeError(403, "ACCESS_DENIED", "Permission refusée", false);
    }

    if (scope) {
      const inScope =
        scope.target && access.checkScope
          ? await access.checkScope(token, scope.type, scope.target)
          : await access.hasScope(token, scope.type, scope.id ?? null);
      if (!inScope) {
        if (audit) {
          await recordAccessDenial(
            audit,
            request,
            token,
            permissionCode,
            "SCOPE_DENIED",
            { scope_type: scope.type, scope_id: scope.id ?? null },
          );
        }
        throw new SchoolSafeError(403, "SCOPE_DENIED", "Hors périmètre autorisé", false);
      }
    }
  };
}

async function recordAccessDenial(
  audit: PermissionAuditConfig,
  request: FastifyRequest,
  token: string,
  permissionCode: string,
  reason: "ACCESS_DENIED" | "SCOPE_DENIED",
  extraPayload: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { profileId, schoolId } = await audit.resolveProfileAndSchool(token);
    if (!profileId || !schoolId) return;
    const resourceId = typeof audit.resource.id === "function" ? audit.resource.id(request) : audit.resource.id;
    await audit.service.insert({
      schoolId,
      actorProfileId: profileId,
      eventType: "access.denied",
      payload: {
        permission: permissionCode,
        resource_type: audit.resource.type,
        resource_id: resourceId ?? null,
        reason,
        ...extraPayload,
      },
    });
  } catch (error) {
    console.error("[requirePermission] failed to record access denial audit event:", error);
    throw new SchoolSafeError(500, "AUDIT_UNAVAILABLE", "Service d'audit indisponible", true);
  }
}
