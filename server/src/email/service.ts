export type EmailRecipient = {
  email: string;
  name?: string;
};

export type EmailAttachment = {
  name: string;
  content: string; // base64
};

export type EmailMessage = {
  to: EmailRecipient[];
  subject: string;
  html?: string;
  text?: string;
  from?: EmailRecipient;
  replyTo?: EmailRecipient;
  attachments?: EmailAttachment[];
};

export interface EmailService {
  send(message: EmailMessage): Promise<{ messageId?: string; status: "sent" | "failed" | "deferred"; provider: string; error?: string }>;
}

export type BrevoConfig = {
  apiKey: string;
  senderEmail: string;
  senderName?: string;
};

export function createBrevoEmailService(config?: BrevoConfig): EmailService {
  return {
    async send(message) {
      if (!config?.apiKey) {
        return { status: "failed", provider: "brevo", error: "BREVO_API_KEY not configured" };
      }

      const payload = {
        sender: {
          email: message.from?.email ?? config.senderEmail,
          name: message.from?.name ?? config.senderName ?? "SchoolSafe",
        },
        to: message.to,
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        replyTo: message.replyTo,
        attachment: message.attachments?.map((a) => ({ name: a.name, content: a.content })),
      };

      try {
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": config.apiKey,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const body = await response.text();
          return { status: "failed", provider: "brevo", error: `HTTP ${response.status}: ${body}` };
        }

        const result = await response.json() as { messageId?: string };
        return { status: "sent", provider: "brevo", messageId: result.messageId };
      } catch (err) {
        return { status: "failed", provider: "brevo", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

export function createNoopEmailService(): EmailService {
  return {
    async send(message) {
      console.warn("[EmailService] Noop sender used for", message.to.map((r) => r.email).join(", "));
      return { status: "deferred", provider: "noop" };
    },
  };
}
