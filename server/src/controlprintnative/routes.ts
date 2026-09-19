// SchoolSafe Control — routes d'impression de cartes.
// Deux chemins strictement séparés :
//   - humain (session) : soumission et suivi côté école ;
//   - machine (callback signé HMAC) : mise à jour de statut depuis Control App,
//     vérifié AVANT tout SQL, exécuté sous withControlAuthority — jamais de session.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { ControlPrintNativeService } from "./service.js";
import type { BusinessPool } from "../db/pool.js";
import type { RequestContext } from "../db/context.js";
import { withControlAuthority, verifyControlSignature } from "../db/control-authority.js";
import type { ControlAppConfig } from "../control-app/client.js";
import { z } from "zod";

export type ControlPrintNativeRouteDependencies = {
  authService: AuthNativeService;
  service: ControlPrintNativeService;
  businessPool: BusinessPool;
  controlConfig?: ControlAppConfig;
};

export function registerControlPrintNativeRoutes(
  app: FastifyInstance,
  dependencies: ControlPrintNativeRouteDependencies,
): void {
  const requireSession = requireAuthSession(dependencies.authService);

  // Contexte serveur humain : identité + école résolues depuis la session.
  function contextFrom(request: FastifyRequest): RequestContext {
    const session = request.authSession!;
    return {
      userId: session.userId,
      profileId: session.profileId,
      schoolId: session.schoolId,
      requestId: newRequestId(),
    };
  }

  // Demander l'impression d'une carte
  app.post("/native/control/print-request", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      student_id: z.string().uuid(),
      student_name: z.string().min(1),
      class_name: z.string().min(1),
      academic_year: z.string().min(1),
      front_key: z.string().min(1),
      back_key: z.string().min(1),
      front_signed_url: z.string().url(),
      back_signed_url: z.string().url(),
      signed_url_expires_at: z.string(),
      format: z.enum(["badge", "carte"]).default("carte"),
      is_duplicate: z.boolean().default(false),
      metadata: z.record(z.unknown()).optional(),
    }).parse(request.body);

    const result = await dependencies.service.submitPrintRequest(contextFrom(request), body);
    if (!result) {
      throw new SchoolSafeError(503, "CONTROL_UNAVAILABLE",
        "Service d'impression non configuré ou indisponible", true);
    }
    return { data: result, request_id: newRequestId() };
  });

  // Liste des demandes d'impression
  app.get("/native/control/print-requests", { preHandler: requireSession }, async (request) => {
    const q = z.object({
      limit: z.coerce.number().int().positive().default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(request.query ?? {});
    const data = await dependencies.service.listPrintRequests(contextFrom(request), q.limit, q.offset);
    return { data, request_id: newRequestId() };
  });

  // Impression rapide pour un élève
  app.post("/native/control/students/:studentId/print", { preHandler: requireSession }, async (request) => {
    const { studentId } = request.params as { studentId: string };
    const body = z.object({
      academic_year: z.string().min(1),
      format: z.enum(["badge", "carte"]).default("carte"),
    }).parse(request.body);

    const student = await dependencies.service.getStudentForQuickPrint(contextFrom(request), studentId);
    if (!student) throw new SchoolSafeError(404, "NOT_FOUND", "Élève introuvable", false);

    const unsignedUrl = `https://control.schoolsafe.local/templates/${body.format}-default.png`;
    const result = await dependencies.service.submitPrintRequest(contextFrom(request), {
      student_id: studentId,
      student_name: student.student_name,
      class_name: student.class_name,
      academic_year: body.academic_year,
      front_key: "template-default-front",
      back_key: "template-default-back",
      front_signed_url: unsignedUrl,
      back_signed_url: unsignedUrl,
      signed_url_expires_at: new Date(Date.now() + 3600000).toISOString(),
      format: body.format,
      is_duplicate: false,
    });

    if (!result) {
      throw new SchoolSafeError(503, "CONTROL_UNAVAILABLE",
        "Service d'impression non configuré", true);
    }
    return { data: result, request_id: newRequestId() };
  });

  // Callback MACHINE Control App : mise à jour de statut signée HMAC.
  // PAS de garde de session : l'autorité est la signature, vérifiée avant tout SQL.
  app.post("/native/control/print/status", async (request) => {
    const config = dependencies.controlConfig;
    if (!config) {
      throw new SchoolSafeError(503, "CONTROL_UNAVAILABLE", "Callback Control non configuré", true);
    }

    const body = z.object({
      request_id: z.string().min(1),
      school_id: z.string().uuid(),
      print_request_id: z.string().uuid(),
      status: z.enum(["pending", "submitted", "printed", "failed"]),
      control_app_reference: z.string().optional(),
      error_message: z.string().optional(),
    }).parse(request.body);

    const headers = request.headers;
    // NOTE : la signature porte sur la représentation JSON du corps ; la
    // vérification octet exact nécessiterait le corps brut (durcissement
    // prévu avec le durcissement upload, avant exposition publique).
    const verification = verifyControlSignature({
      method: "POST",
      path: "/native/control/print/status",
      body: JSON.stringify(request.body),
      instanceId: headers["x-schoolsafe-instance"] as string | undefined,
      timestamp: headers["x-schoolsafe-timestamp"] as string | undefined,
      signature: headers["x-schoolsafe-signature"] as string | undefined,
      secret: config.hmacSecret,
    });
    if (!verification.ok) {
      // Aucun SQL n'a été exécuté à ce stade — le pool n'a pas été touché.
      throw new SchoolSafeError(401, "ACCESS_DENIED", "Signature Control invalide", false);
    }

    const updated = await withControlAuthority(
      dependencies.businessPool,
      {
        instanceId: verification.instanceId,
        requestId: body.request_id,
        schoolId: body.school_id,
      },
      (client) => dependencies.service.applyStatusFromControl(client, {
        print_request_id: body.print_request_id,
        status: body.status,
        control_app_reference: body.control_app_reference,
        error_message: body.error_message,
      }),
    );

    if (!updated) throw new SchoolSafeError(404, "NOT_FOUND", "Demande d'impression introuvable", false);
    return { data: { updated: true }, request_id: newRequestId() };
  });
}
