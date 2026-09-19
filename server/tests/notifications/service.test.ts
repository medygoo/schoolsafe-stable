import { describe, it, expect, vi } from "vitest";
import { createNotificationService } from "../../src/notifications/service.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationProvider, NotificationRecord } from "../../src/notifications/types.js";

function makeClient(sendResult: { status: string; provider?: string; error?: string } = { status: "SENT", provider: "TEST" }) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "notif-1", status: "PENDING", retry_count: 0, max_retries: 3, created_at: new Date().toISOString() },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "notif-1", status: sendResult.status, provider: sendResult.provider, error_message: sendResult.error }, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

function makeProvider(overrides: Partial<NotificationProvider> = {}): NotificationProvider {
  return {
    name: "TEST",
    send: vi.fn().mockResolvedValue({ status: "SENT", providerMessageId: "msg-1" }),
    ...overrides,
  };
}

describe("NotificationService", () => {
  it("persists a PENDING notification and calls the matching provider", async () => {
    const client = makeClient();
    const emailProvider = makeProvider();
    const service = createNotificationService(client, { EMAIL: emailProvider, IN_APP: makeProvider() });
    const result = await service.queue({
      schoolId: "school-1",
      userId: "user-1",
      channel: "EMAIL",
      title: "Entrée",
      message: "Grâce est arrivée.",
      recipientEmail: "parent@example.com",
    });
    expect(result.status).toBe("SENT");
    expect(emailProvider.send).toHaveBeenCalled();
  });

  it("marks FAILED when provider fails", async () => {
    const client = makeClient({ status: "FAILED", error: "boom" });
    const failing = makeProvider({ send: vi.fn().mockResolvedValue({ status: "FAILED", error: "boom" }) });
    const service = createNotificationService(client, { EMAIL: failing });
    const result = await service.queue({
      schoolId: "school-1",
      userId: "user-1",
      channel: "EMAIL",
      message: "test",
    });
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("boom");
  });
});
