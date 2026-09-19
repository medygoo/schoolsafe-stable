import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import type { SecurityService } from "../../src/security/service.js";
import type { AccessService } from "../../src/access/service.js";
import type { EventService } from "../../src/events/service.js";
import type { NotificationService } from "../../src/notifications/types.js";

const mockAccess: AccessService = {
  hasPermission: vi.fn().mockResolvedValue(true),
  hasScope: vi.fn().mockResolvedValue(true),
};

const mockResolve = async (token: string) =>
  token === "valid-token" ? { profileId: "profile-1", schoolId: "school-1" } : { profileId: null, schoolId: null };

describe("Integration: scan emits event and creates notifications", () => {
  it("calls eventService.emit on scan", async () => {
    const emit = vi.fn().mockResolvedValue({ id: "evt-1", status: "pending" });
    const eventService: EventService = { emit };
    const queue = vi.fn().mockResolvedValue({ id: "notif-1", status: "SENT" });
    const notificationService: NotificationService = { queue };

    const securityService: SecurityService = {
      async scan(input) {
        await eventService.emit({
          type: input.event_type === "entry" ? "STUDENT_ENTERED" : "STUDENT_EXITED",
          schoolId: "school-1",
          entityType: "student",
          entityId: "student-1",
          userId: input.scanned_by,
          payload: { student_name: "Grâce Kabamba" },
        });
        return {
          decision: "allowed",
          student: { id: "student-1", matricule: "MAT-001", first_name: "Grâce", last_name: "Kabamba", class_name: "4e", photo_path: null },
          authorized_persons: [],
          event: { id: "evt-1", event_type: input.event_type, decision: "allowed", occurred_at: new Date().toISOString() },
        };
      },
      async createCard() { return { card_number: "x", signature: "y" }; },
      async setLockdown(active) { return { active, activated_at: null, activated_by: null }; },
      async listEvents() { return { data: [], count: 0 }; },
    };

    const app = buildApp({
      security: { service: securityService, resolveProfileAndSchool: mockResolve, access: mockAccess, eventService },
    });

    const res = await app.inject({
      method: "POST",
      url: "/security/scan",
      headers: { authorization: "Bearer valid-token" },
      payload: { qr_payload: "schoolsafe://card/X/Y", event_type: "entry", location_id: "550e8400-e29b-41d4-a716-446655440000" },
    });

    expect(res.statusCode).toBe(200);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: "STUDENT_ENTERED" }));
  });
});
