import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { ZodError } from "zod";
import { registerRankingsRoutes } from "../src/pedagogy/rankings/routes.js";
import { SchoolSafeError } from "../src/http/errors.js";
import type { RankingsService, RankingWithEntries, Ranking, Star } from "../src/pedagogy/rankings/service.js";
import type { AccessService } from "../src/access/service.js";

function buildMockService(): RankingsService {
  const ranking: RankingWithEntries = {
    id: "r1",
    school_id: "s1",
    class_id: null,
    month: "2026-08",
    status: "draft",
    computed_at: new Date().toISOString(),
    published_at: null,
    computed_by_profile_id: "p1",
    entries: [],
  };

  return {
    listRankings: async () => [ranking],
    getRanking: async () => ranking,
    computeMonthlyRanking: async () => ranking,
    publishRanking: async () => ({ ...ranking, status: "published", published_at: new Date().toISOString() } as Ranking),
    addStar: async () => ({ id: "st1", ranking_id: "r1", student_id: "std1", parent_profile_id: "p1", created_at: new Date().toISOString() } as Star),
    removeStar: async () => {},
    listStars: async () => [],
    getParentChildrenClassIds: async () => [],
    getParentChildrenStudentIds: async () => [],
  };
}

function buildMockAccess(): AccessService {
  return {
    hasPermission: async () => true,
    hasScope: async () => true,
  } as unknown as AccessService;
}

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof SchoolSafeError) {
      return reply.status(error.statusCode).send({ code: error.code, message: error.publicMessage });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ code: "VALIDATION_INVALID", message: "Donnée invalide" });
    }
    return reply.status(500).send({ code: "INTERNAL_ERROR", message: "Erreur interne" });
  });
  registerRankingsRoutes(app, {
    service: buildMockService(),
    access: buildMockAccess(),
    resolveProfileAndSchool: async () => ({ profileId: "p1", schoolId: "s1" }),
  });
  return app;
}

describe("Rankings routes", () => {
  it("GET / returns rankings list", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].month).toBe("2026-08");
  });

  it("GET /:id returns a ranking", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/r1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.id).toBe("r1");
  });

  it("POST /compute returns a ranking", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/compute",
      headers: { authorization: "Bearer token" },
      payload: { month: "2026-08" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.month).toBe("2026-08");
  });

  it("POST /:id/publish returns published ranking", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/r1/publish",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe("published");
  });

  it("POST /:id/stars adds a star", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/r1/stars",
      headers: { authorization: "Bearer token" },
      payload: { student_id: "std1" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.student_id).toBe("std1");
  });

  it("DELETE /:id/stars/:studentId removes a star", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "DELETE",
      url: "/r1/stars/std1",
      headers: { authorization: "Bearer token" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it("rejects invalid compute payload", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/compute",
      headers: { authorization: "Bearer token" },
      payload: { month: "invalid" },
    });
    expect(res.statusCode).toBe(400);
  });
});
