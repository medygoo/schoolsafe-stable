import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthPool, BusinessPool } from "../db/pool.js";
import type { AdminSetupResult, ConfigResponse, SetupAdminPayload, SetupResult, SetupSchoolPayload } from "./schema.js";
import { hashPassword } from "../authnative/passwords.js";
const digest = (token: string) => createHash("sha256").update(token).digest();
export interface SetupService {
  getConfig(): ConfigResponse;
  validateToken(token: string): boolean;
  createSchool(payload: SetupSchoolPayload): Promise<SetupResult>;
  createAdmin(payload: SetupAdminPayload): Promise<AdminSetupResult>;
}
/** The migrator authorizes a one-use capability; auth RPCs bind its school in PostgreSQL. */
export function createSetupNativeService(authPool: AuthPool, _businessPool: BusinessPool, setupToken: string | undefined): SetupService {
  const allowed = (token: string) => Boolean(setupToken && timingSafeEqual(digest(token), digest(setupToken)));
  function tokenHash(token: string) {
    if (!allowed(token)) throw new Error("Setup authorization required");
    return digest(token).toString("hex");
  }
  return {
    getConfig: () => ({setup_available: Boolean(setupToken), auth_mode: "native"}),
    validateToken: allowed,
    async createSchool({token, ...payload}) {
      const result = await authPool.query<{result: SetupResult}>(
        "select api.setup_stage_school($1,$2::jsonb) result", [tokenHash(token), JSON.stringify(payload)]);
      const row = result.rows[0]?.result;
      if (!row?.school_id) throw new Error("School setup failed");
      return row;
    },
    async createAdmin(payload) {
      const capability = tokenHash(payload.token);
      const passwordHash = await hashPassword(payload.password);
      const result = await authPool.query<{result: AdminSetupResult}>(
        "select api.setup_complete_school($1,$2,$3,$4,$5,$6) result",
        [capability, payload.email, passwordHash, payload.first_name, payload.last_name, payload.phone ?? null]);
      const row = result.rows[0]?.result;
      if (!row?.profile_id) throw new Error("Administrator setup failed");
      return row;
    },
  };
}
