import type { AuthPool } from "../db/pool.js";
import { hashPassword } from "../authnative/passwords.js";
import {
  registrationPayloadSchema,
  type RegistrationPayload,
  type RegistrationPrepareResult,
} from "./registration-schema.js";

export interface RegistrationService {
  prepareRegistration(input: RegistrationPayload): Promise<RegistrationPrepareResult>;
}

export function createRegistrationService(authPool: AuthPool): RegistrationService {
  return {
    async prepareRegistration(input) {
      const parsed = registrationPayloadSchema.parse(input);
      const { password, ...adminWithoutPassword } = parsed.admin;
      const passwordHash = await hashPassword(password);
      const payloadForSql = {
        identity: parsed.identity,
        cycles: parsed.cycles,
        academic_year: parsed.academic_year,
        contact: parsed.contact,
        brand: parsed.brand,
        admin: adminWithoutPassword,
      };
      const result = await authPool.query<{ result: RegistrationPrepareResult }>(
        "select api.school_registration_prepare($1::jsonb,$2) result",
        [JSON.stringify(payloadForSql), passwordHash],
      );
      const row = result.rows[0]?.result;
      if (!row?.request_id || row.status !== "pending") {
        throw new Error("Registration preparation failed");
      }
      return row;
    },
  };
}