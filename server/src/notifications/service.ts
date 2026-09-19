import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationChannel,
  NotificationInput,
  NotificationProvider,
  NotificationResult,
  NotificationStatus,
} from "./types.js";

export type NotificationProviders = Partial<Record<NotificationChannel, NotificationProvider>>;

export function createNotificationService(client: SupabaseClient, providers: NotificationProviders) {
  return {
    async queue(input: NotificationInput): Promise<NotificationResult> {
      const { data: record, error: insertError } = await client
        .from("notifications")
        .insert({
          school_id: input.schoolId,
          user_id: input.userId,
          event_id: input.eventId ?? null,
          channel: input.channel,
          template_key: input.templateKey ?? null,
          title: input.title ?? null,
          message: input.message,
          recipient_email: input.recipientEmail ?? null,
          recipient_phone: input.recipientPhone ?? null,
          status: "PENDING",
          retry_count: 0,
          max_retries: 3,
        })
        .select("id, status, retry_count, max_retries, created_at")
        .single();

      if (insertError || !record) {
        throw new Error(`Failed to queue notification: ${insertError?.message ?? "unknown"}`);
      }

      const provider = providers[input.channel];
      let status: NotificationStatus = "PENDING";
      let providerName: string | null = null;
      let providerMessageId: string | null = null;
      let errorMessage: string | null = null;

      if (!provider) {
        status = "FAILED";
        errorMessage = `No provider configured for channel ${input.channel}`;
      } else {
        providerName = provider.name;
        const attempt = await provider.send({
          ...input,
          id: record.id as string,
          status: record.status as NotificationStatus,
          retryCount: record.retry_count as number,
          maxRetries: record.max_retries as number,
          createdAt: record.created_at as string,
        });
        status = attempt.status;
        providerMessageId = attempt.providerMessageId ?? null;
        errorMessage = attempt.error ?? null;
      }

      const { data: updated, error: updateError } = await client
        .from("notifications")
        .update({
          status,
          provider: providerName,
          provider_message_id: providerMessageId,
          error_message: errorMessage,
          sent_at: status === "SENT" || status === "DELIVERED" ? new Date().toISOString() : null,
        })
        .eq("id", record.id)
        .select("id, status, provider, error_message")
        .single();

      if (updateError || !updated) {
        throw new Error(`Failed to update notification: ${updateError?.message ?? "unknown"}`);
      }

      return {
        id: updated.id as string,
        status: updated.status as NotificationStatus,
        provider: (updated.provider as string) ?? undefined,
        error: (updated.error_message as string) ?? undefined,
      };
    },
  };
}
