// SchoolSafe License — vérification cryptographique (TRIAL-02).
// Control signe en Ed25519 ; le backend vérifie avec la clé PUBLIQUE.
// Règles 8/9/11 : jamais de booléen local, jamais de secret au frontend,
// la décision vit ici, côté serveur.
import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({
  license_id: z.string().min(1),
  school_id: z.string().uuid(),
  status: z.enum(["active", "suspended", "revoked"]),
  issued_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  grace_days: z.number().int().min(0).max(90),
});

export type LicensePayload = z.infer<typeof payloadSchema>;

function base64urlToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// Vérifie la signature Ed25519 d'un jeton Control. Null si falsifié/invalide.
export function verifyLicenseToken(token: string, publicKeyPem: string): LicensePayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    // On signe/vérifie les octets du segment base64url (la forme transportée).
    const signature = base64urlToBuffer(parts[1]);
    const key = createPublicKey(publicKeyPem);
    if (!cryptoVerify(null, Buffer.from(parts[0], "utf8"), key, signature)) return null;
    const parsed = payloadSchema.safeParse(JSON.parse(base64urlToBuffer(parts[0]).toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type LicenseState =
  | "active" // licence active (Control frais ou hors-ligne dans la validité)
  | "grace" // hors-ligne, dans la grâce signée
  | "suspended" // suspendue par Control
  | "revoked" // révoquée par Control — jamais de grâce
  | "expired"; // grâce écoulée — fail-closed

// now = max(heure serveur, lastSeenAt) : l'anti-retour d'horloge.
export function computeLicenseState(
  payload: LicensePayload,
  now: Date,
  lastSeenAt: Date,
): LicenseState {
  if (payload.status === "revoked") return "revoked";
  if (payload.status === "suspended") return "suspended";

  const effectiveNow = now.getTime() > lastSeenAt.getTime() ? now : lastSeenAt;
  const expiresAt = new Date(payload.expires_at);
  const graceEndsAt = new Date(expires_at_plus_days(expiresAt, payload.grace_days));

  if (effectiveNow < expiresAt) return "active";
  if (effectiveNow < graceEndsAt) return "grace";
  return "expired";
}

function expires_at_plus_days(date: Date, days: number): number {
  return date.getTime() + days * 86_400_000;
}
