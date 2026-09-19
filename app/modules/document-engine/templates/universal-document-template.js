// Reusable frontend-only PDF templates for reports, registers, tables and structured sheets.

import { DOCUMENT_FORMATS, DOCUMENT_NATURES } from "../contracts.js";

const SUPPORTED_KINDS = new Set(["report", "register", "table", "sheet", "receipt"]);

export function selectUniversalLayout(options = {}) {
  const kind = options.kind || "report";
  const columnCount = Number(options.columnCount || 0);
  if (options.preferredLayout) return options.preferredLayout;
  if (kind === "receipt") return "a5-receipt";
  if ((kind === "table" || kind === "register") && columnCount >= 6) return "a4-landscape";
  return "a4-portrait";
}

export function createUniversalDocumentTemplate(options = {}) {
  if (!options.type || !options.label || !options.sourceModule) {
    throw new Error("Universal document templates require type, label and sourceModule");
  }
  if (!Array.isArray(options.permissions) || options.permissions.length === 0) {
    throw new Error("Universal document templates require an existing permission");
  }
  const kind = options.kind || "report";
  if (!SUPPORTED_KINDS.has(kind)) throw new Error(`Unsupported universal template kind: ${kind}`);

  const columns = normalizeColumns(options.columns || []);
  const defaultLayout = selectUniversalLayout({
    kind,
    columnCount: columns.length,
    preferredLayout: options.defaultLayout,
  });
  const schema = columns.length ? { title: options.label, columns } : undefined;

  return {
    info: {
      type: options.type,
      label: options.label,
      labelFr: options.labelFr || options.label,
      labelEn: options.labelEn || options.label,
      sourceModule: options.sourceModule,
      nature: options.nature || natureForKind(kind),
      defaultFormats: [DOCUMENT_FORMATS.PDF],
      supportedFormats: options.supportedFormats || [DOCUMENT_FORMATS.PDF],
      defaultLayout,
      permissions: [...options.permissions],
      templateVersion: options.templateVersion || "1.0.0",
      description: options.description || "Aperçu PDF SchoolSafe généré côté frontend",
      kind,
    },
    schema,
    async render(ctx, model, layout) {
      const content = model.content || {};
      const title = content.title || options.label;
      let y = layout.contentTop + 8;
      const left = layout.margins.left;
      const availableWidth = ctx.getDimensions().width - layout.margins.left - layout.margins.right;

      ctx.drawText(title, left, y, {
        fontSize: 16,
        fontStyle: "bold",
        color: model.school.primaryColor || "#071a3d",
        maxWidth: availableWidth,
      });
      y += 20;

      if (content.subtitle || content.summary) {
        ctx.drawText(content.subtitle || content.summary, left, y, { fontSize: 10, maxWidth: availableWidth });
        y += 20;
      }

      if ((kind === "table" || kind === "register") && columns.length) {
        const tableColumns = fitColumns(columns, availableWidth);
        ctx.drawTable({ columns: tableColumns, rows: content.rows || [] }, left, y, layout.contentBottom);
        return;
      }

      y = renderFields(ctx, content.fields || [], left, y, availableWidth, layout);
      renderSections(ctx, content.sections || [], left, y, availableWidth, layout);
    },
  };
}

function natureForKind(kind) {
  if (kind === "register" || kind === "table") return DOCUMENT_NATURES.PRINTABLE_LIST;
  if (kind === "sheet") return DOCUMENT_NATURES.FORM;
  return DOCUMENT_NATURES.DOCUMENT;
}

function normalizeColumns(columns) {
  return columns.map((column, index) => ({
    header: String(column.header || column.label || `Colonne ${index + 1}`),
    width: Number(column.width || 100),
    align: column.align || "left",
  }));
}

function fitColumns(columns, availableWidth) {
  const total = columns.reduce((sum, column) => sum + column.width, 0) || 1;
  const ratio = total > availableWidth ? availableWidth / total : 1;
  return columns.map((column) => ({ ...column, width: column.width * ratio }));
}

function renderFields(ctx, fields, left, startY, availableWidth, layout) {
  let y = startY;
  for (const field of fields) {
    if (y + 22 > layout.contentBottom) {
      ctx.addPage();
      y = layout.contentTop + 8;
    }
    const label = field.label || field.name || "";
    const value = field.value ?? "—";
    ctx.drawText(label, left, y, { fontSize: 9, fontStyle: "bold", color: "#4b5563", maxWidth: availableWidth * 0.35 });
    ctx.drawText(value, left + availableWidth * 0.36, y, { fontSize: 10, maxWidth: availableWidth * 0.64 });
    y += 18;
  }
  return y;
}

function renderSections(ctx, sections, left, startY, availableWidth, layout) {
  let y = startY;
  for (const section of sections) {
    if (y + 38 > layout.contentBottom) {
      ctx.addPage();
      y = layout.contentTop + 8;
    }
    ctx.drawText(section.title || "", left, y, { fontSize: 12, fontStyle: "bold", maxWidth: availableWidth });
    y += 17;
    const lines = Array.isArray(section.lines) ? section.lines : [section.text || ""];
    for (const line of lines) {
      if (y + 16 > layout.contentBottom) {
        ctx.addPage();
        y = layout.contentTop + 8;
      }
      ctx.drawText(line, left, y, { fontSize: 10, maxWidth: availableWidth });
      y += 15;
    }
    y += 8;
  }
}
