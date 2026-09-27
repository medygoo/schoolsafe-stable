// SchoolSafe Cartes v1 — service natif PostgreSQL (VPS).
// Remplace l'ancien service Supabase cards/service.ts.
// Gère la création des demandes d'impression, upload R2 et envoi à Control App.
// Toute requête humaine s'exécute dans withRequestContext : BEGIN → api.set_request_context
// → api.* → COMMIT. Le serveur transporte la session, il ne recalcule jamais les permissions.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";
import { randomUUID, createHmac, createHash } from "node:crypto";
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

// ————— Projection carte : source de vérité unique pour la fabrication —————

export interface CardStudentProjection {
  id: string;
  matricule: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  date_of_birth: string | null;
  photo_path: string | null;
  lifecycle_status: string;
}

export interface CardSchoolProjection {
  name: string;
  name_en: string | null;
  logo_path: string | null;
  motto: string | null;
  director_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  province: string | null;
  city: string | null;
}

export interface CardClassProjection {
  id: string | null;
  name: string | null;
  cycle_key: string | null;
  option: string | null;
  card_color: string | null;
  card_color_soft: string | null;
  card_color_dark: string | null;
  card_family: string | null;
  card_variant: string | null;
  card_pat: string | null;
  card_pat_style: string | null;
}

export interface CardTeacherProjection {
  id: string | null;
  name: string | null;
}

export interface CardGuardianProjection {
  id: string;
  full_name: string;
  guardian_type: string;
  phone: string | null;
}

export interface CardAuthorizedPersonProjection extends CardGuardianProjection {
  slot_no: number | null;
}

export interface ActiveCard {
  id: string;
  card_number: string;
  signature: string;
  status: string;
}

export interface CardProjection {
  student: CardStudentProjection;
  school: CardSchoolProjection;
  class: CardClassProjection;
  academic_year: { id: string | null; label: string | null };
  teacher: CardTeacherProjection;
  primary_guardian: CardGuardianProjection | null;
  authorized_persons: CardAuthorizedPersonProjection[];
}

export interface CardPackageResult {
  zip: Buffer;
  filename: string;
  folderName: string;
  manifest: Record<string, unknown>;
}

function base64ToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64, "base64");
}

/** Nom de fichier sûr : caractères interdits neutralisés. */
function sanitizeName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim();
}

/** Signature du credential carte — contrat du module Sécurité (HMAC-SHA256 base64url 32). */
function cardSignature(cardNumber: string, secret: string): string {
  return createHmac("sha256", secret).update(cardNumber).digest("base64url").slice(0, 32);
}

