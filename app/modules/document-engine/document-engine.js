// app/modules/document-engine/document-engine.js
// Main facade for the SchoolSafe Document Engine.

import { validateDocumentModel, DOCUMENT_STATUSES, DOCUMENT_AUTHORITY_LEVELS } from "./contracts.js";

export function createDocumentEngine(deps) {
  const {
    accessGate,
    dataResolver,
    templateRegistry,
    layoutEngine,
    renderer,
    options = {},
  } = deps;

  if (!accessGate || !dataResolver || !templateRegistry || !layoutEngine || !renderer) {
    throw new Error("DocumentEngine requires accessGate, dataResolver, templateRegistry, layoutEngine and renderer");
  }

  return {
    /**
     * Generate a document from a request.
     * @param {import("./contracts.js").DocumentRequest} request
     * @returns {Promise<DocumentGenerationResult>}
     */
    async generate(request) {
      const templateInfo = templateRegistry.getInfo(request.documentType);

      // 1. Access control
      const access = await accessGate.check(request, templateInfo);
      if (!access.allowed) {
        return {
          ok: false,
          error: access.reason || "Access denied",
          request,
        };
      }

      // 2. Resolve data into a DocumentModel
      let model = await dataResolver.resolve(request, templateInfo);

      // Attach template implementation/schema for renderer use.
      const template = templateRegistry.get(request.documentType);
      if (template.render) {
        model = { ...model, _template: template };
      } else if (template.schema) {
        model = { ...model, _schema: template.schema };
      }

      // Attach layout hint from template info
      model = {
        ...model,
        meta: {
          ...model.meta,
          layout: templateInfo.defaultLayout,
        },
      };

      // 3. Validate serializability
      const validation = validateDocumentModel(stripInternals(model));
      if (!validation.valid) {
        return {
          ok: false,
          error: validation.error,
          request,
        };
      }

      // 4. Render each requested format
      const outputs = {};
      for (const format of request.formats) {
        try {
          const output = await renderer.render(model, format);
          outputs[format] = output;
        } catch (err) {
          if (typeof console !== "undefined" && console.error) {
            console.error(`[DocumentEngine] render error for ${format}:`, err);
          }
          outputs[format] = {
            ok: false,
            format,
            error: err.message,
          };
        }
      }

      // 5. Mark as generated (frontend preview)
      model = {
        ...model,
        meta: {
          ...model.meta,
          status: DOCUMENT_STATUSES.GENERATED,
          authority: DOCUMENT_AUTHORITY_LEVELS.PREVIEW,
          generatedAt: new Date().toISOString(),
        },
      };

      return {
        ok: true,
        model: stripInternals(model),
        outputs,
        request,
      };
    },
  };
}

/**
 * Remove internal-only fields before returning model to callers.
 * @param {import("./contracts.js").DocumentModel} model
 */
function stripInternals(model) {
  const clone = JSON.parse(JSON.stringify(model));
  delete clone._template;
  delete clone._schema;
  return clone;
}

/**
 * @typedef {Object} DocumentGenerationResult
 * @property {boolean} ok
 * @property {import("./contracts.js").DocumentModel} [model]
 * @property {Object<string, import("./frontend-renderer.js").DocumentOutput>} [outputs]
 * @property {string} [error]
 * @property {import("./contracts.js").DocumentRequest} request
 */
