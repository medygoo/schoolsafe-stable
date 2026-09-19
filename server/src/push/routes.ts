import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { SchoolSafeError } from "../http/errors.js";
import { extractBearerToken } from "../auth/session.js";
import type { PushSubscriptionService, PushSubscription } from "./subscriptions.js";
import { requirePermission } from "../access/guard.js";
import type { AccessService } from "../access/service.js";

export type ResolveProfileId = (token: string) => Promise<string | null>;

export type PushRouteDependencies = {
  subscriptionService: PushSubscriptionService;
  resolveProfileId: ResolveProfileId;
  access: AccessService;
  vapidPublicKey?: string;
};

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export function registerPushRoutes(app: FastifyInstance, dependencies: PushRouteDependencies): void {
  app.get(
    "/push/public-key",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!dependencies.vapidPublicKey) {
        throw new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Web Push non configuré", false);
      }
      reply.send({ public_key: dependencies.vapidPublicKey });
    },
  );

  app.post(
    "/push/subscribe",
    { preHandler: [requirePermission(dependencies.access, "notification.subscribe")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      let token: string;
      try {
        token = extractBearerToken(request.headers.authorization);
      } catch {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
      }

      const profileId = await dependencies.resolveProfileId(token);
      if (!profileId) {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Profil non trouvé", false);
      }

      const parsed = subscribeSchema.parse(request.body);
      const subscription: PushSubscription = {
        endpoint: parsed.endpoint,
        keys: parsed.keys,
      };
      await dependencies.subscriptionService.saveSubscription(profileId, subscription);
      return { success: true };
    },
  );
}
