import { expect, it } from "vitest";
import { buildApp } from "../src/app.js";

it("retourne un format d’erreur stable sans stack publique", async () => {
  const app = buildApp({ testRoutes: true });
  const response = await app.inject({ method: "GET", url: "/__test/error" });
  const body = response.json();
  expect(response.statusCode).toBe(400);
  expect(body).toMatchObject({
    code: "VALIDATION_INVALID",
    message: "Donnée invalide",
    retryable: false
  });
  expect(body.request_id).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(JSON.stringify(body)).not.toContain("stack");
  await app.close();
});
