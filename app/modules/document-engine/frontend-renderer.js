// app/modules/document-engine/frontend-renderer.js
// Orchestrates layout, template and rendering adapter. Applies watermarks.

import { JspdfRenderContext } from "./adapters/jspdf-render-context.js";
import { DOCUMENT_FORMATS, DOCUMENT_AUTHORITY_LEVELS, DOCUMENT_SENSITIVITY_LEVELS } from "./contracts.js";
import { buildFilename, formatDate } from "./file-policy.js";
import { getUniversalContentBounds, isProtectedCardLayout } from "./layout-engine.js";

export function createFrontendRenderer(deps = {}) {
  const layoutEngine = deps.layoutEngine;
  if (!layoutEngine) throw new Error("FrontendRenderer requires a LayoutEngine");

  return {
    /**
     * @param {import("./contracts.js").DocumentModel} model
     * @param {string} format
     * @returns {Promise<DocumentOutput>}
     */
    async render(model, format) {
      if (!model.meta.formats.includes(format)) {
        throw new Error(`Format ${format} not requested for this document`);
      }

      switch (format) {
        case DOCUMENT_FORMATS.PDF:
          return renderPdf(model, layoutEngine);
        case DOCUMENT_FORMATS.PNG:
          return renderPng(model, layoutEngine);
        case DOCUMENT_FORMATS.XLSX:
          return renderXlsx(model);
        case DOCUMENT_FORMATS.CSV:
          return renderCsv(model);
        default:
          throw new Error(`Unsupported format: ${format}`);
      }
    },
  };
}

async function renderPdf(model, layoutEngine) {
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF) throw new Error("jsPDF not loaded");

  const layout = layoutEngine.getLayout(model.meta.layout || undefined);
  const protectedCard = isProtectedCardLayout(layout.name);
  const doc = new jsPDF({
    unit: "pt",
    format: protectedCard ? (layout.dimensionsToJsPdfFormat || "a4") : [layout.dimensions.width, layout.dimensions.height],
    orientation: protectedCard ? undefined : (layout.dimensions.width > layout.dimensions.height ? "landscape" : "portrait"),
  });
  const ctx = new JspdfRenderContext(doc, layout);
  const frontendModel = ensureFrontendPreview(model);

  ctx.setTitle(`${frontendModel.meta.documentType} ${frontendModel.meta.reference || ""}`.trim());
  ctx.setAuthor(frontendModel.meta.author.name || "SchoolSafe");

  await layoutEngine.applyHeader(ctx, frontendModel);
  if (protectedCard) layoutEngine.applyFooter(ctx, frontendModel);

  const bounds = getUniversalContentBounds(layout);
  const contentTop = bounds.top;
  const contentBottom = bounds.bottom;

  // Draft/preview watermark is drawn behind the content so it never hides text.
  applyDraftWatermark(ctx, frontendModel, contentTop, contentBottom);

  // Render content via template
  const template = frontendModel._template; // injected by engine
  if (template && typeof template.render === "function") {
    await template.render(ctx, frontendModel, { ...layout, contentTop, contentBottom });
  }

  const totalPages = doc.internal.getNumberOfPages();
  if (protectedCard) {
    applySensitivityWatermark(ctx, frontendModel, contentTop, contentBottom);
  } else {
    for (let page = 1; page <= totalPages; page += 1) {
      ctx.setPage(page);
      if (page > 1) {
        await layoutEngine.applyHeader(ctx, frontendModel);
        applyDraftWatermark(ctx, frontendModel, contentTop, contentBottom);
      }
      layoutEngine.applyFooter(ctx, frontendModel);
      layoutEngine.applyPageNumber(ctx, frontendModel, { page, totalPages });
      applySensitivityWatermark(ctx, frontendModel, contentTop, contentBottom);
    }
  }

  const blob = doc.output("blob");
  const filename = buildFilename({
    documentType: model.meta.documentType,
    reference: model.meta.reference || "DRAFT",
    version: model.meta.version,
    locale: model.meta.locale,
    format: "pdf",
  });

  return {
    format: DOCUMENT_FORMATS.PDF,
    blob,
    objectUrl: URL.createObjectURL(blob),
    filename,
    pages: totalPages,
    size: blob.size,
    layout: layout.name,
    dimensions: { ...layout.dimensions },
  };
}

