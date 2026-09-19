import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { PushSubscriptionService } from "../src/push/subscriptions.js";
import type { AccessService } from "../src/access/service.js";

function createMockService(): PushSubscriptionService {
  return {
    saveSubscription: vi.fn().mockResolvedValue(undefined),
    getSubscriptions: vi.fn().mockResolvedValue([]),
    removeSubscription: vi.fn().mockResolvedValue(undefined),
  };
}

const mockAccess: AccessService = {
  hasPermission: vi.fn().mockResolvedValue(true),
  hasScope: vi.fn().mockResolvedValue(true),
};

const mockResolve = async (token: string) => (token === "valid-token" ? "resolved-profile-id" : null);

function makeApp(service: PushSubscriptionService, vapidPublicKey?: string) {
  return buildApp({
    push: {
      subscriptionService: service,
      resolveProfileId: mockResolve,
      access: mockAccess,
      vapidPublicKey,
    },
  });
}

describe("GET /push/public-key", () => {
  it("returns the VAPID public key when configured", async () => {
    const app = makeApp(createMockService(), "test-public-key");
    const res = await app.inject({ method: "GET", url: "/push/public-key" });
    expect(res.statusCode).toBe(200);
    expect(res.json().public_key).toBe("test-public-key");
    await app.close();
  });

  it("returns 503 when push is not configured", async () => {
    const app = makeApp(createMockService());
    const res = await app.inject({ method: "GET", url: "/push/public-key" });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("DEPENDENCY_UNAVAILABLE");
    await app.close();
  });
});

describe("POST /push/subscribe", () => {
  it("saves a push subscription", async () => {
    const service = createMockService();
    const app = makeApp(service, "test-public-key");
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      keys: { p256dh: "key-p256dh", auth: "key-auth" },
    };
    const res = await app.inject({
      method: "POST",
      url: "/push/subscribe",
      headers: { authorization: "Bearer valid-token" },
      payload: subscription,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(service.saveSubscription).toHaveBeenCalledWith("resolved-profile-id", subscription);
    await app.close();
  });
});
