import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { SchoolSafeError } from "../../http/errors.js";
import { extractBearerToken } from "../../auth/session.js";
import type { SnapshotService } from "./service.js";
import { requirePermission } from "../../access/guard.js";
import type { AccessService } from "../../access/service.js";

export type ResolveProfileAndSchool = (token: string) => Promise<{ profileId: string | null; schoolId: string | null }>;

export type SnapshotRouteDependencies = {
  service: SnapshotService;
  resolveProfileAndSchool: ResolveProfileAndSchool;
  access: AccessService;
};

const trendQuerySchema = z.object({
  indicator_code: z.string().min(1),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export function registerSnapshotRoutes(app: FastifyInstance, dependencies: SnapshotRouteDependencies): void {
  app.post(
    "/pilotage/snapshots/capture",
    { preHandler: [requirePermission(dependencies.access, "pilotage.dashboard.read")] },
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

      const result = await dependencies.service.capture(schoolId);
      return { data: result };
    },
  );

  app.get(
    "/pilotage/snapshots/trend",
    { preHandler: [requirePermission(dependencies.access, "pilotage.dashboard.read")] },
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

      const query = trendQuerySchema.parse(request.query);
      const result = await dependencies.service.getTrend(schoolId, query.indicator_code, query.days);
      return { data: result };
    },
  );
}
