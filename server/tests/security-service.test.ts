import { describe, expect, it } from "vitest";
import { parseQrPayload, signCardNumber } from "../src/security/service.js";

describe("Security QR helpers", () => {
  it("parses a valid SchoolSafe QR payload", () => {
    const payload = "schoolsafe://card/SS-SCH-MAT-123456789/abc123";
    const parsed = parseQrPayload(payload);
    expect(parsed).toEqual({ cardNumber: "SS-SCH-MAT-123456789", signature: "abc123" });
  });

  it("returns null for an invalid QR payload", () => {
    expect(parseQrPayload("not-a-schoolsafe-payload")).toBeNull();
    expect(parseQrPayload("schoolsafe://card/")).toBeNull();
    expect(parseQrPayload("")).toBeNull();
  });

  it("signs a card number consistently with the same secret", () => {
    const secret = "super-secret-key";
    const cardNumber = "SS-SCH-MAT-123456789";
    const sig1 = signCardNumber(cardNumber, secret);
    const sig2 = signCardNumber(cardNumber, secret);
    expect(sig1).toBe(sig2);
    expect(sig1.length).toBe(32);
  });

  it("produces different signatures for different secrets", () => {
    const cardNumber = "SS-SCH-MAT-123456789";
    const sigA = signCardNumber(cardNumber, "secret-a");
    const sigB = signCardNumber(cardNumber, "secret-b");
    expect(sigA).not.toBe(sigB);
  });
});
