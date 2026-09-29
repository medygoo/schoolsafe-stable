// SchoolSafe Activation Service V1 — service : redeem, refresh avec proof Ed25519,
// état local fail-closed. TOUT passe par les RPC api.license_state_read/write.
// L'enveloppe SignedLicenseV1 est revérifiée à chaque lecture ; grace_days = 0.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";
import {
  computeLicenseStateV1,
  verifySignedLicenseV1,
  type LicensePayloadV1,
  type LicenseStateV1,
  type PublicKeyRegistry,
  type SignedLicenseV1,
} from "./license.js";
import type { ActivationServiceClient } from "./activation-client.js";
import type { InstallationKey } from "./installation-key.js";

type LicenseRowJson = {
  signed_token: string;
  license_id: string;
  status: string;
  issued_at: string;
  expires_at: string | null;
  grace_days: number;
  last_seen_at: string;
};

export type LicenseReadResult = {
  state: LicenseStateV1;
  payload: LicensePayloadV1 | null;
};

export function createLicenseNativeService(
  businessPool: BusinessPool,
  activationClient: ActivationServiceClient | undefined,
  publicKeyRegistry: PublicKeyRegistry,
  installationId: string,
  installationKey: InstallationKey | undefined,
) {
  async function readState(context: RequestContext): Promise<LicenseReadResult> {
    return withRequestContext(businessPool, context, async (client: PoolClient) => {
      const result = await client.query<{ license_state_read: LicenseRowJson | null }>(
        "select api.license_state_read() as license_state_read",
      );
      const row = result.rows[0].license_state_read;
      if (!row) return { state: "expired", payload: null };

      let envelope: unknown;
      try {
        envelope = JSON.parse(row.signed_token);
      } catch {
        return { state: "expired", payload: null };
      }

      const verified = verifySignedLicenseV1(envelope, publicKeyRegistry);
      if (!verified || verified.payload.school_id !== context.schoolId) {
        return { state: "expired", payload: null };
      }
      if (verified.payload.installation_id !== installationId) {
        return { state: "expired", payload: null };
      }

      const state = computeLicenseStateV1(verified.payload, new Date());
      return { state, payload: verified.payload };
    });
  }

  async function storeEnvelope(
    context: RequestContext,
    envelope: SignedLicenseV1,
  ): Promise<boolean> {
    return withRequestContext(businessPool, context, async (client: PoolClient) => {
      const now = new Date();
      const result = await client.query<{ license_state_write: { stored: boolean; reason?: string } }>(
        "select api.license_state_write($1, $2, $3, $4, $5, $6, $7, $8) as license_state_write",
        [
          JSON.stringify(envelope),
          JSON.stringify(envelope.payload),
          envelope.payload.license_id,
          envelope.payload.status === "trial" || envelope.payload.status === "grace"
            ? "active"
            : envelope.payload.status,
          envelope.payload.issued_at,
          envelope.payload.expires_at,
          0, // grace_days always 0 for Activation Service V1
          now.toISOString(),
        ],
      );
      return result.rows[0].license_state_write.stored === true;
    });
  }

  return {
    readState,

    async redeem(
      context: RequestContext,
      activationCode: string,
    ): Promise<LicenseReadResult> {
      if (!activationClient || !installationKey) {
        return readState(context);
      }

      const envelope = await activationClient.redeem({
        activationCode,
        schoolId: context.schoolId,
        installationId,
        installationPublicKey: installationKey.publicKeyBase64Url,
      });
      if (!envelope) return readState(context);

      const verified = verifySignedLicenseV1(envelope, publicKeyRegistry);
      if (!verified) return readState(context);
      if (verified.payload.school_id !== context.schoolId) return readState(context);
      if (verified.payload.installation_id !== installationId) return readState(context);

      const stored = await storeEnvelope(context, verified);
      if (!stored) return readState(context);

      return { state: computeLicenseStateV1(verified.payload, new Date()), payload: verified.payload };
    },

    async refreshFromActivation(context: RequestContext): Promise<LicenseReadResult> {
      if (!activationClient || !installationKey) return readState(context);

      const current = await readState(context);
      if (!current.payload) return current;

      const timestamp = new Date().toISOString();
      const nonceBytes = Buffer.alloc(32);
      // Use crypto.randomFillSync for nonce generation
      const { randomFillSync } = await import("node:crypto");
      randomFillSync(nonceBytes);
      const nonce = nonceBytes.toString("base64url");

      const message = [
        "schoolsafe-refresh-v1",
        current.payload.license_id,
        current.payload.school_id,
        current.payload.installation_id,
        timestamp,
        nonce,
      ].join("\n");

      const proof = installationKey.sign(message);

      const envelope = await activationClient.refresh({
        licenseId: current.payload.license_id,
        schoolId: context.schoolId,
        installationId,
        timestamp,
        nonce,
        proof,
      });
      if (!envelope) return readState(context);

      const verified = verifySignedLicenseV1(envelope, publicKeyRegistry);
      if (!verified) return readState(context);
      if (verified.payload.school_id !== context.schoolId) return readState(context);
      if (verified.payload.installation_id !== installationId) return readState(context);

      const stored = await storeEnvelope(context, verified);
      if (!stored) return readState(context);

      return { state: computeLicenseStateV1(verified.payload, new Date()), payload: verified.payload };
    },

    async gateAllows(context: RequestContext): Promise<boolean> {
      const { state } = await readState(context);
      return state === "active";
    },
  };
}

export type LicenseNativeService = ReturnType<typeof createLicenseNativeService>;