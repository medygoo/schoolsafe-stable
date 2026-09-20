import type { FastifyInstance } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import type { SetupService } from "./service.js";
import {
  setupAdminPayloadSchema,
  setupSchoolPayloadSchema,
  validateTokenPayloadSchema,
} from "./schema.js";

export type SetupRouteDependencies = {
  service: SetupService;
};

function assertTokenValid(service: SetupService, token: string): void {
  if (!service.validateToken(token)) {
    throw new SchoolSafeError(403, "SETUP_TOKEN_INVALID", "Token de configuration invalide", false);
  }
}

export function registerSetupRoutes(app: FastifyInstance, dependencies: SetupRouteDependencies): void {
  app.get("/config", async (_request, reply) => {
    return reply.status(200).send(dependencies.service.getConfig());
  });

  app.post("/setup/validate-token", async (request, reply) => {
    const body = validateTokenPayloadSchema.safeParse(request.body);
    if (!body.success) {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Données invalides", false);
    }

    const valid = dependencies.service.validateToken(body.data.token);
    return reply.status(200).send({ valid });
  });

  app.post("/setup/school", async (request, reply) => {
    const body = setupSchoolPayloadSchema.safeParse(request.body);
    if (!body.success) {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Données de configuration invalides", false);
    }

    assertTokenValid(dependencies.service, body.data.token);

    try {
      const result = await dependencies.service.createSchool(body.data);
      return reply.status(201).send(result);
    } catch (error) {
      throw new SchoolSafeError(
        500,
        "SETUP_SCHOOL_FAILED",
        "Échec de la création de l'école",
        false,
      );
    }
  });

  app.post("/setup/admin", async (request, reply) => {
    const body = setupAdminPayloadSchema.safeParse(request.body);
    if (!body.success) {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Données administrateur invalides", false);
    }

    assertTokenValid(dependencies.service, body.data.token);

    try {
      const result = await dependencies.service.createAdmin(body.data);
      return reply.status(201).send(result);
    } catch (error) {
      throw new SchoolSafeError(
        500,
        "SETUP_ADMIN_FAILED",
        "Échec de la création de l'administrateur",
        false,
      );
    }
  });
}
