import { z } from "zod";

export const qrPayloadPattern = /^schoolsafe:\/\/card\/([^/]+)\/([^/]+)$/;

export const securityScanSchema = z.object({
  qr_payload: z.string().min(1),
  event_type: z.enum(["entry", "exit", "exit_prepared", "incident"]),
  location_id: z.string().uuid(),
  authorized_person_id: z.string().uuid().optional(),
  manual_override: z.boolean().default(false),
  note: z.string().max(500).optional(),
});

export type SecurityScanInput = z.infer<typeof securityScanSchema>;

export const lockdownSchema = z.object({
  active: z.boolean(),
});

export type LockdownInput = z.infer<typeof lockdownSchema>;

export type SecurityEventDecision = "allowed" | "denied" | "manual_override";

export type SecurityScanResult = {
  decision: SecurityEventDecision;
  reason?: string;
  student: {
    id: string;
    matricule: string;
    first_name: string;
    last_name: string;
    class_name: string | null;
    photo_path: string | null;
  } | null;
  authorized_persons: Array<{
    id: string;
    full_name: string;
    guardian_type: string;
    is_primary: boolean;
    is_authorized_pickup: boolean;
    phone: string | null;
  }>;
  event: {
    id: string;
    event_type: string;
    decision: SecurityEventDecision;
    occurred_at: string;
  };
  alert?: {
    id: string;
    severity: string;
    title: string;
  };
};
