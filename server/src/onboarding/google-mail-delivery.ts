import { createHmac, randomBytes } from "node:crypto";

export interface RegistrationApprovalMessage {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  approvalLink: string;
}
export type GoogleMailDelivery = (message: RegistrationApprovalMessage) => Promise<void>;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]!);

export function createGoogleMailDelivery(options: {
  url: string; secret: string; fetch?: typeof globalThis.fetch;
}): GoogleMailDelivery {
  let endpoint: URL;
  try { endpoint = new URL(options.url); } catch { throw new Error("Google mail configuration invalid"); }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || !options.secret.trim()) {
    throw new Error("Google mail configuration invalid");
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  return async message => {
    const v = 1;
    const kind = "registration_approval";
    const ts = Math.floor(Date.now() / 1000);
    const nonce = randomBytes(32).toString("base64url");
    const subject = "SchoolSafe — nouveau compte à approuver";
    const text = [message.first_name, message.last_name, message.email, message.phone, message.approvalLink].join("\n");
    const html = `<p>${[message.first_name, message.last_name, message.email, message.phone].map(escapeHtml).join("<br>")}</p><p><a href="${escapeHtml(message.approvalLink)}">Examiner le compte</a></p>`;
    const sig = createHmac("sha256", options.secret)
      .update(JSON.stringify([v, kind, ts, nonce, subject, text, html]), "utf8").digest("hex");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, 10_000);
    });
    try {
      // The same deadline covers headers and body; no retry can send a duplicate email.
      await Promise.race([(async () => {
        const response = await fetcher(endpoint.toString(), {
          method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ v, kind, ts, nonce, subject, text, html, sig }), signal: controller.signal,
        });
        if (!response.ok) throw new Error("unconfirmed");
        const result: unknown = await response.json();
        if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true ||
            !("provider" in result) || result.provider !== "google-mail") throw new Error("unconfirmed");
      })(), timeout]);
    } catch {
      throw new Error("Google mail delivery unavailable");
    } finally { clearTimeout(timer); }
  };
}
