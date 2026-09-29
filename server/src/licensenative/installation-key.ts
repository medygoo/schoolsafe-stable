// SchoolSafe Activation Service V1 — installation key management.
// Loads an Ed25519 private key from disk, derives the raw 32-byte public key
// encoded as unpadded base64url, and signs refresh proofs.
import { createPrivateKey, sign as cryptoSign } from "node:crypto";
import { readFileSync } from "node:fs";

export type InstallationKey = {
  publicKeyBase64Url: string;
  sign(message: string): string;
};

export function loadInstallationKey(privateKeyPath: string): InstallationKey {
  const pem = readFileSync(privateKeyPath, "utf8");
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("INSTALLATION_KEY_NOT_ED25519");
  }
  // Export raw 32-byte Ed25519 public key as unpadded base64url
  const spkiDer = privateKey.export({ type: "spki", format: "der" });
  // SPKI for Ed25519 is 44 bytes: 12-byte header + 32-byte raw public key
  if (spkiDer.length !== 44) {
    throw new Error("INSTALLATION_KEY_INVALID_SPKI_LENGTH");
  }
  const rawPublicKey = spkiDer.subarray(12);
  const publicKeyBase64Url = rawPublicKey.toString("base64url");

  return {
    publicKeyBase64Url,
    sign(message: string): string {
      const signature = cryptoSign(null, Buffer.from(message, "utf8"), privateKey);
      return signature.toString("base64url");
    },
  };
}