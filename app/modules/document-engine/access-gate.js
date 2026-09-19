// app/modules/document-engine/access-gate.js
// Single entry point for document authorization.
// Permission comes from TemplateInfo, never from DocumentRequest.

const PERMISSIONS_PATH = "../shared/permissions.json";

export function createAccessGate(options = {}) {
  const permissionsUrl = options.permissionsUrl || PERMISSIONS_PATH;
  const access = options.access || resolveCanonicalAccess() || createLocalAccessLaw();
  const permissionsLoader = options.permissionsLoader || (() => loadPermissions(permissionsUrl));
  let permissionsCache = null;

  return {
    /**
     * Check whether the user in the request may perform the action on the document type.
     * @param {import("./contracts.js").DocumentRequest} request
     * @param {import("./template-registry.js").TemplateInfo} templateInfo
     * @returns {Promise<AccessResult>}
     */
    async check(request, templateInfo) {
      if (!templateInfo || !Array.isArray(templateInfo.permissions) || templateInfo.permissions.length === 0) {
        return deny("No permission defined for document type");
      }

      const user = request && request.requestedBy;
      if (!user) {
        return deny("No user context");
      }

      let permissions;
      try {
        if (!permissionsCache) permissionsCache = await permissionsLoader();
        permissions = permissionsCache;
      } catch (error) {
        return deny(`Permission catalogue unavailable: ${error.message}`);
      }
      if (!Array.isArray(permissions)) {
        return deny("Permission catalogue unavailable");
      }

      // The required permission always comes from TemplateInfo, never DocumentRequest.
      const requiredPermission = pickRequiredPermission(request && request.action, templateInfo.permissions);
      const permissionDef = permissions.find((p) => p.code === requiredPermission);

      if (!permissionDef) {
        return deny(`Permission ${requiredPermission} not found in catalogue`);
      }

      if (typeof access.explicitDeny === "function" && access.explicitDeny(user, requiredPermission)) {
        return deny(`Explicit DENY for ${requiredPermission}`);
      }
      if (typeof access.canAccess !== "function" || !access.canAccess(user, requiredPermission)) {
        return deny(`Missing permission ${requiredPermission}`);
      }

      const catalogueScope = permissionDef.scope;
      if (!catalogueScope || typeof access.scopeFor !== "function") {
        return deny(`Scope unresolved for ${requiredPermission}`);
      }
      const grantedScope = access.scopeFor(user, requiredPermission);
      if (!grantedScope || !isRecognizedScope(grantedScope.type)) {
        return deny(`Scope unresolved for ${requiredPermission}`);
      }
      if (!contextMatchesScope(user, grantedScope, request.context || {})) {
        return deny(`Scope context mismatch for ${requiredPermission}`);
      }

      // The catalogue scope is the standard default. Access_Law may grant a
      // different explicit scope to a role or user; the effective scope still
      // has to match the request context and never bypasses DENY.
      return allow(requiredPermission, grantedScope.type);
    },

    reset() {
      permissionsCache = null;
    },
  };
}

function resolveCanonicalAccess() {
  if (typeof window !== "undefined" && window.SchoolSafeAccess) return window.SchoolSafeAccess;
  if (typeof globalThis !== "undefined" && globalThis.SchoolSafeAccess) return globalThis.SchoolSafeAccess;
  return null;
}

function createLocalAccessLaw() {
  function exceptions(user) {
    return Array.isArray(user && user.permissionExceptions) ? user.permissionExceptions : [];
  }
  function explicitDeny(user, permission) {
    if (Array.isArray(user && user.deniedPermissions) && user.deniedPermissions.includes(permission)) return true;
    return exceptions(user).some((item) => item && item.permission === permission && String(item.effect || "").toLowerCase() === "deny");
  }
  function canAccess(user, permission) {
    if (explicitDeny(user, permission)) return false;
    if (Array.isArray(user && user.permissions) && user.permissions.includes(permission)) return true;
    return exceptions(user).some((item) => item && item.permission === permission && String(item.effect || "").toLowerCase() === "allow");
  }
  function scopeFor(user, permission) {
    if (explicitDeny(user, permission)) return null;
    const exception = exceptions(user).find((item) => item && item.permission === permission && String(item.effect || "").toLowerCase() === "allow");
    if (exception) {
      const value = exception.scope || exception.scopeType || exception.scope_type;
      if (typeof value === "string") return { permission, type: value };
      if (value && value.type) return { permission, ...value };
    }
    const scopes = Array.isArray(user && user.scopes) ? user.scopes : [];
    return scopes.find((scope) => scope && scope.permission === permission) || null;
  }
  return { explicitDeny, canAccess, scopeFor };
}

function contextMatchesScope(user, scope, context) {
  const type = scope && scope.type;
  if (type === "none") return true;
  if (type === "school") {
    const contextSchoolId = context.schoolId || context.school?.id;
    return !!user.schoolId && (!contextSchoolId || contextSchoolId === user.schoolId);
  }
  if (type === "own") {
    const ownerId = context.ownerId || context.userId || context.profileId || context.owner?.id;
    const userId = user.userId || user.profileId || user.id || user.profile?.id;
    return !!ownerId && !!userId && ownerId === userId;
  }
  if (type === "own_children") {
    const childId = context.childId || context.studentId || context.student?.id;
    return !!childId && Array.isArray(user.childIds) && user.childIds.includes(childId);
  }
  if (type === "assigned_classes") {
    const classId = context.classId || context.class?.id;
    return !!classId && Array.isArray(user.assignedClassIds) && user.assignedClassIds.includes(classId);
  }
  if (type === "assigned_subjects") {
    const subjectId = context.subjectId || context.subject?.id;
    return !!subjectId && Array.isArray(user.assignedSubjectIds) && user.assignedSubjectIds.includes(subjectId);
  }
  if (type === "assigned_portal") {
    const portalId = context.portalId || context.portal?.id;
    return !!portalId && Array.isArray(user.assignedPortalIds) && user.assignedPortalIds.includes(portalId);
  }
  return false;
}

function isRecognizedScope(type) {
  return ["none", "school", "own", "own_children", "assigned_classes", "assigned_subjects", "assigned_portal"].includes(type);
}

function allow(permission, scope) {
  return { allowed: true, permission, scope };
}

function deny(reason) {
  // Log important refusals locally for QA/security awareness.
  if (typeof console !== "undefined" && console.warn) {
    console.warn("[DocumentEngine][AccessGate] Denied:", reason);
  }
  return { allowed: false, permission: "", scope: "none", reason };
}

async function loadPermissions(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    // Fallback for Node tests or missing file
    if (typeof require !== "undefined") {
      try {
        return require("../../shared/permissions.json");
      } catch {
        // ignore
      }
    }
    throw new Error(`Unable to load permissions: ${err.message}`);
  }
}

/**
 * Pick the most appropriate permission for the requested action.
 * @param {string} action
 * @param {string[]} permissions
 * @returns {string}
 */
function pickRequiredPermission(action, permissions) {
  // For view/preview use the first read permission.
  if (action === "view" || action === "preview") {
    return (
      permissions.find((p) => p.endsWith(".read")) ||
      permissions[0]
    );
  }
  // For generate/download/print/export_pdf use the first permission.
  return permissions[0];
}

/**
 * @typedef {Object} AccessResult
 * @property {boolean} allowed
 * @property {string} permission
 * @property {string} scope
 * @property {string} [reason]
 */
