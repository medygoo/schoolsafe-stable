// app/modules/document-engine/templates/answer-sheet-template.js
// Answer sheet PDF for SchoolSafe assignments.

import { formatDate } from "../file-policy.js";

const MM_TO_PT = 2.83465;
const LINE_HEIGHT = 8 * MM_TO_PT;

export const answerSheetTemplate = {
  info: {
    type: "answer-sheet",
    label: "Feuille de réponses",
    labelFr: "Feuille de réponses",
    labelEn: "Answer sheet",
    sourceModule: "pedagogy",
    nature: "DOCUMENT",
    defaultFormats: ["pdf"],
    supportedFormats: ["pdf"],
    defaultLayout: "a4-portrait",
    permissions: ["pedagogy.assignment.read", "pedagogy.assignment.manage"],
    templateVersion: "1.0.0",
    description: "Feuille de réponses vierge pour un devoir.",
  },

  /**
   * @param {import("../render-context.js").RenderContext} ctx
   * @param {import("../contracts.js").DocumentModel} model
   * @param {import("../render-context.js").LayoutContext & { contentTop: number, contentBottom: number }} layout
   */
  async render(ctx, model, layout) {
    const { school, schoolsafe, content, meta } = model;
    const dims = ctx.getDimensions();
    const left = layout.margins.left;
    const right = dims.width - layout.margins.right;
    const width = right - left;
    let y = layout.contentTop;

    // Title
    y += 8 * MM_TO_PT;
    ctx.drawText("FEUILLE DE RÉPONSES", left, y, {
      fontSize: 16,
      fontStyle: "bold",
      color: school.primaryColor || "#071a3d",
      maxWidth: width,
    });
    y += 10 * MM_TO_PT;

    // Student info fields
    const fields = [
      { label: "Nom", value: content.studentLastName || "" },
      { label: "Prénom", value: content.studentFirstName || "" },
      { label: "Classe", value: content.className || "" },
      { label: "Matière", value: content.subjectName || "" },
      { label: "Titre du devoir", value: content.title || "" },
      { label: "Date", value: formatDate(content.dueDate || meta.createdAt, meta.locale) },
    ];

    for (const field of fields) {
      ctx.drawText(`${field.label} :`, left, y, { fontSize: 10, fontStyle: "bold" });
      ctx.drawLine(left + 35 * MM_TO_PT, y + 1 * MM_TO_PT, right, y + 1 * MM_TO_PT, { color: "#888888" });
      if (field.value) {
        ctx.drawText(field.value, left + 36 * MM_TO_PT, y - 1 * MM_TO_PT, { fontSize: 10, maxWidth: width - 36 * MM_TO_PT });
      }
      y += 10 * MM_TO_PT;
    }

    y += 6 * MM_TO_PT;

    // Answer lines
    ctx.drawText("Rédigez vos réponses ci-dessous :", left, y, { fontSize: 10, fontStyle: "bold" });
    y += 8 * MM_TO_PT;

    while (y + LINE_HEIGHT <= layout.contentBottom) {
      ctx.drawLine(left, y, right, y, { color: "#cccccc" });
      y += LINE_HEIGHT;
    }

    // Footer SchoolSafe identity
    const footerY = dims.height - layout.margins.bottom - 6 * MM_TO_PT;
    ctx.drawText(schoolsafe.name || "SchoolSafe", left, footerY, { fontSize: 7, color: "#888888" });
  },
};
