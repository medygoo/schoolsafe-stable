import { describe, expect, it, vi } from "vitest";
import {
  extractBearerToken,
  verifyBearerAuthorization,
  type AuthVerifier,
} from "../src/auth/session.js";

describe("server auth session", () => {
  it("extracts only a Bearer token", () => {
    expect(extractBearerToken("Bearer token-123")).toBe("token-123");
    expect(() => extractBearerToken(undefined)).toThrow(/authorization/i);
    expect(() => extractBearerToken("Basic abc")).toThrow(/bearer/i);
  });

  it("accepts identity only from the verifier, never from caller role data", async () => {
    const verifier: AuthVerifier = {
      verify: vi.fn().mockResolvedValue({ userId: "auth-user-1", email: "user@test.local" }),
    };

    const session = await verifyBearerAuthorization("Bearer signed-token", verifier);

    expect(verifier.verify).toHaveBeenCalledWith("signed-token");
    expect(session).toEqual({ userId: "auth-user-1", email: "user@test.local", token: "signed-token" });
    expect(session).not.toHaveProperty("role");
    expect(session).not.toHaveProperty("profileId");
  });

  it("rejects an invalid or expired token", async () => {
    const verifier: AuthVerifier = { verify: vi.fn().mockResolvedValue(null) };
    await expect(verifyBearerAuthorization("Bearer expired-token", verifier)).rejects.toThrow(/invalid|expired/i);
  });
});
