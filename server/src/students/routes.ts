import type { FastifyInstance } from "fastify";
import { requirePermission, extractBearerToken, type ResolveProfileAndSchool } from "../access/guard.js";
import type { AccessService } from "../access/service.js";
import { SchoolSafeError } from "../http/errors.js";
import type { StudentsService } from "./service.js";
import { createStudentDraftSchema, parentSearchQuerySchema, studentListQuerySchema } from "./schema.js";

export interface StudentRouteDependencies {
  service: StudentsService;
  access: AccessService;
  resolveProfileAndSchool: ResolveProfileAndSchool;
}
function tokenFor(request: { headers: { authorization?: string } }): string {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
  return token;
}

export function registerStudentRoutes(app: FastifyInstance, deps: StudentRouteDependencies): void {
  const { service, access, resolveProfileAndSchool } = deps;

  app.post(
    "/school/students/drafts",
    { preHandler: [requirePermission(access, "school.student.create")] },
    async (request, reply) => {
      const token = tokenFor(request);
      const { profileId, schoolId } = await resolveProfileAndSchool(token);
      if (!profileId || !schoolId) throw new SchoolSafeError(403, "ACCESS_DENIED", "Profil ou école introuvable", false);
      const payload = createStudentDraftSchema.parse(request.body);
      const result = await service.createDraft(schoolId, profileId, payload);
      reply.status(201).send(result);
    },
  );

  app.get(
    "/school/students",
    { preHandler: [requirePermission(access, "school.student.read")] },
    async (request, reply) => {
      const token = tokenFor(request);
      const { schoolId } = await resolveProfileAndSchool(token);
      if (!schoolId) throw new SchoolSafeError(403, "SCHOOL_NOT_FOUND", "École introuvable", false);
      const filters = studentListQuerySchema.parse(request.query);
      reply.send(await service.listStudents(token, schoolId, filters));
    },
  );

  app.get(
    "/school/students/:id",
    { preHandler: [requirePermission(access, "school.student.read")] },
    async (request, reply) => {
      const token = tokenFor(request);
      const { schoolId } = await resolveProfileAndSchool(token);
      if (!schoolId) throw new SchoolSafeError(403, "SCHOOL_NOT_FOUND", "École introuvable", false);
      const { id } = request.params as { id: string };
      reply.send(await service.getStudent(token, schoolId, id));
    },
  );

  app.get(
    "/school/parents",
    { preHandler: [requirePermission(access, "school.student.create")] },
    async (request, reply) => {
      const token = tokenFor(request);
      const { schoolId } = await resolveProfileAndSchool(token);
      if (!schoolId) throw new SchoolSafeError(403, "SCHOOL_NOT_FOUND", "École introuvable", false);
      const { query } = parentSearchQuerySchema.parse(request.query);
      reply.send(await service.listParents(token, schoolId, query));
    },
  );
}
