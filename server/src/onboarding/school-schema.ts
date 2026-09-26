import { z } from "zod";
import { schoolIdentitySchema, cycleKeySchema, academicYearSchema, schoolContactSchema, schoolBrandSchema } from "../setup/schema.js";

export const onboardingSchoolSchema = z.object({
  identity: schoolIdentitySchema.extend({
    name_fr: z.string().trim().min(1).max(200),
    name_en: z.string().trim().max(200).optional(),
    legal_name: z.string().trim().max(300).optional(),
    school_type: schoolIdentitySchema.shape.school_type.removeDefault().trim().min(1).max(100).default("Privée agréée"),
  }).strict(),
  cycles: z.array(cycleKeySchema).min(1).max(3).refine(values => new Set(values).size === values.length),
  academic_year: academicYearSchema.extend({
    label: z.string().trim().min(1).max(100),
    periods: academicYearSchema.shape.periods.default("Trimestres"),
  }).strict().refine(year => year.starts_on < year.ends_on, "Invalid date order"),
  contact: schoolContactSchema.strict(),
  brand: schoolBrandSchema.omit({logo_path: true}).strict(),
}).strict();
export type OnboardingSchoolPayload = z.infer<typeof onboardingSchoolSchema>;
