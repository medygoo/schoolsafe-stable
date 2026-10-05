import { randomBytes } from "node:crypto";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext } from "../db/context.js";
import type { RequestContext } from "../db/context.js";
import { SchoolSafeError } from "../http/errors.js";
import { IdentityConflict, type ExternalIdentityAdmin } from "./supabase-admin.js";

export const PERSON_ROLE_CODES = [
  "teacher", "school_head", "pedagogy", "cashier", "guard", "parent", "fee_control", "hr", "staff",
] as const;
export type PersonRoleCode = (typeof PERSON_ROLE_CODES)[number];

export type PersonProvisionInput = {
  first_name: string;
  last_name: string;
  middle_name?: string;
  email: string;
  phone: string;
  photo_path?: string;
  role_codes: PersonRoleCode[];
  employee_number?: string;
  job_title?: string;
  hired_on?: string;
};

export type PersonProvisionResult = {
  user_id: string;
  profile_id: string;
  school_id: string;
  role_codes: PersonRoleCode[];
  reused: boolean;
  linked: boolean;
  temporary_password: string | null;
};

type WriteRow = {
  user_id: string;
  profile_id: string;
  school_id?: string;
  reused?: boolean;
  linked?: boolean;
};

export type SubjectVerifier = (token: string) => Promise<{ id: string; email: string } | null>;

function permissionsFor(roleCodes: readonly string[]): string[] {
  const permissions: string[] = [];
  if (roleCodes.some((code) => code !== "parent")) permissions.push("staff.manage");
  if (roleCodes.includes("parent")) permissions.push("school.guardian.manage");
  return permissions;
}

function payloadOf(input: PersonProvisionInput): Record<string, unknown> {
  return {
    first_name: input.first_name,
    last_name: input.last_name,
    middle_name: input.middle_name ?? null,
    email: input.email,
    phone: input.phone,
    photo_path: input.photo_path ?? null,
    role_codes: input.role_codes,
    employee_number: input.employee_number ?? null,
    job_title: input.job_title ?? null,
    hired_on: input.hired_on ?? null,
  };
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof SchoolSafeError) throw error;
  const code = (error as { code?: string }).code;
  const message = (error as { message?: string }).message ?? "";
  if (message.includes("LINK_REQUIRED")) {
    throw new SchoolSafeError(409, "LINK_REQUIRED", "Cette personne existe dans une autre école", false);
  }
  if (code === "23505" || message.includes("IDENTITY_CONFLICT")) {
    throw new SchoolSafeError(409, "VERSION_CONFLICT", "Cette identité existe déjà", false);
  }
  if (code === "42501") {
    throw new SchoolSafeError(403, "PERMISSION_DENIED", "Permission refusée", false);
  }
  if (
    code === "23514"
    || message.includes("ROLE_REFUSED")
    || message.includes("IDENTITY_INVALID")
    || message.includes("STAFF_FIELDS_REQUIRED")
    || message.includes("LINK_SUBJECT_UNKNOWN")
  ) {
    throw new SchoolSafeError(400, "VALIDATION_INVALID", "Création refusée", false);
  }
  throw error;
}

async function assertPermissions(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: { allowed?: boolean }[] }> },
  roleCodes: readonly string[],
): Promise<void> {
  for (const permission of permissionsFor(roleCodes)) {
    const allowed = await client.query(
      "select api.check_access($1, $2, $3, $4, $5, $6, $7) as allowed",
      [permission, null, null, null, null, null, "{}"],
    );
    if (allowed.rows[0]?.allowed !== true) {
      throw new SchoolSafeError(403, "PERMISSION_DENIED", "Permission refusée", false);
    }
  }
}

export function createAdultProvisioner(
  pool: BusinessPool,
  admin: ExternalIdentityAdmin | null,
  verifySubject: SubjectVerifier | null = null,
) {
  return {
    async provisionPerson(
      context: RequestContext,
      input: PersonProvisionInput,
      logger: (message: string) => void = () => {},
    ): Promise<PersonProvisionResult> {
      const payload = payloadOf(input);
      let prepared: { status?: string } | undefined;
      try {
        prepared = await withRequestContext(pool, context, async (client) => {
          await assertPermissions(client, input.role_codes);
          const result = await client.query<{ data: { status?: string } }>(
            "select api.provision_school_person_prepare($1::jsonb) as data",
            [JSON.stringify(payload)],
          );
          return result.rows[0]?.data;
        });
      } catch (error) {
        mapDatabaseError(error);
      }
      if (prepared?.status === "reuse") {
        try {
          return await withRequestContext(pool, context, async (client) => {
            await assertPermissions(client, input.role_codes);
            const result = await client.query<{ data: WriteRow }>(
              "select api.provision_school_person($1::uuid, $2::jsonb) as data",
              [null, JSON.stringify(payload)],
            );
            const data = result.rows[0]?.data;
            if (!data || data.school_id !== context.schoolId) {
              throw new SchoolSafeError(403, "PERMISSION_DENIED", "École refusée", false);
            }
            return {
              user_id: data.user_id,
              profile_id: data.profile_id,
              school_id: data.school_id,
              role_codes: input.role_codes,
              reused: true,
              linked: false,
              temporary_password: null,
            };
          });
        } catch (error) {
          mapDatabaseError(error);
        }
      }
      if (prepared?.status !== "create") {
        throw new SchoolSafeError(400, "VALIDATION_INVALID", "Création refusée", false);
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
        return await withRequestContext(pool, context, async (client) => {
          await assertPermissions(client, input.role_codes);
          const result = await client.query<{ data: WriteRow }>(
            "select api.provision_school_person($1::uuid, $2::jsonb) as data",
            [subject, JSON.stringify(payload)],
          );
          const data = result.rows[0]?.data;
          if (!data || data.school_id !== context.schoolId) {
            throw new SchoolSafeError(403, "PERMISSION_DENIED", "École refusée", false);
          }
          return {
            user_id: data.user_id,
            profile_id: data.profile_id,
            school_id: data.school_id,
            role_codes: input.role_codes,
            reused: false,
            linked: false,
            temporary_password: temporaryPassword,
          };
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
    async linkPerson(
      context: RequestContext,
      input: PersonProvisionInput,
      confirmationToken: string,
    ): Promise<PersonProvisionResult> {
      if (!verifySubject) {
        throw new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Identité externe indisponible", true);
      }
      const verified = await verifySubject(confirmationToken);
      if (!verified || verified.email !== input.email) {
        throw new SchoolSafeError(403, "PERMISSION_DENIED", "Confirmation refusée", false);
      }
      const payload = payloadOf(input);
      try {
        return await withRequestContext(pool, context, async (client) => {
          await assertPermissions(client, input.role_codes);
          const result = await client.query<{ data: WriteRow }>(
            "select api.provision_school_profile_link($1, $2::jsonb) as data",
            [verified.id, JSON.stringify(payload)],
          );
          const data = result.rows[0]?.data;
          if (!data) throw new SchoolSafeError(400, "VALIDATION_INVALID", "Lien refusé", false);
          return {
            user_id: data.user_id,
            profile_id: data.profile_id,
            school_id: context.schoolId,
            role_codes: input.role_codes,
            reused: false,
            linked: true,
            temporary_password: null,
          };
        });
      } catch (error) {
        mapDatabaseError(error);
      }
    },
  };
}

export type AdultProvisioner = ReturnType<typeof createAdultProvisioner>;
