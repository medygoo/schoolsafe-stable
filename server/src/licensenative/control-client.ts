// SchoolSafe License — client Control signé HMAC (contrat Control existant :
// METHOD\nPATH\nTIMESTAMP\nBODY, fenêtre 300s). Jamais de secret au frontend.
import { createHmac } from "node:crypto";
import type { ControlLicenseClient } from "./service.js";

export type ControlClientConfig = {
  url: string;
  instanceId: string;
  hmacSecret: string;
  timeoutMs?: number;
};

export function createControlLicenseClient(config: ControlClientConfig): ControlLicenseClient {
  const timeoutMs = config.timeoutMs ?? 5000;
  return {
    async fetchLicenseState(schoolId: string): Promise<string | null> {
      const path = `/api/license/state?school_id=${encodeURIComponent(schoolId)}`;
      const timestamp = Date.now().toString();
      const signature = createHmac("sha256", config.hmacSecret)
        .update(`GET\n${path}\n${timestamp}\n`)
        .digest("hex");

      try {
        const response = await fetch(config.url + path, {
          method: "GET",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            Accept: "application/json",
            "X-Control-Instance": config.instanceId,
            "X-Control-Timestamp": timestamp,
            "X-Control-Signature": signature,
          },
        });
        if (!response.ok) return null;
        const data = (await response.json()) as { signed_token?: string };
        return typeof data.signed_token === "string" ? data.signed_token : null;
      } catch {
        return null; // Control indisponible → mode hors-ligne
      }
    },
  };
}
