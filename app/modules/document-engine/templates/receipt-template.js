// app/modules/document-engine/templates/receipt-template.js
// SchoolSafe receipt / payment receipt PDF template.
// Rendered through the abstract Document Engine (RenderContext), no direct jsPDF dependency.

import { formatDate, formatDateTime, formatCurrency } from "../file-policy.js";

const MM_TO_PT = 2.83465;
const A4_HEIGHT_PT = 297 * MM_TO_PT;
const HALF_A4_HEIGHT_PT = A4_HEIGHT_PT / 2;

export const receiptTemplate = {
  info: {
    type: "receipt",
    label: "Reçu de paiement",
    labelFr: "Reçu de paiement",
    labelEn: "Payment receipt",
    sourceModule: "finance",
    nature: "DOCUMENT",
    defaultFormats: ["pdf"],
    supportedFormats: ["pdf"],
    defaultLayout: "a5-receipt",
    permissions: ["finance.receipt.read"],
    templateVersion: "1.0.0",
    description: "Reçu de paiement A5 avec identité école, SchoolSafe, QR et signature.",
  },

  /**
   * @param {import("../render-context.js").RenderContext} ctx
   * @param {import("../contracts.js").DocumentModel} model
   * @param {import("../render-context.js").LayoutContext & { contentTop: number, contentBottom: number }} layout
   */
  async render(ctx, model, layout) {
    const { school, schoolsafe, content, meta } = model;
    const dims = ctx.getDimensions();

    const copyLabels = layout.isTwoUp
      ? ["Exemplaire établissement", "Exemplaire parent / payeur"]
      : [content.copyLabel || "Exemplaire établissement"];

    for (let i = 0; i < copyLabels.length; i++) {
      const yOffset = layout.isTwoUp ? i * HALF_A4_HEIGHT_PT : 0;
      await drawReceiptCopy(ctx, school, schoolsafe, content, meta, layout, copyLabels[i], yOffset);

      // Cut line between two-up copies.
      if (layout.isTwoUp && i === 0) {
        const cutY = HALF_A4_HEIGHT_PT;
        ctx.drawLine(layout.margins.left, cutY, dims.width - layout.margins.right, cutY, {
          color: "#b4b4b4",
          dash: [3 * MM_TO_PT, 3 * MM_TO_PT],
        });
      }
    }
  },
};

/**
 * Legacy helper kept for backward compatibility during migration.
 * It bypasses the engine facade and renders directly through RenderContext.
 * @param {object} identity
 * @param {object} payment
 * @param {string} receiptNumber
 * @param {{copyFor?:string}} [options]
 * @returns {Promise<import("jspdf").jsPDF>}
 */
export async function renderReceipt(identity, payment, receiptNumber, options = {}) {
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF) throw new Error("jsPDF not loaded");

  // Build a minimal DocumentModel so the template can render directly.
  const now = new Date().toISOString();
  const model = {
    meta: {
      reference: receiptNumber || "",
      version: 1,
      templateVersion: "1.0.0",
      status: "generated",
      origin: "generated",
      sensitivity: "confidential",
      authority: "preview",
      createdAt: now,
      generatedAt: now,
      sourceModule: "finance",
      documentType: "receipt",
      action: "download",
      formats: ["pdf"],
      author: { id: "", name: "", role: "" },
      schoolId: "",
      locale: "fr-FR",
      generatedBy: "frontend",
    },
    school: buildSchoolSnapshot(identity),
    schoolsafe: { name: "SchoolSafe", website: "", email: "", snapshotAt: now },
    content: { ...payment, receiptNumber, copyLabel: options.copyFor || "Exemplaire établissement" },
  };

  const twoUp = options.twoUp !== false; // Default matches legacy behaviour: two copies on A4.
  const layout = twoUp ? buildA4TwoUpLayout() : buildA5ReceiptLayout();
  const doc = new jsPDF({ unit: "pt", format: twoUp ? "a4" : [148 * MM_TO_PT, 210 * MM_TO_PT] });

  const { JspdfRenderContext } = await import("../adapters/jspdf-render-context.js");
  const ctx = new JspdfRenderContext(doc, layout);
  await receiptTemplate.render(ctx, model, { ...layout, contentTop: layout.margins.top + 28 * MM_TO_PT, contentBottom: layout.dimensions.height / (twoUp ? 2 : 1) - layout.margins.bottom - 12 * MM_TO_PT });

  return doc;
}