async function renderPng(model, layoutEngine) {
  // PNG rendering is primarily for cards/badges previews.
  // We use an off-screen canvas and draw basic shapes.
  if (typeof document === "undefined") {
    throw new Error("PNG rendering requires a browser environment");
  }

  const layout = layoutEngine.getLayout(model.meta.layout || undefined);
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = Math.round(layout.dimensions.width * scale);
  canvas.height = Math.round(layout.dimensions.height * scale);
  const g = canvas.getContext("2d");
  g.scale(scale, scale);

  // Background
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, layout.dimensions.width, layout.dimensions.height);

  // Header bar
  const primary = model.school.primaryColor || "#071a3d";
  g.fillStyle = primary;
  g.fillRect(0, 0, layout.dimensions.width, 28 * 2.83465);

  // School name
  g.fillStyle = "#ffffff";
  g.font = "bold 16px helvetica";
  g.fillText(model.school.name, 15 * 2.83465, 11 * 2.83465);

  // Footer
  g.fillStyle = "#888888";
  g.font = "7px helvetica";
  const generatedAt = model.meta.generatedAt || model.meta.createdAt;
  g.fillText(`SchoolSafe — ${formatDate(generatedAt, model.meta.locale)}`, 15 * 2.83465, layout.dimensions.height - 10 * 2.83465);

  // Watermark
  if (model.meta.authority === DOCUMENT_AUTHORITY_LEVELS.PREVIEW || model.meta.generatedBy === "frontend") {
    g.save();
    g.translate(layout.dimensions.width / 2, layout.dimensions.height / 2);
    g.rotate(-Math.PI / 6);
    g.fillStyle = "rgba(200, 0, 0, 0.15)";
    g.font = "bold 48px helvetica";
    g.textAlign = "center";
    g.fillText("BROUILLON", 0, 0);
    g.restore();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Canvas toBlob failed"));
      const filename = buildFilename({
        documentType: model.meta.documentType,
        reference: model.meta.reference || "DRAFT",
        version: model.meta.version,
        locale: model.meta.locale,
        format: "png",
      });
      resolve({
        format: DOCUMENT_FORMATS.PNG,
        blob,
        objectUrl: URL.createObjectURL(blob),
        filename,
        pages: 1,
        size: blob.size,
      });
    }, "image/png");
  });
}

async function renderCsv(model) {
  // Declarative templates only for CSV.
  const schema = model._schema;
  if (!schema || !schema.columns) {
    throw new Error("CSV rendering requires a declarative schema");
  }
  const header = schema.columns.map((c) => c.header).join(";");
  const rows = (model.content.rows || []).map((row) =>
    schema.columns.map((c, i) => `"${String(row[i] ?? "").replace(/"/g, '""')}"`).join(";")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const filename = buildFilename({
    documentType: model.meta.documentType,
    reference: model.meta.reference || "DRAFT",
    version: model.meta.version,
    locale: model.meta.locale,
    format: "csv",
  });
  return {
    format: DOCUMENT_FORMATS.CSV,
    blob,
    objectUrl: URL.createObjectURL(blob),
    filename,
    pages: 1,
    size: blob.size,
  };
}

async function renderXlsx(model) {
  // Phase 1 stub: produce a CSV-like XLSX placeholder.
  // Real XLSX will use SheetJS in a later phase.
  const csvOutput = await renderCsv(model);
  const filename = buildFilename({
    documentType: model.meta.documentType,
    reference: model.meta.reference || "DRAFT",
    version: model.meta.version,
    locale: model.meta.locale,
    format: "xlsx",
  });
  return {
    format: DOCUMENT_FORMATS.XLSX,
    blob: csvOutput.blob,
    objectUrl: csvOutput.objectUrl,
    filename,
    pages: 1,
    size: csvOutput.blob.size,
    note: "XLSX rendering is a placeholder; real Excel generation will be added later.",
  };
}

function applyDraftWatermark(ctx, model, contentTop, contentBottom) {
  const dims = ctx.getDimensions();
  const centerX = dims.width / 2;
  const centerY = (contentTop + contentBottom) / 2;

  let watermarkText = null;
  if (model.meta.authority === DOCUMENT_AUTHORITY_LEVELS.PREVIEW && model.meta.generatedBy === "frontend") {
    watermarkText = "BROUILLON";
  } else if (model.meta.authority === DOCUMENT_AUTHORITY_LEVELS.PREVIEW) {
    watermarkText = "APERÇU";
  }

  if (watermarkText) {
    ctx.drawText(watermarkText, centerX, centerY, {
      fontSize: 48,
      align: "center",
      color: "#e5e5e5",
    });
  }
}

function applySensitivityWatermark(ctx, model, contentTop, contentBottom) {
  const dims = ctx.getDimensions();
  if (model.meta.sensitivity === DOCUMENT_SENSITIVITY_LEVELS.CONFIDENTIAL ||
      model.meta.sensitivity === DOCUMENT_SENSITIVITY_LEVELS.RESTRICTED) {
    ctx.drawText("CONFIDENTIEL", dims.width - 15 * 2.83465, contentTop - 5 * 2.83465, {
      fontSize: 10,
      align: "right",
      color: "#cc0000",
    });
  }
}

function ensureFrontendPreview(model) {
  return {
    ...model,
    meta: {
      ...model.meta,
      authority: DOCUMENT_AUTHORITY_LEVELS.PREVIEW,
      generatedBy: "frontend",
    },
  };
}

/**
 * @typedef {Object} DocumentOutput
 * @property {string} format
 * @property {Blob} blob
 * @property {string} [objectUrl]
 * @property {string} filename
 * @property {number} [pages]
 * @property {number} [size]
 * @property {string} [note]
 */
