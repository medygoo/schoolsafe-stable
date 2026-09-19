// SchoolSafe — service JASPE 2.5D : relais contrôlé vers le Worker Cloudflare.
// Règles mission : jamais de clé API ici, jamais de PostgreSQL, jamais de modèle
// gravé (le mapping modèle vit côté Worker). Dégradation propre : RATE_LIMITED /
// PROVIDER_ERROR / TIMEOUT / OFFLINE — le frontend affiche l'état correspondant.
import { SchoolSafeError } from "../http/errors.js";

export type JaspeChatInput = { message: string; sessionKey: string };
export type JaspeChatResult = { reply: string };

export type JaspeNativeServiceDeps = {
  workerUrl?: string;
  timeoutMs: number;
  ratePerMinute: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export function createJaspeNativeService(deps: JaspeNativeServiceDeps) {
  const fetcher = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();

  function rateAllows(key: string): boolean {
    const t = now();
    const list = (hits.get(key) ?? []).filter((ts) => t - ts < 60_000);
    if (list.length >= deps.ratePerMinute) {
      hits.set(key, list);
      return false;
    }
    list.push(t);
    hits.set(key, list);
    return true;
  }

  return {
    async chat(input: JaspeChatInput): Promise<JaspeChatResult> {
      if (!rateAllows(input.sessionKey)) {
        throw new SchoolSafeError(429, "JASPE_RATE_LIMITED", "Trop de demandes à Jaspe. Réessayez dans un instant.", true);
      }
      if (!deps.workerUrl) {
        throw new SchoolSafeError(503, "JASPE_OFFLINE", "Jaspe n'est pas raccordée sur cette instance.", true);
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs);
      try {
        const res = await fetcher(deps.workerUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: input.message,
            session_key: input.sessionKey,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          throw new SchoolSafeError(502, "JASPE_PROVIDER_ERROR", "Jaspe est momentanément indisponible.", true);
        }
        const data: unknown = await res.json();
        const reply = data && typeof data === "object" && typeof (data as { reply?: unknown }).reply === "string"
          ? (data as { reply: string }).reply.trim()
          : "";
        if (!reply) {
          throw new SchoolSafeError(502, "JASPE_PROVIDER_ERROR", "Réponse de Jaspe illisible.", true);
        }
        return { reply };
      } catch (err) {
        if (err instanceof SchoolSafeError) throw err;
        if (err instanceof Error && err.name === "AbortError") {
          throw new SchoolSafeError(504, "JASPE_TIMEOUT", "Jaspe met trop de temps à répondre. Réessayez.", true);
        }
        throw new SchoolSafeError(503, "JASPE_OFFLINE", "Jaspe est injoignable pour le moment.", true);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export type JaspeNativeService = ReturnType<typeof createJaspeNativeService>;
