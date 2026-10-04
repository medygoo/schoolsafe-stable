import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

describe("parseEnv — VPS PostgreSQL", () => {
  it("accepte les réglages locaux sans clés Supabase", () => {
    const env = parseEnv({ NODE_ENV: "test" });
    expect(env.HOST).toBe("127.0.0.1");
    expect(env.PORT).toBe(8787);
    expect(env.SUPABASE_URL).toBeUndefined();
    expect(env.SUPABASE_ANON_KEY).toBeUndefined();
  });
  it("ignore la clé service-role et n'active le pont que par URL et clé anon", () => {
    const ignored = parseEnv({ SUPABASE_SERVICE_ROLE_KEY: "service-role-must-stay-out" });
    expect(ignored).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
    expect(ignored.SUPABASE_URL).toBeUndefined();
    const local = parseEnv({
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_ANON_KEY: "local-anon-key-not-a-secret",
    });
    expect(local.SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(local.SUPABASE_ANON_KEY).toBe("local-anon-key-not-a-secret");
    expect(() => parseEnv({ SUPABASE_URL: "retired", SUPABASE_ANON_KEY: "local-anon-key-not-a-secret" })).toThrow(/SUPABASE_URL/);
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
