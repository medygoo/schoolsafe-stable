// SchoolSafe Activation Service V1 — SignedLicenseV1 verification and state computation.
// Replaces the legacy Control token format with the official Activation Service envelope:
// { payload: LicensePayloadV1, signature: base64url(Ed25519(canonicalize(payload))) }
// Verification uses RFC 8785 canonicalization and a key_id registry of public keys.
import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { z } from "zod";
import { canonicalizePayloadV1 } from "./canonicalize.js";
export { canonicalizePayloadV1 };

const licensePayloadV1Schema = z.object({
  version: z.literal(1),
  license_id: z.string().uuid(),
  school_id: z.string().min(1).max(128),
  installation_id: z.string().uuid(),
  status: z.enum(["trial", "grace", "active", "suspended", "revoked"]),
  plan: z.string().min(1),
  modules: z.array(z.string()),
  issued_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }).nullable(),
  perpetual: z.boolean().optional(),
  key_id: z.string().min(1),
}).strict().refine(
  (p) => p.perpetual === true ? p.expires_at === null : p.expires_at !== null,
  { message: "perpetual requires null expires_at; dated requires non-null expires_at" },
);

export type LicensePayloadV1 = z.infer<typeof licensePayloadV1Schema>;

export type SignedLicenseV1 = {
  payload: LicensePayloadV1;
  signature: string;
};

export type PublicKeyRegistry = Map<string, string>;

function base64urlToBuffer(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

/**
 * Verify a SignedLicenseV1 envelope against a public key registry.
 * Returns the parsed payload on success, null on any failure (fail-closed).
 */
export function verifySignedLicenseV1(
  envelope: unknown,
  registry: PublicKeyRegistry,
): SignedLicenseV1 | null {
  if (!envelope || typeof envelope !== "object") return null;
  const env = envelope as Record<string, unknown>;
  if (typeof env.signature !== "string") return null;
  if (!env.payload || typeof env.payload !== "object") return null;

  // Extract key_id from payload for registry lookup
  const payloadObj = env.payload as Record<string, unknown>;
  if (typeof payloadObj.key_id !== "string") return null;
  const publicKeyPem = registry.get(payloadObj.key_id);
  if (!publicKeyPem) return null;

  // Canonicalize the payload using RFC 8785
  let canonical: string;
  try {
    canonical = canonicalizePayloadV1(env.payload);
  } catch {
    return null;
  }

  // Decode and verify signature length (Ed25519 = 64 bytes)
  const signatureBytes = base64urlToBuffer(env.signature);
  if (!signatureBytes || signatureBytes.length !== 64) return null;

  // Verify Ed25519 signature over canonical bytes
  try {
    const key = createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== "ed25519") return null;
    if (!cryptoVerify(null, Buffer.from(canonical, "utf8"), key, signatureBytes)) return null;
  } catch {
    return null;
  }

  // Validate payload schema
  const parsed = licensePayloadV1Schema.safeParse(env.payload);
  if (!parsed.success) return null;

  return { payload: parsed.data, signature: env.signature };
}

export type LicenseStateV1 =
  | "active"
  | "suspended"
  | "revoked"
  | "expired";

/**
 * Compute license state from a verified Activation Service V1 payload.
 * No grace period: Activation Service V1 does not emit grace_days.
 */
export function computeLicenseStateV1(
  payload: LicensePayloadV1,
  now: Date,
): LicenseStateV1 {
  if (payload.status === "revoked") return "revoked";
  if (payload.status === "suspended") return "suspended";
  if (payload.perpetual === true && payload.expires_at === null) return "active";
  if (payload.expires_at === null) return "expired";
  const expiresAt = new Date(payload.expires_at);
  if (now.getTime() < expiresAt.getTime()) return "active";
  return "expired";
}