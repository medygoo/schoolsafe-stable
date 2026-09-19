import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SchoolSafeError } from "../http/errors.js";
import type { CreateStudentDraftPayload, StudentListQuery } from "./schema.js";

export type ParentInvitationDeliveryInput = {
  email: string;
  firstName: string;
  schoolId: string;
  studentId: string;
  token: string;
  expiresAt: string;
};

export interface ParentInvitationDelivery {
  deliver(input: ParentInvitationDeliveryInput): Promise<void>;
}

export interface StudentDraftResult {
  id: string;
  lifecycle_status: "draft";
  class_id: null;
  enrollment_status: "draft";
  parent: { id: string; account_status: "active" | "pending_activation" };
}

export interface StudentsService {
  createDraft(schoolId: string, actorProfileId: string, payload: CreateStudentDraftPayload): Promise<StudentDraftResult>;
  listStudents(token: string, schoolId: string, filters: StudentListQuery): Promise<unknown[]>;
  getStudent(token: string, schoolId: string, studentId: string): Promise<unknown>;
  listParents(token: string, schoolId: string, query: string): Promise<unknown[]>;
}

type UserClientFactory = (token: string) => SupabaseClient;

function mapDatabaseError(error: { code?: string; message?: string }): SchoolSafeError {
  if (error.code === "23505") {
    return new SchoolSafeError(409, "STUDENT_MATRICULE_EXISTS", "Ce matricule existe déjà dans l’école.", false);
  }
  if (error.code === "23514" || error.code === "P0001") {
    return new SchoolSafeError(400, "STUDENT_DRAFT_INVALID", error.message ?? "Dossier élève invalide", false);
  }
  if (error.code === "42501") {
    return new SchoolSafeError(403, "ACCESS_DENIED", "Permission refusée", false);
  }
  return new SchoolSafeError(500, "STUDENT_DRAFT_FAILED", "Création du dossier impossible", true);
}

function normalizeRpcResult(data: unknown): StudentDraftResult {
  const value = typeof data === "string" ? JSON.parse(data) : data;
  if (!value || typeof value !== "object") {
    throw new SchoolSafeError(500, "STUDENT_DRAFT_FAILED", "Réponse de création invalide", true);
  }
  return value as StudentDraftResult;
}

