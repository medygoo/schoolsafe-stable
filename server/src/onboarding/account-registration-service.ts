import type { AuthDatabase } from "../authnative/service.js";
import { hashPassword } from "../authnative/passwords.js";
import { generateSessionToken, hashSessionToken } from "../authnative/tokens.js";
import { SchoolSafeError } from "../http/errors.js";
import { accountRegistrationSchema } from "./account-registration-schema.js";
import { createApprovalService, type AccountRegistrationResult } from "./approval-service.js";
import type { GoogleMailDelivery } from "./google-mail-delivery.js";

const unavailable = () => new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Inscription temporairement indisponible", true);
export function createAccountRegistrationService(deps: {
  db: AuthDatabase; delivery?: GoogleMailDelivery; approvalUrl?: string; ttlSeconds?: number;
}) {
  let approvalUrl: URL | undefined;
  try {
    const candidate = new URL(deps.approvalUrl ?? "");
    if (candidate.protocol === "https:" && !candidate.username && !candidate.password) approvalUrl = candidate;
  } catch { /* disabled configuration fails closed before admitting a request */ }
  const ttl = Math.min(deps.ttlSeconds ?? 172800, 172800);
  return {
    async register(input: unknown, ip: string): Promise<AccountRegistrationResult> {
      if (!deps.delivery || !approvalUrl || !Number.isInteger(ttl) || ttl <= 0) throw unavailable();
      const {password, ...payload} = accountRegistrationSchema.parse(input);
      const passwordHash = await hashPassword(password);
      let requestId: string | undefined;
      let deliveryConfirmed = false;
      try {
        const prepared = await deps.db.query<{result: AccountRegistrationResult}>(
          "select api.account_registration_prepare($1::jsonb,$2,$3::inet) result",
          [JSON.stringify(payload), passwordHash, ip]);
        requestId = prepared.rows[0]?.result?.request_id;
        if (!requestId) throw unavailable();
        const token = generateSessionToken();
        await deps.db.query("select api.account_registration_issue_approval($1,$2,$3::timestamptz) result",
          [requestId, hashSessionToken(token), new Date(Date.now() + ttl * 1000).toISOString()]);
        const review = await createApprovalService(deps.db).review(token);
        const link = new URL(approvalUrl);
        link.hash = "account-approval=" + token;
        await deps.delivery({first_name: review.first_name, last_name: review.last_name,
          email: review.email, phone: review.phone, approvalLink: link.toString()});
        deliveryConfirmed = true;
        await deps.db.query("select api.account_registration_mark_email_sent($1)", [requestId]);
        return {request_id: requestId, status: "pending"};
      } catch (error) {
        if (requestId && !deliveryConfirmed) {
          try {
            // The guarded RPC refuses deletion if approval won a race or delivery was marked.
            await deps.db.query("select api.account_registration_cancel_delivery_failure($1) result", [requestId]);
          } catch { throw unavailable(); }
        }
        const code = (error as {code?: string})?.code;
        if (!requestId && code === "23505") throw new SchoolSafeError(409, "IDEMPOTENCY_DUPLICATE", "Inscription indisponible", false);
        if (!requestId && code === "P0001") throw new SchoolSafeError(429, "DEPENDENCY_UNAVAILABLE", "Inscription temporairement indisponible", true);
        if (!requestId && code === "23514") throw new SchoolSafeError(400, "VALIDATION_INVALID", "Donnée invalide", false);
        throw unavailable();
      }
    },
  };
}
export type AccountRegistrationService = ReturnType<typeof createAccountRegistrationService>;
