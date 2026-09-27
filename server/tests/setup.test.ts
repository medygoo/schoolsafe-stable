import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerSetupRoutes } from "../src/setup/routes.js";

describe("GET /config", () => {
  it("keeps public auth configuration while disabling legacy setup", async () => {
    const service = { getConfig: vi.fn().mockReturnValue({
      auth_mode: "native",
      setup_available: false,
      account_registration_available: true,
    }) };
    const app = Fastify();
    registerSetupRoutes(app, { service });

    const response = await app.inject({ method: "GET", url: "/config" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ auth_mode: "native", setup_available: false, account_registration_available: true });
    await app.close();
  });
});