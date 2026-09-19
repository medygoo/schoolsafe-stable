// SchoolSafe — démarrage vérifié des pools PostgreSQL.
// Règle : l'auth native ne s'active que si PostgreSQL est configuré ; si la
// configuration est partielle, le serveur REFUSE de démarrer (fail-closed).
// Les deux vérifications de rôle sont TOUJOURS exécutées (await) avant tout
// retour : aucun pool non vérifié ne peut servir une requête.
import {
  createAuthPool,
  createBusinessPool,
  verifyAuthPoolRole,
  verifyBusinessPoolRole,
  type AuthPool,
  type BusinessPool,
} from "./pool.js";
import type { AppEnv } from "../config/env.js";

export type VerifiedPools = {
  authPool: AuthPool;
  businessPool: BusinessPool;
};

export type PoolFactories = {
  createAuthPool: (env: AppEnv) => AuthPool;
  createBusinessPool: (env: AppEnv) => BusinessPool;
  verifyAuthPoolRole: (pool: AuthPool) => Promise<void>;
  verifyBusinessPoolRole: (pool: BusinessPool) => Promise<void>;
};

const DEFAULT_FACTORIES: PoolFactories = {
  createAuthPool,
  createBusinessPool,
  verifyAuthPoolRole,
  verifyBusinessPoolRole,
};

export async function startVerifiedPools(
  env: AppEnv,
  factories: PoolFactories = DEFAULT_FACTORIES,
): Promise<VerifiedPools | undefined> {
  const pgConfigured = Boolean(
    env.PGHOST || env.PGDATABASE || env.PGUSER || env.PGPASSWORD || env.PGAUTH_USER || env.PGAUTH_PASSWORD,
  );
  if (!pgConfigured) {
    return undefined;
  }

  const authPool = factories.createAuthPool(env);
  const businessPool = factories.createBusinessPool(env);

  try {
    await factories.verifyAuthPoolRole(authPool);
    await factories.verifyBusinessPoolRole(businessPool);
  } catch (error) {
    await authPool.end().catch(() => {});
    await businessPool.end().catch(() => {});
    throw error;
  }

  return { authPool, businessPool };
}
