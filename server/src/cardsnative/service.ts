// SchoolSafe Cartes v1 — service natif PostgreSQL (VPS).
// Remplace l'ancien service Supabase cards/service.ts.
// Gère la création des demandes d'impression, upload R2 et envoi à Control App.
// Toute requête humaine s'exécute dans withRequestContext : BEGIN → api.set_request_context
// → api.* → COMMIT. Le serveur transporte la session, il ne recalcule jamais les permissions.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";
import { randomUUID, createHmac } from "node:crypto";
import type { ControlAppConfig } from "../control-app/client.js";
import { pushCardPrintRequest } from "../control-app/client.js";
import { createR2Client, uploadBuffer, getSignedDownloadUrl, type R2Config } from "../storage/r2.js";
import type { S3Client } from "@aws-sdk/client-s3";

export interface CardPrintRequestProjection {
  id: string;
  student_id: string;
  student_name: string;
  matricule: string;
  class_name: string | null;
  format: string;
  version: number;
  is_duplicate: boolean;
  status: string;
  front_image_url: string | null;
  back_image_url: string | null;
  metadata: Record<string, unknown>;
  requested_at: string;
  submitted_at: string | null;
  printed_at: string | null;
}

export interface CardPrintSubmitResult {
  studentId: string;
  requestId: string;
  version: number;
  controlAppId?: string;
  status: "submitted" | "failed";
  error?: string;
}

export interface StudentInfo {
  id: string;
  school_id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  class_name: string | null;
}

function base64ToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64, "base64");
}

