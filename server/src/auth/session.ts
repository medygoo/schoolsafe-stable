export type VerifiedIdentity = {
  userId: string;
  email?: string;
};

export type AuthSession = VerifiedIdentity & {
  token: string;
};

export interface AuthVerifier {
  verify(token: string): Promise<VerifiedIdentity | null>;
}

export function extractBearerToken(authorization: string | undefined): string {
  if (!authorization) {
    throw new Error("Authorization header is required");
  }

  const match = /^Bearer\s+([^\s].*)$/i.exec(authorization.trim());
  const token = match?.[1]?.trim();
  if (!token) {
    throw new Error("Authorization must use a Bearer token");
  }

  return token;
}

export async function verifyBearerAuthorization(
  authorization: string | undefined,
  verifier: AuthVerifier,
): Promise<AuthSession> {
  const token = extractBearerToken(authorization);
  const identity = await verifier.verify(token);

  if (!identity?.userId) {
    throw new Error("Invalid or expired bearer token");
  }

  return {
    userId: identity.userId,
    ...(identity.email ? { email: identity.email } : {}),
    token,
  };
}
