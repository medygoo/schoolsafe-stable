// app/modules/document-engine/document-footer.js
import { A4_WIDTH_PT, HALF_A4_HEIGHT_PT, MM_TO_PT, formatDate } from "./print-layout.js";

/**
 * @param {import("jspdf").jsPDF} doc
 * @param {import("./school-identity-provider.js").SchoolIdentity} identity
 * @param {{page?:number,totalPages?:number,generatedAt?:Date,yOffset?:number}} [options]
 */
export function renderDocumentFooter(doc, identity, options = {}) {
  const { page = doc.internal.getNumberOfPages(), totalPages = page, generatedAt = new Date(), yOffset = 0 } = options;
  const footerY = yOffset + HALF_A4_HEIGHT_PT - 12 * MM_TO_PT;

  // Horizontal line
  doc.setDrawColor(200, 200, 200);
  doc.line(15 * MM_TO_PT, footerY - 2 * MM_TO_PT, A4_WIDTH_PT - 15 * MM_TO_PT, footerY - 2 * MM_TO_PT);

  // School info (primary)
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const parts = [identity.name, identity.address, identity.city, identity.phone, identity.email, identity.website].filter(Boolean);
  const footerMaxWidth = A4_WIDTH_PT - 30 * MM_TO_PT;
  doc.text(parts.join(" · "), A4_WIDTH_PT / 2, footerY, { align: "center", maxWidth: footerMaxWidth });

  // Page number
  doc.text(`Page ${page} / ${totalPages}`, A4_WIDTH_PT - 15 * MM_TO_PT, footerY + 4 * MM_TO_PT, { align: "right" });

  // Document date
  doc.text(formatDate(generatedAt), 15 * MM_TO_PT, footerY + 4 * MM_TO_PT, { align: "left" });

  // SchoolSafe branding (secondary) — always present; custom documentFooter is prepended when set
  const schoolSafeText = `Document généré par SchoolSafe — ${formatDate(generatedAt)}`;
  const footerText = identity.documentFooter ? `${identity.documentFooter} · ${schoolSafeText}` : schoolSafeText;
  doc.setTextColor(120, 120, 120);
  doc.setFontSize(7);
  doc.text(footerText, A4_WIDTH_PT / 2, footerY + 5 * MM_TO_PT, { align: "center", maxWidth: footerMaxWidth });
}
