import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuthSession } from "../authnative/middleware.js";
import type { AuthNativeService } from "../authnative/service.js";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import type { AccessNativeService } from "./service.js";

const pageSchema = z.object({
  query: z.string().trim().max(100).default(""),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
}).strict();
const profileSchema = z.object({ profileId: z.string().uuid() }).strict();
const confirmationFields = {
  revision: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
  reason: z.string().trim().min(5).max(500), confirmed: z.literal(true),
};
const roleChangeSchema = z.object({
  roleId: z.string().uuid(), action: z.enum(["assign", "revoke"]),
  ...confirmationFields,
}).strict();
const roleLabel = z.string().trim().min(2).max(100).regex(/^[^\u0000-\u001f\u007f]+$/);
const createRoleSchema = z.object({ label: roleLabel, templateId: z.string().uuid().nullable(), ...confirmationFields }).strict();
const saveRoleSchema = z.object({ label: roleLabel, isActive: z.boolean(),
  grants: z.array(z.object({ permission: z.string().min(1).max(100), effect: z.enum(["allow", "deny"]),
    scope: z.enum(["school", "own", "own_children", "none"]).optional() }).strict()).max(64), ...confirmationFields,
}).strict();
function requireWriteIntent(request: FastifyRequest) {
  if (request.headers["x-schoolsafe-action"] !== "access-write" || request.headers["sec-fetch-site"] === "cross-site") {
    throw new SchoolSafeError(403, "PERMISSION_DENIED", "Requête de modification refusée", false);
  }
}
export type AccessNativeRouteDependencies = { authService: AuthNativeService; service: AccessNativeService };

export function registerAccessNativeRoutes(app: FastifyInstance, deps: AccessNativeRouteDependencies): void {
  const requireSession = requireAuthSession(deps.authService);
  function context(request: FastifyRequest) {
    const session = request.authSession!;
    return { userId: session.userId, profileId: session.profileId, schoolId: session.schoolId, requestId: newRequestId() };
  }
  app.get("/native/access/role-editor", { preHandler: requireSession }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const { roleId } = z.object({ roleId: z.string().uuid().optional() }).strict().parse(request.query);
    const actor = context(request);
    const data = await deps.service.roleEditor(actor, roleId || null);
    if (!data) throw new SchoolSafeError(404, "NOT_FOUND", "Rôle introuvable", false);
    return { data, request_id: actor.requestId };
  });
  app.post("/native/access/roles", { preHandler: requireSession }, async (request, reply) => {
    reply.header("Cache-Control", "no-store"); requireWriteIntent(request);
    z.object({}).strict().parse(request.query);
    const input = createRoleSchema.parse(request.body), actor = context(request);
    return { data: await deps.service.createRole(actor, input), request_id: actor.requestId };
  });
  app.post("/native/access/roles/:roleId", { preHandler: requireSession }, async (request, reply) => {
    reply.header("Cache-Control", "no-store"); requireWriteIntent(request);
    z.object({}).strict().parse(request.query);
    const { roleId } = z.object({ roleId: z.string().uuid() }).strict().parse(request.params);
    const input = saveRoleSchema.parse(request.body), actor = context(request);
    return { data: await deps.service.saveRole(actor, roleId, input), request_id: actor.requestId };
  });
  app.get("/native/access/profiles", { preHandler: requireSession }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const input = pageSchema.parse(request.query);
    const actor = context(request);
    return { data: await deps.service.listProfiles(actor, input), request_id: actor.requestId };
  });
  app.get("/native/access/roles", { preHandler: requireSession }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const input = pageSchema.parse(request.query);
    const actor = context(request);
    return { data: await deps.service.listRoles(actor, input), request_id: actor.requestId };
  });
  app.get("/native/access/profiles/:profileId", { preHandler: requireSession }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const { profileId } = profileSchema.parse(request.params);
    z.object({}).strict().parse(request.query);
    const actor = context(request);
    const data = await deps.service.readProfile(actor, profileId);
    if (!data) throw new SchoolSafeError(404, "NOT_FOUND", "Profil introuvable", false);
    return { data, request_id: actor.requestId };
  });
  app.get("/native/access/roles/:roleId", { preHandler: requireSession }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const { roleId } = z.object({ roleId: z.string().uuid() }).strict().parse(request.params);
    z.object({}).strict().parse(request.query);
    const actor = context(request);
    const data = await deps.service.readRole(actor, roleId);
    if (!data) throw new SchoolSafeError(404, "NOT_FOUND", "Rôle introuvable", false);
    return { data, request_id: actor.requestId };
  });
  app.post("/native/access/profiles/:profileId/roles", { preHandler: requireSession }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    // Cannot be submitted by a cross-origin HTML form; browser fetch requires
    // the existing explicit-origin CORS preflight for this custom header.
    requireWriteIntent(request);
    const { profileId } = profileSchema.parse(request.params);
    z.object({}).strict().parse(request.query);
    const input = roleChangeSchema.parse(request.body);
    const actor = context(request);
    return { data: await deps.service.changeRole(actor, profileId, input), request_id: actor.requestId };
  });
}
