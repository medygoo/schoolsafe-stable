// SchoolSafe Pédagogie v1 — service natif PostgreSQL complet (VPS).
// Couvre : classes, matières, affectations enseignants, devoirs, notes, plans de cours, parents, moyennes, palmarès, étoiles.
// Toute requête humaine s'exécute dans withRequestContext : BEGIN → api.set_request_context
// → api.* → COMMIT. Le serveur transporte la session, il ne recalcule jamais les permissions.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";

export interface ClassProjection {
  id: string;
  name: string;
  cycle_key: string | null;
  option: string | null;
  academic_year_id: string;
  is_active: boolean;
}

export interface SubjectProjection {
  id: string;
  code: string;
  name: string;
  cycle_key: string | null;
  coefficient: number;
  is_active: boolean;
}

export interface TeacherAssignmentProjection {
  id: string;
  profile_id: string;
  subject_id: string;
  class_id: string;
  academic_year_id: string;
  teacher_name: string;
  subject_name: string;
  class_name: string;
}

export interface AssignmentProjection {
  id: string;
  class_id: string;
  subject_id: string;
  title: string;
  type: string;
  max_score: number;
  coefficient: number;
  assigned_at: string;
  due_at: string | null;
  published: boolean;
  subject_name: string;
  class_name: string;
}

export interface GradeProjection {
  id: string;
  student_id: string;
  score: number;
  comment: string | null;
  student_name: string;
  matricule: string;
}

export interface LessonPlanProjection {
  id: string;
  class_id: string;
  subject_id: string;
  title: string;
  week_start: string;
  objectives: string | null;
  content: string | null;
  status: string | null;
  subject_name: string;
  class_name: string;
}

export interface StudentAverageProjection {
  subject_id: string;
  subject_name: string;
  average: number;
  max: number;
  coefficient: number;
}

export interface ParentChildProjection {
  id: string;
  first_name: string;
  last_name: string;
  matricule: string;
  class_id: string;
  class_name: string;
}

export interface ParentGradeProjection {
  id: string;
  assignment_id: string;
  title: string;
  subject_name: string;
  score: number;
  max_score: number;
  coefficient: number;
  published: boolean;
}

export interface RankingProjection {
  id: string;
  class_id: string;
  month: string;
  status: string;
  class_name: string;
  academic_year_id: string;
}

export interface StarProjection {
  id: string;
  student_id: string;
  reason: string | null;
  awarded_by: string;
  created_at: string;
  student_name: string;
}

