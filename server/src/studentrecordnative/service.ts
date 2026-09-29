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
          "select * from api.student_emergency_contact_upsert($1,$2,$3,$4,$5,$6,$7,$8)",
          [studentId, slot, input.guardian_id ?? null, input.full_name, input.relation, input.phone, input.alternate_phone ?? null, input.notes ?? null],
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
          "select * from api.student_health_profile_upsert($1,$2,$3,$4,$5,$6,$7,$8)",
          [studentId, input.blood_type ?? null, input.primary_doctor_name ?? null, input.primary_doctor_phone ?? null, input.medical_notes ?? null, input.emergency_instructions ?? null, input.medical_declaration_completed ?? null, input.medical_consent_status ?? null],
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
          "select * from api.student_allergy_add($1,$2,$3,$4,$5,$6)",
          [studentId, input.category, input.allergen, input.severity ?? null, input.reaction ?? null, input.emergency_instruction ?? null],
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
          "select * from api.student_dietary_restriction_add($1,$2,$3,$4)",
          [studentId, input.kind, input.label, input.notes ?? null],
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
          "select * from api.student_record_confirmation_set($1,$2,$3)",
          [studentId, key, confirmed],
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
          "select * from api.student_consent_set($1,$2,$3)",
          [studentId, key, decision],
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
          "select * from api.student_medication_add($1,$2,$3,$4,$5,$6)",
          [studentId, input.name, input.dosage_text ?? null, input.schedule_text ?? null, input.instructions ?? null, input.school_administration_required ?? false],
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
          "select * from api.student_food_preference_add($1,$2,$3,$4)",
          [studentId, input.preference_type, input.item, input.notes ?? null],
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
          "select * from api.student_dietary_profile_upsert($1,$2,$3)",
          [studentId, input.dietary_declaration_completed ?? null, input.parent_food_note ?? null],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },
  };
}