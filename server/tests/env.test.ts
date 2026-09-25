import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

describe("parseEnv — VPS PostgreSQL", () => {
  it("accepte les réglages locaux sans clés Supabase", () => {
    const env = parseEnv({ NODE_ENV: "test" });
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.PORT).toBe(8787);
    expect(env).not.toHaveProperty("SUPABASE_URL");
  });
  it("ignore les anciennes variables Supabase même invalides", () => {
    const env = parseEnv({ SUPABASE_URL: "retired", SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" });
    expect(Object.keys(env).filter(key => key.startsWith("SUPABASE_"))).toEqual([]);
  });
  it("valide les ports avant de créer les pools", () => {
    expect(() => parseEnv({ PGPORT: "0" })).toThrow(/PGPORT/);
  });
});

describe("parseEnv — pilot school", () => {
  it("accepts an explicit pilot school UUID", () => {
    const env = parseEnv({ NODE_ENV: "test", PILOT_SCHOOL_ID: "33333333-0000-4000-8000-000000000001" });
    expect(env.PILOT_SCHOOL_ID).toBe("33333333-0000-4000-8000-000000000001");
  });

  it("rejects an invalid pilot school UUID", () => {
    expect(() => parseEnv({ NODE_ENV: "test", PILOT_SCHOOL_ID: "not-a-uuid" })).toThrow(/PILOT_SCHOOL_ID/);
  });

  it("leaves pilot access disabled when no UUID is configured", () => {
    expect(parseEnv({ NODE_ENV: "test" }).PILOT_SCHOOL_ID).toBeUndefined();
  });
});
