// SchoolSafe — route du paquet de session natif : ce que le frontend reçoit
// après un login par cookie. Jamais de token dans la réponse.
import type { FastifyInstance } from "fastify";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { SessionNativeService } from "./service.js";

export type SessionNativeRouteDependencies = {
  authService: AuthNativeService;
  service: SessionNativeService;
};

export function registerSessionNativeRoutes(
  app: FastifyInstance,
  dependencies: SessionNativeRouteDependencies,
): void {
  const requireSession = requireAuthSession(dependencies.authService);

  app.get("/native/session/bootstrap", { preHandler: requireSession }, async (request) => {
    const session = request.authSession!;
    const bootstrap = await dependencies.service.readBootstrap({
      userId: session.userId,
      profileId: session.profileId,
      schoolId: session.schoolId,
      requestId: newRequestId(),
    });
    return { data: bootstrap, request_id: newRequestId() };
  });
}
