// SchoolSafe B1 — Child Record Complete: native HTTP routes.
// Session context is resolved server-side; school_id never comes from browser.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { RequestContext } from "../db/context.js";
import type { StudentRecordNativeService } from "./service.js";

export type StudentRecordNativeRouteDependencies = {
  authService: AuthNativeService;
  service: StudentRecordNativeService;
};

const identityPatch = z.object({
  first_name: z.string().min(1).max(120).optional(),
  middle_name: z.string().max(120).nullable().optional(),
  last_name: z.string().min(1).max(120).optional(),
  date_of_birth: z.string().date().nullable().optional(),
  gender: z.string().max(30).nullable().optional(),
  place_of_birth: z.string().max(200).nullable().optional(),
  nationality: z.string().max(120).nullable().optional(),
  home_address: z.string().max(500).nullable().optional(),
}).strict();

const guardianCreate = z.object({
  profile_id: z.string().uuid().optional(),
  guardian_type: z.enum(["pere", "mere", "tuteur"]),
  full_name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(320).optional(),
  address: z.string().max(500).optional(),
  is_authorized_pickup: z.boolean().optional(),
  is_primary: z.boolean().optional(),
}).strict();

const guardianPatch = guardianCreate.partial().omit({ profile_id: true, is_primary: true });

