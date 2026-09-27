import type { FastifyInstance } from "fastify";
import { SchoolSafeError } from "../http/errors.js";
import type { AuthDatabase } from "../authnative/service.js";

export interface ProdeliRegistrationsDependencies {
  db: AuthDatabase;
}

const VALID_STATUSES = new Set(["pending", "approved", "rejected", "completed"]);

export function registerProdeliRegistrationsRoutes(
  app: FastifyInstance,
  deps: ProdeliRegistrationsDependencies,
): void {
  app.get("/prodeli/v1/registrations", async (request, reply) => {
    const query = request.query as { status?: string; limit?: string };
    const status = query.status;
    if (status !== undefined && !VALID_STATUSES.has(status)) {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Statut invalide", false);
    }

    const limitRaw = query.limit;
    const limit = limitRaw ? parseInt(limitRaw, 10) : 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Limit doit être entre 1 et 100", false);
    }

    const result = await deps.db.query<{
      request_id: string;
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      status: string;
      created_at: string;
      approved_at: string | null;
      rejected_at: string | null;
      completed_at: string | null;
    }>(
      `select request_id, first_name, last_name, email, phone, status,
              created_at, approved_at, rejected_at, completed_at
       from api.prodeli_list_registrations($1::text, $2::int)`,
      [status ?? null, limit],
    );

    return reply.send({ data: result.rows, count: result.rows.length });
  });
}