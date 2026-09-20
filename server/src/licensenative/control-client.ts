// SchoolSafe License — client Control signé HMAC (contrat Control existant :
// METHOD\nPATH\nTIMESTAMP\nBODY, fenêtre 300s). Jamais de secret au frontend.
import {signRequest} from "../machine/hmac.js";
import type { ControlLicenseClient } from "./service.js";

export type ControlClientConfig = {
  url: string;
  instanceId: string;
  hmacSecret: string;
  timeoutMs?: number;
};

export function createControlLicenseClient(config: ControlClientConfig): ControlLicenseClient {
  if (new URL(config.url).protocol !== "https:") throw new Error("Control requires HTTPS");
  const timeoutMs = config.timeoutMs ?? 5000;
  return {
    async fetchLicenseState(schoolId: string): Promise<string | null> {
      const path = `/api/license/state?school_id=${encodeURIComponent(schoolId)}`;
      const timestamp = Math.floor(Date.now()/1000);
      const signature = signRequest({method: "GET", path, timestamp, body: "{}", secret: config.hmacSecret});

      try {
        const response = await fetch(config.url + path, {
          method: "GET",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            Accept: "application/json",
            "x-schoolsafe-instance": config.instanceId,
            "x-schoolsafe-timestamp": String(timestamp),
            "x-schoolsafe-signature": signature,
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
