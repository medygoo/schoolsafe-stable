import { describe, expect, it, vi } from "vitest";
import { createStudentsService } from "../src/students/service.js";

const SCHOOL_ID = "10000000-0000-0000-0000-000000000001";
const PROFILE_ID = "50000000-0000-0000-0000-000000000001";
const STUDENT_ID = "60000000-0000-0000-0000-000000000001";
const PARENT_ID = "50000000-0000-0000-0000-000000000002";
const YEAR_ID = "70000000-0000-0000-0000-000000000001";
const CLASS_ID = "80000000-0000-0000-0000-000000000001";

function invitedPayload() {
  return {
    matricule: "B1-SVC-001",
    first_name: "Amina",
    last_name: "Mbuyi",
    academic_year_id: YEAR_ID,
    planned_class_id: CLASS_ID,
    enrollment_starts_on: "2026-09-01",
    primary_parent: {
      mode: "invite" as const,
      email: "parent.b1@example.test",
      first_name: "Sarah",
      last_name: "Mbuyi",
      guardian_type: "mere" as const,
    },
  };
}

function rpcClient(handler: (name: string, args: Record<string, unknown>) => unknown) {
  return { rpc: vi.fn(handler) };
}

describe("B1 students service", () => {
  it("stores only a SHA-256 invitation hash and never returns the clear token", async () => {
    let rawToken = "";
    const client = rpcClient(async (name, args) => {
      expect(name).toBe("create_student_draft");
      const hash = String(args.p_invitation_token_hash);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).not.toBe(rawToken);
      return {
        data: {
          id: STUDENT_ID,
          lifecycle_status: "draft",
          class_id: null,
          enrollment_status: "draft",
          parent: { id: PARENT_ID, account_status: "pending_activation" },
        },
        error: null,
      };
    });
    const delivery = vi.fn(async (input: { token: string }) => {
      rawToken = input.token;
    });
    const service = createStudentsService(client as never, () => client as never, { deliver: delivery });

    const result = await service.createDraft(SCHOOL_ID, PROFILE_ID, invitedPayload());

    expect(delivery).toHaveBeenCalledWith(expect.objectContaining({ email: "parent.b1@example.test" }));
    expect(rawToken.length).toBeGreaterThanOrEqual(32);
    expect(JSON.stringify(result)).not.toContain(rawToken);
    expect(JSON.stringify(client.rpc.mock.calls[0])).not.toContain(rawToken);
  });

  it("compensates the complete draft creation when invitation delivery fails", async () => {
    const client = rpcClient(async (name) => {
      if (name === "create_student_draft") {
        return {
          data: {
            id: STUDENT_ID,
            lifecycle_status: "draft",
            class_id: null,
            enrollment_status: "draft",
            parent: { id: PARENT_ID, account_status: "pending_activation" },
          },
          error: null,
        };
      }
      if (name === "compensate_student_draft_creation") return { data: true, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    });
    const service = createStudentsService(client as never, () => client as never, {
      deliver: vi.fn().mockRejectedValue(new Error("SMTP unavailable")),
    });

    await expect(service.createDraft(SCHOOL_ID, PROFILE_ID, invitedPayload())).rejects.toThrow("SMTP unavailable");
    expect(client.rpc).toHaveBeenNthCalledWith(2, "compensate_student_draft_creation", {
      p_student_id: STUDENT_ID,
      p_actor_profile_id: PROFILE_ID,
    });
  });

  it("does not generate or deliver an invitation for an existing parent", async () => {
    const client = rpcClient(async (_name, args) => {
      expect(args.p_existing_parent_profile_id).toBe(PARENT_ID);
      expect(args.p_invitation_token_hash).toBeNull();
      return {
        data: {
          id: STUDENT_ID,
          lifecycle_status: "draft",
          class_id: null,
          enrollment_status: "draft",
          parent: { id: PARENT_ID, account_status: "active" },
        },
        error: null,
      };
    });
    const delivery = vi.fn();
    const service = createStudentsService(client as never, () => client as never, { deliver: delivery });

    await service.createDraft(SCHOOL_ID, PROFILE_ID, {
      ...invitedPayload(),
      primary_parent: { mode: "existing", profile_id: PARENT_ID, guardian_type: "mere" },
    });

    expect(delivery).not.toHaveBeenCalled();
  });
});
