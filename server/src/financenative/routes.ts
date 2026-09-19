// SchoolSafe Finance v1 — routes HTTP natives complètes.
// Le contexte de requête est construit UNIQUEMENT depuis la session résolue
// côté serveur (jamais depuis le navigateur) et passé en premier argument.
import type { FastifyInstance } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { FinanceNativeService } from "./service.js";
import type { RequestContext } from "../db/context.js";
import { z } from "zod";

export type FinanceNativeRouteDependencies = {
  authService: AuthNativeService;
  service: FinanceNativeService;
};

export function registerFinanceNativeRoutes(
  app: FastifyInstance,
  dependencies: FinanceNativeRouteDependencies,
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

  // --- Structures de frais ---
  app.get("/native/finance/fee-structures", { preHandler: requireSession }, async (request) => {
    const data = await dependencies.service.listFeeStructures(contextFrom(request));
    return { data, request_id: newRequestId() };
  });

  app.post("/native/finance/fee-structures", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      academic_year_id: z.string().uuid(),
      cycle_key: z.string().optional(),
      label: z.string().min(1),
      amount: z.number().positive(),
      currency: z.string().default("USD"),
      due_date: z.string().optional(),
    }).parse(request.body);
    const id = await dependencies.service.createFeeStructure(contextFrom(request), body);
    return { data: { id }, request_id: newRequestId() };
  });

  // --- Frais d'un élève ---
  app.get("/native/finance/students/:studentId/fees", { preHandler: requireSession }, async (request) => {
    const { studentId } = request.params as { studentId: string };
    const data = await dependencies.service.listStudentFees(contextFrom(request), studentId);
    return { data, request_id: newRequestId() };
  });

  app.post("/native/finance/students/:studentId/fees", { preHandler: requireSession }, async (request) => {
    const { studentId } = request.params as { studentId: string };
    const body = z.object({
      fee_structure_id: z.string().uuid(),
      academic_year_id: z.string().uuid(),
    }).parse(request.body);
    const id = await dependencies.service.createStudentFee(contextFrom(request), studentId, body.fee_structure_id, body.academic_year_id);
    return { data: { id }, request_id: newRequestId() };
  });

  app.get("/native/finance/student-fees/:studentFeeId", { preHandler: requireSession }, async (request) => {
    const { studentFeeId } = request.params as { studentFeeId: string };
    const fee = await dependencies.service.getStudentFee(contextFrom(request), studentFeeId);
    if (!fee) throw new SchoolSafeError(404, "NOT_FOUND", "Frais introuvable", false);
    return { data: fee, request_id: newRequestId() };
  });

  // --- Paiements ---
  app.get("/native/finance/students/:studentId/payments", { preHandler: requireSession }, async (request) => {
    const { studentId } = request.params as { studentId: string };
    const data = await dependencies.service.listStudentPayments(contextFrom(request), studentId);
    return { data, request_id: newRequestId() };
  });

  app.post("/native/finance/payments", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      student_fee_id: z.string().uuid(),
      amount: z.number().positive(),
      currency: z.string().min(1).max(10).default("USD"),
      mode: z.string().default("cash"),
      reference: z.string().optional(),
    }).parse(request.body);
    const session = request.authSession!;
    const paymentId = await dependencies.service.createPayment(
      contextFrom(request),
      body.student_fee_id, body.amount, body.currency,
      session.profileId, body.mode, body.reference,
    );
    return { data: { id: paymentId }, request_id: newRequestId() };
  });

  app.post("/native/finance/payments/:paymentId/cancel", { preHandler: requireSession }, async (request) => {
    const { paymentId } = request.params as { paymentId: string };
    const { reason } = z.object({ reason: z.string().min(1) }).parse(request.body);
    const ok = await dependencies.service.cancelPayment(contextFrom(request), paymentId, reason);
    if (!ok) throw new SchoolSafeError(404, "NOT_FOUND", "Paiement introuvable", false);
    return { data: { cancelled: true }, request_id: newRequestId() };
  });

  // --- Reçu ---
  app.get("/native/finance/receipts/:paymentId", { preHandler: requireSession }, async (request) => {
    const { paymentId } = request.params as { paymentId: string };
    const receipt = await dependencies.service.getReceipt(contextFrom(request), paymentId);
    if (!receipt) throw new SchoolSafeError(404, "NOT_FOUND", "Reçu introuvable", false);
    return { data: receipt, request_id: newRequestId() };
  });

  // --- Caisse ---
  app.post("/native/finance/cash-register/open", { preHandler: requireSession }, async (request) => {
    const id = await dependencies.service.openCashRegister(contextFrom(request));
    return { data: { id }, request_id: newRequestId() };
  });

  app.post("/native/finance/cash-register/close", { preHandler: requireSession }, async (request) => {
    const body = z.object({ register_id: z.string().uuid() }).parse(request.body);
    const ok = await dependencies.service.closeCashRegister(contextFrom(request), body.register_id);
    return { data: { closed: ok }, request_id: newRequestId() };
  });

  // --- Rapport journalier ---
  app.get("/native/finance/reports/daily", { preHandler: requireSession }, async (request) => {
    const q = z.object({ date: z.string().min(1) }).parse(request.query ?? {});
    const report = await dependencies.service.getDailyReport(contextFrom(request), q.date);
    return { data: report, request_id: newRequestId() };
  });

  // --- Campagnes de contrôle ---
  app.get("/native/finance/fee-control/campaigns", { preHandler: requireSession }, async (request) => {
    const data = await dependencies.service.listCampaigns(contextFrom(request));
    return { data, request_id: newRequestId() };
  });

  app.post("/native/finance/fee-control/campaigns", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      fee_structure_id: z.string().uuid(),
      label: z.string().min(1),
      description: z.string().optional(),
      classes: z.array(z.any()).optional(),
      starts_at: z.string().optional(),
      ends_at: z.string().optional(),
    }).parse(request.body);
    const id = await dependencies.service.createCampaign(contextFrom(request), body);
    return { data: { id }, request_id: newRequestId() };
  });

  // --- Scans de contrôle ---
  app.post("/native/finance/fee-control/scans", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      campaign_id: z.string().uuid(),
      student_id: z.string().uuid(),
      result: z.string(),
      notes: z.string().optional(),
      student_fee_status: z.string().optional(),
    }).parse(request.body);
    const id = await dependencies.service.createScan(contextFrom(request), {
      campaign_id: body.campaign_id,
      student_id: body.student_id,
      result: body.result,
      notes: body.notes,
      student_fee_status: body.student_fee_status,
    });
    return { data: { id }, request_id: newRequestId() };
  });
}
