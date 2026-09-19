// SchoolSafe — route de statut d'essai + porte d'application.
// 402 TRIAL_EXPIRED quand la porte ferme : l'école voit son statut, rien d'autre.
import type { FastifyInstance } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { TrialNativeService } from "./service.js";

export type TrialNativeRouteDependencies = {
  authService: AuthNativeService;
  service: TrialNativeService;
};

// Porte fail-closed pour les routes métier : session + licence active/grâce/convertie.
export function requireActiveTrial(dependencies: TrialNativeRouteDependencies) {
  const requireSession = requireAuthSession(dependencies.authService);
  return async (request: Parameters<ReturnType<typeof requireAuthSession>>[0], reply: unknown) => {
    await requireSession(request, reply as never);
    const session = request.authSession!;
    const allowed = await dependencies.service.gateAllows({
      userId: session.userId,
      profileId: session.profileId,
      schoolId: session.schoolId,
      requestId: newRequestId(),
    });
    if (!allowed) {
      throw new SchoolSafeError(402, "TRIAL_EXPIRED", "La période d'essai est terminée. Contactez PRODELI.", false);
    }
  };
}

export function registerTrialNativeRoutes(
  app: FastifyInstance,
  dependencies: TrialNativeRouteDependencies,
): void {
  const requireSession = requireAuthSession(dependencies.authService);

  app.get("/native/trial/status", { preHandler: requireSession }, async (request) => {
    const session = request.authSession!;
    const status = await dependencies.service.readStatus({
      userId: session.userId,
      profileId: session.profileId,
      schoolId: session.schoolId,
      requestId: newRequestId(),
    });
    return { data: status, request_id: newRequestId() };
  });
}
