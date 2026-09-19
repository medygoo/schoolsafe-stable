// app/modules/document-engine/templates/assignment-template.js
// SchoolSafe assignment / homework / quiz PDF template.

import { formatDate } from "../file-policy.js";

const MM_TO_PT = 2.83465;

export const assignmentTemplate = {
  info: {
    type: "assignment",
    label: "Devoir / Interrogation",
    labelFr: "Devoir / Interrogation",
    labelEn: "Homework / Quiz",
    sourceModule: "pedagogy",
    nature: "DOCUMENT",
    defaultFormats: ["pdf"],
    supportedFormats: ["pdf"],
    defaultLayout: "a4-portrait",
    permissions: ["pedagogy.assignment.read", "pedagogy.assignment.manage"],
    templateVersion: "1.0.0",
    description: "Sujet de devoir avec identité école, consignes et questions numérotées.",
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
    ctx.drawText(content.title || meta.documentType, left, y, {
      fontSize: 18,
      fontStyle: "bold",
      color: school.primaryColor || "#071a3d",
      maxWidth: width,
    });
    y += 10 * MM_TO_PT;

    // Meta block
    const metaLines = [
      `Matière : ${content.subjectName || "-"}`,
      `Classe : ${content.className || "-"}`,
      `Enseignant : ${content.teacherName || "-"}`,
      `Date : ${formatDate(content.dueDate || meta.createdAt, meta.locale)}`,
      `Type : ${translateType(content.type, meta.locale)}`,
    ];
    if (content.scaleLabel) metaLines.push(`Barème : ${content.scaleLabel}`);
    if (content.coefficient) metaLines.push(`Coefficient : ${content.coefficient}`);

    for (const line of metaLines) {
      ctx.drawText(line, left, y, { fontSize: 10, maxWidth: width });
      y += 5 * MM_TO_PT;
    }
    y += 4 * MM_TO_PT;

    // Instructions
    if (content.instructions) {
      ctx.drawText("Consignes", left, y, { fontSize: 12, fontStyle: "bold", color: school.primaryColor || "#071a3d" });
      y += 6 * MM_TO_PT;
      y = drawWrappedText(ctx, content.instructions, left, y, width, { fontSize: 10, lineHeight: 5 * MM_TO_PT });
      y += 4 * MM_TO_PT;
    }

    // Questions
    if (Array.isArray(content.questions) && content.questions.length > 0) {
      ctx.drawText("Questions", left, y, { fontSize: 12, fontStyle: "bold", color: school.primaryColor || "#071a3d" });
      y += 8 * MM_TO_PT;

      for (let i = 0; i < content.questions.length; i++) {
        const q = content.questions[i];
        const questionHeight = estimateQuestionHeight(ctx, q, width);

        if (y + questionHeight > layout.contentBottom) {
          ctx.addPage();
          y = layout.contentTop;
        }

        const questionText = `${i + 1}. ${q.text || ""}`;
        ctx.drawText(questionText, left, y, { fontSize: 11, fontStyle: "bold", maxWidth: width });
        y += 6 * MM_TO_PT;

        if (q.points !== undefined && q.points !== null) {
          ctx.drawText(`(${q.points} ${q.points > 1 ? "points" : "point"})`, left, y, { fontSize: 9, color: "#666666" });
          y += 5 * MM_TO_PT;
        }

        if (q.answerSpace) {
          ctx.drawText(`Espace de réponse : ${q.answerSpace}`, left, y, { fontSize: 9, color: "#888888" });
          y += 5 * MM_TO_PT;
        }

        // Choices for QCM
        if (Array.isArray(q.choices) && q.choices.length > 0) {
          for (let j = 0; j < q.choices.length; j++) {
            const choice = q.choices[j];
            const letter = String.fromCharCode(97 + j); // a, b, c...
            ctx.drawText(`${letter}) ${choice}`, left + 5 * MM_TO_PT, y, { fontSize: 10, maxWidth: width - 10 * MM_TO_PT });
            y += 5 * MM_TO_PT;
          }
        }

        y += 6 * MM_TO_PT;
      }
    }

    // Footer SchoolSafe identity (secondary)
    const footerY = dims.height - layout.margins.bottom - 6 * MM_TO_PT;
    ctx.drawText(schoolsafe.name || "SchoolSafe", left, footerY, { fontSize: 7, color: "#888888" });
  },
};

function translateType(type, locale) {
  if (locale && locale.startsWith("en")) {
    const map = { homework: "Homework", quiz: "Quiz", exam: "Exam", compensatory: "Compensatory activity" };
    return map[type] || type;
  }
  const map = { homework: "Devoir", quiz: "Interrogation", exam: "Examen", compensatory: "Activité compensatoire" };
  return map[type] || type || "Devoir";
}

function drawWrappedText(ctx, text, x, y, maxWidth, options) {
  const fontSize = options.fontSize || 10;
  const lineHeight = options.lineHeight || 5 * MM_TO_PT;
  const words = String(text).split(" ");
  let line = "";
  let cy = y;
  const approxCharsPerLine = Math.floor((maxWidth / (fontSize * 0.45)) * 0.9);

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > approxCharsPerLine && line) {
      ctx.drawText(line, x, cy, { fontSize, maxWidth });
      cy += lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.drawText(line, x, cy, { fontSize, maxWidth });
    cy += lineHeight;
  }
  return cy;
}

function estimateQuestionHeight(ctx, question, width) {
  const textHeight = Math.ceil((String(question.text || "").length / 80)) * 6 * MM_TO_PT + 20 * MM_TO_PT;
  const choicesHeight = Array.isArray(question.choices) ? question.choices.length * 5 * MM_TO_PT : 0;
  return textHeight + choicesHeight;
}
