// SchoolSafe — route JASPE 2.5D : point d'entrée unique du frontend.
// Session et safe.assistant.use obligatoires ; autorité vérifiée par Access Law.
// Le fournisseur n'obtient aucun accès métier depuis cette route.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { JaspeNativeService } from "./service.js";
import type { BusinessPool } from "../db/pool.js";
import { withAuthorizedContext } from "../db/access.js";
import { SchoolSafeError } from "../http/errors.js";

const chatSchema = z.object({
  message: z.string().trim().min(1, "message requis").max(2000, "message trop long"),
}).strict();

export type JaspeNativeRouteDependencies = {
  service: JaspeNativeService;
  authService?: AuthNativeService;
  businessPool: BusinessPool;
};

export function registerJaspeNativeRoutes(
  app: FastifyInstance,
  dependencies: JaspeNativeRouteDependencies,
): void {
  const preHandlers = dependencies.authService
    ? [requireAuthSession(dependencies.authService)]
    : [async () => { throw new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Authentification indisponible", true); }];

  app.post("/native/jaspe/chat", { preHandler: preHandlers }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const body = chatSchema.parse(request.body ?? {});
    const session = request.authSession!;
    const requestId = newRequestId();
    await withAuthorizedContext(dependencies.businessPool, {
      userId: session.userId, profileId: session.profileId, schoolId: session.schoolId, requestId,
    }, "safe.assistant.use", { targetProfileId: session.profileId }, async () => undefined);
    // The relay has no business tools or data. Any future tool must authorize
    // its exact permission and target again, never a client-supplied role.
    const sessionKey = `u:${session.userId}:${session.schoolId}:${session.profileId}`;
    const result = await dependencies.service.chat({ message: body.message, sessionKey });
    return { data: { reply: result.reply }, request_id: requestId };
  });
}
