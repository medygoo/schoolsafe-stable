import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { JaspeNativeService } from "./service.js";
import type { BusinessPool } from "../db/pool.js";
import { withAuthorizedContext } from "../db/access.js";
import { SchoolSafeError } from "../http/errors.js";

const chatSchema = z.object({ message: z.string().trim().min(1).max(2000) }).strict();
const transcribeSchema = z.object({
  audio_base64: z.string().min(16).max(2_800_000),
  mime_type: z.enum(["audio/wav", "audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg"]),
}).strict();
const speakSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  lang: z.enum(["fr", "en"]).default("fr"),
}).strict();

export type JaspeNativeRouteDependencies = {
  service: JaspeNativeService;
  authService?: AuthNativeService;
  businessPool: BusinessPool;
};

export function registerJaspeNativeRoutes(app: FastifyInstance, dependencies: JaspeNativeRouteDependencies): void {
  const preHandlers = dependencies.authService
    ? [requireAuthSession(dependencies.authService)]
    : [async () => { throw new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Authentification indisponible", true); }];

  async function authorize(request: any): Promise<{ session: any; requestId: string; sessionKey: string }> {
    const session = request.authSession!;
    const requestId = newRequestId();
    await withAuthorizedContext(dependencies.businessPool, {
      userId: session.userId, profileId: session.profileId, schoolId: session.schoolId, requestId,
    }, "safe.assistant.use", { targetProfileId: session.profileId }, async () => undefined);
    return { session, requestId, sessionKey: `u:${session.userId}:${session.schoolId}:${session.profileId}` };
  }

  app.post("/native/jaspe/chat", { preHandler: preHandlers }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const body = chatSchema.parse(request.body ?? {});
    const { session, requestId, sessionKey } = await authorize(request);
    const result = await dependencies.service.chat({ message: body.message, sessionKey, schoolId: session.schoolId });
    return { data: { reply: result.reply }, request_id: requestId };
  });

  app.post("/native/jaspe/transcribe", { preHandler: preHandlers }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const body = transcribeSchema.parse(request.body ?? {});
    const { session, requestId, sessionKey } = await authorize(request);
    const audio = Buffer.from(body.audio_base64, "base64");
    if (!audio.length || audio.length > 2 * 1024 * 1024) {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Audio invalide ou trop volumineux.", false);
    }
    const result = await dependencies.service.transcribe({ audio, mimeType: body.mime_type, sessionKey, schoolId: session.schoolId });
    return { data: { text: result.text }, request_id: requestId };
  });

  app.post("/native/jaspe/speak", { preHandler: preHandlers }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const body = speakSchema.parse(request.body ?? {});
    const { session, requestId, sessionKey } = await authorize(request);
    const result = await dependencies.service.speak({ text: body.text, lang: body.lang, sessionKey, schoolId: session.schoolId });
    reply.type(result.mimeType);
    return Buffer.from(result.audioBase64, "base64");
  });
}
