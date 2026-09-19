import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { SchoolSafeError } from "../http/errors.js";
import { extractBearerToken } from "../auth/session.js";
import type { PedagogyService } from "./service.js";
import {
  createSubjectSchema,
  createTeacherAssignmentSchema,
  createAssignmentSchema,
  updateAssignmentSchema,
  gradeInputSchema,
  createLessonPlanSchema,
  updateLessonPlanSchema,
} from "./schema.js";
import { requirePermission } from "../access/guard.js";
import type { AccessService } from "../access/service.js";
import type { AuditService } from "../audit/service.js";
import { registerRankingsRoutes } from "./rankings/routes.js";
import type { RankingsService } from "./rankings/service.js";

export type ResolveProfileAndSchool = (token: string) => Promise<{ profileId: string | null; schoolId: string | null }>;

export type PedagogyRouteDependencies = {
  service: PedagogyService;
  rankingsService: RankingsService;
  resolveProfileAndSchool: ResolveProfileAndSchool;
  access: AccessService;
  audit?: AuditService;
};

async function authenticate(request: FastifyRequest, resolve: ResolveProfileAndSchool) {
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
  dependencies: PedagogyRouteDependencies,
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

function parseQuery(request: FastifyRequest): Record<string, string> {
  return (request.query ?? {}) as Record<string, string>;
}

export function registerPedagogyRoutes(app: FastifyInstance, dependencies: PedagogyRouteDependencies): void {
  // Classes
  app.get(
    "/pedagogy/classes",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.assignment.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const result = await dependencies.service.listClasses(schoolId);
      return { data: result };
    },
  );

  // Subjects
  app.get(
    "/pedagogy/subjects",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.subject.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const result = await dependencies.service.listSubjects(schoolId);
      return { data: result };
    },
  );

  app.post(
    "/pedagogy/subjects",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.subject.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const parsed = createSubjectSchema.parse(request.body);
      const result = await dependencies.service.createSubject(schoolId, parsed);
      return { data: result };
    },
  );

  // Teacher assignments
  app.get(
    "/pedagogy/teacher-assignments",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.assignment.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const result = await dependencies.service.listTeacherAssignments(schoolId);
      return { data: result };
    },
  );

  app.post(
    "/pedagogy/teacher-assignments",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.assignment.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const parsed = createTeacherAssignmentSchema.parse(request.body);
      const result = await dependencies.service.createTeacherAssignment(schoolId, parsed);
      return { data: result };
    },
  );

  app.delete(
    "/pedagogy/teacher-assignments/:id",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.assignment.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      await dependencies.service.deleteTeacherAssignment(schoolId, id);
      return { success: true };
    },
  );

  // Assignments
  app.get(
    "/pedagogy/assignments",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.assignment.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const query = parseQuery(request);
      const result = await dependencies.service.listAssignments(schoolId, {
        classId: query.class_id,
        subjectId: query.subject_id,
        teacherId: query.teacher_id,
      });
      return { data: result };
    },
  );

  app.post(
    "/pedagogy/assignments",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.assignment.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const parsed = createAssignmentSchema.parse(request.body);
      const result = await dependencies.service.createAssignment(schoolId, profileId, parsed);
      return { data: result };
    },
  );

  app.patch(
    "/pedagogy/assignments/:id",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.assignment.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      const parsed = updateAssignmentSchema.parse(request.body);
      const result = await dependencies.service.updateAssignment(schoolId, profileId, id, parsed);
      return { data: result };
    },
  );

  app.post(
    "/pedagogy/assignments/:id/publish",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.assignment.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      const result = await dependencies.service.publishAssignment(schoolId, profileId, id);
      return { data: result };
    },
  );

  // Grades
  app.get(
    "/pedagogy/assignments/:id/grades",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.grade.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      const result = await dependencies.service.getAssignmentGrades(schoolId, id);
      return { data: result };
    },
  );

  app.post(
    "/pedagogy/assignments/:id/grades",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.grade.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, unknown>;
      const grades = z.array(gradeInputSchema).parse(body.grades ?? []);
      const result = await dependencies.service.saveGrades(schoolId, profileId, id, grades);
      return { data: result };
    },
  );

  app.post(
    "/pedagogy/assignments/:id/grades/publish",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.grade.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      const result = await dependencies.service.publishGrades(schoolId, profileId, id);
      return { data: result };
    },
  );

  // Lesson plans
  app.get(
    "/pedagogy/lesson-plans",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.lesson-plan.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const query = parseQuery(request);
      const result = await dependencies.service.listLessonPlans(schoolId, {
        classId: query.class_id,
        subjectId: query.subject_id,
        teacherId: query.teacher_id,
      });
      return { data: result };
    },
  );

  app.post(
    "/pedagogy/lesson-plans",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.lesson-plan.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const parsed = createLessonPlanSchema.parse(request.body);
      const result = await dependencies.service.createLessonPlan(schoolId, profileId, parsed);
      return { data: result };
    },
  );

  app.patch(
    "/pedagogy/lesson-plans/:id",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.lesson-plan.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      const parsed = updateLessonPlanSchema.parse(request.body);
      const result = await dependencies.service.updateLessonPlan(schoolId, profileId, id, parsed);
      return { data: result };
    },
  );

  app.delete(
    "/pedagogy/lesson-plans/:id",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.lesson-plan.manage")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      await dependencies.service.deleteLessonPlan(schoolId, id);
      return { success: true };
    },
  );

  // Parent view
  app.get(
    "/pedagogy/parent/children",
    { preHandler: [requirePermission(dependencies.access, "school.guardian.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const result = await dependencies.service.getParentChildren(schoolId, profileId);
      return { data: result };
    },
  );

  app.get(
    "/pedagogy/parent/grades/:studentId",
    { preHandler: [requirePermission(dependencies.access, "school.guardian.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const { profileId, schoolId } = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { studentId } = request.params as { studentId: string };
      const result = await dependencies.service.getStudentGradesForParent(schoolId, profileId, studentId);
      return { data: result };
    },
  );

  app.get(
    "/pedagogy/students/:id/averages",
    { preHandler: [requirePermission(dependencies.access, "pedagogy.grade.read")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const context = await authenticate(request, dependencies.resolveProfileAndSchool);
      const { id } = request.params as { id: string };
      await enforceOwnChildrenScope(
        dependencies,
        context,
        id,
        { type: "pedagogy.student_averages", id },
        "pedagogy.grade.read",
      );
      const result = await dependencies.service.computeStudentAverages(context.schoolId, id);
      return { data: result };
    },
  );

  app.register(
    async (rankingsApp: FastifyInstance) => {
      registerRankingsRoutes(rankingsApp, {
        service: dependencies.rankingsService,
        resolveProfileAndSchool: dependencies.resolveProfileAndSchool,
        access: dependencies.access,
        audit: dependencies.audit,
      });
    },
    { prefix: "/pedagogy/rankings" },
  );
}
