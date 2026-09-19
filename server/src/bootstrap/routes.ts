import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthVerifier } from "../auth/session.js";
import { verifyBearerAuthorization } from "../auth/session.js";
import { newRequestId } from "../http/request-id.js";
import type { BootstrapService } from "./service.js";

export type { BootstrapService } from "./service.js";

export type BootstrapRouteDependencies = {
  authVerifier: AuthVerifier;
  service: BootstrapService;
};

function sendAuthError(reply: FastifyReply) {
  return reply.status(401).send({
    code: "AUTH_REQUIRED",
    message: "Authentification requise",
    request_id: newRequestId(),
    retryable: false,
  });
}

export function registerBootstrapRoutes(
  app: FastifyInstance,
  dependencies: BootstrapRouteDependencies,
): void {
  app.post("/session/bootstrap", async (request, reply) => {
    let session;
    try {
      session = await verifyBearerAuthorization(request.headers.authorization, dependencies.authVerifier);
    } catch {
      return sendAuthError(reply);
    }

    const bootstrap = await dependencies.service.load(session.token);
    if (!bootstrap) {
      return reply.status(403).send({
        code: "PERMISSION_DENIED",
        message: "Profil applicatif indisponible",
        request_id: newRequestId(),
        retryable: false,
      });
    }

    return reply.status(200).send(bootstrap);
  });
}
