import { describe, it, expect, vi } from "vitest";
import { createEventService } from "../../src/events/service.js";
import type { SupabaseClient } from "@supabase/supabase-js";

function makeClient(insertResult: { id: string; status: string }) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("createEventService", () => {
  it("inserts a pending system event", async () => {
    const client = makeClient({ id: "evt-1", status: "pending" });
    const service = createEventService(client);
    const result = await service.emit({
      type: "STUDENT_ENTERED",
      schoolId: "school-1",
      entityType: "student",
      entityId: "student-1",
      payload: { studentName: "Grâce Kabamba" },
    });
    expect(result.id).toBe("evt-1");
    expect(result.status).toBe("pending");
  });
});
