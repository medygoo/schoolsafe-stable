import { createHash } from "node:crypto";

export function normalizeSql(bytes) {
  return Buffer.from(bytes).toString("utf8").replace(/\r\n?/g, "\n");
}

export function sha256Sql(bytes) {
  return createHash("sha256").update(normalizeSql(bytes), "utf8").digest("hex");
}
