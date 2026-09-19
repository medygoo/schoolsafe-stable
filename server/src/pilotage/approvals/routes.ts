import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SchoolSafeError } from "../../http/errors.js";
import { extractBearerToken } from "../../auth/session.js";
import type { ApprovalService } from "./service.js";
import { createApprovalRequestSchema, decideApprovalSchema, listApprovalRequestsSchema } from "./schema.js";
import { requirePermission } from "../../access/guard.js";
import type { AccessService } from "../../access/service.js";

export type ResolveProfileAndSchool = (token: string) => Promise<{ profileId: string | null; schoolId: string | null }>;

export type ApprovalRouteDependencies = {
  service: ApprovalService;
  resolveProfileAndSchool: ResolveProfileAndSchool;
  access: AccessService;
};

export function registerApprovalRoutes(app: FastifyInstance, dependencies: ApprovalRouteDependencies): void {
  app.get(
    "/pilotage/approvals",
    { preHandler: [requirePermission(dependencies.access, "pilotage.approvals.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      let token: string;
      try {
        token = extractBearerToken(request.headers.authorization);
      } catch {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
      }

      const { schoolId } = await dependencies.resolveProfileAndSchool(token);
      if (!schoolId) {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "École non trouvée", false);
      }

      const query = listApprovalRequestsSchema.parse(request.query);
      const result = await dependencies.service.list(schoolId, query);
      return { data: result.data, count: result.count };
    },
  );

  app.post(
    "/pilotage/approvals",
    { preHandler: [requirePermission(dependencies.access, "pilotage.approvals.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      let token: string;
      try {
        token = extractBearerToken(request.headers.authorization);
      } catch {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
      }

      const { profileId, schoolId } = await dependencies.resolveProfileAndSchool(token);
      if (!profileId || !schoolId) {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Profil ou école non trouvé", false);
      }

      const parsed = createApprovalRequestSchema.parse(request.body);
      const result = await dependencies.service.create(schoolId, profileId, parsed);
      return { data: result };
    },
  );

  app.post(
    "/pilotage/approvals/:id/decide",
    { preHandler: [requirePermission(dependencies.access, "pilotage.approvals.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      let token: string;
      try {
        token = extractBearerToken(request.headers.authorization);
      } catch {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
      }

      const { profileId, schoolId } = await dependencies.resolveProfileAndSchool(token);
      if (!profileId || !schoolId) {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Profil ou école non trouvé", false);
      }

      const approvalId = (request.params as Record<string, string>).id;
      const parsed = decideApprovalSchema.parse(request.body);
      const result = await dependencies.service.decide(approvalId, schoolId, profileId, parsed);
      return { data: result };
    },
  );
}