export function createPedagogyNativeService(businessPool: BusinessPool) {
  return {
    // --- Classes ---
    async listClasses(context: RequestContext): Promise<ClassProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ class_list: ClassProjection[] }>("select api.class_list() as class_list");
        return r.rows[0]?.class_list ?? [];
      });
    },

    // --- Matières ---
    async listSubjects(context: RequestContext): Promise<SubjectProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ subject_list: SubjectProjection[] }>("select api.subject_list() as subject_list");
        return r.rows[0]?.subject_list ?? [];
      });
    },

    async createSubject(context: RequestContext, code: string, name: string, cycleKey: string, coefficient?: number): Promise<string> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ subject_create: string }>(
          "select api.subject_create($1, $2, $3, $4) as subject_create",
          [code, name, cycleKey, coefficient ?? 1],
        );
        return r.rows[0].subject_create;
      });
    },

    // --- Affectations enseignants ---
    async listTeacherAssignments(context: RequestContext): Promise<TeacherAssignmentProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ teacher_assignment_list: TeacherAssignmentProjection[] }>(
          "select api.teacher_assignment_list() as teacher_assignment_list",
        );
        return r.rows[0]?.teacher_assignment_list ?? [];
      });
    },

    async createTeacherAssignment(context: RequestContext, profileId: string, subjectId: string, classId: string, academicYearId: string): Promise<string> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ teacher_assignment_create: string }>(
          "select api.teacher_assignment_create($1, $2, $3, $4) as teacher_assignment_create",
          [profileId, subjectId, classId, academicYearId],
        );
        return r.rows[0].teacher_assignment_create;
      });
    },

    async deleteTeacherAssignment(context: RequestContext, id: string): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ teacher_assignment_delete: boolean }>(
          "select api.teacher_assignment_delete($1) as teacher_assignment_delete", [id],
        );
        return r.rows[0]?.teacher_assignment_delete === true;
      });
    },

    // --- Devoirs ---
    async listAssignments(context: RequestContext, classId?: string, subjectId?: string): Promise<AssignmentProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ assignment_list: AssignmentProjection[] }>(
          "select api.assignment_list($1, $2) as assignment_list",
          [classId ?? null, subjectId ?? null],
        );
        return r.rows[0]?.assignment_list ?? [];
      });
    },

    async createAssignment(context: RequestContext, input: {
      class_id: string; subject_id: string; title: string; type: string;
      max_score: number; coefficient?: number; due_at?: string;
    }): Promise<string> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ assignment_create: string }>(
          "select api.assignment_create($1, $2, $3, $4, $5, $6, $7) as assignment_create",
          [input.class_id, input.subject_id, input.title, input.type, input.max_score, input.coefficient ?? 1, input.due_at ?? null],
        );
        return r.rows[0].assignment_create;
      });
    },

    async updateAssignment(context: RequestContext, id: string, input: { title?: string; max_score?: number; coefficient?: number; due_at?: string }): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ assignment_update: boolean }>(
          "select api.assignment_update($1, $2, $3, $4, $5) as assignment_update",
          [id, input.title ?? null, input.max_score ?? null, input.coefficient ?? null, input.due_at ?? null],
        );
        return r.rows[0]?.assignment_update === true;
      });
    },

    async publishAssignment(context: RequestContext, id: string): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ assignment_publish: boolean }>(
          "select api.assignment_publish($1) as assignment_publish", [id],
        );
        return r.rows[0]?.assignment_publish === true;
      });
    },

    // --- Notes ---
    async getGrades(context: RequestContext, assignmentId: string): Promise<GradeProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ grades_get: GradeProjection[] }>(
          "select api.grades_get($1) as grades_get", [assignmentId],
        );
        return r.rows[0]?.grades_get ?? [];
      });
    },

    async saveGrades(context: RequestContext, assignmentId: string, grades: { student_id: string; score: number; comment?: string }[]): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ grades_save: boolean }>(
          "select api.grades_save($1, $2::jsonb) as grades_save",
          [assignmentId, JSON.stringify(grades.map(g => ({ student_id: g.student_id, score: g.score, comment: g.comment ?? null })))],
        );
        return r.rows[0]?.grades_save === true;
      });
    },

    async publishGrades(context: RequestContext, assignmentId: string): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ grades_publish: boolean }>(
          "select api.grades_publish($1) as grades_publish", [assignmentId],
        );
        return r.rows[0]?.grades_publish === true;
      });
    },

    // --- Plans de cours ---
    async listLessonPlans(context: RequestContext, classId?: string, subjectId?: string): Promise<LessonPlanProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ lesson_plan_list: LessonPlanProjection[] }>(
          "select api.lesson_plan_list($1, $2) as lesson_plan_list",
          [classId ?? null, subjectId ?? null],
        );
        return r.rows[0]?.lesson_plan_list ?? [];
      });
    },

    async createLessonPlan(context: RequestContext, input: {
      class_id: string; subject_id: string; title: string; week_start: string;
      objectives?: string; content?: string;
    }): Promise<string> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ lesson_plan_create: string }>(
          "select api.lesson_plan_create($1, $2, $3, $4, $5, $6) as lesson_plan_create",
          [input.class_id, input.subject_id, input.title, input.week_start, input.objectives ?? null, input.content ?? null],
        );
        return r.rows[0].lesson_plan_create;
      });
    },

    async updateLessonPlan(context: RequestContext, id: string, input: { title?: string; objectives?: string; content?: string }): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ lesson_plan_update: boolean }>(
          "select api.lesson_plan_update($1, $2, $3, $4) as lesson_plan_update",
          [id, input.title ?? null, input.objectives ?? null, input.content ?? null],
        );
        return r.rows[0]?.lesson_plan_update === true;
      });
    },

    async deleteLessonPlan(context: RequestContext, id: string): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ lesson_plan_delete: boolean }>(
          "select api.lesson_plan_delete($1) as lesson_plan_delete", [id],
        );
        return r.rows[0]?.lesson_plan_delete === true;
      });
    },

    // --- Parent ---
    async getParentChildren(context: RequestContext): Promise<ParentChildProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ parent_children_list: ParentChildProjection[] }>(
          "select api.parent_children_list() as parent_children_list",
        );
        return r.rows[0]?.parent_children_list ?? [];
      });
    },

    async getStudentGradesForParent(context: RequestContext, studentId: string): Promise<ParentGradeProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ parent_student_grades: ParentGradeProjection[] }>(
          "select api.parent_student_grades($1) as parent_student_grades", [studentId],
        );
        return r.rows[0]?.parent_student_grades ?? [];
      });
    },

    // --- Moyennes ---
    async computeStudentAverages(context: RequestContext, studentId: string): Promise<StudentAverageProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ student_averages: StudentAverageProjection[] }>(
          "select api.student_averages($1) as student_averages", [studentId],
        );
        return r.rows[0]?.student_averages ?? [];
      });
    },

    // --- Palmarès ---
    async listRankings(context: RequestContext, classId?: string): Promise<RankingProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ ranking_list: RankingProjection[] }>(
          "select api.ranking_list($1, null) as ranking_list", [classId ?? null],
        );
        return r.rows[0]?.ranking_list ?? [];
      });
    },

    async getRanking(context: RequestContext, id: string): Promise<unknown | null> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ ranking_get: unknown }>(
          "select api.ranking_get($1) as ranking_get", [id],
        );
        return r.rows[0]?.ranking_get ?? null;
      });
    },

    async computeRanking(context: RequestContext, classId: string, month: string): Promise<string | null> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ ranking_compute: string | null }>(
          "select api.ranking_compute($1, $2::date) as ranking_compute", [classId, month],
        );
        return r.rows[0]?.ranking_compute ?? null;
      });
    },

    async publishRanking(context: RequestContext, id: string): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ ranking_publish: boolean }>(
          "select api.ranking_publish($1) as ranking_publish", [id],
        );
        return r.rows[0]?.ranking_publish === true;
      });
    },

    // --- Étoiles ---
    async listStars(context: RequestContext, rankingId: string): Promise<StarProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ star_list: StarProjection[] }>(
          "select api.star_list($1) as star_list", [rankingId],
        );
        return r.rows[0]?.star_list ?? [];
      });
    },

    async addStar(context: RequestContext, rankingId: string, studentId: string): Promise<string> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ star_add: string }>(
          "select api.star_add($1, $2) as star_add", [rankingId, studentId],
        );
        return r.rows[0].star_add;
      });
    },

    async removeStar(context: RequestContext, rankingId: string, studentId: string): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ star_remove: boolean }>(
          "select api.star_remove($1, $2) as star_remove", [rankingId, studentId],
        );
        return r.rows[0]?.star_remove === true;
      });
    },
  };
}

export type PedagogyNativeService = ReturnType<typeof createPedagogyNativeService>;
