import { describe, it, expect } from "vitest";
import { createInAppProvider } from "../../../src/notifications/providers/in-app.js";
import type { NotificationRecord } from "../../../src/notifications/types.js";

function makeRecord(): NotificationRecord {
  return {
    id: "notif-1",
    schoolId: "school-1",
    userId: "user-1",
    channel: "IN_APP",
    title: "Entrée",
    message: "Grâce est arrivée.",
    status: "PENDING",
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
  };
}

describe("In-app provider", () => {
  it("always succeeds", async () => {
    const provider = createInAppProvider();
    const result = await provider.send(makeRecord());
    expect(result.status).toBe("SENT");
    expect(result.providerMessageId).toBeUndefined();
  });
});
