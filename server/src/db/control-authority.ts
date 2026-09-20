// SchoolSafe — autorité machine SchoolSafe Control (callbacks signés HMAC).
// Séparation stricte avec l'accès humain : jamais de profileId fabriqué,
// jamais d'api.set_request_context. La signature est vérifiée AVANT tout SQL.
import {verifyRequest} from "../machine/hmac.js";
import type { PoolClient } from "pg";
import type { BusinessPool } from "./pool.js";

export type ControlAuthority = {
  instanceId: string;
  requestId: string;
  schoolId: string;
};

export class ControlAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlAuthorityError";
  }
}

/**
 * Vérifie la signature HMAC d'un callback Control (contrat Control existant :
 * METHOD\nPATH\nTIMESTAMP\nBODY, sha256, fenêtre 300 s). Aucune requête SQL
 * ne doit avoir eu lieu avant cet appel.
 */
export function verifyControlSignature(input: {
  method: string;
  path: string;
  body: string;
  instanceId: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  secret: string;
  nowSeconds?: number;
}): { ok: true; instanceId: string } | { ok: false } {
  const { instanceId, timestamp, signature } = input;
  if (!instanceId || !timestamp || !signature) return { ok: false };

  if (!/^\d+$/.test(timestamp)) return {ok: false};
  const valid = verifyRequest({method: input.method, path: input.path, body: input.body, secret: input.secret, timestamp: Number(timestamp), signature, now: input.nowSeconds});
  return valid ? {ok: true, instanceId} : {ok: false};
}

/**
 * Exécute fn dans une transaction au contexte MACHINE Control :
 * BEGIN → api.set_control_context(instance, request, school) → fn → COMMIT.
 * Rejette toute autorité incomplète AVANT d'acquérir un client.
 */
export async function withControlAuthority<T>(
  pool: BusinessPool,
  authority: ControlAuthority,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (
    !authority.instanceId?.trim() ||
    !authority.requestId?.trim() ||
    !authority.schoolId?.trim()
  ) {
    throw new ControlAuthorityError("Autorité Control incomplète");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("select api.set_control_context($1, $2, $3)", [
      authority.instanceId,
      authority.requestId,
      authority.schoolId,
    ]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
