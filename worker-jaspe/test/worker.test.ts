import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import worker from "../src/index.ts";

const secret = "test-worker-secret-32-bytes-minimum-xxxx";
const body = JSON.stringify({ message: "JASPE_OK", session_key: "audit" });
const sign = (timestamp: string, content = body) => createHmac("sha256", secret).update(timestamp + "\n" + content).digest("hex");
const env = { JASPE_WORKER_HMAC_SECRET: secret, AI: { run: async () => ({ response: "JASPE_OK" }) } };

test("accepts a valid signed request and invokes Workers AI", async () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const res = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "content-type": "application/json", "x-jaspe-timestamp": timestamp, "x-jaspe-signature": sign(timestamp) }, body }), env as any);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).reply, "JASPE_OK");
});

test("rejects unsigned, invalid and replayed requests", async () => {
  const unsigned = await worker.fetch(new Request("https://worker.test/", { method: "POST", body }), env as any);
  assert.equal(unsigned.status, 401);
  const now = String(Math.floor(Date.now() / 1000));
  const invalid = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "x-jaspe-timestamp": now, "x-jaspe-signature": "0".repeat(64) }, body }), env as any);
  assert.equal(invalid.status, 401);
  const old = String(Math.floor(Date.now() / 1000) - 301);
  const replay = await worker.fetch(new Request("https://worker.test/", { method: "POST", headers: { "x-jaspe-timestamp": old, "x-jaspe-signature": sign(old) }, body }), env as any);
  assert.equal(replay.status, 401);
});

test("RAG filter only requests global plus the signed school scope", async () => {
  let filter: unknown;
  const ragEnv = {
    ...env,
    AI: { run: async (model: string) => model === "@cf/baai/bge-m3" ? { data: [[0.1, 0.2]] } : { response: "ok" } },
    VECTORIZE: { query: async (_vector: unknown, opts: any) => { filter = opts.filter; return { matches: [] }; } },
  };
  const payload = { message: "cours", session_key: "u:a:school-a:p", school_id: "school-a" };
  const raw = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await worker.fetch(new Request("https://worker.test/chat", { method: "POST", headers: { "x-jaspe-timestamp": ts, "x-jaspe-signature": createHmac("sha256", secret).update(ts + "\n" + raw).digest("hex") }, body: raw }), ragEnv as any);
  assert.equal(res.status, 200);
  assert.deepEqual(filter, { $or: [{ scope: "global" }, { scope: "school", school_id: "school-a" }] });
});

test("signed STT and TTS routes use the requested Cloudflare models", async () => {
  const models: string[] = [];
  const voiceEnv = { ...env, AI: { run: async (model: string) => { models.push(model); return model.includes("whisper") ? { text: "bonjour" } : new Uint8Array([82,73,70,70]); } } };
  for (const [path, payload] of [
    ["/transcribe", { audio_base64: Buffer.from("audio").toString("base64"), mime_type: "audio/wav", session_key: "audit" }],
    ["/speak", { text: "Bonjour", lang: "fr", session_key: "audit" }],
  ] as const) {
    const raw = JSON.stringify(payload);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", secret).update(ts + "\n" + raw).digest("hex");
    const res = await worker.fetch(new Request("https://worker.test" + path, { method: "POST", headers: { "x-jaspe-timestamp": ts, "x-jaspe-signature": sig }, body: raw }), voiceEnv as any);
    assert.equal(res.status, 200);
  }
  assert.deepEqual(models, ["@cf/openai/whisper-large-v3-turbo", "@cf/myshell-ai/melotts"]);
});
import { buildRagMetadata, chunkDocument } from "../src/rag.ts";

test("RAG metadata requires school scope and preserves global scope", () => {
  assert.ok(chunkDocument("one two three", 4).length >= 2);
  assert.throws(() => buildRagMetadata({ documentId: "d", text: "x", scope: "school", sourceType: "manual", title: "t", version: 1 }), /school_id_required/);
  const global = buildRagMetadata({ documentId: "g", text: "global", scope: "global", sourceType: "manual", title: "t", version: 1 });
  const school = buildRagMetadata({ documentId: "a", text: "private", scope: "school", schoolId: "A", sourceType: "manual", title: "t", version: 1 });
  assert.equal(global[0].school_id, undefined);
  assert.equal(school[0].school_id, "A");
});
test("short memory is isolated by session key", async () => {
  const seen: any[] = [];
  const memEnv = { ...env, AI: { run: async (_model: string, input: any) => { seen.push(input.messages); return { response: "ok" }; } } };
  for (const key of ["A", "B"]) {
    const payload = { message: "hello-" + key, session_key: key };
    const raw = JSON.stringify(payload);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", secret).update(ts + "\n" + raw).digest("hex");
    await worker.fetch(new Request("https://worker.test/chat", { method: "POST", headers: { "x-jaspe-timestamp": ts, "x-jaspe-signature": sig }, body: raw }), memEnv as any);
  }
  assert.equal(seen.length, 2);
  assert.equal(seen[1].some((m: any) => m.content === "hello-A"), false);
});
import { languageStatus } from "../src/languages.ts";
import { canUseFallback } from "../src/provider.ts";

test("language and fallback contracts fail closed", () => {
  assert.equal(languageStatus("fr"), "LIVE");
  assert.equal(languageStatus("en"), "LIVE");
  assert.equal(languageStatus("ln"), "CONFIGURED");
  assert.equal(languageStatus("xx"), "UNSUPPORTED");
  assert.equal(canUseFallback("timeout", { enabled: true, local: { chat: async () => "ok" } }), true);
  assert.equal(canUseFallback("permission", { enabled: true, local: { chat: async () => "ok" } } as any), false);
});
