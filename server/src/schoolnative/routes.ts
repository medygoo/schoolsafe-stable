// SchoolSafe — Native School Settings Routes (PostgreSQL)
// Replaces Supabase-based /school/settings for "Mon école" screen.
// Session context is resolved server-side; school_id never comes from browser.
import type { FastifyInstance } from "fastify";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { SchoolNativeService, UpdateSchoolSettingsPayload } from "./service.js";
import type { RequestContext } from "../db/context.js";
import { z } from "zod";

export type SchoolNativeRouteDependencies = {
  authService: AuthNativeService;
  service: SchoolNativeService;
};

export function registerSchoolNativeRoutes(
  app: FastifyInstance,
  dependencies: SchoolNativeRouteDependencies,
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

  // GET /native/school/settings — read school identity, brand and contact
  app.get("/native/school/settings", { preHandler: requireSession }, async (request) => {
    const data = await dependencies.service.getSettings(contextFrom(request));
    return { data, request_id: newRequestId() };
  });

  // PUT /native/school/settings — update school identity, brand and/or contact
  app.put("/native/school/settings", { preHandler: requireSession }, async (request) => {
    const body = z.object({
      identity: z.object({
        name: z.string().min(1).max(200).optional().nullable(),
        name_en: z.string().max(200).optional().nullable(),
        legal_name: z.string().max(200).optional().nullable(),
        school_type: z.string().max(100).optional().nullable(),
        approval_code: z.string().max(50).optional().nullable(),
      }).optional(),
      brand: z.object({
        primary_color: z.string().max(20).optional().nullable(),
        accent_color: z.string().max(20).optional().nullable(),
        document_footer: z.string().max(500).optional().nullable(),
        logo_path: z.string().max(500).optional().nullable(),
      }).optional(),
      contact: z.object({
        country: z.string().max(100).optional().nullable(),
        province: z.string().max(100).optional().nullable(),
        city: z.string().max(100).optional().nullable(),
        address: z.string().max(500).optional().nullable(),
        email: z.string().email().max(200).optional().nullable(),
        phone: z.string().max(50).optional().nullable(),
        website_url: z.string().url().max(500).optional().nullable(),
        website_mode: z.string().max(50).optional().nullable(),
        public_news: z.boolean().optional().nullable(),
        public_gallery: z.boolean().optional().nullable(),
        public_honors: z.boolean().optional().nullable(),
      }).optional(),
    }).parse(request.body) as UpdateSchoolSettingsPayload;

    const data = await dependencies.service.updateSettings(contextFrom(request), body);
    return { data, request_id: newRequestId() };
  });
}