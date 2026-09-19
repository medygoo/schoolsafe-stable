import { z } from "zod";

export const schoolIdentitySchema = z.object({
  name: z.string().min(1),
  name_en: z.string().optional(),
  legal_name: z.string().optional(),
  school_type: z.string().optional(),
  approval_code: z.string().optional(),
});

export const schoolBrandSchema = z.object({
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  document_footer: z.string().optional(),
  logo_path: z.string().optional(),
});

export const schoolContactSchema = z.object({
  country: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  website_url: z.string().url().optional().or(z.literal("")),
  website_mode: z.string().optional(),
  public_news: z.string().optional(),
  public_gallery: z.string().optional(),
  public_honors: z.string().optional(),
});

export const updateSchoolSettingsSchema = z.object({
  identity: schoolIdentitySchema.optional(),
  brand: schoolBrandSchema.optional(),
  contact: schoolContactSchema.optional(),
});

export const inviteStaffSchema = z.object({
  email: z.string().email(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
  role_ids: z.array(z.string().uuid()).min(1),
});

export const updateStaffRolesSchema = z.object({
  role_ids: z.array(z.string().uuid()).min(1),
});

export const toggleStaffActiveSchema = z.object({
  is_active: z.boolean(),
});

export const resendInviteSchema = z.object({}).optional();

export const createAcademicYearSchema = z.object({
  label: z.string().min(1),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periods: z.enum(["Trimestres", "Semestres"]),
});

export const updateAcademicYearSchema = createAcademicYearSchema.partial();

export const toggleCycleSchema = z.object({
  is_active: z.boolean(),
});

export type UpdateSchoolSettingsPayload = z.infer<typeof updateSchoolSettingsSchema>;
export type InviteStaffPayload = z.infer<typeof inviteStaffSchema>;
export type UpdateStaffRolesPayload = z.infer<typeof updateStaffRolesSchema>;
export type ToggleStaffActivePayload = z.infer<typeof toggleStaffActiveSchema>;
export type CreateAcademicYearPayload = z.infer<typeof createAcademicYearSchema>;
export type UpdateAcademicYearPayload = z.infer<typeof updateAcademicYearSchema>;
export type ToggleCyclePayload = z.infer<typeof toggleCycleSchema>;
