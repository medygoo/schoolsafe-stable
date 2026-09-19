// Universal frontend document actions. Every action re-enters Access_Law
// through DocumentRequest -> AccessGate -> Document Engine before any effect.

import { createAccessGate } from "./access-gate.js";
import { createDocumentDataResolver } from "./document-data-resolver.js";
import { createDocumentEngine } from "./document-engine.js";
import { createFrontendRenderer } from "./frontend-renderer.js";
import { createLayoutEngine } from "./layout-engine.js";
import { createTemplateRegistry } from "./template-registry.js";
import { createDocumentRequest, DOCUMENT_FORMATS } from "./contracts.js";

const ACTION_MAP = Object.freeze({
  preview: "preview",
  pdf: "export_pdf",
  print: "print",
  download: "download",
});

export function createUniversalDocumentActions(options = {}) {
  const documentCenter = options.documentCenter;
  const templateResolver = options.templateResolver;
  if (!documentCenter || typeof documentCenter.getAuthorizedDescriptor !== "function") {
    throw new Error("UniversalDocumentActions requires an authorization-aware Document Center");
  }
  if (typeof templateResolver !== "function") {
    throw new Error("UniversalDocumentActions requires a template resolver");
  }

  return {
    async executeById(params = {}) {
      const action = String(params.action || "preview");
      if (!ACTION_MAP[action]) return fail("Unsupported document action");

      const descriptor = documentCenter.getAuthorizedDescriptor(params.descriptorId, params.user, action);
      if (!descriptor) return fail("Access denied");

      if (descriptor.templateKind === "card-adapter") {
        if (action !== "preview" || typeof options.specialHandler !== "function") return fail("Access denied");
        const opened = await options.specialHandler({ descriptor, action, user: params.user });
        return opened
          ? { ok: true, descriptor, request: null, result: null, output: null, special: "card-preview" }
          : fail("Card preview unavailable");
      }

      let template;
      try {
        template = await templateResolver(descriptor.id, descriptor);
      } catch (error) {
        return fail(error && error.message ? error.message : "Document template unavailable");
      }
      if (!template || !template.info) return fail("Document template unavailable");

      const layoutEngine = createLayoutEngine();
      const templateRegistry = createTemplateRegistry();
      templateRegistry.register(template.info, template);
      const accessGate = createAccessGate({
        access: options.access,
        permissionsLoader: options.permissionsLoader,
      });
      const dataResolver = createDocumentDataResolver({
        schoolIdentityProvider: options.schoolIdentityProvider,
        schoolSafeIdentityProvider: options.schoolSafeIdentityProvider,
        contextResolvers: options.contextResolvers || {},
      });
      const renderer = createFrontendRenderer({ layoutEngine });
      const engine = createDocumentEngine({ accessGate, dataResolver, templateRegistry, layoutEngine, renderer });
      const request = createDocumentRequest({
        documentType: template.info.type,
        sourceModule: descriptor.sourceModule,
        action: ACTION_MAP[action],
        formats: [DOCUMENT_FORMATS.PDF],
        context: Object.assign({}, descriptor.context, {
          title: descriptor.label,
          documentLabel: descriptor.label,
          descriptorId: descriptor.id,
        }),
        requestedBy: params.user,
        reason: "Frontend preview requested from the SchoolSafe Document Center",
      });

      let result;
      try {
        result = await engine.generate(request);
      } catch (error) {
        return fail(error && error.message ? error.message : "Document generation failed");
      }
      if (!result.ok) return { ok: false, error: result.error || "Document generation failed", descriptor, request, result };
      const output = result.outputs && result.outputs[DOCUMENT_FORMATS.PDF];
      if (!output || output.ok === false || !output.blob) {
        return { ok: false, error: (output && output.error) || "PDF generation failed", descriptor, request, result };
      }

      if (params.applyEffect !== false) await applyBrowserEffect(action, output, options.effects);
      return { ok: true, descriptor, request, result, output };
    },
  };
}

async function applyBrowserEffect(action, output, effects) {
  if (effects && typeof effects[action] === "function") {
    await effects[action](output);
    return;
  }
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (action === "preview") {
    window.open(output.objectUrl, "_blank", "noopener,noreferrer");
    return;
  }
  if (action === "print") {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.src = output.objectUrl;
    frame.onload = () => {
      if (frame.contentWindow) frame.contentWindow.print();
      window.setTimeout(() => frame.remove(), 1000);
    };
    document.body.appendChild(frame);
    return;
  }

  const link = document.createElement("a");
  link.href = output.objectUrl;
  link.download = output.filename || "schoolsafe-document.pdf";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function fail(error) {
  return { ok: false, error };
}

export { ACTION_MAP as DOCUMENT_CENTER_ACTION_MAP };
