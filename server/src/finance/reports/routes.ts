import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SchoolSafeError } from "../../http/errors.js";
import { extractBearerToken } from "../../auth/session.js";
import type { FinanceReportsService } from "./service.js";
import { dailyReportQuerySchema, closeCashRegisterSchema } from "./schema.js";
import { requirePermission } from "../../access/guard.js";
import type { AccessService } from "../../access/service.js";
import type { AuditService } from "../../audit/service.js";

export type ResolveProfileIdAndSchool = (token: string) => Promise<{ profileId: string | null; schoolId: string | null }>;

export type FinanceReportsRouteDependencies = {
  service: FinanceReportsService;
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
  return { token, profileId, schoolId };
}

/**
 * Scope own_children : un parent (profil avec lien student_guardians) ne peut viser
 * que ses propres enfants. Le personnel sans aucun lien tuteur n'est pas restreint ici
 * (sa permission de rôle a déjà été vérifiée par requirePermission).
 */
async function enforceOwnChildrenScope(
  dependencies: FinanceReportsRouteDependencies,
  context: { token: string; profileId: string; schoolId: string },
  studentId: string,
  resource: { type: string; id: string },
  permission: string,
): Promise<void> {
  if (!dependencies.access.checkScope) return;
  const inScope = await dependencies.access.checkScope(context.token, "own_children", { studentId });
  if (inScope) return;
  const isGuardian = dependencies.access.hasGuardianLinks
    ? await dependencies.access.hasGuardianLinks(context.token)
    : false;
  if (!isGuardian) return;
  if (dependencies.audit) {
    await dependencies.audit.insert({
      schoolId: context.schoolId,
      actorProfileId: context.profileId,
      eventType: "access.denied",
      payload: {
        permission,
        resource_type: resource.type,
        resource_id: resource.id,
        reason: "SCOPE_DENIED",
        scope_type: "own_children",
        scope_id: studentId,
      },
    });
  }
  throw new SchoolSafeError(403, "SCOPE_DENIED", "Hors périmètre autorisé", false);
}

export function registerFinanceReportsRoutes(app: FastifyInstance, dependencies: FinanceReportsRouteDependencies): void {
  app.get(
    "/finance/receipts/:paymentId",
    { preHandler: [requirePermission(dependencies.access, "finance.receipt.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const context = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { paymentId } = request.params as { paymentId: string };
      const studentId = await dependencies.service.getPaymentStudentId(context.schoolId, paymentId);
      if (studentId) {
        await enforceOwnChildrenScope(
          dependencies,
          context,
          studentId,
          { type: "finance.receipt", id: paymentId },
          "finance.receipt.read",
        );
      }
      const result = await dependencies.service.getReceiptData(context.schoolId, paymentId);
      if (!result) {
        throw new SchoolSafeError(404, "NOT_FOUND", "Reçu introuvable", false);
      }
      return { data: result };
    },
  );

  app.get(
    "/finance/reports/daily",
    { preHandler: [requirePermission(dependencies.access, "finance.report.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const parsed = dailyReportQuerySchema.parse(request.query);
      const result = await dependencies.service.getDailyReport(schoolId, parsed.date);
      return { data: result };
    },
  );

  app.post(
    "/finance/cash-register/close",
    { preHandler: [requirePermission(dependencies.access, "finance.cash_register.close")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const parsed = closeCashRegisterSchema.parse(request.body);
      const result = await dependencies.service.closeCashRegister(schoolId, profileId, parsed);
      return { data: result };
    },
  );
}
