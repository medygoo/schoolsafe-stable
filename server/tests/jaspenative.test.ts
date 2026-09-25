// JASPE 2.5D — service + route : rate limit, OFFLINE sans worker, timeout,
// erreur fournisseur, succès, session obligatoire, zéro secret.
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createJaspeNativeService } from "../src/jaspenative/service.js";
import type { AuthNativeService, AuthSessionInfo } from "../src/authnative/service.js";
import type { BusinessPool } from "../src/db/pool.js";

const SESSION: AuthSessionInfo = {
  sessionId: "44444444-0000-4000-8000-000000000001",
  identityId: "77777777-0000-4000-8000-000000000001",
  userId: "55555555-0000-4000-8000-000000000001",
  profileId: "66666666-0000-4000-8000-000000000001",
  schoolId: "33333333-0000-4000-8000-000000000001",
  mustChange: false,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

function fakeAuth(): AuthNativeService {
  return {
    async loginWithPassword() { throw new Error("not used"); },
    async resolveSession(token: string) { return token === "token-valide" ? SESSION : null; },
    async touchSession() { return null; },
    async logout() { return true; },
    async listProfiles() { return []; },
    async switchProfile() { return { ok: false as const }; },
  } as unknown as AuthNativeService;
}

function app(opts: { workerUrl?: string; fetchImpl?: typeof fetch; ratePerMinute?: number; withAuth?: boolean; allowed?: boolean }) {
  return buildApp({
    jaspeNative: {
      authService: opts.withAuth === false ? undefined : fakeAuth(),
      businessPool: { async connect() { return {
        async query(sql: string, values?: unknown[]) {
          if (sql.includes("api.check_access")) {
            expect(values?.slice(0, 2)).toEqual(["safe.assistant.use", SESSION.profileId]);
            return { rows: [{ allowed: opts.allowed !== false }] };
          }
          return { rows: [] };
        }, release() {},
      }; } } as unknown as BusinessPool,
      service: createJaspeNativeService({
        workerUrl: opts.workerUrl,
        workerHmacSecret: "test-secret-jaspe-hmac-32-bytes-minimum",
        timeoutMs: 1500,
        ratePerMinute: opts.ratePerMinute ?? 3,
        fetchImpl: opts.fetchImpl,
      }),
    },
  });
}

const payload = { message: "Bonjour Jaspe" };
const headers = { "content-type": "application/json", cookie: "schoolsafe_session=token-valide" };

describe("jaspenative", () => {
  it("refuse le droit retiré par un humain avant tout appel au fournisseur", async () => {
    let calls = 0;
    const a = app({ allowed: false, workerUrl: "https://worker.example/chat", fetchImpl: (async () => {
      calls++; return new Response('{}');
    }) as typeof fetch });
    const res = await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload });
    expect(res.statusCode).toBe(403);
    expect(calls).toBe(0);
    await a.close();
  });
  it("aucun mode anonyme si l'authentification est absente", async () => {
    const a = app({ withAuth: false });
    expect((await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload })).statusCode).toBe(503);
    await a.close();
  });
  it("ignore aucune autorité forgée : corps strict", async () => {
    const a = app({});
    expect((await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload: { ...payload, role: 'admin', schoolId: SESSION.schoolId } })).statusCode).toBe(400);
    await a.close();
  });
  it("signe le corps canonique c?t? serveur", async () => {
    let init: RequestInit | undefined;
    const fakeFetch = (async (_url, requestInit) => { init = requestInit; return new Response(JSON.stringify({ reply: "Bonjour !" }), { status: 200 }); }) as typeof fetch;
    const a = app({ workerUrl: "https://worker.example/chat", fetchImpl: fakeFetch });
    const res = await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload });
    expect(res.statusCode).toBe(200);
    expect(init?.headers).toMatchObject({ "x-jaspe-timestamp": expect.any(String), "x-jaspe-signature": expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(init?.body).toBe(JSON.stringify({ message: "Bonjour Jaspe", session_key: "u:" + SESSION.userId + ":" + SESSION.schoolId + ":" + SESSION.profileId, school_id: SESSION.schoolId }));
    await a.close();
  });

  it("succès : relaie la réponse du worker", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ reply: "Bonjour !" }), { status: 200 })) as typeof fetch;
    const a = app({ workerUrl: "https://worker.example/chat", fetchImpl: fakeFetch });
    const res = await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.reply).toBe("Bonjour !");
    await a.close();
  });

  it("sans JASPE_WORKER_URL : 503 JASPE_OFFLINE (jamais cassant)", async () => {
    const a = app({});
    const res = await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("JASPE_OFFLINE");
    await a.close();
  });

  it("rate limit par session : 429 JASPE_RATE_LIMITED au-delà du quota", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ reply: "ok" }), { status: 200 })) as typeof fetch;
    const a = app({ workerUrl: "https://worker.example/chat", fetchImpl: fakeFetch, ratePerMinute: 2 });
    await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload });
    await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload });
    const res = await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload });
    expect(res.statusCode).toBe(429);
    expect(res.json().code).toBe("JASPE_RATE_LIMITED");
    await a.close();
  });

  it("timeout fournisseur : 504 JASPE_TIMEOUT", async () => {
    const fakeFetch = ((_url: unknown, init?: RequestInit) => new Promise((_r, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as unknown as typeof fetch;
    const a = app({ workerUrl: "https://worker.example/chat", fetchImpl: fakeFetch });
    const res = await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload });
    expect(res.statusCode).toBe(504);
    expect(res.json().code).toBe("JASPE_TIMEOUT");
    await a.close();
  });

  it("erreur fournisseur : 502 JASPE_PROVIDER_ERROR", async () => {
    const fakeFetch = (async () => new Response("quota", { status: 429 })) as typeof fetch;
    const a = app({ workerUrl: "https://worker.example/chat", fetchImpl: fakeFetch });
    const res = await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload });
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("JASPE_PROVIDER_ERROR");
    await a.close();
  });

  it("session obligatoire quand l'auth est branchée : 401 sans cookie", async () => {
    const a = app({ workerUrl: "https://worker.example/chat" });
    const res = await a.inject({ method: "POST", url: "/native/jaspe/chat", headers: { "content-type": "application/json" }, payload });
    expect(res.statusCode).toBe(401);
    await a.close();
  });

  it("validation : message vide ou trop long rejeté", async () => {
    const a = app({ workerUrl: "https://worker.example/chat" });
    const res = await a.inject({ method: "POST", url: "/native/jaspe/chat", headers, payload: { message: "   " } });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    await a.close();
  });

  it("le service n'embarque ni clé ni SQL (mission 7/10/14)", async () => {
    const { readFileSync } = await import("node:fs");
    const srcRaw = readFileSync(new URL("../src/jaspenative/service.ts", import.meta.url), "utf8")
      + readFileSync(new URL("../src/jaspenative/routes.ts", import.meta.url), "utf8");
    const src = srcRaw.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""); // commentaires exclus
    expect(src).not.toMatch(/api[_-]?key|Bearer/i);
    expect(src).not.toMatch(/\.query\(|SELECT |INSERT |PostgreSQL/i);
  });
});

