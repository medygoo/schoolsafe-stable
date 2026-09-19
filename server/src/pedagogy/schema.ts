import { z } from "zod";

export const cycleKeySchema = z.enum(["nursery", "primary", "secondary"]);
export const languageSchema = z.enum(["FR", "EN"]);

export const createSubjectSchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  cycle_key: cycleKeySchema,
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  language: languageSchema,
  subject_family_code: z.string().max(50).optional(),
  is_active: z.boolean().default(true),
});

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const createTeacherAssignmentSchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  class_id: z.string().uuid(),
  subject_id: z.string().uuid().optional(),
  teacher_id: z.string().uuid(),
  is_tutor: z.boolean().default(false),
});

export type CreateTeacherAssignmentInput = z.infer<typeof createTeacherAssignmentSchema>;

export const assignmentQuestionSchema = z.object({
  text: z.string().min(1),
  type: z.string().min(1),
  points: z.coerce.number().nonnegative().optional(),
  answer_space: z.string().optional(),
  choices: z.string().optional(),
  order_index: z.coerce.number().int().nonnegative().default(0),
});

export type AssignmentQuestionInput = z.infer<typeof assignmentQuestionSchema>;

export const createAssignmentSchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  title: z.string().min(1).max(300),
  type: z.enum(["homework", "quiz", "exam", "compensatory"]),
  scale_mode: z.enum(["numeric", "qualitative", "custom"]).default("numeric"),
  scale_max: z.coerce.number().nonnegative().optional(),
  scale_label: z.string().max(100).optional(),
  coefficient: z.coerce.number().positive().default(1),
  due_date: z.string().date().optional(),
  prerequisites: z.string().max(2000).optional(),
  instructions: z.string().max(5000).optional(),
  language: languageSchema,
  questions: z.array(assignmentQuestionSchema).default([]),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  type: z.enum(["homework", "quiz", "exam", "compensatory"]).optional(),
  scale_mode: z.enum(["numeric", "qualitative", "custom"]).optional(),
  scale_max: z.coerce.number().nonnegative().optional(),
  scale_label: z.string().max(100).optional(),
  coefficient: z.coerce.number().positive().optional(),
  due_date: z.string().date().optional(),
  prerequisites: z.string().max(2000).optional(),
  instructions: z.string().max(5000).optional(),
  language: languageSchema.optional(),
  status: z.enum(["draft", "published"]).optional(),
  questions: z.array(assignmentQuestionSchema).optional(),
});

export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

export const gradeInputSchema = z.object({
  student_id: z.string().uuid(),
  value_numeric: z.coerce.number().optional(),
  value_text: z.string().max(500).optional(),
  normalized_value: z.coerce.number().optional(),
  comment: z.string().max(1000).optional(),
  change_reason: z.string().max(500).optional(),
  status: z.enum(["draft", "published"]).optional(),
});

export type GradeInput = z.infer<typeof gradeInputSchema>;

export const createLessonPlanSchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  title: z.string().min(1).max(300),
  lesson_date: z.string().date(),
  objectives: z.string().max(2000).optional(),
  materials: z.string().max(2000).optional(),
  procedure: z.string().max(5000).optional(),
  homework_assignment_id: z.string().uuid().optional(),
  attachments: z.array(z.object({ name: z.string(), url: z.string(), type: z.string() })).default([]),
});

export type CreateLessonPlanInput = z.infer<typeof createLessonPlanSchema>;

export const updateLessonPlanSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  lesson_date: z.string().date().optional(),
  objectives: z.string().max(2000).optional(),
  materials: z.string().max(2000).optional(),
  procedure: z.string().max(5000).optional(),
  homework_assignment_id: z.string().uuid().optional(),
  attachments: z.array(z.object({ name: z.string(), url: z.string(), type: z.string() })).optional(),
});

export type UpdateLessonPlanInput = z.infer<typeof updateLessonPlanSchema>;