export function createStudentsService(
  serviceClient: SupabaseClient,
  createUserClient: UserClientFactory,
  invitationDelivery?: ParentInvitationDelivery,
): StudentsService {
  async function hydrateStudents(client: SupabaseClient, rows: Array<Record<string, unknown>>): Promise<unknown[]> {
    if (rows.length === 0) return [];
    const studentIds = rows.map((row) => String(row.id));
    const { data: enrollments, error: enrollmentError } = await client
      .from("student_enrollments")
      .select("id, student_id, academic_year_id, class_id, status, starts_on, ends_on, created_at")
      .in("student_id", studentIds);
    if (enrollmentError) throw new SchoolSafeError(500, "STUDENT_READ_FAILED", "Lecture des inscriptions impossible", true);

    const { data: guardians, error: guardianError } = await client
      .from("student_guardians")
      .select("student_id, guardian_type, is_primary, profiles:profile_id(id, display_name, first_name, last_name, email, phone, account_status)")
      .in("student_id", studentIds)
      .eq("is_primary", true);
    if (guardianError) throw new SchoolSafeError(500, "STUDENT_READ_FAILED", "Lecture du Parent principal impossible", true);

    const classIds = [...new Set((enrollments ?? []).map((row) => row.class_id).filter(Boolean) as string[])];
    const yearIds = [...new Set((enrollments ?? []).map((row) => row.academic_year_id).filter(Boolean) as string[])];
    const classNames = new Map<string, string>();
    const yearLabels = new Map<string, string>();

    if (classIds.length > 0) {
      const { data: classes, error } = await client.from("classes").select("id, name").in("id", classIds);
      if (error) throw new SchoolSafeError(500, "STUDENT_READ_FAILED", "Lecture des classes impossible", true);
      for (const row of classes ?? []) classNames.set(String(row.id), String(row.name));
    }
    if (yearIds.length > 0) {
      const { data: years, error } = await client.from("academic_years").select("id, label").in("id", yearIds);
      if (error) throw new SchoolSafeError(500, "STUDENT_READ_FAILED", "Lecture des années scolaires impossible", true);
      for (const row of years ?? []) yearLabels.set(String(row.id), String(row.label));
    }

    return rows.map((student) => {
      const enrollment = (enrollments ?? []).find((row) => String(row.student_id) === String(student.id));
      const guardian = (guardians ?? []).find((row) => String(row.student_id) === String(student.id));
      const profileValue = guardian?.profiles as unknown;
      const profile = Array.isArray(profileValue) ? profileValue[0] : profileValue;
      return {
        ...student,
        enrollment: enrollment
          ? {
              ...enrollment,
              planned_class_id: enrollment.class_id,
              planned_class_name: enrollment.class_id ? classNames.get(String(enrollment.class_id)) ?? null : null,
              academic_year_label: enrollment.academic_year_id ? yearLabels.get(String(enrollment.academic_year_id)) ?? null : null,
            }
          : null,
        primary_parent: profile
          ? { ...(profile as Record<string, unknown>), guardian_type: guardian?.guardian_type }
          : null,
      };
    });
  }

  return {
    async createDraft(schoolId, actorProfileId, payload) {
      const invited = payload.primary_parent.mode === "invite";
      const token = invited ? randomBytes(32).toString("base64url") : null;
      const tokenHash = token ? createHash("sha256").update(token).digest("hex") : null;
      const parent = payload.primary_parent;

      const { data, error } = await serviceClient.rpc("create_student_draft", {
        p_school_id: schoolId,
        p_actor_profile_id: actorProfileId,
        p_matricule: payload.matricule,
        p_first_name: payload.first_name,
        p_middle_name: payload.middle_name ?? null,
        p_last_name: payload.last_name,
        p_date_of_birth: payload.date_of_birth ?? null,
        p_gender: payload.gender ?? null,
        p_academic_year_id: payload.academic_year_id,
        p_planned_class_id: payload.planned_class_id,
        p_enrollment_starts_on: payload.enrollment_starts_on,
        p_guardian_type: parent.guardian_type,
        p_existing_parent_profile_id: parent.mode === "existing" ? parent.profile_id : null,
        p_invited_parent_email: parent.mode === "invite" ? parent.email : null,
        p_invited_parent_first_name: parent.mode === "invite" ? parent.first_name : null,
        p_invited_parent_last_name: parent.mode === "invite" ? parent.last_name : null,
        p_invited_parent_phone: parent.mode === "invite" ? parent.phone ?? null : null,
        p_invitation_token_hash: tokenHash,
      });
      if (error) throw mapDatabaseError(error);
      const result = normalizeRpcResult(data);

      if (parent.mode === "invite" && token && invitationDelivery) {
        try {
          await invitationDelivery.deliver({
            email: parent.email,
            firstName: parent.first_name,
            schoolId,
            studentId: result.id,
            token,
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
          });
        } catch (deliveryError) {
          const compensation = await serviceClient.rpc("compensate_student_draft_creation", {
            p_student_id: result.id,
            p_actor_profile_id: actorProfileId,
          });
          if (compensation.error) {
            throw new SchoolSafeError(500, "STUDENT_COMPENSATION_FAILED", "Compensation du dossier impossible", true);
          }
          throw deliveryError;
        }
      }
      return result;
    },

    async listStudents(token, schoolId, filters) {
      const client = createUserClient(token);
      let query = client
        .from("students")
        .select("id, school_id, matricule, first_name, middle_name, last_name, date_of_birth, gender, lifecycle_status, class_id, created_at")
        .eq("school_id", schoolId)
        .eq("lifecycle_status", filters.status)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true });
      if (filters.query) {
        const safe = filters.query.replace(/[%(),]/g, "");
        query = query.or(`matricule.ilike.%${safe}%,first_name.ilike.%${safe}%,middle_name.ilike.%${safe}%,last_name.ilike.%${safe}%`);
      }
      const { data, error } = await query;
      if (error) throw new SchoolSafeError(500, "STUDENT_READ_FAILED", "Lecture des élèves impossible", true);
      return hydrateStudents(client, (data ?? []) as Array<Record<string, unknown>>);
    },

    async getStudent(token, schoolId, studentId) {
      const client = createUserClient(token);
      const { data, error } = await client
        .from("students")
        .select("id, school_id, matricule, first_name, middle_name, last_name, date_of_birth, gender, lifecycle_status, class_id, created_at")
        .eq("school_id", schoolId)
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw new SchoolSafeError(500, "STUDENT_READ_FAILED", "Lecture de l’élève impossible", true);
      if (!data) throw new SchoolSafeError(404, "STUDENT_NOT_FOUND", "Dossier élève introuvable", false);
      const [result] = await hydrateStudents(client, [data as Record<string, unknown>]);
      return result;
    },

    async listParents(token, schoolId, queryText) {
      const client = createUserClient(token);
      const safe = queryText.replace(/[%(),]/g, "");
      const { data, error } = await client
        .from("profiles")
        .select("id, display_name, first_name, last_name, email, phone, account_status")
        .eq("school_id", schoolId)
        .or(`display_name.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`)
        .order("display_name", { ascending: true })
        .limit(20);
      if (error) throw new SchoolSafeError(500, "PARENT_SEARCH_FAILED", "Recherche des Parents impossible", true);
      return data ?? [];
    },
  };
}
