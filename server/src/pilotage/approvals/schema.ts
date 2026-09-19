import { z } from "zod";

export const approvalRequestTypeSchema = z.enum([
  "payment_cancel",
  "grade_change",
  "fee_waiver",
  "staff_role_change",
  "discount_override",
]);

export const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);

export const createApprovalRequestSchema = z.object({
  request_type: approvalRequestTypeSchema,
  entity_type: z.string().min(1).max(100),
  entity_id: z.string().uuid(),
  expected_version: z.coerce.number().int().positive().default(1),
  payload: z.record(z.unknown()).default({}),
  reason: z.string().max(1000).optional(),
});

export type CreateApprovalRequestInput = z.infer<typeof createApprovalRequestSchema>;

export const decideApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().max(1000).optional(),
});

export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;

export const listApprovalRequestsSchema = z.object({
  status: approvalStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListApprovalRequestsInput = z.infer<typeof listApprovalRequestsSchema>;
