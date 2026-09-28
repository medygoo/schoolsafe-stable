// SchoolSafe B1 — Child Record Complete: native HTTP routes.
// Session context is resolved server-side; school_id never comes from browser.
import type { FastifyInstance } from "fastify";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { StudentRecordNativeService } from "./service.js";
import type { RequestContext } from "../db/context.js";
import { z } from "zod";

export type StudentRecordNativeRouteDependencies = {
  authService: AuthNativeService;
  service: StudentRecordNativeService;
};

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

  // GET /native/students/:id/record — unified student record read
  app.get("/native/students/:id/record", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.getRecord(contextFrom(request), id);
    return { data, request_id: newRequestId() };
  });

  // GET /native/students/:id/completeness — 12-checkpoint completeness calculation
  app.get("/native/students/:id/completeness", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.getCompleteness(contextFrom(request), id);
    return { data, request_id: newRequestId() };
  });

  // PUT /native/students/:id/emergency-contacts/:slot — upsert emergency contact slot 1 or 2
  app.put("/native/students/:id/emergency-contacts/:slot", { preHandler: requireSession }, async (request) => {
    const { id, slot } = request.params as { id: string; slot: string };
    const slotNo = parseInt(slot, 10);
    if (slotNo !== 1 && slotNo !== 2) {
      return { data: { error_codes: ["INVALID_SLOT"] }, request_id: newRequestId() };
    }
    const body = z.object({
      full_name: z.string().min(1).max(200),
      relation: z.string().min(1).max(100),
      phone: z.string().min(1).max(50),
      alternate_phone: z.string().max(50).optional(),
      notes: z.string().max(1000).optional(),
      guardian_id: z.string().uuid().optional(),
    }).parse(request.body);
    const data = await dependencies.service.updateEmergencyContact(contextFrom(request), id, slotNo, body);
    return { data, request_id: newRequestId() };
  });

  // GET /native/students/:id/health — health profile read
  app.get("/native/students/:id/health", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const data = await dependencies.service.getRecord(contextFrom(request), id);
    // Extract health portion from unified record; for now return full record
    // Future: dedicated api.student_health_read RPC
    return { data, request_id: newRequestId() };
  });

  // PUT /native/students/:id/health — upsert health profile
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
    }).parse(request.body);
    const data = await dependencies.service.upsertHealthProfile(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  // POST /native/students/:id/allergies — add new allergy (status=reported)
  app.post("/native/students/:id/allergies", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      category: z.enum(["food", "medication", "environmental", "other"]),
      allergen: z.string().min(1).max(200),
      severity: z.enum(["mild", "moderate", "severe", "unknown"]).optional(),
      reaction: z.string().max(500).optional(),
      emergency_instruction: z.string().max(1000).optional(),
    }).parse(request.body);
    const data = await dependencies.service.addAllergy(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  // POST /native/students/:id/dietary/restrictions — add new restriction (status=reported)
  app.post("/native/students/:id/dietary/restrictions", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      kind: z.enum(["intolerance", "prohibited_food", "restriction", "diet"]),
      label: z.string().min(1).max(200),
      notes: z.string().max(1000).optional(),
    }).parse(request.body);
    const data = await dependencies.service.addDietaryRestriction(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  // PUT /native/students/:id/confirmations/:key — set confirmation (family/medical/dietary/pickup)
  app.put("/native/students/:id/confirmations/:key", { preHandler: requireSession }, async (request) => {
    const { id, key } = request.params as { id: string; key: string };
    if (!["family", "medical", "dietary", "pickup"].includes(key)) {
      return { data: { error_codes: ["INVALID_CONFIRMATION_KEY"] }, request_id: newRequestId() };
    }
    const body = z.object({
      confirmed: z.boolean(),
    }).parse(request.body);
    const data = await dependencies.service.setConfirmation(contextFrom(request), id, key, body.confirmed);
    return { data, request_id: newRequestId() };
  });

  // PUT /native/students/:id/consents/:key — set consent decision (photo_video/emergency_care)
  app.put("/native/students/:id/consents/:key", { preHandler: requireSession }, async (request) => {
    const { id, key } = request.params as { id: string; key: string };
    if (!["photo_video", "emergency_care"].includes(key)) {
      return { data: { error_codes: ["INVALID_CONSENT_KEY"] }, request_id: newRequestId() };
    }
    const body = z.object({
      decision: z.boolean(),
    }).parse(request.body);
    const data = await dependencies.service.setConsent(contextFrom(request), id, key, body.decision);
    return { data, request_id: newRequestId() };
  });

  // GET /native/canteen/students/:studentId/dietary — canteen-safe dietary projection
  app.get("/native/canteen/students/:studentId/dietary", { preHandler: requireSession }, async (request) => {
    const { studentId } = request.params as { studentId: string };
    const data = await dependencies.service.getCanteenDietary(contextFrom(request), studentId);
    return { data, request_id: newRequestId() };
  });

  // POST /native/students/:id/medications — add new medication (status=active)
  app.post("/native/students/:id/medications", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      name: z.string().min(1).max(200),
      dosage_text: z.string().max(500).optional(),
      schedule_text: z.string().max(500).optional(),
      instructions: z.string().max(1000).optional(),
      school_administration_required: z.boolean().optional(),
    }).parse(request.body);
    const data = await dependencies.service.addMedication(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  // POST /native/students/:id/dietary/preferences — add food preference (liked/disliked)
  app.post("/native/students/:id/dietary/preferences", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      preference_type: z.enum(["liked", "disliked"]),
      item: z.string().min(1).max(200),
      notes: z.string().max(1000).optional(),
    }).parse(request.body);
    const data = await dependencies.service.addFoodPreference(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  // PUT /native/students/:id/dietary — upsert dietary profile
  app.put("/native/students/:id/dietary", { preHandler: requireSession }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      dietary_declaration_completed: z.boolean().optional(),
      parent_food_note: z.string().max(1000).optional(),
    }).parse(request.body);
    const data = await dependencies.service.upsertDietaryProfile(contextFrom(request), id, body);
    return { data, request_id: newRequestId() };
  });

  // GET /native/parent/children — parent multi-children list
  app.get("/native/parent/children", { preHandler: requireSession }, async (request) => {
    const data = await dependencies.service.getParentChildren(contextFrom(request));
    return { data, request_id: newRequestId() };
  });
}