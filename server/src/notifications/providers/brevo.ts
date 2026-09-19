import type { NotificationProvider, NotificationRecord, SendAttempt } from "../types.js";

export type BrevoConfig = {
  apiKey: string;
  senderEmail: string;
  senderName?: string;
};

export function createBrevoEmailProvider(config: BrevoConfig): NotificationProvider {
  return {
    name: "BREVO",
    async send(record): Promise<SendAttempt> {
      const payload = {
        sender: { email: config.senderEmail, name: config.senderName ?? "SchoolSafe" },
        to: [{ email: record.recipientEmail, name: record.title }],
        subject: record.title ?? "Notification SchoolSafe",
        htmlContent: `<p>${record.message}</p>`,
        textContent: record.message,
      };
      try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-key": config.apiKey },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const body = await response.text();
          return { status: "FAILED", error: `Brevo HTTP ${response.status}: ${body}` };
        }
        const result = (await response.json()) as { messageId?: string };
        return { status: "SENT", providerMessageId: result.messageId };
      } catch (err) {
        return { status: "FAILED", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
