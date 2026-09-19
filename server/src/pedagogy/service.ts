import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateSubjectInput,
  CreateTeacherAssignmentInput,
  CreateAssignmentInput,
  UpdateAssignmentInput,
  GradeInput,
  CreateLessonPlanInput,
  UpdateLessonPlanInput,
} from "./schema.js";
import { computeStudentAverages, type SubjectInfo } from "./averages.js";
import { SchoolSafeError } from "../http/errors.js";

export interface PedagogyService {
  listClasses(schoolId: string): Promise<unknown[]>;
  listSubjects(schoolId: string): Promise<unknown[]>;
  createSubject(schoolId: string, input: CreateSubjectInput): Promise<unknown>;
  listTeacherAssignments(schoolId: string): Promise<unknown[]>;
  createTeacherAssignment(schoolId: string, input: CreateTeacherAssignmentInput): Promise<unknown>;
  deleteTeacherAssignment(schoolId: string, assignmentId: string): Promise<void>;
  listAssignments(schoolId: string, options: { classId?: string; subjectId?: string; teacherId?: string }): Promise<unknown[]>;
  createAssignment(schoolId: string, profileId: string, input: CreateAssignmentInput): Promise<unknown>;
  updateAssignment(schoolId: string, profileId: string, assignmentId: string, input: UpdateAssignmentInput): Promise<unknown>;
  publishAssignment(schoolId: string, profileId: string, assignmentId: string): Promise<unknown>;
  getAssignmentGrades(schoolId: string, assignmentId: string): Promise<unknown[]>;
  saveGrades(schoolId: string, profileId: string, assignmentId: string, grades: GradeInput[]): Promise<unknown[]>;
  publishGrades(schoolId: string, profileId: string, assignmentId: string): Promise<unknown[]>;
  listLessonPlans(schoolId: string, options: { classId?: string; subjectId?: string; teacherId?: string }): Promise<unknown[]>;
  createLessonPlan(schoolId: string, profileId: string, input: CreateLessonPlanInput): Promise<unknown>;
  updateLessonPlan(schoolId: string, profileId: string, lessonPlanId: string, input: UpdateLessonPlanInput): Promise<unknown>;
  deleteLessonPlan(schoolId: string, lessonPlanId: string): Promise<void>;
  getParentChildren(schoolId: string, profileId: string): Promise<unknown[]>;
  getStudentGradesForParent(schoolId: string, profileId: string, studentId: string): Promise<unknown>;
  computeStudentAverages(schoolId: string, studentId: string): Promise<unknown>;
}

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createPedagogyService(supabaseUrl: string, serviceRoleKey: string): PedagogyService {
  const client = createServiceClient(supabaseUrl, serviceRoleKey);

  return {
    async listClasses(schoolId) {
      const { data, error } = await client
        .from("classes")
        .select("*")
        .eq("school_id", schoolId)
        .order("name", { ascending: true });
      if (error) throw new Error(`Failed to list classes: ${error.message}`);
      return data ?? [];
    },

    async listSubjects(schoolId) {
      const { data, error } = await client
        .from("subjects")
        .select("*")
        .eq("school_id", schoolId)
        .order("cycle_key", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw new Error(`Failed to list subjects: ${error.message}`);
      return data ?? [];
    },

    async createSubject(schoolId, input) {
      const { data, error } = await client
        .from("subjects")
        .insert({
          school_id: schoolId,
          academic_year_id: input.academic_year_id ?? null,
          cycle_key: input.cycle_key,
          code: input.code,
          name: input.name,
          language: input.language,
          subject_family_code: input.subject_family_code ?? null,
          is_active: input.is_active,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(`Failed to create subject: ${error?.message}`);
      return data;
    },

    async listTeacherAssignments(schoolId) {
      const { data, error } = await client
        .from("teacher_assignments")
        .select("*, subjects(*), classes(*), profiles:teacher_id(id, display_name)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to list teacher assignments: ${error.message}`);
      return data ?? [];
    },

    async createTeacherAssignment(schoolId, input) {
      if (!input.subject_id && !input.is_tutor) {
        throw new Error("A teacher assignment must target a subject or be a tutor assignment");
      }
      const { data, error } = await client
        .from("teacher_assignments")
        .insert({
          school_id: schoolId,
          academic_year_id: input.academic_year_id ?? null,
          class_id: input.class_id,
          subject_id: input.subject_id ?? null,
          teacher_id: input.teacher_id,
          is_tutor: input.is_tutor,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(`Failed to create teacher assignment: ${error?.message}`);
      return data;
    },

    async deleteTeacherAssignment(schoolId, assignmentId) {
      const { error } = await client
        .from("teacher_assignments")
        .delete()
        .eq("id", assignmentId)
        .eq("school_id", schoolId);
      if (error) throw new Error(`Failed to delete teacher assignment: ${error.message}`);
    },

    async listAssignments(schoolId, options) {
      let query = client
        .from("assignments")
        .select("*, subjects(*), classes(*), profiles:teacher_id(id, display_name)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      if (options.classId) query = query.eq("class_id", options.classId);
      if (options.subjectId) query = query.eq("subject_id", options.subjectId);
      if (options.teacherId) query = query.eq("teacher_id", options.teacherId);
      const { data, error } = await query;
      if (error) throw new Error(`Failed to list assignments: ${error.message}`);
      return data ?? [];
    },

    async createAssignment(schoolId, profileId, input) {
      const now = new Date().toISOString();
      const { data: assignment, error } = await client
        .from("assignments")
        .insert({
          school_id: schoolId,
          academic_year_id: input.academic_year_id ?? null,
          class_id: input.class_id,
          subject_id: input.subject_id,
          teacher_id: profileId,
          title: input.title,
          type: input.type,
          scale_mode: input.scale_mode,
          scale_max: input.scale_max ?? null,
          scale_label: input.scale_label ?? null,
          coefficient: input.coefficient,
          due_date: input.due_date ?? null,
          prerequisites: input.prerequisites ?? null,
          instructions: input.instructions ?? null,
          language: input.language,
          status: "draft",
        })
        .select("*")
        .single();
      if (error || !assignment) throw new Error(`Failed to create assignment: ${error?.message}`);

      if (input.questions.length > 0) {
        const { error: qError } = await client.from("assignment_questions").insert(
          input.questions.map((q) => ({
            assignment_id: assignment.id,
            text: q.text,
            type: q.type,
            points: q.points ?? null,
            answer_space: q.answer_space ?? null,
            choices: q.choices ?? null,
            order_index: q.order_index,
          })),
        );
        if (qError) throw new Error(`Failed to create assignment questions: ${qError.message}`);
      }

      return assignment;
    },

    async updateAssignment(schoolId, profileId, assignmentId, input) {
      const update: Record<string, unknown> = {};
      if (input.title !== undefined) update.title = input.title;
      if (input.type !== undefined) update.type = input.type;
      if (input.scale_mode !== undefined) update.scale_mode = input.scale_mode;
      if (input.scale_max !== undefined) update.scale_max = input.scale_max ?? null;
      if (input.scale_label !== undefined) update.scale_label = input.scale_label ?? null;
      if (input.coefficient !== undefined) update.coefficient = input.coefficient;
      if (input.due_date !== undefined) update.due_date = input.due_date ?? null;
      if (input.prerequisites !== undefined) update.prerequisites = input.prerequisites ?? null;
      if (input.instructions !== undefined) update.instructions = input.instructions ?? null;
      if (input.language !== undefined) update.language = input.language;
      if (input.status !== undefined) {
        update.status = input.status;
        if (input.status === "published") update.published_at = new Date().toISOString();
      }
      update.updated_at = new Date().toISOString();

      const { data: assignment, error } = await client
        .from("assignments")
        .update(update)
        .eq("id", assignmentId)
        .eq("school_id", schoolId)
        .select("*")
        .single();
      if (error || !assignment) throw new Error(`Failed to update assignment: ${error?.message}`);

      if (input.questions) {
        const { error: deleteError } = await client.from("assignment_questions").delete().eq("assignment_id", assignmentId);
        if (deleteError) throw new Error(`Failed to replace assignment questions: ${deleteError.message}`);
        if (input.questions.length > 0) {
          const { error: qError } = await client.from("assignment_questions").insert(
            input.questions.map((q) => ({
              assignment_id: assignmentId,
              text: q.text,
              type: q.type,
              points: q.points ?? null,
              answer_space: q.answer_space ?? null,
              choices: q.choices ?? null,
              order_index: q.order_index,
            })),
          );
          if (qError) throw new Error(`Failed to create assignment questions: ${qError.message}`);
        }
      }

      return assignment;
    },

    async publishAssignment(schoolId, profileId, assignmentId) {
      return this.updateAssignment(schoolId, profileId, assignmentId, { status: "published" });
    },

    async getAssignmentGrades(schoolId, assignmentId) {
      const { data, error } = await client
        .from("grades")
        .select("*, students(id, matricule, first_name, last_name)")
        .eq("assignment_id", assignmentId)
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to list grades: ${error.message}`);
      return data ?? [];
    },

    async saveGrades(schoolId, profileId, assignmentId, grades) {
      const { data: existing, error: lookupError } = await client
        .from("grades")
        .select("id, assignment_id, student_id, status, value_numeric, value_text, normalized_value")
        .eq("assignment_id", assignmentId)
        .eq("school_id", schoolId);
      if (lookupError) throw new Error(`Failed to lookup grades: ${lookupError.message}`);
      const existingMap = new Map(
        (existing ?? []).map((g) => [
          `${g.assignment_id}:${g.student_id}`,
          { id: g.id as string, status: g.status as string, value_numeric: g.value_numeric, value_text: g.value_text, normalized_value: g.normalized_value },
        ]),
      );

      const now = new Date().toISOString();
      const inserts: Record<string, unknown>[] = [];
      const updates: { id: string; values: Record<string, unknown> }[] = [];

      function valueChanged(existing: unknown, incoming: number | string | undefined | null) {
        if (existing === null && (incoming === undefined || incoming === null)) return false;
        if (incoming === undefined) return false;
        return String(existing) !== String(incoming);
      }

      for (const grade of grades) {
        const key = `${assignmentId}:${grade.student_id}`;
        const previous = existingMap.get(key);

        const values: Record<string, unknown> = {
          value_numeric: grade.value_numeric ?? null,
          value_text: grade.value_text ?? null,
          normalized_value: grade.normalized_value ?? null,
          comment: grade.comment ?? null,
          updated_by: profileId,
          updated_at: now,
        };

        if (previous?.status === "published") {
          const hasChange =
            valueChanged(previous.value_numeric, grade.value_numeric) ||
            valueChanged(previous.value_text, grade.value_text) ||
            valueChanged(previous.normalized_value, grade.normalized_value);
          if (hasChange) {
            if (!grade.change_reason || String(grade.change_reason).trim() === "") {
              throw new SchoolSafeError(
                403,
                "CONDITION_DENIED",
                `Modification refusée : une cote publiée ne peut être changée sans motif (élève ${grade.student_id}).`,
                false,
              );
            }
            values.change_reason = grade.change_reason;
          }
        } else {
          values.change_reason = grade.change_reason ?? null;
        }

        if (grade.status !== undefined) {
          values.status = grade.status;
          if (grade.status === "published") values.published_at = now;
        }

        if (previous) {
          updates.push({ id: previous.id, values });
        } else {
          inserts.push({
            school_id: schoolId,
            assignment_id: assignmentId,
            student_id: grade.student_id,
            ...values,
            change_reason: grade.change_reason ?? null,
            created_by: profileId,
            created_at: now,
          });
        }
      }

      if (inserts.length > 0) {
        const { error: insertError } = await client.from("grades").insert(inserts);
        if (insertError) throw new Error(`Failed to insert grades: ${insertError.message}`);
      }

      for (const update of updates) {
        const { error: updateError } = await client.from("grades").update(update.values).eq("id", update.id);
        if (updateError) throw new Error(`Failed to update grade: ${updateError.message}`);
      }

      return this.getAssignmentGrades(schoolId, assignmentId);
    },

    async publishGrades(schoolId, profileId, assignmentId) {
      const now = new Date().toISOString();
      const { error } = await client
        .from("grades")
        .update({ status: "published", published_at: now, updated_by: profileId, updated_at: now })
        .eq("assignment_id", assignmentId)
        .eq("school_id", schoolId);
      if (error) throw new Error(`Failed to publish grades: ${error.message}`);
      return this.getAssignmentGrades(schoolId, assignmentId);
    },

    async listLessonPlans(schoolId, options) {
      let query = client
        .from("lesson_plans")
        .select("*, subjects(*), classes(*), profiles:teacher_id(id, display_name)")
        .eq("school_id", schoolId)
        .order("lesson_date", { ascending: false });
      if (options.classId) query = query.eq("class_id", options.classId);
      if (options.subjectId) query = query.eq("subject_id", options.subjectId);
      if (options.teacherId) query = query.eq("teacher_id", options.teacherId);
      const { data, error } = await query;
      if (error) throw new Error(`Failed to list lesson plans: ${error.message}`);
      return data ?? [];
    },

    async createLessonPlan(schoolId, profileId, input) {
      const { data, error } = await client
        .from("lesson_plans")
        .insert({
          school_id: schoolId,
          academic_year_id: input.academic_year_id ?? null,
          class_id: input.class_id,
          subject_id: input.subject_id,
          teacher_id: profileId,
          title: input.title,
          lesson_date: input.lesson_date,
          objectives: input.objectives ?? null,
          materials: input.materials ?? null,
          procedure: input.procedure ?? null,
          homework_assignment_id: input.homework_assignment_id ?? null,
          attachments: input.attachments,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(`Failed to create lesson plan: ${error?.message}`);
      return data;
    },

    async updateLessonPlan(schoolId, profileId, lessonPlanId, input) {
      const update: Record<string, unknown> = {};
      if (input.title !== undefined) update.title = input.title;
      if (input.lesson_date !== undefined) update.lesson_date = input.lesson_date;
      if (input.objectives !== undefined) update.objectives = input.objectives ?? null;
      if (input.materials !== undefined) update.materials = input.materials ?? null;
      if (input.procedure !== undefined) update.procedure = input.procedure ?? null;
      if (input.homework_assignment_id !== undefined) update.homework_assignment_id = input.homework_assignment_id ?? null;
      if (input.attachments !== undefined) update.attachments = input.attachments;
      update.updated_by = profileId;
      update.updated_at = new Date().toISOString();

      const { data, error } = await client
        .from("lesson_plans")
        .update(update)
        .eq("id", lessonPlanId)
        .eq("school_id", schoolId)
        .select("*")
        .single();
      if (error || !data) throw new Error(`Failed to update lesson plan: ${error?.message}`);
      return data;
    },

    async deleteLessonPlan(schoolId, lessonPlanId) {
      const { error } = await client.from("lesson_plans").delete().eq("id", lessonPlanId).eq("school_id", schoolId);
      if (error) throw new Error(`Failed to delete lesson plan: ${error.message}`);
    },

    async getParentChildren(schoolId, profileId) {
      const { data, error } = await client
        .from("student_guardians")
        .select("id, guardian_type, is_primary, students!inner(id, matricule, first_name, last_name, photo_path, class_id, lifecycle_status, classes(name))")
        .eq("profile_id", profileId)
        .eq("students.school_id", schoolId)
        .eq("students.lifecycle_status", "active");
      if (error) throw new Error(`Failed to list parent children: ${error.message}`);
      return data ?? [];
    },

    async getStudentGradesForParent(schoolId, profileId, studentId) {
      const { data: guardians, error: guardianError } = await client
        .from("student_guardians")
        .select("id")
        .eq("profile_id", profileId)
        .eq("student_id", studentId)
        .eq("school_id", schoolId)
        .limit(1);
      if (guardianError) throw new Error(`Failed to verify guardian: ${guardianError.message}`);
      if (!guardians || guardians.length === 0) {
        throw new Error("Vous n’êtes pas autorisé à consulter les cotes de cet élève.");
      }

      const { data: student, error: studentError } = await client
        .from("students")
        .select("id, matricule, first_name, last_name, photo_path, class_id, classes(name)")
        .eq("id", studentId)
        .eq("school_id", schoolId)
        .eq("lifecycle_status", "active")
        .single();
      if (studentError || !student) throw new Error("Élève introuvable.");

      const { data: grades, error: gradesError } = await client
        .from("grades")
        .select("*, assignments(*, subjects(*))")
        .eq("student_id", studentId)
        .eq("school_id", schoolId)
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (gradesError) throw new Error(`Failed to list grades: ${gradesError.message}`);

      return { student, grades: grades ?? [] };
    },

    async computeStudentAverages(schoolId, studentId) {
      const { data: student, error: studentError } = await client
        .from("students")
        .select("id, matricule, first_name, last_name, class_id, classes(name)")
        .eq("id", studentId)
        .eq("school_id", schoolId)
        .eq("lifecycle_status", "active")
        .single();
      if (studentError || !student) throw new Error("Élève introuvable.");

      const { data: subjects, error: subjectsError } = await client
        .from("subjects")
        .select("id, name, code, cycle_key")
        .eq("school_id", schoolId);
      if (subjectsError) throw new Error(`Failed to list subjects: ${subjectsError.message}`);

      const { data: grades, error: gradesError } = await client
        .from("grades")
        .select("*, assignments(id, subject_id, coefficient, scale_max, type)")
        .eq("student_id", studentId)
        .eq("school_id", schoolId)
        .eq("status", "published");
      if (gradesError) throw new Error(`Failed to list grades: ${gradesError.message}`);

      const averages = computeStudentAverages(studentId, grades ?? [], (subjects ?? []) as SubjectInfo[]);
      return { student, averages };
    },
  };
}
