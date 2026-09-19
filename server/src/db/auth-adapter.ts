// SchoolSafe — adaptateur : fait parler le service d'authentification native
// (authnative) avec le pool PostgreSQL réel via l'interface AuthDatabase.
import type { AuthDatabase } from "../authnative/service.js";
import type { AuthPool } from "./pool.js";

export function createPgAuthDatabase(pool: AuthPool): AuthDatabase {
  return {
    async query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
  };
}
