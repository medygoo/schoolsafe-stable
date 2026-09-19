import { describe, it, expect, vi } from "vitest";
import { createNotificationDispatcher } from "../../src/notifications/dispatcher.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationService } from "../../src/notifications/types.js";

function makeClient() {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "notification_templates") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { subject: "Entrée", body: "{{student_name}} est arrivé(e) à {{time}}.", variables: ["student_name", "time"] },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "student_guardians") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: "guardian-1", profile_id: "profile-1", full_name: "Marie", email: "marie@example.com", is_authorized_pickup: true },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: "profile-1", email: "marie@example.com" }],
              error: null,
            }),
          }),
        };
      }
      return { select: vi.fn() };
    }),
  } as unknown as SupabaseClient;
}

describe("NotificationDispatcher", () => {
  it("queues notifications for each guardian and configured channel", async () => {
    const queued: unknown[] = [];
    const notificationService: NotificationService = {
      queue: vi.fn().mockImplementation(async (input) => {
        queued.push(input);
        return { id: "notif-x", status: "SENT" };
      }),
    };
    const dispatcher = createNotificationDispatcher(makeClient(), notificationService);
    await dispatcher.dispatch({
      id: "evt-1",
      type: "STUDENT_ENTERED",
      schoolId: "school-1",
      entityType: "student",
      entityId: "student-1",
      payload: { student_name: "Grâce Kabamba", time: "07:22" },
    });
    expect(queued.length).toBeGreaterThan(0);
    expect(queued.some((n: any) => n.channel === "EMAIL")).toBe(true);
    expect(queued.some((n: any) => n.channel === "IN_APP")).toBe(true);
  });
});
