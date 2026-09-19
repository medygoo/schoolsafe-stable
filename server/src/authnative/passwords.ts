// SchoolSafe Auth v1 — mots de passe argon2id.
// Le hachage/vérification vit dans le backend ; la base ne stocke que des hachés.
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

const ARGON2ID_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return argonHash(plain, ARGON2ID_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (!hash.startsWith("$argon2id$")) {
    return false;
  }
  try {
    return await argonVerify(hash, plain);
  } catch {
    return false;
  }
}

// Haché factice : utilisé quand l'identité est inconnue, pour que la durée de
// réponse soit identique (anti-énumération temporelle).
export const DUMMY_ARGON2ID_HASH_PROMISE = argonHash("schoolsafe-dummy-password", ARGON2ID_OPTIONS);
