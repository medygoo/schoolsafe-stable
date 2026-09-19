import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  createSupabaseAuthVerifier,
  createUserContextClient,
} from "../src/auth/supabase.js";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createClient);

describe("Supabase server auth adapter", () => {
  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  it("verifies bearer tokens with Supabase Auth getUser(token)", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "auth-user-7", email: "teacher@test.local" } },
      error: null,
    });
    mockedCreateClient.mockReturnValue({ auth: { getUser } } as never);

    const verifier = createSupabaseAuthVerifier("https://test.supabase.co", "public-anon-key");
    const identity = await verifier.verify("signed-token");

    expect(getUser).toHaveBeenCalledWith("signed-token");
    expect(identity).toEqual({ userId: "auth-user-7", email: "teacher@test.local" });
  });

  it("returns null when Supabase rejects the token", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    mockedCreateClient.mockReturnValue({ auth: { getUser } } as never);

    const verifier = createSupabaseAuthVerifier("https://test.supabase.co", "public-anon-key");
    await expect(verifier.verify("expired-token")).resolves.toBeNull();
  });

  it("creates a user-context database client with the same bearer token", () => {
    mockedCreateClient.mockReturnValue({ marker: "user-client" } as never);

    createUserContextClient("https://test.supabase.co", "public-anon-key", "signed-token");

    expect(mockedCreateClient).toHaveBeenCalledWith(
      "https://test.supabase.co",
      "public-anon-key",
      expect.objectContaining({
        global: { headers: { Authorization: "Bearer signed-token" } },
        auth: expect.objectContaining({ persistSession: false, autoRefreshToken: false }),
      }),
    );
  });
});
