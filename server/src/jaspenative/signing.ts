import { createHmac, timingSafeEqual } from "node:crypto";

export const JASPE_REPLAY_WINDOW_SECONDS = 300;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

export function signJaspeRequest(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}\n${body}`, "utf8")
    .digest("hex");
}

export function signaturesEqual(expected: string, received: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(received) || !/^[0-9a-f]{64}$/i.test(expected)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}
