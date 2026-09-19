import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { RequestCardPrintItem } from "./schema.js";
import type { ControlAppConfig } from "../control-app/client.js";
import { pushCardPrintRequest } from "../control-app/client.js";
import { createR2Client, uploadBuffer, getSignedDownloadUrl, type R2Config } from "../storage/r2.js";
import type { S3Client } from "@aws-sdk/client-s3";
import { assertStudentOperational } from "../students/operational.js";

export interface CardService {
  requestPrintBatch(requesterProfileId: string, inputs: RequestCardPrintItem[]): Promise<CardPrintBatchResult[]>;
}

export type CardPrintBatchResult = {
  studentId: string;
  requestId: string;
  version: number;
  controlAppId?: string;
  status: "submitted" | "failed";
  error?: string;
};

type SchoolInfo = {
  id: string;
  slug: string;
};

type StudentInfo = {
  id: string;
  school_id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
};

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function base64ToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64, "base64");
}

export function createCardService(
  supabaseUrl: string,
  serviceRoleKey: string,
  r2Config?: R2Config,
  controlAppConfig?: ControlAppConfig
): CardService {
  const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);
  const r2Client = r2Config ? createR2Client(r2Config) : undefined;
  const bucket = r2Config?.bucket ?? "cards";

  async function getSchoolSlug(schoolId: string): Promise<string> {
    const { data, error } = await serviceClient
      .from("school")
      .select("id")
      .eq("id", schoolId)
      .single();
    if (error || !data) throw new Error(`School not found: ${error?.message}`);
    return schoolId.slice(0, 8);
  }

  async function getStudent(studentId: string): Promise<StudentInfo & { class_name: string | null; academic_year_name: string | null }> {
    await assertStudentOperational(serviceClient, studentId);
    const { data: student, error: studentError } = await serviceClient
      .from("students")
      .select("id, school_id, matricule, first_name, last_name, class_id")
      .eq("id", studentId)
      .single();
    if (studentError || !student) throw new Error(`Student not found: ${studentError?.message}`);

    let className: string | null = null;
    if (student.class_id) {
      const { data: cls } = await serviceClient
        .from("classes")
        .select("name")
        .eq("id", student.class_id)
        .single();
      className = cls?.name ?? null;
    }

    return { ...student, class_name: className, academic_year_name: null };
  }

  async function getAcademicYearName(yearId: string | undefined): Promise<string | null> {
    if (!yearId) return null;
    const { data } = await serviceClient
      .from("academic_years")
      .select("name")
      .eq("id", yearId)
      .single();
    return data?.name ?? null;
  }

  async function incrementCardPrintCount(studentId: string): Promise<number> {
    const { data, error } = await serviceClient.rpc("increment_card_print_count", {
      student_id: studentId
    });
    if (error || data === null) {
      throw new Error(`Failed to increment card print count: ${error?.message ?? "unknown"}`);
    }
    return data as number;
  }

  async function uploadCardImages(
    schoolSlug: string,
    academicYear: string,
    matricule: string,
    version: number,
    requestId: string,
    frontBuffer: Buffer,
    backBuffer: Buffer
  ): Promise<{ frontKey: string; backKey: string }> {
    const folder = `cards/${schoolSlug}/${academicYear}/${matricule.replace(/\s+/g, "_")}/v${version}/${requestId}`;
    const frontKey = `${folder}/front.png`;
    const backKey = `${folder}/back.png`;

    if (r2Client) {
      await uploadBuffer(r2Client, bucket, frontKey, frontBuffer);
      await uploadBuffer(r2Client, bucket, backKey, backBuffer);
    } else {
      console.warn("[CardService] R2 not configured, skipping image upload");
    }

    return { frontKey, backKey };
  }

  async function generateSignedUrls(frontKey: string, backKey: string): Promise<{ frontUrl: string; backUrl: string; expiresAt: string }> {
    if (!r2Client) {
      return { frontUrl: "", backUrl: "", expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() };
    }
    const [frontUrl, backUrl] = await Promise.all([
      getSignedDownloadUrl(r2Client, bucket, frontKey),
      getSignedDownloadUrl(r2Client, bucket, backKey)
    ]);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    return { frontUrl, backUrl, expiresAt };
  }

  return {
    async requestPrintBatch(requesterProfileId: string, inputs: RequestCardPrintItem[]) {
      const results: CardPrintBatchResult[] = [];
      const schoolSlugCache = new Map<string, string>();

      for (const input of inputs) {
        const requestId = randomUUID();
        try {
          const student = await getStudent(input.student_id);
          if (!schoolSlugCache.has(student.school_id)) {
            schoolSlugCache.set(student.school_id, await getSchoolSlug(student.school_id));
          }
          const schoolSlug = schoolSlugCache.get(student.school_id)!;
          const academicYearName = await getAcademicYearName(input.academic_year_id);
          const yearLabel = academicYearName ?? new Date().getFullYear().toString();

          const version = await incrementCardPrintCount(student.id);
          const isDuplicate = version > 1;

          const frontBuffer = base64ToBuffer(input.front_image_base64);
          const backBuffer = base64ToBuffer(input.back_image_base64);

          const { frontKey, backKey } = await uploadCardImages(schoolSlug, yearLabel, student.matricule, version, requestId, frontBuffer, backBuffer);
          const { frontUrl, backUrl, expiresAt } = await generateSignedUrls(frontKey, backKey);

          const fullName = `${student.first_name} ${student.last_name}`.trim();
          const now = new Date().toISOString();

          const { error: insertError } = await serviceClient.from("card_print_requests").insert({
            id: requestId,
            school_id: student.school_id,
            student_id: student.id,
            academic_year_id: input.academic_year_id ?? null,
            requested_by: requesterProfileId,
            format: input.format,
            status: "pending",
            version,
            is_duplicate: isDuplicate,
            front_r2_key: frontKey,
            back_r2_key: backKey,
            front_image_url: frontUrl,
            back_image_url: backUrl,
            metadata: {
              ...input.metadata,
              student_name: fullName,
              matricule: student.matricule,
              class_name: student.class_name,
              requested_at: now
            }
          });

          if (insertError) throw new Error(`Failed to create print request: ${insertError.message}`);

          let controlAppId: string | undefined;
          if (controlAppConfig) {
            try {
              const result = await pushCardPrintRequest(controlAppConfig, {
                school_id: student.school_id,
                student_id: student.id,
                student_name: fullName,
                class_name: student.class_name ?? "—",
                academic_year: yearLabel,
                front_key: frontKey,
                back_key: backKey,
                front_signed_url: frontUrl,
                back_signed_url: backUrl,
                signed_url_expires_at: expiresAt,
                format: input.format,
                version,
                is_duplicate: isDuplicate,
                metadata: input.metadata
              });
              controlAppId = result.id;
              await serviceClient
                .from("card_print_requests")
                .update({ status: "submitted", submitted_at: now, control_app_reference: result.id })
                .eq("id", requestId);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              await serviceClient
                .from("card_print_requests")
                .update({ status: "failed", error_message: message })
                .eq("id", requestId);
              throw new Error(`Failed to push to control app: ${message}`);
            }
          }

          results.push({ studentId: student.id, requestId, version, controlAppId, status: "submitted" });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          results.push({ studentId: input.student_id, requestId, version: 0, status: "failed", error: message });
        }
      }

      return results;
    }
  };
}
