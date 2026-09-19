import { describe, expect, it } from "vitest";
import {
  createAuthPool,
  createBusinessPool,
  verifyAuthPoolRole,
  verifyBusinessPoolRole,
  PoolRoleMismatchError,
  type AuthPool,
  type BusinessPool,
} from "../src/db/pool.js";
import type { AppEnv } from "../src/config/env.js";

const BASE_ENV = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 8787,
  R2_BUCKET_CARDS: "cards",
  ZOHO_MAIL_SENDER_NAME: "SchoolSafe",
  ZOHO_MAIL_REGION: "com",
  VAPID_SUBJECT: "mailto:schoolsafe@example.com",
  DEFAULT_STAFF_PASSWORD: "SchoolSafe2026!",
  PGHOST: "127.0.0.1",
  PGPORT: 5432,
  PGDATABASE: "schoolsafe_test",
  PG_STATEMENT_TIMEOUT_MS: 15000,
  PG_POOL_MAX: 10,
} as unknown as AppEnv;

describe("pools séparés par rôle (verrou d'architecture)", () => {
  it("auth pool connects as the schoolsafe_auth credential", () => {
    const pool = createAuthPool({ ...BASE_ENV, PGAUTH_USER: "schoolsafe_auth", PGAUTH_PASSWORD: "secret-a" });
    expect((pool as unknown as { options: { user: string } }).options.user).toBe("schoolsafe_auth");
    expect((pool as unknown as { options: { database: string } }).options.database).toBe("schoolsafe_test");
  });

  it("business pool connects as the schoolsafe_api credential", () => {
    const pool = createBusinessPool({ ...BASE_ENV, PGUSER: "schoolsafe_api", PGPASSWORD: "secret-b" });
    expect((pool as unknown as { options: { user: string } }).options.user).toBe("schoolsafe_api");
  });

  it("the two pools never share credentials", () => {
    const auth = createAuthPool({ ...BASE_ENV, PGAUTH_USER: "schoolsafe_auth", PGAUTH_PASSWORD: "secret-a" });
    const business = createBusinessPool({ ...BASE_ENV, PGUSER: "schoolsafe_api", PGPASSWORD: "secret-b" });
    const authUser = (auth as unknown as { options: { user: string } }).options.user;
    const businessUser = (business as unknown as { options: { user: string } }).options.user;
    expect(authUser).not.toBe(businessUser);
  });

  it("fails closed when auth credentials are missing", () => {
    expect(() => createAuthPool(BASE_ENV)).toThrow("PGAUTH_USER");
  });

  it("fails closed when business credentials are missing", () => {
    expect(() => createBusinessPool(BASE_ENV)).toThrow("PGUSER");
  });

  it("fails closed when host or database is missing", () => {
    const incomplete = { ...BASE_ENV, PGHOST: undefined } as unknown as AppEnv;
    expect(() =>
      createAuthPool({ ...incomplete, PGAUTH_USER: "a", PGAUTH_PASSWORD: "b" }),
    ).toThrow("PGHOST");
  });
});

describe("verrou runtime de rôle PostgreSQL", () => {
  function fakePoolWithRole(role: string) {
    return {
      query: async () => ({ rows: [{ role }] }),
    };
  }

  it("auth connecté comme schoolsafe_auth = PASS", async () => {
    await expect(
      verifyAuthPoolRole(fakePoolWithRole("schoolsafe_auth") as unknown as AuthPool),
    ).resolves.toBeUndefined();
  });

  it("auth connecté comme schoolsafe_api = FAIL", async () => {
    await expect(
      verifyAuthPoolRole(fakePoolWithRole("schoolsafe_api") as unknown as AuthPool),
    ).rejects.toBeInstanceOf(PoolRoleMismatchError);
  });

  it("métier connecté comme schoolsafe_api = PASS", async () => {
    await expect(
      verifyBusinessPoolRole(fakePoolWithRole("schoolsafe_api") as unknown as BusinessPool),
    ).resolves.toBeUndefined();
  });

  it("métier connecté comme schoolsafe_auth = FAIL", async () => {
    await expect(
      verifyBusinessPoolRole(fakePoolWithRole("schoolsafe_auth") as unknown as BusinessPool),
    ).rejects.toBeInstanceOf(PoolRoleMismatchError);
  });

  it("même rôle pour les deux pools = FAIL (le vérificateur de l'autre refuse)", async () => {
    const pool = fakePoolWithRole("schoolsafe_auth");
    await expect(verifyAuthPoolRole(pool as unknown as AuthPool)).resolves.toBeUndefined();
    await expect(
      verifyBusinessPoolRole(pool as unknown as BusinessPool),
    ).rejects.toBeInstanceOf(PoolRoleMismatchError);
  });

  it("erreur de connexion à l'initialisation = FAIL (aucun fallback)", async () => {
    const broken = {
      query: async () => {
        throw new Error("connexion impossible");
      },
    };
    await expect(
      verifyAuthPoolRole(broken as unknown as AuthPool),
    ).rejects.toBeInstanceOf(PoolRoleMismatchError);
  });
});
