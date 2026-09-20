import type { EmailService } from "../email/service.js";
import type { RecoveryDelivery } from "./service.js";
export function createRecoveryDelivery(email: EmailService, resetUrl: string): RecoveryDelivery {
  const base = new URL(resetUrl);
  if (base.protocol !== "https:" || base.username || base.password) throw new Error("Trusted HTTPS recovery URL required");
  return async ({email: recipient, token}) => {
    const url = new URL(base); url.searchParams.set("token", token);
    const result = await email.send({to: [{email: recipient}], subject: "SchoolSafe password recovery", text: "Reset your password: " + url.toString()});
    if (result.status !== "sent") throw new Error("Recovery delivery failed");
  };
}
