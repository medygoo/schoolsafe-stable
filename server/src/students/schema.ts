import { z } from "zod";

const guardianTypeSchema = z.enum(["pere", "mere", "tuteur", "autre"]);

const existingParentSchema = z.object({
  mode: z.literal("existing"),
  profile_id: z.string().uuid(),
  guardian_type: guardianTypeSchema,
}).strict();

const invitedParentSchema = z.object({
  mode: z.literal("invite"),
  email: z.string().email(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(5).max(40).optional(),
  guardian_type: guardianTypeSchema,
}).strict();

export const createStudentDraftSchema = z.object({
  matricule: z.string().trim().min(1).max(80),
  first_name: z.string().trim().min(1).max(100),
  middle_name: z.string().trim().max(100).optional(),
  last_name: z.string().trim().min(1).max(100),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.enum(["M", "F"]).optional(),
  lifecycle_status: z.literal("draft").optional(),
  academic_year_id: z.string().uuid(),
  planned_class_id: z.string().uuid(),
  enrollment_starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  primary_parent: z.discriminatedUnion("mode", [existingParentSchema, invitedParentSchema]),
}).strict();

export const studentListQuerySchema = z.object({
  status: z.enum(["draft", "active"]),
  query: z.string().trim().max(120).optional(),
}).strict();

export const parentSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(120),
}).strict();

export type CreateStudentDraftPayload = z.infer<typeof createStudentDraftSchema>;
export type StudentListQuery = z.infer<typeof studentListQuerySchema>;
