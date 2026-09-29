// SchoolSafe Activation Service V1 — routes : redeem, refresh avec proof Ed25519,
// statut lisible par l'école + porte de licence. La porte ferme avec 402 quand
// l'état n'est pas active. Le frontend ne décide jamais : il lit, il n'autorise pas.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { LicenseNativeService } from "./service.js";

export type LicenseNativeRouteDependencies = {
  authService: AuthNativeService;
  service: LicenseNativeService;
};

const redeemBodySchema = z.object({
  activation_code: z.string().min(1),
}).strict();

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
        perpetual: payload?.perpetual === true,
      },
      request_id: newRequestId(),
    };
  });

  // Redeem : consomme un activation_code via Activation Service V1 et stocke l'enveloppe vérifiée.
  app.post("/native/license/redeem", { preHandler: requireSession }, async (request) => {
    const session = request.authSession!;
    const parsed = redeemBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new SchoolSafeError(400, "INVALID_REQUEST", "activation_code requis", false);
    }
    const { state, payload } = await dependencies.service.redeem(
      {
        userId: session.userId,
        profileId: session.profileId,
        schoolId: session.schoolId,
        requestId: newRequestId(),
      },
      parsed.data.activation_code,
    );
    if (!payload) {
      throw new SchoolSafeError(409, "ACTIVATION_REJECTED", "Code invalide, expiré ou déjà consommé", false);
    }
    return {
      data: {
        state,
        license_id: payload.license_id,
        expires_at: payload.expires_at,
        perpetual: payload.perpetual === true,
      },
      request_id: newRequestId(),
    };
  });

  // Refresh : preuve de possession Ed25519 + nonce unique via Activation Service V1.
  app.post("/native/license/refresh", { preHandler: requireSession }, async (request) => {
    const session = request.authSession!;
    const { state, payload } = await dependencies.service.refreshFromActivation({
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