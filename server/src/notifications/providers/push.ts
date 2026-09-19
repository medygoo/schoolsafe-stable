import webPush from "web-push";
import type { NotificationProvider, NotificationRecord, SendAttempt } from "../types.js";
import type { PushSubscription } from "../../push/subscriptions.js";

export type WebPushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
  getSubscriptions: (userId: string) => Promise<PushSubscription[]>;
  removeSubscription?: (userId: string, endpoint: string) => Promise<void>;
};

export function createWebPushProvider(config: WebPushConfig): NotificationProvider {
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return {
    name: "WEB_PUSH",
    async send(record): Promise<SendAttempt> {
      try {
        const subscriptions = await config.getSubscriptions(record.userId);
        if (subscriptions.length === 0) {
          return { status: "FAILED", error: "No push subscription found" };
        }
        const payload = JSON.stringify({ title: record.title ?? "SchoolSafe", body: record.message });
        const results = await Promise.all(
          subscriptions.map(async (sub) => {
            try {
              await webPush.sendNotification(sub, payload);
              return true;
            } catch (err) {
              if (err instanceof webPush.WebPushError && err.statusCode === 410 && config.removeSubscription) {
                await config.removeSubscription(record.userId, sub.endpoint);
              }
              return false;
            }
          }),
        );
        if (results.some((ok) => ok)) {
          return { status: "SENT" };
        }
        return { status: "FAILED", error: "All push subscriptions failed" };
      } catch (err) {
        return { status: "FAILED", error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
