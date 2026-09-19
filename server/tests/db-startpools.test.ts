import { describe, expect, it } from "vitest";
import { startVerifiedPools, type PoolFactories } from "../src/db/startpools.js";
import {
  PoolRoleMismatchError,
  createAuthPool,
  createBusinessPool,
  type AuthPool,
  type BusinessPool,
} from "../src/db/pool.js";
import type { AppEnv } from "../src/config/env.js";

const ENV_FULL = {
  PGHOST: "127.0.0.1",
  PGDATABASE: "schoolsafe_test",
  PGUSER: "schoolsafe_api",
  PGPASSWORD: "x",
  PGAUTH_USER: "schoolsafe_auth",
  PGAUTH_PASSWORD: "y",
} as unknown as AppEnv;

function makeFactories(roles: { auth: string; business: string }) {
  const calls: string[] = [];
  const fakePool = (name: string) =>
    ({ name, end: async () => { calls.push(`end:${name}`); } }) as unknown as AuthPool & BusinessPool;
  const factories: PoolFactories = {
    createAuthPool: () => {
      calls.push("create:auth");
      return fakePool("auth");
    },
    createBusinessPool: () => {
      calls.push("create:business");
      return fakePool("business");
    },
    verifyAuthPoolRole: async () => {
      calls.push("verify:auth");
      if (roles.auth !== "schoolsafe_auth") {
        throw new PoolRoleMismatchError("schoolsafe_auth", roles.auth);
      }
    },
    verifyBusinessPoolRole: async () => {
      calls.push("verify:business");
      if (roles.business !== "schoolsafe_api") {
        throw new PoolRoleMismatchError("schoolsafe_api", roles.business);
      }
    },
  };
  return { factories, calls };
}

describe("startVerifiedPools (bootstrap fail-closed)", () => {
  it("PostgreSQL absent de la configuration → auth native désactivée, pas de pool", async () => {
    const { factories, calls } = makeFactories({ auth: "schoolsafe_auth", business: "schoolsafe_api" });
    const result = await startVerifiedPools({} as AppEnv, factories);
    expect(result).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("configuration complète + rôles corrects → pools créés PUIS vérifiés, dans cet ordre", async () => {
    const { factories, calls } = makeFactories({ auth: "schoolsafe_auth", business: "schoolsafe_api" });
    const pools = await startVerifiedPools(ENV_FULL, factories);
    expect(pools).toBeDefined();
    expect(calls).toEqual([
      "create:auth",
      "create:business",
      "verify:auth",
      "verify:business",
    ]);
  });

  it("rôle auth incorrect → le bootstrap échoue, les pools sont fermés, rien n'est retourné", async () => {
    const { factories, calls } = makeFactories({ auth: "schoolsafe_api", business: "schoolsafe_api" });
    await expect(startVerifiedPools(ENV_FULL, factories)).rejects.toBeInstanceOf(
      PoolRoleMismatchError,
    );
    expect(calls).toContain("end:auth");
    expect(calls).toContain("end:business");
  });

  it("rôle métier incorrect → le bootstrap échoue (aucune tolérance)", async () => {
    const { factories } = makeFactories({ auth: "schoolsafe_auth", business: "schoolsafe_auth" });
    await expect(startVerifiedPools(ENV_FULL, factories)).rejects.toBeInstanceOf(
      PoolRoleMismatchError,
    );
  });

  it("configuration partielle (PG présent, credentials auth absents) → refus de démarrer", async () => {
    // Fabriques RÉELLES (elles valident l'env) + vérificateurs factices :
    // la validation de configuration doit rejeter avant toute connexion.
    const realFactories: PoolFactories = {
      createAuthPool,
      createBusinessPool,
      verifyAuthPoolRole: async () => {},
      verifyBusinessPoolRole: async () => {},
    };
    const partial = { PGHOST: "127.0.0.1", PGDATABASE: "schoolsafe_test" } as unknown as AppEnv;
    await expect(startVerifiedPools(partial, realFactories)).rejects.toThrow("PGAUTH_USER");
  });
});
