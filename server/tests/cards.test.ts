import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createCardService } from "../src/cards/service.js";
import type { CardService } from "../src/cards/service.js";
import type { AccessService } from "../src/access/service.js";

const mockService: CardService = {
  async requestPrintBatch(profileId, inputs) {
    return inputs.map((input, i) => ({
      studentId: input.student_id,
      requestId: `req-${i + 1}`,
      version: 1,
      controlAppId: "ctrl-456",
      status: "submitted" as const,
    }));
  }
};

const mockAccess: AccessService = {
  hasPermission: vi.fn().mockResolvedValue(true),
  hasScope: vi.fn().mockResolvedValue(true),
};

const mockResolve = async (token: string) => (token === "valid-token" ? "resolved-profile-id" : null);

function makeApp() {
  return buildApp({
    cards: {
      service: mockService,
      resolveProfileId: mockResolve,
      access: mockAccess,
    },
  });
}

const validPayload = {
  student_id: "550e8400-e29b-41d4-a716-446655440000",
  format: "badge" as const,
  front_image_base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  back_image_base64: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  metadata: { test: true }
};

describe("POST /cards/request-print", () => {
  it("returns 401 without authorization header", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/cards/request-print",
      payload: validPayload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("AUTH_REQUIRED");
  });

  it("returns 401 when profile cannot be resolved", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/cards/request-print",
      headers: { authorization: "Bearer invalid-token" },
      payload: validPayload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("AUTH_REQUIRED");
  });

  it("returns 403 when permission is denied", async () => {
    const app = buildApp({
      cards: {
        service: mockService,
        resolveProfileId: mockResolve,
        access: { hasPermission: vi.fn().mockResolvedValue(false), hasScope: vi.fn().mockResolvedValue(true) },
      },
    });
    const res = await app.inject({
      method: "POST",
      url: "/cards/request-print",
      headers: { authorization: "Bearer valid-token" },
      payload: validPayload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("ACCESS_DENIED");
  });

  it("returns 400 with invalid body", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/cards/request-print",
      headers: { authorization: "Bearer valid-token" },
      payload: { student_id: "not-a-uuid", format: "badge" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_INVALID");
  });

  it("calls the card service and returns the result for a single request", async () => {
    const app = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/cards/request-print",
      headers: { authorization: "Bearer valid-token" },
      payload: validPayload,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].requestId).toBe("req-1");
    expect(json.data[0].controlAppId).toBe("ctrl-456");
  });

  it("accepts a batch of requests", async () => {
    const app = makeApp();
    const batch = [
      validPayload,
      { ...validPayload, student_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" },
    ];
    const res = await app.inject({
      method: "POST",
      url: "/cards/request-print",
      headers: { authorization: "Bearer valid-token" },
      payload: batch,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.data).toHaveLength(2);
    expect(json.data[0].requestId).toBe("req-1");
    expect(json.data[1].requestId).toBe("req-2");
  });
});

describe("createCardService", () => {
  it("is exported", () => {
    expect(createCardService).toBeDefined();
  });
});
