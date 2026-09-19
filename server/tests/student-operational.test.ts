import { describe, expect, it, vi } from "vitest";
import { assertStudentOperational } from "../src/students/operational.js";

describe("central student operational guard", () => {
  it("accepts an active student with a coherent active enrollment projection", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };
    await expect(assertStudentOperational(client as never, "student-active")).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith("is_student_operational", { student_id: "student-active" });
  });

  it("rejects a draft before an operational module can consume it", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) };
    await expect(assertStudentOperational(client as never, "student-draft")).rejects.toMatchObject({
      code: "STUDENT_NOT_OPERATIONAL",
      statusCode: 409,
    });
  });
});
