import { randomBytes } from "node:crypto";
import type { BusinessPool } from "../db/pool.js";
import { withAuthorizedContext } from "../db/access.js";
import type { RequestContext } from "../db/context.js";
import { SchoolSafeError } from "../http/errors.js";
import { IdentityConflict, type ExternalIdentityAdmin } from "./supabase-admin.js";

export type AdultProvisionInput = { email: string; phone: string; role_code: "teacher" };
export type AdultProvisionResult = {
  user_id: string;
  profile_id: string;
  school_id: string;
  role_code: "teacher";
  temporary_password: string;
};

type ProvisionRow = Omit<AdultProvisionResult, "temporary_password">;

function mapDatabaseError(error: unknown): never {
  if (error instanceof SchoolSafeError) throw error;
  const code = (error as { code?: string }).code;
  const message = (error as { message?: string }).message ?? "";
  if (code === "23505" || message.includes("IDENTITY_CONFLICT")) {
    throw new SchoolSafeError(409, "VERSION_CONFLICT", "Cette identité existe déjà", false);
  }
  if (code === "42501") {
    throw new SchoolSafeError(403, "PERMISSION_DENIED", "Permission refusée", false);
  }
  if (code === "23514" || message.includes("ROLE_REFUSED") || message.includes("IDENTITY_INVALID") || message.includes("TEACHER_ROLE_MISSING")) {
    throw new SchoolSafeError(400, "VALIDATION_INVALID", "Création refusée", false);
  }
  throw error;
}

export function createAdultProvisioner(pool: BusinessPool, admin: ExternalIdentityAdmin | null) {
  return {
    async provisionTeacher(
      context: RequestContext,
      input: AdultProvisionInput,
      logger: (message: string) => void = () => {},
    ): Promise<AdultProvisionResult> {
      try {
        await withAuthorizedContext(pool, context, "staff.manage", {}, async (client) => {
          await client.query("select api.provision_school_adult_prepare($1, $2, $3)", [input.email, input.phone, input.role_code]);
        });
      } catch (error) {
        mapDatabaseError(error);
      }
      if (!admin) {
        throw new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Identité externe indisponible", true);
      }
      const temporaryPassword = randomBytes(24).toString("base64url");
      let subject: string;
      try {
        subject = (await admin.createUser({ email: input.email, phone: input.phone, password: temporaryPassword })).id;
      } catch (error) {
        if (error instanceof IdentityConflict || (error instanceof Error && error.name === "IdentityConflict")) {
          throw new SchoolSafeError(409, "VERSION_CONFLICT", "Cette identité existe déjà", false);
        }
        throw new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Identité externe indisponible", true);
      }
      try {
        return await withAuthorizedContext(pool, context, "staff.manage", {}, async (client) => {
          const result = await client.query<{ data: ProvisionRow }>(
            "select api.provision_school_adult($1, $2, $3, $4) as data",
            [subject, input.email, input.phone, input.role_code],
          );
          const data = result.rows[0]?.data;
          if (!data || data.school_id !== context.schoolId || data.role_code !== "teacher") {
            throw new SchoolSafeError(403, "PERMISSION_DENIED", "École refusée", false);
          }
          return { ...data, temporary_password: temporaryPassword };
        });
      } catch (error) {
        const removed = await admin.deleteUser(subject).catch(() => false);
        if (!removed) {
          logger("ORPHAN_COMPENSATION=FAILED");
          throw new SchoolSafeError(503, "ORPHAN_COMPENSATION_FAILED", "Compensation de l’identité impossible", false);
        }
        mapDatabaseError(error);
      }
    },
  };
}

export type AdultProvisioner = ReturnType<typeof createAdultProvisioner>;
