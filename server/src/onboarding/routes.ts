import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { clearOnboardingCookie, readOnboardingCookie, setSessionCookie } from "../authnative/cookie.js";
import type { OnboardingSchoolService } from "./school-service.js";

export interface OnboardingRouteDependencies {
  schoolService: OnboardingSchoolService;
  cookieSecure: boolean;
}
const developmentOrigins = new Set(["http://127.0.0.1:4175", "http://localhost:4175", "http://127.0.0.1:4176", "http://localhost:4176", "http://127.0.0.1:4290", "http://localhost:4290"]);
export function registerOnboardingRoutes(app: FastifyInstance, deps: OnboardingRouteDependencies): void {
  const mutation = async (request: FastifyRequest) => {
    if (request.headers["sec-fetch-site"] === "cross-site") throw new SchoolSafeError(403, "ACCESS_DENIED", "Accès refusé", false);
    const origin = request.headers.origin;
    if (origin) {
      let sameOrigin = false;
      try {
        const url = new URL(origin);
        sameOrigin = url.origin === origin && url.host === request.headers.host &&
          (deps.cookieSecure ? url.protocol === "https:" : ["http:", "https:"].includes(url.protocol));
      } catch { /* malformed origin is denied */ }
      if (!sameOrigin && !(!deps.cookieSecure && developmentOrigins.has(origin))) throw new SchoolSafeError(403, "ACCESS_DENIED", "Accès refusé", false);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] ?? "")) {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Contenu JSON requis", false);
    }
  };
  const mutationOptions = {
    onRequest: mutation,
    errorHandler(error: FastifyError, _request: FastifyRequest, reply: FastifyReply) {
      if (error.code === "FST_ERR_CTP_INVALID_JSON_BODY" || error.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
        return reply.code(400).send({code: "VALIDATION_INVALID", message: "Contenu JSON invalide", retryable: false});
      }
      // Delegate application errors to the existing sanitized parent handler.
      throw error;
    },
  };
  const requiredToken = (request: FastifyRequest) => {
    const token = readOnboardingCookie(request);
    if (!token) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
    return token;
  };
  app.get("/auth/onboarding/me", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const identity = await deps.schoolService.me(requiredToken(request));
    if (!identity) throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
    return identity;
  });
  app.post("/auth/onboarding/logout", mutationOptions, async (request, reply) => {
    const token = readOnboardingCookie(request);
    try { if (token) await deps.schoolService.logout(token); }
    finally { clearOnboardingCookie(reply, {secure: deps.cookieSecure}); }
    return {status: "logged_out"};
  });
  app.post("/auth/onboarding/school", mutationOptions, async (request, reply) => {
    const result = await deps.schoolService.createSchool(requiredToken(request), request.body);
    clearOnboardingCookie(reply, {secure: deps.cookieSecure});
    setSessionCookie(reply, result.token, {secure: deps.cookieSecure, maxAgeSeconds: 43200});
    const {token: _token, ...publicResult} = result;
    return reply.code(201).send(publicResult);
  });
}
