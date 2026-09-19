import type { SupabaseClient } from "@supabase/supabase-js";
import type { SchoolSafeEvent } from "../events/types.js";
import type { NotificationChannel, NotificationInput, NotificationService } from "./types.js";

export type DispatcherConfig = {
  defaultChannels: NotificationChannel[];
};

export function createNotificationDispatcher(
  client: SupabaseClient,
  notificationService: NotificationService,
  config: DispatcherConfig = { defaultChannels: ["EMAIL", "IN_APP", "PUSH"] },
) {
  async function findTemplate(eventType: string, channel: NotificationChannel, language = "fr") {
    const { data, error } = await client
      .from("notification_templates")
      .select("subject, body, variables")
      .eq("school_id", null)
      .eq("event_type", eventType)
      .eq("channel", channel)
      .eq("language", language)
      .maybeSingle();
    if (error) throw new Error(`Template lookup failed: ${error.message}`);
    return data as { subject?: string; body: string; variables: string[] } | null;
  }

  async function resolveGuardians(studentId: string) {
    const { data, error } = await client
      .from("student_guardians")
      .select("id, profile_id, full_name, email, is_authorized_pickup")
      .eq("student_id", studentId)
      .eq("is_authorized_pickup", true);
    if (error) throw new Error(`Guardian lookup failed: ${error.message}`);
    const rows = (data ?? []) as { id: string; profile_id: string; full_name: string; email: string | null }[];
    const profileIds = rows.map((r) => r.profile_id).filter(Boolean);
    if (profileIds.length === 0) return [];
    const { data: profiles, error: profileError } = await client
      .from("profiles")
      .select("id, email")
      .in("id", profileIds);
    if (profileError) throw new Error(`Profile lookup failed: ${profileError.message}`);
    const emailByProfile = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string | null]));
    return rows.map((r) => ({ ...r, email: r.email ?? emailByProfile.get(r.profile_id) ?? null }));
  }

  function renderTemplate(template: { subject?: string; body: string }, variables: Record<string, string>) {
    const replacer = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? "");
    return { subject: template.subject ? replacer(template.subject) : undefined, body: replacer(template.body) };
  }

  return {
    async dispatch(event: SchoolSafeEvent & { id: string }): Promise<void> {
      const guardians = event.entityId ? await resolveGuardians(event.entityId) : [];
      if (guardians.length === 0) return;

      const variables: Record<string, string> = {};
      for (const [key, value] of Object.entries(event.payload)) {
        variables[key] = typeof value === "string" ? value : JSON.stringify(value);
      }

      for (const channel of config.defaultChannels) {
        const template = await findTemplate(event.type, channel);
        if (!template) continue;
        const rendered = renderTemplate(template, variables);

        for (const guardian of guardians) {
          const input: NotificationInput = {
            schoolId: event.schoolId,
            userId: guardian.profile_id,
            eventId: event.id,
            channel,
            templateKey: `${event.type}:${channel}:fr`,
            title: rendered.subject ?? `SchoolSafe — ${event.type}`,
            message: rendered.body,
            recipientEmail: channel === "EMAIL" ? guardian.email ?? undefined : undefined,
          };
          await notificationService.queue(input);
        }
      }
    },
  };
}