async function drawReceiptCopy(ctx, school, schoolsafe, content, meta, layout, copyLabel, yOffset) {
  const dims = ctx.getDimensions();
  const left = layout.margins.left;
  const right = dims.width - layout.margins.right;
  const width = right - left;

  // Header bar
  const headerHeight = 28 * MM_TO_PT;
  const primaryColor = school.primaryColor || "#071a3d";
  ctx.drawRect(0, yOffset, dims.width, headerHeight, { fill: primaryColor });

  // Logo (ratio preserved)
  let logoX = left + 5 * MM_TO_PT;
  if (school.logoUrl) {
    try {
      const logoBox = 16 * MM_TO_PT;
      await ctx.drawImage(school.logoUrl, logoX, yOffset + 5 * MM_TO_PT, logoBox, logoBox, { fit: "contain" });
      logoX += logoBox + 4 * MM_TO_PT;
    } catch {
      // ignore missing logo
    }
  }

  // School identity in header
  ctx.drawText(school.name, logoX, yOffset + 11 * MM_TO_PT, {
    fontSize: 14,
    fontStyle: "bold",
    color: "#ffffff",
    maxWidth: dims.width - logoX - right,
  });

  const contactParts = [school.address, school.city, school.phone, school.email, school.website].filter(Boolean);
  ctx.drawText(contactParts.join(" · "), logoX, yOffset + 21 * MM_TO_PT, {
    fontSize: 8,
    color: "#ffffff",
    maxWidth: dims.width - logoX - right,
  });

  // Title block
  const titleY = yOffset + headerHeight + 10 * MM_TO_PT;
  ctx.drawText("REÇU DE PAIEMENT", left, titleY, {
    fontSize: 16,
    fontStyle: "bold",
    color: primaryColor,
    maxWidth: width,
  });
  ctx.drawText(copyLabel, left, titleY + 6 * MM_TO_PT, {
    fontSize: 10,
    color: "#666666",
    maxWidth: width,
  });

  // Receipt metadata
  const metaX = right;
  const metaY = titleY;
  const refText = content.receiptNumber || meta.reference || "—";
  ctx.drawText(`N° ${refText}`, metaX, metaY, { fontSize: 9, color: "#505050", align: "right" });
  ctx.drawText(`Date : ${formatDateTime(content.paidAt || meta.generatedAt || meta.createdAt, meta.locale)}`, metaX, metaY + 5 * MM_TO_PT, { fontSize: 9, color: "#505050", align: "right" });
  if (school.activeAcademicYear) {
    ctx.drawText(`Année scolaire : ${school.activeAcademicYear.label}`, metaX, metaY + 10 * MM_TO_PT, { fontSize: 9, color: "#505050", align: "right" });
  }

  // Student identity block
  let y = titleY + 18 * MM_TO_PT;
  const student = content.student || {};
  ctx.drawText(`${student.firstName || ""} ${student.lastName || ""}`.trim() || "Élève", left, y, {
    fontSize: 12,
    fontStyle: "bold",
    color: "#000000",
    maxWidth: width,
  });
  y += 5 * MM_TO_PT;
  ctx.drawText(`Matricule : ${student.matricule || "—"}`, left, y, { fontSize: 9, color: "#3c3c3c", maxWidth: width });
  y += 5 * MM_TO_PT;
  ctx.drawText(`Classe : ${student.className || "—"}`, left, y, { fontSize: 9, color: "#3c3c3c", maxWidth: width });

  // Payment block
  y += 8 * MM_TO_PT;
  const paymentLeft = left;
  const paymentWidth = width * 0.55;
  y = drawPaymentRows(ctx, content, paymentLeft, y, paymentWidth);

  // QR / verification block
  const qrY = titleY + 18 * MM_TO_PT;
  const verificationCode = content.verificationCode || "";
  if (verificationCode) {
    const qrSize = 18 * MM_TO_PT;
    const qrX = right - qrSize;
    await ctx.drawQR(verificationCode, qrX, qrY, 18, { margin: 1 });
    // Verification text sits below the QR and can extend leftwards to avoid wrapping.
    const verifyMaxWidth = Math.min(qrSize + 16 * MM_TO_PT, width * 0.42);
    ctx.drawText(`Vérification : ${verificationCode}`, right, qrY + qrSize + 3 * MM_TO_PT, {
      fontSize: 6.5,
      color: "#646464",
      align: "right",
      maxWidth: verifyMaxWidth,
    });
  }

  // Signature block
  const sigY = Math.max(y, qrY + 30 * MM_TO_PT);
  drawSignatureBlock(ctx, ["Caisse", "Parent / Payeur"], left, sigY, width);

  // Footer
  const footerY = yOffset + dims.height / (layout.isTwoUp ? 2 : 1) - 12 * MM_TO_PT;
  ctx.drawLine(left, footerY - 2 * MM_TO_PT, right, footerY - 2 * MM_TO_PT, { color: "#cccccc" });

  const footerParts = [school.name, school.address, school.city, school.phone, school.email].filter(Boolean);
  ctx.drawText(footerParts.join(" · "), dims.width / 2, footerY, {
    fontSize: 8,
    color: "#3c3c3c",
    align: "center",
    maxWidth: width,
  });

  const generatedAt = meta.generatedAt || meta.createdAt;
  const schoolSafeLine = `Document généré par ${schoolsafe.name || "SchoolSafe"} — ${formatDate(generatedAt, meta.locale)}`;
  ctx.drawText(schoolSafeLine, dims.width / 2, footerY + 5 * MM_TO_PT, {
    fontSize: 7,
    color: "#787878",
    align: "center",
    maxWidth: width,
  });
}

