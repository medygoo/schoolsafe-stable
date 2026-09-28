// SchoolSafe B1 — Child Record Complete: native PostgreSQL service.
// All queries execute within withRequestContext; school_id comes from session.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";

export interface StudentRecordNativeService {
  getRecord(context: RequestContext, studentId: string): Promise<Record<string, unknown>>;
  getCompleteness(context: RequestContext, studentId: string): Promise<Record<string, unknown>>;
  getCanteenDietary(context: RequestContext, studentId: string): Promise<Record<string, unknown>>;
  getParentChildren(context: RequestContext): Promise<unknown[]>;
  updateEmergencyContact(
    context: RequestContext,
    studentId: string,
    slot: number,
    input: { full_name: string; relation: string; phone: string; alternate_phone?: string; notes?: string; guardian_id?: string },
  ): Promise<Record<string, unknown>>;
  upsertHealthProfile(
    context: RequestContext,
    studentId: string,
    input: {
      blood_type?: string;
      primary_doctor_name?: string;
      primary_doctor_phone?: string;
      medical_notes?: string;
      emergency_instructions?: string;
      medical_declaration_completed?: boolean;
      medical_consent_status?: boolean;
    },
  ): Promise<Record<string, unknown>>;
  addAllergy(
    context: RequestContext,
    studentId: string,
    input: { category: string; allergen: string; severity?: string; reaction?: string; emergency_instruction?: string },
  ): Promise<Record<string, unknown>>;
  addDietaryRestriction(
    context: RequestContext,
    studentId: string,
    input: { kind: string; label: string; notes?: string },
  ): Promise<Record<string, unknown>>;
  setConfirmation(
    context: RequestContext,
    studentId: string,
    key: string,
    confirmed: boolean,
  ): Promise<Record<string, unknown>>;
  setConsent(
    context: RequestContext,
    studentId: string,
    key: string,
    decision: boolean,
  ): Promise<Record<string, unknown>>;
  addMedication(
    context: RequestContext,
    studentId: string,
    input: { name: string; dosage_text?: string; schedule_text?: string; instructions?: string; school_administration_required?: boolean },
  ): Promise<Record<string, unknown>>;
  addFoodPreference(
    context: RequestContext,
    studentId: string,
    input: { preference_type: "liked" | "disliked"; item: string; notes?: string },
  ): Promise<Record<string, unknown>>;
  upsertDietaryProfile(
    context: RequestContext,
    studentId: string,
    input: { dietary_declaration_completed?: boolean; parent_food_note?: string },
  ): Promise<Record<string, unknown>>;
}

