import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { SchoolSafeError } from "../../http/errors.js";
import { requirePermission, type PermissionAuditConfig } from "../../access/guard.js";
import type { AccessService } from "../../access/service.js";
import type { AuditService } from "../../audit/service.js";
import type { RankingsService } from "./service.js";

export type ResolveProfileAndSchool = (token: string) => Promise<{ profileId: string | null; schoolId: string | null }>;

export type RankingsRouteDependencies = {
  service: RankingsService;
  resolveProfileAndSchool: ResolveProfileAndSchool;
  access: AccessService;
  audit?: AuditService;
};

const computeSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  class_id: z.string().uuid().optional(),
});

async function authenticate(
  request: FastifyRequest,
  resolve: ResolveProfileAndSchool,
): Promise<{ profileId: string; schoolId: string; token: string }> {
  const authHeader = request.headers.authorization;
  if (!authHeader) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
  const token = match[1];
  const { profileId, schoolId } = await resolve(token);
  if (!profileId || !schoolId) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Profil ou école non trouvé", false);
  return { profileId, schoolId, token };
}

function parseQuery(request: FastifyRequest): Record<string, string> {
  return (request.query ?? {}) as Record<string, string>;
}

function buildAuditConfig(
  dependencies: RankingsRouteDependencies,
  resourceType: string,
  resourceId?: string | ((request: FastifyRequest) => string | undefined),
): PermissionAuditConfig | undefined {
  if (!dependencies.audit) return undefined;
  return {
    service: dependencies.audit,
    resolveProfileAndSchool: dependencies.resolveProfileAndSchool,
    resource: { type: resourceType, id: resourceId },
  };
}

async function recordAuditEvent(
  dependencies: RankingsRouteDependencies,
  request: FastifyRequest,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!dependencies.audit) return;
  try {
    const token = request.headers.authorization ? request.headers.authorization.match(/^Bearer\s+(\S+)$/i)?.[1] : undefined;
    if (!token) return;
    const { profileId, schoolId } = await dependencies.resolveProfileAndSchool(token);
    if (!profileId || !schoolId) return;
    await dependencies.audit.insert({ schoolId, actorProfileId: profileId, eventType, payload });
  } catch (error) {
    console.error(`[rankings] failed to record audit event ${eventType}:`, error);
  }
}

async function requireScope(
  access: AccessService,
  token: string,
  scopeType: string,
  scopeId?: string | null,
  audit?: { dependencies: RankingsRouteDependencies; request: FastifyRequest; permissionCode: string },
): Promise<void> {
  const allowed = await access.hasScope(token, scopeType, scopeId ?? null);
  if (!allowed) {
    if (audit) {
      await recordAuditEvent(audit.dependencies, audit.request, "access.denied", {
        permission: audit.permissionCode,
        reason: "SCOPE_DENIED",
        scope_type: scopeType,
        scope_id: scopeId ?? null,
      });
    }
    throw new SchoolSafeError(403, "SCOPE_DENIED", "Hors périmètre autorisé", false);
  }
}

async function authorizeRankingRead(
  dependencies: RankingsRouteDependencies,
  request: FastifyRequest,
  token: string,
  profileId: string,
  schoolId: string,
  classId: string | null,
  permissionCode = "palmarques.read",
): Promise<{ childStudentIds: string[] }> {
  const isAdmin = await dependencies.access.hasScope(token, "school");
  if (isAdmin) return { childStudentIds: [] };

  const childStudentIds = await dependencies.service.getParentChildrenStudentIds(schoolId, profileId);
  const childClassIds = new Set(await dependencies.service.getParentChildrenClassIds(schoolId, profileId));

  if (classId) {
    const isAssignedClass = await dependencies.access.hasScope(token, "assigned_classes", classId);
    if (isAssignedClass) return { childStudentIds: [] };
    if (childClassIds.has(classId)) return { childStudentIds };
  } else {
    const isSchoolScoped = await dependencies.access.hasScope(token, "school");
    if (isSchoolScoped) return { childStudentIds: [] };
    if (childStudentIds.length > 0) return { childStudentIds };
  }

  await recordAuditEvent(dependencies, request, "access.denied", {
    permission: permissionCode,
    reason: "SCOPE_DENIED",
    scope_type: classId ? "assigned_classes" : "school",
    scope_id: classId ?? null,
  });
  throw new SchoolSafeError(403, "SCOPE_DENIED", "Hors périmètre autorisé", false);
}

