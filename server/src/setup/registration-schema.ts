import { z } from "zod";
import {
  academicYearSchema,
  cycleKeySchema,
  schoolBrandSchema,
  schoolContactSchema,
  schoolIdentitySchema,
} from "./schema.js";

export const registrationAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  phone: z.string().optional(),
});

export const registrationPayloadSchema = z.object({
  identity: schoolIdentitySchema,
  cycles: z.array(cycleKeySchema).min(1),
  academic_year: academicYearSchema,
  contact: schoolContactSchema,
  brand: schoolBrandSchema.default({}),
  admin: registrationAdminSchema,
});

export type RegistrationPayload = z.infer<typeof registrationPayloadSchema>;
export type RegistrationAdminInput = z.infer<typeof registrationAdminSchema>;

export type RegistrationPrepareResult = {
  request_id: string;
  status: "pending";
};