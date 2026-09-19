/* SchoolSafe — Centre de documents frontend. Métadonnées de session uniquement. */
(function () {
  "use strict";

  var registry = [];
  var history = [];
  var activeContainer = null;
  var activeUser = null;
  var actionHandler = null;
  var filters = emptyFilters();

  function emptyFilters() {
    return { sourceModule: "", type: "", nature: "", date: "", status: "", sensitivity: "", format: "" };
  }

  function register(descriptor) {
    var normalized = normalizeDescriptor(descriptor);
    var index = registry.findIndex(function (item) { return item.id === normalized.id; });
    if (index >= 0) registry[index] = normalized;
    else registry.push(normalized);
    return normalized;
  }

  function registerMany(descriptors) {
    (Array.isArray(descriptors) ? descriptors : []).forEach(register);
    return listRegistered();
  }

  function clearRegistry() {
    registry = [];
    filters = emptyFilters();
  }

  function listRegistered() {
    return registry.map(cloneMetadata);
  }

  function normalizeDescriptor(value) {
    if (!value || !value.id || !value.type || !value.label || !value.permission || !value.scope) {
      throw new Error("Document descriptor requires id, type, label, permission and scope");
    }
    return {
      id: String(value.id),
      type: String(value.type),
      label: String(value.label),
      description: String(value.description || "Aperçu frontend SchoolSafe"),
      sourceModule: String(value.sourceModule || "other"),
      nature: String(value.nature || "DOCUMENT"),
      date: String(value.date || new Date().toISOString().slice(0, 10)),
      status: String(value.status || "draft"),
      sensitivity: String(value.sensitivity || "internal"),
      formats: Array.isArray(value.formats) ? value.formats.map(String) : ["pdf"],
      permission: String(value.permission),
      scope: String(value.scope),
      context: value.context && typeof value.context === "object" ? Object.assign({}, value.context) : {},
      actions: Array.isArray(value.actions) && value.actions.length ? value.actions.slice() : ["preview", "pdf", "print", "download"],
      actionPermissions: value.actionPermissions && typeof value.actionPermissions === "object" ? Object.assign({}, value.actionPermissions) : {},
      authority: "preview",
      currencyPolicy: value.currencyPolicy ? String(value.currencyPolicy) : "not-applicable",
      officialBoundary: value.officialBoundary ? String(value.officialBoundary) : "Aperçu frontend uniquement",
      templateKind: value.templateKind ? String(value.templateKind) : "report",
      dataBoundary: value.dataBoundary ? String(value.dataBoundary) : "authorized-context-only",
    };
  }

  function canAccessDescriptor(user, descriptor, action) {
    var access = window.SchoolSafeAccess;
    if (!access || !user || !descriptor) return false;
    if (action && descriptor.actions.indexOf(action) < 0) return false;
    var permission = descriptor.actionPermissions[action] || descriptor.permission;
    if (typeof access.explicitDeny === "function" && access.explicitDeny(user, permission)) return false;
    if (typeof access.canAccess !== "function" || !access.canAccess(user, permission)) return false;
    if (typeof access.scopeFor !== "function") return false;
    var scope = access.scopeFor(user, permission);
    if (!scope || scope.type !== descriptor.scope) return false;
    return contextMatchesScope(user, scope, descriptor.context || {});
  }

  function getAuthorizedDescriptor(descriptorId, user, action) {
    var descriptor = registry.find(function (item) { return item.id === descriptorId; });
    if (!descriptor || !canAccessDescriptor(user, descriptor, action || "preview")) return null;
    return cloneAuthorizedDescriptor(descriptor);
  }

  function contextMatchesScope(user, scope, context) {
    if (scope.type === "none") return true;
    if (scope.type === "school") return !!user.schoolId && context.schoolId === user.schoolId;
    if (scope.type === "own") {
      var userId = user.userId || user.profileId || user.id || (user.profile && user.profile.id);
      return !!userId && [context.ownerId, context.userId, context.profileId].indexOf(userId) >= 0;
    }
    if (scope.type === "own_children") {
      var childId = context.childId || context.studentId || (context.student && context.student.id);
      return !!childId && Array.isArray(user.childIds) && user.childIds.indexOf(childId) >= 0;
    }
    if (scope.type === "assigned_classes") {
      var classId = context.classId || (context.class && context.class.id);
      return !!classId && Array.isArray(user.assignedClassIds) && user.assignedClassIds.indexOf(classId) >= 0;
    }
    if (scope.type === "assigned_subjects") {
      var subjectId = context.subjectId || (context.subject && context.subject.id);
      return !!subjectId && Array.isArray(user.assignedSubjectIds) && user.assignedSubjectIds.indexOf(subjectId) >= 0;
    }
    if (scope.type === "assigned_portal") {
      var portalId = context.portalId || (context.portal && context.portal.id);
      return !!portalId && Array.isArray(user.assignedPortalIds) && user.assignedPortalIds.indexOf(portalId) >= 0;
    }
    return false;
  }

  function visibleDocuments(user) {
    return registry.filter(function (descriptor) { return canAccessDescriptor(user, descriptor, "preview"); });
  }

  function filteredDocuments(user) {
    return visibleDocuments(user).filter(function (descriptor) {
      return (!filters.sourceModule || descriptor.sourceModule === filters.sourceModule) &&
        (!filters.type || descriptor.type === filters.type) &&
        (!filters.nature || descriptor.nature === filters.nature) &&
        (!filters.date || descriptor.date === filters.date) &&
        (!filters.status || descriptor.status === filters.status) &&
        (!filters.sensitivity || descriptor.sensitivity === filters.sensitivity) &&
        (!filters.format || descriptor.formats.indexOf(filters.format) >= 0);
    });
  }

  function render(containerId, user) {
    activeContainer = document.getElementById(containerId);
    activeUser = user;
    if (!activeContainer) throw new Error("Document Center container not found: " + containerId);
    activeContainer.innerHTML = renderCenterMarkup(user);
    bindEvents();
    refreshIcons();
  }

  function renderCenterMarkup(user) {
    var allowed = visibleDocuments(user);
    var documents = filteredDocuments(user);
    return '<div class="document-center">' +
      '<section class="document-center__notice"><i data-lucide="archive"></i><div><strong>HISTORIQUE / ARCHIVAGE OFFICIEL — BACKEND_LATER</strong><span>Cette session conserve uniquement des métadonnées non sensibles. Aucun PDF confidentiel n’est archivé dans le navigateur.</span></div></section>' +
      '<section class="document-center__filters" aria-label="Filtres documentaires">' +
        selectFilter("sourceModule", "Module source", allowed) +
        selectFilter("type", "Type", allowed) +
        selectFilter("nature", "Nature", allowed) +
        '<label><span>Date</span><input type="date" data-document-filter="date" value="' + escapeMarkup(filters.date) + '"></label>' +
        selectFilter("status", "Statut", allowed) +
        selectFilter("sensitivity", "Sensibilité", allowed) +
        selectFilter("format", "Format", allowed) +
        '<button class="ss-button ss-button--secondary" type="button" data-document-filter-reset><i data-lucide="rotate-ccw"></i> Réinitialiser</button>' +
      '</section>' +
      '<div class="document-center__summary"><span><strong>' + documents.length + '</strong> document(s) visible(s)</span><span>Permission + portée + contexte appliqués avant affichage</span></div>' +
      '<section class="document-center__grid" aria-live="polite">' + (documents.length ? documents.map(renderDocumentCard).join("") : renderEmpty()) + '</section>' +
      '<section class="document-center__history"><header><div><span>Session actuelle</span><h3>Historique des actions</h3></div><small>Métadonnées uniquement</small></header><div data-document-history>' + renderHistory() + '</div></section>' +
    '</div>';
  }

  function selectFilter(key, label, documents) {
    var values = [];
    documents.forEach(function (descriptor) {
      var candidates = key === "format" ? descriptor.formats : [descriptor[key]];
      candidates.forEach(function (value) { if (value && values.indexOf(value) < 0) values.push(value); });
    });
    values.sort();
    return '<label><span>' + label + '</span><select data-document-filter="' + key + '"><option value="">Tous</option>' + values.map(function (value) {
      return '<option value="' + escapeMarkup(value) + '"' + (filters[key] === value ? " selected" : "") + '>' + escapeMarkup(displayValue(value)) + '</option>';
    }).join("") + '</select></label>';
  }

  function renderDocumentCard(descriptor) {
    var actions = descriptor.actions.filter(function (action) { return canAccessDescriptor(activeUser, descriptor, action); });
    return '<article class="document-card" data-document-id="' + escapeMarkup(descriptor.id) + '">' +
      '<header><span class="document-card__icon"><i data-lucide="file-text"></i></span><div><small>' + escapeMarkup(descriptor.sourceModule) + '</small><h3>' + escapeMarkup(descriptor.label) + '</h3></div></header>' +
      '<p>' + escapeMarkup(descriptor.description) + '</p>' +
      '<dl><div><dt>Type</dt><dd>' + escapeMarkup(descriptor.type) + '</dd></div><div><dt>Date</dt><dd>' + escapeMarkup(descriptor.date) + '</dd></div><div><dt>Statut</dt><dd>' + escapeMarkup(displayValue(descriptor.status)) + '</dd></div><div><dt>Sensibilité</dt><dd>' + escapeMarkup(displayValue(descriptor.sensitivity)) + '</dd></div></dl>' +
      '<div class="document-card__formats">' + descriptor.formats.map(function (format) { return '<span>' + escapeMarkup(format.toUpperCase()) + '</span>'; }).join("") + '</div>' +
      '<footer>' + actions.map(function (action) { return '<button type="button" data-document-action="' + action + '" data-document-target="' + escapeMarkup(descriptor.id) + '"><i data-lucide="' + iconForAction(action) + '"></i>' + labelForAction(action) + '</button>'; }).join("") + '</footer>' +
    '</article>';
  }

  function renderEmpty() {
    return '<div class="document-center__empty"><i data-lucide="folder-search"></i><h3>Aucun document visible</h3><p>Aucun document ne correspond aux droits et filtres actuels. Le Centre n’élargit jamais votre périmètre.</p></div>';
  }

  function bindEvents() {
    activeContainer.querySelectorAll("[data-document-filter]").forEach(function (control) {
      control.addEventListener("change", function () {
        filters[control.getAttribute("data-document-filter")] = control.value;
        render(activeContainer.id, activeUser);
      });
    });
    var reset = activeContainer.querySelector("[data-document-filter-reset]");
    if (reset) reset.addEventListener("click", function () { filters = emptyFilters(); render(activeContainer.id, activeUser); });
    activeContainer.querySelectorAll("[data-document-action]").forEach(function (button) {
      button.addEventListener("click", function () { executeAction(button.getAttribute("data-document-target"), button.getAttribute("data-document-action")); });
    });
  }

  function executeAction(descriptorId, action) {
    var descriptor = registry.find(function (item) { return item.id === descriptorId; });
    if (!descriptor || !canAccessDescriptor(activeUser, descriptor, action)) return false;
    recordHistory({ descriptorId: descriptor.id, type: descriptor.type, label: descriptor.label, action: action, format: action === "pdf" ? "pdf" : "", status: "preview" });
    if (typeof actionHandler === "function") actionHandler({ descriptor: cloneMetadata(descriptor), action: action, user: activeUser });
    return true;
  }

  function recordHistory(event) {
    var item = {
      id: "doc-history-" + Date.now() + "-" + (history.length + 1),
      descriptorId: String(event.descriptorId || ""),
      type: String(event.type || ""),
      label: String(event.label || "Document"),
      action: String(event.action || "preview"),
      format: String(event.format || ""),
      status: String(event.status || "preview"),
      createdAt: new Date().toISOString(),
    };
    history.unshift(item);
    if (history.length > 50) history.length = 50;
    var host = activeContainer && activeContainer.querySelector("[data-document-history]");
    if (host) host.innerHTML = renderHistory();
    return Object.assign({}, item);
  }

  function getHistory() {
    return history.map(function (item) { return Object.assign({}, item); });
  }

  function renderHistory() {
    if (!history.length) return '<p class="document-center__history-empty">Aucune action documentaire dans cette session.</p>';
    return history.map(function (item) {
      return '<article data-document-history-item><div><strong>' + escapeMarkup(item.label) + '</strong><span>' + escapeMarkup(labelForAction(item.action)) + (item.format ? " · " + escapeMarkup(item.format.toUpperCase()) : "") + '</span></div><time>' + escapeMarkup(new Date(item.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })) + '</time></article>';
    }).join("");
  }

  function cloneMetadata(descriptor) {
    return {
      id: descriptor.id, type: descriptor.type, label: descriptor.label, description: descriptor.description,
      sourceModule: descriptor.sourceModule, nature: descriptor.nature, date: descriptor.date, status: descriptor.status,
      sensitivity: descriptor.sensitivity, formats: descriptor.formats.slice(), permission: descriptor.permission,
      scope: descriptor.scope, actions: descriptor.actions.slice(), authority: descriptor.authority,
      currencyPolicy: descriptor.currencyPolicy, officialBoundary: descriptor.officialBoundary, templateKind: descriptor.templateKind,
      dataBoundary: descriptor.dataBoundary,
    };
  }

  function cloneAuthorizedDescriptor(descriptor) {
    return Object.assign(cloneMetadata(descriptor), {
      context: Object.assign({}, descriptor.context),
      actionPermissions: Object.assign({}, descriptor.actionPermissions),
    });
  }

  function displayValue(value) {
    var labels = { draft: "Brouillon", generated: "Aperçu généré", internal: "Interne", confidential: "Confidentiel", restricted: "Restreint" };
    return labels[value] || value;
  }

  function iconForAction(action) {
    return { preview: "eye", pdf: "file-down", print: "printer", download: "download" }[action] || "file";
  }

  function labelForAction(action) {
    return { preview: "Aperçu", pdf: "PDF", print: "Imprimer", download: "Télécharger" }[action] || action;
  }

  function escapeMarkup(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  }

  window.SchoolSafeDocumentCenter = {
    register: register,
    registerMany: registerMany,
    clearRegistry: clearRegistry,
    listRegistered: listRegistered,
    visibleDocuments: visibleDocuments,
    canAccessDescriptor: canAccessDescriptor,
    getAuthorizedDescriptor: getAuthorizedDescriptor,
    render: render,
    recordHistory: recordHistory,
    getHistory: getHistory,
    setActionHandler: function (handler) { actionHandler = typeof handler === "function" ? handler : null; },
  };
}());