export function registerRankingsRoutes(app: FastifyInstance, dependencies: RankingsRouteDependencies): void {
  app.get(
    "/",
    { preHandler: [requirePermission(dependencies.access, "palmarques.read", undefined, buildAuditConfig(dependencies, "rankings"))] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId, token } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const query = parseQuery(request);
      const classId = query.class_id === "null" ? null : query.class_id ?? null;
      await authorizeRankingRead(dependencies, request, token, profileId, schoolId, classId);
      const result = await dependencies.service.listRankings(schoolId, {
        classId,
        month: query.month,
        status: query.status,
      });
      return { data: result };
    },
  );

  app.get(
    "/:id",
    { preHandler: [requirePermission(dependencies.access, "palmarques.read", undefined, buildAuditConfig(dependencies, "ranking", (request) => (request.params as { id: string }).id))] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId, token } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      const result = await dependencies.service.getRanking(schoolId, id);
      if (!result) throw new SchoolSafeError(404, "NOT_FOUND", "Palmarès introuvable.", false);
      const { childStudentIds } = await authorizeRankingRead(dependencies, request, token, profileId, schoolId, result.class_id ?? null);
      if (childStudentIds.length > 0) {
        const childIds = new Set(childStudentIds);
        result.entries = result.entries.map((entry) =>
          childIds.has(entry.student_id) ? entry : { ...entry, metadata: {} },
        );
      }
      return { data: result };
    },
  );

  app.post(
    "/compute",
    { preHandler: [requirePermission(dependencies.access, "palmarques.manage", undefined, buildAuditConfig(dependencies, "ranking"))] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId, token } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const parsed = computeSchema.parse(request.body);
      const scopeType = parsed.class_id ? "assigned_classes" : "school";
      const scopeId = parsed.class_id ?? null;
      await requireScope(dependencies.access, token, scopeType, scopeId, {
        dependencies,
        request,
        permissionCode: "palmarques.manage",
      });
      const result = await dependencies.service.computeMonthlyRanking(schoolId, profileId, parsed.month, parsed.class_id);
      await recordAuditEvent(dependencies, request, "ranking.computed", {
        ranking_id: result.id,
        class_id: result.class_id ?? null,
        month: result.month,
      });
      return { data: result };
    },
  );

  app.post(
    "/:id/publish",
    { preHandler: [requirePermission(dependencies.access, "palmarques.manage", undefined, buildAuditConfig(dependencies, "ranking", (request) => (request.params as { id: string }).id))] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId, token } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      const ranking = await dependencies.service.getRanking(schoolId, id);
      if (!ranking) throw new SchoolSafeError(404, "NOT_FOUND", "Palmarès introuvable.", false);
      const scopeType = ranking.class_id ? "assigned_classes" : "school";
      const scopeId = ranking.class_id ?? null;
      await requireScope(dependencies.access, token, scopeType, scopeId, {
        dependencies,
        request,
        permissionCode: "palmarques.manage",
      });
      const result = await dependencies.service.publishRanking(schoolId, profileId, id);
      await recordAuditEvent(dependencies, request, "ranking.published", {
        ranking_id: result.id,
        class_id: result.class_id ?? null,
        month: result.month,
      });
      return { data: result };
    },
  );

  app.get(
    "/:id/stars",
    { preHandler: [requirePermission(dependencies.access, "palmarques.read", undefined, buildAuditConfig(dependencies, "ranking_stars", (request) => (request.params as { id: string }).id))] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId, token } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      const ranking = await dependencies.service.getRanking(schoolId, id);
      if (!ranking) throw new SchoolSafeError(404, "NOT_FOUND", "Palmarès introuvable.", false);
      await authorizeRankingRead(dependencies, request, token, profileId, schoolId, ranking.class_id ?? null);
      const result = await dependencies.service.listStars(schoolId, id);
      return { data: result };
    },
  );

  app.post(
    "/:id/stars",
    { preHandler: [requirePermission(dependencies.access, "palmarques.read", undefined, buildAuditConfig(dependencies, "ranking_stars", (request) => (request.params as { id: string }).id))] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId, token } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      const body = request.body as { student_id?: string };
      if (!body.student_id) throw new SchoolSafeError(400, "VALIDATION_INVALID", "student_id requis.", false);
      await requireScope(dependencies.access, token, "own_children", body.student_id, {
        dependencies,
        request,
        permissionCode: "palmarques.read",
      });
      const ranking = await dependencies.service.getRanking(schoolId, id);
      if (!ranking) throw new SchoolSafeError(404, "NOT_FOUND", "Palmarès introuvable.", false);
      await authorizeRankingRead(dependencies, request, token, profileId, schoolId, ranking.class_id ?? null);
      const result = await dependencies.service.addStar(schoolId, profileId, id, body.student_id);
      await recordAuditEvent(dependencies, request, "ranking.star.added", {
        ranking_id: id,
        student_id: body.student_id,
        parent_profile_id: profileId,
      });
      return { data: result };
    },
  );

  app.delete(
    "/:id/stars/:studentId",
    { preHandler: [requirePermission(dependencies.access, "palmarques.read", undefined, buildAuditConfig(dependencies, "ranking_stars", (request) => (request.params as { id: string; studentId: string }).id))] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId, token } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id, studentId } = request.params as { id: string; studentId: string };
      await requireScope(dependencies.access, token, "own_children", studentId, {
        dependencies,
        request,
        permissionCode: "palmarques.read",
      });
      const ranking = await dependencies.service.getRanking(schoolId, id);
      if (!ranking) throw new SchoolSafeError(404, "NOT_FOUND", "Palmarès introuvable.", false);
      await authorizeRankingRead(dependencies, request, token, profileId, schoolId, ranking.class_id ?? null);
      await dependencies.service.removeStar(schoolId, profileId, id, studentId);
      await recordAuditEvent(dependencies, request, "ranking.star.removed", {
        ranking_id: id,
        student_id: studentId,
        parent_profile_id: profileId,
      });
      return { success: true };
    },
  );
}
