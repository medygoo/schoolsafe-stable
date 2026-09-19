// SchoolSafe — première lecture métier réelle : projection élève.
// Chaîne complète : session (lot 2.3) → contexte serveur → Access_Law en base
// (lot 3.1) → RPC de projection filtrée (database/projections/v1).
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withAuthorizedContext, type AccessTarget } from "../db/access.js";
import { withRequestContext, type RequestContext } from "../db/context.js";

export type StudentProjection = {
  id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  class_name: string | null;
  school_id: string;
  lifecycle_status: string;
};

export type StudentListResult = {
  total: number;
  rows: StudentProjection[];
  limit: number;
  offset: number;
};

export function createStudentsNativeService(businessPool: BusinessPool) {
  return {
    async readStudent(context: RequestContext, studentId: string): Promise<StudentProjection> {
      return withAuthorizedContext(
        businessPool,
        context,
        "school.student.read",
        { studentId } as AccessTarget,
        async (client: PoolClient) => {
          const result = await client.query<{ student_read: StudentProjection }>(
            "select api.student_read($1) as student_read",
            [studentId],
          );
          return result.rows[0].student_read;
        },
      );
    },

    async listStudents(
      context: RequestContext,
      status: string | null,
      query: string | null,
      classId: string | null,
      limit: number,
      offset: number,
    ): Promise<StudentListResult> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const result = await client.query<{ student_list: StudentListResult }>(
          "select api.student_list($1, $2, $3, $4, $5) as student_list",
          [status, query, classId, limit, offset],
        );
        return result.rows[0]?.student_list ?? { total: 0, rows: [], limit, offset };
      });
    },

    async createStudentDraft(
      context: RequestContext,
      input: {
        matricule: string;
        first_name: string;
        middle_name?: string;
        last_name: string;
        date_of_birth?: string;
        gender?: string;
        academic_year_id: string;
        planned_class_id: string;
        enrollment_starts_on: string;
        schoolId: string;
      },
    ): Promise<string> {
      return withAuthorizedContext(
        businessPool,
        context,
        "school.student.create",
        { classId: input.planned_class_id } as AccessTarget,
        async (client: PoolClient) => {
          const result = await client.query<{ student_create_draft: string }>(
            "select api.student_create_draft($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as student_create_draft",
            [
              input.schoolId ?? context.schoolId,
              input.matricule,
              input.first_name,
              input.middle_name ?? null,
              input.last_name,
              input.date_of_birth ?? null,
              input.gender ?? null,
              input.academic_year_id,
              input.planned_class_id,
              input.enrollment_starts_on,
            ],
          );
          return result.rows[0].student_create_draft;
        },
      );
    },
  };
}

export type StudentsNativeService = ReturnType<typeof createStudentsNativeService>;
