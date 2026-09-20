/**
 * SchoolSafe JASPE 2.5D — Worker Cloudflare.
 *
 * Pont entre le VPS SchoolSafe et Cloudflare AI.
 * Le VPS appelle ce Worker via JASPE_WORKER_URL. Le Worker ne fait JAMAIS de SQL,
 * il appelle uniquement Cloudflare AI (Workers AI via binding), protégé par AI Gateway.
 *
 * Bindings (wrangler.toml) :
 *   - AI (Workers AI)  -> le "cerveau" (ex: @cf/meta/llama-3.3-70b-instruct)
 *   - AI_GATEWAY (AI Gateway) -> contrôle des requêtes/quotas/latence
 * Le VPS n'a aucune clé ; tout se passe côté Worker.
 */

export interface Env {
  AI: any;
  AI_GATEWAY?: any;
  JASPE_MODEL?: string;
  JASPE_SYSTEM_PROMPT?: string;
  CONTROL_INSTANCE_ID?: string;
  JASPE_ALLOWED_ORIGINS?: string;
  JASPE_WORKER_HMAC_SECRET: string;
}

interface ChatRequest {
  message?: string;
  session_key?: string;
}

const REPLAY_WINDOW_SECONDS = 300;

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp + "\n" + body)));
}

function hexEqual(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.toLowerCase().charCodeAt(i) ^ b.toLowerCase().charCodeAt(i);
  return diff === 0;
}

const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return json({ code: "METHOD_NOT_ALLOWED", message: "POST requis" }, 405);
    }

    const timestamp = request.headers.get("x-jaspe-timestamp");
    const signature = request.headers.get("x-jaspe-signature");
    if (!env.JASPE_WORKER_HMAC_SECRET || !timestamp || !signature || !/^\d+$/.test(timestamp)) return json({ code: "AUTH_INVALID", message: "Signature requise" }, 401);
    const timestampSeconds = Number(timestamp);
    if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > REPLAY_WINDOW_SECONDS) return json({ code: "AUTH_REPLAY", message: "Requete expiree" }, 401);
    const rawBody = await request.text();
    let body: ChatRequest;
    try { body = JSON.parse(rawBody) as ChatRequest; } catch { return json({ code: "VALIDATION_INVALID", message: "Corps JSON invalide" }, 400); }
    if (JSON.stringify(body) !== rawBody) return json({ code: "AUTH_INVALID", message: "Corps non canonique" }, 401);
    const expected = await hmac(env.JASPE_WORKER_HMAC_SECRET, timestamp, rawBody);
    if (!hexEqual(expected, signature)) return json({ code: "AUTH_INVALID", message: "Signature invalide" }, 401);

    const message = (body.message || "").trim();
    if (!message || typeof body.session_key !== "string" || !body.session_key.trim()) {
      return json({ code: "VALIDATION_INVALID", message: "message requis" }, 400);
    }

    // Cerveau JASPE 2.5D — Cloudflare Workers AI avec AI Gateway.
    // Le binding env.AI est défini dans wrangler.toml (section [ai]).
    if (!env.AI) {
      return json({ code: "AI_NOT_CONFIGURED", message: "Workers AI non configuré" }, 503);
    }

    try {
      const model = env.JASPE_MODEL || DEFAULT_MODEL;
      const systemPrompt = env.JASPE_SYSTEM_PROMPT
        || "Tu es JASPE, l'assistante de l'école SchoolSafe. Réponds avec bienveillance et pédagogie, en français.";

      const aiTarget = env.AI_GATEWAY || env.AI;

      const result = await aiTarget.run(model, {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      });

      let text = "";
      const out: any = result as any;
      if (out?.response) text = String(out.response);
      else if (typeof result === "string") text = result;
      else text = JSON.stringify(result);

      return json({ reply: text });
    } catch (err: any) {
      const msg = err?.message || String(err);
      return json({ code: "PROVIDER_ERROR", message: msg }, 502);
    }
  },
};