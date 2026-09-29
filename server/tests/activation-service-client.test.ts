import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { createActivationServiceClient } from "../src/licensenative/activation-client.js";
import { loadInstallationKey } from "../src/licensenative/installation-key.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const installation = generateKeyPairSync("ed25519");
const signing = generateKeyPairSync("ed25519");
const keyId = "test-key-1";
const publicKeyPem = signing.publicKey.export({ type: "spki", format: "pem" }).toString();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Activation Service V1 client", () => {
  it("redeems an activation code and returns the signed envelope", async () => {
    const mockResponse = {
      payload: {
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
      },
      signature: "valid-signature-base64url",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createActivationServiceClient({
      baseUrl: "https://activation.example.invalid",
      timeoutMs: 5000,
    });

    const result = await client.redeem({
      activationCode: "SSA1_test_code_123456789012345678901234567890",
      schoolId: "school-123",
      installationId: "11111111-2222-3333-4444-555555555555",
      installationPublicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });

    expect(result).toEqual(mockResponse);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://activation.example.invalid/v1/activation/redeem",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.activation_code).toBe("SSA1_test_code_123456789012345678901234567890");
    expect(body.school_id).toBe("school-123");
    expect(body.installation_id).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("returns null on non-200 redeem response without exposing details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => "conflict" }));
    const client = createActivationServiceClient({ baseUrl: "https://activation.example.invalid", timeoutMs: 5000 });
    const result = await client.redeem({
      activationCode: "SSA1_test",
      schoolId: "school-123",
      installationId: "11111111-2222-3333-4444-555555555555",
      installationPublicKey: "AAAA",
    });
    expect(result).toBeNull();
  });

  it("refreshes a license with proof-of-possession", async () => {
    const mockResponse = {
      payload: {
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
      },
      signature: "refreshed-signature",
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createActivationServiceClient({
      baseUrl: "https://activation.example.invalid",
      timeoutMs: 5000,
    });

    const result = await client.refresh({
      licenseId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      schoolId: "school-123",
      installationId: "11111111-2222-3333-4444-555555555555",
      timestamp: "2026-09-29T12:00:00.000Z",
      nonce: "nonce-base64url-32bytes",
      proof: "proof-base64url-64bytes",
    });

    expect(result).toEqual(mockResponse);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.license_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(body.proof).toBe("proof-base64url-64bytes");
  });

  it("returns null on HTTP 201 response (only 200 accepted)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ payload: {}, signature: "x" }) }));
    const client = createActivationServiceClient({ baseUrl: "https://activation.example.invalid", timeoutMs: 5000 });
    const result = await client.redeem({
      activationCode: "SSA1_test",
      schoolId: "school-123",
      installationId: "11111111-2222-3333-4444-555555555555",
      installationPublicKey: "AAAA",
    });
    expect(result).toBeNull();
  });

  it("rejects non-HTTPS base URL", () => {
    expect(() =>
      createActivationServiceClient({ baseUrl: "http://insecure.example.invalid", timeoutMs: 5000 }),
    ).toThrow(/HTTPS/i);
  });
});

describe("Installation key loading", () => {
  it("loads an Ed25519 private key and exports raw public key as base64url", () => {
    const dir = mkdtempSync(join(tmpdir(), "install-key-"));
    try {
      const keyPath = join(dir, "install.pem");
      const pem = installation.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
      writeFileSync(keyPath, pem, { mode: 0o600 });

      const loaded = loadInstallationKey(keyPath);
      expect(loaded.publicKeyBase64Url).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(loaded.publicKeyBase64Url, "base64url")).toHaveLength(32);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("signs a refresh proof message with the exact format", () => {
    const dir = mkdtempSync(join(tmpdir(), "install-key-"));
    try {
      const keyPath = join(dir, "install.pem");
      const pem = installation.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
      writeFileSync(keyPath, pem, { mode: 0o600 });

      const loaded = loadInstallationKey(keyPath);
      const message = [
        "schoolsafe-refresh-v1",
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "school-123",
        "11111111-2222-3333-4444-555555555555",
        "2026-09-29T12:00:00.000Z",
        "nonce-base64url-32bytes",
      ].join("\n");

      const proof = loaded.sign(message);
      expect(proof).toMatch(/^[A-Za-z0-9_-]{86}$/);
      expect(Buffer.from(proof, "base64url")).toHaveLength(64);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-Ed25519 keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "install-key-"));
    try {
      const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
      const keyPath = join(dir, "rsa.pem");
      writeFileSync(keyPath, rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), { mode: 0o600 });
      expect(() => loadInstallationKey(keyPath)).toThrow(/Ed25519/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});