const conditionPatch = z.object({
  name: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).strict();

const allergyPatch = z.object({
  category: z.enum(["food", "medication", "environmental", "other"]).optional(),
  allergen: z.string().min(1).max(200).optional(),
  severity: z.enum(["mild", "moderate", "severe", "unknown"]).optional(),
  reaction: z.string().max(500).nullable().optional(),
  emergency_instruction: z.string().max(1000).nullable().optional(),
  status: z.enum(["reported", "confirmed", "inactive"]).optional(),
}).strict();

const medicationPatch = z.object({
  name: z.string().min(1).max(200).optional(),
  dosage_text: z.string().max(500).nullable().optional(),
  schedule_text: z.string().max(500).nullable().optional(),
  instructions: z.string().max(1000).nullable().optional(),
  school_administration_required: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).strict();

const dietaryRestrictionPatch = z.object({
  kind: z.enum(["intolerance", "prohibited_food", "restriction", "diet"]).optional(),
  label: z.string().min(1).max(200).optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(["reported", "confirmed", "inactive"]).optional(),
}).strict();

const preferencePatch = z.object({
  preference_type: z.enum(["liked", "disliked"]).optional(),
  item: z.string().min(1).max(200).optional(),
  notes: z.string().max(1000).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).strict();

export function registerStudentRecordNativeRoutes(
  app: FastifyInstance,
  dependencies: StudentRecordNativeRouteDependencies,
): void {
  const requireSession = requireAuthSession(dependencies.authService);

  function contextFrom(request: { authSession?: { userId: string; profileId: string; schoolId: string } }): RequestContext {
    const session = request.authSession!;
    return {
      userId: session.userId,
      profileId: session.profileId,
      schoolId: session.schoolId,
      requestId: newRequestId(),
    };
  }

  app.get("/native/students/:id/record", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.getRecord(contextFrom(request), id);
    return { data, request_id: newRequestId() };
  });

  app.get("/native/students/:id/completeness", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.getCompleteness(contextFrom(request), id);
    return { data, request_id: newRequestId() };
  });

  app.patch("/native/students/:id/identity", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.updateIdentity(contextFrom(request), id, identityPatch.parse(request.body));
    return { data, request_id: newRequestId() };
  });

  app.get("/native/students/:id/family", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.getFamily(contextFrom(request), id);
    return { data, request_id: newRequestId() };
  });

  app.post("/native/students/:id/guardians", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.addGuardian(contextFrom(request), id, guardianCreate.parse(request.body));
    return { data, request_id: newRequestId() };
  });

  app.patch("/native/students/:id/guardians/:guardianId", { preHandler: requireSession }, async (request) => {
    const { id, guardianId } = request.params as { id: string; guardianId: string };
    const data = await dependencies.service.updateGuardian(contextFrom(request), id, guardianId, guardianPatch.parse(request.body));
    return { data, request_id: newRequestId() };
  });

  app.post("/native/students/:id/guardians/:guardianId/set-primary", { preHandler: requireSession }, async (request) => {
    const { id, guardianId } = request.params as { id: string; guardianId: string };
    const data = await dependencies.service.setPrimaryGuardian(contextFrom(request), id, guardianId);
    return { data, request_id: newRequestId() };
  });

  app.post("/native/students/:id/guardians/:guardianId/deactivate", { preHandler: requireSession }, async (request) => {
    const { id, guardianId } = request.params as { id: string; guardianId: string };
    const data = await dependencies.service.deactivateGuardian(contextFrom(request), id, guardianId);
    return { data, request_id: newRequestId() };
  });

  app.get("/native/students/:id/emergency-contacts", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.getEmergencyContacts(contextFrom(request), id);
    return { data, request_id: newRequestId() };
  });

  app.put("/native/students/:id/emergency-contacts/:slot", { preHandler: requireSession }, async (request) => {
    const { id, slot } = request.params as { id: string; slot: string };
    const slotNo = z.coerce.number().int().min(1).max(2).parse(slot);
    const body = z.object({
      full_name: z.string().min(1).max(200),
      relation: z.string().min(1).max(100),
      phone: z.string().min(1).max(50),
      alternate_phone: z.string().max(50).optional(),
      notes: z.string().max(1000).optional(),
      guardian_id: z.string().uuid().optional(),
    }).strict().parse(request.body);
    const data = await dependencies.service.updateEmergencyContact(contextFrom(request), id, slotNo, body);
    return { data, request_id: newRequestId() };
  });

  app.get("/native/students/:id/health", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.getHealth(contextFrom(request), id);
    return { data, request_id: newRequestId() };
  });

  app.put("/native/students/:id/health", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      blood_type: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"]).optional(),
      primary_doctor_name: z.string().max(200).optional(),
      primary_doctor_phone: z.string().max(50).optional(),
      medical_notes: z.string().max(2000).optional(),
      emergency_instructions: z.string().max(2000).optional(),
      medical_declaration_completed: z.boolean().optional(),
      medical_consent_status: z.boolean().optional(),
    }).strict().parse(request.body);
    const data = await dependencies.service.upsertHealthProfile(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  app.post("/native/students/:id/health/conditions", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ name: z.string().min(1).max(200), notes: z.string().max(2000).optional() }).strict().parse(request.body);
    const data = await dependencies.service.addCondition(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  app.patch("/native/students/:id/health/conditions/:conditionId", { preHandler: requireSession }, async (request) => {
    const { id, conditionId } = request.params as { id: string; conditionId: string };
    const data = await dependencies.service.updateCondition(contextFrom(request), id, conditionId, conditionPatch.parse(request.body));
    return { data, request_id: newRequestId() };
  });

  app.post("/native/students/:id/allergies", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      category: z.enum(["food", "medication", "environmental", "other"]),
      allergen: z.string().min(1).max(200),
      severity: z.enum(["mild", "moderate", "severe", "unknown"]).optional(),
      reaction: z.string().max(500).optional(),
      emergency_instruction: z.string().max(1000).optional(),
    }).strict().parse(request.body);
    const data = await dependencies.service.addAllergy(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  app.patch("/native/students/:id/allergies/:allergyId", { preHandler: requireSession }, async (request) => {
    const { id, allergyId } = request.params as { id: string; allergyId: string };
    const data = await dependencies.service.updateAllergy(contextFrom(request), id, allergyId, allergyPatch.parse(request.body));
    return { data, request_id: newRequestId() };
  });

  app.post("/native/students/:id/medications", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      name: z.string().min(1).max(200),
      dosage_text: z.string().max(500).optional(),
      schedule_text: z.string().max(500).optional(),
      instructions: z.string().max(1000).optional(),
      school_administration_required: z.boolean().optional(),
    }).strict().parse(request.body);
    const data = await dependencies.service.addMedication(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  app.patch("/native/students/:id/medications/:medicationId", { preHandler: requireSession }, async (request) => {
    const { id, medicationId } = request.params as { id: string; medicationId: string };
    const data = await dependencies.service.updateMedication(contextFrom(request), id, medicationId, medicationPatch.parse(request.body));
    return { data, request_id: newRequestId() };
  });

  app.get("/native/students/:id/dietary", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.getDietary(contextFrom(request), id);
    return { data, request_id: newRequestId() };
  });

  app.put("/native/students/:id/dietary", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      dietary_declaration_completed: z.boolean().optional(),
      parent_food_note: z.string().max(1000).optional(),
    }).strict().parse(request.body);
    const data = await dependencies.service.upsertDietaryProfile(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  app.post("/native/students/:id/dietary/restrictions", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      kind: z.enum(["intolerance", "prohibited_food", "restriction", "diet"]),
      label: z.string().min(1).max(200),
      notes: z.string().max(1000).optional(),
    }).strict().parse(request.body);
    const data = await dependencies.service.addDietaryRestriction(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  app.patch("/native/students/:id/dietary/restrictions/:restrictionId", { preHandler: requireSession }, async (request) => {
    const { id, restrictionId } = request.params as { id: string; restrictionId: string };
    const data = await dependencies.service.updateDietaryRestriction(contextFrom(request), id, restrictionId, dietaryRestrictionPatch.parse(request.body));
    return { data, request_id: newRequestId() };
  });

  app.post("/native/students/:id/dietary/preferences", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      preference_type: z.enum(["liked", "disliked"]),
      item: z.string().min(1).max(200),
      notes: z.string().max(1000).optional(),
    }).strict().parse(request.body);
    const data = await dependencies.service.addFoodPreference(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  app.patch("/native/students/:id/dietary/preferences/:preferenceId", { preHandler: requireSession }, async (request) => {
    const { id, preferenceId } = request.params as { id: string; preferenceId: string };
    const data = await dependencies.service.updateFoodPreference(contextFrom(request), id, preferenceId, preferencePatch.parse(request.body));
    return { data, request_id: newRequestId() };
  });

  app.put("/native/students/:id/confirmations/:key", { preHandler: requireSession }, async (request) => {
    const { id, key } = request.params as { id: string; key: string };
    z.enum(["family", "medical", "dietary", "pickup"]).parse(key);
    const { confirmed } = z.object({ confirmed: z.boolean() }).strict().parse(request.body);
    const data = await dependencies.service.setConfirmation(contextFrom(request), id, key, confirmed);
    return { data, request_id: newRequestId() };
  });

  app.put("/native/students/:id/consents/:key", { preHandler: requireSession }, async (request) => {
    const { id, key } = request.params as { id: string; key: string };
    z.enum(["photo_video", "emergency_care"]).parse(key);
    const { decision } = z.object({ decision: z.boolean() }).strict().parse(request.body);
    const data = await dependencies.service.setConsent(contextFrom(request), id, key, decision);
    return { data, request_id: newRequestId() };
  });

  app.get("/native/canteen/students/:studentId/dietary", { preHandler: requireSession }, async (request) => {
    const { studentId } = request.params as { studentId: string };
    const data = await dependencies.service.getCanteenDietary(contextFrom(request), studentId);
    return { data, request_id: newRequestId() };
  });

  app.get("/native/parent/children", { preHandler: requireSession }, async (request) => {
    const data = await dependencies.service.getParentChildren(contextFrom(request));
    return { data, request_id: newRequestId() };
  });

  app.get("/native/parent/children/:studentId/record", { preHandler: requireSession }, async (request) => {
    const { studentId } = request.params as { studentId: string };
    const data = await dependencies.service.getParentChildRecord(contextFrom(request), studentId);
    return { data, request_id: newRequestId() };
  });
}
