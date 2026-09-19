// SchoolSafe Pédagogie v1 — routes HTTP natives complètes.
// Le contexte de requête est construit UNIQUEMENT depuis la session résolue
// côté serveur (jamais depuis le navigateur) et passé en premier argument.
import type { FastifyInstance } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { PedagogyNativeService } from "./service.js";
import type { RequestContext } from "../db/context.js";
import { z } from "zod";

export type PedagogyNativeRouteDependencies = {
  authService: AuthNativeService;
  service: PedagogyNativeService;
};

export function registerPedagogyNativeRoutes(
  app: FastifyInstance,
  dependencies: PedagogyNativeRouteDependencies,
): void {
  const requireSession = requireAuthSession(dependencies.authService);

  // Contexte serveur : identité + école résolues depuis la session, jamais du client.
  function contextFrom(request: { authSession?: { userId: string; profileId: string; schoolId: string } }): RequestContext {
    const session = request.authSession!;
    return {
      userId: session.userId,
      profileId: session.profileId,
      schoolId: session.schoolId,
      requestId: newRequestId(),
    };
  }

  // --- Classes ---
  app.get("/native/pedagogy/classes", { preHandler: requireSession }, async (request) => {
    const data = await dependencies.service.listClasses(contextFrom(request));
    return { data, request_id: newRequestId() };
  });

  // --- Matières ---
  app.get("/native/pedagogy/subjects", { preHandler: requireSession }, async (request) => {
    const data = await dependencies.service.listSubjects(contextFrom(request));
    return { data, request_id: newRequestId() };
  });

  app.post("/native/pedagogy/subjects", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      cycle_key: z.string().min(1),
      coefficient: z.number().int().positive().default(1),
    }).parse(request.body);
    const id = await dependencies.service.createSubject(contextFrom(request), body.code, body.name, body.cycle_key, body.coefficient);
    return { data: { id }, request_id: newRequestId() };
  });

  // --- Affectations enseignants ---
  app.get("/native/pedagogy/teacher-assignments", { preHandler: requireSession }, async (request) => {
    const data = await dependencies.service.listTeacherAssignments(contextFrom(request));
    return { data, request_id: newRequestId() };
  });

  app.post("/native/pedagogy/teacher-assignments", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      profile_id: z.string().uuid(),
      subject_id: z.string().uuid(),
      class_id: z.string().uuid(),
      academic_year_id: z.string().uuid(),
    }).parse(request.body);
    const id = await dependencies.service.createTeacherAssignment(
      contextFrom(request),
      body.profile_id, body.subject_id, body.class_id, body.academic_year_id,
    );
    return { data: { id }, request_id: newRequestId() };
  });

  app.delete("/native/pedagogy/teacher-assignments/:id", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const ok = await dependencies.service.deleteTeacherAssignment(contextFrom(request), id);
    if (!ok) throw new SchoolSafeError(404, "NOT_FOUND", "Affectation introuvable", false);
    return { data: { deleted: true }, request_id: newRequestId() };
  });

  // --- Devoirs ---
  app.get("/native/pedagogy/assignments", { preHandler: requireSession }, async (request) => {
    const q = z.object({ class_id: z.string().optional(), subject_id: z.string().optional() }).parse(request.query ?? {});
    const data = await dependencies.service.listAssignments(contextFrom(request), q.class_id, q.subject_id);
    return { data, request_id: newRequestId() };
  });

  app.post("/native/pedagogy/assignments", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      class_id: z.string().uuid(),
      subject_id: z.string().uuid(),
      title: z.string().min(1),
      type: z.string().min(1),
      max_score: z.number().positive(),
      coefficient: z.number().int().positive().default(1),
      due_at: z.string().optional(),
    }).parse(request.body);
    const id = await dependencies.service.createAssignment(contextFrom(request), body);
    return { data: { id }, request_id: newRequestId() };
  });

  app.patch("/native/pedagogy/assignments/:id", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      title: z.string().optional(),
      max_score: z.number().positive().optional(),
      coefficient: z.number().int().positive().optional(),
      due_at: z.string().optional(),
    }).parse(request.body);
    const ok = await dependencies.service.updateAssignment(contextFrom(request), id, body);
    if (!ok) throw new SchoolSafeError(404, "NOT_FOUND", "Devoir introuvable", false);
    return { data: { updated: true }, request_id: newRequestId() };
  });

  app.post("/native/pedagogy/assignments/:id/publish", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const ok = await dependencies.service.publishAssignment(contextFrom(request), id);
    if (!ok) throw new SchoolSafeError(404, "NOT_FOUND", "Devoir introuvable", false);
    return { data: { published: true }, request_id: newRequestId() };
  });

  // --- Notes ---
  app.get("/native/pedagogy/assignments/:id/grades", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.getGrades(contextFrom(request), id);
    return { data, request_id: newRequestId() };
  });

  app.post("/native/pedagogy/assignments/:id/grades", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      grades: z.array(z.object({
        student_id: z.string().uuid(),
        score: z.number(),
        comment: z.string().optional(),
      })),
    }).parse(request.body);
    const ok = await dependencies.service.saveGrades(contextFrom(request), id, body.grades);
    return { data: { saved: ok }, request_id: newRequestId() };
  });

  app.post("/native/pedagogy/assignments/:id/grades/publish", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const ok = await dependencies.service.publishGrades(contextFrom(request), id);
    return { data: { published: ok }, request_id: newRequestId() };
  });

  // --- Plans de cours ---
  app.get("/native/pedagogy/lesson-plans", { preHandler: requireSession }, async (request) => {
    const q = z.object({ class_id: z.string().optional(), subject_id: z.string().optional() }).parse(request.query ?? {});
    const data = await dependencies.service.listLessonPlans(contextFrom(request), q.class_id, q.subject_id);
    return { data, request_id: newRequestId() };
  });

  app.post("/native/pedagogy/lesson-plans", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      class_id: z.string().uuid(),
      subject_id: z.string().uuid(),
      title: z.string().min(1),
      week_start: z.string(),
      objectives: z.string().optional(),
      content: z.string().optional(),
    }).parse(request.body);
    const id = await dependencies.service.createLessonPlan(contextFrom(request), body);
    return { data: { id }, request_id: newRequestId() };
  });

  app.patch("/native/pedagogy/lesson-plans/:id", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      title: z.string().optional(),
      objectives: z.string().optional(),
      content: z.string().optional(),
    }).parse(request.body);
    const ok = await dependencies.service.updateLessonPlan(contextFrom(request), id, body);
    if (!ok) throw new SchoolSafeError(404, "NOT_FOUND", "Plan de cours introuvable", false);
    return { data: { updated: true }, request_id: newRequestId() };
  });

  app.delete("/native/pedagogy/lesson-plans/:id", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const ok = await dependencies.service.deleteLessonPlan(contextFrom(request), id);
    if (!ok) throw new SchoolSafeError(404, "NOT_FOUND", "Plan de cours introuvable", false);
    return { data: { deleted: true }, request_id: newRequestId() };
  });

  // --- Parent ---
  app.get("/native/pedagogy/parent/children", { preHandler: requireSession }, async (request) => {
    const data = await dependencies.service.getParentChildren(contextFrom(request));
    return { data, request_id: newRequestId() };
  });

  app.get("/native/pedagogy/parent/grades/:studentId", { preHandler: requireSession }, async (request) => {
    const { studentId } = request.params as { studentId: string };
    const data = await dependencies.service.getStudentGradesForParent(contextFrom(request), studentId);
    return { data, request_id: newRequestId() };
  });

  // --- Moyennes ---
  app.get("/native/pedagogy/students/:studentId/averages", { preHandler: requireSession }, async (request) => {
    const { studentId } = request.params as { studentId: string };
    const data = await dependencies.service.computeStudentAverages(contextFrom(request), studentId);
    return { data, request_id: newRequestId() };
  });

  // --- Palmarès ---
  app.get("/native/pedagogy/rankings", { preHandler: requireSession }, async (request) => {
    const q = z.object({ class_id: z.string().optional() }).parse(request.query ?? {});
    const data = await dependencies.service.listRankings(contextFrom(request), q.class_id);
    return { data, request_id: newRequestId() };
  });

  app.get("/native/pedagogy/rankings/:id", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.getRanking(contextFrom(request), id);
    if (!data) throw new SchoolSafeError(404, "NOT_FOUND", "Palmarès introuvable", false);
    return { data, request_id: newRequestId() };
  });

  app.post("/native/pedagogy/rankings/compute", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      class_id: z.string().uuid(),
      month: z.string(),
    }).parse(request.body);
    const id = await dependencies.service.computeRanking(contextFrom(request), body.class_id, body.month);
    return { data: { id }, request_id: newRequestId() };
  });

  app.post("/native/pedagogy/rankings/:id/publish", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const ok = await dependencies.service.publishRanking(contextFrom(request), id);
    if (!ok) throw new SchoolSafeError(404, "NOT_FOUND", "Palmarès introuvable", false);
    return { data: { published: true }, request_id: newRequestId() };
  });

  // --- Étoiles ---
  app.get("/native/pedagogy/rankings/:id/stars", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.listStars(contextFrom(request), id);
    return { data, request_id: newRequestId() };
  });

  app.post("/native/pedagogy/rankings/:id/stars", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ student_id: z.string().uuid() }).parse(request.body);
    const starId = await dependencies.service.addStar(contextFrom(request), id, body.student_id);
    return { data: { id: starId }, request_id: newRequestId() };
  });

  app.delete("/native/pedagogy/rankings/:id/stars/:studentId", { preHandler: requireSession }, async (request) => {
    const { id, studentId } = request.params as { id: string; studentId: string };
    const ok = await dependencies.service.removeStar(contextFrom(request), id, studentId);
    if (!ok) throw new SchoolSafeError(404, "NOT_FOUND", "Étoile introuvable", false);
    return { data: { deleted: true }, request_id: newRequestId() };
  });
}
