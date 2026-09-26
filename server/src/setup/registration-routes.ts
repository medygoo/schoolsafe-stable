import type { FastifyInstance } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import type { RegistrationApprovalService } from "./registration-approval-service.js";
import type { RegistrationService } from "./registration-service.js";
import {
  registrationDecisionBodySchema,
  registrationReviewBodySchema,
} from "./registration-approval-schema.js";
import { registrationPayloadSchema } from "./registration-schema.js";

export type RegistrationRouteDependencies = {
  registrationService: RegistrationService;
  approvalService: RegistrationApprovalService;
};

export function registerRegistrationRoutes(
  app: FastifyInstance,
  deps: RegistrationRouteDependencies,
): void {
  app.post("/setup/registrations", async (request, reply) => {
    const body = registrationPayloadSchema.safeParse(request.body);
    if (!body.success) {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Données d'inscription invalides", false);
    }
    try {
      const prepared = await deps.registrationService.prepareRegistration(body.data);
      await deps.approvalService.issueApproval(prepared.request_id);
      return reply.status(202).send({ request_id: prepared.request_id, status: "pending" });
    } catch (error) {
      throw new SchoolSafeError(
        500,
        "INTERNAL_ERROR",
        "Échec de la préparation de l'inscription",
        false,
      );
    }
  });

  app.post("/setup/registrations/review", async (request, reply) => {
    const body = registrationReviewBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Token d'approbation invalide", false);
    }
    try {
      const review = await deps.approvalService.review(body.data.token);
      return reply.status(200).send(review);
    } catch (error) {
      throw new SchoolSafeError(403, "ACCESS_DENIED", "Token invalide ou expiré", false);
    }
  });

  app.post("/setup/registrations/decision", async (request, reply) => {
    const body = registrationDecisionBodySchema.safeParse(request.body);
    if (!body.success) {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Décision d'approbation invalide", false);
    }
    try {
      const result = await deps.approvalService.decide(body.data.token, body.data.decision);
      return reply.status(200).send(result);
    } catch (error) {
      throw new SchoolSafeError(403, "ACCESS_DENIED", "Décision refusée ou token invalide", false);
    }
  });
}