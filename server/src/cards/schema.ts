import { z } from "zod";

export const requestCardPrintItemSchema = z.object({
  student_id: z.string().uuid(),
  format: z.enum(["badge", "carte"]),
  front_image_base64: z.string().min(1),
  back_image_base64: z.string().min(1),
  academic_year_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({})
});

export const requestCardPrintSchema = z.union([
  requestCardPrintItemSchema,
  z.array(requestCardPrintItemSchema).min(1).max(100)
]);

export type RequestCardPrintItem = z.infer<typeof requestCardPrintItemSchema>;
export type RequestCardPrintInput = z.infer<typeof requestCardPrintSchema>;

export function normalizeCardPrintInput(input: RequestCardPrintInput): RequestCardPrintItem[] {
  return Array.isArray(input) ? input : [input];
}
