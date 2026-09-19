import { z } from "zod";

export const evaluateRulesSchema = z.object({
  event_type: z.enum(["STUDENT_ENTERED", "FEE_OVERDUE_CHECK", "PAYMENT_RECORDED"]),
  student_id: z.string().uuid().optional(),
  payload: z.record(z.unknown()).default({}),
});

export type EvaluateRulesInput = z.infer<typeof evaluateRulesSchema>;
