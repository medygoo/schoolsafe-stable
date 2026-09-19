// SchoolSafe — pools PostgreSQL séparés par rôle (verrou d'architecture) :
//   schoolsafe_auth  → RPC d'authentification uniquement ;
//   schoolsafe_api   → RPC métier / ACCESS_LAW uniquement.
// Les deux types sont nominalement incompatibles : un pool ne peut jamais
// être branché à la place de l'autre (vérifié par le compilateur).
import { Pool } from "pg";
import type { AppEnv } from "../config/env.js";

declare const authPoolBrand: unique symbol;
declare const businessPoolBrand: unique symbol;

export type AuthPool = Pool & { readonly [authPoolBrand]: "schoolsafe_auth" };
export type BusinessPool = Pool & { readonly [businessPoolBrand]: "schoolsafe_api" };

function baseConfig(env: AppEnv) {
  if (!env.PGHOST || !env.PGDATABASE) {
    throw new Error("PGHOST et PGDATABASE sont requis pour le pool PostgreSQL");
  }
  return {
    host: env.PGHOST,
    port: env.PGPORT,
    database: env.PGDATABASE,
    max: env.PG_POOL_MAX,
    statement_timeout: env.PG_STATEMENT_TIMEOUT_MS,
    connectionTimeoutMillis: 5000,
  };
}

// Pool AUTH : identité uniquement (api.auth_*).
export function createAuthPool(env: AppEnv): AuthPool {
  if (!env.PGAUTH_USER || !env.PGAUTH_PASSWORD) {
    throw new Error("PGAUTH_USER et PGAUTH_PASSWORD sont requis pour le pool d'authentification");
  }
  return new Pool({
    ...baseConfig(env),
    user: env.PGAUTH_USER,
    password: env.PGAUTH_PASSWORD,
  }) as AuthPool;
}

// Pool MÉTIER : contexte schoolsafe.* + Access_Law uniquement.
export function createBusinessPool(env: AppEnv): BusinessPool {
  if (!env.PGUSER || !env.PGPASSWORD) {
    throw new Error("PGUSER et PGPASSWORD sont requis pour le pool métier");
  }
  return new Pool({
    ...baseConfig(env),
    user: env.PGUSER,
    password: env.PGPASSWORD,
  }) as BusinessPool;
}

export class PoolRoleMismatchError extends Error {
  constructor(expected: string, actual: string | undefined) {
    super(`Rôle PostgreSQL inattendu : attendu ${expected}, obtenu ${actual ?? "inconnu"}`);
    this.name = "PoolRoleMismatchError";
  }
}

// Vérification runtime à l'initialisation : le rôle réel de la connexion doit
// être EXACTEMENT celui attendu. Aucun fallback, aucune reprise — fail-closed.
async function assertPoolRole(pool: Pool, expected: "schoolsafe_auth" | "schoolsafe_api"): Promise<void> {
  let actual: string | undefined;
  try {
    const result = await pool.query("select current_user as role");
    actual = result.rows[0]?.role as string | undefined;
  } catch (error) {
    throw new PoolRoleMismatchError(expected, undefined);
  }
  if (actual !== expected) {
    throw new PoolRoleMismatchError(expected, actual);
  }
}

// À appeler au démarrage, AVANT la première utilisation du pool.
export function verifyAuthPoolRole(pool: AuthPool): Promise<void> {
  return assertPoolRole(pool, "schoolsafe_auth");
}

export function verifyBusinessPoolRole(pool: BusinessPool): Promise<void> {
  return assertPoolRole(pool, "schoolsafe_api");
}
