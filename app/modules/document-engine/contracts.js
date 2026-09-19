// app/modules/document-engine/contracts.js
// Core contracts for the SchoolSafe Document Engine.
// Everything here must remain JSON-serializable and free of browser-specific objects.

export const DOCUMENT_ACTIONS = Object.freeze({
  VIEW: "view",
  PREVIEW: "preview",
  GENERATE: "generate",
  PRINT: "print",
  EXPORT_PDF: "export_pdf",
  DOWNLOAD: "download",
});

export const DOCUMENT_FORMATS = Object.freeze({
  PDF: "pdf",
  PNG: "png",
  XLSX: "xlsx",
  CSV: "csv",
});

export const DOCUMENT_STATUSES = Object.freeze({
  DRAFT: "draft",
  GENERATED: "generated",
  VALIDATED: "validated",
  CANCELLED: "cancelled",
  ARCHIVED: "archived",
});

export const DOCUMENT_ORIGINS = Object.freeze({
  GENERATED: "generated",
  UPLOADED: "uploaded",
  COMPOSED: "composed",
});

export const DOCUMENT_SENSITIVITY_LEVELS = Object.freeze({
  PUBLIC: "public",
  INTERNAL: "internal",
  CONFIDENTIAL: "confidential",
  RESTRICTED: "restricted",
});

export const DOCUMENT_AUTHORITY_LEVELS = Object.freeze({
  PREVIEW: "preview",
  OFFICIAL: "official",
});

export const DOCUMENT_NATURES = Object.freeze({
  DOCUMENT: "DOCUMENT",
  CARD_BADGE: "CARTE/BADGE",
  FORM: "FORMULAIRE",
  EXPORT: "EXPORT",
  PRINTABLE_LIST: "REGISTRE/LISTE IMPRIMABLE",
});

/**
 * @param {object} params
 * @returns {import("./contracts.types").DocumentRequest}
 */
export function createDocumentRequest(params) {
  const now = new Date().toISOString();
  return {
    id: params.id || generateId(),
    documentType: params.documentType,
    sourceModule: params.sourceModule,
    action: params.action || DOCUMENT_ACTIONS.GENERATE,
    formats: normalizeFormats(params.formats),
    context: params.context || {},
    origin: params.origin || DOCUMENT_ORIGINS.GENERATED,
    sourceArtifacts: params.sourceArtifacts || undefined,
    requestedBy: params.requestedBy,
    reason: params.reason,
    locale: params.locale || "fr-FR",
    requestedAt: params.requestedAt || now,
  };
}

/**
 * @param {object} params
 * @returns {import("./contracts.types").DocumentModel}
 */
export function createDocumentModel(params) {
  const now = new Date().toISOString();
  return {
    meta: {
      reference: params.meta?.reference || "",
      version: params.meta?.version || 1,
      templateVersion: params.meta?.templateVersion || "1.0.0",
      status: params.meta?.status || DOCUMENT_STATUSES.DRAFT,
      origin: params.meta?.origin || DOCUMENT_ORIGINS.GENERATED,
      sourceArtifacts: params.meta?.sourceArtifacts,
      sensitivity: params.meta?.sensitivity || DOCUMENT_SENSITIVITY_LEVELS.INTERNAL,
      authority: params.meta?.authority || DOCUMENT_AUTHORITY_LEVELS.PREVIEW,
      createdAt: params.meta?.createdAt || now,
      generatedAt: params.meta?.generatedAt,
      sourceModule: params.meta?.sourceModule,
      documentType: params.meta?.documentType,
      action: params.meta?.action || DOCUMENT_ACTIONS.GENERATE,
      formats: normalizeFormats(params.meta?.formats),
      author: params.meta?.author || { id: "", name: "", role: "" },
      schoolId: params.meta?.schoolId || "",
      academicYear: params.meta?.academicYear,
      locale: params.meta?.locale || "fr-FR",
      generatedBy: params.meta?.generatedBy || "frontend",
    },
    school: params.school,
    schoolsafe: params.schoolsafe,
    content: params.content || {},
  };
}

/**
 * Ensure PDF is always present for exportable documents.
 * @param {string[] | undefined} formats
 * @returns {string[]}
 */
function normalizeFormats(formats) {
  const list = Array.isArray(formats) ? [...formats] : [DOCUMENT_FORMATS.PDF];
  if (!list.includes(DOCUMENT_FORMATS.PDF)) {
    list.unshift(DOCUMENT_FORMATS.PDF);
  }
  return list;
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Deep check that a value is JSON-serializable.
 * @param {any} value
 * @returns {boolean}
 */
export function isJsonSerializable(value) {
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" && JSON.parse(json) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Validate a DocumentModel is JSON-serializable.
 * @param {import("./contracts.types").DocumentModel} model
 * @returns {{valid: boolean, error?: string}}
 */
export function validateDocumentModel(model) {
  if (!model || typeof model !== "object") {
    return { valid: false, error: "DocumentModel must be an object" };
  }
  if (!isJsonSerializable(model)) {
    return { valid: false, error: "DocumentModel is not JSON-serializable" };
  }
  return { valid: true };
}
