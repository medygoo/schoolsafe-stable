// LOT 4 : stubs des méthodes ajoutées au service auth natif.
// Les tests existants qui simulent AuthNativeService n'ont pas besoin de
// comportement réel pour ces méthodes : ils vérifient d'autres routes.
// Ce helper évite de dupliquer 9 stubs dans chaque fichier de test.

export const lot4AuthStubs = {
  getRecoveryMethods: async (): Promise<string[]> => [],
  requestEmailVerification: async (): Promise<boolean> => false,
  verifyEmail: async (): Promise<boolean> => false,
  requestPhoneVerification: async (): Promise<boolean> => false,
  verifyPhone: async (): Promise<boolean> => false,
  requestSmsRecovery: async (): Promise<boolean> => false,
  adminGenerateRecoveryCode: async (): Promise<string | null> => null,
  redeemAdminRecoveryCode: async (): Promise<{ identityId: string } | null> => null,
  hasWebAuthnCredential: async (): Promise<boolean> => false,
} as const;
