// SchoolSafe — route de lecture élève (première route métier sur PostgreSQL).
// Le client ne fournit QUE l'id de l'élève dans l'URL ; user/profile/school
// viennent de la session résolue côté serveur (jamais du navigateur).
import type { FastifyInstance } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { StudentsNativeService } from "./service.js";
import { z } from "zod";

const createStudentDraftSchema = z.object({
  matricule: z.string().trim().min(1).max(80),
  first_name: z.string().trim().min(1).max(100),
  middle_name: z.string().trim().max(100).optional(),
  last_name: z.string().trim().min(1).max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.enum(["M", "F"]).optional(),
  academic_year_id: z.string().uuid(),
  planned_class_id: z.string().uuid(),
  enrollment_starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type StudentsNativeRouteDependencies = {
  authService: AuthNativeService;
  service: StudentsNativeService;
};

export function registerStudentsNativeRoutes(
  app: FastifyInstance,
  dependencies: StudentsNativeRouteDependencies,
): void {
  const requireSession = requireAuthSession(dependencies.authService);

  app.get("/native/students/:id", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const session = request.authSession!;

    const student = await dependencies.service.readStudent(
      {
        userId: session.userId,
        profileId: session.profileId,
        schoolId: session.schoolId,
        requestId: newRequestId(),
      },
      id,
    );

    if (!student) {
      throw new SchoolSafeError(404, "NOT_FOUND", "Élève introuvable", false);
    }
    return { data: student, request_id: newRequestId() };
  });

  // Pagination, filtre, recherche
  app.get("/native/students", { preHandler: requireSession }, async (request) => {
    const query = request.query as { status?: string; query?: string; class_id?: string; limit?: string; offset?: string };
    const session = request.authSession!;
    const limit = Math.min(Math.max(parseInt(query.limit ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(query.offset ?? "0", 10) || 0, 0);

    const result = await dependencies.service.listStudents(
      {
        userId: session.userId,
        profileId: session.profileId,
        schoolId: session.schoolId,
        requestId: newRequestId(),
      },
      query.status ?? null,
      query.query ?? null,
      query.class_id ?? null,
      limit,
      offset,
    );

    return { data: result, request_id: newRequestId() };
  });

  // Création d'un élève en brouillon (draft)
  app.post("/native/students/drafts", { preHandler: requireSession }, async (request, reply) => {
    const body = createStudentDraftSchema.parse(request.body);
    const session = request.authSession!;

    const studentId = await dependencies.service.createStudentDraft(
      {
        userId: session.userId,
        profileId: session.profileId,
        schoolId: session.schoolId,
        requestId: newRequestId(),
      },
      {
        ...body,
        schoolId: session.schoolId,
      },
    );

    return { data: { id: studentId }, request_id: newRequestId() };
  });
}
