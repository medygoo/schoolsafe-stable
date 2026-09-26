import { z } from "zod";

// SQL auth.normalize_login remains authoritative for canonical Congolese phones.
export const accountRegistrationSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: z.string().trim().min(9).max(40).regex(/^[+0-9().\s-]+$/),
  password: z.string().min(8).max(64),
}).strict();
export type AccountRegistrationPayload = z.infer<typeof accountRegistrationSchema>;
export const approvalTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const approvalReviewSchema = z.object({ token: approvalTokenSchema }).strict();
export const approvalDecisionSchema = approvalReviewSchema.extend({ decision: z.enum(["approve", "reject"]) }).strict();
