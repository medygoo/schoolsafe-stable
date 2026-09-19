import { z } from "zod";

export const cycleKeySchema = z.enum(["nursery", "primary", "secondary"]);

export const schoolIdentitySchema = z.object({
  name_fr: z.string().min(1),
  name_en: z.string().optional(),
  legal_name: z.string().optional(),
  school_type: z.string().min(1).default("Privée agréée"),
  approval_code: z.string().optional(),
});

export const academicYearSchema = z.object({
  label: z.string().min(1),
  starts_on: z.string().date(),
  ends_on: z.string().date(),
  periods: z.enum(["Trimestres", "Semestres"]),
});

export const schoolContactSchema = z.object({
  country: z.string().min(1).default("République démocratique du Congo"),
  province: z.string().min(1).default("Kinshasa"),
  city: z.string().min(1).default("Kinshasa"),
  address: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website_url: z.string().url().optional().or(z.literal("")),
  website_mode: z.string().min(1).default("Créer un nouveau site SchoolSafe"),
  public_news: z.string().min(1).default("Après validation"),
  public_gallery: z.string().min(1).default("Après validation et consentement"),
  public_honors: z.string().min(1).default("Après validation"),
});

export const schoolBrandSchema = z.object({
  primary_color: z.string().min(1).default("#071a3d"),
  accent_color: z.string().min(1).default("#e9a515"),
  document_footer: z.string().optional(),
  logo_path: z.string().optional(),
});

export const setupSchoolPayloadSchema = z.object({
  token: z.string().min(1),
  identity: schoolIdentitySchema,
  cycles: z.array(cycleKeySchema).min(1),
  academic_year: academicYearSchema,
  contact: schoolContactSchema,
  brand: schoolBrandSchema.default({}),
});

export const setupAdminPayloadSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
});

export const validateTokenPayloadSchema = z.object({
  token: z.string().min(1),
});

export type SetupSchoolPayload = z.infer<typeof setupSchoolPayloadSchema>;
export type SetupAdminPayload = z.infer<typeof setupAdminPayloadSchema>;
export type ValidateTokenPayload = z.infer<typeof validateTokenPayloadSchema>;

export type SetupResult = {
  school_id: string;
  academic_year_id: string;
};

export type AdminSetupResult = {
  user_id: string;
  profile_id: string;
};

export type ConfigResponse = {
  setup_available: boolean;
  auth_mode: string;
};
