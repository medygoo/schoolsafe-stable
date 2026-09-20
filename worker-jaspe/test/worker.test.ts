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
