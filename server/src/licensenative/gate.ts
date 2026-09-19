// SchoolSafe License — gate d'application backend (lot P3).
// La licence n'est plus un indicateur : les routes métier /native/* exigent
// un état active ou grace. L'identité (SchoolSafe ID = CORE) reste toujours
// disponible : auth, licence et essai ne sont jamais bloqués.
// L'état est lu via le service licence (jeton signé vérifié en base) et
// mis en cache par école pour ne pas frapper la base à chaque requête ;
// une révocation prend effet au plus tard après le TTL du cache.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { readSessionCookie } from "../authnative/cookie.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { LicenseNativeService } from "./service.js";

const OPEN_PREFIXES = ["/native/license", "/native/trial"];
const DEFAULT_CACHE_TTL_MS = 60_000;

export type LicenseGateDependencies = {
  authService: AuthNativeService;
  licenseService: LicenseNativeService;
  cacheTtlMs?: number;
};

export function registerLicenseGate(
  app: FastifyInstance,
  dependencies: LicenseGateDependencies,
): { clearCache: () => void } {
  const ttl = dependencies.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map<string, { state: string; checkedAt: number }>();

  app.addHook("onRequest", async (request: FastifyRequest) => {
    const path = (request.raw.url ?? "").split("?")[0];
    if (!path.startsWith("/native/")) return;
    // Identité, licence et essai restent toujours joignables (CORE non licenciable).
    if (OPEN_PREFIXES.some((prefix) => path.startsWith(prefix))) return;

    const token = readSessionCookie(request);
    if (!token) return; // la garde de session de la route répondra 401
    const session = await dependencies.authService.resolveSession(token);
    if (!session) return;

    const now = Date.now();
    const cached = cache.get(session.schoolId);
    let state = cached?.state;
    if (!cached || now - cached.checkedAt > ttl) {
      const result = await dependencies.licenseService.readState({
        userId: session.userId,
        profileId: session.profileId,
        schoolId: session.schoolId,
        requestId: `license-gate-${now}`,
      });
      state = result.state;
      cache.set(session.schoolId, { state, checkedAt: now });
    }

    if (state !== "active" && state !== "grace") {
      throw new SchoolSafeError(
        403,
        "LICENSE_INACTIVE",
        "Licence inactive, suspendue ou expirée — contactez SchoolSafe Control",
        false,
      );
    }
  });

  return {
    clearCache: () => cache.clear(),
  };
}
