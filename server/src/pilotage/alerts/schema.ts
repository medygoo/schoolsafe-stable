import { z } from "zod";

export const alertSeveritySchema = z.enum(["critical", "important", "attention", "information"]);
export const alertStatusSchema = z.enum(["open", "acknowledged", "resolved", "cancelled"]);

export const listAlertsSchema = z.object({
  status: alertStatusSchema.optional(),
  severity: alertSeveritySchema.optional(),
  domain: z.enum(["security", "attendance", "finance", "pedagogy", "approval"]).optional(),
  assigned_to: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListAlertsInput = z.infer<typeof listAlertsSchema>;

export const acknowledgeAlertSchema = z.object({
  assigned_to: z.string().uuid().optional(),
});

export type AcknowledgeAlertInput = z.infer<typeof acknowledgeAlertSchema>;

export const resolveAlertSchema = z.object({
  resolution_code: z.string().max(50).optional(),
  note: z.string().max(1000).optional(),
});

export type ResolveAlertInput = z.infer<typeof resolveAlertSchema>;
