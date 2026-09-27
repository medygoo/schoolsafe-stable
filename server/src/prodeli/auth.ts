import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { SchoolSafeError } from "../http/errors.js";

export interface ProdeliAuthDependencies {
  serviceToken: string;
  allowedOperators: string[];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Compare against self to avoid length leak, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function createProdeliAuthMiddleware(deps: ProdeliAuthDependencies) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Token manquant", false);
    }

    const token = authHeader.slice(7);
    if (!safeCompare(token, deps.serviceToken)) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Token invalide", false);
    }

    const operator = request.headers["x-prodeli-operator"];
    if (!operator) {
      throw new SchoolSafeError(403, "ACCESS_DENIED", "Opérateur manquant", false);
    }

    const normalizedOperator = normalizeEmail(operator as string);
    const isAllowed = deps.allowedOperators.some(
      (allowed) => normalizeEmail(allowed) === normalizedOperator,
    );

    if (!isAllowed) {
      throw new SchoolSafeError(403, "ACCESS_DENIED", "Opérateur non autorisé", false);
    }
  };
}

export function registerProdeliAuth(app: FastifyInstance, deps: ProdeliAuthDependencies): void {
  app.decorate("prodeliAuth", createProdeliAuthMiddleware(deps));
}

declare module "fastify" {
  interface FastifyInstance {
    prodeliAuth: ReturnType<typeof createProdeliAuthMiddleware>;
  }
}