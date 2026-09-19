// app/modules/document-engine/print-layout.js
export const MM_TO_PT = 2.83465;
export const A4_WIDTH_PT = 210 * MM_TO_PT;   // 595.28
export const A4_HEIGHT_PT = 297 * MM_TO_PT;  // 841.89
export const HALF_A4_HEIGHT_PT = A4_HEIGHT_PT / 2;

export const MARGINS = {
  top: 15 * MM_TO_PT,
  right: 15 * MM_TO_PT,
  bottom: 20 * MM_TO_PT,
  left: 15 * MM_TO_PT,
};

export function formatDate(date = new Date(), locale = "fr-FR") {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatCurrency(amount, currency = "USD", locale = "fr-FR") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(amount) || 0);
}

export function formatNumber(value, locale = "fr-FR") {
  return new Intl.NumberFormat(locale).format(Number(value) || 0);
}
