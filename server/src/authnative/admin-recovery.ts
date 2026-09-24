// SchoolSafe Auth v2 — Récupération assistée par administrateur principal.
// L'admin peut générer un code temporaire pour un utilisateur de SON école uniquement.
// L'utilisateur saisit identifiant + code pour obtenir une autorisation de reset.
// L'admin ne voit jamais l'ancien ni le nouveau mot de passe.
// Auto-reset interdit : un admin ne peut pas utiliser ce mécanisme sur lui-même.

import { randomInt, createHash } from "node:crypto";

export interface AdminRecoveryConfig {
  codeTtlMs: number;       // 60 minutes par défaut
  maxAttempts: number;     // 5 par défaut
}

export interface AdminRecoveryStore {
  /** Génère un code et le stocke hashé. Retourne le code en clair à transmettre. */
  generateCode(
    targetIdentityId: string,
    schoolId: string,
    adminProfileId: string,
    ttlMs: number,
  ): Promise<string | null>;

  /** Valide un code. Retourne l'identityId cible si valide, null sinon. */
  redeemCode(
    login: string,
    codeHash: string,
    maxAttempts: number,
  ): Promise<{ identityId: string; schoolId: string } | null>;

  /** Vérifie si un admin peut générer un code pour une identité donnée. */
  canAdminRecover(
    adminProfileId: string,
    targetIdentityId: string,
  ): Promise<boolean>;
}

const DEFAULT_CONFIG: AdminRecoveryConfig = {
  codeTtlMs: 60 * 60 * 1000,
  maxAttempts: 5,
};

/**
 * Génère un code de récupération administrateur cryptographiquement aléatoire.
 * Format : 10 chiffres décimaux, zéros initiaux conservés.
 */
export function generateAdminRecoveryCode(): string {
  return randomInt(0, 10_000_000_000).toString().padStart(10, "0");
}

/**
 * Hash SHA-256 d'un code administrateur.
 */
export function hashAdminRecoveryCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Crée un service de récupération administrateur avec la configuration donnée.
 * Le store est injecté séparément (implémentation DB dans les routes).
 */
export function createAdminRecoveryService(config?: Partial<AdminRecoveryConfig>) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    config: cfg,
    generateCode: () => generateAdminRecoveryCode(),
    hashCode: (code: string) => hashAdminRecoveryCode(code),
  };
}

export type AdminRecoveryService = ReturnType<typeof createAdminRecoveryService>;