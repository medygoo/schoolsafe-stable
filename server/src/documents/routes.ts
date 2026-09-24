// SchoolSafe Document Engine — HTTP Routes.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createDocument, issueDocument } from "./engine.js";
import type { BusinessPool } from "../db/pool.js";
import type { AuthNativeService } from "../authnative/service.js";
import { requireAuthSession } from "../authnative/middleware.js";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
const VALID_DOC_TYPES = ['DEV', 'PREP', 'CDT', 'EVAL', 'BUL', 'PAL', 'REC', 'FAC', 'LET', 'CONV', 'ATT', 'RAP'] as const;
const createDocSchema = z.object({
academicYearId: z.string().uuid(),
typeCode: z.enum(VALID_DOC_TYPES),
metadata: z.record(z.any()).optional().default({}),
});
export type DocumentRouteDependencies = {
pool: BusinessPool;
authService: AuthNativeService;
};
export function registerDocumentRoutes(app: FastifyInstance, deps: DocumentRouteDependencies): void {
const { pool, authService } = deps;
const requireSession = requireAuthSession(authService);
app.post("/documents/create", { preHandler: [requireSession] }, async (request, reply) => {
// 1. Resolve real session context via middleware
const session = request.authSession;
if (!session) throw new SchoolSafeError(500, "INTERNAL_ERROR", "Session missing after preHandler", false);
const { schoolId, userId } = session;
const body = createDocSchema.parse(request.body);
// 2. Validate Academic Year belongs to this school
const yearRes = await pool.query(
"SELECT id FROM app.academic_years WHERE id = $1 AND school_id = $2",
[body.academicYearId, schoolId]
);
if (yearRes.rows.length === 0) {
throw new SchoolSafeError(403, "PERMISSION_DENIED", "Année académique invalide ou hors périmètre", false);
}
try {
// 3. Create document using session identity (no schoolId from client)
const doc = await createDocument(pool, {
schoolId,
academicYearId: body.academicYearId,
typeCode: body.typeCode,
metadata: body.metadata,
createdBy: userId,
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
app.post("/documents/:id/issue", { preHandler: [requireSession] }, async (request, reply) => {
// 1. Resolve real session context via middleware
const session = request.authSession;
if (!session) throw new SchoolSafeError(500, "INTERNAL_ERROR", "Session missing after preHandler", false);
const { schoolId } = session;
const { id } = request.params as { id: string };
// 2. Verify document belongs to this school before issuing
const docRes = await pool.query("SELECT school_id FROM app.documents WHERE id = $1", [id]);
if (docRes.rows.length === 0 || docRes.rows[0].school_id !== schoolId) {
throw new SchoolSafeError(403, "PERMISSION_DENIED", "Document introuvable ou hors périmètre", false);
}
try {
await issueDocument(pool, id);
return reply.code(200).send({ status: "ISSUED", request_id: newRequestId() });
} catch (e) {
throw new SchoolSafeError(400, "VALIDATION_INVALID", (e as Error).message, false);
}
});
}