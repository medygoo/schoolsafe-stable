import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SchoolSafeError } from "../../http/errors.js";
import { extractBearerToken } from "../../auth/session.js";
import type { FeeControlService } from "./service.js";
import {
  createFeeStructureSchema,
  createFeeControlCampaignSchema,
  createFeeControlScanSchema,
} from "./schema.js";
import { requirePermission } from "../../access/guard.js";
import type { AccessService } from "../../access/service.js";

export type ResolveProfileIdAndSchool = (token: string) => Promise<{ profileId: string | null; schoolId: string | null }>;

export type FeeControlRouteDependencies = {
  service: FeeControlService;
  resolveProfileAndSchool: ResolveProfileIdAndSchool;
  access: AccessService;
};

async function authenticate(request: FastifyRequest, resolve: ResolveProfileIdAndSchool) {
  let token: string;
  try {
    token = extractBearerToken(request.headers.authorization);
  } catch {
    throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
  }
  const { profileId, schoolId } = await resolve(token);
  if (!profileId || !schoolId) {
    throw new SchoolSafeError(401, "AUTH_REQUIRED", "Profil ou école non trouvé", false);
  }
  return { profileId, schoolId };
}

export function registerFeeControlRoutes(app: FastifyInstance, dependencies: FeeControlRouteDependencies): void {
  app.get(
    "/finance/fee-structures",
    { preHandler: [requirePermission(dependencies.access, "finance.fee.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const result = await dependencies.service.listFeeStructures(schoolId);
      return { data: result };
    },
  );

  app.post(
    "/finance/fee-structures",
    { preHandler: [requirePermission(dependencies.access, "finance.fee.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const parsed = createFeeStructureSchema.parse(request.body);
      const result = await dependencies.service.createFeeStructure(schoolId, profileId, parsed);
      return { data: result };
    },
  );

  app.get(
    "/finance/student-fees",
    { preHandler: [requirePermission(dependencies.access, "finance.fee.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const query = request.query as Record<string, string>;
      const result = await dependencies.service.listStudentFees(schoolId, {
        studentId: query.student_id,
        status: query.status,
      });
      return { data: result };
    },
  );

  app.get(
    "/finance/fee-control/campaigns",
    { preHandler: [requirePermission(dependencies.access, "finance.control.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const result = await dependencies.service.listCampaigns(schoolId);
      return { data: result };
    },
  );

  app.post(
    "/finance/fee-control/campaigns",
    { preHandler: [requirePermission(dependencies.access, "finance.control.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const parsed = createFeeControlCampaignSchema.parse(request.body);
      const result = await dependencies.service.createCampaign(schoolId, profileId, parsed);
      return { data: result };
    },
  );

  app.post(
    "/finance/fee-control/scans",
    { preHandler: [requirePermission(dependencies.access, "finance.control.scan")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const parsed = createFeeControlScanSchema.parse(request.body);
      const result = await dependencies.service.createScan(schoolId, profileId, parsed);
      return { data: result };
    },
  );
}
