// SchoolSafe — Native School Settings Routes (PostgreSQL)
// Replaces Supabase-based /school/settings for "Mon école" screen.
// Session context is resolved server-side; school_id never comes from browser.
import type { FastifyInstance } from "fastify";
import { newRequestId } from "../http/request-id.js";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import type { SchoolNativeService } from "./service.js";
import type { RequestContext } from "../db/context.js";
import { updateSchoolSettingsSchema, type UpdateSchoolSettingsPayload } from "./schema.js";

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
    const body = updateSchoolSettingsSchema.parse(request.body);
    const data = await dependencies.service.updateSettings(contextFrom(request), body);
    return { data, request_id: newRequestId() };
  });
}