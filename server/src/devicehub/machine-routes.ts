// SchoolSafe Device Hub — récepteur machine-to-machine (Control → SchoolSafe).
// Control pousse les événements de pointage des terminaux via le même contrat
// HMAC que le client existant : signature MÉTHODE\nPATH\nTIMESTAMP\nBODY,
// fenêtre anti-rejeu 300 s, comparaison timingSafeEqual. Aucune session
// humaine : l'instance Control est identifiée par son en-tête dédié.
// L'idempotence fournisseur (raw_provider_event_id unique en base) garantit
// qu'un événement rejoué ne duplique rien.
import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
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
  machineSchoolId: () => Promise<string> | string;
  machineProfileId?: () => string;
};

function verifyHmac(input: {
  method: string;
  path: string;
  body: string;
  timestamp: number;
  signature: string;
  secret: string;
  maxAgeSeconds?: number;
}): boolean {
  const maxAge = input.maxAgeSeconds ?? 300;
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(input.timestamp) || Math.abs(now - input.timestamp) > maxAge) return false;
  const expected = createHmac("sha256", input.secret)
    .update(`${input.method.toUpperCase()}\n${input.path}\n${input.timestamp}\n${input.body}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(input.signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

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
    const valid = verifyHmac({
      method: request.method,
      path: request.url.split("?")[0],
      body: canonicalBody,
      timestamp: Number(timestamp),
      signature: String(signature),
      secret: dependencies.hmacSecret,
    });
    if (!valid) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Signature HMAC invalide ou requête expirée", false);
    }

    const body = z.object({
      device_id: z.string().uuid().optional(),
      raw_provider_event_id: z.string().max(255).optional(),
      external_person_id: z.string().max(64).optional(),
      credential_type: z.enum(["fingerprint", "pin", "card", "qr"]),
      event_type: z.enum(["check_in", "check_out", "authentication", "access", "unknown"]),
      occurred_at: z.string().datetime(),
      metadata: z.record(z.unknown()).optional(),
    }).parse(request.body);

    // Contexte machine : école résolue serveur, profil machine fixé.
    const context: RequestContext = {
      userId: "machine:control",
      profileId: dependencies.machineProfileId?.() ?? "00000000-0000-4000-8000-000000000000",
      schoolId: await dependencies.machineSchoolId(),
      requestId: newRequestId(),
    };

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