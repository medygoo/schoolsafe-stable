import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { extractBearerToken } from "../auth/session.js";
import type { EmailService, EmailMessage } from "./service.js";
import { requirePermission } from "../access/guard.js";
import type { AccessService } from "../access/service.js";
import { z } from "zod";

const emailMessageSchema = z.object({
  to: z.array(z.object({ email: z.string().email(), name: z.string().optional() })).min(1),
  subject: z.string().min(1).max(200),
  html: z.string().optional(),
  text: z.string().optional(),
  from: z.object({ email: z.string().email(), name: z.string().optional() }).optional(),
  replyTo: z.object({ email: z.string().email(), name: z.string().optional() }).optional(),
});

export type EmailRouteDependencies = {
  service: EmailService;
  access: AccessService;
};

export function registerEmailRoutes(app: FastifyInstance, dependencies: EmailRouteDependencies): void {
  app.post(
    "/email/send",
    { preHandler: [requirePermission(dependencies.access, "email.send")] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      try {
        extractBearerToken(request.headers.authorization);
      } catch {
        throw new SchoolSafeError(401, "AUTH_REQUIRED", "Authentification requise", false);
      }

      const parsed = emailMessageSchema.parse(request.body);
      const result = await dependencies.service.send(parsed as EmailMessage);
      return { data: result };
    },
  );
}
