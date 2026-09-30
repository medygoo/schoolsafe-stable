// SchoolSafe M1.1 — Mon école native settings schema
// Zod schemas for GET/PUT /native/school/settings validation.
// Must match api.school_settings_read/update RPC contract exactly.
import { z } from "zod";

export const schoolSettingsIdentitySchema = z.object({
  name: z.string().min(1).max(200).optional().nullable(),
  name_en: z.string().max(200).optional().nullable(),
  legal_name: z.string().max(200).optional().nullable(),
  school_type: z.string().max(100).optional().nullable(),
  approval_code: z.string().max(50).optional().nullable(),
  currency: z.string().max(10).optional().nullable(),
  motto: z.string().max(500).optional().nullable(),
  bank_name: z.string().max(200).optional().nullable(),
  bank_account: z.string().max(100).optional().nullable(),
  tax_id: z.string().max(100).optional().nullable(),
  director_name: z.string().max(200).optional().nullable(),
  official_language: z.string().max(50).optional().nullable(),
});

export const schoolSettingsBrandSchema = z.object({
  primary_color: z.string().max(20).optional().nullable(),
  accent_color: z.string().max(20).optional().nullable(),
  document_footer: z.string().max(500).optional().nullable(),
  logo_path: z.string().max(500).optional().nullable(),
});

export const schoolSettingsContactSchema = z.object({
  country: z.string().max(100).optional().nullable(),
  province: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  website_url: z.string().url().max(500).optional().nullable(),
  website_mode: z.string().max(50).optional().nullable(),
  public_news: z.boolean().optional().nullable(),
  public_gallery: z.boolean().optional().nullable(),
  public_honors: z.boolean().optional().nullable(),
});

export const updateSchoolSettingsSchema = z.object({
  identity: schoolSettingsIdentitySchema.optional(),
  brand: schoolSettingsBrandSchema.optional(),
  contact: schoolSettingsContactSchema.optional(),
});

export type UpdateSchoolSettingsPayload = z.infer<typeof updateSchoolSettingsSchema>;