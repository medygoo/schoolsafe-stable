// SchoolSafe Auth v1 — jetons de session opaques.
// Le jeton brut ne vit que dans le cookie HttpOnly ; la base ne connaît que le haché SHA-256.
import { createHash, randomBytes } from "node:crypto";

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isValidTokenHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(hash);
}
