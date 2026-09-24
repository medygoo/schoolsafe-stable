// SchoolSafe Dashboard — Unified Routes for Role-Based Aggregations.
import type { FastifyInstance } from "fastify";
import type { BusinessPool } from "../db/pool.js";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import { readSessionCookie } from "../authnative/cookie.js";
export type DashboardRouteDependencies = {
pool: BusinessPool;
};
export function registerDashboardRoutes(app: FastifyInstance, deps: DashboardRouteDependencies): void {
const { pool } = deps;
app.get("/dashboard/stats", async (request, reply) => {
const token = readSessionCookie(request);
if (!token) {
throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
}
// TODO: Resolve real user/school from session token in LOT 5 backend refactor.
// For now, we use a placeholder to allow compilation and basic testing.
const schoolId = "00000000-0000-0000-0000-000000000000";
const profileId = "00000000-0000-0000-0000-000000000000";
const role = "admin_principal";
// Admin Principal Stats
if (role === "admin_principal" || role === "admin") {
const studentsRes = await pool.query("SELECT count(*) as total FROM students WHERE school_id = $1", [schoolId]);
const staffRes = await pool.query("SELECT count(*) as total FROM staff WHERE school_id = $1", [schoolId]);
const classesRes = await pool.query("SELECT count(*) as total FROM classes WHERE school_id = $1", [schoolId]);
return reply.code(200).send({
role: "admin",
stats: {
students: Number(studentsRes.rows[0].total),
staff: Number(staffRes.rows[0].total),
classes: Number(classesRes.rows[0].total),
},
request_id: newRequestId(),
});
}
// Teacher Stats
if (role === "teacher") {
const assignedClassesRes = await pool.query(
`SELECT c.id, c.name
FROM teacher_assignments ta
JOIN classes c ON c.id = ta.class_id
WHERE ta.teacher_id = (SELECT user_id FROM profiles WHERE id = $1)`,
[profileId]
);
return reply.code(200).send({
role: "teacher",
stats: {
assigned_classes: assignedClassesRes.rows.length,
class_ids: assignedClassesRes.rows.map((c: any) => c.id),
},
request_id: newRequestId(),
});
}
// Parent Stats
if (role === "parent") {
const childrenRes = await pool.query(
`SELECT s.id, s.first_name, s.last_name, c.name as class_name
FROM students s
JOIN guardians g ON g.student_id = s.id
JOIN classes c ON c.id = s.class_id
WHERE g.user_id = (SELECT user_id FROM profiles WHERE id = $1)`,
[profileId]
);
return reply.code(200).send({
role: "parent",
stats: {
children_count: childrenRes.rows.length,
children: childrenRes.rows,
},
request_id: newRequestId(),
});
}
throw new SchoolSafeError(403, "PERMISSION_DENIED", "Rôle non supporté pour ce dashboard", false);
});
}