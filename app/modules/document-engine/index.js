// app/modules/document-engine/index.js
// Public surface of the SchoolSafe Document Engine.

// New DOC-01 engine
export { createDocumentEngine } from "./document-engine.js";
export { createUniversalDocumentActions, DOCUMENT_CENTER_ACTION_MAP } from "./document-actions.js";
export {
  DOCUMENT_ACTIONS,
  DOCUMENT_FORMATS,
  DOCUMENT_STATUSES,
  DOCUMENT_ORIGINS,
  DOCUMENT_SENSITIVITY_LEVELS,
  DOCUMENT_AUTHORITY_LEVELS,
  DOCUMENT_NATURES,
  createDocumentRequest,
  createDocumentModel,
  isJsonSerializable,
  validateDocumentModel,
} from "./contracts.js";
export { createAccessGate } from "./access-gate.js";
export { createDocumentDataResolver } from "./document-data-resolver.js";
export { createSchoolSafeIdentityProvider } from "./schoolsafe-identity-provider.js";
export { createTemplateRegistry } from "./template-registry.js";
export { RenderContext } from "./render-context.js";
export { createLayoutEngine, LAYOUTS, MM_TO_PT, getUniversalContentBounds, isProtectedCardLayout } from "./layout-engine.js";
export { createFrontendRenderer } from "./frontend-renderer.js";
export { createUniversalDocumentTemplate, selectUniversalLayout } from "./templates/universal-document-template.js";
export { registerDefaultTemplates } from "./bootstrap-templates.js";
export {
  buildFilename,
  buildReference,
  parseReference,
  formatDate,
  formatDateTime,
  formatCurrency,
  formatNumber,
  formatPageNumber,
  sanitizeReference,
  sanitizeLocale,
  sanitizeFilename,
  REFERENCE_PREFIXES,
} from "./file-policy.js";

// Legacy exports kept for backward compatibility during migration.
export { createSchoolIdentityProvider } from "./school-identity-provider.js";
export { createDocumentNumberingService } from "./document-numbering-service.js";
export { renderDocumentHeader } from "./document-header.js";
export { renderDocumentFooter } from "./document-footer.js";
export * from "./identity-blocks.js";
export { renderPaymentBlock } from "./payment-block.js";
export { renderSignatureBlock } from "./signature-block.js";
export { renderQRBlock } from "./qr-block.js";
export { drawDataTable } from "./data-table.js";
export * from "./print-layout.js";
export { renderReceipt } from "./templates/receipt-template.js";
