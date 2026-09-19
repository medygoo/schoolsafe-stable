// SchoolSafe License — routes : statut lisible par l'école + porte de licence.
// La porte (requireActiveLicense) ferme avec 402 quand l'état n'est ni
// active ni grâce. Le frontend ne décide jamais : il lit, il n'autorise pas.
import type { FastifyInstance } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { LicenseNativeService } from "./service.js";

export type LicenseNativeRouteDependencies = {
  authService: AuthNativeService;
  service: LicenseNativeService;
};

export function requireActiveLicense(dependencies: LicenseNativeRouteDependencies) {
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
      throw new SchoolSafeError(402, "TRIAL_EXPIRED", "Licence inactive ou expirée. Contactez PRODELI.", false);
    }
  };
}

export function registerLicenseNativeRoutes(
  app: FastifyInstance,
  dependencies: LicenseNativeRouteDependencies,
): void {
  const requireSession = requireAuthSession(dependencies.authService);

  app.get("/native/license/status", { preHandler: requireSession }, async (request) => {
    const session = request.authSession!;
    const { state, payload } = await dependencies.service.readState({
      userId: session.userId,
      profileId: session.profileId,
      schoolId: session.schoolId,
      requestId: newRequestId(),
    });
    return {
      data: {
        state,
        license_id: payload?.license_id ?? null,
        expires_at: payload?.expires_at ?? null,
        grace_days: payload?.grace_days ?? null,
      },
      request_id: newRequestId(),
    };
  });

  // Rafraîchissement explicite depuis Control (révocation appliquée aussitôt).
  app.post("/native/license/refresh", { preHandler: requireSession }, async (request) => {
    const session = request.authSession!;
    const { state, payload } = await dependencies.service.refreshFromControl({
      userId: session.userId,
      profileId: session.profileId,
      schoolId: session.schoolId,
      requestId: newRequestId(),
    });
    return {
      data: {
        state,
        license_id: payload?.license_id ?? null,
      },
      request_id: newRequestId(),
    };
  });
}
