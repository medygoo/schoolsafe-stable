import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SchoolSafeError } from "../../http/errors.js";
import { extractBearerToken } from "../../auth/session.js";
import type { FinancePaymentService } from "./service.js";
import { createPaymentSchema } from "../control/schema.js";
import { cancelPaymentSchema } from "./schema.js";
import { requirePermission } from "../../access/guard.js";
import type { AccessService } from "../../access/service.js";
import type { AuditService } from "../../audit/service.js";

export type ResolveProfileIdAndSchool = (token: string) => Promise<{ profileId: string | null; schoolId: string | null }>;

export type FinancePaymentsRouteDependencies = {
  service: FinancePaymentService;
  resolveProfileAndSchool: ResolveProfileIdAndSchool;
  access: AccessService;
  audit?: AuditService;
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

export function registerFinancePaymentsRoutes(app: FastifyInstance, dependencies: FinancePaymentsRouteDependencies): void {
  app.get(
    "/finance/student-fees/:studentFeeId",
    { preHandler: [requirePermission(dependencies.access, "finance.fee.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { studentFeeId } = request.params as { studentFeeId: string };
      const result = await dependencies.service.getStudentFeeWithPayments(schoolId, studentFeeId);
      return { data: result };
    },
  );

  app.post(
    "/finance/payments",
    { preHandler: [requirePermission(dependencies.access, "finance.payment.record")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const parsed = createPaymentSchema.parse(request.body);
      const result = await dependencies.service.recordPayment(schoolId, profileId, parsed);
      return { data: result };
    },
  );

  app.post(
    "/finance/payments/:id/cancel",
    {
      preHandler: [
        requirePermission(
          dependencies.access,
          "finance.payment.cancel",
          undefined,
          dependencies.audit
            ? {
                service: dependencies.audit,
                resolveProfileAndSchool: dependencies.resolveProfileAndSchool,
                resource: { type: "payment", id: (request: FastifyRequest) => (request.params as { id: string }).id },
              }
            : undefined,
        ),
      ],
    },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      const parsed = cancelPaymentSchema.parse(request.body);
      const result = await dependencies.service.cancelPayment(schoolId, profileId, id, parsed.reason);
      return { data: result };
    },
  );
}
