// app/modules/document-engine/file-policy.js
// Centralized file naming, reference, version, locale, date, currency and number conventions.

export function buildFilename({ documentType, reference, version, locale, format }) {
  const ext = format === "xlsx" ? "xlsx" : format;
  const ref = sanitizeReference(reference || "NO-REF");
  const loc = sanitizeLocale(locale || "fr-FR");
  return `${documentType}_${ref}_v${version}_${loc}.${ext}`;
}

export function buildReference({ prefix, year, number }) {
  const y = year || new Date().getFullYear();
  const n = String(number || 0).padStart(5, "0");
  return `${prefix}-${y}-${n}`;
}

export function parseReference(reference) {
  const match = reference.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
  if (!match) return null;
  return { prefix: match[1], year: parseInt(match[2], 10), number: parseInt(match[3], 10) };
}

export function formatDate(isoString, locale = "fr-FR", options = {}) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  }).format(d);
}

export function formatDateTime(isoString, locale = "fr-FR") {
  if (!isoString) return "-";
  const d = new Date(isoString);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatCurrency(amount, currency = "USD", locale = "fr-FR") {
  const value = Number(amount) || 0;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

export function formatNumber(value, locale = "fr-FR", options = {}) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat(locale, options).format(n);
}

export function formatPageNumber(page, totalPages, locale = "fr-FR") {
  if (locale.startsWith("en")) {
    return `Page ${page} of ${totalPages}`;
  }
  return `Page ${page} / ${totalPages}`;
}

export function sanitizeReference(reference) {
  return String(reference)
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\-]/g, "")
    .toUpperCase();
}

export function sanitizeLocale(locale) {
  return String(locale).replace(/[^a-zA-Z0-9\-]/g, "").toLowerCase();
}

export function sanitizeFilename(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\.\-]/g, "_")
    .toLowerCase();
}

export const REFERENCE_PREFIXES = Object.freeze({
  RECEIPT: "REC",
  INVOICE: "INV",
  REPORT_CARD: "BUL",
  STUDENT_CARD: "CARD",
  BADGE: "BADGE",
  PAYROLL: "PAY",
  REPORT: "RPT",
  ATTESTATION: "ATT",
  CONVOCATION: "CONV",
  HOMEWORK: "HW",
});
