// SchoolSafe — autorité machine SchoolSafe Control (callbacks signés HMAC).
// Séparation stricte avec l'accès humain : jamais de profileId fabriqué,
// jamais d'api.set_request_context. La signature est vérifiée AVANT tout SQL.
import { createHmac, timingSafeEqual } from "node:crypto";
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

const TIMESTAMP_WINDOW_SECONDS = 300;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
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

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false };
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TIMESTAMP_WINDOW_SECONDS) return { ok: false };

  const data = `${input.method.toUpperCase()}\n${input.path}\n${timestamp}\n${input.body}`;
  const expected = createHmac("sha256", input.secret).update(data).digest("hex");
  if (!safeEqual(expected, signature)) return { ok: false };

  return { ok: true, instanceId };
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
