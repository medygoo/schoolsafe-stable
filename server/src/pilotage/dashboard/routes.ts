import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SchoolSafeError } from "../../http/errors.js";
import { extractBearerToken } from "../../auth/session.js";
import type { DashboardService } from "./service.js";
import { requirePermission } from "../../access/guard.js";
import type { AccessService } from "../../access/service.js";

export type ResolveProfileIdAndSchool = (token: string) => Promise<{ profileId: string | null; schoolId: string | null }>;

export type DashboardRouteDependencies = {
  service: DashboardService;
  resolveProfileAndSchool: ResolveProfileIdAndSchool;
  access: AccessService;
};

export function registerDashboardRoutes(app: FastifyInstance, dependencies: DashboardRouteDependencies): void {
  app.get(
    "/pilotage/dashboard",
    { preHandler: [requirePermission(dependencies.access, "pilotage.dashboard.read")] },
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

      const result = await dependencies.service.load(schoolId);
      return { data: result };
    },
  );
}
