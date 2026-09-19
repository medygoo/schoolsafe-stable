import type { NotificationProvider, NotificationRecord, SendAttempt } from "../types.js";

export type ZohoConfig = {
  apiKey: string;
  senderEmail: string;
  senderName?: string;
  region?: string;
};

export function createZohoEmailProvider(
  config: ZohoConfig,
  fallback?: NotificationProvider,
): NotificationProvider {
  return {
    name: "ZOHO",
    async send(record): Promise<SendAttempt> {
      const account = config.senderEmail.split("@")[1] ?? "";
      const url = `https://mail.zoho.${config.region ?? "com"}/api/accounts/${account}/messages`;
      const payload = {
        fromAddress: config.senderEmail,
        toAddress: record.recipientEmail,
        subject: record.title ?? "Notification SchoolSafe",
        content: record.message,
        mailFormat: "html",
      };
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Zoho-oauthtoken ${config.apiKey}` },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          if (fallback) {
            return fallback.send(record);
          }
          const body = await response.text();
          return { status: "FAILED", error: `Zoho HTTP ${response.status}: ${body}` };
        }
        const result = (await response.json()) as { data?: { messageId?: string } };
        return { status: "SENT", providerMessageId: result.data?.messageId };
      } catch (err) {
        if (fallback) {
          return fallback.send(record);
        }
        return { status: "FAILED", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
