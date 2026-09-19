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
}

interface ChatRequest {
  message?: string;
}

const DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ code: "METHOD_NOT_ALLOWED", message: "POST requis" }, 405);
    }

    let body: ChatRequest;
    try {
      body = await request.json<ChatRequest>();
    } catch {
      return json({ code: "VALIDATION_INVALID", message: "Corps JSON invalide" }, 400);
    }

    const message = (body.message || "").trim();
    if (!message) {
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