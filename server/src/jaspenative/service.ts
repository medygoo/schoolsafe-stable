import { SchoolSafeError } from "../http/errors.js";
import { canonicalJson, signJaspeRequest } from "./signing.js";

export type JaspeChatInput = { message: string; sessionKey: string; schoolId?: string };
export type JaspeChatResult = { reply: string };
export type JaspeTranscribeInput = { audio: Uint8Array; mimeType: string; sessionKey: string; schoolId?: string };
export type JaspeTranscribeResult = { text: string };
export type JaspeSpeakInput = { text: string; lang: "fr" | "en"; sessionKey: string; schoolId?: string };
export type JaspeSpeakResult = { audioBase64: string; mimeType: string };

export type JaspeNativeServiceDeps = {
  workerUrl?: string;
  workerHmacSecret?: string;
  timeoutMs: number;
  ratePerMinute: number;
  sttRatePerMinute?: number;
  ttsRatePerMinute?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export function createJaspeNativeService(deps: JaspeNativeServiceDeps) {
  const fetcher = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();

  function rateAllows(key: string, limit: number): boolean {
    const t = now();
    const list = (hits.get(key) ?? []).filter((ts) => t - ts < 60_000);
    if (list.length >= limit) {
      hits.set(key, list);
      return false;
    }
    list.push(t);
    hits.set(key, list);
    return true;
  }

  async function callWorker<T>(path: string, payload: unknown, sessionKey: string, limit: number): Promise<T> {
    if (!rateAllows(`${path}:${sessionKey}`, limit)) {
      throw new SchoolSafeError(429, "JASPE_RATE_LIMITED", "Trop de demandes à Jaspe. Réessayez dans un instant.", true);
    }
    if (!deps.workerUrl || !deps.workerHmacSecret) {
      throw new SchoolSafeError(503, "JASPE_OFFLINE", "Jaspe n'est pas raccordée sur cette instance.", true);
    }
    const timestamp = Math.floor(now() / 1000);
    const body = canonicalJson(payload);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), deps.timeoutMs);
    try {
      const res = await fetcher(`${deps.workerUrl.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jaspe-timestamp": String(timestamp),
          "x-jaspe-signature": signJaspeRequest(deps.workerHmacSecret, timestamp, body),
        },
        body,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new SchoolSafeError(502, "JASPE_PROVIDER_ERROR", "Jaspe est momentanément indisponible.", true);
      return await res.json() as T;
    } catch (err) {
      if (err instanceof SchoolSafeError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new SchoolSafeError(504, "JASPE_TIMEOUT", "Jaspe met trop de temps à répondre. Réessayez.", true);
      }
      throw new SchoolSafeError(503, "JASPE_OFFLINE", "Jaspe est injoignable pour le moment.", true);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async chat(input: JaspeChatInput): Promise<JaspeChatResult> {
      const data = await callWorker<{ reply?: unknown }>("/chat", {
        message: input.message,
        session_key: input.sessionKey,
        ...(input.schoolId ? { school_id: input.schoolId } : {}),
      }, input.sessionKey, deps.ratePerMinute);
      const reply = typeof data.reply === "string" ? data.reply.trim() : "";
      if (!reply) throw new SchoolSafeError(502, "JASPE_PROVIDER_ERROR", "Réponse de Jaspe illisible.", true);
      return { reply };
    },
    async transcribe(input: JaspeTranscribeInput): Promise<JaspeTranscribeResult> {
      const data = await callWorker<{ text?: unknown }>("/transcribe", {
        audio_base64: Buffer.from(input.audio).toString("base64"),
        mime_type: input.mimeType,
        session_key: input.sessionKey,
        ...(input.schoolId ? { school_id: input.schoolId } : {}),
      }, input.sessionKey, deps.sttRatePerMinute ?? Math.max(1, Math.floor(deps.ratePerMinute / 2)));
      const text = typeof data.text === "string" ? data.text.trim() : "";
      if (!text) throw new SchoolSafeError(502, "JASPE_PROVIDER_ERROR", "Transcription vide.", true);
      return { text };
    },
    async speak(input: JaspeSpeakInput): Promise<JaspeSpeakResult> {
      const data = await callWorker<{ audio_base64?: unknown; mime_type?: unknown }>("/speak", {
        text: input.text,
        lang: input.lang,
        session_key: input.sessionKey,
        ...(input.schoolId ? { school_id: input.schoolId } : {}),
      }, input.sessionKey, deps.ttsRatePerMinute ?? Math.max(1, Math.floor(deps.ratePerMinute / 2)));
      if (typeof data.audio_base64 !== "string" || !data.audio_base64) {
        throw new SchoolSafeError(502, "JASPE_PROVIDER_ERROR", "Audio Jaspe indisponible.", true);
      }
      return { audioBase64: data.audio_base64, mimeType: typeof data.mime_type === "string" ? data.mime_type : "audio/wav" };
    },
  };
}

export type JaspeNativeService = ReturnType<typeof createJaspeNativeService>;
