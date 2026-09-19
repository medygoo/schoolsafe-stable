// SchoolSafe — injection du contexte transactionnel schoolsafe.* (Access_Law).
// Chaque exécution métier ouvre une transaction, appelle api.set_request_context
// avec une identité résolue côté serveur (JAMAIS depuis le navigateur), puis
// n'exécute que des fonctions api.* dans ce contexte. Fail-closed.
import type { PoolClient } from "pg";
import type { BusinessPool } from "./pool.js";

export type RequestContext = {
  userId: string;
  profileId: string;
  schoolId: string;
  requestId: string;
};

export class ContextInjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextInjectionError";
  }
}

export async function withRequestContext<T>(
  pool: BusinessPool,
  context: RequestContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!context.userId || !context.profileId || !context.schoolId || !context.requestId) {
    throw new ContextInjectionError("Contexte de requête incomplet");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("select api.set_request_context($1, $2, $3, $4)", [
      context.userId,
      context.profileId,
      context.schoolId,
      context.requestId,
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
