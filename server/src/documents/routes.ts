// SchoolSafe Document Engine — HTTP Routes.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createDocument, issueDocument } from "./engine.js";
import type { BusinessPool } from "../db/pool.js";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import { readSessionCookie } from "../authnative/cookie.js";
const createDocSchema = z.object({
schoolId: z.string().uuid(),
academicYearId: z.string().uuid(),
typeCode: z.string().min(2).max(10),
metadata: z.record(z.any()).optional().default({}),
});
export type DocumentRouteDependencies = {
pool: BusinessPool;
};
export function registerDocumentRoutes(app: FastifyInstance, deps: DocumentRouteDependencies): void {
const { pool } = deps;
app.post("/documents/create", async (request, reply) => {
const token = readSessionCookie(request);
if (!token) {
throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
}
const body = createDocSchema.parse(request.body);
// TODO: Resolve real user ID from session token in LOT 5 backend refactor.
const createdBy = "00000000-0000-0000-0000-000000000000";
try {
const doc = await createDocument(pool, {
...body,
createdBy,
});
return reply.code(201).send({
document_id: doc.id,
code: doc.code,
sequence: doc.sequence,
status: doc.status,
request_id: newRequestId(),
});
} catch (e) {
throw new SchoolSafeError(500, "INTERNAL_ERROR", (e as Error).message, true);
}
});
app.post("/documents/:id/issue", async (request, reply) => {
const token = readSessionCookie(request);
if (!token) {
throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
}
const { id } = request.params as { id: string };
try {
await issueDocument(pool, id);
return reply.code(200).send({ status: "ISSUED", request_id: newRequestId() });
} catch (e) {
throw new SchoolSafeError(400, "VALIDATION_INVALID", (e as Error).message, false);
}
});
}