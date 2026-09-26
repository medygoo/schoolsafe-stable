import type { AuthPool } from "../db/pool.js";
import type { EmailService } from "../email/service.js";
import { generateSessionToken, hashSessionToken } from "../authnative/tokens.js";
import type {
  RegistrationDecisionBody,
  RegistrationDecisionResult,
  RegistrationIssueApprovalResult,
  RegistrationReviewBody,
  RegistrationReviewResult,
} from "./registration-approval-schema.js";

export interface RegistrationApprovalDependencies {
  pool: AuthPool;
  email: EmailService;
  approverEmail: string;
  approvalUrl: string;
  ttlSeconds: number;
}

export interface RegistrationApprovalService {
  issueApproval(requestId: string): Promise<RegistrationIssueApprovalResult>;
  review(token: string): Promise<RegistrationReviewResult>;
  decide(token: string, decision: "approve" | "reject"): Promise<RegistrationDecisionResult>;
}

export function createRegistrationApprovalService(
  deps: RegistrationApprovalDependencies,
): RegistrationApprovalService {
  return {
    async issueApproval(requestId) {
      const rawToken = generateSessionToken();
      const tokenHash = hashSessionToken(rawToken);
      const expiresAt = new Date(Date.now() + deps.ttlSeconds * 1000).toISOString();

      const issueResult = await deps.pool.query<{ result: RegistrationIssueApprovalResult }>(
        "select api.school_registration_issue_approval($1::uuid,$2,$3::timestamptz) result",
        [requestId, tokenHash, expiresAt],
      );
      const row = issueResult.rows[0]?.result;
      if (!row?.request_id || row.status !== "pending") {
        throw new Error("Failed to issue approval token");
      }

      // Récupérer les infos école pour l'e-mail via review (sans mutation)
      let summary: RegistrationReviewResult | null = null;
      try {
        summary = await this.review(rawToken);
      } catch {
        // Si review échoue ici, on ne peut pas envoyer d'e-mail utile mais le token est stocké
      }

      const schoolName = summary?.school_name ?? "École inconnue";
      const adminName = summary
        ? `${summary.admin.first_name ?? ""} ${summary.admin.last_name ?? ""}`.trim()
        : "Administrateur inconnu";
      const adminEmail = summary?.admin.email ?? "";
      const link = `${deps.approvalUrl}${rawToken}`;

      const sendResult = await deps.email.send({
        to: [{ email: deps.approverEmail }],
        subject: "SchoolSafe — nouvelle école à approuver",
        html: `<p>Bonjour,</p>
<p>Une nouvelle école a été préparée et attend votre approbation.</p>
<ul>
<li><strong>École :</strong> ${schoolName}</li>
<li><strong>Administrateur :</strong> ${adminName} (${adminEmail})</li>
</ul>
<p><a href="${link}">Approuver ou rejeter cette inscription</a></p>
<p>Ce lien expire dans ${Math.round(deps.ttlSeconds / 3600)} heures.</p>`,
        text: `Bonjour,\n\nUne nouvelle école a été préparée et attend votre approbation.\n\nÉcole : ${schoolName}\nAdministrateur : ${adminName} (${adminEmail})\n\nLien d'approbation : ${link}\n\nCe lien expire dans ${Math.round(deps.ttlSeconds / 3600)} heures.`,
      });

      if (sendResult.status === "sent") {
        await deps.pool.query(
          "select api.school_registration_mark_email_sent($1::uuid,$2)",
          [requestId, sendResult.messageId ?? null],
        );
      } else {
        throw new Error(`Approval email failed: ${sendResult.error ?? sendResult.status}`);
      }

      return row;
    },

    async review(token) {
      const tokenHash = hashSessionToken(token);
      const result = await deps.pool.query<{ result: RegistrationReviewResult }>(
        "select api.school_registration_review($1) result",
        [tokenHash],
      );
      const row = result.rows[0]?.result;
      if (!row?.request_id) {
        throw new Error("Invalid or expired approval token");
      }
      return row;
    },

    async decide(token, decision) {
      const tokenHash = hashSessionToken(token);
      const result = await deps.pool.query<{ result: RegistrationDecisionResult }>(
        "select api.school_registration_decide($1,$2) result",
        [tokenHash, decision],
      );
      const row = result.rows[0]?.result;
      if (!row?.request_id || !["approved", "rejected"].includes(row.status)) {
        throw new Error("Approval decision failed or token invalid");
      }
      return row;
    },
  };
}