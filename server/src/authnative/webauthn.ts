// SchoolSafe Auth v2 — WebAuthn / Passkey pour authentification forte et récupération.
// Utilise @simplewebauthn/server pour la vérification cryptographique.
// Une assertion WebAuthn en contexte recovery produit une RECOVERY AUTHORIZATION
// temporaire, PAS une session métier complète.

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type AuthenticatorTransport,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";

export type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON };

export interface WebAuthnConfig {
  rpName: string;
  rpId: string;
  origin: string | string[];
}

/** Credential tel que stocké côté serveur (identifiants en base64url). */
export interface StoredCredential {
  /** base64url-encoded credential ID */
  credentialId: string;
  publicKey: Uint8Array;
  signCount: number;
  transports?: AuthenticatorTransport[];
}

export interface CredentialStore {
  getCredential(credentialId: string): Promise<StoredCredential | null>;
  saveCredential(identityId: string, credential: StoredCredential): Promise<void>;
  updateSignCount(credentialId: string, signCount: number): Promise<boolean>;
  listCredentials(identityId: string): Promise<Array<{ credentialId: string; friendlyName?: string; createdAt: Date }>>;
  revokeCredential(identityId: string, credentialId: string): Promise<boolean>;
}

export interface ChallengeStore {
  set(userId: string, challenge: string, ttlMs: number): Promise<void>;
  get(userId: string): Promise<string | null>;
  delete(userId: string): Promise<void>;
}

const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Génère les options d'enregistrement WebAuthn pour un utilisateur authentifié.
 */
export async function createRegistrationOptions(
  config: WebAuthnConfig,
  userId: string,
  userEmail: string,
  userName: string,
  existingCredentials: Array<{ credentialId: string; transports?: AuthenticatorTransport[] }>,
  challengeStore: ChallengeStore,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userID: new TextEncoder().encode(userId),
    userName: userEmail,
    userDisplayName: userName,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await challengeStore.set(userId, options.challenge, WEBAUTHN_CHALLENGE_TTL_MS);
  return options;
}

/**
 * Vérifie la réponse d'enregistrement et retourne le credential à stocker.
 */
export async function verifyRegistration(
  config: WebAuthnConfig,
  userId: string,
  response: RegistrationResponseJSON,
  challengeStore: ChallengeStore,
): Promise<StoredCredential | null> {
  const expectedChallenge = await challengeStore.get(userId);
  if (!expectedChallenge) return null;

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return null;
    }

    await challengeStore.delete(userId);

    const { credential } = verification.registrationInfo;
    return {
      credentialId: credential.id,
      publicKey: credential.publicKey,
      signCount: credential.counter,
      transports: credential.transports as AuthenticatorTransport[] | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Génère les options d'authentification WebAuthn pour la récupération.
 * L'utilisateur n'est pas encore authentifié ; on utilise l'identityId comme clé de challenge.
 */
export async function createRecoveryAuthenticationOptions(
  config: WebAuthnConfig,
  identityId: string,
  allowCredentials: Array<{ credentialId: string; transports?: AuthenticatorTransport[] }>,
  challengeStore: ChallengeStore,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    allowCredentials: allowCredentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports,
    })),
    userVerification: "preferred",
  });

  await challengeStore.set(identityId, options.challenge, WEBAUTHN_CHALLENGE_TTL_MS);
  return options;
}

/**
 * Vérifie une assertion WebAuthn en contexte de récupération.
 * Retourne l'identityId si valide, null sinon.
 * NE CRÉE PAS de session métier — uniquement une autorisation de reset.
 */
export async function verifyRecoveryAssertion(
  config: WebAuthnConfig,
  identityId: string,
  response: AuthenticationResponseJSON,
  credentialStore: CredentialStore,
  challengeStore: ChallengeStore,
): Promise<{ identityId: string; credentialId: string; newSignCount: number } | null> {
  const expectedChallenge = await challengeStore.get(identityId);
  if (!expectedChallenge) return null;

  const stored = await credentialStore.getCredential(response.rawId);
  if (!stored) return null;

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      credential: {
        id: stored.credentialId,
        publicKey: stored.publicKey,
        counter: stored.signCount,
        transports: stored.transports,
      },
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.authenticationInfo) {
      return null;
    }

    await challengeStore.delete(identityId);

    return {
      identityId,
      credentialId: stored.credentialId,
      newSignCount: verification.authenticationInfo.newCounter,
    };
  } catch {
    return null;
  }
}
