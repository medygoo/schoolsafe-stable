import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("GET /ready", () => {
  it("retourne ready quand le probe est prêt", async () => {
    const app = buildApp({ readinessProbe: async () => ({ ready: true }) });
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
    await app.close();
  });

  it("retourne 503 avec le contrat stable quand une dépendance est indisponible", async () => {
    const app = buildApp({ readinessProbe: async () => ({ ready: false, dependency: "postgres" }) });
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      retryable: true
    });
    await app.close();
  });
});
