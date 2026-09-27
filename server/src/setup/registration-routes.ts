import type { FastifyInstance } from "fastify";

/**
 * Legacy setup registration routes have been retired.
 * The canonical account-first registration flow lives in server/src/onboarding/.
 * This stub remains only to satisfy the BuildAppOptions type contract without
 * registering any HTTP endpoint, ensuring /setup/registrations* returns 404.
 */
export type RegistrationRouteDependencies = Record<string, never>;

export function registerRegistrationRoutes(
  _app: FastifyInstance,
  _deps: RegistrationRouteDependencies,
): void {
  // Intentionally empty: all legacy /setup/registrations endpoints are removed.
}