export function createCardsNativeService(
  businessPool: BusinessPool,
  r2Config?: R2Config,
  controlAppConfig?: ControlAppConfig,
) {
  const r2Client = r2Config ? createR2Client(r2Config) : undefined;
  const bucket = r2Config?.bucket ?? "cards";

  return {
    /** Récupérer les infos d'un élève pour l'impression */
    async getStudentInfo(context: RequestContext, studentId: string): Promise<StudentInfo | null> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          `select s.id, s.school_id, s.matricule, s.first_name, s.last_name, s.class_id, c.name as class_name
           from app.students s
           left join app.classes c on c.id = s.class_id
           where s.id = $1`,
          [studentId],
        );
        return (r.rows[0] as StudentInfo) ?? null;
      });
    },

    /** Récupérer le label de l'année académique active */
    async getAcademicYearLabel(context: RequestContext): Promise<string | null> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select name from app.academic_years where is_active = true limit 1",
        );
        return r.rows[0]?.name ?? null;
      });
    },

    /** Générer une demande d'impression (RPC native) */
    async createPrintRequest(context: RequestContext, input: {
      student_id: string;
      format: string;
      front_image_base64?: string;
      back_image_base64?: string;
      front_image_url?: string;
      back_image_url?: string;
      front_r2_key?: string;
      back_r2_key?: string;
      metadata?: Record<string, unknown>;
    }): Promise<{ id: string; version: number; is_duplicate: boolean }> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ card_print_request_create: { id: string; version: number; is_duplicate: boolean } }>(
          `select api.card_print_request_create($1, $2, $3, $4, $5, $6, $7::jsonb) as card_print_request_create`,
          [
            input.student_id,
            input.format,
            input.front_image_url ?? null,
            input.back_image_url ?? null,
            input.front_r2_key ?? null,
            input.back_r2_key ?? null,
            JSON.stringify(input.metadata ?? {}),
          ],
        );
        return r.rows[0].card_print_request_create;
      });
    },

    /** Upload des images vers R2 */
    async uploadCardImages(
      schoolSlug: string,
      yearLabel: string,
      matricule: string,
      version: number,
      requestId: string,
      frontDataUrl: string,
      backDataUrl: string,
    ): Promise<{ frontKey: string; backKey: string; frontUrl: string; backUrl: string; expiresAt: string }> {
      const folder = `cards/${schoolSlug}/${yearLabel}/${matricule.replace(/\s+/g, "_")}/v${version}/${requestId}`;
      const frontKey = `${folder}/front.png`;
      const backKey = `${folder}/back.png`;

      if (r2Client) {
        const frontBuffer = base64ToBuffer(frontDataUrl);
        const backBuffer = base64ToBuffer(backDataUrl);
        await Promise.all([
          uploadBuffer(r2Client, bucket, frontKey, frontBuffer),
          uploadBuffer(r2Client, bucket, backKey, backBuffer),
        ]);
      } else {
        console.warn("[CardsNativeService] R2 not configured, skipping upload");
      }

      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      let frontUrl = "";
      let backUrl = "";
      if (r2Client) {
        [frontUrl, backUrl] = await Promise.all([
          getSignedDownloadUrl(r2Client, bucket, frontKey),
          getSignedDownloadUrl(r2Client, bucket, backKey),
        ]);
      }

      return { frontKey, backKey, frontUrl, backUrl, expiresAt };
    },

    /** Soumettre à Control App via HMAC */
    async pushToControlApp(input: {
      schoolId: string;
      studentId: string;
      studentName: string;
      className: string;
      yearLabel: string;
      frontKey: string;
      backKey: string;
      frontUrl: string;
      backUrl: string;
      expiresAt: string;
      format: "badge" | "carte";
      version: number;
      isDuplicate: boolean;
      metadata?: Record<string, unknown>;
    }): Promise<string | null> {
      if (!controlAppConfig) return null;

      const result = await pushCardPrintRequest(controlAppConfig, {
        school_id: input.schoolId,
        student_id: input.studentId,
        student_name: input.studentName,
        class_name: input.className,
        academic_year: input.yearLabel,
        front_key: input.frontKey,
        back_key: input.backKey,
        front_signed_url: input.frontUrl,
        back_signed_url: input.backUrl,
        signed_url_expires_at: input.expiresAt,
        format: input.format,
        version: input.version,
        is_duplicate: input.isDuplicate,
        metadata: input.metadata,
      });

      return result.id;
    },

    /** Marquer le statut d'une demande */
    async updatePrintRequestStatus(
      context: RequestContext,
      id: string,
      status: string,
      controlAppRef?: string,
      errorMessage?: string,
    ): Promise<boolean> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ card_print_request_update_status: boolean }>(
          "select api.card_print_request_update_status($1, $2, $3, $4) as card_print_request_update_status",
          [id, status, controlAppRef ?? null, errorMessage ?? null],
        );
        return r.rows[0]?.card_print_request_update_status === true;
      });
    },

    /** Traitement complet d'une demande d'impression (appelé depuis la route) */
    async submitFullPrintRequest(
      context: RequestContext,
      input: {
        student_id: string;
        format: "badge" | "carte";
        front_image_base64: string;
        back_image_base64: string;
        metadata?: Record<string, unknown>;
      },
    ): Promise<CardPrintSubmitResult> {
      const requestId = randomUUID();
      try {
        const student = await this.getStudentInfo(context, input.student_id);
        if (!student) return { studentId: input.student_id, requestId, version: 0, status: "failed", error: "Élève introuvable" };

        const yearLabel = (await this.getAcademicYearLabel(context)) ?? new Date().getFullYear().toString();
        const schoolSlug = student.school_id.slice(0, 8);

        // Création de la demande dans la BDD
        const created = await this.createPrintRequest(context, {
          student_id: input.student_id,
          format: input.format,
          metadata: input.metadata,
        });

        const isDuplicate = created.is_duplicate;

        // Upload images R2
        const { frontKey, backKey, frontUrl, backUrl, expiresAt } = await this.uploadCardImages(
          schoolSlug, yearLabel, student.matricule, created.version, created.id,
          input.front_image_base64, input.back_image_base64,
        );

        // Mise à jour avec les URLs (transaction contextualisée)
        await withRequestContext(businessPool, context, async (client: PoolClient) => {
          await client.query(
            `update app.card_print_requests
             set front_image_url = $2, back_image_url = $3, front_r2_key = $4, back_r2_key = $5
             where id = $1`,
            [created.id, frontUrl, backUrl, frontKey, backKey],
          );
        });

        // Envoi à Control App
        let controlAppId: string | undefined;
        if (controlAppConfig) {
          try {
            controlAppId = await this.pushToControlApp({
              schoolId: student.school_id,
              studentId: student.id,
              studentName: `${student.first_name} ${student.last_name}`.trim(),
              className: student.class_name ?? "—",
              yearLabel,
              frontKey,
              backKey,
              frontUrl,
              backUrl,
              expiresAt,
              format: input.format,
              version: created.version,
              isDuplicate,
              metadata: input.metadata,
            }) ?? undefined;

            if (controlAppId) {
              await this.updatePrintRequestStatus(context, created.id, "submitted", controlAppId);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await this.updatePrintRequestStatus(context, created.id, "failed", undefined, message);
            return { studentId: input.student_id, requestId: created.id, version: created.version, status: "failed", error: message };
          }
        }

        return { studentId: input.student_id, requestId: created.id, version: created.version, controlAppId, status: "submitted" };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { studentId: input.student_id, requestId, version: 0, status: "failed", error: message };
      }
    },

    /** Liste des demandes d'impression */
    async listPrintRequests(context: RequestContext, status?: string, limit = 50, offset = 0): Promise<CardPrintRequestProjection[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ card_print_request_list: CardPrintRequestProjection[] }>(
          "select api.card_print_request_list($1, $2, $3) as card_print_request_list",
          [status ?? null, limit, offset],
        );
        return r.rows[0]?.card_print_request_list ?? [];
      });
    },

    /** Config de design des classes pour les cartes */
    async classCardConfigList(context: RequestContext) {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ class_card_config_list: unknown }>(
          "select api.class_card_config_list() as class_card_config_list",
        );
        return r.rows[0]?.class_card_config_list ?? [];
      });
    },

    /** Compteurs */
    async getCounts(context: RequestContext): Promise<{ pending: number; submitted: number; printed: number; failed: number; total: number }> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query<{ card_print_request_counts: { pending: number; submitted: number; printed: number; failed: number; total: number } }>(
          "select api.card_print_request_counts() as card_print_request_counts",
        );
        return r.rows[0]?.card_print_request_counts ?? { pending: 0, submitted: 0, printed: 0, failed: 0, total: 0 };
      });
    },
  // ————— Lot 2 : cycle de vie perte/vol (RPC api.card_* de 03_cards_lifecycle.sql) —————

    async lossReport(context: RequestContext, input: {
      student_id: string;
      card_id?: string;
      reason: string;
      reported_by_relation?: "school" | "primary_guardian";
    }): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select api.card_loss_report($1, $2, $3, $4) as result",
          [input.student_id, input.card_id ?? null, input.reason, input.reported_by_relation ?? "school"],
        );
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async replaceCard(context: RequestContext, input: {
      student_id: string;
      old_card_id: string;
      reason: string;
    }): Promise<Record<string, unknown>> {
      // Signature de la nouvelle carte calculée côté serveur (HMAC), jamais du client.
      const secret = process.env.CARD_HMAC_SECRET;
      if (!secret) throw new Error("CARD_HMAC_SECRET is not configured");
      const cardSecret = randomUUID();
      const cardNumber = `SS-REPL-${input.student_id.slice(0, 8)}-${Date.now()}`;
      const signature = createHmac("sha256", secret).update(cardNumber).digest("hex");
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select api.card_replace($1, $2, $3, $4, $5, $6) as result",
          [input.student_id, input.old_card_id, input.reason, cardNumber, signature, cardSecret],
        );
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async reprintAuthorize(context: RequestContext, cardId: string, reason: string): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.card_reprint_authorize($1, $2) as result", [cardId, reason]);
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async markDistributed(context: RequestContext, cardId: string): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.card_mark_distributed($1) as result", [cardId]);
        return r.rows[0].result as Record<string, unknown>;
      });
    },
  };
}

export type CardsNativeService = ReturnType<typeof createCardsNativeService>;
