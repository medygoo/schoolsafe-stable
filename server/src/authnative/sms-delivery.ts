// SchoolSafe Auth v2 — abstraction SMS pour vérification et récupération.
// Aucun fournisseur réel n'est configuré dans ce lot : le transport est
// injectable et testable via un mock. En production, si aucun provider
// n'est configuré, le système échoue silencieusement (fail-closed).

export interface SmsDelivery {
  sendVerificationCode(phone: string, code: string): Promise<boolean>;
  sendRecoveryCode(phone: string, code: string): Promise<boolean>;
}

export interface SmsProviderConfig {
  apiKey?: string;
  endpoint?: string;
  senderId?: string;
}

/**
 * Crée un SmsDelivery qui utilise un provider réel si configuré,
 * sinon retourne toujours false (fail-closed, aucune exception).
 */
export function createSmsDelivery(config: SmsProviderConfig | undefined): SmsDelivery {
  if (!config || !config.apiKey || !config.endpoint) {
    // Fail-closed : pas de provider = pas de SMS envoyé.
    // Le frontend ne doit jamais prétendre qu'un SMS a été envoyé.
    return {
      async sendVerificationCode(): Promise<boolean> { return false; },
      async sendRecoveryCode(): Promise<boolean> { return false; },
    };
  }

  // Placeholder pour intégration future d'un vrai provider.
  // L'interface est stable ; seule cette implémentation changera.
  return {
    async sendVerificationCode(phone: string, code: string): Promise<boolean> {
      try {
        const response = await fetch(config.endpoint!, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            to: phone,
            message: `SchoolSafe: votre code de vérification est ${code}. Valide 10 minutes.`,
            sender: config.senderId || "SchoolSafe",
          }),
          signal: AbortSignal.timeout(10_000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    async sendRecoveryCode(phone: string, code: string): Promise<boolean> {
      try {
        const response = await fetch(config.endpoint!, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            to: phone,
            message: `SchoolSafe: votre code de récupération est ${code}. Valide 10 minutes.`,
            sender: config.senderId || "SchoolSafe",
          }),
          signal: AbortSignal.timeout(10_000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Mock SmsDelivery pour les tests. Enregistre les appels pour inspection.
 */
export class MockSmsDelivery implements SmsDelivery {
  public readonly calls: Array<{ type: "verification" | "recovery"; phone: string; code: string }> = [];

  async sendVerificationCode(phone: string, code: string): Promise<boolean> {
    this.calls.push({ type: "verification", phone, code });
    return true;
  }

  async sendRecoveryCode(phone: string, code: string): Promise<boolean> {
    this.calls.push({ type: "recovery", phone, code });
    return true;
  }

  reset(): void {
    this.calls.length = 0;
  }
}