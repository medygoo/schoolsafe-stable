import type { AuthDatabase } from "../authnative/service.js";
import { hashSessionToken } from "../authnative/tokens.js";
import { SchoolSafeError } from "../http/errors.js";
import { approvalTokenSchema } from "./account-registration-schema.js";

export interface AccountRegistrationResult { request_id: string; status: "pending" | "approved" | "rejected" }
export interface AccountApprovalReview extends AccountRegistrationResult {
  first_name: string; last_name: string; email: string; phone: string;
}
export const approvalDenied = () => new SchoolSafeError(403, "ACCESS_DENIED", "Approbation indisponible", false);
export function createApprovalService(db: AuthDatabase) {
  return {
    async review(token: string): Promise<AccountApprovalReview> {
      if (!approvalTokenSchema.safeParse(token).success) throw approvalDenied();
      try {
        const result = await db.query<{result: AccountApprovalReview}>(
          "select api.account_registration_review($1) result", [hashSessionToken(token)]);
        const row = result.rows[0]?.result;
        if (!row || row.status !== "pending") throw approvalDenied();
        // Public projection never forwards unanticipated database properties.
        return {request_id: row.request_id, first_name: row.first_name, last_name: row.last_name,
          email: row.email, phone: row.phone, status: row.status};
      } catch { throw approvalDenied(); }
    },
    async decide(token: string, decision: "approve" | "reject"): Promise<AccountRegistrationResult> {
      if (!approvalTokenSchema.safeParse(token).success || !["approve", "reject"].includes(decision)) throw approvalDenied();
      try {
        const result = await db.query<{result: AccountRegistrationResult}>(
          "select api.account_registration_decide($1,$2) result", [hashSessionToken(token), decision]);
        const row = result.rows[0]?.result;
        if (!row || !["approved", "rejected"].includes(row.status)) throw approvalDenied();
        return {request_id: row.request_id, status: row.status};
      } catch { throw approvalDenied(); }
    },
  };
}
export type ApprovalService = ReturnType<typeof createApprovalService>;
