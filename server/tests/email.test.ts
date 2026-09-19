import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { EmailService } from "../src/email/service.js";
import type { AccessService } from "../src/access/service.js";

const mockEmailService: EmailService = {
  async send(message) {
    return { status: "sent", provider: "brevo", messageId: "msg-123" };
  },
};

const mockAccess: AccessService = {
  hasPermission: vi.fn().mockResolvedValue(true),
  hasScope: vi.fn().mockResolvedValue(true),
};

function makeApp() {
  return buildApp({
    email: {
      service: mockEmailService,
      access: mockAccess,
    },
  });
}

describe("POST /email/send", () => {
  it("returns 401 without authorization header", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/email/send",
      payload: {
        to: [{ email: "test@example.com" }],
        subject: "Test",
        text: "Hello",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("AUTH_REQUIRED");
  });

  it("returns 400 with invalid body", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/email/send",
      headers: { authorization: "Bearer valid-token" },
      payload: { subject: "Test" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_INVALID");
  });

  it("sends an email and returns result", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/email/send",
      headers: { authorization: "Bearer valid-token" },
      payload: {
        to: [{ email: "test@example.com" }],
        subject: "Test",
        text: "Hello",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe("sent");
    expect(res.json().data.messageId).toBe("msg-123");
  });
});
