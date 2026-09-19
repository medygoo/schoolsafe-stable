import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { extractBearerToken } from "../auth/session.js";
import type { SecurityService } from "./service.js";
import { securityScanSchema, lockdownSchema } from "./schema.js";
import { requirePermission } from "../access/guard.js";
import type { AccessService } from "../access/service.js";
import type { EventService } from "../events/service.js";
import type { AuditService } from "../audit/service.js";

export type ResolveProfileAndSchool = (token: string) => Promise<{ profileId: string | null; schoolId: string | null }>;

export type SecurityRouteDependencies = {
  service: SecurityService;
  resolveProfileAndSchool: ResolveProfileAndSchool;
  access: AccessService;
  eventService?: EventService;
  audit?: AuditService;
};

export function registerSecurityRoutes(app: FastifyInstance, dependencies: SecurityRouteDependencies): void {
  app.post(
    "/security/scan",
    { preHandler: [requirePermission(dependencies.access, "security.scan")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      let token: string;
      try {
        token = extractBearerToken(request.headers.authorization);
      } catch {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
      }

      const { profileId, schoolId } = await dependencies.resolveProfileAndSchool(token);
      if (!profileId) {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Profil non trouvé", false);
      }

      const parsed = securityScanSchema.parse(request.body);
      const inScope = await dependencies.access.hasScope(token, "assigned_portal", parsed.location_id);
      if (!inScope) {
        if (dependencies.audit && schoolId) {
          await dependencies.audit.insert({
            schoolId,
            actorProfileId: profileId,
            eventType: "access.denied",
            payload: {
              permission: "security.scan",
              resource_type: "security.scan",
              resource_id: parsed.location_id,
              reason: "SCOPE_DENIED",
              scope_type: "assigned_portal",
              scope_id: parsed.location_id,
            },
          });
        }
        throw new SchoolSafeError(403, "SCOPE_DENIED", "Portail non assigné", false);
      }

      const result = await dependencies.service.scan({ ...parsed, scanned_by: profileId });
      return { data: result };
    },
  );

  app.post(
    "/security/lockdown",
    { preHandler: [requirePermission(dependencies.access, "security.lockdown.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      let token: string;
      try {
        token = extractBearerToken(request.headers.authorization);
      } catch {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
      }

      const { profileId } = await dependencies.resolveProfileAndSchool(token);
      if (!profileId) {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Profil non trouvé", false);
      }

      const parsed = lockdownSchema.parse(request.body);
      const result = await dependencies.service.setLockdown(parsed.active, profileId);
      return { data: result };
    },
  );

  app.get(
    "/security/events",
    { preHandler: [requirePermission(dependencies.access, "security.events.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const limit = Math.min(Math.max(Number((request.query as Record<string, string>).limit ?? "20"), 1), 100);
      const offset = Math.max(Number((request.query as Record<string, string>).offset ?? "0"), 0);
      const eventType = (request.query as Record<string, string>).event_type;
      const result = await dependencies.service.listEvents({ limit, offset, eventType });
      return { data: result.data, count: result.count };
    },
  );
}
