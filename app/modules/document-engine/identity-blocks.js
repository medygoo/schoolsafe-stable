// app/modules/document-engine/identity-blocks.js
import { MM_TO_PT } from "./print-layout.js";

export function renderSchoolIdentityBlock(doc, identity, x, y, maxWidth) {
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(identity.legalName || identity.name, x, y);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  let cy = y + 4 * MM_TO_PT;
  const lines = [
    [identity.address, identity.city, identity.province].filter(Boolean).join(", "),
    identity.phone,
    identity.email,
    identity.website,
  ].filter(Boolean);
  for (const line of lines) {
    doc.text(line, x, cy, { maxWidth });
    cy += 3.5 * MM_TO_PT;
  }
  return cy;
}

export function renderStudentIdentityBlock(doc, student, x, y) {
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`${student.firstName || ""} ${student.lastName || ""}`.trim(), x, y);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const lines = [
    `Matricule : ${student.matricule || "-"}`,
    `Classe : ${student.className || "-"}`,
  ];
  let cy = y + 4 * MM_TO_PT;
  for (const line of lines) {
    doc.text(line, x, cy);
    cy += 3.5 * MM_TO_PT;
  }
  return cy;
}

export function renderParentIdentityBlock(doc, parent, x, y) {
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(parent.fullName || "", x, y);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const line = [parent.guardianType, parent.phone].filter(Boolean).join(" · ");
  doc.text(line, x, y + 3.5 * MM_TO_PT);
}
