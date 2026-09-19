// SchoolSafe Auth v1 — cookie de session opaque.
// Le jeton brut ne vit QUE dans ce cookie HttpOnly : jamais lisible par le
// JavaScript de la page (résout R-06), jamais dans une URL, jamais en clair en base.
import type { FastifyReply, FastifyRequest } from "fastify";

export const SESSION_COOKIE_NAME = "schoolsafe_session";

export type CookieOptions = {
  secure: boolean;
  maxAgeSeconds: number;
};

export function setSessionCookie(reply: FastifyReply, token: string, options: CookieOptions): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAgeSeconds}`,
  ];
  if (options.secure) {
    parts.push("Secure");
  }
  void reply.header("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(reply: FastifyReply, options: Pick<CookieOptions, "secure">): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (options.secure) {
    parts.push("Secure");
  }
  void reply.header("Set-Cookie", parts.join("; "));
}

export function readSessionCookie(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE_NAME) {
      const value = part.slice(eq + 1).trim();
      return value || null;
    }
  }
  return null;
}