export function createCardsNativeService(
  businessPool: BusinessPool,
  r2Config?: R2Config,
  controlAppConfig?: ControlAppConfig,
) {
  const r2Client = r2Config ? createR2Client(r2Config) : undefined;
  const bucket = r2Config?.bucket ?? "cards";

  return {
    // ————— Projection carte (une seule requête métier par élève) —————

    /**
     * Projection complète d'un élève pour la fabrication de sa carte.
     * Toutes les données viennent des tables SchoolSafe existantes ; l'école
     * vient EXCLUSIVEMENT de la session serveur (jamais du navigateur).
     */
    async getCardProjection(context: RequestContext, studentId: string): Promise<CardProjection | null> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          `select
             s.id, s.matricule, s.first_name, s.middle_name, s.last_name,
             s.date_of_birth::text as date_of_birth, s.photo_path, s.lifecycle_status,
             c.id as class_id, c.name as class_name, c.cycle_key, c.option as class_option,
             c.card_color, c.card_color_soft, c.card_color_dark,
             c.card_family, c.card_variant, c.card_pat, c.card_pat_style,
             c.teacher_profile_id,
             p.display_name as teacher_name,
             y.id as academic_year_id, y.name as academic_year_label,
             sc.name as school_name, sc.name_en as school_name_en, sc.logo_path as school_logo_path,
             sc.motto as school_motto, sc.director_name as school_director_name,
             cont.address, cont.phone, cont.email, cont.website_url, cont.province, cont.city,
             (select jsonb_agg(jsonb_build_object(
                       'id', g.id, 'full_name', g.full_name, 'guardian_type', g.guardian_type,
                       'phone', g.phone, 'is_primary', g.is_primary,
                       'is_authorized_pickup', g.is_authorized_pickup)
                     order by g.is_primary desc, g.created_at)
              from app.student_guardians g
              where g.student_id = s.id and g.school_id = s.school_id and g.is_active = true) as guardians
           from app.students s
           left join app.classes c on c.id = s.class_id and c.school_id = s.school_id
           left join iam.profiles p on p.id = c.teacher_profile_id and p.school_id = c.school_id
           left join app.academic_years y on y.id = coalesce(c.academic_year_id, (select y2.id from app.academic_years y2 where y2.is_active = true limit 1))
           left join app.schools sc on sc.id = s.school_id
           left join app.school_contacts cont on cont.school_id = s.school_id
           where s.id = $1 and s.school_id = $2
           limit 1`,
          [studentId, context.schoolId],
        );
        const row = r.rows[0] as Record<string, unknown> | undefined;
        if (!row || row.id == null) return null;

        const guardians = (row.guardians as Array<Record<string, unknown>> | null) ?? [];
        const primary = guardians.find((g) => g.is_primary === true) ?? null;
        const authorized: CardAuthorizedPersonProjection[] = [];
        if (guardians.length) {
          const ids = guardians.map((g) => g.id);
          const slots = await client.query(
            `select pa.guardian_id, pa.slot_no
             from app.pickup_authorizations pa
             where pa.student_id = $1 and pa.school_id = $2 and pa.status = 'active'
               and pa.guardian_id = any($3::uuid[])
             order by pa.slot_no`,
            [studentId, context.schoolId, ids],
          );
          for (const slot of slots.rows as Array<{ guardian_id: string; slot_no: number }>) {
            const g = guardians.find((guard) => guard.id === slot.guardian_id);
            if (g && authorized.length < 3) {
              authorized.push({
                id: String(g.id),
                full_name: String(g.full_name),
                guardian_type: String(g.guardian_type),
                phone: (g.phone as string | null) ?? null,
                slot_no: slot.slot_no,
              });
            }
          }
        }

        return {
          student: {
            id: String(row.id),
            matricule: String(row.matricule ?? ""),
            first_name: String(row.first_name ?? ""),
            middle_name: (row.middle_name as string | null) ?? null,
            last_name: String(row.last_name ?? ""),
            date_of_birth: (row.date_of_birth as string | null) ?? null,
            photo_path: (row.photo_path as string | null) ?? null,
            lifecycle_status: String(row.lifecycle_status ?? ""),
          },
          school: {
            name: String(row.school_name ?? ""),
            name_en: (row.school_name_en as string | null) ?? null,
            logo_path: (row.school_logo_path as string | null) ?? null,
            motto: (row.school_motto as string | null) ?? null,
            director_name: (row.school_director_name as string | null) ?? null,
            address: (row.address as string | null) ?? null,
            phone: (row.phone as string | null) ?? null,
            email: (row.email as string | null) ?? null,
            website_url: (row.website_url as string | null) ?? null,
            province: (row.province as string | null) ?? null,
            city: (row.city as string | null) ?? null,
          },
          class: {
            id: (row.class_id as string | null) ?? null,
            name: (row.class_name as string | null) ?? null,
            cycle_key: (row.cycle_key as string | null) ?? null,
            option: (row.class_option as string | null) ?? null,
            card_color: (row.card_color as string | null) ?? null,
            card_color_soft: (row.card_color_soft as string | null) ?? null,
            card_color_dark: (row.card_color_dark as string | null) ?? null,
            card_family: (row.card_family as string | null) ?? null,
            card_variant: (row.card_variant as string | null) ?? null,
            card_pat: (row.card_pat as string | null) ?? null,
            card_pat_style: (row.card_pat_style as string | null) ?? null,
          },
          academic_year: {
            id: (row.academic_year_id as string | null) ?? null,
            label: (row.academic_year_label as string | null) ?? null,
          },
          teacher: {
            id: (row.teacher_profile_id as string | null) ?? null,
            name: (row.teacher_name as string | null) ?? null,
          },
          primary_guardian: primary
            ? {
                id: String(primary.id),
                full_name: String(primary.full_name),
                guardian_type: String(primary.guardian_type),
                phone: (primary.phone as string | null) ?? null,
              }
            : null,
          authorized_persons: authorized,
        } as CardProjection;
      });
    },

    /** Liste claire des données obligatoires manquantes (CARD_NOT_READY). */
    cardReadinessMissing(projection: CardProjection): string[] {
      const missing: string[] = [];
      if (projection.student.lifecycle_status !== "active") missing.push("lifecycle_status");
      if (!projection.student.matricule) missing.push("matricule");
      if (!projection.student.first_name) missing.push("first_name");
      if (!projection.student.last_name) missing.push("last_name");
      if (!projection.student.date_of_birth) missing.push("date_of_birth");
      if (!projection.student.photo_path) missing.push("photo");
      if (!projection.class.id || !projection.class.name) missing.push("class");
      if (!projection.academic_year.id || !projection.academic_year.label) missing.push("academic_year");
      if (!projection.school.name) missing.push("school_identity");
      if (!projection.primary_guardian) missing.push("primary_guardian");
      return missing;
    },

    /**
     * Carte active de l'élève : émission serveur si absente (credential HMAC
     * calculé côté serveur — le navigateur ne connaît jamais le secret).
     */
    async ensureActiveCard(context: RequestContext, projection: CardProjection): Promise<ActiveCard | null> {
      const secret = process.env.CARD_HMAC_SECRET;
      if (!secret) throw new Error("CARD_HMAC_SECRET is not configured");
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const existing = await client.query(
          `select id, card_number, signature, status
           from app.student_cards
           where student_id = $1 and school_id = $2 and status = 'active'
           order by issued_at desc limit 1`,
          [projection.student.id, context.schoolId],
        );
        const found = existing.rows[0] as { id: string; card_number: string; signature: string; status: string } | undefined;
        if (found) return found;

        const cardNumber = `SS-${projection.student.matricule.replace(/[^\w-]/g, "")}-${Date.now()}`;
        const signature = cardSignature(cardNumber, secret);
        const cardSecret = randomUUID();
        const inserted = await client.query(
          `insert into app.student_cards (school_id, student_id, card_number, card_secret, signature, status)
           values ($1, $2, $3, $4, $5, 'active')
           returning id, card_number, signature, status`,
          [context.schoolId, projection.student.id, cardNumber, cardSecret, signature],
        );
        return inserted.rows[0] as ActiveCard;
      });
    },

    /** Payload QR officiel — contrat du module Sécurité, jamais schoolsafe://student/. */
    buildQrPayload(card: { card_number: string; signature: string }): string {
      return `schoolsafe://card/${card.card_number}/${card.signature}`;
    },

    /** Nom du ZIP individuel : Carte_<MATRICULE>_<NOM>_<PRENOM>.zip */
    buildPackageZipName(matricule: string, lastName: string, firstName: string): string {
      return sanitizeName(`Carte_${matricule}_${lastName}_${firstName}`) + ".zip";
    },

    /** Dossier interne du ZIP individuel : Carte_<NOM>_<PRENOM>/ */
    buildPackageFolderName(lastName: string, firstName: string): string {
      return sanitizeName(`Carte_${lastName}_${firstName}`);
    },

    /** Nom du ZIP de lot : Cartes_<CLASSE>_<ANNEE>.zip */
    buildBatchZipName(className: string, yearLabel: string): string {
      return sanitizeName(`Cartes_${className}_${yearLabel}`) + ".zip";
    },

    /** Dossier d'un élève dans le lot : <matricule>_<nom>_<prenom>/ */
    buildBatchEntryFolder(matricule: string, lastName: string, firstName: string): string {
      return sanitizeName(`${matricule}_${lastName}_${firstName}`);
    },

    /**
     * Package ZIP individuel : recto.png, verso.png et manifest.json sans secret.
     * Refuse tout élève non prêt (CARD_NOT_READY missing=[...]).
     */
    async buildCardPackage(
      _context: RequestContext,
      input: {
        projection: CardProjection;
        card: ActiveCard | null;
        recto: Buffer;
        verso: Buffer;
        version?: number;
      },
    ): Promise<CardPackageResult> {
      const missing = this.cardReadinessMissing(input.projection);
      if (missing.length > 0) {
        throw new Error(`CARD_NOT_READY missing=[${missing.join(",")}]`);
      }
      if (!input.card) {
        throw new Error("Aucune carte active : le credential QR est requis avant le package");
      }
      const { buildZip } = await import("./batches.js");
      const rectoSha = createHash("sha256").update(input.recto).digest("hex");
      const versoSha = createHash("sha256").update(input.verso).digest("hex");
      const manifest = {
        student_id: input.projection.student.id,
        matricule: input.projection.student.matricule,
        student_name: [
          input.projection.student.first_name,
          input.projection.student.middle_name,
          input.projection.student.last_name,
        ].filter(Boolean).join(" "),
        class_name: input.projection.class.name ?? "",
        academic_year: input.projection.academic_year.label ?? "",
        card_number: input.card.card_number,
        version: input.version ?? 1,
        generated_at: new Date().toISOString(),
        recto_sha256: rectoSha,
        verso_sha256: versoSha,
      };
      const folderName = this.buildPackageFolderName(input.projection.student.last_name, input.projection.student.first_name);
      const zip = buildZip([
        { name: `${folderName}/recto.png`, data: input.recto },
        { name: `${folderName}/verso.png`, data: input.verso },
        { name: `${folderName}/manifest.json`, data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") },
      ]);
      return {
        zip,
        filename: this.buildPackageZipName(input.projection.student.matricule, input.projection.student.last_name, input.projection.student.first_name),
        folderName,
        manifest,
      };
    },

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
