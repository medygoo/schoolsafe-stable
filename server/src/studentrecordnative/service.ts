// SchoolSafe B1 — Child Record Complete: native PostgreSQL service.
// All queries execute within withRequestContext; school_id comes from session.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";

export type GuardianInput = {
  profile_id?: string;
  guardian_type: "pere" | "mere" | "tuteur";
  full_name: string;
  phone?: string;
  email?: string;
  address?: string;
  is_authorized_pickup?: boolean;
  is_primary?: boolean;
};

export type HealthProfileInput = {
  blood_type?: string;
  primary_doctor_name?: string;
  primary_doctor_phone?: string;
  medical_notes?: string;
  emergency_instructions?: string;
  medical_declaration_completed?: boolean;
  medical_consent_status?: boolean;
};

export interface StudentRecordNativeService {
  getRecord(context: RequestContext, studentId: string): Promise<Record<string, unknown>>;
  getCompleteness(context: RequestContext, studentId: string): Promise<Record<string, unknown>>;
  updateIdentity(context: RequestContext, studentId: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;

  getFamily(context: RequestContext, studentId: string): Promise<unknown[]>;
  addGuardian(context: RequestContext, studentId: string, input: GuardianInput): Promise<Record<string, unknown>>;
  updateGuardian(context: RequestContext, studentId: string, guardianId: string, input: Partial<GuardianInput>): Promise<Record<string, unknown>>;
  setPrimaryGuardian(context: RequestContext, studentId: string, guardianId: string): Promise<Record<string, unknown>>;
  deactivateGuardian(context: RequestContext, studentId: string, guardianId: string): Promise<Record<string, unknown>>;

  getEmergencyContacts(context: RequestContext, studentId: string): Promise<unknown[]>;
  updateEmergencyContact(
    context: RequestContext,
    studentId: string,
    slot: number,
    input: { full_name: string; relation: string; phone: string; alternate_phone?: string; notes?: string; guardian_id?: string },
  ): Promise<Record<string, unknown>>;

  getHealth(context: RequestContext, studentId: string): Promise<Record<string, unknown>>;
  upsertHealthProfile(context: RequestContext, studentId: string, input: HealthProfileInput): Promise<Record<string, unknown>>;
  addCondition(context: RequestContext, studentId: string, input: { name: string; notes?: string }): Promise<Record<string, unknown>>;
  updateCondition(context: RequestContext, studentId: string, conditionId: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
  addAllergy(
    context: RequestContext,
    studentId: string,
    input: { category: string; allergen: string; severity?: string; reaction?: string; emergency_instruction?: string },
  ): Promise<Record<string, unknown>>;
  updateAllergy(context: RequestContext, studentId: string, allergyId: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
  addMedication(
    context: RequestContext,
    studentId: string,
    input: { name: string; dosage_text?: string; schedule_text?: string; instructions?: string; school_administration_required?: boolean },
  ): Promise<Record<string, unknown>>;
  updateMedication(context: RequestContext, studentId: string, medicationId: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;

  getDietary(context: RequestContext, studentId: string): Promise<Record<string, unknown>>;
  upsertDietaryProfile(
    context: RequestContext,
    studentId: string,
    input: { dietary_declaration_completed?: boolean; parent_food_note?: string },
  ): Promise<Record<string, unknown>>;
  addDietaryRestriction(
    context: RequestContext,
    studentId: string,
    input: { kind: string; label: string; notes?: string },
  ): Promise<Record<string, unknown>>;
  updateDietaryRestriction(context: RequestContext, studentId: string, restrictionId: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;
  addFoodPreference(
    context: RequestContext,
    studentId: string,
    input: { preference_type: "liked" | "disliked"; item: string; notes?: string },
  ): Promise<Record<string, unknown>>;
  updateFoodPreference(context: RequestContext, studentId: string, preferenceId: string, input: Record<string, unknown>): Promise<Record<string, unknown>>;

  setConfirmation(context: RequestContext, studentId: string, key: string, confirmed: boolean): Promise<Record<string, unknown>>;
  setConsent(context: RequestContext, studentId: string, key: string, decision: boolean): Promise<Record<string, unknown>>;

  getCanteenDietary(context: RequestContext, studentId: string): Promise<Record<string, unknown>>;
  getParentChildren(context: RequestContext): Promise<unknown[]>;
  getParentChildRecord(context: RequestContext, studentId: string): Promise<Record<string, unknown>>;
}

export function createStudentRecordNativeService(businessPool: BusinessPool): StudentRecordNativeService {
  async function queryJson(
    context: RequestContext,
    sql: string,
    params: unknown[] = [],
  ): Promise<Record<string, unknown>> {
    return withRequestContext(businessPool, context, async (client: PoolClient) => {
      const r = await client.query(sql, params);
      return (r.rows[0]?.result ?? {}) as Record<string, unknown>;
    });
  }

  async function queryJsonArray(
    context: RequestContext,
    sql: string,
    params: unknown[] = [],
  ): Promise<unknown[]> {
    return withRequestContext(businessPool, context, async (client: PoolClient) => {
      const r = await client.query(sql, params);
      return (r.rows[0]?.result ?? []) as unknown[];
    });
  }

  return {
    getRecord: (context, studentId) =>
      queryJson(context, "select api.student_record_read($1) as result", [studentId]),

    getCompleteness: (context, studentId) =>
      queryJson(context, "select api.student_record_completeness($1) as result", [studentId]),

    updateIdentity: (context, studentId, input) =>
      queryJson(context, "select api.student_identity_update($1,$2::jsonb) as result", [studentId, JSON.stringify(input)]),

    getFamily: (context, studentId) =>
      queryJsonArray(context, "select api.student_family_read($1) as result", [studentId]),

    addGuardian: (context, studentId, input) =>
      queryJson(context, "select api.student_guardian_add($1,$2::jsonb) as result", [studentId, JSON.stringify(input)]),

    updateGuardian: (context, studentId, guardianId, input) =>
      queryJson(context, "select api.student_guardian_update($1,$2,$3::jsonb) as result", [studentId, guardianId, JSON.stringify(input)]),

    setPrimaryGuardian: (context, studentId, guardianId) =>
      queryJson(context, "select api.student_guardian_set_primary($1,$2) as result", [studentId, guardianId]),

    deactivateGuardian: (context, studentId, guardianId) =>
      queryJson(context, "select api.student_guardian_deactivate($1,$2) as result", [studentId, guardianId]),

    getEmergencyContacts: (context, studentId) =>
      queryJsonArray(context, "select api.student_emergency_contacts_read($1) as result", [studentId]),

    async updateEmergencyContact(context, studentId, slot, input) {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select * from api.student_emergency_contact_upsert($1,$2,$3,$4,$5,$6,$7,$8)",
          [studentId, slot, input.guardian_id ?? null, input.full_name, input.relation, input.phone, input.alternate_phone ?? null, input.notes ?? null],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    getHealth: (context, studentId) =>
      queryJson(context, "select api.student_health_read($1) as result", [studentId]),

    async upsertHealthProfile(context, studentId, input) {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select * from api.student_health_profile_upsert($1,$2,$3,$4,$5,$6,$7,$8)",
          [studentId, input.blood_type ?? null, input.primary_doctor_name ?? null, input.primary_doctor_phone ?? null, input.medical_notes ?? null, input.emergency_instructions ?? null, input.medical_declaration_completed ?? null, input.medical_consent_status ?? null],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    addCondition: (context, studentId, input) =>
      queryJson(context, "select api.student_health_condition_add($1,$2::jsonb) as result", [studentId, JSON.stringify(input)]),

    updateCondition: (context, studentId, conditionId, input) =>
      queryJson(context, "select api.student_health_condition_update($1,$2,$3::jsonb) as result", [studentId, conditionId, JSON.stringify(input)]),

    async addAllergy(context, studentId, input) {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select * from api.student_allergy_add($1,$2,$3,$4,$5,$6)",
          [studentId, input.category, input.allergen, input.severity ?? null, input.reaction ?? null, input.emergency_instruction ?? null],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    updateAllergy: (context, studentId, allergyId, input) =>
      queryJson(context, "select api.student_allergy_update($1,$2,$3::jsonb) as result", [studentId, allergyId, JSON.stringify(input)]),

    async addMedication(context, studentId, input) {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select * from api.student_medication_add($1,$2,$3,$4,$5,$6)",
          [studentId, input.name, input.dosage_text ?? null, input.schedule_text ?? null, input.instructions ?? null, input.school_administration_required ?? false],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    updateMedication: (context, studentId, medicationId, input) =>
      queryJson(context, "select api.student_medication_update($1,$2,$3::jsonb) as result", [studentId, medicationId, JSON.stringify(input)]),

    getDietary: (context, studentId) =>
      queryJson(context, "select api.student_dietary_read($1) as result", [studentId]),

    async upsertDietaryProfile(context, studentId, input) {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select * from api.student_dietary_profile_upsert($1,$2,$3)",
          [studentId, input.dietary_declaration_completed ?? null, input.parent_food_note ?? null],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    async addDietaryRestriction(context, studentId, input) {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select * from api.student_dietary_restriction_add($1,$2,$3,$4)",
          [studentId, input.kind, input.label, input.notes ?? null],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    updateDietaryRestriction: (context, studentId, restrictionId, input) =>
      queryJson(context, "select api.student_dietary_restriction_update($1,$2,$3::jsonb) as result", [studentId, restrictionId, JSON.stringify(input)]),

    async addFoodPreference(context, studentId, input) {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select * from api.student_food_preference_add($1,$2,$3,$4)",
          [studentId, input.preference_type, input.item, input.notes ?? null],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    updateFoodPreference: (context, studentId, preferenceId, input) =>
      queryJson(context, "select api.student_food_preference_update($1,$2,$3::jsonb) as result", [studentId, preferenceId, JSON.stringify(input)]),

    async setConfirmation(context, studentId, key, confirmed) {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select * from api.student_record_confirmation_set($1,$2,$3)",
          [studentId, key, confirmed],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    async setConsent(context, studentId, key, decision) {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select * from api.student_consent_set($1,$2,$3)",
          [studentId, key, decision],
        );
        return r.rows[0] as Record<string, unknown>;
      });
    },

    getCanteenDietary: (context, studentId) =>
      queryJson(context, "select api.canteen_student_dietary($1) as result", [studentId]),

    getParentChildren: (context) =>
      queryJsonArray(context, "select api.parent_children() as result"),

    getParentChildRecord: (context, studentId) =>
      queryJson(context, "select api.student_record_read($1) as result", [studentId]),
  };
}