function drawPaymentRows(ctx, payment, x, y, maxWidth) {
  const lineHeight = 5 * MM_TO_PT;
  let cy = y;

  const rows = [
    ["Type de frais", payment.feeLabel || "—"],
    ["Période concernée", payment.period || "—"],
    ["Montant attendu", formatCurrency(payment.amountExpected, payment.currency)],
    ["Montant payé", formatCurrency(payment.amountPaid, payment.currency), true],
    ["Solde", formatCurrency(payment.remaining, payment.currency)],
    ["Mode de paiement", payment.paymentMode || "—"],
    ["Caissier", payment.cashierName || "—"],
    ["Référence", payment.reference || "—"],
    ["Date", formatDateTime(payment.paidAt, "fr-FR")],
  ];

  const gap = maxWidth * 0.05;
  const labelWidth = maxWidth * 0.45;
  const valueWidth = maxWidth * 0.50;
  const valueX = x + maxWidth; // right-aligned value block ends at the right edge of the payment area

  for (const [label, value, highlight] of rows) {
    const valueStr = String(value ?? "—");
    ctx.drawText(label, x, cy, { fontSize: 9, color: "#3c3c3c", maxWidth: labelWidth });
    ctx.drawText(valueStr, valueX, cy, {
      fontSize: 9,
      fontStyle: highlight ? "bold" : "normal",
      color: highlight ? "#000000" : "#1e1e1e",
      maxWidth: valueWidth,
      align: "right",
    });
    // Advance by the estimated wrapped line count so long values (e.g. reference) do not overlap the next row.
    const valueLines = estimateLines(valueStr, valueWidth, 9);
    cy += lineHeight * valueLines;
  }

  return cy;
}

function estimateLines(text, maxWidth, fontSize) {
  if (!maxWidth || !text) return 1;
  // Approximate average character width for Helvetica at the given font size (in pt).
  const avgCharWidthPt = fontSize * 0.55;
  const charsPerLine = Math.max(1, Math.floor(maxWidth / avgCharWidthPt));
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

function drawSignatureBlock(ctx, labels, x, y, width) {
  const count = labels.length;
  const gap = width / count;
  let cx = x;

  for (const label of labels) {
    ctx.drawText(label, cx, y, { fontSize: 8, color: "#505050", maxWidth: gap - 5 * MM_TO_PT });
    ctx.drawLine(cx, y + 2 * MM_TO_PT, cx + gap - 5 * MM_TO_PT, y + 2 * MM_TO_PT, { color: "#505050" });
    cx += gap;
  }
}

function buildSchoolSnapshot(identity) {
  return {
    name: identity.name || "",
    legalName: identity.legalName || identity.name || "",
    address: identity.address || null,
    city: identity.city || null,
    province: identity.province || null,
    country: identity.country || null,
    phone: identity.phone || null,
    email: identity.email || null,
    website: identity.website || null,
    primaryColor: identity.primaryColor || "#071a3d",
    accentColor: identity.accentColor || "#e9a515",
    logoUrl: identity.logoUrl || null,
    documentFooter: identity.documentFooter || null,
    officialSealUrl: identity.officialSealUrl || null,
    currency: identity.currency || "USD",
    bankName: identity.bankName || null,
    bankAccount: identity.bankAccount || null,
    taxId: identity.taxId || null,
    directorName: identity.directorName || null,
    directorSignatureUrl: identity.directorSignatureUrl || null,
    activeAcademicYear: identity.activeAcademicYear || null,
    activeCycles: identity.activeCycles || [],
    snapshotAt: new Date().toISOString(),
  };
}

function buildA4TwoUpLayout() {
  return {
    name: "a4-two-up-a5",
    dimensions: { width: 210 * MM_TO_PT, height: 297 * MM_TO_PT, unit: "pt" },
    margins: { top: 10 * MM_TO_PT, right: 10 * MM_TO_PT, bottom: 10 * MM_TO_PT, left: 10 * MM_TO_PT },
    isTwoUp: true,
  };
}

function buildA5ReceiptLayout() {
  return {
    name: "a5-receipt",
    dimensions: { width: 148 * MM_TO_PT, height: 210 * MM_TO_PT, unit: "pt" },
    margins: { top: 10 * MM_TO_PT, right: 10 * MM_TO_PT, bottom: 12 * MM_TO_PT, left: 10 * MM_TO_PT },
    isTwoUp: false,
  };
}
