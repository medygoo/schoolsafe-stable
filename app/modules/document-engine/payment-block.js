// app/modules/document-engine/payment-block.js
import { MM_TO_PT, formatCurrency, formatDate } from "./print-layout.js";

export function renderPaymentBlock(doc, payment, x, y, maxWidth) {
  const lineHeight = 5 * MM_TO_PT;
  let cy = y;

  function row(label, value, highlight = false) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const labelMaxWidth = maxWidth * 0.55 - 2 * MM_TO_PT;
    doc.text(label, x, cy, { maxWidth: labelMaxWidth });

    const valueX = x + maxWidth * 0.55;
    const valueMaxWidth = maxWidth * 0.45 - 2 * MM_TO_PT;
    doc.setFont("helvetica", highlight ? "bold" : "normal");
    doc.setTextColor(highlight ? 0 : 30, highlight ? 0 : 30, highlight ? 0 : 30);
    doc.text(String(value), valueX, cy, { maxWidth: valueMaxWidth });
    cy += lineHeight;
  }

  row("Type de frais", payment.feeLabel || "-");
  row("Période concernée", payment.period || "-");
  row("Montant attendu", formatCurrency(payment.amountExpected, payment.currency));
  row("Montant payé", formatCurrency(payment.amountPaid, payment.currency), true);
  row("Solde", formatCurrency(payment.remaining, payment.currency));
  row("Mode de paiement", payment.paymentMode || "-");
  row("Caissier", payment.cashierName || "-");
  row("Référence", payment.reference || "-");
  row("Date", formatDate(payment.paidAt ? new Date(payment.paidAt) : new Date()));

  return cy;
}
