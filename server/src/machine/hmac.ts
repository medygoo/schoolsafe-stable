import {createHmac, timingSafeEqual} from "node:crypto";
export type SignedRequest = {method: string; path: string; body: string; timestamp: number; secret: string};
export function signRequest(input: SignedRequest): string {
  return createHmac("sha256", input.secret).update([input.method.toUpperCase(),input.path,String(input.timestamp),input.body].join("\n")).digest("hex");
}
export function verifyRequest(input: SignedRequest & {signature: string; now?: number}): boolean {
  if (!Number.isSafeInteger(input.timestamp) || Math.abs((input.now ?? Math.floor(Date.now()/1000))-input.timestamp)>300 || !/^[a-f0-9]{64}$/.test(input.signature)) return false;
  return timingSafeEqual(Buffer.from(signRequest(input),"hex"),Buffer.from(input.signature,"hex"));
}