export function createStudentRecordNativeService(businessPool: BusinessPool): StudentRecordNativeService {
  return {
    async getRecord(context: RequestContext, studentId: string): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.student_read($1) as result", [studentId]);
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async getCompleteness(context: RequestContext, studentId: string): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.student_record_completeness($1) as result", [studentId]);
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async getCanteenDietary(context: RequestContext, studentId: string): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.canteen_student_dietary($1) as result", [studentId]);
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async getParentChildren(context: RequestContext): Promise<unknown[]> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.parent_children() as result");
        return (r.rows[0].result ?? []) as unknown[];
      });
    },

    async updateEmergencyContact(
      context: RequestContext,
      studentId: string,
      slot: number,
      input: { full_name: string; relation: string; phone: string; alternate_phone?: string; notes?: string; guardian_id?: string },
    ): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          `insert into app.student_emergency_contacts
             (school_id, student_id, slot_no, guardian_id, full_name, relation, phone, alternate_phone, notes, created_by, updated_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
           on conflict (school_id, student_id, slot_no)
           do update set guardian_id=$4, full_name=$5, relation=$6, phone=$7, alternate_phone=$8, notes=$9, updated_by=$10, updated_at=now()
           returning id, slot_no, full_name, relation, phone`,
          [context.schoolId, studentId, slot, input.guardian_id ?? null, input.full_name, input.relation, input.phone, input.alternate_phone ?? null, input.notes ?? null, context.userId],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    async upsertHealthProfile(
      context: RequestContext,
      studentId: string,
      input: {
        blood_type?: string;
        primary_doctor_name?: string;
        primary_doctor_phone?: string;
        medical_notes?: string;
        emergency_instructions?: string;
        medical_declaration_completed?: boolean;
        medical_consent_status?: boolean;
      },
    ): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          `insert into app.student_health_profiles
             (student_id, school_id, blood_type, primary_doctor_name, primary_doctor_phone, medical_notes, emergency_instructions, medical_declaration_completed, medical_consent_status, last_confirmed_by)
           values ($1, $2, coalesce($3,'UNKNOWN'), $4, $5, $6, $7, coalesce($8,false), $9, $10)
           on conflict (student_id) do update set
             blood_type=coalesce(excluded.blood_type, app.student_health_profiles.blood_type),
             primary_doctor_name=excluded.primary_doctor_name,
             primary_doctor_phone=excluded.primary_doctor_phone,
             medical_notes=excluded.medical_notes,
             emergency_instructions=excluded.emergency_instructions,
             medical_declaration_completed=excluded.medical_declaration_completed,
             medical_consent_status=excluded.medical_consent_status,
             last_confirmed_by=excluded.last_confirmed_by,
             last_confirmed_at=case when excluded.medical_declaration_completed then now() else app.student_health_profiles.last_confirmed_at end,
             updated_at=now()
           returning student_id, blood_type, medical_declaration_completed`,
          [
            studentId,
            context.schoolId,
            input.blood_type ?? null,
            input.primary_doctor_name ?? null,
            input.primary_doctor_phone ?? null,
            input.medical_notes ?? null,
            input.emergency_instructions ?? null,
            input.medical_declaration_completed ?? null,
            input.medical_consent_status ?? null,
            context.userId,
          ],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    async addAllergy(
      context: RequestContext,
      studentId: string,
      input: { category: string; allergen: string; severity?: string; reaction?: string; emergency_instruction?: string },
    ): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          `insert into app.student_allergies
             (school_id, student_id, category, allergen, severity, reaction, emergency_instruction, status, reported_by)
           values ($1, $2, $3, $4, coalesce($5,'unknown'), $6, $7, 'reported', $8)
           returning id, category, allergen, severity, status`,
          [context.schoolId, studentId, input.category, input.allergen, input.severity ?? null, input.reaction ?? null, input.emergency_instruction ?? null, context.userId],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    async addDietaryRestriction(
      context: RequestContext,
      studentId: string,
      input: { kind: string; label: string; notes?: string },
    ): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          `insert into app.student_dietary_restrictions
             (school_id, student_id, kind, label, notes, status, reported_by)
           values ($1, $2, $3, $4, $5, 'reported', $6)
           returning id, kind, label, status`,
          [context.schoolId, studentId, input.kind, input.label, input.notes ?? null, context.userId],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    async setConfirmation(
      context: RequestContext,
      studentId: string,
      key: string,
      confirmed: boolean,
    ): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          `insert into app.student_record_confirmations
             (school_id, student_id, confirmation_key, confirmed, confirmed_by, confirmed_at)
           values ($1, $2, $3, $4, $5, case when $4 then now() else null end)
           on conflict (school_id, student_id, confirmation_key)
           do update set confirmed=$4, confirmed_by=$5, confirmed_at=case when $4 then now() else app.student_record_confirmations.confirmed_at end, updated_at=now()
           returning confirmation_key, confirmed`,
          [context.schoolId, studentId, key, confirmed, context.userId],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    async setConsent(
      context: RequestContext,
      studentId: string,
      key: string,
      decision: boolean,
    ): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          `insert into app.student_consents
             (school_id, student_id, consent_key, decision, decided_by, decided_at)
           values ($1, $2, $3, $4, $5, now())
           on conflict (school_id, student_id, consent_key)
           do update set decision=$4, decided_by=$5, decided_at=now(), updated_at=now()
           returning consent_key, decision`,
          [context.schoolId, studentId, key, decision, context.userId],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    async addMedication(
      context: RequestContext,
      studentId: string,
      input: { name: string; dosage_text?: string; schedule_text?: string; instructions?: string; school_administration_required?: boolean },
    ): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          `insert into app.student_medications
             (school_id, student_id, name, dosage_text, schedule_text, instructions, school_administration_required, status, reported_by)
           values ($1, $2, $3, $4, $5, $6, coalesce($7,false), 'active', $8)
           returning id, name, status, school_administration_required`,
          [
            context.schoolId,
            studentId,
            input.name,
            input.dosage_text ?? null,
            input.schedule_text ?? null,
            input.instructions ?? null,
            input.school_administration_required ?? false,
            context.userId,
          ],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    async addFoodPreference(
      context: RequestContext,
      studentId: string,
      input: { preference_type: "liked" | "disliked"; item: string; notes?: string },
    ): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          `insert into app.student_food_preferences
             (school_id, student_id, preference_type, item, notes, status, reported_by)
           values ($1, $2, $3, $4, $5, 'active', $6)
           returning id, preference_type, item, status`,
          [context.schoolId, studentId, input.preference_type, input.item, input.notes ?? null, context.userId],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    async upsertDietaryProfile(
      context: RequestContext,
      studentId: string,
      input: { dietary_declaration_completed?: boolean; parent_food_note?: string },
    ): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          `insert into app.student_dietary_profiles
             (student_id, school_id, dietary_declaration_completed, parent_food_note, last_confirmed_by)
           values ($1, $2, coalesce($3,false), $4, $5)
           on conflict (student_id) do update set
             dietary_declaration_completed=coalesce(excluded.dietary_declaration_completed, app.student_dietary_profiles.dietary_declaration_completed),
             parent_food_note=excluded.parent_food_note,
             last_confirmed_by=excluded.last_confirmed_by,
             last_confirmed_at=case when excluded.dietary_declaration_completed then now() else app.student_dietary_profiles.last_confirmed_at end,
             updated_at=now()
           returning student_id, dietary_declaration_completed`,
          [
            studentId,
            context.schoolId,
            input.dietary_declaration_completed ?? null,
            input.parent_food_note ?? null,
            context.userId,
          ],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },
  };
}