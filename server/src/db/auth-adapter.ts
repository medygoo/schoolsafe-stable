// SchoolSafe — adaptateur : fait parler le service d'authentification native
// (authnative) avec le pool PostgreSQL réel via l'interface AuthDatabase.
import type { AuthDatabase } from "../authnative/service.js";
import type { AuthPool, BusinessPool } from "./pool.js";

export function createPgAuthDatabase(pool: AuthPool): AuthDatabase {
  return {
    async query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
  };
}

/**
 * Adaptateur pour les modules API qui utilisent le businessPool (ex: PRODELI).
 * Les fonctions SQL accordées à schoolsafe_api résident dans le schema api
 * et sont accessibles via le rôle schoolsafe_api (businessPool).
 */
export function createPgBusinessDatabase(pool: BusinessPool): AuthDatabase {
  return {
    async query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }> {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
  };
}
