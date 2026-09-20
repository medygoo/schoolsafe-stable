export interface Env {
  AI: any;
  VECTORIZE?: any;
  AI_GATEWAY?: any;
  JASPE_MODEL?: string;
  JASPE_SYSTEM_PROMPT?: string;
  JASPE_WORKER_HMAC_SECRET: string;
}
interface ChatRequest { message?: string; session_key?: string; school_id?: string }
const CHAT_MODEL = "@cf/zai-org/glm-4.7-flash";
const EMBEDDING_MODEL = "@cf/baai/bge-m3";
const STT_MODEL = "@cf/openai/whisper-large-v3-turbo";
const TTS_MODEL = "@cf/myshell-ai/melotts";
const REPLAY_WINDOW_SECONDS = 300;
const memory = new Map<string, Array<{ role: "user" | "assistant"; content: string }>>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
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
function decodeBase64(value: string): Uint8Array {
  const raw = atob(value);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function encodeBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let raw = "";
  for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(raw);
}
async function authorize(request: Request, env: Env): Promise<{ body: any } | Response> {
  const timestamp = request.headers.get("x-jaspe-timestamp");
  const signature = request.headers.get("x-jaspe-signature");
  if (!env.JASPE_WORKER_HMAC_SECRET || !timestamp || !signature || !/^\d+$/.test(timestamp)) return json({ code: "AUTH_INVALID" }, 401);
  const ts = Number(timestamp);
  if (!Number.isSafeInteger(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > REPLAY_WINDOW_SECONDS) return json({ code: "AUTH_REPLAY" }, 401);
  const raw = await request.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ code: "VALIDATION_INVALID" }, 400); }
  if (JSON.stringify(body) !== raw) return json({ code: "AUTH_INVALID" }, 401);
  if (!hexEqual(await hmac(env.JASPE_WORKER_HMAC_SECRET, timestamp, raw), signature)) return json({ code: "AUTH_INVALID" }, 401);
  return { body };
}
function validSession(body: any): boolean { return typeof body.session_key === "string" && body.session_key.trim().length > 0; }
async function retrieveContext(env: Env, message: string, schoolId?: string): Promise<string> {
  if (!env.VECTORIZE || !schoolId) return "";
  try {
    const embedding = await env.AI.run(EMBEDDING_MODEL, { text: [message] });
    const vector = embedding?.data?.[0] ?? embedding?.[0];
    if (!vector) return "";
    const filter = { $or: [{ scope: "global" }, { scope: "school", school_id: schoolId }] };
    const result = await env.VECTORIZE.query(vector, { topK: 5, returnMetadata: "all", filter });
    const rows = Array.isArray(result?.matches) ? result.matches : [];
    return rows.map((row: any) => String(row?.metadata?.text ?? row?.metadata?.content ?? "")).filter(Boolean).join("\n\n");
  } catch { return ""; }
}
async function runChat(env: Env, body: ChatRequest): Promise<string> {
  const context = await retrieveContext(env, body.message || "", body.school_id);
  const key = String(body.session_key);
  const history = memory.get(key) ?? [];
  const system = env.JASPE_SYSTEM_PROMPT || "You are Jaspe, SchoolSafe assistant. Never invent data absent from sources.";
  const source = context ? "\nAuthorized sources:\n" + context : "\nNo sufficient school source is available; say so clearly.";
  const messages = [{ role: "system", content: system + source }, ...history, { role: "user", content: body.message || "" }];
  const target = env.AI_GATEWAY || env.AI;
  if (!target) throw new Error("AI_NOT_CONFIGURED");
  const result = await target.run(env.JASPE_MODEL || CHAT_MODEL, { messages });
  const reply = typeof result === "string" ? result : String(result?.response ?? JSON.stringify(result));
  memory.set(key, [...history, { role: "user", content: body.message || "" }, { role: "assistant", content: reply }].slice(-6));
  return reply;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);
    const auth = await authorize(request, env);
    if (auth instanceof Response) return auth;
    const body = auth.body;
    if (!validSession(body)) return json({ code: "VALIDATION_INVALID" }, 400);
    const path = new URL(request.url).pathname;
    try {
      if (path === "/chat" || path === "/") {
        if (typeof body.message !== "string" || !body.message.trim() || body.message.length > 2000) return json({ code: "VALIDATION_INVALID" }, 400);
        return json({ reply: await runChat(env, body) });
      }
      if (path === "/transcribe") {
        if (typeof body.audio_base64 !== "string" || body.audio_base64.length > 2_800_000) return json({ code: "VALIDATION_INVALID" }, 400);
        const result = await env.AI.run(STT_MODEL, { audio: decodeBase64(body.audio_base64) });
        return json({ text: String(result?.text ?? result?.transcription ?? result ?? "").trim() });
      }
      if (path === "/speak") {
        if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 2000 || !["fr", "en"].includes(body.lang)) return json({ code: "VALIDATION_INVALID" }, 400);
        const result = await env.AI.run(TTS_MODEL, { text: body.text, lang: body.lang });
        const audio = result?.audio ?? result;
        return json({ audio_base64: encodeBase64(audio), mime_type: "audio/wav" });
      }
      return json({ code: "NOT_FOUND" }, 404);
    } catch (err: any) {
      return json({ code: "PROVIDER_ERROR", message: err?.message || "Provider unavailable" }, 502);
    }
  },
};
