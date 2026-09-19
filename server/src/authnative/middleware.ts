// SchoolSafe Auth v1 — garde de session pour les futures routes métier.
// AUTH = identité : cette garde ne fait QUE prouver qui est l'utilisateur.
// L'autorisation reste à Access_Law (aucune permission n'est accordée ici).
import type { FastifyReply, FastifyRequest } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { readSessionCookie } from "./cookie.js";
import type { AuthNativeService, AuthSessionInfo } from "./service.js";

declare module "fastify" {
  interface FastifyRequest {
    authSession?: AuthSessionInfo;
  }
}

export function requireAuthSession(service: AuthNativeService) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const token = readSessionCookie(request);
    if (!token) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
    }
    const session = await service.resolveSession(token);
    if (!session) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session invalide ou expirée", false);
    }
    // Identité résolue côté serveur : le navigateur ne fournit jamais
    // user_id / profile_id / school_id — ils viennent de la session.
    request.authSession = session;
  };
}
