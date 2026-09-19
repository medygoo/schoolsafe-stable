import { describe, it, expect, vi } from "vitest";
import { createWebPushProvider } from "../../../src/notifications/providers/push.js";
import type { NotificationRecord } from "../../../src/notifications/types.js";
import type { PushSubscription } from "../../../src/push/subscriptions.js";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    WebPushError: class extends Error {
      statusCode: number;
      constructor(statusCode: number) {
        super("WebPushError");
        this.statusCode = statusCode;
      }
    },
  },
}));

function makeRecord(): NotificationRecord {
  return {
    id: "notif-1",
    schoolId: "school-1",
    userId: "user-1",
    channel: "PUSH",
    title: "Entrée",
    message: "Grâce est arrivée.",
    status: "PENDING",
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
  };
}

describe("Web Push provider", () => {
  it("sends when subscriptions exist", async () => {
    const subs: PushSubscription[] = [{ endpoint: "https://fcm.example.com/push", keys: { p256dh: "x", auth: "y" } }];
    const provider = createWebPushProvider({
      publicKey: "pub",
      privateKey: "priv",
      subject: "mailto:test@example.com",
      getSubscriptions: async () => subs,
    });
    const result = await provider.send(makeRecord());
    expect(result.status).toBe("SENT");
  });

  it("fails when no subscription exists", async () => {
    const provider = createWebPushProvider({
      publicKey: "pub",
      privateKey: "priv",
      subject: "mailto:test@example.com",
      getSubscriptions: async () => [],
    });
    const result = await provider.send(makeRecord());
    expect(result.status).toBe("FAILED");
  });
});
