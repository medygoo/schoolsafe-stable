// SchoolSafe Device Hub — récepteur machine-to-machine (Control → SchoolSafe).
// Control pousse les événements de pointage des terminaux via le même contrat
// HMAC que le client existant : signature MÉTHODE\nPATH\nTIMESTAMP\nBODY,
// fenêtre anti-rejeu 300 s, comparaison timingSafeEqual. Aucune session
// humaine : l'instance Control est identifiée par son en-tête dédié.
// L'idempotence fournisseur (raw_provider_event_id unique en base) garantit
// qu'un événement rejoué ne duplique rien.
import type { FastifyInstance } from "fastify";
import {verifyRequest} from "../machine/hmac.js";
import { newRequestId } from "../http/request-id.js";
import { SchoolSafeError } from "../http/errors.js";
import type { DeviceHubService } from "./service.js";
import type { RequestContext } from "../db/context.js";
import { z } from "zod";

export type DeviceHubMachineRouteDependencies = {
  service: DeviceHubService;
  /** Secret HMAC partagé avec Control (env CONTROL_APP_HMAC_SECRET). */
  hmacSecret: string;
  /** Identifiant d'instance attendu dans l'en-tête (env CONTROL_APP_INSTANCE_ID). */
  expectedInstanceId: string;
  /** École servie par cette instance SchoolSafe (résolue serveur). */
  resolveContext: (instanceId: string, deviceId: string, requestId: string) => Promise<RequestContext>;
};

export function registerDeviceHubMachineRoutes(
  app: FastifyInstance,
  dependencies: DeviceHubMachineRouteDependencies,
): void {
  app.post("/machine/devicehub/events", async (request) => {
    const instanceId = request.headers["x-schoolsafe-instance"];
    const timestamp = request.headers["x-schoolsafe-timestamp"];
    const signature = request.headers["x-schoolsafe-signature"];
    if (!instanceId || !timestamp || !signature) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "En-têtes d'authentification HMAC manquants", false);
    }
    if (instanceId !== dependencies.expectedInstanceId) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Instance inconnue", false);
    }
    // Le corps est resigné sous forme canonique (JSON compact du body parsé),
    // exactement comme le client Control existant signe ses requêtes.
    const canonicalBody = JSON.stringify(request.body ?? {});
    const valid = verifyRequest({
      method: request.method,
      path: request.url,
      body: canonicalBody,
      timestamp: Number(timestamp),
      signature: String(signature),
      secret: dependencies.hmacSecret,
    });
    if (!valid) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Signature HMAC invalide ou requête expirée", false);
    }

    const body = z.object({
      device_id: z.string().uuid(),
      raw_provider_event_id: z.string().min(1).max(255),
      external_person_id: z.string().max(64).optional(),
      credential_type: z.enum(["fingerprint", "pin", "card", "qr"]),
      event_type: z.enum(["check_in", "check_out", "authentication", "access", "unknown"]),
      occurred_at: z.string().datetime(),
      metadata: z.record(z.unknown()).optional(),
    }).strict().parse(request.body);

    const context = await dependencies.resolveContext(String(instanceId), body.device_id, newRequestId());

    const data = await dependencies.service.ingestEvent(context, {
      device_id: body.device_id,
      source: "terminal",
      raw_provider_event_id: body.raw_provider_event_id,
      external_person_id: body.external_person_id,
      credential_type: body.credential_type,
      event_type: body.event_type,
      occurred_at: body.occurred_at,
      metadata: body.metadata,
    });
    return { data, request_id: newRequestId() };
  });
}