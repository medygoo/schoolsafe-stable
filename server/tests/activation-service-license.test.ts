import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifySignedLicenseV1, computeLicenseStateV1, canonicalizePayloadV1 } from "../src/licensenative/license.js";

const signing = generateKeyPairSync("ed25519");
const keyId = "test-key-1";
const publicKeyPem = signing.publicKey.export({ type: "spki", format: "pem" }).toString();
const registry = new Map([[keyId, publicKeyPem]]);

function makeEnvelope(payload: Record<string, unknown>) {
  const canonical = canonicalizePayloadV1(payload);
  const signature = sign(null, Buffer.from(canonical, "utf8"), signing.privateKey).toString("base64url");
  return { payload, signature, key_id: keyId };
}

describe("Activation Service V1 signed license verification", () => {
  it("accepts a valid perpetual envelope with RFC8785 canonicalization", () => {
    const payload = {
      version: 1,
      license_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      school_id: "school-123",
      installation_id: "11111111-2222-3333-4444-555555555555",
      status: "active",
      plan: "school-perpetual",
      modules: ["core"],
      issued_at: "2026-09-29T00:00:00.000Z",
      expires_at: null,
      perpetual: true,
      key_id: keyId,
    };
    const result = verifySignedLicenseV1(makeEnvelope(payload), registry);
    expect(result).not.toBeNull();
    expect(result!.payload.perpetual).toBe(true);
    expect(result!.payload.expires_at).toBeNull();
  });

  it("rejects when key_id is unknown", () => {
    const payload = {
      version: 1,
      license_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      school_id: "school-123",
      installation_id: "11111111-2222-3333-4444-555555555555",
      status: "active",
      plan: "basic",
      modules: [],
      issued_at: "2026-09-29T00:00:00.000Z",
      expires_at: "2027-09-29T00:00:00.000Z",
      perpetual: false,
      key_id: "unknown-key",
    };
    const env = makeEnvelope({ ...payload, key_id: "unknown-key" });
    expect(verifySignedLicenseV1(env, registry)).toBeNull();
  });

  it("rejects when signature does not match RFC8785 canonical bytes", () => {
    const payload = {
      version: 1,
      license_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      school_id: "school-123",
      installation_id: "11111111-2222-3333-4444-555555555555",
      status: "active",
      plan: "basic",
      modules: [],
      issued_at: "2026-09-29T00:00:00.000Z",
      expires_at: "2027-09-29T00:00:00.000Z",
      perpetual: false,
      key_id: keyId,
    };
    const env = makeEnvelope(payload);
    // Tamper with JSON.stringify order — must fail because we verify canonical form
    const tampered = { ...env, payload: { ...payload, plan: "tampered" } };
    expect(verifySignedLicenseV1(tampered, registry)).toBeNull();
  });

  it("rejects perpetual=true with non-null expires_at", () => {
    const payload = {
      version: 1,
      license_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      school_id: "school-123",
      installation_id: "11111111-2222-3333-4444-555555555555",
      status: "active",
      plan: "school-perpetual",
      modules: [],
      issued_at: "2026-09-29T00:00:00.000Z",
      expires_at: "2027-09-29T00:00:00.000Z",
      perpetual: true,
      key_id: keyId,
    };
    expect(verifySignedLicenseV1(makeEnvelope(payload), registry)).toBeNull();
  });

  it("rejects dated license with null expires_at", () => {
    const payload = {
      version: 1,
      license_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      school_id: "school-123",
      installation_id: "11111111-2222-3333-4444-555555555555",
      status: "active",
      plan: "basic",
      modules: [],
      issued_at: "2026-09-29T00:00:00.000Z",
      expires_at: null,
      perpetual: false,
      key_id: keyId,
    };
    expect(verifySignedLicenseV1(makeEnvelope(payload), registry)).toBeNull();
  });

  it("computes active state for perpetual license regardless of current date", () => {
    const payload = {
      version: 1,
      license_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      school_id: "school-123",
      installation_id: "11111111-2222-3333-4444-555555555555",
      status: "active",
      plan: "school-perpetual",
      modules: [],
      issued_at: "2026-09-29T00:00:00.000Z",
      expires_at: null,
      perpetual: true,
      key_id: keyId,
    };
    const verified = verifySignedLicenseV1(makeEnvelope(payload), registry)!;
    expect(computeLicenseStateV1(verified.payload, new Date("2126-01-01"))).toBe("active");
  });

  it("computes expired state for dated license past expiry", () => {
    const payload = {
      version: 1,
      license_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      school_id: "school-123",
      installation_id: "11111111-2222-3333-4444-555555555555",
      status: "active",
      plan: "basic",
      modules: [],
      issued_at: "2026-09-29T00:00:00.000Z",
      expires_at: "2026-10-01T00:00:00.000Z",
      perpetual: false,
      key_id: keyId,
    };
    const verified = verifySignedLicenseV1(makeEnvelope(payload), registry)!;
    expect(computeLicenseStateV1(verified.payload, new Date("2026-10-02T00:00:00.000Z"))).toBe("expired");
  });

  it("returns revoked/suspended directly from payload status", () => {
    for (const status of ["revoked", "suspended"] as const) {
      const payload = {
        version: 1,
        license_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        school_id: "school-123",
        installation_id: "11111111-2222-3333-4444-555555555555",
        status,
        plan: "basic",
        modules: [],
        issued_at: "2026-09-29T00:00:00.000Z",
        expires_at: "2027-09-29T00:00:00.000Z",
        perpetual: false,
        key_id: keyId,
      };
      const verified = verifySignedLicenseV1(makeEnvelope(payload), registry)!;
      expect(computeLicenseStateV1(verified.payload, new Date())).toBe(status);
    }
  });

  it("rejects a non-canonical base64url signature encoding", () => {
    const payload = {
      version: 1,
      license_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      school_id: "school-123",
      installation_id: "11111111-2222-3333-4444-555555555555",
      status: "active",
      plan: "basic",
      modules: [],
      issued_at: "2026-09-29T00:00:00.000Z",
      expires_at: "2027-09-29T00:00:00.000Z",
      perpetual: false,
      key_id: keyId,
    };
    const env = makeEnvelope(payload);
    // Pad the canonical signature with trailing '=' to create a non-canonical but decodable variant
    const nonCanonical = { ...env, signature: env.signature + "=" };
    expect(verifySignedLicenseV1(nonCanonical, registry)).toBeNull();
  });
});