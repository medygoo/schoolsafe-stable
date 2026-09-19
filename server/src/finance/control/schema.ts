import { z } from "zod";

export const currencySchema = z.enum(["USD", "CDF"]);
export const cycleKeySchema = z.enum(["nursery", "primary", "secondary"]);

export const createFeeStructureSchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  cycle_key: cycleKeySchema,
  label: z.string().min(1).max(200),
  amount: z.coerce.number().nonnegative(),
  currency: currencySchema.default("USD"),
  due_date: z.string().date().optional(),
  is_active: z.boolean().default(true),
});

export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;

export const createPaymentSchema = z.object({
  student_fee_id: z.string().uuid(),
  amount: z.coerce.number().positive(),
  currency: currencySchema.default("USD"),
  received_at: z.string().datetime().optional(),
  receipt_no: z.string().max(100).optional(),
  mode: z.string().max(50).default("cash"),
  reference: z.string().max(200).default(""),
  metadata: z.record(z.unknown()).default({}),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const createFeeControlCampaignSchema = z.object({
  fee_structure_id: z.string().uuid(),
  label: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  classes: z.array(z.string().uuid()).default([]),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  assignees: z.array(z.string().uuid()).default([]),
});

export type CreateFeeControlCampaignInput = z.infer<typeof createFeeControlCampaignSchema>;

export const createFeeControlScanSchema = z.object({
  campaign_id: z.string().uuid(),
  student_id: z.string().uuid(),
  location_id: z.string().uuid().optional(),
  result: z.enum(["ok", "partial", "unpaid", "exempted", "anomaly"]),
  notes: z.string().max(500).optional(),
});

export type CreateFeeControlScanInput = z.infer<typeof createFeeControlScanSchema>;
