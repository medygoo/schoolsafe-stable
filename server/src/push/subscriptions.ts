import type { SupabaseClient } from "@supabase/supabase-js";

export type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export interface PushSubscriptionService {
  saveSubscription(userId: string, subscription: PushSubscription): Promise<void>;
  getSubscriptions(userId: string): Promise<PushSubscription[]>;
  removeSubscription(userId: string, endpoint: string): Promise<void>;
}

export function createPushSubscriptionService(client: SupabaseClient): PushSubscriptionService {
  return {
    async saveSubscription(userId, subscription) {
      const { error } = await client
        .from("push_subscriptions")
        .upsert({ user_id: userId, subscription }, { onConflict: "user_id, endpoint" });
      if (error) throw new Error(`Failed to save push subscription: ${error.message}`);
    },
    async getSubscriptions(userId) {
      const { data, error } = await client
        .from("push_subscriptions")
        .select("subscription")
        .eq("user_id", userId);
      if (error) throw new Error(`Failed to load push subscriptions: ${error.message}`);
      return (data ?? []).map((row) => row.subscription as PushSubscription);
    },
    async removeSubscription(userId, endpoint) {
      const { error } = await client
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", endpoint);
      if (error) throw new Error(`Failed to remove push subscription: ${error.message}`);
    },
  };
}
