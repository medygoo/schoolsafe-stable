import type { NotificationProvider, NotificationRecord, SendAttempt } from "../types.js";

export function createInAppProvider(): NotificationProvider {
  return {
    name: "INTERNAL",
    async send(_record): Promise<SendAttempt> {
      return { status: "SENT" };
    },
  };
}
