// SchoolSafe Activation Service V1 — HTTP client for redeem and refresh.
// Strict HTTPS-only, 5s timeout, fail-closed on any non-200 or parse error.
// Never logs activation codes, private keys or proofs.
import type { SignedLicenseV1 } from "./license.js";

export type ActivationServiceClientConfig = {
  baseUrl: string;
  timeoutMs?: number;
};

export type RedeemParams = {
  activationCode: string;
  schoolId: string;
  installationId: string;
  installationPublicKey: string;
};

export type RefreshParams = {
  licenseId: string;
  schoolId: string;
  installationId: string;
  timestamp: string;
  nonce: string;
  proof: string;
};

export type ActivationServiceClient = {
  redeem(params: RedeemParams): Promise<SignedLicenseV1 | null>;
  refresh(params: RefreshParams): Promise<SignedLicenseV1 | null>;
};

export function createActivationServiceClient(
  config: ActivationServiceClientConfig,
): ActivationServiceClient {
  const url = new URL(config.baseUrl);
  if (url.protocol !== "https:") {
    throw new Error("ACTIVATION_SERVICE_REQUIRES_HTTPS");
  }
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? 5000;

  async function postSignedLicense(
    path: string,
    body: unknown,
  ): Promise<SignedLicenseV1 | null> {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as unknown;
      if (!data || typeof data !== "object") return null;
      const envelope = data as Record<string, unknown>;
      if (
        typeof envelope.signature !== "string" ||
        !envelope.payload ||
        typeof envelope.payload !== "object"
      ) {
        return null;
      }
      return envelope as unknown as SignedLicenseV1;
    } catch {
      return null;
    }
  }

  return {
    async redeem(params: RedeemParams): Promise<SignedLicenseV1 | null> {
      return postSignedLicense("/v1/activation/redeem", {
        activation_code: params.activationCode,
        school_id: params.schoolId,
        installation_id: params.installationId,
        installation_public_key: params.installationPublicKey,
      });
    },
    async refresh(params: RefreshParams): Promise<SignedLicenseV1 | null> {
      return postSignedLicense("/v1/licenses/refresh", {
        license_id: params.licenseId,
        school_id: params.schoolId,
        installation_id: params.installationId,
        timestamp: params.timestamp,
        nonce: params.nonce,
        proof: params.proof,
      });
    },
  };
}