import { describe, it, expect, vi } from "vitest";
import { createBrevoEmailProvider } from "../../../src/notifications/providers/brevo.js";
import { createZohoEmailProvider } from "../../../src/notifications/providers/zoho.js";
import type { NotificationRecord } from "../../../src/notifications/types.js";

function makeRecord(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: "notif-1",
    schoolId: "school-1",
    userId: "user-1",
    channel: "EMAIL",
    title: "Entrée",
    message: "Grâce est arrivée.",
    recipientEmail: "parent@example.com",
    status: "PENDING",
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Brevo email provider", () => {
  it("sends successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "brevo-123" }),
    });
    const provider = createBrevoEmailProvider({ apiKey: "key", senderEmail: "sender@example.com" });
    const result = await provider.send(makeRecord());
    expect(result.status).toBe("SENT");
    expect(result.providerMessageId).toBe("brevo-123");
  });

  it("fails on HTTP error", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "Bad request" });
    const provider = createBrevoEmailProvider({ apiKey: "key", senderEmail: "sender@example.com" });
    const result = await provider.send(makeRecord());
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("400");
  });
});

describe("Zoho email provider with Brevo fallback", () => {
  it("uses fallback when Zoho fails", async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "Zoho down" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messageId: "brevo-fb-1" }) });

    const brevo = createBrevoEmailProvider({ apiKey: "key", senderEmail: "sender@example.com" });
    const zoho = createZohoEmailProvider({ apiKey: "zoho-key", senderEmail: "sender@example.com", region: "com" }, brevo);
    const result = await zoho.send(makeRecord());
    expect(result.status).toBe("SENT");
    expect(result.providerMessageId).toBe("brevo-fb-1");
  });
});