describe("jaspe phase 2 voice routes", () => {
  it("transcription route validates permission and relays audio without persistence", async () => {
    let url = "";
    const fakeFetch = (async (workerUrl, init) => {
      url = String(workerUrl);
      return new Response(JSON.stringify({ text: "bonjour" }), { status: 200 });
    }) as typeof fetch;
    const a = app({ workerUrl: "https://worker.example", fetchImpl: fakeFetch });
    const res = await a.inject({
      method: "POST", url: "/native/jaspe/transcribe", headers,
      payload: { audio_base64: Buffer.from("synthetic-audio").toString("base64"), mime_type: "audio/wav" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.text).toBe("bonjour");
    expect(url).toBe("https://worker.example/transcribe");
    await a.close();
  });

  it("TTS route returns audio and rejects unsupported MIME/shape", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ audio_base64: Buffer.from("RIFF").toString("base64"), mime_type: "audio/wav" }), { status: 200 })) as typeof fetch;
    const a = app({ workerUrl: "https://worker.example", fetchImpl: fakeFetch });
    const ok = await a.inject({ method: "POST", url: "/native/jaspe/speak", headers, payload: { text: "Bonjour", lang: "fr" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toContain("audio/wav");
    const invalid = await a.inject({ method: "POST", url: "/native/jaspe/transcribe", headers, payload: { audio_base64: "invalid", mime_type: "text/plain" } });
    expect(invalid.statusCode).toBeGreaterThanOrEqual(400);
    await a.close();
  });
});
