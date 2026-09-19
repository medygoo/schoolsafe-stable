// SchoolSafe License — service : rafraîchissement Control + état hors-ligne.
// TOUT passe par les RPC definer (api.license_state_read/write) : le rôle
// api ne touche jamais la table. La signature est revérifiée à chaque lecture.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";
import {
  computeLicenseState,
  verifyLicenseToken,
  type LicensePayload,
  type LicenseState,
} from "./license.js";

type LicenseRowJson = {
  signed_token: string;
  license_id: string;
  status: "active" | "suspended" | "revoked";
  issued_at: string;
  expires_at: string;
  grace_days: number;
  last_seen_at: string;
};

// Client Control minimal : l'appel est signé HMAC (contrat Control existant).
export type ControlLicenseClient = {
  fetchLicenseState(schoolId: string): Promise<string | null>;
};

export type LicenseReadResult = {
  state: LicenseState;
  payload: LicensePayload | null;
};

export function createLicenseNativeService(
  businessPool: BusinessPool,
  controlClient: ControlLicenseClient | undefined,
  publicKeyPem: string,
) {
  async function readState(context: RequestContext): Promise<LicenseReadResult> {
    return withRequestContext(businessPool, context, async (client: PoolClient) => {
      const result = await client.query<{ license_state_read: LicenseRowJson | null }>(
        "select api.license_state_read() as license_state_read",
      );
      const row = result.rows[0].license_state_read;
      if (!row) return { state: "expired", payload: null }; // pas de licence = fail-closed

      const payload = verifyLicenseToken(row.signed_token, publicKeyPem);
      if (!payload || payload.school_id !== context.schoolId) {
        return { state: "expired", payload: null }; // falsifié → fermé
      }

      const state = computeLicenseState(payload, new Date(), new Date(row.last_seen_at));
      return { state, payload };
    });
  }

  return {
    readState,

    // Rafraîchissement Control : signature vérifiée AVANT stockage ; l'RPC
    // impose l'anti-rejeu (issued_at monotone) et audite l'écriture.
    async refreshFromControl(context: RequestContext): Promise<LicenseReadResult> {
      if (!controlClient) return readState(context);

      const token = await controlClient.fetchLicenseState(context.schoolId);
      if (!token) return readState(context); // Control indisponible → hors-ligne

      const payload = verifyLicenseToken(token, publicKeyPem);
      if (!payload || payload.school_id !== context.schoolId) {
        return readState(context); // réponse Control falsifiée → ignorer
      }

      const now = new Date();
      const written = await withRequestContext(businessPool, context, async (client: PoolClient) => {
        const result = await client.query<{ license_state_write: { stored: boolean; reason?: string } }>(
          "select api.license_state_write($1, $2, $3, $4, $5, $6, $7, $8) as license_state_write",
          [
            token,
            JSON.stringify(payload),
            payload.license_id,
            payload.status,
            payload.issued_at,
            payload.expires_at,
            payload.grace_days,
            now.toISOString(),
          ],
        );
        return result.rows[0].license_state_write;
      });

      if (!written.stored) return readState(context); // anti-rejeu : état courant conservé
      return { state: computeLicenseState(payload, now, now), payload };
    },

    async gateAllows(context: RequestContext): Promise<boolean> {
      const { state } = await readState(context);
      return state === "active" || state === "grace";
    },
  };
}

export type LicenseNativeService = ReturnType<typeof createLicenseNativeService>;
