// RFC 8785 JSON Canonicalization Scheme (JCS) subset for SignedLicenseV1 payload.
// Deterministic key ordering + primitive serialization matching Activation Service V1.
// This implementation covers the exact fields of LicensePayloadV1 and rejects
// unsupported types to prevent silent canonicalization drift.

export function canonicalizePayloadV1(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("CANONICALIZE_UNSUPPORTED_NUMBER");
    // RFC 8785: numbers serialized as ES6 Number.toString() equivalent
    // For integers and typical timestamps, this matches JSON.stringify
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalizePayloadV1(item));
    return `[${items.join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalizePayloadV1((value as Record<string, unknown>)[key])}`);
    return `{${pairs.join(",")}}`;
  }
  throw new Error("CANONICALIZE_UNSUPPORTED_TYPE");
}