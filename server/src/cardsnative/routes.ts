// SchoolSafe Cartes v1 — routes HTTP natives pour l'impression de cartes.
// Le contexte de requête est construit UNIQUEMENT depuis la session résolue
// côté serveur (jamais depuis le navigateur) et passé en premier argument.
import type { FastifyInstance } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { CardsNativeService } from "./service.js";
import type { CardsBatchService } from "./batches.js";
import type { RequestContext } from "../db/context.js";
import { z } from "zod";

export type CardsNativeRouteDependencies = {
  authService: AuthNativeService;
  service: CardsNativeService;
  batchService?: CardsBatchService;
  autoBatchEnabled?: boolean;
};

export function registerCardsNativeRoutes(
  app: FastifyInstance,
  dependencies: CardsNativeRouteDependencies,
): void {
  const requireSession = requireAuthSession(dependencies.authService);

  // Contexte serveur : identité + école résolues depuis la session, jamais du client.
  function contextFrom(request: { authSession?: { userId: string; profileId: string; schoolId: string } }): RequestContext {
    const session = request.authSession!;
    return {
      userId: session.userId,
      profileId: session.profileId,
      schoolId: session.schoolId,
      requestId: newRequestId(),
    };
  }

  // ————— Pipeline carte : projection + readiness + package ZIP —————

  // Projection complète d'un élève pour la fabrication de sa carte.
  // L'école vient de la session serveur, JAMAIS d'un paramètre navigateur.
  app.get("/native/cards/students/:studentId/card-projection", { preHandler: requireSession }, async (request) => {
    const { studentId } = request.params as { studentId: string };
    const projection = await dependencies.service.getCardProjection(contextFrom(request), studentId);
    if (!projection) throw new SchoolSafeError(404, "NOT_FOUND", "Élève introuvable pour cette école", false);
    return {
      data: {
        ...projection,
        readiness: {
          ready: dependencies.service.cardReadinessMissing(projection).length === 0,
          missing: dependencies.service.cardReadinessMissing(projection),
        },
      },
      request_id: newRequestId(),
    };
  });

  // Demande d'impression complète d'une carte individuelle (projection → émission
  // credential si besoin → package ZIP recto/verso/manifest) et téléchargement direct.
  app.post("/native/cards/students/:studentId/card-package", { preHandler: requireSession }, async (request, reply) => {
    const { studentId } = request.params as { studentId: string };
    const body = z.object({
      recto_png_base64: z.string().min(50),
      verso_png_base64: z.string().min(50),
      version: z.coerce.number().int().positive().optional(),
    }).parse(request.body);
    const context = contextFrom(request);

    const projection = await dependencies.service.getCardProjection(context, studentId);
    if (!projection) throw new SchoolSafeError(404, "NOT_FOUND", "Élève introuvable pour cette école", false);
    const missing = dependencies.service.cardReadinessMissing(projection);
    if (missing.length > 0) {
      return reply.code(409).send({
        error: { code: "CARD_NOT_READY", message: `CARD_NOT_READY missing=[${missing.join(",")}]`, missing },
        request_id: newRequestId(),
      });
    }

    const card = await dependencies.service.ensureActiveCard(context, projection);
    if (!card) throw new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "CARD_HMAC_SECRET is not configured", false);

    const pkg = await dependencies.service.buildCardPackage(context, {
      projection,
      card,
      recto: Buffer.from(body.recto_png_base64.replace(/^data:image\/png;base64,/, ""), "base64"),
      verso: Buffer.from(body.verso_png_base64.replace(/^data:image\/png;base64,/, ""), "base64"),
      version: body.version,
    });

    reply.header("Content-Type", "application/zip");
    reply.header("Content-Disposition", `attachment; filename="${pkg.filename}"`);
    reply.header("X-Card-Number", card.card_number);
    reply.header("Access-Control-Expose-Headers", "Content-Disposition, X-Card-Number");
    return reply.send(pkg.zip);
  });

  // Soumettre une demande d'impression complète (avec images base64)
  app.post("/native/cards/print-request", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      student_id: z.string().uuid(),
      format: z.enum(["badge", "carte"]),
      front_image_base64: z.string().min(50),
      back_image_base64: z.string().min(50),
      metadata: z.record(z.unknown()).optional(),
    }).parse(request.body);

    const result = await dependencies.service.submitFullPrintRequest(contextFrom(request), body);

    // Lot 3 : génération automatique du lot ZIP après soumission réussie
    // (opt-in CARDS_AUTO_BATCH). Un échec du lot auto ne bloque jamais la
    // soumission — il est seulement journalisé.
    let autoBatch: import("./batches.js").BatchResult | null = null;
    if (dependencies.batchService && dependencies.autoBatchEnabled && result.status === "submitted") {
      try {
        autoBatch = await dependencies.batchService.buildBatch(contextFrom(request), { status: "submitted" });
      } catch (err) {
        request.log.warn({ err }, "[cards] lot ZIP automatique échoué (soumission conservée)");
      }
    }

    return { data: { ...result, auto_batch: autoBatch }, request_id: newRequestId() };
  });

  // Soumettre pour un élève spécifique (route raccourcie)
  app.post("/native/cards/students/:studentId/print", { preHandler: requireSession }, async (request) => {
    const { studentId } = request.params as { studentId: string };
    const body = z.object({
      format: z.enum(["badge", "carte"]).default("carte"),
      front_image_base64: z.string().min(50),
      back_image_base64: z.string().min(50),
      metadata: z.record(z.unknown()).optional(),
    }).parse(request.body);

    const result = await dependencies.service.submitFullPrintRequest(contextFrom(request), {
      student_id: studentId,
      format: body.format,
      front_image_base64: body.front_image_base64,
      back_image_base64: body.back_image_base64,
      metadata: body.metadata,
    });

    return { data: result, request_id: newRequestId() };
  });

  // Liste des demandes d'impression
  app.get("/native/cards/print-requests", { preHandler: requireSession }, async (request) => {
    const q = z.object({
      status: z.string().optional(),
      limit: z.coerce.number().int().positive().default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(request.query ?? {});

    const data = await dependencies.service.listPrintRequests(contextFrom(request), q.status, q.limit, q.offset);
    return { data, request_id: newRequestId() };
  });

  // Config de design des classes pour les cartes
  app.get("/native/cards/class-card-config", { preHandler: requireSession }, async (request) => {
    const data = await dependencies.service.classCardConfigList(contextFrom(request));
    return { data, request_id: newRequestId() };
  });

  // Compteurs
  app.get("/native/cards/print-requests/counts", { preHandler: requireSession }, async (request) => {
    const data = await dependencies.service.getCounts(contextFrom(request));
    return { data, request_id: newRequestId() };
  });

  // Construire un lot ZIP pour Control (Lot 1 cartes)
  app.post("/native/cards/batches", { preHandler: requireSession }, async (request) => {
    if (!dependencies.batchService) {
      throw new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Service de lots non configuré (R2 requis)", false);
    }
    const body = z.object({
      request_ids: z.array(z.string().uuid()).optional(),
      status: z.string().optional(),
    }).parse(request.body ?? {});

    const result = await dependencies.batchService.buildBatch(contextFrom(request), body);
    return { data: result, request_id: newRequestId() };
  });

  // ————— Lot 2 : cycle de vie perte/vol —————

  // Signaler une perte/vol (école ou principal via parcours autorisé)
  app.post("/native/cards/loss-report", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      student_id: z.string().uuid(),
      card_id: z.string().uuid().optional(),
      reason: z.string().min(3),
      reported_by_relation: z.enum(["school", "primary_guardian"]).default("school"),
    }).parse(request.body);

    const data = await dependencies.service.lossReport(contextFrom(request), body);
    return { data, request_id: newRequestId() };
  });

  // Remplacer une carte (révoque l'ancienne, nouvelle signature HMAC serveur)
  app.post("/native/cards/replace", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      student_id: z.string().uuid(),
      old_card_id: z.string().uuid(),
      reason: z.string().min(3),
    }).parse(request.body);

    const data = await dependencies.service.replaceCard(contextFrom(request), body);
    return { data, request_id: newRequestId() };
  });

  // Autoriser une réimpression contrôlée (même credential, support détruit)
  app.post("/native/cards/reprint", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      card_id: z.string().uuid(),
      reason: z.string().min(3),
    }).parse(request.body);

    const data = await dependencies.service.reprintAuthorize(contextFrom(request), body.card_id, body.reason);
    return { data, request_id: newRequestId() };
  });

  // Confirmer la distribution de la carte à l'élève (admin)
  app.post("/native/cards/distribute", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      card_id: z.string().uuid(),
    }).parse(request.body);

    const data = await dependencies.service.markDistributed(contextFrom(request), body.card_id);
    return { data, request_id: newRequestId() };
  });

  // Mettre à jour le statut (Control App callback)
  app.patch("/native/cards/print-requests/:id/status", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      status: z.enum(["pending", "submitted", "printed", "failed"]),
      control_app_reference: z.string().optional(),
      error_message: z.string().optional(),
    }).parse(request.body);

    const ok = await dependencies.service.updatePrintRequestStatus(
      contextFrom(request),
      id, body.status, body.control_app_reference, body.error_message,
    );
    if (!ok) throw new SchoolSafeError(404, "NOT_FOUND", "Demande introuvable", false);
    return { data: { updated: true }, request_id: newRequestId() };
  });
}
