// app/modules/document-engine/document-data-resolver.js
// Resolves school identity, SchoolSafe identity and contextual data into a DocumentModel.

import { createDocumentModel, DOCUMENT_STATUSES, DOCUMENT_AUTHORITY_LEVELS } from "./contracts.js";

/**
 * @typedef {Object} DocumentDataResolverDeps
 * @property {import("./school-identity-provider.js").SchoolIdentityProvider} schoolIdentityProvider
 * @property {import("./schoolsafe-identity-provider.js").SchoolSafeIdentityProvider} schoolSafeIdentityProvider
 * @property {Object<string, function>} contextResolvers
 */

export function createDocumentDataResolver(deps) {
  const {
    schoolIdentityProvider,
    schoolSafeIdentityProvider,
    contextResolvers = {},
  } = deps;

  if (!schoolIdentityProvider || !schoolSafeIdentityProvider) {
    throw new Error("DocumentDataResolver requires school and SchoolSafe identity providers");
  }

  return {
    /**
     * @param {import("./contracts.js").DocumentRequest} request
     * @param {import("./template-registry.js").TemplateInfo} templateInfo
     * @returns {Promise<import("./contracts.js").DocumentModel>}
     */
    async resolve(request, templateInfo) {
      const now = new Date().toISOString();

      const [school, schoolsafe] = await Promise.all([
        schoolIdentityProvider.load(),
        schoolSafeIdentityProvider.load(),
      ]);

      const schoolSnapshot = { ...school, snapshotAt: now };
      const schoolSafeSnapshot = { ...schoolsafe, snapshotAt: now };

      const contextResolver = contextResolvers[request.sourceModule];
      const content = contextResolver
        ? await contextResolver(request.context, { school: schoolSnapshot, user: request.requestedBy })
        : request.context || {};

      return createDocumentModel({
        meta: {
          reference: "", // filled later by numbering service / backend
          version: 1,
          templateVersion: templateInfo.templateVersion,
          status: DOCUMENT_STATUSES.DRAFT,
          origin: request.origin,
          sourceArtifacts: request.sourceArtifacts,
          sensitivity: inferSensitivity(request.documentType),
          authority: DOCUMENT_AUTHORITY_LEVELS.PREVIEW,
          createdAt: now,
          sourceModule: request.sourceModule,
          documentType: request.documentType,
          action: request.action,
          formats: request.formats,
          author: {
            id: request.requestedBy.userId,
            name: request.requestedBy.name || "",
            role: request.requestedBy.role,
          },
          schoolId: request.requestedBy.schoolId,
          academicYear: schoolSnapshot.activeAcademicYear,
          locale: request.locale || "fr-FR",
          generatedBy: "frontend",
        },
        school: schoolSnapshot,
        schoolsafe: schoolSafeSnapshot,
        content,
      });
    },
  };
}

function inferSensitivity(documentType) {
  const confidentialTypes = ["receipt", "report-card", "payroll", "student-card", "medical"];
  const restrictedTypes = ["incident", "security-report", "medical-incident"];
  const publicTypes = ["announcement", "event-poster"];

  if (restrictedTypes.some((t) => documentType.includes(t))) return "restricted";
  if (confidentialTypes.some((t) => documentType.includes(t))) return "confidential";
  if (publicTypes.some((t) => documentType.includes(t))) return "public";
  return "internal";
}
