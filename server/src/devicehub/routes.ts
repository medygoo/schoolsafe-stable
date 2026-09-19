// SchoolSafe Device Hub — routes HTTP natives.
// Le contexte de requête est construit UNIQUEMENT depuis la session résolue
// côté serveur (jamais depuis le navigateur).
import type { FastifyInstance } from "fastify";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { DeviceHubService } from "./service.js";
import type { RequestContext } from "../db/context.js";
import { z } from "zod";

export type DeviceHubRouteDependencies = {
  authService: AuthNativeService;
  service: DeviceHubService;
};

export function registerDeviceHubRoutes(
  app: FastifyInstance,
  dependencies: DeviceHubRouteDependencies,
): void {
  const requireSession = requireAuthSession(dependencies.authService);

  function contextFrom(request: { authSession?: { userId: string; profileId: string; schoolId: string } }): RequestContext {
    const session = request.authSession!;
    return {
      userId: session.userId,
      profileId: session.profileId,
      schoolId: session.schoolId,
      requestId: newRequestId(),
    };
  }

  // Enregistrer un appareil — école du contexte serveur (§4/§30)
  app.post("/native/devicehub/devices", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      code: z.string().min(2).max(64),
      vendor: z.string().min(1).max(64),
      model: z.string().min(1).max(64),
      serial_number: z.string().min(3).max(128),
      location: z.string().max(128).optional(),
      protocol: z.string().max(32).optional(),
      connection_mode: z.string().max(32).optional(),
    }).parse(request.body);

    const data = await dependencies.service.registerDevice(contextFrom(request), body);
    return { data, request_id: newRequestId() };
  });

  // Créer/réutiliser un mapping et empiler le job de synchronisation (§9)
  app.post("/native/devicehub/mappings", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      device_id: z.string().uuid(),
      student_id: z.string().uuid().optional(),
      subject_type: z.enum(["student", "staff"]).default("student"),
      person_name: z.string().max(128).optional(),
    }).parse(request.body);

    const data = await dependencies.service.ensureMapping(contextFrom(request), body);
    return { data, request_id: newRequestId() };
  });

  // Ingérer un événement brut — idempotence fournisseur (§22-23)
  app.post("/native/devicehub/events", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      device_id: z.string().uuid().optional(),
      source: z.enum(["terminal", "mobile"]).default("terminal"),
      raw_provider_event_id: z.string().max(255).optional(),
      external_person_id: z.string().max(64).optional(),
      credential_type: z.enum(["fingerprint", "pin", "card", "qr"]),
      event_type: z.enum(["check_in", "check_out", "authentication", "access", "unknown"]),
      occurred_at: z.string().datetime(),
      metadata: z.record(z.unknown()).optional(),
    }).parse(request.body);

    const data = await dependencies.service.ingestEvent(contextFrom(request), body);
    return { data, request_id: newRequestId() };
  });

  // Consolider les présences du jour (règles métier SchoolSafe, §47/§48)
  app.post("/native/devicehub/attendance/apply", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(request.body ?? {});

    const data = await dependencies.service.attendanceApply(contextFrom(request), body.day);
    return { data, request_id: newRequestId() };
  });

  // Exécuter les jobs de synchronisation dus (worker, adaptateur par protocole)
  app.post("/native/devicehub/sync-jobs/run", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      protocol: z.string().max(32).default("mock"),
    }).parse(request.body ?? {});

    const data = await dependencies.service.runSyncJobs(contextFrom(request), body.protocol);
    return { data, request_id: newRequestId() };
  });
}