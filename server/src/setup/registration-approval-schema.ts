import { z } from "zod";

export const registrationReviewBodySchema = z.object({
  token: z.string().min(1),
});

export const registrationDecisionBodySchema = z.object({
  token: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
});

export type RegistrationReviewBody = z.infer<typeof registrationReviewBodySchema>;
export type RegistrationDecisionBody = z.infer<typeof registrationDecisionBodySchema>;

export type RegistrationReviewResult = {
  request_id: string;
  school_name: string;
  school_type: string;
  cycles: string[];
  academic_year_label: string;
  contact: {
    country: string | null;
    province: string | null;
    city: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
  admin: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  };
  status: "pending" | "approved" | "rejected";
};

export type RegistrationIssueApprovalResult = {
  request_id: string;
  status: "pending";
};

export type RegistrationDecisionResult = {
  request_id: string;
  status: "approved" | "rejected";
};