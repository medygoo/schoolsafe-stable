(function (global) {
  "use strict";

  var state = {
    containerId: "administrationModule",
    user: null,
    options: {},
    activeView: "dashboard",
    staff: null,
    roles: null,
    accountsLoading: false,
    accountsError: "",
    notice: "",
    selectedStaffId: null,
    mutationPanel: null,
    permissionCatalog: null,
    permissionsLoading: false,
    permissionsError: "",
    permissionFilters: { query: "", domain: "all", operation: "all", scope: "all", code: "" },
    inspectorInput: { permission: "roles.manage", scope: "school", contextId: "" },
    simulationDraft: { baseRole: "admin", permission: "roles.manage", scope: "school", effect: "allow", condition: "", justification: "", contextId: "" },
    simulationResult: null
  };
  var SECTIONS = [
    { key: "school", label: "École", description: "Identité, année et structure via le module École existant.", permission: "school.manage", scope: "school", icon: "school", action: "school", actionLabel: "Ouvrir le module École" },
    { key: "staff", label: "Comptes et personnel", description: "Comptes, états et équipe via les surfaces Personnel existantes.", permission: "staff.read", scope: "school", icon: "contact-round", action: "staff", actionLabel: "Ouvrir le module Personnel / RH" },
    { key: "roles", label: "Rôles", description: "Attribution des rôles bornée par roles.manage et la portée école.", permission: "roles.manage", scope: "school", icon: "user-cog" },
    { key: "permissions", label: "Permissions", description: "Catalogue canonique en lecture seule, sans création ni renommage.", permission: "roles.manage", scope: "school", icon: "list-checks" },
    { key: "access", label: "Accès effectifs", description: "Lecture du résultat Access_Law, sans moteur d’autorisation parallèle.", permission: "roles.manage", scope: "school", icon: "shield-check" },
    { key: "exceptions", label: "Exceptions / DENY", description: "Frontière des exceptions individuelles et priorité du refus explicite.", permission: "roles.manage", scope: "school", icon: "shield-off" },
    { key: "jaspe", label: "Jaspe", description: "Gouvernance de l’assistant : Jaspe reste inférieur ou égal à l’utilisateur.", permission: "safe.assistant.use", scope: "own", icon: "sparkles" },
    { key: "settings", label: "Paramètres frontend", description: "Préférences techniques locales et limites BACKEND_LATER honnêtes.", permission: "school.manage", scope: "school", icon: "settings" }
  ];

  function escapeMarkup(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function canUse(user, permission, scope) {
    var access = global.SchoolSafeAccess;
    if (!user || !access || typeof access.canAccess !== "function" || typeof access.allowsScope !== "function") return false;
    if (typeof access.explicitDeny === "function" && access.explicitDeny(user, permission)) return false;
    return access.canAccess(user, permission) && access.allowsScope(user, permission, scope);
  }

  function visibleSections(user) {
    return SECTIONS.filter(function (section) { return canUse(user, section.permission, section.scope); });
  }

  function renderCard(section) {
    var action = section.action
      ? '<button class="ss-button ss-button--secondary" type="button" data-admin-link="' + section.action + '">' + escapeMarkup(section.actionLabel) + '</button>'
      : section.key === "roles"
        ? '<button class="ss-button ss-button--secondary" type="button" data-admin-open="accounts">Gérer les comptes et rôles</button>'
        : section.key === "permissions"
          ? '<button class="ss-button ss-button--secondary" type="button" data-admin-open="permissions">Consulter le catalogue</button>'
        : section.key === "access"
          ? '<button class="ss-button ss-button--secondary" type="button" data-admin-open="inspector">Inspecter un accès</button>'
        : section.key === "exceptions"
          ? '<button class="ss-button ss-button--secondary" type="button" data-admin-open="simulation">Simuler une exception</button>'
        : section.key === "jaspe"
          ? '<button class="ss-button ss-button--secondary" type="button" data-admin-open="jaspe">Voir la gouvernance Jaspe</button>'
        : '<span class="administration-card__boundary">FRONTEND · contrôle d’accès actif</span>';
    return '<article class="administration-card" data-admin-section="' + section.key + '">' +
      '<span class="administration-card__icon"><i data-lucide="' + section.icon + '"></i></span>' +
      '<div><h3>' + escapeMarkup(section.label) + '</h3><p>' + escapeMarkup(section.description) + '</p></div>' + action + '</article>';
  }

  function asList(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.data)) return value.data;
    return [];
  }

  function explicitDeny(permission) {
    var access = global.SchoolSafeAccess;
    return !!(access && typeof access.explicitDeny === "function" && access.explicitDeny(state.user || {}, permission));
  }

  function roleAssignmentMarkup() {
    if (!state.selectedStaffId || !canUse(state.user, "roles.manage", "school")) return "";
    var person = (state.staff || []).find(function (item) { return item.id === state.selectedStaffId; });
    if (!person) return "";
    var assigned = (person.roles || []).map(function (role) { return role.id; });
    return '<section class="administration-mutation" data-role-assignment>' +
      '<div><span>ATTRIBUTION LIVE · API EXISTANTE</span><h3>Rôles de ' + escapeMarkup(person.display_name) + '</h3><p>Aucune modification locale ne sera présentée comme un succès backend.</p></div>' +
      '<form><div class="administration-role-options">' + (state.roles || []).map(function (role) {
        return '<label><input type="checkbox" name="role" value="' + escapeMarkup(role.id) + '"' + (assigned.indexOf(role.id) >= 0 ? ' checked' : '') + '> ' + escapeMarkup(role.label || role.code) + '</label>';
      }).join("") + '</div>' +
      '<label class="administration-confirm"><input type="checkbox" name="confirmed"> Je confirme cette modification via le backend existant</label>' +
      '<div class="administration-mutation__actions"><button class="ss-button ss-button--secondary" type="button" data-cancel-mutation>Annuler</button><button class="ss-button" type="submit" disabled>Confirmer l’attribution live</button></div></form></section>';
  }

  function inviteMarkup() {
    if (state.mutationPanel !== "invite" || !canUse(state.user, "staff.manage", "school")) return "";
    return '<section class="administration-mutation" data-invite-staff><div><span>INVITATION LIVE · API EXISTANTE</span><h3>Inviter un membre</h3><p>Envoi réel uniquement après confirmation explicite.</p></div><form class="administration-form-grid"><label>Prénom<input name="first_name" required></label><label>Nom<input name="last_name" required></label><label>Email<input name="email" type="email" required></label><label class="administration-confirm"><input type="checkbox" name="confirmed"> Je confirme l’envoi via le backend existant</label><div class="administration-mutation__actions"><button class="ss-button ss-button--secondary" type="button" data-cancel-mutation>Annuler</button><button class="ss-button" type="submit" disabled>Confirmer l’invitation live</button></div></form></section>';
  }

  function toggleMarkup() {
    if (!state.mutationPanel || state.mutationPanel.indexOf("toggle:") !== 0 || !canUse(state.user, "staff.manage", "school")) return "";
    var id = state.mutationPanel.slice(7);
    var person = (state.staff || []).find(function (item) { return item.id === id; });
    if (!person) return "";
    var verb = person.is_active ? "désactivation" : "activation";
    return '<section class="administration-mutation" data-toggle-staff><div><span>STATUT LIVE · API EXISTANTE</span><h3>Confirmer la ' + verb + ' de ' + escapeMarkup(person.display_name) + '</h3><p>Le statut ne changera à l’écran qu’après confirmation du backend.</p></div><div class="administration-mutation__actions"><button class="ss-button ss-button--secondary" type="button" data-cancel-mutation>Annuler</button><button class="ss-button" type="button" data-confirm-toggle="' + escapeMarkup(person.id) + '">Confirmer la ' + verb + ' live</button></div></section>';
  }

  function renderAccounts() {
    var canRead = canUse(state.user, "staff.read", "school");
    var canManage = canUse(state.user, "staff.manage", "school");
    var canAssign = canUse(state.user, "roles.manage", "school");
    if (!canRead) return '<section class="administration-empty" data-administration-accounts><i data-lucide="shield-off"></i><h3>Comptes non autorisés</h3><p>staff.read + school requis.</p></section>';
    var boundary = explicitDeny("roles.manage") ? "DENY roles.manage prioritaire" : (canAssign ? "roles.manage + school vérifiés" : "roles.manage requis pour toute attribution");
    var notice = state.notice ? '<div class="administration-notice" role="status">' + escapeMarkup(state.notice) + '</div>' : "";
    var content = "";
    if (state.accountsLoading) content = '<div class="administration-empty"><i data-lucide="loader-2"></i><h3>Chargement des comptes…</h3></div>';
    else if (state.accountsError) content = '<div class="administration-empty"><i data-lucide="wifi-off"></i><h3>Comptes indisponibles</h3><p>' + escapeMarkup(state.accountsError) + ' · BACKEND_LATER</p></div>';
    else content = '<div class="administration-table-wrap"><table class="administration-table"><thead><tr><th>Utilisateur</th><th>Statut</th><th>Rôles</th><th>Accès</th></tr></thead><tbody>' + (state.staff || []).map(function (person) {
      var roles = (person.roles || []).map(function (role) { return role.label || role.code; }).join(", ") || "Aucun rôle";
      return '<tr><td><strong>' + escapeMarkup(person.display_name) + '</strong><span>' + escapeMarkup(person.email || "—") + '</span></td><td><span class="administration-status administration-status--' + (person.is_active ? 'active' : 'inactive') + '">' + (person.is_active ? 'Actif' : 'Inactif') + '</span></td><td>' + escapeMarkup(roles) + '</td><td><div class="administration-row-actions">' +
        (canAssign ? '<button class="ss-button ss-button--secondary" type="button" data-assign-roles="' + escapeMarkup(person.id) + '" aria-label="Attribuer les rôles à ' + escapeMarkup(person.display_name) + '">Attribuer les rôles</button>' : '') +
        (canManage ? '<button class="ss-button ss-button--secondary" type="button" data-toggle-account="' + escapeMarkup(person.id) + '" aria-label="' + (person.is_active ? 'Désactiver ' : 'Activer ') + escapeMarkup(person.display_name) + '">' + (person.is_active ? 'Désactiver' : 'Activer') + '</button>' : '') +
      '</div></td></tr>';
    }).join("") + '</tbody></table></div>';
    return '<section class="administration-accounts" data-administration-accounts><div class="administration-view-heading"><button class="ss-button ss-button--secondary" type="button" data-admin-home><i data-lucide="arrow-left"></i> Centre Administration</button><div><span>COMPTES / PERSONNEL / RÔLES</span><h3>Comptes et accès</h3><p>staff.manage et roles.manage restent deux autorisations indépendantes.</p></div>' + (canManage ? '<button class="ss-button" type="button" data-open-invite><i data-lucide="user-plus"></i> Inviter un membre</button>' : '') + '</div><div class="administration-boundaries"><span>' + boundary + '</span><span>' + (canManage ? 'staff.manage + school vérifiés' : 'staff.manage absent') + '</span></div>' + notice + content + roleAssignmentMarkup() + inviteMarkup() + toggleMarkup() + '</section>';
  }

  function dashboardMarkup(allowed) {
    return '<section class="administration-summary" aria-label="Résumé des accès"><div><strong>' + allowed.length + ' domaine' + (allowed.length > 1 ? 's' : '') + ' autorisé' + (allowed.length > 1 ? 's' : '') + ' sur ' + SECTIONS.length + '</strong><span>Utilisateur → Rôle → Permission → Portée → Condition → Exception</span></div><span>Administrateur sans bypass implicite</span></section>' +
      (allowed.length ? '<div class="administration-grid">' + allowed.map(renderCard).join("") + '</div>' : '<div class="administration-empty"><i data-lucide="shield-off"></i><h3>Administration non autorisée</h3><p>Aucune permission avec portée compatible n’est accordée à cette session.</p></div>');
  }

  function permissionDomain(permission) {
    return String(permission && permission.code || "other").split(".")[0] || "other";
  }

  function permissionOperation(permission) {
    var code = String(permission && permission.code || "");
    if (/\.manage$/.test(code)) return "manage";
    if (/\.read$/.test(code)) return "read";
    return "other";
  }

  function filteredPermissions() {
    var filters = state.permissionFilters;
    var query = filters.query.trim().toLowerCase();
    var exactCode = filters.code.trim().toLowerCase();
    return (state.permissionCatalog || []).filter(function (permission) {
      var code = String(permission.code || "");
      var label = String(permission.label || "");
      if (query && (code + " " + label).toLowerCase().indexOf(query) < 0) return false;
      if (filters.domain !== "all" && permissionDomain(permission) !== filters.domain) return false;
      if (filters.operation !== "all" && permissionOperation(permission) !== filters.operation) return false;
      if (filters.scope !== "all" && permission.scope !== filters.scope) return false;
      if (exactCode && code.toLowerCase() !== exactCode) return false;
      return true;
    });
  }

  function optionMarkup(values, selected, allLabel) {
    return '<option value="all">' + escapeMarkup(allLabel) + '</option>' + values.map(function (value) {
      return '<option value="' + escapeMarkup(value) + '"' + (value === selected ? ' selected' : '') + '>' + escapeMarkup(value) + '</option>';
    }).join("");
  }

  function renderPermissions() {
    if (!canUse(state.user, "roles.manage", "school")) {
      return '<section class="administration-empty" data-permission-catalog><i data-lucide="shield-off"></i><h3>Catalogue non autorisé</h3><p>roles.manage + school requis ; DENY prioritaire.</p></section>';
    }
    if (state.permissionsLoading) return '<section class="administration-empty" data-permission-catalog><i data-lucide="loader-2"></i><h3>Chargement du catalogue canonique…</h3></section>';
    if (state.permissionsError) return '<section class="administration-empty" data-permission-catalog><i data-lucide="wifi-off"></i><h3>Catalogue indisponible</h3><p>' + escapeMarkup(state.permissionsError) + '</p></section>';
    var catalog = state.permissionCatalog || [];
    var domains = Array.from(new Set(catalog.map(permissionDomain))).sort();
    var scopes = Array.from(new Set(catalog.map(function (permission) { return permission.scope || "none"; }))).sort();
    var rows = filteredPermissions();
    return '<section class="administration-permissions" data-permission-catalog>' +
      '<div class="administration-view-heading"><button class="ss-button ss-button--secondary" type="button" data-admin-home><i data-lucide="arrow-left"></i> Centre Administration</button><div><span>LECTURE SEULE</span><h3>Catalogue des permissions</h3><p>Source canonique · shared/permissions.json</p></div><span class="administration-readonly"><i data-lucide="lock-keyhole"></i> Aucun droit d’édition</span></div>' +
      '<div class="administration-permission-filters"><label>Rechercher une permission<input type="search" data-permission-filter="query" value="' + escapeMarkup(state.permissionFilters.query) + '"></label><label>Domaine<select data-permission-filter="domain">' + optionMarkup(domains, state.permissionFilters.domain, "Tous") + '</select></label><label>Opération<select data-permission-filter="operation"><option value="all">Toutes</option><option value="read"' + (state.permissionFilters.operation === "read" ? ' selected' : '') + '>read</option><option value="manage"' + (state.permissionFilters.operation === "manage" ? ' selected' : '') + '>manage</option><option value="other"' + (state.permissionFilters.operation === "other" ? ' selected' : '') + '>autre</option></select></label><label>Portée<select data-permission-filter="scope">' + optionMarkup(scopes, state.permissionFilters.scope, "Toutes") + '</select></label><label>Code exact<input type="search" data-permission-filter="code" value="' + escapeMarkup(state.permissionFilters.code) + '"></label></div>' +
      '<div class="administration-catalog-count"><strong>' + rows.length + '</strong> permission' + (rows.length > 1 ? 's' : '') + ' affichée' + (rows.length > 1 ? 's' : '') + '</div>' +
      (rows.length ? '<div class="administration-table-wrap"><table class="administration-table administration-permission-table"><thead><tr><th>Code</th><th>Libellé</th><th>Domaine</th><th>Portée par défaut</th><th>Type</th></tr></thead><tbody>' + rows.map(function (permission) {
        return '<tr data-permission-row><td><code>' + escapeMarkup(permission.code) + '</code></td><td>' + escapeMarkup(permission.label) + '</td><td>' + escapeMarkup(permissionDomain(permission)) + '</td><td>' + escapeMarkup(permission.scope || "none") + '</td><td>' + escapeMarkup(permissionOperation(permission)) + '</td></tr>';
      }).join("") + '</tbody></table></div>' : '<div class="administration-empty"><i data-lucide="search-x"></i><h3>Aucune permission</h3><p>Aucun code canonique ne correspond aux filtres.</p></div>') + '</section>';
  }

  function loadPermissions() {
    var access = global.SchoolSafeAccess;
    if (state.permissionsLoading || state.permissionCatalog) return;
    if (!access || typeof access.loadPermissions !== "function") {
      state.permissionsError = "SchoolSafeAccess indisponible";
      render(state.containerId, state.user, state.options);
      return;
    }
    state.permissionsLoading = true;
    render(state.containerId, state.user, state.options);
    access.loadPermissions().then(function (permissions) {
      state.permissionCatalog = asList(permissions);
      state.permissionsError = "";
    }).catch(function (error) {
      state.permissionsError = error && error.message ? error.message : "Source canonique indisponible";
    }).finally(function () {
      state.permissionsLoading = false;
      render(state.containerId, state.user, state.options);
    });
  }

  function bindPermissions(container) {
    var home = container.querySelector("[data-admin-home]");
    if (home) home.addEventListener("click", function () { open("dashboard"); });
    container.querySelectorAll("[data-permission-filter]").forEach(function (control) {
      control.addEventListener(control.tagName === "SELECT" ? "change" : "input", function () {
        state.permissionFilters[control.getAttribute("data-permission-filter")] = control.value;
        render(state.containerId, state.user, state.options);
        var replacement = global.document.querySelector('[data-permission-filter="' + control.getAttribute("data-permission-filter") + '"]');
        if (replacement && replacement.tagName !== "SELECT") {
          replacement.focus();
          replacement.setSelectionRange(replacement.value.length, replacement.value.length);
        }
      });
    });
  }

  function contextRequirement(scopeType) {
    return {
      own_children: { key: "childId", list: "childIds" },
      assigned_classes: { key: "classId", list: "assignedClassIds" },
      assigned_subjects: { key: "subjectId", list: "assignedSubjectIds" },
      assigned_portal: { key: "portalId", list: "assignedPortalIds" },
      school: { key: "schoolId", list: null }
    }[scopeType] || null;
  }

  function inspectAccess(user, permission, expectedScope, context) {
    var access = global.SchoolSafeAccess;
    var safeUser = user || {};
    var safeContext = context || {};
    if (!access || typeof access.explicitDeny !== "function" || typeof access.canAccess !== "function" || typeof access.scopeFor !== "function" || typeof access.allowsScope !== "function") {
      return { allowed: false, status: "REFUSÉ", permission: permission, scope: null, exception: "NONE", reason: "MOTEUR_INDISPONIBLE" };
    }
    if (access.explicitDeny(safeUser, permission)) {
      return { allowed: false, status: "DENY EXPLICITE", permission: permission, scope: null, exception: "DENY", reason: "DENY_PRIORITAIRE" };
    }
    if (!access.canAccess(safeUser, permission)) {
      return { allowed: false, status: "PERMISSION ABSENTE", permission: permission, scope: null, exception: "NONE", reason: "PERMISSION_ABSENTE" };
    }
    var grantedScope = access.scopeFor(safeUser, permission);
    if (!grantedScope || !grantedScope.type) {
      return { allowed: false, status: "CONTEXTE MANQUANT", permission: permission, scope: null, exception: "NONE", reason: "PORTEE_ABSENTE" };
    }
    if (expectedScope && !access.allowsScope(safeUser, permission, expectedScope)) {
      return { allowed: false, status: "SCOPE INCOMPATIBLE", permission: permission, scope: grantedScope.type, exception: "NONE", reason: "PORTEE_ATTENDUE_" + expectedScope };
    }
    var requirement = contextRequirement(grantedScope.type);
    if (grantedScope.type === "own") {
      if (!(safeUser.userId || safeUser.profileId || (safeUser.profile && safeUser.profile.id))) {
        return { allowed: false, status: "CONTEXTE MANQUANT", permission: permission, scope: grantedScope.type, exception: "NONE", reason: "UTILISATEUR_MANQUANT" };
      }
    } else if (requirement) {
      var value = safeContext[requirement.key];
      if (!value && requirement.key === "schoolId") value = safeUser.schoolId;
      if (!value) return { allowed: false, status: "CONTEXTE MANQUANT", permission: permission, scope: grantedScope.type, exception: "NONE", reason: requirement.key.toUpperCase() + "_MANQUANT" };
      var assigned = requirement.list && Array.isArray(safeUser[requirement.list]) ? safeUser[requirement.list] : null;
      if (assigned && assigned.indexOf(value) < 0) return { allowed: false, status: "SCOPE INCOMPATIBLE", permission: permission, scope: grantedScope.type, exception: "NONE", reason: "CONTEXTE_HORS_PORTEE" };
      if (requirement.key === "schoolId" && safeUser.schoolId && safeUser.schoolId !== value) return { allowed: false, status: "SCOPE INCOMPATIBLE", permission: permission, scope: grantedScope.type, exception: "NONE", reason: "ECOLE_HORS_PORTEE" };
    }
    var allowException = Array.isArray(safeUser.permissionExceptions) && safeUser.permissionExceptions.some(function (item) {
      return item && item.permission === permission && String(item.effect || "").toLowerCase() === "allow";
    });
    return { allowed: true, status: "AUTORISÉ", permission: permission, scope: grantedScope.type, exception: allowException ? "ALLOW" : "NONE", reason: "ACCESS_LAW_AUTORISE" };
  }

  function inspectorContext(scopeType, contextId) {
    var user = state.user || {};
    if (scopeType === "own_children") return { childId: contextId };
    if (scopeType === "assigned_classes") return { classId: contextId };
    if (scopeType === "assigned_subjects") return { subjectId: contextId };
    if (scopeType === "assigned_portal") return { portalId: contextId };
    if (scopeType === "school") return { schoolId: contextId || user.schoolId };
    return {};
  }

  function renderInspector() {
    if (!canUse(state.user, "roles.manage", "school")) return '<section class="administration-empty" data-access-inspector><i data-lucide="shield-off"></i><h3>Inspecteur non autorisé</h3><p>roles.manage + school requis.</p></section>';
    var input = state.inspectorInput;
    var result = inspectAccess(state.user, input.permission, input.scope, inspectorContext(input.scope, input.contextId));
    var exceptionLabel = result.exception === "NONE" ? "Aucune" : result.exception;
    var chain = [
      ["Utilisateur", (state.user && (state.user.userId || (state.user.profile && state.user.profile.id))) || "Contexte utilisateur"],
      ["Rôle", (state.user && (state.user.role || (state.user.roles || []).join(", "))) || "Aucun rôle implicite"],
      ["Permission", input.permission],
      ["Portée", result.scope || input.scope],
      ["Contexte", input.contextId || (input.scope === "school" && state.user.schoolId) || (input.scope === "own" ? "Utilisateur courant" : "Non fourni")],
      ["Exception", exceptionLabel],
      ["Résultat", result.status]
    ];
    return '<section class="administration-inspector" data-access-inspector>' +
      '<div class="administration-view-heading"><button class="ss-button ss-button--secondary" type="button" data-admin-home><i data-lucide="arrow-left"></i> Centre Administration</button><div><span>DIAGNOSTIC UNIQUEMENT</span><h3>Inspecteur d’accès effectif</h3><p>Aucune permission, portée ou exception n’est modifiée.</p></div><span class="administration-readonly"><i data-lucide="scan-search"></i> Access_Law</span></div>' +
      '<form class="administration-inspector-form"><label>Permission<input name="permission" value="' + escapeMarkup(input.permission) + '"></label><label>Portée attendue<select name="scope">' + ["own", "own_children", "assigned_classes", "assigned_subjects", "assigned_portal", "school"].map(function (scope) { return '<option value="' + scope + '"' + (input.scope === scope ? ' selected' : '') + '>' + scope + '</option>'; }).join("") + '</select></label><label>Identifiant de contexte<input name="contextId" value="' + escapeMarkup(input.contextId) + '" placeholder="classe, enfant, matière, portail ou école"></label><button class="ss-button" type="submit">Inspecter</button></form>' +
      '<div class="administration-access-chain">' + chain.map(function (step, index) { return '<article><span>' + (index + 1) + '</span><div><strong>' + escapeMarkup(step[0]) + '</strong><small>' + escapeMarkup(step[1]) + '</small></div></article>'; }).join("") + '</div>' +
      '<div class="administration-inspection-result administration-inspection-result--' + (result.allowed ? 'allowed' : 'denied') + '"><strong>' + escapeMarkup(result.status) + '</strong><span>' + escapeMarkup(result.reason) + '</span></div></section>';
  }

  function bindInspector(container) {
    var home = container.querySelector("[data-admin-home]");
    if (home) home.addEventListener("click", function () { open("dashboard"); });
    var form = container.querySelector(".administration-inspector-form");
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      state.inspectorInput = { permission: form.permission.value.trim(), scope: form.scope.value, contextId: form.contextId.value.trim() };
      render(state.containerId, state.user, state.options);
    });
  }

  function simulateAccessLaw(user, draft) {
    var source = user || {};
    var input = draft || {};
    var simulatedUser = Object.assign({}, source, {
      role: input.baseRole || source.role,
      permissions: Array.isArray(source.permissions) ? source.permissions.slice() : [],
      scopes: Array.isArray(source.scopes) ? source.scopes.map(function (scope) { return Object.assign({}, scope); }) : [],
      permissionExceptions: Array.isArray(source.permissionExceptions) ? source.permissionExceptions.map(function (item) { return Object.assign({}, item); }) : []
    });
    var exception = {
      permission: input.permission,
      effect: String(input.effect || "allow").toLowerCase(),
      scope: input.scope,
      condition: input.condition || "",
      justification: input.justification || ""
    };
    simulatedUser.permissionExceptions.push(exception);
    var context = {};
    if (input.scope === "school") context.schoolId = input.contextId || simulatedUser.schoolId;
    if (input.scope === "own_children") context = { childId: input.contextId };
    if (input.scope === "assigned_classes") context = { classId: input.contextId };
    if (input.scope === "assigned_subjects") context = { subjectId: input.contextId };
    if (input.scope === "assigned_portal") context = { portalId: input.contextId };
    return {
      boundary: "SIMULATION UNIQUEMENT",
      draft: Object.assign({}, input),
      simulatedUser: simulatedUser,
      result: inspectAccess(simulatedUser, input.permission, input.scope, context)
    };
  }

  function renderSimulation() {
    if (!canUse(state.user, "roles.manage", "school")) return '<section class="administration-empty" data-access-simulation><i data-lucide="shield-off"></i><h3>Simulation non autorisée</h3><p>roles.manage + school requis.</p></section>';
    var draft = state.simulationDraft;
    var outcome = state.simulationResult;
    var scopes = ["own", "own_children", "assigned_classes", "assigned_subjects", "assigned_portal", "school"];
    return '<section class="administration-simulation" data-access-simulation>' +
      '<div class="administration-view-heading"><button class="ss-button ss-button--secondary" type="button" data-admin-home><i data-lucide="arrow-left"></i> Centre Administration</button><div><span>GESTION FINE ACCESS_LAW — BACKEND_LATER</span><h3>Simulation des accès</h3><p>Le résultat reste éphémère en mémoire et ne modifie jamais la session réelle.</p></div><span class="administration-simulation-badge">SIMULATION UNIQUEMENT</span></div>' +
      '<form class="administration-simulation-form"><label>Rôle de base<input name="baseRole" value="' + escapeMarkup(draft.baseRole) + '"></label><label>Permission additionnelle<input name="permission" value="' + escapeMarkup(draft.permission) + '" required></label><label>Portée<select name="scope">' + scopes.map(function (scope) { return '<option value="' + scope + '"' + (draft.scope === scope ? ' selected' : '') + '>' + scope + '</option>'; }).join("") + '</select></label><label>Effet<select name="effect"><option value="allow"' + (draft.effect === "allow" ? ' selected' : '') + '>ALLOW</option><option value="deny"' + (draft.effect === "deny" ? ' selected' : '') + '>DENY</option></select></label><label>Condition<input name="condition" value="' + escapeMarkup(draft.condition) + '" placeholder="Diagnostic uniquement"></label><label>Justification<textarea name="justification" rows="3">' + escapeMarkup(draft.justification) + '</textarea></label><label>Identifiant de contexte<input name="contextId" value="' + escapeMarkup(draft.contextId) + '" placeholder="Optionnel selon la portée"></label><button class="ss-button" type="submit">Simuler l’impact</button></form>' +
      (outcome ? '<div class="administration-simulation-result"><div><span>Utilisateur réel</span><strong>INCHANGÉ</strong></div><div><span>Exception simulée</span><strong>' + escapeMarkup(String(outcome.draft.effect || "").toUpperCase()) + '</strong></div><div><span>Résultat</span><strong>' + escapeMarkup(outcome.result.status) + '</strong></div><p>' + escapeMarkup(outcome.result.reason) + ' · condition et justification limitées à cette simulation.</p></div>' : '<div class="administration-empty"><i data-lucide="flask-conical"></i><h3>Aucune simulation exécutée</h3><p>Renseignez une exception temporaire pour observer son impact sans mutation.</p></div>') +
      '</section>';
  }

  function bindSimulation(container) {
    var home = container.querySelector("[data-admin-home]");
    if (home) home.addEventListener("click", function () { open("dashboard"); });
    var form = container.querySelector(".administration-simulation-form");
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      state.simulationDraft = { baseRole: form.baseRole.value.trim(), permission: form.permission.value.trim(), scope: form.scope.value, effect: form.effect.value, condition: form.condition.value.trim(), justification: form.justification.value.trim(), contextId: form.contextId.value.trim() };
      state.simulationResult = simulateAccessLaw(state.user, state.simulationDraft);
      render(state.containerId, state.user, state.options);
    });
  }

  function renderJaspeGovernance() {
    var policy = global.SchoolSafeJaspeGovernance;
    if (!canUse(state.user, "roles.manage", "school")) return '<section class="administration-empty" data-jaspe-governance><i data-lucide="shield-off"></i><h3>Gouvernance Jaspe non autorisée</h3><p>roles.manage + school requis pour cette vue de diagnostic.</p></section>';
    if (!policy || typeof policy.summarize !== "function") return '<section class="administration-empty" data-jaspe-governance><i data-lucide="wifi-off"></i><h3>Politique Jaspe indisponible</h3></section>';
    var summary = policy.summarize(state.user || {});
    return '<section class="administration-jaspe" data-jaspe-governance>' +
      '<div class="administration-view-heading"><button class="ss-button ss-button--secondary" type="button" data-admin-home><i data-lucide="arrow-left"></i> Centre Administration</button><div><span>GOUVERNANCE LOGICIELLE</span><h3>Contrôle de Jaspe</h3><p>Visibilité d’un module ≠ permission et Jaspe n’élargit jamais l’accès utilisateur.</p></div><span class="administration-jaspe-limit">JASPE &lt;= UTILISATEUR</span></div>' +
      '<div class="administration-jaspe-base administration-jaspe-base--' + (summary.base.allowed ? 'allowed' : 'denied') + '"><div><span>Permission de sécurité</span><strong>safe.assistant.use</strong></div><div><span>Portée obligatoire</span><strong>own</strong></div><div><span>État</span><strong>' + (summary.base.allowed ? 'AUTORISÉ' : 'REFUSÉ') + '</strong></div><small>' + escapeMarkup(summary.base.reason) + '</small></div>' +
      '<div class="administration-jaspe-domains">' + summary.domains.map(function (domain) {
        return '<article class="administration-jaspe-domain administration-jaspe-domain--' + (domain.allowed ? 'allowed' : 'denied') + '"><header><strong>' + escapeMarkup(domain.label) + '</strong><span>' + (domain.allowed ? 'AUTORISÉ' : 'REFUSÉ') + '</span></header><p>' + escapeMarkup(domain.permission || "Permission métier absente") + '</p><small>' + escapeMarkup(domain.scope || "Aucune portée compatible") + ' · ' + escapeMarkup(domain.reason) + '</small></article>';
      }).join("") + '</div>' +
      '<aside class="administration-jaspe-boundary"><i data-lucide="ban"></i><div><strong>Aucun pouvoir d’administration délégué</strong><p>Jaspe ne modifie ni rôle, ni permission, ni portée, ni exception et ne peut exécuter une action refusée.</p></div></aside></section>';
  }

  function bindJaspeGovernance(container) {
    var home = container.querySelector("[data-admin-home]");
    if (home) home.addEventListener("click", function () { open("dashboard"); });
  }

  function loadAccounts() {
    var api = global.SchoolSafeSchoolAPI;
    if (state.accountsLoading || state.staff) return;
    if (!api || typeof api.listStaff !== "function" || typeof api.listRoles !== "function") {
      state.accountsError = "API École indisponible";
      render(state.containerId, state.user, state.options);
      return;
    }
    state.accountsLoading = true;
    render(state.containerId, state.user, state.options);
    Promise.all([api.listStaff(), api.listRoles()]).then(function (result) {
      state.staff = asList(result[0]);
      state.roles = asList(result[1]);
      state.accountsError = "";
    }).catch(function (error) {
      state.accountsError = error && error.message ? error.message : "Source non connectée";
    }).finally(function () {
      state.accountsLoading = false;
      render(state.containerId, state.user, state.options);
    });
  }

  function updateConfirmationState(form) {
    var confirmed = form.querySelector('input[name="confirmed"]');
    var submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = !confirmed || !confirmed.checked;
  }

  function bindAccounts(container) {
    var home = container.querySelector("[data-admin-home]");
    if (home) home.addEventListener("click", function () { open("dashboard"); });
    container.querySelectorAll("[data-assign-roles]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.selectedStaffId = button.getAttribute("data-assign-roles");
        state.mutationPanel = null;
        state.notice = "";
        render(state.containerId, state.user, state.options);
      });
    });
    container.querySelectorAll("[data-toggle-account]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.selectedStaffId = null;
        state.mutationPanel = "toggle:" + button.getAttribute("data-toggle-account");
        state.notice = "";
        render(state.containerId, state.user, state.options);
      });
    });
    var inviteButton = container.querySelector("[data-open-invite]");
    if (inviteButton) inviteButton.addEventListener("click", function () {
      state.selectedStaffId = null;
      state.mutationPanel = "invite";
      state.notice = "";
      render(state.containerId, state.user, state.options);
    });
    container.querySelectorAll("[data-cancel-mutation]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.selectedStaffId = null;
        state.mutationPanel = null;
        render(state.containerId, state.user, state.options);
      });
    });

    var roleForm = container.querySelector("[data-role-assignment] form");
    if (roleForm) {
      roleForm.querySelector('input[name="confirmed"]').addEventListener("change", function () { updateConfirmationState(roleForm); });
      roleForm.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!canUse(state.user, "roles.manage", "school")) return;
        var roleIds = Array.prototype.map.call(roleForm.querySelectorAll('input[name="role"]:checked'), function (input) { return input.value; });
        var submit = roleForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        global.SchoolSafeSchoolAPI.updateStaffRoles(state.selectedStaffId, roleIds).then(function () {
          var person = (state.staff || []).find(function (item) { return item.id === state.selectedStaffId; });
          if (person) person.roles = (state.roles || []).filter(function (role) { return roleIds.indexOf(role.id) >= 0; });
          state.notice = "Rôles mis à jour par le backend.";
          state.selectedStaffId = null;
          render(state.containerId, state.user, state.options);
        }).catch(function (error) {
          state.notice = (error && error.message ? error.message : "Mutation indisponible") + " · BACKEND_LATER";
          render(state.containerId, state.user, state.options);
        });
      });
    }

    var inviteForm = container.querySelector("[data-invite-staff] form");
    if (inviteForm) {
      inviteForm.querySelector('input[name="confirmed"]').addEventListener("change", function () { updateConfirmationState(inviteForm); });
      inviteForm.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!canUse(state.user, "staff.manage", "school")) return;
        var submit = inviteForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        global.SchoolSafeSchoolAPI.inviteStaff({ first_name: inviteForm.first_name.value, last_name: inviteForm.last_name.value, email: inviteForm.email.value }).then(function () {
          state.notice = "Invitation confirmée par le backend.";
          state.mutationPanel = null;
          render(state.containerId, state.user, state.options);
        }).catch(function (error) {
          state.notice = (error && error.message ? error.message : "Invitation indisponible") + " · BACKEND_LATER";
          render(state.containerId, state.user, state.options);
        });
      });
    }

    var toggleButton = container.querySelector("[data-confirm-toggle]");
    if (toggleButton) toggleButton.addEventListener("click", function () {
      if (!canUse(state.user, "staff.manage", "school")) return;
      var id = toggleButton.getAttribute("data-confirm-toggle");
      var person = (state.staff || []).find(function (item) { return item.id === id; });
      if (!person) return;
      toggleButton.disabled = true;
      global.SchoolSafeSchoolAPI.toggleStaffActive(id, !person.is_active).then(function () {
        person.is_active = !person.is_active;
        state.notice = "Statut mis à jour par le backend.";
        state.mutationPanel = null;
        render(state.containerId, state.user, state.options);
      }).catch(function (error) {
        state.notice = (error && error.message ? error.message : "Statut indisponible") + " · BACKEND_LATER";
        render(state.containerId, state.user, state.options);
      });
    });
  }

  function render(containerId, user, options) {
    state.containerId = containerId || state.containerId;
    state.user = user || state.user || {};
    state.options = options || state.options || {};
    var container = global.document && global.document.getElementById(state.containerId);
    if (!container) return;
    var allowed = visibleSections(state.user);
    container.hidden = false;
    container.innerHTML =
      '<header class="administration-header">' +
        '<button class="ss-button ss-button--secondary" type="button" data-admin-close><i data-lucide="arrow-left"></i> Tableau de bord</button>' +
        '<div><span>Administration / Accès / Jaspe logiciel</span><h2>Centre Administration</h2><p>Vue de contrôle frontend : chaque surface exige sa permission et sa portée réelles.</p></div>' +
        '<span class="administration-header__badge"><i data-lucide="shield-check"></i> DENY explicite prioritaire</span>' +
      '</header>' +
      (state.activeView === "accounts" ? renderAccounts() : state.activeView === "permissions" ? renderPermissions() : state.activeView === "inspector" ? renderInspector() : state.activeView === "simulation" ? renderSimulation() : state.activeView === "jaspe" ? renderJaspeGovernance() : dashboardMarkup(allowed));

    var closeButton = container.querySelector("[data-admin-close]");
    if (closeButton) closeButton.addEventListener("click", function () {
      if (typeof state.options.onClose === "function") state.options.onClose(); else container.hidden = true;
    });
    container.querySelectorAll("[data-admin-link]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-admin-link");
        if (target === "school" && typeof state.options.openSchool === "function") state.options.openSchool();
        if (target === "staff" && typeof state.options.openStaff === "function") state.options.openStaff();
      });
    });
    container.querySelectorAll("[data-admin-open]").forEach(function (button) {
      button.addEventListener("click", function () { open(button.getAttribute("data-admin-open")); });
    });
    if (state.activeView === "accounts") {
      bindAccounts(container);
      if (!state.staff && !state.accountsLoading && !state.accountsError) loadAccounts();
    }
    if (state.activeView === "permissions") {
      bindPermissions(container);
      if (!state.permissionCatalog && !state.permissionsLoading && !state.permissionsError) loadPermissions();
    }
    if (state.activeView === "inspector") bindInspector(container);
    if (state.activeView === "simulation") bindSimulation(container);
    if (state.activeView === "jaspe") bindJaspeGovernance(container);
    if (global.lucide && typeof global.lucide.createIcons === "function") global.lucide.createIcons();
  }

  function setSession(user) {
    state.user = user || {};
    render(state.containerId, state.user, state.options);
  }

  function open(view) {
    state.activeView = ["accounts", "permissions", "inspector", "simulation", "jaspe"].indexOf(view) >= 0 ? view : "dashboard";
    state.notice = "";
    state.selectedStaffId = null;
    state.mutationPanel = null;
    render(state.containerId, state.user, state.options);
  }

  function close() {
    var container = global.document && global.document.getElementById(state.containerId);
    if (container) container.hidden = true;
  }

  global.SchoolSafeAdministration = { render: render, setSession: setSession, open: open, close: close, canUse: canUse, visibleSections: visibleSections, inspectAccess: inspectAccess, simulateAccessLaw: simulateAccessLaw };
})(window);
