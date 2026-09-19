// app/modules/document-engine/signature-block.js
import { MM_TO_PT } from "./print-layout.js";

export function renderSignatureBlock(doc, lines, x, y, width) {
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "normal");

  let cx = x;
  const count = lines.length;
  const gap = width / count;

  for (const label of lines) {
    doc.text(label, cx, y);
    doc.line(cx, y + 2 * MM_TO_PT, cx + gap - 5 * MM_TO_PT, y + 2 * MM_TO_PT);
    cx += gap;
  }
}
