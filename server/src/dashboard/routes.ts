// SchoolSafe Dashboard — Unified Routes for Role-Based Aggregations.
// Uses native auth session to resolve school/profile/user context.
import type { FastifyInstance } from "fastify";
import type { BusinessPool } from "../db/pool.js";
import type { AuthNativeService } from "../authnative/service.js";
import { requireAuthSession } from "../authnative/middleware.js";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";

export type DashboardRouteDependencies = {
  pool: BusinessPool;
  authService: AuthNativeService;
};

export function registerDashboardRoutes(app: FastifyInstance, deps: DashboardRouteDependencies): void {
  const { pool, authService } = deps;
  const requireSession = requireAuthSession(authService);

  app.get("/dashboard/stats", { preHandler: [requireSession] }, async (request, reply) => {
    // Resolve real session context (userId, profileId, schoolId) from cookie via middleware
    const session = request.authSession;
    if (!session) throw new SchoolSafeError(500, "INTERNAL_ERROR", "Session missing after preHandler", false);
    
    const { schoolId, profileId, userId } = session;

    // Admin Principal Stats (or any role with global school view)
    // In a full implementation, we would check specific permissions here via ACCESS_LAW.
    const studentsRes = await pool.query("SELECT count(*) as total FROM app.students WHERE school_id = $1", [schoolId]);
    const classesRes = await pool.query("SELECT count(*) as total FROM app.classes WHERE school_id = $1", [schoolId]);
    
    // Gender distribution if available in schema
    const boysRes = await pool.query("SELECT count(*) as total FROM app.students WHERE school_id = $1 AND gender = 'M'", [schoolId]);
    const girlsRes = await pool.query("SELECT count(*) as total FROM app.students WHERE school_id = $1 AND gender = 'F'", [schoolId]);

    // Staff count (using canonical table if it exists, otherwise 0 or 'Non disponible')
    let staffTotal = 0;
    try {
      const staffRes = await pool.query("SELECT count(*) as total FROM app.staff WHERE school_id = $1", [schoolId]);
      staffTotal = Number(staffRes.rows[0].total);
    } catch (e) {
      // Table might not exist or be named differently
      staffTotal = 0;
    }

    return reply.code(200).send({
      role: "admin_principal", // Placeholder until ACCESS_LAW role resolution is integrated
      stats: {
        students: Number(studentsRes.rows[0].total),
        boys: Number(boysRes.rows[0].total),
        girls: Number(girlsRes.rows[0].total),
        staff: staffTotal,
        classes: Number(classesRes.rows[0].total),
      },
      request_id: newRequestId(),
    });
  });
}