(function () {
  "use strict";

  var screens = {
    splash: document.getElementById("splash"),
    auth: document.getElementById("auth"),
    profileChoice: document.getElementById("profileChoice"),
    setup: document.getElementById("setup"),
    workspace: document.getElementById("workspace")
  };
  var toastTimer = null;
  var rotationTimer = null;
  var imageIndex = 0;
  var imageFront = "A";
  var loginImages = []; // Stable: portraits withheld pending usage evidence.
  var schoolMediaLibrary = []; // Stable: portraits withheld pending usage evidence.

  var apiBaseMeta = document.querySelector('meta[name="schoolsafe-api-base"]');
  var apiBase = window.SCHOOLSAFE_API_BASE
    || (apiBaseMeta && apiBaseMeta.content)
    || (["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname)
      ? "http://127.0.0.1:8787" : window.location.origin);
  window.schoolSafeApiBase = apiBase;
  var currentSession = null;
  var schoolBrandingRevision = 0;
  var schoolLogoRequest = null;
  var schoolLogoObjectUrl = null;
  var backendConfig = null;
  var pendingPhone = null;
  var setupToken = null;

  var SESSION_STORAGE_KEY = "schoolsafe-v2-session";
  function tryLocalStorage() { try { return window.localStorage; } catch (e) { return null; } }
  function trySessionStorage() { try { return window.sessionStorage; } catch (e) { return null; } }
  function storageFor(key) { return key === SESSION_STORAGE_KEY ? trySessionStorage() : tryLocalStorage(); }
  function storageGet(key) { var s = storageFor(key); return s ? s.getItem(key) : null; }
  function storageSet(key, value) { var s = storageFor(key); if (s) s.setItem(key, value); }
  function storageRemove(key) { var s = storageFor(key); if (s) s.removeItem(key); }

  // Une ancienne session persistante ne doit pas survivre à la migration vers
  // une session limitée à l'onglet. Les autres préférences restent locales.
  var legacySessionStorage = tryLocalStorage();
  if (legacySessionStorage) legacySessionStorage.removeItem(SESSION_STORAGE_KEY);

  function normalizePhone(raw) {
    var digits = String(raw || "").replace(/\D/g, "");
    // Ordre IDENTIQUE à auth.normalize_login : préfixe 00, indicatif 243,
    // zéro national (RDC) — la même entrée donne la même identité des deux côtés.
    if (digits.indexOf("00") === 0) digits = digits.substring(2);
    if (digits.indexOf("243") === 0 && digits.length > 9) digits = digits.substring(3);
    if (digits.indexOf("0") === 0) digits = digits.substring(1);
    return "+243" + digits;
  }

  async function loadBackendConfig() {
    try {
      var res = await fetch(apiBase + "/config", { method: "GET", headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      backendConfig = await res.json();
      window.schoolSafeBackendConfig = backendConfig;
      return backendConfig;
    } catch (e) {
      return null;
    }
  }

  async function apiPost(path, body) {
    var res = await fetch(apiBase + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var message = data && data.message ? data.message : ("Erreur " + res.status);
      throw new Error(message);
    }
    return data;
  }

  async function validateSetupToken(token) {
    var config = await loadBackendConfig();
    if (!config) throw new Error("Serveur de configuration non disponible.");
    var result = await apiPost("/setup/validate-token", { token: token });
    if (!result || !result.valid) throw new Error("Token de configuration invalide.");
    setupToken = token;
    renderStep();
    showScreen("setup");
  }

  function hasLiveSession() {
    return !!(currentSession && (currentSession.native === true || currentSession.token));
  }

  function currentApiToken() {
    if (currentSession && currentSession.token) return currentSession.token;
    try {
      var raw = storageGet("schoolsafe-v2-session");
      if (!raw) return null;
      var session = JSON.parse(raw);
      return session && session.token ? session.token : null;
    } catch (e) { return null; }
  }

  async function apiGetAuth(path) {
    var token = currentApiToken();
    var res = await fetch(apiBase + path, {
      method: "GET",
      headers: { Accept: "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var message = data && data.message ? data.message : ("Erreur " + res.status);
      throw new Error(message);
    }
    return data;
  }

  async function apiPostAuth(path, body) {
    var token = currentApiToken();
    var res = await fetch(apiBase + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: JSON.stringify(body)
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var message = data && data.message ? data.message : ("Erreur " + res.status);
      throw new Error(message);
    }
    return data;
  }

  function storeSession(session) {
    currentSession = session;
    if (session) storageSet("schoolsafe-v2-session", JSON.stringify(session));
    else storageRemove("schoolsafe-v2-session");
  }

  function loadSession() {
    try {
      var raw = storageGet("schoolsafe-v2-session");
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearSession() {
    currentSession = null;
    storageRemove("schoolsafe-v2-session");
    if (window.SchoolSafeSync && typeof window.SchoolSafeSync.setSchoolContext === "function") {
      window.SchoolSafeSync.setSchoolContext(null);
    }
    renderSchoolBranding();
  }

  function applyBootstrap(bootstrap) {
    if (!bootstrap || !bootstrap.profile || !bootstrap.roles || !bootstrap.roles.length) {
      throw new Error("Profil incomplet");
    }
    var savedActiveRole = storageGet("schoolsafe-v2-active-role");
    var activeRole = bootstrap.roles.indexOf(savedActiveRole) >= 0 ? savedActiveRole : bootstrap.roles[0];
    var session = {
      token: currentSession && currentSession.token ? currentSession.token : null,
      native: Boolean((currentSession && currentSession.native) || bootstrap.native),
      profile: bootstrap.profile,
      roles: bootstrap.roles,
      permissions: bootstrap.permissions || [],
      scopes: bootstrap.scopes || [],
      deniedPermissions: bootstrap.deniedPermissions || bootstrap.denied_permissions || [],
      permissionExceptions: bootstrap.permissionExceptions || bootstrap.permission_exceptions || [],
      childIds: bootstrap.childIds || bootstrap.child_ids || bootstrap.linked_child_ids,
      assignedClassIds: bootstrap.assignedClassIds || bootstrap.assigned_class_ids,
      assignedSubjectIds: bootstrap.assignedSubjectIds || bootstrap.assigned_subject_ids,
      assignedPortalIds: bootstrap.assignedPortalIds || bootstrap.assigned_portal_ids,
      schoolId: bootstrap.schoolId || bootstrap.school_id || (bootstrap.school && bootstrap.school.id) || null,
      school: bootstrap.school || null,
      offline_policy: bootstrap.offline_policy || { max_offline_hours: 24 }
    };
    if (Object.prototype.hasOwnProperty.call(bootstrap, "deniedRules")) {
      try {
        session.deniedRules = window.SchoolSafeAccess.normalizeDeniedRules(bootstrap.deniedRules);
      } catch (_) {
        clearSession();
        var invalidAccess = new Error("Projection des droits invalide. Reconnectez-vous.");
        invalidAccess.status = 401;
        invalidAccess.code = "INVALID_ACCESS_PROJECTION";
        throw invalidAccess;
      }
    }
    storeSession(session);
    storageSet("schoolsafe-v2-active-role", activeRole);
    // INC-4 : la file hors-ligne suit le contexte école — un changement
    // d'école purge l'ancien état offline (aucune permission héritée du cache).
    if (window.SchoolSafeSync && typeof window.SchoolSafeSync.setSchoolContext === "function") {
      window.SchoolSafeSync.setSchoolContext(session.schoolId || null);
    }
    function setText(id, text) {
      var el = document.getElementById(id);
      if (el) el.textContent = text;
    }
    setText("workspaceProfileName", bootstrap.profile.display_name || "");
    setText("workspaceInitials", initialsFromName(bootstrap.profile.display_name || "SchoolSafe"));
    setText("workspaceSchoolName", bootstrap.school ? bootstrap.school.name : "Toutes les écoles");
    setText("workspaceRole", roleCatalog[activeRole] ? roleCatalog[activeRole].label : activeRole);
    setText("statusRole", roleCatalog[activeRole] ? roleCatalog[activeRole].label : activeRole);
    setText("statusScope", scopeSummary(session));
    setText("syncStatusDetail", "Connecté · " + (bootstrap.school ? bootstrap.school.name : "école"));
    renderWorkspace(activeRole);
  }

  function initialsFromName(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(function (w) { return w.length > 0; })
      .slice(0, 2)
      .map(function (w) { return w[0].toUpperCase(); })
      .join("");
  }

  function scopeSummary(session) {
    if (!session || !session.scopes || !session.scopes.length) return "Instance";
    var parts = session.scopes.map(function (s) { return s.label || s.type + (s.id ? " · " + s.id : ""); });
    return parts.join(" · ") || "Instance";
  }

  /**
   * Construit le contexte utilisateur pour le moteur d’autorisation central.
   * En session réelle : currentSession.
   * En démonstration sans session : projection frontend explicite des permissions.
   * Elle ne crée aucun droit backend et permet aux modules de passer par Access_Law sans bypass de rôle.
   */
  var DEMO_PERMISSIONS_BY_ROLE = {
    admin: ["school.manage", "staff.read", "staff.manage", "roles.manage", "school.student.read", "school.student.create", "school.student.activate", "school.guardian.read", "security.pickup.read", "school.enrollment.manage", "school.student.transfer", "school.student.archive", "school.class.read", "school.structure.manage", "security.events.read", "security.card.create", "pedagogy.grade.read", "pedagogy.assignment.read", "pedagogy.assignment.manage", "finance.status.read", "finance.report.read", "reports.financial.read", "finance.cash_register.close", "safe.assistant.use", "canteen.manage", "communication.message.send"],
    admissions: ["school.student.read", "school.student.create"],
    parent: ["school.student.read", "school.guardian.read", "security.pickup.read", "security.events.read", "pedagogy.assignment.read", "pedagogy.grade.read", "pedagogy.report.read", "palmarques.read", "finance.status.read", "finance.fee.read", "finance.receipt.read", "communication.message.send", "safe.assistant.use"],
    teacher: ["school.student.read", "school.class.read", "pedagogy.subject.read", "pedagogy.assignment.read", "pedagogy.assignment.manage", "pedagogy.grade.read", "pedagogy.grade.manage", "pedagogy.lesson-plan.read", "pedagogy.lesson-plan.manage", "safe.assistant.use"],
    pedagogy: ["school.student.read", "school.class.read", "pedagogy.subject.read", "pedagogy.assignment.read", "pedagogy.grade.read", "pedagogy.lesson-plan.read", "pedagogy.report.read", "pedagogy.report.manage", "palmarques.read", "safe.assistant.use"],
    guard: ["security.scan", "security.pickup.manage", "safe.assistant.use"],
    school_head: ["finance.report.read", "reports.financial.read", "safe.assistant.use"],
    finance: ["finance.fee.read", "finance.fee.manage", "finance.receipt.read", "finance.report.read", "finance.cash_register.close", "finance.control.read", "finance.control.manage", "finance.status.read", "reports.operational.read", "safe.assistant.use"],
    accountant: ["reports.financial.read", "finance.report.read", "finance.receipt.read", "safe.assistant.use"],
    hr: ["staff.read", "staff.manage", "staff.attendance.read", "reports.hr.read", "safe.assistant.use"],
    cashier: ["finance.payment.record", "finance.receipt.read", "finance.status.read", "safe.assistant.use"],
    communication: ["communication.message.send", "communication.announcement.manage", "notification.subscribe", "email.send", "safe.assistant.use"]
  };

  var DEMO_ACCESS_CONTEXT_BY_ROLE = {
    admin: {
      scopes: [
        { type: "school" },
        { permission: "school.manage", type: "school" },
        { permission: "staff.read", type: "school" },
        { permission: "staff.manage", type: "school" },
        { permission: "roles.manage", type: "school" },
        { permission: "school.student.read", type: "school" },
        { permission: "school.class.read", type: "school" },
        { permission: "security.card.create", type: "school" },
        { permission: "pedagogy.assignment.read", type: "school" },
        { permission: "pedagogy.assignment.manage", type: "school" },
        { permission: "finance.status.read", type: "school" },
        { permission: "finance.report.read", type: "school" },
        { permission: "reports.financial.read", type: "school" },
        { permission: "safe.assistant.use", type: "own" }
      ]
    },
    admissions: { scopes: [{ type: "school" }] },
    parent: {
      profile: { id: "demo-parent-1" },
      childIds: ["demo-parent-child-lucas", "demo-parent-child-emma", "demo-draft-student"],
      scopes: [
        { permission: "school.student.read", type: "own_children" },
        { permission: "school.guardian.read", type: "own_children" },
        { permission: "security.pickup.read", type: "own_children" },
        { permission: "security.events.read", type: "own_children" },
        { permission: "pedagogy.assignment.read", type: "own_children" },
        { permission: "pedagogy.grade.read", type: "own_children" },
        { permission: "pedagogy.report.read", type: "own_children" },
        { permission: "palmarques.read", type: "own_children" },
        { permission: "finance.status.read", type: "own_children" },
        { permission: "finance.fee.read", type: "own_children" },
        { permission: "finance.receipt.read", type: "own_children" },
        { permission: "communication.message.send", type: "own_children" },
        { permission: "safe.assistant.use", type: "own" }
      ]
    },
    teacher: {
      assignedClassIds: ["demo-class-1", "demo-class-2"],
      assignedSubjectIds: ["demo-subject-math", "demo-subject-french"],
      scopes: [
        { permission: "school.student.read", type: "assigned_classes" },
        { permission: "school.class.read", type: "assigned_classes" },
        { permission: "pedagogy.subject.read", type: "assigned_subjects" },
        { permission: "pedagogy.assignment.read", type: "assigned_classes" },
        { permission: "pedagogy.assignment.manage", type: "assigned_classes" },
        { permission: "pedagogy.grade.read", type: "assigned_classes" },
        { permission: "pedagogy.grade.manage", type: "assigned_classes" },
        { permission: "pedagogy.lesson-plan.read", type: "assigned_classes" },
        { permission: "pedagogy.lesson-plan.manage", type: "assigned_classes" },
        { permission: "safe.assistant.use", type: "own" }
      ]
    },
    pedagogy: {
      assignedClassIds: ["demo-class-1", "demo-class-2"],
      assignedSubjectIds: ["demo-subject-math", "demo-subject-french"],
      scopes: [
        { permission: "school.student.read", type: "assigned_classes" },
        { permission: "school.class.read", type: "assigned_classes" },
        { permission: "pedagogy.subject.read", type: "assigned_subjects" },
        { permission: "pedagogy.assignment.read", type: "assigned_classes" },
        { permission: "pedagogy.grade.read", type: "assigned_classes" },
        { permission: "pedagogy.lesson-plan.read", type: "assigned_classes" },
        { permission: "pedagogy.report.read", type: "assigned_classes" },
        { permission: "pedagogy.report.manage", type: "assigned_classes" },
        { permission: "palmarques.read", type: "assigned_classes" },
        { permission: "safe.assistant.use", type: "own" }
      ]
    },
    guard: {
      assignedPortalIds: ["demo-portal-main"],
      scopes: [
        { permission: "security.scan", type: "assigned_portal", portalIds: ["demo-portal-main"] },
        { permission: "security.pickup.manage", type: "assigned_portal", portalIds: ["demo-portal-main"] },
        { permission: "safe.assistant.use", type: "own" }
      ]
    },
    finance: {
      scopes: [
        { permission: "finance.fee.read", type: "school" },
        { permission: "finance.fee.manage", type: "school" },
        { permission: "finance.receipt.read", type: "school" },
        { permission: "finance.report.read", type: "school" },
        { permission: "finance.cash_register.close", type: "school" },
        { permission: "finance.control.read", type: "school" },
        { permission: "finance.control.manage", type: "school" },
        { permission: "finance.status.read", type: "school" },
        { permission: "reports.operational.read", type: "school" },
        { permission: "safe.assistant.use", type: "own" }
      ]
    },
    school_head: {
      scopes: [
        { permission: "finance.report.read", type: "school" },
        { permission: "reports.financial.read", type: "school" },
        { permission: "safe.assistant.use", type: "own" }
      ]
    },
    accountant: {
      scopes: [
        { permission: "reports.financial.read", type: "school" },
        { permission: "finance.report.read", type: "school" },
        { permission: "finance.receipt.read", type: "school" },
        { permission: "safe.assistant.use", type: "own" }
      ]
    },
    hr: {
      scopes: [
        { permission: "staff.read", type: "school" },
        { permission: "staff.manage", type: "school" },
        { permission: "staff.attendance.read", type: "school" },
        { permission: "reports.hr.read", type: "school" },
        { permission: "safe.assistant.use", type: "own" }
      ]
    },
    communication: {
      scopes: [
        { permission: "communication.message.send", type: "school" },
        { permission: "communication.announcement.manage", type: "school" },
        { permission: "notification.subscribe", type: "own" },
        { permission: "email.send", type: "school" },
        { permission: "safe.assistant.use", type: "own" }
      ]
    },
    cashier: {
      scopes: [
        { permission: "finance.payment.record", type: "school" },
        { permission: "finance.receipt.read", type: "school" },
        { permission: "finance.status.read", type: "school" },
        { permission: "safe.assistant.use", type: "own" }
      ]
    }
  };

  function getCurrentUser() {
    if (hasLiveSession()) {
      return Object.assign({}, currentSession, {
        role: currentDemoRole,
        profileId: currentSession.profile && currentSession.profile.id,
        schoolId: currentSession.schoolId || (currentSession.school && currentSession.school.id) || null
      });
    }
    var role = currentDemoRole || "admin";
    var context = DEMO_ACCESS_CONTEXT_BY_ROLE[role] || {};
    return {
      userId: context.profile && context.profile.id ? context.profile.id : "demo-" + role + "-1",
      schoolId: "demo-school-1",
      role: role,
      permissions: (DEMO_PERMISSIONS_BY_ROLE[role] || []).slice(),
      profile: context.profile || null,
      childIds: (context.childIds || []).slice(),
      assignedClassIds: (context.assignedClassIds || []).slice(),
      assignedSubjectIds: (context.assignedSubjectIds || []).slice(),
      assignedPortalIds: (context.assignedPortalIds || []).slice(),
      scopes: (context.scopes || []).map(function (scope) { return Object.assign({}, scope); })
    };
  }

  function canManageRoles(user) {
    var access = window.SchoolSafeAccess;
    if (!access || typeof access.canAccess !== "function" || typeof access.allowsScope !== "function") return false;
    if (typeof access.explicitDeny === "function" && access.explicitDeny(user || {}, "roles.manage")) return false;
    return access.canAccess(user || {}, "roles.manage") && access.allowsScope(user || {}, "roles.manage", "school");
  }

  function bindDocumentRuntimeContext(selectedContext) {
    if (!window.SchoolSafeDocumentRuntime || typeof window.SchoolSafeDocumentRuntime.bindContext !== "function") {
      return Promise.reject(new Error("Contexte documentaire indisponible"));
    }
    var binding = window.SchoolSafeDocumentRuntime.bindContext({
      user: getCurrentUser(),
      mode: hasLiveSession() ? "live" : "demo",
      selectedContext: selectedContext || {}
    });
    window.SchoolSafeDocumentContextReady = binding;
    return binding;
  }

  window.SchoolSafeAppContext = {
    getAssistantContext: function () {
      return { activeRole: currentDemoRole, user: getCurrentUser() };
    },
    getCurrentUser: getCurrentUser,
    refreshDocuments: bindDocumentRuntimeContext,
    openDocuments: openDocumentCenter,
    openAccounting: function (tab) {
      openAccountingModule();
      if (tab && window.SchoolSafeAccountingTreasury && typeof window.SchoolSafeAccountingTreasury.open === "function") {
        window.SchoolSafeAccountingTreasury.open(tab);
      }
    },
    openHr: function (tab) {
      openHrModule();
      if (tab && window.SchoolSafeHrDemo && typeof window.SchoolSafeHrDemo.open === "function") {
        window.SchoolSafeHrDemo.open(tab);
      }
    },
    openInventory: function (tab) {
      openInventoryModule();
      if (tab && window.SchoolSafeInventoryDemo && typeof window.SchoolSafeInventoryDemo.open === "function") {
        window.SchoolSafeInventoryDemo.open(tab);
      }
    },
    openCommunication: function (tab) {
      openCommunicationModule(tab);
    },
    openAdministration: function () {
      openAdministrationModule();
    },
    prepareCommunicationHandoff: function (payload) {
      if (!window.SchoolSafeCommunication || typeof window.SchoolSafeCommunication.prepareHandoff !== "function") return { allowed: false, reason: "MODULE_INDISPONIBLE" };
      var result = window.SchoolSafeCommunication.prepareHandoff(payload, getCurrentUser());
      if (result.allowed) openCommunicationModule("messages");
      return result;
    },
    openDocuments: function () {
      openDocumentCenter();
    },
    showDashboard: function () {
      showDashboard();
    }
  };

  function setWorkspaceDashboardVisible(visible) {
    var dashboardContainer = document.getElementById("dashboardContainer");
    var parentPortal = document.getElementById("parentPortal");
    var teacherPortal = document.getElementById("teacherPedagogyPortal");
    var guardPortal = document.getElementById("guardSecurityPortal");
    var isParent = currentDemoRole === "parent";
    var isTeacher = currentDemoRole === "teacher";
    var isGuard = currentDemoRole === "guard";
    if (dashboardContainer) dashboardContainer.hidden = !visible || isParent || isTeacher || isGuard;
    var jaspeWelcome = document.getElementById("jaspeDashboardWelcome");
    if (jaspeWelcome) jaspeWelcome.hidden = !visible;
    if (parentPortal) {
      parentPortal.hidden = !visible || !isParent;
      if (visible && isParent && window.SchoolSafeParentPortal) {
        window.SchoolSafeParentPortal.render("parentPortal", getCurrentUser());
      } else if (!isParent && window.SchoolSafeParentPortal && typeof window.SchoolSafeParentPortal.clear === "function") {
        window.SchoolSafeParentPortal.clear();
      }
    }
    if (teacherPortal) {
      teacherPortal.hidden = !visible || !isTeacher;
      if (visible && isTeacher && window.SchoolSafeTeacherPedagogy) {
        window.SchoolSafeTeacherPedagogy.render("teacherPedagogyPortal", getCurrentUser());
      } else if ((!visible || !isTeacher) && window.SchoolSafeTeacherPedagogy && typeof window.SchoolSafeTeacherPedagogy.clear === "function") {
        window.SchoolSafeTeacherPedagogy.clear();
      }
    }
    if (guardPortal) {
      guardPortal.hidden = !visible || !isGuard;
      if (visible && isGuard && window.SchoolSafeGuardSecurity) {
        window.SchoolSafeGuardSecurity.render("guardSecurityPortal", getCurrentUser());
      } else if ((!visible || !isGuard) && window.SchoolSafeGuardSecurity && typeof window.SchoolSafeGuardSecurity.clear === "function") {
        window.SchoolSafeGuardSecurity.clear();
      }
    }
    if (window.SafeAssistant && typeof window.SafeAssistant.setDashboardVisible === "function") {
      window.SafeAssistant.setDashboardVisible(visible);
    }
  }

  /**
   * Affiche le dashboard et masque les modules métier.
   */
  function showDashboard() {
    setWorkspaceDashboardVisible(true);
    var modules = ["pedagogyModule", "financeModule", "accountingModule", "hrModule", "inventoryModule", "communicationModule", "documentCenterModule", "administrationModule", "securityModule", "pilotageModule", "feeControlModule", "accessConsole", "schoolModule"];
    modules.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    var cardsProtected = document.getElementById("cardsProtected");
    if (cardsProtected) cardsProtected.hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    setBreadcrumb(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Met à jour le fil d’Ariane. Si moduleLabel est null, le breadcrumb est masqué.
   */
  function setBreadcrumb(moduleLabel) {
    var breadcrumb = document.getElementById("workspaceBreadcrumb");
    var moduleItem = document.getElementById("workspaceBreadcrumbModule");
    if (!breadcrumb || !moduleItem) return;
    if (!moduleLabel) {
      breadcrumb.hidden = true;
      return;
    }
    moduleItem.textContent = moduleLabel;
    breadcrumb.hidden = false;
  }

  /**
   * Gestion des dropdowns du topbar.
   */
  function closeAllDropdowns() {
    document.querySelectorAll(".topbar-dropdown").forEach(function (dropdown) { dropdown.hidden = true; });
    document.querySelectorAll("[aria-haspopup='true']").forEach(function (btn) { btn.setAttribute("aria-expanded", "false"); });
  }

  function toggleDropdown(dropdownId, buttonId) {
    var dropdown = document.getElementById(dropdownId);
    var button = document.getElementById(buttonId);
    if (!dropdown) return;
    var isHidden = dropdown.hidden;
    closeAllDropdowns();
    dropdown.hidden = !isHidden;
    if (button) button.setAttribute("aria-expanded", String(!dropdown.hidden));
  }

  function bindTopbarDropdown(buttonId, dropdownId) {
    var button = document.getElementById(buttonId);
    if (!button || button.__ssDropdownBound) return;
    button.__ssDropdownBound = true;
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleDropdown(dropdownId, buttonId);
    });
  }

  /**
   * FAB menu — actions rapides selon les permissions.
   */
  function renderFabMenu(user) {
    var container = document.getElementById("workspaceFabMenuActions");
    if (!container) return;
    var access = window.SchoolSafeAccess;
    var actions = (access && typeof access.getAllowedQuickActions === "function")
      ? access.getAllowedQuickActions(user)
      : [];
    if (actions.length === 0) {
      container.innerHTML = window.ssState({ type: "empty", title: "Aucune action rapide disponible.", message: "Aucune action rapide n’est autorisée pour ce profil.", size: "compact" });
      icons();
      return;
    }
    container.innerHTML = actions.map(function (action) {
      return '<button class="ss-fab-menu__action" type="button" data-fab-action="' + action.key + '"><span class="ss-fab-menu__icon"><i data-lucide="' + action.icon + '"></i></span><span>' + escapeMarkup(action.label) + '</span></button>';
    }).join("");
    container.querySelectorAll("[data-fab-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-fab-action");
        toggleFabMenu(false);
        if (key === "record-payment") { openModuleByBranch("finance"); return; }
        if (key === "scan-qr") { openModuleByBranch("security"); return; }
        if (key === "publish-assignment") { openModuleByBranch("pedagogy"); return; }
        if (key === "send-message") { openCommunicationModule("messages"); return; }
      });
    });
    icons();
  }

  function toggleFabMenu(show) {
    var menu = document.getElementById("workspaceFabMenu");
    var fab = document.querySelector('[data-bottom-nav="create"]');
    if (!menu) return;
    menu.hidden = !show;
    if (fab) fab.setAttribute("aria-expanded", String(show));
  }

  function enterDemo() {
    // Le toast reflète le rôle de démonstration réellement sélectionné (FE-CLOTURE-CNX-01).
    var demoSelect = document.getElementById("demoRole");
    var demoLabel = demoSelect && demoSelect.options && demoSelect.options[demoSelect.selectedIndex]
      ? demoSelect.options[demoSelect.selectedIndex].textContent.trim()
      : null;
    var english = document.documentElement.lang === "en";
    notify(demoLabel
      ? (english
          ? "Demo access — opening the “" + demoLabel + "” preview."
          : "Accès de démonstration — ouverture de l’espace « " + demoLabel + " ».")
      : (english
          ? "Demo access enabled."
          : "Accès de démonstration activé."));
    window.schoolSafeDemoMode = !hasLiveSession();
    // INC-4 renforcé : la démo déclare son propre contexte local explicite
    // (jamais une vraie école, jamais synchronisé vers un serveur).
    if (window.SchoolSafeSync && typeof window.SchoolSafeSync.setSchoolContext === "function") {
      window.SchoolSafeSync.setSchoolContext("demo-local");
    }
    window.setTimeout(function () { showScreen("workspace"); }, 250);
  }

  function enterLiveSession() {
    notify("Connexion réussie. Chargement de l’espace.");
    window.setTimeout(function () { showScreen("workspace"); }, 250);
  }

  var branchDefinitions = {
    pilotage: { label: "Pilotage", icon: "layout-dashboard", color: "#1d4ed8", background: "#dbeafe" },
    school: { label: "École", icon: "school", color: "#1d4ed8", background: "#eff6ff" },
    pedagogy: { label: "Pédagogie", icon: "book-open-check", color: "#7c3aed", background: "#f5f3ff" },
    security: { label: "Sécurité et contrôle", icon: "shield-check", color: "#1e293b", background: "#f1f5f9" },
    finance: { label: "Finance", icon: "wallet-cards", color: "#d97706", background: "#fffbeb" },
    feeControl: { label: "Contrôle des frais", icon: "badge-check", color: "#0f766e", background: "#f0fdfa" },
    accounting: { label: "Comptabilité", icon: "landmark", color: "#3a6ea5", background: "#eef3f8" },
    people: { label: "Personnel", icon: "contact-round", color: "#8e4585", background: "#faf5f9" },
    inventory: { label: "Stock / Inventaire", icon: "package-search", color: "#0f766e", background: "#f0fdfa" },
    communication: { label: "Communication", icon: "messages-square", color: "#0ea5e9", background: "#f0f9ff" },
    care: { label: "Vie et bien-être", icon: "heart-pulse", color: "#1d4ed8", background: "#dbeafe" },
    administration: { label: "Administration", icon: "folder-cog", color: "#1e3a8a", background: "#e8edf5" },
    reports: { label: "Contrôle et rapports", icon: "chart-no-axes-combined", color: "#1e40af", background: "#dbeafe" }
  };

  function group(label, actions) { return { label: label, actions: actions }; }
  function branch(key, description, groups) { return { key: key, description: description, groups: groups }; }

  var roleCatalog = {
    admin: {
      label: "Administrateur principal", short: "Administrateur", initials: "AP", scope: "Toute l’instance · tous les cycles et services", eyebrow: "Pilotage global",
      welcome: "Pilotez l’établissement depuis un espace unifié.", copy: "Les branches sont organisées par métier; les actions sensibles restent séparées des simples consultations.",
      today: [["Alertes prioritaires","3 à examiner","triangle-alert"],["Validations","7 en attente","badge-check"],["Présence globale","Vue de l’école","users"],["Rapports","Prêts à consulter","file-chart-column"]],
      branches: [
        branch("pilotage","Décider avec une vue consolidée",[group("Vue exécutive",[["Tableau de bord","layout-dashboard"],["Statistiques","chart-no-axes-combined"],["Alertes importantes","triangle-alert"],["Indicateurs","gauge"]])]),
        branch("school","Administrer les élèves et leur parcours",[group("Scolarité",[["Élèves","users"],["Classes","school"],["Parent principal et tuteurs","contact-round"],["Inscriptions et réinscriptions","clipboard-pen-line"]]),group("Organisation",[["Année scolaire","calendar-range"],["Affectations","git-branch"],["Import massif","file-up"],["Documents élèves","files"]])]),
        branch("people","Gérer les équipes et leurs affectations",[group("Équipe",[["Enseignants","graduation-cap"],["Personnel","contact-round"],["Affectations","user-cog"],["Contrats","files"]]),group("Temps et paie",[["Présence du personnel","fingerprint"],["Biométrie","scan-face"],["Salaires","banknote"],["Avances, primes et retenues","hand-coins"]])]),
        branch("pedagogy","Suivre l’apprentissage et les résultats",[group("Organisation pédagogique",[["Matières","book-open"],["Emplois du temps","calendar-range"],["Présences, absences et retards","clipboard-check"],["Devoirs et corrections","notebook-pen"]]),group("Évaluation",[["Évaluations et notes","star"],["Moyennes et coefficients","calculator"],["Bulletins","file-text"],["Palmarès","trophy"]]),group("Accompagnement",[["Rattrapage pédagogique","life-buoy"],["Cahiers de préparation","book-open-check"]]),group("Épreuves certificatives",[["ENAFEP","scroll-text"],["TENASOSP","compass"],["EXETAT","badge-check"]])]),
        branch("security","Superviser les accès et les sorties",[group("Action et contrôle",[["Scanner un QR","scan-line"],["Entrées","log-in"],["Sorties","log-out"],["Préparer une sortie","clock-3"]]),group("Autorisation et suivi",[["Personnes autorisées","contact-round"],["Confirmer ou refuser une sortie","badge-check"],["Alertes et anomalies","siren"],["Historique des passages","history"]])]),
        branch("finance","Contrôler la situation financière",[group("Frais et caisse",[["Structure des frais","settings"],["Encaissements","wallet"],["Reçus PDF","receipt-text"],["Impayés et soldes","badge-alert"]]),group("Trésorerie",[["Recettes et dépenses","arrow-left-right"],["Rapports de caisse","file-chart-column"],["Clôtures","lock-keyhole"],["Exports financiers","file-down"]])]),
        branch("accounting","Tenir et contrôler la comptabilité",[group("Écritures",[["Plan comptable","list-tree"],["Journal comptable","notebook-tabs"],["Grand livre","book-copy"],["Écritures comptables","file-pen-line"]]),group("États",[["Balance","scale"],["Rapprochements","list-checks"],["États financiers","file-chart-column"],["Rapports SYSCOHADA","landmark"]])]),
        branch("inventory","Gérer le stock et les achats internes",[group("Stock",[["Stock / Inventaire","package-search"],["Catalogue articles","boxes"],["Emplacements et seuils","warehouse"],["Mouvements","arrow-left-right"]]),group("Achats internes",[["Demandes d’achat","clipboard-list"],["Commandes","shopping-cart"],["Réceptions","package-check"],["Rapports Stock","file-chart-column"]])]),
        branch("communication","Informer la communauté scolaire",[group("Échanges",[["Messages","messages-square"],["Notifications","bell"],["Annonces","megaphone"],["Convocations","mail-plus"]]),group("Publication",[["Site public et WebSync","globe-2"],["Événements","calendar-days"]])]),
        branch("administration","Gouverner et conserver les preuves",[group("Configuration",[["École & Personnel","school","execute"]]),group("Administration",[["Documents R2","files"],["Archives","archive"],["Paramètres","settings"],["Comptes et droits","shield-ellipsis"]]),group("Plateforme",[["Français et anglais","languages"],["Mode hors ligne","cloud-off"],["Séparation public et privé","shield-check"]])]),
        branch("reports","Contrôler l’activité",[group("Traçabilité",[["Historiques","history"],["Audit des actions","list-checks"],["Rapports administratifs","file-chart-column"],["Exports PDF et Excel","file-down"]])])
      ]
    },
    guard: {
      label: "Agent de contrôle d’accès", short: "Contrôle d’accès", initials: "GA", scope: "Portail principal · sécurité uniquement", eyebrow: "Sécurité du portail",
      welcome: "Contrôlez les entrées et les sorties sans distraction.", copy: "Les actions immédiates sont prioritaires; les contrôles, la surveillance et l’historique suivent le déroulement réel du poste.",
      today: [["Élèves présents","286 actuellement","users"],["Sorties en attente","4 à contrôler","clock-3"],["Anomalies","1 à examiner","triangle-alert"],["Portail","Principal · actif","door-open"]],
      branches: [branch("security","Portail principal",[
        group("Action immédiate",[["Scanner un QR","scan-line"],["Enregistrer une entrée","log-in"],["Enregistrer une sortie","log-out"]]),
        group("Contrôle",[["Personnes autorisées","contact-round"],["Vérifier l’identité","badge-check"],["Autoriser une sortie","circle-check-big"],["Refuser une sortie","circle-x"]]),
        group("Surveillance",[["Élèves dans l’école","users"],["Sorties en attente","clock-3"],["Alertes et anomalies","siren"]]),
        group("Historique",[["Passages précédents","history"],["Incidents","shield-alert"],["Rechercher","search"]])
      ])]
    },
    teacher: {
      label: "Enseignant", short: "Enseignant", initials: "EN", scope: "Classes affectées · matières autorisées", eyebrow: "Ma journée pédagogique",
      welcome: "Retrouvez immédiatement vos classes et vos priorités.", copy: "SchoolSafe utilise les affectations pour limiter l’espace aux classes, matières et élèves confiés à l’enseignant.",
      today: [["Présence à effectuer","1 classe","clipboard-check"],["Cours prévus","4 aujourd’hui","calendar-clock"],["Devoirs à corriger","18 remises","notebook-tabs"],["Notifications","2 importantes","bell-ring"]],
      branches: [
        branch("school","Mes élèves et classes",[group("Périmètre affecté",[["Élèves de mes classes","users"],["Structure de mes classes","school"]])]),
        branch("pedagogy","Classes et apprentissage",[group("Mes classes",[["6e A","users-round"],["5e A","users-round"],["Emploi du temps","calendar-range"]]),group("Travail pédagogique",[["Présences, absences et retards","clipboard-check"],["Devoirs et corrections","notebook-pen"],["Évaluations et notes","star"],["Cahier de préparation de l’enseignant","book-open-check"]]),group("Suivi des élèves",[["Résultats et moyennes","chart-no-axes-combined"],["Difficultés","triangle-alert"],["Rattrapage pédagogique","life-buoy"],["Bulletins à consulter","file-text"],["Préparation aux épreuves certificatives","scroll-text"]])]),
        branch("communication","Échanges autorisés",[group("Communication",[["Direction","school"],["Parents autorisés","contact-round"],["Notifications","bell"]])])
      ]
    },
    cashier: {
      label: "Agent de caisse", short: "Caisse", initials: "CA", scope: "Point de caisse affecté · opérations d’encaissement", eyebrow: "Opérations du jour",
      welcome: "Encaissez vite et conservez une trace claire.", copy: "L’agent de caisse produit les opérations et les reçus, sans accès aux paramètres financiers généraux.",
      today: [["Encaissements","12 aujourd’hui","wallet"],["Reçus","12 émis","receipt-text"],["À vérifier","2 soldes","search-check"],["Caisse","Ouverte","badge-check"]],
      branches: [branch("finance","Encaissements et reçus",[group("Action immédiate",[["Enregistrer un paiement","circle-plus"],["Versement de rattrapage","hand-coins"],["Rechercher un élève","search"],["Produire un reçu PDF","receipt-text"]]),group("Contrôle",[["Vérifier un paiement","badge-check"],["Consulter le solde et les impayés","wallet-cards"],["Historique du jour","history"],["Demander l’annulation d’un paiement","circle-x"]]),group("Clôture",[["Rapport de caisse","file-chart-column"],["Soumettre la journée","send"]])])]
    },
    school_head: {
      label: "Chef d’établissement", short: "Direction", initials: "CE", scope: "Toute l’école · consultation et approbations", eyebrow: "Direction de l’établissement",
      welcome: "Décidez avec une vue claire de l’école.", copy: "La Direction consulte les domaines stratégiques et approuve les opérations autorisées sans exécuter les tâches de caisse ou de contrôle.",
      today: [["Approbations","7 en attente","badge-check"],["Présence","94 % aujourd’hui","users"],["Alertes","3 prioritaires","triangle-alert"],["Rapports","4 disponibles","file-chart-column"]],
      branches: [branch("pilotage","Vue stratégique",[group("Décision",[["Tableau de bord","layout-dashboard"],["Indicateurs","gauge"],["Alertes","triangle-alert"],["Approbations","badge-check"]])]),branch("school","Suivi administratif",[group("École",[["Élèves et classes","users"],["Inscriptions","clipboard-pen-line"],["Personnel","contact-round"]])]),branch("pedagogy","Suivi scolaire",[group("Résultats",[["Présences","clipboard-check"],["Résultats","chart-no-axes-combined"],["Rattrapage pédagogique","life-buoy"],["Bulletins","file-text"],["Épreuves certificatives","scroll-text"]])]),branch("security","Supervision de la sécurité",[group("Contrôle",[["Entrées et sorties","scan-line"],["Incidents","siren"]])]),branch("finance","Consultation financière",[group("Lecture seule",[["Recettes","wallet"],["Statistiques","chart-pie"],["Imprimer les rapports","printer"]])]),branch("reports","Rapports et audit",[group("Contrôle",[["Rapports","file-chart-column"],["Audit","list-checks"]])])]
    },
    pedagogy: {
      label: "Responsable pédagogique", short: "Pédagogie", initials: "RP", scope: "Cycles et classes affectés", eyebrow: "Pilotage pédagogique",
      welcome: "Coordonnez les classes, les enseignants et les résultats.", copy: "Le périmètre pédagogique dépend des cycles attribués par l’Administrateur principal.",
      today: [["Présences","6 classes à suivre","clipboard-check"],["Évaluations","3 à valider","file-check-2"],["Rattrapage","14 élèves","life-buoy"],["Enseignants","2 suivis requis","graduation-cap"]],
      branches: [branch("pedagogy","Organisation et résultats",[group("Pilotage",[["Pilotage pédagogique","layout-dashboard"]]),group("Organisation",[["Classes","school"],["Matières","book-open"],["Emplois du temps","calendar-range"],["Affectations","git-branch"]]),group("Présence et travail",[["Présences élèves","clipboard-check"],["Absences et retards","calendar-x"],["Devoirs et corrections","notebook-pen"],["Cahiers de préparation des enseignants","book-open-check"]]),group("Évaluation",[["Évaluations et notes","star"],["Moyennes et coefficients","calculator"],["Bulletins","file-text"],["Palmarès","trophy"]]),group("Accompagnement",[["Rattrapage pédagogique","life-buoy"],["Activité enseignants","activity"]]),group("Épreuves certificatives",[["ENAFEP","scroll-text"],["TENASOSP","compass"],["EXETAT","badge-check"]])]),branch("finance","Statut administratif utile au suivi scolaire · aucun montant visible",[group("Régularité scolaire",[["Voir les élèves en ordre ou à régulariser","badge-check","status"]])]),branch("reports","Suivi scolaire",[group("Rapports",[["Statistiques pédagogiques","chart-no-axes-combined"],["Résultats des épreuves certificatives","file-chart-column"]])])]
    },
    admissions: {
      label: "Responsable administratif et admissions", short: "Admissions", initials: "RA", scope: "Admissions et dossiers élèves", eyebrow: "Admissions scolaires",
      welcome: "Traitez les demandes et constituez des dossiers complets.", copy: "L’espace suit le parcours d’une demande jusqu’à l’inscription confirmée.",
      today: [["Préinscriptions","9 nouvelles","clipboard-pen-line"],["À vérifier","5 dossiers","search-check"],["Inscriptions","3 à confirmer","badge-check"],["Doublons","1 alerte","copy-x"]],
      branches: [branch("school","Admissions et élèves",[group("Demandes",[["Préinscriptions","clipboard-pen-line"],["Vérifier les dossiers","search-check"],["Accepter ou refuser","badge-check"]]),group("Inscription",[["Créer l’élève","user-plus"],["Parents et tuteurs","contact-round"],["Personnes autorisées","user-round-check"],["Importer des dossiers","file-up"]])]),branch("administration","Documents d’admission",[group("Documents",[["Attestations","files"],["Archives","archive"],["Rechercher","search"]])])]
    },
    secretary: {
      label: "Secrétaire scolaire", short: "Secrétariat", initials: "SS", scope: "Documents et communication administrative", eyebrow: "Secrétariat",
      welcome: "Préparez les documents et coordonnez les demandes.", copy: "Les actes sensibles restent soumis à l’approbation de la Direction.",
      today: [["Documents","6 à produire","files"],["Rendez-vous","3 aujourd’hui","calendar-clock"],["Convocations","2 à envoyer","send"],["Archives","4 à classer","archive"]],
      branches: [branch("administration","Documents scolaires",[group("Production",[["Attestations","file-badge"],["Certificats","files"],["Convocations","mail-plus"],["Archives","archive"]]),group("Dossiers nationaux",[["Dossiers ENAFEP, TENASOSP et EXETAT","scroll-text"],["Contrôle des identités candidats","search-check"]])]),branch("communication","Accueil et échanges",[group("Communication",[["Messages","messages-square"],["Rendez-vous","calendar-clock"],["Annonces","megaphone"]])])]
    },
    finance: {
      label: "Responsable financier", short: "Finance", initials: "RF", scope: "Tous les modules financiers", eyebrow: "Supervision financière",
      welcome: "Supervisez les recettes, dépenses et contrôles.", copy: "Ce profil paramètre les frais et contrôle la caisse; les encaissements quotidiens restent attribués aux agents de caisse.",
      today: [["Recettes","À consolider","wallet"],["Dépenses","3 à approuver","receipt"],["Impayés","À suivre","badge-alert"],["Caisses","2 ouvertes","landmark"]],
      branches: [branch("finance","Gestion financière",[group("Supervision",[["Tableau financier","chart-pie"],["Contrôle des frais","badge-check"],["Impayés et soldes","badge-alert"],["Rapports financiers","file-chart-column"],["Versement de rattrapage","hand-coins"]]),group("Paramétrage",[["Types de frais","settings"],["Échéances","calendar-range"],["Caisses","landmark"]]),group("Trésorerie",[["Recettes et dépenses","arrow-left-right"],["Clôtures","lock-keyhole"],["Exports","file-down"]])]),branch("accounting","Supervision comptable",[group("Contrôle comptable",[["Journal comptable","notebook-tabs"],["Grand livre","book-copy"],["Balance","scale"],["Rapprochements","list-checks"]]),group("États",[["États financiers","file-chart-column"],["Rapports SYSCOHADA","landmark"]])])]
    },
    accountant: {
      label: "Comptable", short: "Comptabilité", initials: "CO", scope: "Comptabilité et rapports financiers", eyebrow: "Comptabilité",
      welcome: "Tenez les écritures et préparez les états.", copy: "L’accès est centré sur les journaux et les états, sans opérations de guichet.",
      today: [["Écritures","8 à classer","notebook-tabs"],["Rapprochement","À effectuer","list-checks"],["Dépenses","3 pièces","receipt"],["États","Mois en cours","file-chart-column"]],
      branches: [branch("accounting","Comptabilité",[group("Référentiel",[["Plan comptable","list-tree"],["Pièces comptables","files"]]),group("Écritures",[["Journal comptable","notebook-tabs"],["Grand livre","book-copy"],["Écritures comptables","file-pen-line"],["Rapprochement","list-checks"]]),group("États",[["Balance","scale"],["Compte de résultat","chart-no-axes-combined"],["Bilan","landmark"],["Rapports SYSCOHADA","file-chart-column"],["Exports PDF et Excel","file-down"]])])]
    },
    hr: {
      label: "Responsable RH", short: "Ressources humaines", initials: "RH", scope: "Personnel et paie", eyebrow: "Ressources humaines",
      welcome: "Suivez le personnel, les présences et la paie.", copy: "Les informations RH restent séparées des dossiers pédagogiques et financiers des familles.",
      today: [["Présences","2 anomalies","fingerprint"],["Absences","3 demandes","calendar-x"],["Paie","Préparation en cours","banknote"],["Contrats","2 échéances","files"]],
      branches: [branch("people","Gestion du personnel",[group("Dossiers",[["Personnel","contact-round"],["Contrats","files"],["Affectations","user-cog"],["Absences","calendar-x"]]),group("Temps",[["Présence personnel","fingerprint"],["Biométrie","scan-face"]]),group("Rémunération",[["Salaires","banknote"],["Primes","badge-dollar-sign"],["Avances","hand-coins"],["Retenues","circle-minus"]])])]
    },
    nurse: {
      label: "Infirmier", short: "Infirmerie", initials: "IN", scope: "Dossiers santé et incidents médicaux", eyebrow: "Santé scolaire",
      welcome: "Assurez le suivi médical utile à la journée scolaire.", copy: "Seules les informations de santé nécessaires et autorisées apparaissent dans cet espace.",
      today: [["Passages","5 aujourd’hui","heart-pulse"],["Allergies","2 vigilances","triangle-alert"],["Traitements","1 prévu","pill"],["Urgences","Aucune","siren"]],
      branches: [branch("care","Santé et urgences",[group("Action immédiate",[["Enregistrer un passage","clipboard-plus"],["Incident médical","siren"],["Contacter le parent","phone-call"]]),group("Suivi",[["Dossiers santé","heart-pulse"],["Allergies","triangle-alert"],["Traitements autorisés","pill"],["Historique","history"]])])]
    },
    canteen: {
      label: "Responsable cantine", short: "Cantine", initials: "RC", scope: "Service cantine", eyebrow: "Cantine scolaire",
      welcome: "Organisez les repas et les présences au service.", copy: "L’espace cantine ne donne aucun accès aux notes, à la paie ou à la caisse scolaire.",
      today: [["Repas prévus","318","utensils"],["Présences","À confirmer","clipboard-check"],["Allergies","6 signalées","triangle-alert"],["Menus","Semaine active","notebook-tabs"]],
      branches: [branch("care","Service de cantine",[group("Aujourd’hui",[["Présences repas","clipboard-check"],["Service des repas","utensils"],["Allergies","triangle-alert"]]),group("Organisation",[["Menus","notebook-tabs"],["Bénéficiaires","users"],["Historique","history"]]),group("Finance cantine",[["Liaison financière","link-2"]])])]
    },
    communication: {
      label: "Responsable communication et site", short: "Communication", initials: "CM", scope: "Communication et site public", eyebrow: "Communication scolaire",
      welcome: "Informez clairement la communauté scolaire.", copy: "Les publications et messages suivent les circuits d’approbation définis par la Direction.",
      today: [["Messages","7 non lus","messages-square"],["Annonces","2 brouillons","megaphone"],["Notifications","1 urgente","bell-ring"],["Site public","À synchroniser","globe-2"]],
      branches: [branch("communication","Messages et publications",[group("Échanges",[["Messages","messages-square"],["Annonces","megaphone"],["Notifications","bell"],["Convocations","mail-plus"]]),group("Publication",[["Site public","globe-2"],["Galerie","images"],["Événements","calendar-days"],["Synchronisation","refresh-cw"]])])]
    },
    parent: {
      label: "Parent ou responsable légal", short: "Parent", initials: "PR", scope: "Enfants explicitement rattachés", eyebrow: "Suivi de mes enfants",
      welcome: "Suivez l’essentiel de la journée de vos enfants.", copy: "Le parent ne voit que les enfants et documents qui lui sont explicitement rattachés.",
      today: [["Présence","Enfant arrivé","badge-check"],["Sortie","16 h 15 prévue","clock-3"],["Devoirs","2 à consulter","notebook-pen"],["Notifications","1 nouvelle","bell-ring"]],
      branches: [branch("school","Mes enfants",[group("Suivi quotidien",[["Présence et passages","history"],["Emploi du temps","calendar-range"],["Devoirs","notebook-pen"],["Résultats","chart-no-axes-combined"],["Rattrapage pédagogique","life-buoy"],["Épreuves certificatives","scroll-text"]]),group("Démarches",[["Justifier une absence","file-pen-line"],["Personnes autorisées","user-round-check"],["Documents","files"]])]),branch("finance","Situation familiale",[group("Paiements",[["Frais scolaires","wallet-cards"],["Reçus","receipt-text"],["Échéances","calendar-clock"]])]),branch("communication","Échanges avec l’école",[group("Communication",[["Messages","messages-square"],["Convocations","mail-plus"],["Notifications","bell"]])])]
    }
  };

  // Les indicateurs de profil sont désormais chargés via l’API Pilotage.
  // Aucune donnée codée en dur n’est affichée comme réelle.

  var currentDemoRole = "admin";
  Object.defineProperty(window, "currentDemoRole", { get: function () { return currentDemoRole; }, configurable: true });
  Object.defineProperty(window, "currentSession", { get: function () { return currentSession; }, configurable: true });
  var staffSamples = [
    { name: "M. X", initials: "MX", role: "guard", scopeType: "portal", scope: "Portail principal" },
    { name: "Mme Y", initials: "MY", role: "teacher", scopeType: "class", scope: "Classe 4e A" },
    { name: "M. Z", initials: "MZ", role: "pedagogy", scopeType: "cycle", scope: "Cycle primaire", permissions: { "pedagogy::Cahiers de préparation des enseignants": false }, actionLevels: {}, dataViews: { "finance::Voir les élèves en ordre ou à régulariser": "status" } },
    { name: "Mme K", initials: "MK", role: "cashier", scopeType: "service", scope: "Caisse principale" },
    { name: "M. P", initials: "MP", role: "school_head", scopeType: "instance", scope: "Toute l’instance" }
  ];
  var selectedStaffIndex = 0;
  var pedagogyState = {
    activeTab: "assignments",
    selectedAssignment: 0,
    selectedParentChild: 0,
    assignmentDraftMeta: { title: "", className: "1re A", subject: "Mathématiques", language: "FR", type: "Devoir", teacher: "Mme Y", scale: 10, due: "À planifier", prerequisites: "", instructions: "" },
    assignmentDraftQuestions: [
      { text: "Calcule et simplifie les fractions suivantes.", type: "Calcul", points: 4, answerSpace: "Demi-page", choices: "" },
      { text: "Explique la méthode utilisée avec tes propres mots.", type: "Réponse longue", points: 6, answerSpace: "8 lignes", choices: "" }
    ],
    periods: { type: "Trimestres", count: 3, precision: 2, passMark: 50 },
    periodStatuses: [true, false, false],
    weights: { homework: 20, quiz: 30, exam: 50 },
    annualWeights: [1, 1, 1],
    languages: [{ code: "FR", label: "Français", weight: 50 }, { code: "EN", label: "Anglais", weight: 50 }],
    conduct: { teacher: 40, discipline: 60 },
    assignments: [
      { title: "Fractions équivalentes", subject: "Mathématiques", language: "FR", className: "1re A", type: "Devoir", due: "18 août 2026", format: "PDF SchoolSafe", scale: 10, published: true, teacher: "Mme Y", prerequisites: "Fractions simples et tables de multiplication.", instructions: "Résoudre les exercices et présenter les étapes de calcul.", questions: [{ text: "Calcule et simplifie : 2/4, 3/6 et 4/8.", type: "Calcul", points: 4, answerSpace: "Demi-page", choices: "" }, { text: "Explique pourquoi ces fractions sont équivalentes.", type: "Réponse longue", points: 6, answerSpace: "8 lignes", choices: "" }], version: 1, grades: [8, 6.5, null, 9] },
      { title: "Reading comprehension", subject: "Mathematics", language: "EN", className: "1re A", type: "Interrogation", due: "20 août 2026", format: "Texte", scale: 10, published: true, teacher: "Mme Y", prerequisites: "Basic reading vocabulary.", instructions: "Read the instructions and answer in complete sentences.", questions: [], version: 1, grades: [7.5, 8, 6, null] },
      { title: "Reconnaître les formes", subject: "Éveil", language: "FR", className: "Maternelle 3", type: "Activité compensatoire", due: "21 août 2026", format: "Images", scale: 0, published: false, teacher: "Mme Y", prerequisites: "Reconnaître les couleurs.", instructions: "Associer chaque forme à l’illustration correspondante.", questions: [], version: 1, grades: ["Acquis", "En acquisition", "Bien", "Très bien"] }
    ],
    students: [
      { name: "Lucas Martin", initials: "LM", paid: true },
      { name: "Sophie Durand", initials: "SD", paid: true },
      { name: "Ethan Leroy", initials: "EL", paid: false },
      { name: "Chloé Bernard", initials: "CB", paid: true }
    ],
    parentChildren: [
      { name: "Lucas Martin", initials: "LM", className: "1re A", paid: true, average: "14,00 / 20", rank: "5e / 32" },
      { name: "Emma Martin", initials: "EM", className: "Maternelle 3", paid: false, average: "Masquée", rank: "Masqué" }
    ],
    remediation: {
      activeView: "cases",
      selectedCase: 0,
      cases: [
        { student: "Ethan Leroy", initials: "EL", className: "1re A", cycle: "Primaire", month: "Août 2026", subjects: ["Mathématiques FR · 42 %", "Mathematics EN · 46 %"], average: 44, status: "Entretien requis", parentStatus: "Convocation envoyée", teacher: "Non affecté", price: 120000, paid: 0, start: "À confirmer", end: "À confirmer", sessions: [], progress: 44, monthsWithoutProgress: 1, report: "", validated: false, cancelled: false },
        { student: "Sophie Durand", initials: "SD", className: "2e B", cycle: "Secondaire", month: "Août 2026", subjects: ["Sciences FR · 47 %", "English EN · 48 %"], average: 47.5, status: "Suivi en cours", parentStatus: "Entretien effectué", teacher: "Mme Y", price: 150000, paid: 90000, start: "5 août 2026", end: "4 septembre 2026", sessions: [{ date: "7 août", subject: "Sciences FR", present: true }, { date: "10 août", subject: "English EN", present: false }], progress: 55, monthsWithoutProgress: 2, report: "Progrès en lecture des consignes. Renforcer les exercices scientifiques.", validated: false, cancelled: false },
        { student: "Lucas Martin", initials: "LM", className: "1re A", cycle: "Primaire", month: "Juillet 2026", subjects: ["Mathématiques FR · 45 %"], average: 45, status: "Bilan à valider", parentStatus: "Programme terminé", teacher: "Mme Y", price: 100000, paid: 100000, start: "1 juillet 2026", end: "31 juillet 2026", sessions: [{ date: "5 juillet", subject: "Mathématiques FR", present: true }, { date: "12 juillet", subject: "Mathématiques FR", present: true }, { date: "19 juillet", subject: "Mathématiques FR", present: true }], progress: 63, monthsWithoutProgress: 1, report: "Objectifs atteints. Les résultats restent séparés du bulletin officiel.", validated: false, cancelled: false },
        { student: "Noah Diallo", initials: "ND", className: "2e B", cycle: "Secondaire", month: "Août 2026", subjects: ["Mathématiques FR · 38 %", "Mathematics EN · 41 %"], average: 39.5, status: "Alerte renforcée", parentStatus: "Nouvelle convocation requise", teacher: "Mme Y", price: 120000, paid: 60000, start: "2 août 2026", end: "1 septembre 2026", sessions: [{ date: "6 août", subject: "Mathématiques FR", present: true }], progress: 41, monthsWithoutProgress: 6, report: "Sixième mois sans amélioration suffisante.", validated: false, cancelled: false }
      ]
    },
    certifications: {
      activeExam: "ENAFEP",
      activeView: "candidates",
      selectedCandidate: 0,
      filters: { className: "Toutes", center: "Tous", decision: "Tous", option: "Toutes" },
      exams: {
        ENAFEP: {
          label: "ENAFEP",
          fullName: "Examen national de fin d’études primaires",
          cycle: "6e primaire",
          session: "Session 2027",
          dates: "Calendrier national à confirmer",
          candidates: [
            { name: "Lucas Martin", initials: "LM", sex: "Garçon", className: "6e A", number: "EN-00124", center: "Centre 01 · Commune scolaire", dossier: "Complet", preparation: 78, attendance: "Présent", percentage: 76.5, decision: "Réussi", published: true },
            { name: "Sophie Durand", initials: "SD", sex: "Fille", className: "6e A", number: "EN-00125", center: "Centre 01 · Commune scolaire", dossier: "À vérifier", preparation: 68, attendance: "Présent", percentage: 64, decision: "Réussi", published: true },
            { name: "Ethan Leroy", initials: "EL", sex: "Garçon", className: "6e B", number: "À attribuer", center: "À affecter", dossier: "Incomplet", preparation: 46, attendance: "À venir", percentage: null, decision: "En attente", published: false },
            { name: "Chloé Bernard", initials: "CB", sex: "Fille", className: "6e B", number: "EN-00127", center: "Centre 02 · Quartier Nord", dossier: "Complet", preparation: 84, attendance: "Présent", percentage: 81, decision: "Réussi", published: true }
          ]
        },
        TENASOSP: {
          label: "TENASOSP",
          fullName: "Test national de sélection et d’orientation scolaire et professionnelle",
          cycle: "8e du Cycle terminal de l’éducation de base",
          session: "Session 2027",
          dates: "Calendrier national à confirmer",
          candidates: [
            { name: "Noah Diallo", initials: "ND", sex: "Garçon", className: "8e A", number: "TS-00318", center: "Centre 03 · École pilote", dossier: "Complet", preparation: 72, attendance: "À venir", percentage: null, decision: "En attente", published: false },
            { name: "Emma Martin", initials: "EM", sex: "Fille", className: "8e A", number: "TS-00319", center: "Centre 03 · École pilote", dossier: "À vérifier", preparation: 67, attendance: "À venir", percentage: null, decision: "En attente", published: false },
            { name: "Jean Kabeya", initials: "JK", sex: "Garçon", className: "8e B", number: "À attribuer", center: "À affecter", dossier: "Incomplet", preparation: 51, attendance: "À venir", percentage: null, decision: "En attente", published: false }
          ]
        },
        EXETAT: {
          label: "EXETAT",
          fullName: "Examen d’État",
          cycle: "Fin des humanités générales, techniques et professionnelles",
          session: "Session de démonstration 2026",
          dates: "Hors-session du 4 au 19 mai · Session ordinaire du 22 au 25 juin 2026",
          parentCandidateName: "Aline Martin",
          teacherClasses: ["4e Humanités A"],
          preparationAreas: ["Dissertation", "Cours d’option", "Culture générale"],
          phases: [
            { label: "Dossiers et identification", scope: "École", date: "Avant la hors-session", status: "Terminé", detail: "Identité, option, numéro, jury et statut de participation contrôlés localement." },
            { label: "Dissertation", scope: "Hors-session", date: "4 mai 2026", status: "Terminé", detail: "Première épreuve de la hors-session pour le cycle long." },
            { label: "Épreuves techniques", scope: "Hors-session", date: "5 mai 2026", status: "Terminé", detail: "Épreuves organisées selon les options techniques concernées." },
            { label: "Oraux de français et d’anglais", scope: "Hors-session", date: "6 au 9 mai 2026", status: "Terminé", detail: "Présences et incidents suivis sans saisir les résultats nationaux." },
            { label: "Pratique professionnelle", scope: "Hors-session", date: "11 au 18 mai 2026", status: "Terminé", detail: "Étape applicable aux options professionnelles et techniques." },
            { label: "Transmission des copies techniques", scope: "Administration", date: "19 mai 2026", status: "Terminé", detail: "SchoolSafe conserve uniquement la preuve locale de remise." },
            { label: "Session ordinaire", scope: "Épreuve nationale", date: "22 au 25 juin 2026", status: "Terminé", detail: "Suivi des présences, centres, jurys et incidents déclarés par l’école." },
            { label: "Scannage et traitement", scope: "Services officiels", date: "Après les épreuves", status: "Terminé", detail: "Traitement réalisé hors SchoolSafe par les services compétents." },
            { label: "Publication officielle", scope: "Services officiels", date: "Achevée le 12 juillet 2026", status: "Publié", detail: "SchoolSafe peut enregistrer la source et présenter le résultat vérifié, jamais le fabriquer." }
          ],
          candidates: [
            { name: "Aline Martin", initials: "AM", sex: "Fille", className: "4e Humanités A", option: "Sciences", cycleType: "Cycle long", number: "EX-2026-0418", center: "Jury 12 · Kinshasa", jury: "Jury 12", dossier: "Complet", participationStatus: "En ordre", preparation: 82, attendance: "Présente", percentage: 74, decision: "Réussi", published: true },
            { name: "David Kasongo", initials: "DK", sex: "Garçon", className: "4e Humanités A", option: "Pédagogie générale", cycleType: "Cycle long", number: "EX-2026-0419", center: "Jury 12 · Kinshasa", jury: "Jury 12", dossier: "Complet", participationStatus: "En ordre", preparation: 69, attendance: "Présent", percentage: 48.5, decision: "Échoué", published: true },
            { name: "Mireille Lukusa", initials: "ML", sex: "Fille", className: "4e Humanités B", option: "Commerciale et gestion", cycleType: "Cycle long", number: "EX-2026-0432", center: "Jury 14 · Kinshasa", jury: "Jury 14", dossier: "À vérifier", participationStatus: "À vérifier", preparation: 71, attendance: "Présente", percentage: 63, decision: "Réussi", published: true },
            { name: "Patrick Mbala", initials: "PM", sex: "Garçon", className: "4e Humanités B", option: "Électricité", cycleType: "Cycle long", number: "À attribuer", center: "À affecter", jury: "À affecter", dossier: "Incomplet", participationStatus: "À régulariser", preparation: 58, attendance: "À confirmer", percentage: null, decision: "En attente", published: false }
          ]
        }
      }
    }
  };

  function escapeMarkup(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  var deferredInstallPrompt = null;
  var latestSyncState = null;

  function syncOperationIcon(type) {
    return { scan: "scan-line", message: "messages-square", assignment: "notebook-pen", attendance: "clipboard-check", pedagogy: "book-open-check", finance: "landmark", administration: "folder-cog" }[type] || "cloud-upload";
  }

  function syncOperationStatus(status) {
    return { pending: "En attente", syncing: "En cours", failed: "À vérifier", conflict: "Conflit", "demo-synced": "Confirmé localement" }[status] || status;
  }

  function queueOfflineOperation(type, label, payload) {
    if (!window.SchoolSafeSync) return Promise.resolve(null);
    return window.SchoolSafeSync.enqueue({
      type: type,
      label: label,
      payload: payload || {},
      role: currentDemoRole
    }).catch(function () {
      notify("L’opération reste dans l’application, mais la file hors connexion n’a pas pu être ouverte.");
      return null;
    });
  }
  window.queueOfflineOperation = queueOfflineOperation;

  function renderSyncState(state) {
    latestSyncState = state;
    var button = document.getElementById("syncStatusButton");
    if (!button) return;
    var label = document.getElementById("syncStatusLabel");
    var detail = document.getElementById("syncStatusDetail");
    var icon = "badge-check";
    var text = "Synchronisé";
    var subtext = state.mode === "demo-local" ? "Démo locale" : "Serveur requis";
    var className = "sync-status-button is-online";

    if (!state.online) {
      icon = "cloud-off";
      text = "Sans connexion";
      subtext = state.pending + " en attente";
      className = "sync-status-button is-offline";
    } else if (state.syncing) {
      icon = "refresh-cw";
      text = "Synchronisation";
      subtext = state.pending + " opération(s)";
      className = "sync-status-button is-syncing";
    } else if (state.conflicts) {
      icon = "triangle-alert";
      text = state.conflicts + " à vérifier";
      subtext = state.pending + " en attente";
      className = "sync-status-button has-conflict";
    } else if (state.pending) {
      icon = "cloud-upload";
      text = state.pending + " en attente";
      subtext = "Reprise automatique";
      className = "sync-status-button is-syncing";
    }

    button.className = className;
    button.innerHTML = '<i data-lucide="' + icon + '"></i><span><b id="syncStatusLabel">' + text + '</b><small id="syncStatusDetail">' + subtext + "</small></span>";
    button.setAttribute("aria-label", text + ". " + subtext);

    var summary = document.getElementById("syncSummary");
    var summaryClass = !state.online ? "sync-summary offline" : state.conflicts ? "sync-summary problem" : "sync-summary";
    var summaryCopy = !state.online
      ? "Le travail est conservé sur cet appareil. La reprise démarrera automatiquement au retour de la connexion."
      : state.syncing
        ? "SchoolSafe traite la file dans l’ordre de priorité défini. Vous pouvez continuer à travailler."
        : state.conflicts
          ? "Aucune donnée n’a été écrasée. Les éléments signalés devront être contrôlés."
          : "Toutes les opérations de cette prévisualisation ont été confirmées localement.";
    summary.className = summaryClass;
    summary.innerHTML = '<span><i data-lucide="' + icon + '"></i></span><div><b>' + text + '</b><small>' + summaryCopy + "</small></div>";

    var queue = state.operations.slice().sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }).slice(0, 12);
    document.getElementById("syncQueueCount").textContent = state.pending
      ? state.pending + " opération(s) en attente"
      : "Aucune opération en attente";
    document.getElementById("syncQueueList").innerHTML = queue.length ? queue.map(function (operation) {
      var time = new Date(operation.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      return '<article class="sync-operation ' + escapeMarkup(operation.status) + '"><span><i data-lucide="' + syncOperationIcon(operation.type) + '"></i></span><div><b>' + escapeMarkup(operation.label) + '</b><small>' + escapeMarkup(operation.role) + " · " + time + '</small></div><em>' + escapeMarkup(syncOperationStatus(operation.status)) + "</em></article>";
    }).join("") : window.ssState({ type: "empty", title: "Aucune opération hors connexion", message: "Les prochaines opérations hors connexion apparaîtront ici.", size: "inline" });
    icons();
  }

  function openSyncPanel() {
    var panel = document.getElementById("syncPanel");
    var backdrop = document.getElementById("syncPanelBackdrop");
    if (!panel || !backdrop) return;
    panel.hidden = false;
    backdrop.hidden = false;
    var button = document.getElementById("syncStatusButton");
    if (button) button.setAttribute("aria-expanded", "true");
    var closeButton = document.getElementById("closeSyncPanel");
    if (closeButton) closeButton.focus();
  }

  function closeSyncPanel() {
    var panel = document.getElementById("syncPanel");
    var backdrop = document.getElementById("syncPanelBackdrop");
    if (!panel || !backdrop) return;
    panel.hidden = true;
    backdrop.hidden = true;
    var button = document.getElementById("syncStatusButton");
    if (button) {
      button.setAttribute("aria-expanded", "false");
      button.focus();
    }
  }

  function finalizeLocallyConfirmedOperation(operation) {
    if (!operation || operation.type !== "finance" || operation.payload.kind !== "payment") return;
    var mod = window.SchoolSafeFinanceModule;
    if (!mod || !mod._state) return;
    var state = mod._state;
    var transaction = state.transactions.find(function (item) { return item.localReference === operation.payload.localReference; });
    if (!transaction || transaction.status === "Validé") return;
    state.receiptSequence += 1;
    transaction.receipt = "REC-2026-" + String(state.receiptSequence).padStart(4, "0");
    transaction.status = "Validé";
    transaction.date = "14 août 2026 · confirmé localement";
    transaction.syncOperationId = operation.id;
    notify("Opération confirmée localement : reçu officiel de démonstration et notification préparés.");
    if (!document.getElementById("financeModule").hidden && typeof mod.render === "function") mod.render();
  }

  function initPwaExperience() {
    if (!window.SchoolSafeSync) return;
    window.addEventListener("schoolsafe:sync-state", function (event) { renderSyncState(event.detail); });
    window.addEventListener("schoolsafe:operation-synced", function (event) { finalizeLocallyConfirmedOperation(event.detail); });
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      document.getElementById("installPwaButton").hidden = false;
    });
    window.addEventListener("appinstalled", function () {
      deferredInstallPrompt = null;
      document.getElementById("installPwaButton").hidden = true;
      notify("SchoolSafe est installé sur cet appareil.");
    });
    window.SchoolSafeSync.init({
      demoAdapter: function () {
        return new Promise(function (resolve) {
          window.setTimeout(function () { resolve({ mode: "demo-local" }); }, 180);
        });
      }
    });
  }

  function pedagogyTabForAction(actionName) {
    if (/palmarès/i.test(actionName)) return "palmares";
    if (/rattrapage|accompagnement renforcé|versement de rattrapage/i.test(actionName)) return "remediation";
    if (/ENAFEP|TENASOSP|EXETAT|épreuve.*certificative|épreuve.*nationale/i.test(actionName)) return "certifications";
    if (/devoir|cahier/i.test(actionName)) return "assignments";
    if (/évaluation|note|cotation/i.test(actionName)) return "grades";
    if (/moyenne|coefficient/i.test(actionName)) return "rules";
    if (/bulletin|résultat/i.test(actionName)) return "bulletin";
    return "";
  }

  function openPalmaresModule() {
    document.getElementById("accessConsole").hidden = true;
    document.getElementById("administrationModule").hidden = true;
    document.getElementById("financeModule").hidden = true;
    document.getElementById("securityModule").hidden = true;
    document.getElementById("pilotageModule").hidden = true;
    document.getElementById("feeControlModule").hidden = true;
    document.getElementById("pedagogyModule").hidden = true;
    document.getElementById("schoolModule").hidden = true;
    document.getElementById("palmaresModule").hidden = false;
    setWorkspaceDashboardVisible(false);
    document.getElementById("cardsProtected").hidden = true;
    if (window.renderPalmaresModule) {
      window.renderPalmaresModule(document.getElementById("palmaresContent"), getCurrentUser());
    }
    document.querySelector(".workspace-content").scrollTo({ top: 0, behavior: "smooth" });
  }

  function openPedagogyModule(actionName) {
    var requestedTab = pedagogyTabForAction(actionName || "") || (currentDemoRole === "parent" ? "parent" : "assignments");
    if (requestedTab === "palmares") {
      openPalmaresModule();
      return;
    }
    if (/ENAFEP/i.test(actionName || "")) pedagogyState.certifications.activeExam = "ENAFEP";
    if (/TENASOSP/i.test(actionName || "")) pedagogyState.certifications.activeExam = "TENASOSP";
    if (/EXETAT/i.test(actionName || "")) pedagogyState.certifications.activeExam = "EXETAT";
    if (currentDemoRole === "parent" && requestedTab !== "certifications") requestedTab = "parent";
    if (/rattrapage/i.test(actionName || "")) requestedTab = "remediation";
    if (/versement de rattrapage/i.test(actionName || "")) {
      requestedTab = "remediation";
      pedagogyState.remediation.activeView = "finance";
    }
    if (currentDemoRole === "parent" && requestedTab === "remediation") pedagogyState.remediation.activeView = "parent";
    pedagogyState.activeTab = requestedTab;
    document.getElementById("accessConsole").hidden = true;
    document.getElementById("financeModule").hidden = true;
    document.getElementById("securityModule").hidden = true;
    document.getElementById("pilotageModule").hidden = true;
    document.getElementById("feeControlModule").hidden = true;
    document.getElementById("palmaresModule").hidden = true;
    document.getElementById("pedagogyModule").hidden = false;
    setWorkspaceDashboardVisible(false);
    document.getElementById("cardsProtected").hidden = true;
    document.getElementById("pedagogyTabs").hidden = true;
    document.getElementById("pedagogyModuleTitle").textContent = "Pédagogie";
    var newModuleTabs = ["subjects", "assignments", "lesson-plans", "parent-view"];
    if (window.SchoolSafePedagogyModule && newModuleTabs.indexOf(requestedTab) >= 0) {
      window.SchoolSafePedagogyModule.render("pedagogyContent", { tab: requestedTab });
    } else {
      renderPedagogyModule();
    }
    document.querySelector(".workspace-content").scrollTo({ top: 0, behavior: "smooth" });
  }

  function closePedagogyModule() {
    document.getElementById("pedagogyModule").hidden = true;
    document.getElementById("palmaresModule").hidden = true;
    document.getElementById("feeControlModule").hidden = true;
    setWorkspaceDashboardVisible(true);
    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    document.getElementById("workspaceTitle").textContent = "Tableau de bord";
    setBreadcrumb(null);
  }

  function closePalmaresModule() {
    document.getElementById("palmaresModule").hidden = true;
    setWorkspaceDashboardVisible(true);
    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    document.getElementById("workspaceTitle").textContent = "Tableau de bord";
    setBreadcrumb(null);
  }

  function assignmentStatus(item) {
    return item.published ? 'ssBadge({ label: "Publié", variant: "success" })' : 'ssBadge({ label: "Brouillon", variant: "warning" })';
  }

  function renderAssignmentsTab() {
    var canEdit = currentDemoRole !== "parent" && currentDemoRole !== "school_head";
    var selected = pedagogyState.assignments[pedagogyState.selectedAssignment] || pedagogyState.assignments[0];
    var draft = pedagogyState.assignmentDraftMeta;
    var assignmentList = pedagogyState.assignments.map(function (item, index) {
      return '<button class="assignment-row' + (index === pedagogyState.selectedAssignment ? " active" : "") + '" type="button" data-assignment-index="' + index + '"><span class="assignment-format"><i data-lucide="' + (item.format === "PDF" ? "file-text" : item.format === "Images" ? "images" : "align-left") + '"></i></span><span><b>' + escapeMarkup(item.title) + '</b><small>' + escapeMarkup(item.className + " · " + item.subject + " · " + item.language) + '</small></span>' + assignmentStatus(item) + '</button>';
    }).join("");
    var questions = pedagogyState.assignmentDraftQuestions.map(function (question, index) {
      return '<article class="question-editor-row"><header><b>Question ' + (index + 1) + '</b>' + ssIconButton({ icon: "trash-2", variant: "light", title: "Supprimer la question", attrs: { "data-remove-question": index } }) + '</header><label>Énoncé<textarea rows="2" data-question-field="text" data-question-index="' + index + '">' + escapeMarkup(question.text) + '</textarea></label><div><label>Type<select data-question-field="type" data-question-index="' + index + '">' + ["Réponse courte","Réponse longue","Calcul","Dessin","Choix multiple"].map(function (type) { return '<option' + (type === question.type ? " selected" : "") + '>' + type + '</option>'; }).join("") + '</select></label><label>Points<input type="number" min="0" data-question-field="points" data-question-index="' + index + '" value="' + question.points + '"></label><label>Espace de réponse<select data-question-field="answerSpace" data-question-index="' + index + '">' + ["3 lignes","5 lignes","8 lignes","Demi-page","Page entière"].map(function (space) { return '<option' + (space === question.answerSpace ? " selected" : "") + '>' + space + '</option>'; }).join("") + '</select></label></div>' + (question.type === "Choix multiple" ? '<label>Choix séparés par un point-virgule<input data-question-field="choices" data-question-index="' + index + '" value="' + escapeMarkup(question.choices || "") + '"></label>' : "") + '</article>';
    }).join("");
    var creation = canEdit ? '<form class="pedagogy-form assignment-composer" id="assignmentForm"><div class="form-section-title"><span><i data-lucide="file-pen-line"></i></span><div><h3>Composer un devoir SchoolSafe</h3><p>Le contenu saisi sera aligné dans un modèle A4 avec l’identité officielle de l’école.</p></div></div><div class="pedagogy-form-grid"><label>Titre<input name="title" required placeholder="Titre du devoir" value="' + escapeMarkup(draft.title) + '"></label><label>Classe<select name="className">' + ["1re A","2e B","Maternelle 3"].map(function (value) { return '<option' + (draft.className === value ? " selected" : "") + '>' + value + '</option>'; }).join("") + '</select></label><label>Matière<input name="subject" required value="' + escapeMarkup(draft.subject) + '"></label><label>Langue<select name="language">' + ["FR","EN","Autre"].map(function (value) { return '<option' + (draft.language === value ? " selected" : "") + '>' + value + '</option>'; }).join("") + '</select></label><label>Type<select name="type">' + ["Devoir","Interrogation","Examen","Activité compensatoire"].map(function (value) { return '<option' + (draft.type === value ? " selected" : "") + '>' + value + '</option>'; }).join("") + '</select></label><label>Enseignant<input name="teacher" value="' + escapeMarkup(draft.teacher) + '"></label><label>Barème total<input name="scale" type="number" min="0" value="' + draft.scale + '"></label><label>Date de remise<input name="due" value="' + escapeMarkup(draft.due) + '"></label><label class="wide">Prérequis<textarea name="prerequisites" rows="2" placeholder="Connaissances nécessaires avant le devoir...">' + escapeMarkup(draft.prerequisites) + '</textarea></label><label class="wide">Consignes générales<textarea name="instructions" rows="2" placeholder="Consignes de travail...">' + escapeMarkup(draft.instructions) + '</textarea></label><label class="wide file-field"><span>Pièce jointe facultative</span><input name="attachment" type="file" accept="image/*,.pdf"><small>Une photo ou un PDF peut accompagner le devoir composé. Le fichier reste local dans cette démonstration.</small></label></div><section class="question-composer"><header><div><span>Contenu du document</span><h3>Questions et espaces de réponse</h3></div>' + ssButton({ variant: "secondary", icon: "plus", label: "Ajouter une question", attrs: { id: "addAssignmentQuestion" } }) + '</header><div>' + questions + '</div><aside><i data-lucide="layout-template"></i><p>SchoolSafe évite de couper une question entre deux pages et ajoute automatiquement les lignes, cadres de dessin ou pages de réponse demandées.</p></aside></section><footer>' + ssButton({ variant: "secondary", icon: "file-down", label: "Aperçu PDF", attrs: { id: "previewAssignmentPdf" } }) + '' + ssButton({ variant: "secondary", icon: "save", label: "Enregistrer le brouillon", attrs: { id: "saveAssignmentDraft" } }) + '' + ssButton({ variant: "primary", type: "submit", icon: "send", label: "Publier aux parents" }) + '</footer></form>' : "";
    var pdfButton = selected.questions && selected.questions.length ? 'ssButton({ variant: "secondary", icon: "file-down", label: "Télécharger le devoir PDF", attrs: { "data-download-assignment": pedagogyState.selectedAssignment } })' : "";
    var sourceLanguage = String(selected.language || "").toLowerCase();
    var translationNotice = '<span class="translation-fallback" data-source-language="' + escapeMarkup(sourceLanguage) + '"><i data-lucide="languages"></i> Traduction non disponible : contenu original conservé.</span>';
    return '<div class="pedagogy-two-column assignment-layout"><section class="pedagogy-panel"><header class="panel-heading"><div><span>Travaux de la classe</span><h3>Devoirs et activités</h3></div><b>' + pedagogyState.assignments.length + '</b></header><div class="assignment-list">' + assignmentList + '</div><article class="assignment-detail"><div>' + translationNotice + '<span class="subject-tag">' + escapeMarkup(selected.subject + " · " + selected.language) + '</span><h3>' + escapeMarkup(selected.title) + '</h3><p>' + escapeMarkup(selected.instructions) + '</p></div><dl><div><dt>Échéance</dt><dd>' + escapeMarkup(selected.due) + '</dd></div><div><dt>Support</dt><dd>' + escapeMarkup(selected.format) + '</dd></div><div><dt>Version</dt><dd>v' + (selected.version || 1) + '</dd></div><div><dt>Barème</dt><dd>' + (selected.scale ? "/ " + selected.scale : "Qualitatif") + '</dd></div></dl><div class="assignment-detail-actions">' + pdfButton + '' + ssButton({ variant: "primary", icon: "clipboard-pen-line", label: "Coter ce travail", attrs: { "data-open-grades": true } }) + '</div></article></section>' + creation + '</div>';
  }

  function renderGradesTab() {
    var selected = pedagogyState.assignments[pedagogyState.selectedAssignment] || pedagogyState.assignments[0];
    var qualitative = !selected.scale;
    var rows = pedagogyState.students.map(function (student, index) {
      var grade = selected.grades[index];
      var input = qualitative
        ? '<select data-grade-index="' + index + '">' + ["Non observé","À renforcer","En acquisition","Acquis","Bien","Très bien","Excellent"].map(function (label) { return '<option' + (grade === label ? " selected" : "") + '>' + label + '</option>'; }).join("") + '</select>'
        : '<div class="grade-input"><input data-grade-index="' + index + '" type="number" min="0" max="' + selected.scale + '" step="0.25" value="' + (grade == null ? "" : grade) + '" placeholder="Absent"><span>/ ' + selected.scale + '</span></div>';
      return '<tr><td><span class="student-avatar">' + student.initials + '</span><b>' + student.name + '</b></td><td>' + input + '</td><td><select data-grade-state="' + index + '"><option>Présent</option><option' + (grade == null ? " selected" : "") + '>Absent</option><option>Rattrapage requis</option><option>Dispensé</option></select></td><td>' + window.ssBadge({ label: student.paid ? "En règle" : "À régulariser", variant: student.paid ? "success" : "warning", dot: true, size: "sm" }) + '</td></tr>';
    }).join("");
    return '<section class="pedagogy-panel gradebook"><header class="gradebook-head"><div><span>Cotation de la classe</span><h3>' + escapeMarkup(selected.title) + '</h3><p>' + escapeMarkup(selected.className + " · " + selected.subject + " · " + selected.language) + '</p></div><label>Travail<select id="gradeAssignmentSelect">' + pedagogyState.assignments.map(function (item, index) { return '<option value="' + index + '"' + (index === pedagogyState.selectedAssignment ? " selected" : "") + '>' + escapeMarkup(item.title) + '</option>'; }).join("") + '</select></label></header><div class="grade-summary"><article><small>Barème</small><b>' + (qualitative ? "Qualitatif" : "/ " + selected.scale) + '</b></article><article><small>Cotes remplies</small><b>' + selected.grades.filter(function (grade) { return grade != null; }).length + ' / ' + pedagogyState.students.length + '</b></article><article><small>Publication</small><b>' + (selected.published ? "Visible" : "Brouillon") + '</b></article></div>' + window.ssTable({
      headers: ['Élève', 'Cotation', 'Situation', 'Statut administratif'],
      rows: rows,
      empty: 'Aucun élève dans cette classe.',
      emptyTitle: 'Cotation',
      responsive: true
    }) + '<footer class="grade-actions"><span><i data-lucide="info"></i> Les montants financiers ne sont jamais visibles ici.</span><div>' + ssButton({ variant: "secondary", icon: "save", label: "Brouillon", attrs: { id: "saveGrades" } }) + ' ' + ssButton({ variant: "primary", icon: "send", label: "Publier les cotes", attrs: { id: "publishGrades" } }) + '</div></footer></section>';
  }

  function numberInput(name, label, value, suffix) {
    return '<label>' + label + '<span class="number-field"><input name="' + name + '" type="number" min="0" max="100" value="' + value + '"><b>' + suffix + '</b></span></label>';
  }

  function renderRulesTab() {
    return '<form class="pedagogy-rules" id="pedagogyRulesForm"><section class="pedagogy-panel"><header class="panel-heading"><div><span>Calendrier des résultats</span><h3>Périodes scolaires</h3></div><i data-lucide="calendar-range"></i></header><div class="pedagogy-form-grid compact"><label>Organisation<select name="periodType"><option' + (pedagogyState.periods.type === "Trimestres" ? " selected" : "") + '>Trimestres</option><option' + (pedagogyState.periods.type === "Semestres" ? " selected" : "") + '>Semestres</option><option>Périodes personnalisées</option></select></label><label>Nombre de périodes<input name="periodCount" type="number" min="1" max="12" value="' + pedagogyState.periods.count + '"></label><label>Seuil de réussite<span class="number-field"><input name="passMark" type="number" value="' + pedagogyState.periods.passMark + '"><b>%</b></span></label><label>Décimales<select name="precision"><option value="0">0</option><option value="1">1</option><option value="2" selected>2</option></select></label></div></section><section class="pedagogy-panel"><header class="panel-heading"><div><span>Calcul de période</span><h3>Poids des évaluations</h3></div><i data-lucide="calculator"></i></header><div class="rule-grid">' + numberInput("homeworkWeight", "Devoirs", pedagogyState.weights.homework, "%") + numberInput("quizWeight", "Interrogations", pedagogyState.weights.quiz, "%") + numberInput("examWeight", "Examens", pedagogyState.weights.exam, "%") + '</div><p class="rule-total" id="assessmentWeightTotal">Total : ' + (pedagogyState.weights.homework + pedagogyState.weights.quiz + pedagogyState.weights.exam) + ' %</p></section><section class="pedagogy-panel"><header class="panel-heading"><div><span>École bilingue</span><h3>Langues d’enseignement</h3></div><i data-lucide="languages"></i></header><div class="rule-grid">' + numberInput("frenchWeight", "Français", pedagogyState.languages[0].weight, "%") + numberInput("englishWeight", "Anglais", pedagogyState.languages[1].weight, "%") + '<label>Matière éliminatoire<select name="eliminatory"><option>Option désactivée</option><option>Au moins une matière</option></select></label></div><p class="rule-total">Chaque langue garde ses matières et ses cotations dans le bulletin unique.</p></section><section class="pedagogy-panel"><header class="panel-heading"><div><span>Vie scolaire</span><h3>Calcul de la conduite</h3></div><i data-lucide="shield-check"></i></header><div class="rule-grid">' + numberInput("teacherConduct", "Enseignant", pedagogyState.conduct.teacher, "%") + numberInput("disciplineConduct", "Responsable de discipline", pedagogyState.conduct.discipline, "%") + '<label>Rattrapage<select name="makeup"><option>Décision de l’enseignant</option><option>Remplace la note initiale</option><option>Conserve les deux notes</option></select></label></div></section><footer class="rules-footer"><span><i data-lucide="history"></i> Les résultats clôturés ne seront jamais recalculés silencieusement.</span>' + ssButton({ variant: "primary", type: "submit", icon: "save", label: "Enregistrer les règles" }) + '</footer></form>';
  }

  function renderBulletinTab() {
    var parentChild = pedagogyState.parentChildren[pedagogyState.selectedParentChild];
    if (currentDemoRole === "parent" && !parentChild.paid) {
      return '<section class="result-locked"><span><i data-lucide="file-lock-2"></i></span><div><small>Résultat officiel non disponible</small><h3>' + escapeMarkup(parentChild.name) + '</h3><p>Les devoirs et cotations quotidiennes restent visibles. Le bulletin de fin de période et le résultat annuel attendent une autorisation de la Direction.</p>' + ssButton({ variant: "secondary", icon: "arrow-left", label: "Retour au suivi quotidien", attrs: { "data-return-parent": true } }) + '</div></section>';
    }
    var periods = Array.from({ length: pedagogyState.periods.count }, function (_, index) {
      var closed = Boolean(pedagogyState.periodStatuses[index]);
      return '<article class="period-card ' + (closed ? "closed" : "") + '"><header><span>' + (index + 1) + '</span><div><b>' + escapeMarkup(pedagogyState.periods.type.replace(/s$/, "")) + ' ' + (index + 1) + '</b><small>' + (closed ? "Validé par la Direction pédagogique" : "En cours de remplissage") + '</small></div><i data-lucide="' + (closed ? "lock-keyhole" : "circle-dashed") + '"></i></header><div><span>Français <b>' + (closed ? "14,25 / 20" : "—") + '</b></span><span>Anglais <b>' + (closed ? "13,75 / 20" : "—") + '</b></span><span>Synthèse <b>' + (closed ? "14,00 / 20" : "—") + '</b></span></div></article>';
    }).join("");
    var canValidate = currentDemoRole === "pedagogy" || currentDemoRole === "admin";
    var validationButton = canValidate && pedagogyState.periodStatuses.some(function (status) { return !status; }) ? 'ssButton({ variant: "secondary", icon: "badge-check", label: "Valider la période suivante", attrs: { id: "validatePeriod" } })' : "";
    return '<section class="continuous-bulletin"><header class="bulletin-identity"><div class="student-photo">' + escapeMarkup(currentDemoRole === "parent" ? parentChild.initials : "LM") + '</div><div><span>Bulletin scolaire continu · 2026-2027</span><h3>' + escapeMarkup(currentDemoRole === "parent" ? parentChild.name : "Lucas Martin") + '</h3><p>' + escapeMarkup(currentDemoRole === "parent" ? parentChild.className : "1re A") + ' · Cycle primaire · Matricule 4521</p></div><span class="single-record"><i data-lucide="file-check-2"></i> Un bulletin annuel</span></header><div class="bulletin-metrics"><article><small>Moyenne consolidée</small><b>14,00 / 20</b><span>70 % · Réussite</span></article><article><small>Position provisoire</small><b>5e / 32</b><span>Après validation</span></article><article><small>Conduite</small><b>Très bien</b><span>40 % + 60 %</span></article><article><small>Langues</small><b>50 / 50</b><span>Français · Anglais</span></article></div><div class="period-grid">' + periods + '</div><section class="subject-results"><header><h3>Résultats par matière et langue</h3><span>Deux décimales</span></header><div class="language-result"><b>Mathématiques</b><span>FR <strong>15,25</strong></span><span>EN <strong>14,50</strong></span><span>Synthèse <strong>14,88</strong></span></div><div class="language-result"><b>Français / English</b><span>FR <strong>13,75</strong></span><span>EN <strong>14,25</strong></span><span>Synthèse <strong>14,00</strong></span></div></section><footer><span><i data-lucide="badge-check"></i> Le PDF officiel portera le logo de l’école après validation.</span><div class="bulletin-actions">' + validationButton + '' + ssButton({ variant: "primary", icon: "file-down", label: "Préparer le PDF", attrs: { id: "prepareBulletin" } }) + '</div></footer></section>';
  }

  function renderParentTab() {
    var child = pedagogyState.parentChildren[pedagogyState.selectedParentChild];
    var cards = pedagogyState.assignments.filter(function (item) { return item.published; }).map(function (item) {
      var grade = item.grades[0];
      return '<article class="parent-assignment"><span class="assignment-format"><i data-lucide="' + (item.format === "PDF" ? "file-text" : "notebook-pen") + '"></i></span><div><small>' + escapeMarkup(item.type + " · " + item.subject + " · " + item.language) + '</small><b>' + escapeMarkup(item.title) + '</b><p>À remettre le ' + escapeMarkup(item.due) + '</p></div><span class="parent-grade">' + (grade == null ? "À venir" : (item.scale ? grade + " / " + item.scale : grade)) + '</span></article>';
    }).join("");
    var childOptions = pedagogyState.parentChildren.map(function (item, index) { return '<option value="' + index + '"' + (index === pedagogyState.selectedParentChild ? " selected" : "") + '>' + escapeMarkup(item.name + " · " + item.className) + '</option>'; }).join("");
    var officialCopy = child.paid ? "Visible après validation pédagogique et confirmation administrative. Les paiements ne transitent pas dans SchoolSafe." : "Le suivi quotidien reste disponible. Le résultat officiel attend une autorisation de la Direction.";
    return '<div class="parent-learning"><div class="parent-child-picker"><label>Enfant suivi<select id="parentPedagogyChildSelect">' + childOptions + '</select></label></div><header><div><span>Suivi pédagogique</span><h3>' + escapeMarkup(child.name) + '</h3><p>Les devoirs et cotations publiés par ses enseignants.</p></div><span class="payment-state ' + (child.paid ? "" : "pending") + '"><i data-lucide="' + (child.paid ? "badge-check" : "clock-3") + '"></i> ' + (child.paid ? "En règle" : "À régulariser") + '</span></header><div class="parent-summary"><article><small>Devoirs publiés</small><b>' + pedagogyState.assignments.filter(function (item) { return item.published; }).length + '</b></article><article><small>Moyenne officielle</small><b>' + escapeMarkup(child.average) + '</b></article><article><small>Classement validé</small><b>' + escapeMarkup(child.rank) + '</b></article></div><section class="parent-work-list"><header><h3>Travaux et cotations</h3><span>Mise à jour dans l’application</span></header>' + cards + '</section><aside class="official-result ' + (child.paid ? "" : "restricted") + '"><i data-lucide="file-lock-2"></i><div><b>Résultat officiel de fin de période</b><p>' + officialCopy + '</p></div>' + ssButton({ variant: "secondary", label: child.paid ? "Consulter" : "Accès suspendu", disabled: !child.paid, attrs: { "data-parent-bulletin": true } }) + '</aside></div>';
  }

  function money(value) {
    return new Intl.NumberFormat("fr-FR").format(Number(value || 0)) + " FC";
  }
  window.money = money;

  function remediationStatusClass(status) {
    if (/renforcée/i.test(status)) return "danger";
    if (/cours/i.test(status)) return "info";
    if (/validé|terminé/i.test(status)) return "success";
    return "warning";
  }

  function remediationCaseList() {
    return pedagogyState.remediation.cases.filter(function (item) {
      if (currentDemoRole === "teacher") return item.teacher === "Mme Y";
      if (currentDemoRole === "parent") return item.student === "Lucas Martin";
      return true;
    });
  }

  function renderRemediationCases() {
    var cases = remediationCaseList();
    var selected = pedagogyState.remediation.cases[pedagogyState.remediation.selectedCase] || cases[0];
    if (cases.indexOf(selected) === -1) selected = cases[0];
    var list = cases.map(function (item) {
      var index = pedagogyState.remediation.cases.indexOf(item);
      return '<button class="remediation-case-row' + (item === selected ? " active" : "") + '" type="button" data-remediation-case="' + index + '"><span class="student-avatar">' + item.initials + '</span><span><b>' + escapeMarkup(item.student) + '</b><small>' + escapeMarkup(item.className + " · " + item.month) + '</small></span><span class="case-score">' + String(item.average).replace(".", ",") + ' %</span>' + window.ssBadge({ variant: remediationStatusClass(item.status), label: item.status }) + '</button>';
    }).join("");
    var subjects = selected.subjects.map(function (subject) { return '<span><i data-lucide="book-open"></i>' + escapeMarkup(subject) + '</span>'; }).join("");
    var canDecide = currentDemoRole === "admin" || currentDemoRole === "school_head" || currentDemoRole === "pedagogy";
    var decision = canDecide ? '<form class="remediation-decision" id="remediationDecisionForm"><h4>Décision de la Direction</h4><div><label>Enseignant<select name="teacher"><option' + (selected.teacher === "Non affecté" ? " selected" : "") + '>Non affecté</option><option' + (selected.teacher === "Mme Y" ? " selected" : "") + '>Mme Y</option><option>M. Kabasele</option></select></label><label>Prix mensuel<input name="price" type="number" min="0" value="' + selected.price + '"></label><label>Début<input name="start" value="' + escapeMarkup(selected.start) + '"></label><label>Fin<input name="end" value="' + escapeMarkup(selected.end) + '"></label></div><footer>' + ssButton({ variant: "secondary", icon: "circle-x", label: "Annuler la détection", attrs: { id: "cancelDetection" } }) + ' ' + ssButton({ variant: "primary", type: "submit", icon: "user-round-check", label: "Valider et affecter" }) + '</footer></form>' : "";
    var alert = selected.monthsWithoutProgress >= 6 ? '<aside class="reinforced-alert"><i data-lucide="triangle-alert"></i><div><b>Accompagnement renforcé requis</b><p>Six mois sans progression suffisante. Une nouvelle convocation et un plan spécial doivent être préparés.</p></div></aside>' : "";
    return '<div class="remediation-case-layout"><section class="remediation-list"><header><div><span>Analyse mensuelle automatique</span><h3>Élèves sous 50 %</h3></div><b>' + cases.length + '</b></header><div>' + list + '</div><aside class="free-makeup-note"><i data-lucide="shield-check"></i><div><b>Évaluation manquée avec absence justifiée</b><p>Rattrapage gratuit, organisé par l’enseignant et exclu du programme mensuel payant.</p></div></aside></section><section class="remediation-case-detail"><header><div class="student-avatar large">' + selected.initials + '</div><div><span>' + escapeMarkup(selected.cycle + " · " + selected.month) + '</span><h3>' + escapeMarkup(selected.student) + '</h3><p>' + escapeMarkup(selected.parentStatus) + '</p></div>' + window.ssBadge({ variant: remediationStatusClass(selected.status), label: selected.status }) + '</header>' + alert + '<div class="remediation-subjects"><h4>Matières détectées séparément</h4><div>' + subjects + '</div></div><div class="remediation-facts"><article><small>Moyenne détectée</small><b>' + String(selected.average).replace(".", ",") + ' %</b></article><article><small>Enseignant affecté</small><b>' + escapeMarkup(selected.teacher) + '</b></article><article><small>Prix mensuel</small><b>' + money(selected.price) + '</b></article><article><small>Durée</small><b>1 mois</b></article></div><aside class="convocation-note"><i data-lucide="messages-square"></i><div><b>Convocation parent</b><p>Notification dans SchoolSafe et notification Web Push gratuite. Le parent doit rencontrer la Direction avant l’affectation.</p></div></aside>' + decision + '</section></div>';
  }

  function renderRemediationSchedule() {
    var cases = remediationCaseList().filter(function (item) { return item.teacher !== "Non affecté" && !item.cancelled; });
    var cards = cases.map(function (item) {
      var attendance = item.sessions.map(function (session) { return '<li><span>' + escapeMarkup(session.date + " · " + session.subject) + '</span><b class="' + (session.present ? "present" : "absent") + '">' + (session.present ? "Présent" : "Absent · séance perdue") + '</b></li>'; }).join("") || '<li><span>Aucune séance enregistrée</span><b>À organiser</b></li>';
      return '<article class="remediation-plan"><header><span class="student-avatar">' + item.initials + '</span><div><h3>' + escapeMarkup(item.student) + '</h3><p>' + escapeMarkup(item.start + " au " + item.end) + '</p></div><span>' + item.sessions.length + ' séance(s)</span></header><div class="plan-subjects">' + item.subjects.map(function (subject) { return '<span>' + escapeMarkup(subject.split(" · ")[0]) + '</span>'; }).join("") + '</div><ul>' + attendance + '</ul><form data-session-form="' + pedagogyState.remediation.cases.indexOf(item) + '"><label>Date<input name="date" required placeholder="15 août"></label><label>Matière<select name="subject">' + item.subjects.map(function (subject) { return '<option>' + escapeMarkup(subject.split(" · ")[0]) + '</option>'; }).join("") + '</select></label><label>Présence<select name="presence"><option value="present">Présent</option><option value="absent">Absent</option></select></label>' + ssButton({ variant: "primary", type: "submit", icon: "plus", label: "Ajouter" }) + '</form></article>';
    }).join("");
    return '<div class="remediation-schedule"><header><div><span>Organisation libre de l’enseignant</span><h3>Suivi des séances</h3><p>Les absences déclenchent une alerte et ne prolongent pas le mois.</p></div><span><i data-lucide="calendar-clock"></i> Un mois fixe</span></header><div>' + cards + '</div></div>';
  }

  function renderRemediationFinance() {
    var cases = remediationCaseList().filter(function (item) { return item.price > 0 && !item.cancelled; });
    var totalPaid = cases.reduce(function (sum, item) { return sum + item.paid; }, 0);
    var rows = cases.map(function (item) {
      var teacherShare = item.paid * 0.6;
      var schoolShare = item.paid * 0.4;
      return '<tr><td><b>' + escapeMarkup(item.student) + '</b><small>' + escapeMarkup(item.month) + '</small></td><td>' + money(item.price) + '</td><td>' + money(item.paid) + '</td><td>' + money(item.price - item.paid) + '</td><td>' + money(teacherShare) + '</td><td>' + money(schoolShare) + '</td><td>' + ssIconButton({ icon: "circle-plus", variant: "light", title: "Enregistrer une tranche", attrs: { "data-add-installment": pedagogyState.remediation.cases.indexOf(item) } }) + '</td></tr>';
    }).join("");
    return '<section class="remediation-finance"><header><div><span>Enregistrement comptable local</span><h3>Versements et ventilation</h3><p>SchoolSafe enregistre les tranches; aucun argent ne transite dans l’application.</p></div>' + window.ssBadge({ variant: "info", icon: "calendar-check", label: "Paiement enseignant à la clôture" }) + '</header><div class="finance-summary"><article><small>Total attendu</small><b>' + money(cases.reduce(function (sum, item) { return sum + item.price; }, 0)) + '</b></article><article><small>Réellement encaissé</small><b>' + money(totalPaid) + '</b></article><article><small>Part enseignants · 60 %</small><b>' + money(totalPaid * .6) + '</b></article><article><small>Part école · 40 %</small><b>' + money(totalPaid * .4) + '</b></article></div>' + window.ssTable({
      headers: ['Élève', 'Prix', 'Encaissé', 'Solde', 'Enseignant 60 %', 'École 40 %', ''],
      rows: rows,
      empty: 'Aucun cas de rattrapage.',
      emptyTitle: 'Versements et ventilation',
      responsive: true
    }) + '<footer><span><i data-lucide="info"></i> Une tranche tardive sera intégrée à la clôture suivante.</span>' + ssButton({ variant: "primary", icon: "lock-keyhole", label: "Préparer la clôture du mois", attrs: { id: "closeRemediationMonth" } }) + '</footer></section>';
  }

  function renderRemediationReports() {
    var cases = remediationCaseList().filter(function (item) { return item.teacher !== "Non affecté"; });
    var reports = cases.map(function (item) {
      var index = pedagogyState.remediation.cases.indexOf(item);
      var gain = item.progress - item.average;
      return '<article class="remediation-report"><header><span class="student-avatar">' + item.initials + '</span><div><h3>' + escapeMarkup(item.student) + '</h3><p>' + escapeMarkup(item.month + " · " + item.teacher) + '</p></div>' + window.ssBadge({ variant: item.validated ? "success" : "warning", label: item.validated ? "Validé" : "À valider" }) + '</header><div class="progress-comparison"><div><small>Détection</small><b>' + String(item.average).replace(".", ",") + ' %</b></div><i data-lucide="arrow-right"></i><div><small>Fin du suivi</small><b>' + item.progress + ' %</b></div><strong>+' + String(gain).replace(".", ",") + ' points</strong></div><label>Bilan pédagogique<textarea data-report-index="' + index + '" rows="3">' + escapeMarkup(item.report) + '</textarea></label><footer><span>Résultat séparé du bulletin officiel</span>' + (currentDemoRole === "pedagogy" || currentDemoRole === "admin" ? '' + ssButton({ variant: "primary", icon: "badge-check", label: item.validated ? "Bilan validé" : "Valider le bilan", disabled: item.validated, attrs: { "data-validate-report": index } }) + '' : '' + ssButton({ variant: "secondary", icon: "save", label: "Enregistrer", attrs: { "data-save-report": index } }) + '') + '</footer></article>';
    }).join("");
    return '<div class="remediation-reports"><header><div><span>Fin du mois</span><h3>Progression et bilans</h3></div><span><i data-lucide="file-check-2"></i> Validation pédagogique</span></header><div>' + reports + '</div></div>';
  }

  function renderRemediationParent() {
    var item = pedagogyState.remediation.cases.filter(function (record) { return record.student === "Lucas Martin"; })[0];
    return '<div class="remediation-parent"><header><div><span>Accompagnement pédagogique</span><h3>' + escapeMarkup(item.student) + '</h3><p>' + escapeMarkup(item.month + " · " + item.className) + '</p></div>' + window.ssBadge({ variant: remediationStatusClass(item.status), label: item.status }) + '</header><div class="parent-remediation-summary"><article><small>Enseignant</small><b>' + escapeMarkup(item.teacher) + '</b></article><article><small>Période</small><b>' + escapeMarkup(item.start + " au " + item.end) + '</b></article><article><small>Progression</small><b>' + item.average + ' % → ' + item.progress + ' %</b></article></div><section><h3>Matières accompagnées</h3>' + item.subjects.map(function (subject) { return '<span><i data-lucide="book-open-check"></i>' + escapeMarkup(subject) + '</span>'; }).join("") + '</section><section class="parent-installments"><header><h3>Situation du programme</h3><span>Aucun paiement en ligne</span></header><div><span>Prix fixé par la Direction <b>' + money(item.price) + '</b></span><span>Versements enregistrés <b>' + money(item.paid) + '</b></span><span>Solde restant <b>' + money(item.price - item.paid) + '</b></span></div></section><aside><i data-lucide="info"></i><p>Les résultats de cet accompagnement mesurent la progression. Ils restent séparés du bulletin officiel et ne décident pas du passage de classe.</p></aside></div>';
  }

  function renderRemediationTab() {
    var roleViews = currentDemoRole === "parent" ? ["parent"] : currentDemoRole === "teacher" ? ["cases","schedule","reports"] : ["cases","schedule","finance","reports"];
    if (roleViews.indexOf(pedagogyState.remediation.activeView) === -1) pedagogyState.remediation.activeView = roleViews[0];
    var labels = { cases: ["Détection et dossiers","scan-search"], schedule: ["Séances","calendar-clock"], finance: ["Versements 60/40","hand-coins"], reports: ["Bilans","file-check-2"], parent: ["Suivi parent","contact-round"] };
    var navigation = roleViews.map(function (view) { return '<button class="' + (view === pedagogyState.remediation.activeView ? "active" : "") + '" type="button" data-remediation-view="' + view + '"><i data-lucide="' + labels[view][1] + '"></i>' + labels[view][0] + '</button>'; }).join("");
    var renderers = { cases: renderRemediationCases, schedule: renderRemediationSchedule, finance: renderRemediationFinance, reports: renderRemediationReports, parent: renderRemediationParent };
    return '<section class="remediation-workspace"><header class="remediation-overview"><div><span>Programme mensuel obligatoire après décision</span><h3>Rattrapage pédagogique</h3><p>Détection automatique sous 50 %, entretien avec le parent, suivi d’un mois et nouvelle analyse le mois suivant.</p></div><div><article><small>À convoquer</small><b>1</b></article><article><small>En suivi</small><b>2</b></article><article><small>Bilans</small><b>1</b></article><article><small>Alerte 6 mois</small><b>1</b></article></div></header><nav class="remediation-nav">' + navigation + '</nav><div class="remediation-view">' + renderers[pedagogyState.remediation.activeView]() + '</div></section>';
  }

  function certificationExam() {
    return pedagogyState.certifications.exams[pedagogyState.certifications.activeExam];
  }

  function certificationCandidates() {
    var filters = pedagogyState.certifications.filters;
    return certificationExam().candidates.filter(function (candidate) {
      return (filters.className === "Toutes" || candidate.className === filters.className) &&
        (filters.center === "Tous" || candidate.center === filters.center) &&
        (filters.decision === "Tous" || candidate.decision === filters.decision) &&
        (filters.option === "Toutes" || candidate.option === filters.option);
    });
  }

  function certificationStatusClass(value) {
    if (/complet|réussi|publié|présent|terminé|validé|en ordre/i.test(value) && !/incomplet/i.test(value)) return "success";
    if (/incomplet|rejeté|absent|échoué|non admis|régulariser/i.test(value)) return "error";
    if (/vérifier|attente|venir/i.test(value)) return "warning";
    return "info";
  }
  window.certificationStatusClass = certificationStatusClass;

  function certificationFiltersMarkup(exam) {
    function options(values, selected) {
      return values.map(function (value) { return '<option' + (value === selected ? " selected" : "") + '>' + escapeMarkup(value) + '</option>'; }).join("");
    }
    var classes = ["Toutes"].concat(Array.from(new Set(exam.candidates.map(function (item) { return item.className; }))));
    var centers = ["Tous"].concat(Array.from(new Set(exam.candidates.map(function (item) { return item.center; }))));
    var decisions = ["Tous"].concat(Array.from(new Set(exam.candidates.map(function (item) { return item.decision; }))));
    var examOptions = ["Toutes"].concat(Array.from(new Set(exam.candidates.map(function (item) { return item.option; }).filter(Boolean))));
    var optionFilter = examOptions.length > 1 ? '<label>Option / filière<select data-cert-filter="option">' + options(examOptions, pedagogyState.certifications.filters.option) + '</select></label>' : "";
    return '<div class="certification-filters' + (optionFilter ? " has-option" : "") + '"><label>Classe<select data-cert-filter="className">' + options(classes, pedagogyState.certifications.filters.className) + '</select></label>' + optionFilter + '<label>Centre<select data-cert-filter="center">' + options(centers, pedagogyState.certifications.filters.center) + '</select></label><label>Résultat<select data-cert-filter="decision">' + options(decisions, pedagogyState.certifications.filters.decision) + '</select></label></div>';
  }

  function renderCertificationCandidates(exam) {
    var candidates = certificationCandidates();
    var canManage = currentDemoRole === "admin" || currentDemoRole === "school_head" || currentDemoRole === "pedagogy" || currentDemoRole === "secretary";
    var rows = candidates.map(function (candidate, index) {
      return '<tr><td><span class="student-avatar">' + candidate.initials + '</span><b>' + escapeMarkup(candidate.name) + '</b><small>' + escapeMarkup(candidate.sex) + '</small></td><td><b class="candidate-class">' + escapeMarkup(candidate.className) + '</b>' + (candidate.option ? '<span class="candidate-option">' + escapeMarkup(candidate.option) + '</span>' : "") + '</td><td>' + escapeMarkup(candidate.number) + '</td><td>' + escapeMarkup(candidate.center) + '</td><td>' + window.ssBadge({ variant: certificationStatusClass(candidate.dossier), label: candidate.dossier }) + '</td><td>' + ssIconButton({ icon: "folder-open", variant: "light", title: "Ouvrir le dossier", attrs: { "data-cert-candidate": exam.candidates.indexOf(candidate) } }) + '</td></tr>';
    }).join("");
    var selected = exam.candidates[pedagogyState.certifications.selectedCandidate] || exam.candidates[0];
    var exetatDetails = selected.option ? '<div><dt>Option / filière</dt><dd>' + escapeMarkup(selected.option) + '</dd></div><div><dt>Type de cycle</dt><dd>' + escapeMarkup(selected.cycleType) + '</dd></div><div><dt>Jury</dt><dd>' + escapeMarkup(selected.jury) + '</dd></div><div><dt>Participation</dt><dd>' + window.ssBadge({ variant: certificationStatusClass(selected.participationStatus), label: selected.participationStatus }) + '</dd></div>' : "";
    return '<div class="certification-candidate-layout"><section class="certification-table-card"><header><div><span>Registre des candidats</span><h3>Dossiers et affectations</h3></div><b>' + candidates.length + '</b></header>' + certificationFiltersMarkup(exam) + window.ssTable({
      headers: ['Candidat', 'Classe / option', 'Numéro', 'Centre / jury', 'Dossier', ''],
      rows: rows,
      empty: 'Aucun candidat enregistré.',
      emptyTitle: 'Dossiers et affectations',
      responsive: true
    }) + '</section><aside class="candidate-file"><header><span class="student-avatar large">' + selected.initials + '</span><div><small>' + escapeMarkup(exam.label + " · " + selected.className) + '</small><h3>' + escapeMarkup(selected.name) + '</h3><p>' + escapeMarkup(selected.number) + '</p></div>' + window.ssBadge({ variant: certificationStatusClass(selected.dossier), label: selected.dossier }) + '</header><dl><div><dt>Centre</dt><dd>' + escapeMarkup(selected.center) + '</dd></div>' + exetatDetails + '<div><dt>Préparation</dt><dd>' + selected.preparation + ' %</dd></div><div><dt>Présence</dt><dd>' + escapeMarkup(selected.attendance) + '</dd></div><div><dt>Résultat officiel</dt><dd>' + (selected.percentage == null ? "Non publié" : String(selected.percentage).replace(".", ",") + " % · " + selected.decision) + '</dd></div></dl><aside><i data-lucide="shield-check"></i><p>L’identité, le numéro de candidat, l’option, le jury et le centre doivent être vérifiés avant transmission. SchoolSafe ne fabrique aucun résultat national et ne produit aucun diplôme d’État.</p></aside>' + (canManage ? '' + ssButton({ variant: "secondary", icon: "save", label: "Enregistrer le contrôle local", attrs: { "data-cert-save": true } }) + '' : "") + '</aside></div>';
  }

  function renderCertificationPreparation(exam) {
    var teacherClasses = exam.teacherClasses || ["6e A", "8e A"];
    var candidates = currentDemoRole === "teacher" ? exam.candidates.filter(function (item) { return teacherClasses.indexOf(item.className) !== -1; }) : exam.candidates;
    var areas = exam.preparationAreas || ["Français", "Mathématiques", "Sciences"];
    var offsets = [-3, 2, -6];
    var cards = candidates.map(function (candidate) {
      var areaRows = areas.map(function (area, index) { return '<span>' + escapeMarkup(area) + ' <b>' + Math.max(35, Math.min(98, candidate.preparation + offsets[index % offsets.length])) + ' %</b></span>'; }).join("");
      return '<article class="preparation-card"><header><span class="student-avatar">' + candidate.initials + '</span><div><h3>' + escapeMarkup(candidate.name) + '</h3><p>' + escapeMarkup(candidate.className + (candidate.option ? " · " + candidate.option : "")) + '</p></div><b>' + candidate.preparation + ' %</b></header><div class="preparation-bar"><i style="width:' + candidate.preparation + '%"></i></div><div>' + areaRows + '</div><footer><span>Simulations séparées du résultat officiel</span>' + ssIconButton({ icon: "clipboard-pen-line", variant: "light", title: "Consigner une simulation" }) + '</footer></article>';
    }).join("");
    return '<section class="certification-preparation"><header><div><span>Préparation interne de l’école</span><h3>Simulations et progression</h3><p>Les enseignants suivent la préparation sans modifier le bulletin ni le futur résultat national.</p></div>' + ssButton({ variant: "secondary", icon: "file-down", label: "Exporter la préparation PDF", attrs: { "data-export-cert": "preparation" } }) + '</header><div>' + cards + '</div></section>';
  }

  function renderCertificationStages(exam) {
    if (!exam.phases || !exam.phases.length) {
      return '<section class="certification-stages">' + window.ssState({ type: "empty", title: "Calendrier national à confirmer", message: "L’école ajoutera les étapes officielles après publication du calendrier de la session.", icon: "calendar-clock" }) + '</section>';
    }
    var completed = exam.phases.filter(function (phase) { return /terminé|publié/i.test(phase.status); }).length;
    var phases = exam.phases.map(function (phase, index) {
      return '<article><span class="stage-number">' + (index + 1) + '</span><div><header><small>' + escapeMarkup(phase.scope) + '</small>' + window.ssBadge({ variant: certificationStatusClass(phase.status), label: phase.status }) + '</header><h3>' + escapeMarkup(phase.label) + '</h3><b><i data-lucide="calendar-days"></i>' + escapeMarkup(phase.date) + '</b><p>' + escapeMarkup(phase.detail) + '</p></div></article>';
    }).join("");
    return '<section class="certification-stages"><header><div><span>Parcours réglementaire suivi par l’école</span><h3>Étapes de l’EXETAT</h3><p>Calendrier 2026 de référence. Les dates d’une nouvelle session devront être confirmées avant utilisation.</p></div><div><b>' + completed + ' / ' + exam.phases.length + '</b><span>étapes documentées</span></div></header><div class="certification-stage-grid">' + phases + '</div><footer><i data-lucide="landmark"></i><p>Les corrections, le scannage, la délibération, la publication et le diplôme d’État relèvent exclusivement des services officiels. SchoolSafe conserve seulement le suivi local et la référence de la source.</p></footer></section>';
  }

  function renderCertificationResults(exam) {
    var published = certificationCandidates().filter(function (candidate) { return candidate.published && candidate.percentage != null; });
    var passed = published.filter(function (candidate) { return candidate.decision === "Réussi"; }).length;
    var rate = published.length ? Math.round(passed / published.length * 100) : 0;
    var rows = published.map(function (candidate) {
      return '<tr><td><span class="student-avatar">' + candidate.initials + '</span><b>' + escapeMarkup(candidate.name) + '</b></td><td><b class="candidate-class">' + escapeMarkup(candidate.className) + '</b>' + (candidate.option ? '<span class="candidate-option">' + escapeMarkup(candidate.option) + '</span>' : "") + '</td><td>' + escapeMarkup(candidate.number) + '</td><td><b>' + String(candidate.percentage).replace(".", ",") + ' %</b></td><td>' + window.ssBadge({ variant: certificationStatusClass(candidate.decision), label: candidate.decision }) + '</td><td>' + ssIconButton({ icon: "file-down", variant: "light", title: "Télécharger le résultat individuel PDF", attrs: { "data-export-cert-person": exam.candidates.indexOf(candidate) } }) + '</td></tr>';
    }).join("") || '<tr><td colspan="6">Aucun résultat officiel validé pour ce filtre.</td></tr>';
    return '<section class="certification-results"><header><div><span>Après publication et validation</span><h3>Résultats officiels enregistrés</h3><p>Chaque résultat conserve sa source, sa date d’import et la personne qui l’a vérifié.</p></div><div class="certification-export-actions">' + ssButton({ variant: "secondary", icon: "filter", label: "PDF filtré", attrs: { "data-export-cert": "filtered" } }) + ' ' + ssButton({ variant: "primary", icon: "file-down", label: "Exporter tous les résultats PDF", attrs: { "data-export-cert": "all" } }) + '</div></header><div class="certification-metrics"><article><small>Résultats publiés</small><b>' + published.length + '</b></article><article><small>Réussites</small><b>' + passed + '</b></article><article><small>Taux de réussite</small><b>' + rate + ' %</b></article><article><small>Source</small><b>À documenter</b></article></div>' + certificationFiltersMarkup(exam) + window.ssTable({
      headers: ['Candidat', 'Classe', 'Numéro', 'Pourcentage', 'Décision', 'PDF'],
      rows: rows,
      empty: 'Aucun résultat officiel validé pour ce filtre.',
      emptyTitle: 'Résultats officiels',
      responsive: true
    }) + '<footer><i data-lucide="badge-alert"></i><span>Dans cette démonstration, les valeurs sont fictives et les PDF portent la mention « Aperçu non officiel ».</span></footer></section>';
  }

  function renderCertificationParent(exam) {
    var parentCandidateName = exam.parentCandidateName || "Lucas Martin";
    var candidate = exam.candidates.filter(function (item) { return item.name === parentCandidateName; })[0];
    if (!candidate) return '<section class="result-locked"><span><i data-lucide="scroll-text"></i></span><div><small>Aucune épreuve rattachée</small><h3>Mes enfants</h3><p>Aucun candidat de ce profil parent n’est rattaché à cette session.</p></div></section>';
    var optionSummary = candidate.option ? '<article><small>Option / jury</small><b>' + escapeMarkup(candidate.option + " · " + candidate.jury) + '</b></article>' : "";
    var parentNotice = exam.label === "EXETAT" ? "Ce résultat apparaît seulement après publication officielle et validation par l’école. Le PDF SchoolSafe n’est ni le diplôme d’État ni un relevé officiel." : "Ce résultat apparaît seulement après publication officielle et validation par l’école.";
    return '<section class="certification-parent"><header><div><span>' + escapeMarkup(exam.label + " · " + exam.session) + '</span><h3>' + escapeMarkup(candidate.name) + '</h3><p>' + escapeMarkup(candidate.className + " · " + candidate.number) + '</p></div>' + window.ssBadge({ variant: certificationStatusClass(candidate.decision), label: candidate.decision }) + '</header><div><article><small>Dossier</small><b>' + escapeMarkup(candidate.dossier) + '</b></article>' + optionSummary + '<article><small>Centre</small><b>' + escapeMarkup(candidate.center) + '</b></article><article><small>Résultat validé</small><b>' + (candidate.published ? String(candidate.percentage).replace(".", ",") + " %" : "Non publié") + '</b></article></div><aside><i data-lucide="info"></i><p>' + escapeMarkup(parentNotice) + '</p></aside>' + ssButton({ variant: "primary", icon: "file-down", label: "Télécharger le relevé SchoolSafe PDF", disabled: !candidate.published, attrs: { "data-export-cert-person": exam.candidates.indexOf(candidate) } }) + '</section>';
  }

  function renderCertificationsTab() {
    var exam = certificationExam();
    var hasStages = Boolean(exam.phases && exam.phases.length);
    var roleViews = currentDemoRole === "parent" ? (hasStages ? ["stages","parent"] : ["parent"]) : currentDemoRole === "teacher" ? (hasStages ? ["stages","preparation"] : ["preparation"]) : currentDemoRole === "secretary" ? (hasStages ? ["candidates","stages"] : ["candidates"]) : (hasStages ? ["candidates","stages","preparation","results"] : ["candidates","preparation","results"]);
    if (roleViews.indexOf(pedagogyState.certifications.activeView) === -1) pedagogyState.certifications.activeView = roleViews[0];
    var labels = { candidates: ["Candidats et dossiers","folder-check"], stages: ["Étapes EXETAT","milestone"], preparation: ["Préparation","clipboard-check"], results: ["Résultats et PDF","file-chart-column"], parent: ["Résultat de mon enfant","contact-round"] };
    var views = roleViews.map(function (view) { return '<button class="' + (view === pedagogyState.certifications.activeView ? "active" : "") + '" type="button" data-cert-view="' + view + '"><i data-lucide="' + labels[view][1] + '"></i>' + labels[view][0] + '</button>'; }).join("");
    var renderers = { candidates: renderCertificationCandidates, stages: renderCertificationStages, preparation: renderCertificationPreparation, results: renderCertificationResults, parent: renderCertificationParent };
    return '<section class="certification-workspace"><header class="certification-overview"><div><span>Épreuves certificatives de la RDC</span><h3>' + escapeMarkup(exam.fullName) + '</h3><p>' + escapeMarkup(exam.cycle + " · " + exam.session + " · " + exam.dates) + '</p></div><div class="exam-switch"><button class="' + (exam.label === "ENAFEP" ? "active" : "") + '" type="button" data-cert-exam="ENAFEP">ENAFEP</button><button class="' + (exam.label === "TENASOSP" ? "active" : "") + '" type="button" data-cert-exam="TENASOSP">TENASOSP</button><button class="' + (exam.label === "EXETAT" ? "active" : "") + '" type="button" data-cert-exam="EXETAT">EXETAT</button></div></header><aside class="certification-boundary"><i data-lucide="shield-alert"></i><p>SchoolSafe prépare et suit les dossiers. Il ne remplace pas les services officiels, ne crée pas de résultat national et ne délivre ni certificat ni diplôme de l’État.</p></aside><nav class="remediation-nav">' + views + '</nav><div>' + renderers[pedagogyState.certifications.activeView](exam) + '</div></section>';
  }

  function renderPedagogyModule() {
    var titles = { assignments: "Devoirs et activités", grades: "Cotations des élèves", rules: "Calculs et coefficients", bulletin: "Bulletin continu", remediation: "Rattrapage pédagogique", certifications: "Épreuves certificatives", parent: "Suivi de mon enfant" };
    document.getElementById("pedagogyModuleTitle").textContent = titles[pedagogyState.activeTab];
    document.getElementById("workspaceTitle").textContent = titles[pedagogyState.activeTab];
    document.querySelectorAll("#pedagogyTabs [data-pedagogy-tab]").forEach(function (button) {
      var tab = button.getAttribute("data-pedagogy-tab");
      button.classList.toggle("active", tab === pedagogyState.activeTab);
      var financeOnly = currentDemoRole === "cashier" || currentDemoRole === "finance";
      button.hidden = (currentDemoRole === "parent" && tab !== "parent" && tab !== "bulletin" && tab !== "remediation" && tab !== "certifications") || (financeOnly && tab !== "remediation") || (currentDemoRole === "teacher" && tab === "parent") || (currentDemoRole === "secretary" && tab !== "certifications");
    });
    var renderersByTab = { assignments: renderAssignmentsTab, grades: renderGradesTab, rules: renderRulesTab, bulletin: renderBulletinTab, remediation: renderRemediationTab, certifications: renderCertificationsTab, parent: renderParentTab };
    document.getElementById("pedagogyContent").innerHTML = renderersByTab[pedagogyState.activeTab]();
    bindPedagogyEvents();
    icons();
  }

  function openFinanceModule(actionName) {
    document.getElementById("accountingModule").hidden = true;
    document.getElementById("inventoryModule").hidden = true;
    document.getElementById("pedagogyModule").hidden = true;
    document.getElementById("securityModule").hidden = true;
    document.getElementById("pilotageModule").hidden = true;
    document.getElementById("feeControlModule").hidden = true;
    document.getElementById("accessConsole").hidden = true;
    document.getElementById("financeModule").hidden = false;
    setWorkspaceDashboardVisible(false);
    document.getElementById("cardsProtected").hidden = true;
    if (window.SchoolSafeFinanceModule && typeof window.SchoolSafeFinanceModule.render === "function") {
      window.SchoolSafeFinanceModule.render("financeModule", { action: actionName });
    }
    document.querySelector(".workspace-content").scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeFinanceModule() {
    if (window.SchoolSafeFinanceModule && typeof window.SchoolSafeFinanceModule.close === "function") {
      window.SchoolSafeFinanceModule.close();
    } else {
      document.getElementById("financeModule").hidden = true;
      document.getElementById("feeControlModule").hidden = true;
      setWorkspaceDashboardVisible(true);
    }
    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    document.getElementById("workspaceTitle").textContent = "Tableau de bord";
    setBreadcrumb(null);
  }

  function securityTabForAction(actionName) {
    if (/personnes autorisées|vérifier l’identité|autoriser une sortie|refuser une sortie|préparer une sortie|sorties en attente/i.test(actionName)) return "pickup";
    if (/scanner un qr|enregistrer une entrée|enregistrer une sortie|élèves dans l’école|historique des passages|incidents|alertes et anomalies/i.test(actionName)) return "scan";
    return "";
  }

  function pilotageTabForAction(actionName) {
    if (/tableau de bord|indicateurs|vue exécutive|statistiques/i.test(actionName)) return "dashboard";
    if (/alertes|approbations/i.test(actionName)) return "alerts";
    return "";
  }

  function openSecurityModule(actionName) {
    var requestedMode = securityTabForAction(actionName || "") || (currentDemoRole === "guard" ? "pickup" : "scan");
    document.getElementById("pedagogyModule").hidden = true;
    document.getElementById("financeModule").hidden = true;
    document.getElementById("pilotageModule").hidden = true;
    document.getElementById("feeControlModule").hidden = true;
    document.getElementById("accessConsole").hidden = true;
    document.getElementById("securityModule").hidden = false;
    setWorkspaceDashboardVisible(false);
    document.getElementById("cardsProtected").hidden = true;
    if (window.SchoolSafeSecurityModule) window.SchoolSafeSecurityModule.render("securityContent", { mode: requestedMode, user: getCurrentUser() });
    document.querySelector(".workspace-content").scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeSecurityModule() {
    document.getElementById("securityModule").hidden = true;
    document.getElementById("feeControlModule").hidden = true;
    setWorkspaceDashboardVisible(true);
    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    document.getElementById("workspaceTitle").textContent = "Tableau de bord";
    setBreadcrumb(null);
  }

  function openPilotageModule(actionName) {
    var requestedTab = pilotageTabForAction(actionName || "") || "dashboard";
    document.getElementById("pedagogyModule").hidden = true;
    document.getElementById("financeModule").hidden = true;
    document.getElementById("securityModule").hidden = true;
    document.getElementById("feeControlModule").hidden = true;
    document.getElementById("accessConsole").hidden = true;
    document.getElementById("pilotageModule").hidden = false;
    setWorkspaceDashboardVisible(false);
    document.getElementById("cardsProtected").hidden = true;
    document.querySelectorAll("#pilotageTabs [data-pilotage-tab]").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-pilotage-tab") === requestedTab);
      button.setAttribute("aria-pressed", String(button.getAttribute("data-pilotage-tab") === requestedTab));
    });
    renderPilotageTab(requestedTab);
    document.querySelector(".workspace-content").scrollTo({ top: 0, behavior: "smooth" });
  }

  function closePilotageModule() {
    document.getElementById("pilotageModule").hidden = true;
    document.getElementById("feeControlModule").hidden = true;
    setWorkspaceDashboardVisible(true);
    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    document.getElementById("workspaceTitle").textContent = "Tableau de bord";
    setBreadcrumb(null);
  }

  function renderPilotageTab(tab) {
    if (!window.SchoolSafePilotageModule) return;
    if (tab === "dashboard") window.SchoolSafePilotageModule.renderDashboard("pilotageContent");
    else if (tab === "alerts") window.SchoolSafePilotageModule.renderAlerts("pilotageContent");
  }

  function feeControlTabForAction(actionName) {
    if (/contrôle des frais|contrôle par qr|vérifier le statut financier/i.test(actionName)) return "scan";
    return "";
  }

  function openFeeControlModule(actionName) {
    document.getElementById("pedagogyModule").hidden = true;
    document.getElementById("financeModule").hidden = true;
    document.getElementById("securityModule").hidden = true;
    document.getElementById("pilotageModule").hidden = true;
    document.getElementById("accessConsole").hidden = true;
    document.getElementById("feeControlModule").hidden = false;
    setWorkspaceDashboardVisible(false);
    document.getElementById("cardsProtected").hidden = true;
    if (window.SchoolSafeFeeControlModule) window.SchoolSafeFeeControlModule.render("feeControlContent");
    document.querySelector(".workspace-content").scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeFeeControlModule() {
    document.getElementById("feeControlModule").hidden = true;
    setWorkspaceDashboardVisible(true);
    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    document.getElementById("workspaceTitle").textContent = "Tableau de bord";
    setBreadcrumb(null);
  }

  function schoolTabForAction(actionName) {
    if (/élèves|dossier élève/i.test(actionName)) return "students";
    if (/structure|classes|année scolaire/i.test(actionName)) return "structure";
    if (/mon école|paramètres de l’école|configuration école|école & personnel/i.test(actionName)) return "school";
    if (/mon équipe|personnel|staff/i.test(actionName)) return "staff";
    return "";
  }

  function openSchoolModule(tabName) {
    document.getElementById("pedagogyModule").hidden = true;
    document.getElementById("financeModule").hidden = true;
    document.getElementById("securityModule").hidden = true;
    document.getElementById("pilotageModule").hidden = true;
    document.getElementById("feeControlModule").hidden = true;
    document.getElementById("accessConsole").hidden = true;
    document.getElementById("schoolModule").hidden = false;
    setWorkspaceDashboardVisible(false);
    document.getElementById("cardsProtected").hidden = true;
    if (window.SchoolSafeSchoolModule) {
      window.SchoolSafeSchoolModule.render(tabName, getCurrentUser());
    }
    document.querySelector(".workspace-content").scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeSchoolModule() {
    document.getElementById("schoolModule").hidden = true;
    setWorkspaceDashboardVisible(true);
    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    document.getElementById("workspaceTitle").textContent = "Tableau de bord";
    setBreadcrumb(null);
  }

  function pdfLibrary() {
    return window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
  }

  function pdfDocumentText(value) {
    if (typeof value !== "string" || !window.SchoolSafeI18n) return value;
    var mode = window.SchoolSafeI18n.documentLanguage();
    var english = window.SchoolSafeI18n.translateText(value, "en");
    var prefixTranslations = [
      ["Statut :", "Status:"], ["Classe :", "Class:"], ["Numéro :", "Number:"], ["Centre :", "Center:"],
      ["Enseignant :", "Teacher:"], ["Nom de l’élève :", "Student name:"], ["Matricule :", "Student ID:"],
      ["Journée du", "Day of"], ["candidat(s) dans cet export.", "candidate(s) in this export."],
      ["École de démonstration SchoolSafe", "SchoolSafe demonstration school"],
      ["Adresse physique de l’école à configurer", "School address to configure"],
      ["E-mail de l’école à configurer", "School email to configure"],
      ["Site internet de l’école à configurer", "School website to configure"],
      ["APERÇU NON OFFICIEL · IDENTITÉ DE L’ÉCOLE À CONFIGURER", "UNOFFICIAL PREVIEW · SCHOOL IDENTITY TO CONFIGURE"],
      ["Mathématiques", "Mathematics"], ["Devoir", "Assignment"], ["Interrogation", "Quiz"],
      ["Examen", "Exam"], ["Activité compensatoire", "Make-up activity"], [" · suite", " · continued"]
    ];
    prefixTranslations.forEach(function (pair) { english = english.replace(pair[0], pair[1]); });
    if (mode === "en") return english;
    if (mode === "bilingual" && english !== value) return value + " / " + english;
    return value;
  }

  function configurePdfLanguage(doc) {
    var originalText = doc.text.bind(doc);
    var originalSplit = doc.splitTextToSize.bind(doc);
    doc.text = function (text) {
      var args = Array.prototype.slice.call(arguments, 1);
      var translated = Array.isArray(text) ? text.map(pdfDocumentText) : pdfDocumentText(text);
      return originalText.apply(doc, [translated].concat(args));
    };
    doc.splitTextToSize = function (text) {
      var args = Array.prototype.slice.call(arguments, 1);
      return originalSplit.apply(doc, [pdfDocumentText(text)].concat(args));
    };
    return doc;
  }

  function pdfSchoolIdentity() {
    return {
      name: state && state.schoolName ? state.schoolName : "École de démonstration SchoolSafe",
      legalName: state && state.legalName ? state.legalName : "Instance locale non configurée",
      email: state && state.email ? state.email : "E-mail de l’école à configurer",
      address: state && state.address ? state.address + ", " + (state.city || "") : "Adresse physique de l’école à configurer",
      website: state && (state.websiteAddress || state.website) ? (state.websiteAddress || state.website) : "Site internet de l’école à configurer",
      official: Boolean(state && state.schoolName && state.email && state.address && state.officialLogoData)
    };
  }

  function loadPdfLogo() {
    return new Promise(function (resolve) {
      var image = new Image();
      image.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d").drawImage(image, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = function () { resolve(""); };
      image.src = state && state.officialLogoData ? state.officialLogoData : "schoolsafe-logo.png";
    });
  }

  function sanitizeFilename(value) {
    return String(value || "schoolsafe").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  }

  function pdfHeader(doc, identity, logo, title, subtitle) {
    doc.setFillColor(7, 26, 61);
    doc.rect(0, 0, 210, 34, "F");
    if (logo) doc.addImage(logo, "PNG", 12, 5, 24, 24);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(identity.name, 42, 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(identity.address + " | " + identity.email, 150), 42, 18);
    doc.text(identity.website, 42, 28);
    doc.setTextColor(7, 26, 61);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(title, 14, 47);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(83, 96, 119);
    doc.text(subtitle, 14, 53);
    if (!identity.official) {
      doc.setTextColor(180, 55, 50);
      doc.setFont("helvetica", "bold");
      doc.text("APERÇU NON OFFICIEL · IDENTITÉ DE L’ÉCOLE À CONFIGURER", 196, 47, { align: "right" });
    }
    doc.setDrawColor(220, 226, 236);
    doc.line(14, 57, 196, 57);
  }

  function pdfFooter(doc, identity) {
    var pages = doc.getNumberOfPages();
    for (var page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(220, 226, 236);
      doc.line(14, 285, 196, 285);
      doc.setFontSize(7);
      doc.setTextColor(100, 110, 128);
      doc.text("SchoolSafe by PRODELI SARLU · www.schoolsafe1.com", 14, 290);
      doc.text("Page " + page + " / " + pages, 196, 290, { align: "right" });
    }
  }

  function drawTableHeader(doc, columns, y) {
    doc.setFillColor(235, 240, 247);
    doc.rect(14, y, 182, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(45, 57, 78);
    columns.forEach(function (column) { doc.text(column.label, column.x, y + 5); });
    return y + 10;
  }
  window.SchoolSafePdfUtils = window.SchoolSafePdfUtils || {
    pdfLibrary: pdfLibrary,
    pdfDocumentText: pdfDocumentText,
    configurePdfLanguage: configurePdfLanguage,
    pdfSchoolIdentity: pdfSchoolIdentity,
    loadPdfLogo: loadPdfLogo,
    sanitizeFilename: sanitizeFilename,
    pdfHeader: pdfHeader,
    pdfFooter: pdfFooter,
    drawTableHeader: drawTableHeader
  };

  async function exportCertificationPdf(scope, candidateIndex) {
    var JsPdf = pdfLibrary();
    if (!JsPdf) { notify("Le générateur PDF n’est pas disponible."); return; }
    var exam = certificationExam();
    var identity = pdfSchoolIdentity();
    var logo = await loadPdfLogo();
    var doc = configurePdfLanguage(new JsPdf({ unit: "mm", format: "a4" }));
    var individual = typeof candidateIndex === "number";
    var records = individual ? [exam.candidates[candidateIndex]] : (scope === "all" ? exam.candidates.filter(function (item) { return item.published && item.percentage != null; }) : certificationCandidates().filter(function (item) { return scope === "preparation" || (item.published && item.percentage != null); }));
    var title = individual ? "Résultat individuel " + exam.label : (scope === "preparation" ? "Préparation " + exam.label : "Résultats " + exam.label);
    pdfHeader(doc, identity, logo, title, exam.fullName + " · " + exam.session);
    if (individual) {
      var candidate = records[0];
      var hasExamDetails = Boolean(candidate.option);
      doc.setFillColor(245, 248, 252);
      doc.roundedRect(14, 65, 182, hasExamDetails ? 76 : 58, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(7, 48, 112);
      doc.text(candidate.name, 22, 78);
      doc.setFontSize(9);
      doc.setTextColor(55, 67, 88);
      doc.text("Classe : " + candidate.className, 22, 89);
      doc.text("Numéro : " + candidate.number, 22, 97);
      doc.text("Centre : " + candidate.center, 22, 105);
      doc.setFontSize(24);
      doc.setTextColor(candidate.decision === "Réussi" ? 8 : 155, candidate.decision === "Réussi" ? 122 : 81, candidate.decision === "Réussi" ? 85 : 0);
      doc.text(candidate.percentage == null ? "NON PUBLIÉ" : String(candidate.percentage).replace(".", ",") + " %", 187, 88, { align: "right" });
      doc.setFontSize(11);
      doc.text(candidate.decision, 187, 101, { align: "right" });
      doc.setFontSize(8);
      doc.setTextColor(83, 96, 119);
      if (hasExamDetails) {
        doc.text("Option / filière : " + candidate.option, 22, 113);
        doc.text("Jury : " + candidate.jury + " · Participation : " + candidate.participationStatus, 22, 121);
        doc.text("Ce document SchoolSafe n’est ni un diplôme d’État ni un relevé officiel.", 22, 132);
      } else {
        doc.text("Source officielle à documenter · validation locale de démonstration", 22, 116);
      }
    } else {
      var detailedExam = exam.label === "EXETAT";
      var columns = detailedExam ? [{ label: "Candidat", x: 16 }, { label: "Classe / option", x: 62 }, { label: "Numéro", x: 118 }, { label: scope === "preparation" ? "Préparation" : "Résultat", x: 151 }, { label: "Décision", x: 174 }] : [{ label: "Candidat", x: 16 }, { label: "Classe", x: 73 }, { label: "Numéro", x: 96 }, { label: scope === "preparation" ? "Préparation" : "Résultat", x: 130 }, { label: "Décision", x: 162 }];
      var y = drawTableHeader(doc, columns, 65);
      records.forEach(function (candidate) {
        var rowHeight = detailedExam ? 13 : 10;
        if (y + rowHeight > 275) { doc.addPage(); pdfHeader(doc, identity, logo, title, exam.fullName + " · " + exam.session); y = drawTableHeader(doc, columns, 65); }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(38, 50, 73);
        doc.text(candidate.name, 16, y + 4);
        doc.text(candidate.className, detailedExam ? 62 : 73, y + 4);
        if (detailedExam && candidate.option) {
          doc.setFontSize(6);
          doc.setTextColor(83, 96, 119);
          doc.text(doc.splitTextToSize(candidate.option, 50)[0], 62, y + 8);
          doc.setFontSize(7.5);
          doc.setTextColor(38, 50, 73);
        }
        doc.text(candidate.number, detailedExam ? 118 : 96, y + 4);
        doc.text((scope === "preparation" ? candidate.preparation : candidate.percentage) + " %", detailedExam ? 151 : 130, y + 4);
        doc.text(scope === "preparation" ? candidate.dossier : candidate.decision, detailedExam ? 174 : 162, y + 4);
        doc.setDrawColor(230, 234, 241);
        doc.line(14, y + rowHeight - 3, 196, y + rowHeight - 3);
        y += rowHeight;
      });
      doc.setFontSize(8);
      doc.setTextColor(83, 96, 119);
      doc.text(records.length + " candidat(s) dans cet export.", 14, Math.min(y + 7, 280));
    }
    pdfFooter(doc, identity);
    doc.save(sanitizeFilename(exam.label + "-" + title + (individual ? "-" + records[0].name : "")) + ".pdf");
    notify("PDF " + exam.label + " téléchargé.");
  }

  function captureAssignmentDraft(form) {
    if (!form) return pedagogyState.assignmentDraftMeta;
    var data = new FormData(form);
    ["title","className","subject","language","type","teacher","scale","due","prerequisites","instructions"].forEach(function (key) {
      pedagogyState.assignmentDraftMeta[key] = key === "scale" ? Number(data.get(key) || 0) : String(data.get(key) || "");
    });
    return pedagogyState.assignmentDraftMeta;
  }

  function answerSpaceHeight(question) {
    if (question.answerSpace === "Page entière") return 180;
    if (question.answerSpace === "Demi-page") return 95;
    var lines = parseInt(question.answerSpace, 10) || 3;
    return Math.max(22, lines * 7);
  }

  function assignmentNeedsTranslationNotice(assignment) {
    if (!window.SchoolSafeI18n) return false;
    var mode = window.SchoolSafeI18n.documentLanguage();
    var source = String(assignment.language || "").toUpperCase();
    if (mode === "bilingual") return source !== "FR/EN" && source !== "BILINGUAL";
    if (mode === "en") return source !== "EN";
    return source === "EN";
  }

  async function exportAssignmentPdf(assignment) {
    // DOC-03 : le Document Engine du module Pédagogie est désormais le chemin officiel
    // pour les devoirs/interrogations. Si le nouveau module est chargé, on redirige
    // l’utilisateur vers lui au lieu de générer un PDF concurrent.
    if (window.SchoolSafePedagogyModule && document.getElementById("pedagogyContent").querySelector("[data-pedagogy-tab]")) {
      notify("Utilisez le module Devoirs pour générer le PDF avec le Document Engine.");
      return;
    }
    var JsPdf = pdfLibrary();
    if (!JsPdf) { notify("Le générateur PDF n’est pas disponible."); return; }
    var identity = pdfSchoolIdentity();
    var logo = await loadPdfLogo();
    var doc = configurePdfLanguage(new JsPdf({ unit: "mm", format: "a4" }));
    var questions = assignment.questions && assignment.questions.length ? assignment.questions : pedagogyState.assignmentDraftQuestions;
    pdfHeader(doc, identity, logo, assignment.type + " · " + assignment.subject, assignment.title + " · " + assignment.className + " · " + assignment.language);
    var contentOffset = assignmentNeedsTranslationNotice(assignment) ? 6 : 0;
    if (contentOffset) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(164, 92, 12);
      doc.text("Traduction non disponible : contenu original conservé.", 14, 61);
    }
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(45, 57, 78);
    doc.text("Enseignant : " + (assignment.teacher || "À renseigner"), 14, 64 + contentOffset);
    doc.text("Date : ____________________", 78, 64 + contentOffset);
    doc.text("Nom de l’élève : __________________________________________", 14, 71 + contentOffset);
    doc.text("Matricule : ____________________", 126, 71 + contentOffset);
    doc.setFont("helvetica", "bold");
    doc.text("Prérequis", 14, 81 + contentOffset);
    doc.setFont("helvetica", "normal");
    var prereq = doc.splitTextToSize(assignment.prerequisites || "Aucun prérequis indiqué.", 176);
    doc.text(prereq, 14, 87 + contentOffset);
    var y = 87 + contentOffset + prereq.length * 4 + 4;
    doc.setFont("helvetica", "bold");
    doc.text("Consignes", 14, y);
    doc.setFont("helvetica", "normal");
    var instructions = doc.splitTextToSize(assignment.instructions || "Répondre lisiblement à toutes les questions.", 176);
    doc.text(instructions, 14, y + 6);
    y += 8 + instructions.length * 4;
    questions.forEach(function (question, index) {
      var questionLines = doc.splitTextToSize((index + 1) + ". " + question.text, 160);
      var required = questionLines.length * 5 + answerSpaceHeight(question) + 15;
      if (y + required > 280) { doc.addPage(); pdfHeader(doc, identity, logo, assignment.type + " · " + assignment.subject, assignment.title + " · suite"); y = 66; }
      doc.setFillColor(245, 248, 252);
      doc.roundedRect(14, y, 182, questionLines.length * 5 + 11, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(24, 42, 72);
      doc.text(questionLines, 18, y + 7);
      doc.setFontSize(7);
      doc.text(question.points + " point(s)", 192, y + 7, { align: "right" });
      y += questionLines.length * 5 + 15;
      doc.setFont("helvetica", "normal");
      doc.setDrawColor(185, 195, 210);
      var height = answerSpaceHeight(question);
      if (question.type === "Dessin") {
        doc.rect(18, y, 174, height);
      } else if (question.type === "Choix multiple" && question.choices) {
        String(question.choices).split(";").forEach(function (choice, choiceIndex) { doc.rect(20, y + choiceIndex * 9, 4, 4); doc.text(choice.trim(), 28, y + 3 + choiceIndex * 9); });
      } else {
        for (var lineY = y + 6; lineY < y + height; lineY += 7) doc.line(18, lineY, 192, lineY);
      }
      y += height + 8;
    });
    pdfFooter(doc, identity);
    doc.save(sanitizeFilename(assignment.type + "-" + assignment.title + "-v" + (assignment.version || 1)) + ".pdf");
    notify("Devoir PDF téléchargé avec sa mise en page A4.");
  }

  function bindPedagogyEvents() {
    document.querySelectorAll("[data-assignment-index]").forEach(function (button) {
      button.addEventListener("click", function () { pedagogyState.selectedAssignment = Number(button.getAttribute("data-assignment-index")); renderPedagogyModule(); });
    });
    var openGrades = document.querySelector("[data-open-grades]");
    if (openGrades) openGrades.addEventListener("click", function () { pedagogyState.activeTab = "grades"; renderPedagogyModule(); });
    var assignmentSelect = document.getElementById("gradeAssignmentSelect");
    if (assignmentSelect) assignmentSelect.addEventListener("change", function () { pedagogyState.selectedAssignment = Number(this.value); renderPedagogyModule(); });
    var form = document.getElementById("assignmentForm");
    if (form) form.addEventListener("submit", function (event) { event.preventDefault(); createAssignment(form, true); });
    if (form) form.addEventListener("input", function () { captureAssignmentDraft(form); });
    var draftButton = document.getElementById("saveAssignmentDraft");
    if (draftButton) draftButton.addEventListener("click", function () { createAssignment(form, false); });
    var addQuestion = document.getElementById("addAssignmentQuestion");
    if (addQuestion) addQuestion.addEventListener("click", function () { captureAssignmentDraft(form); pedagogyState.assignmentDraftQuestions.push({ text: "", type: "Réponse courte", points: 1, answerSpace: "3 lignes", choices: "" }); renderPedagogyModule(); });
    document.querySelectorAll("[data-question-field]").forEach(function (control) {
      control.addEventListener("change", function () { var question = pedagogyState.assignmentDraftQuestions[Number(control.getAttribute("data-question-index"))]; var key = control.getAttribute("data-question-field"); question[key] = key === "points" ? Number(control.value || 0) : control.value; if (key === "type") { captureAssignmentDraft(form); renderPedagogyModule(); } });
      control.addEventListener("input", function () { var question = pedagogyState.assignmentDraftQuestions[Number(control.getAttribute("data-question-index"))]; var key = control.getAttribute("data-question-field"); question[key] = key === "points" ? Number(control.value || 0) : control.value; });
    });
    document.querySelectorAll("[data-remove-question]").forEach(function (button) { button.addEventListener("click", function () { captureAssignmentDraft(form); pedagogyState.assignmentDraftQuestions.splice(Number(button.getAttribute("data-remove-question")), 1); renderPedagogyModule(); }); });
    var previewAssignmentPdf = document.getElementById("previewAssignmentPdf");
    if (previewAssignmentPdf) previewAssignmentPdf.addEventListener("click", function () {
      if (!form.reportValidity()) { notify("Veuillez renseigner le titre du devoir avant de produire le PDF."); return; }
      var draft = captureAssignmentDraft(form);
      draft.questions = pedagogyState.assignmentDraftQuestions.slice();
      draft.version = 1;
      exportAssignmentPdf(draft);
    });
    document.querySelectorAll("[data-download-assignment]").forEach(function (button) { button.addEventListener("click", function () { exportAssignmentPdf(pedagogyState.assignments[Number(button.getAttribute("data-download-assignment"))]); }); });
    document.querySelectorAll("[data-grade-index]").forEach(function (control) {
      control.addEventListener("change", function () { var value = this.value; pedagogyState.assignments[pedagogyState.selectedAssignment].grades[Number(this.getAttribute("data-grade-index"))] = value === "" ? null : (this.tagName === "SELECT" ? value : Number(value)); });
    });
    var saveGrades = document.getElementById("saveGrades");
    if (saveGrades) saveGrades.addEventListener("click", function () { var assignment = pedagogyState.assignments[pedagogyState.selectedAssignment]; queueOfflineOperation("pedagogy", "Brouillon de cotations · " + assignment.title, { kind: "grade-draft", title: assignment.title, grades: assignment.grades.slice() }); notify("Cotations enregistrées comme brouillon local."); });
    var publishGrades = document.getElementById("publishGrades");
    if (publishGrades) publishGrades.addEventListener("click", function () { var assignment = pedagogyState.assignments[pedagogyState.selectedAssignment]; assignment.published = true; queueOfflineOperation("pedagogy", "Publication des cotations · " + assignment.title, { kind: "grade-publication", title: assignment.title, grades: assignment.grades.slice() }); notify(navigator.onLine ? "Cotations préparées pour publication et notification parent." : "Cotations conservées sur l’appareil; publication au retour de la connexion."); renderPedagogyModule(); });
    var rulesForm = document.getElementById("pedagogyRulesForm");
    if (rulesForm) rulesForm.addEventListener("submit", savePedagogyRules);
    var prepareBulletin = document.getElementById("prepareBulletin");
    if (prepareBulletin) prepareBulletin.addEventListener("click", function () { notify("Le PDF officiel attend la validation de la période et le logo de l’école."); });
    var validatePeriod = document.getElementById("validatePeriod");
    if (validatePeriod) validatePeriod.addEventListener("click", function () { var next = pedagogyState.periodStatuses.indexOf(false); if (next !== -1) pedagogyState.periodStatuses[next] = true; queueOfflineOperation("pedagogy", "Validation d’une période pédagogique", { kind: "period-validation", periodIndex: next }); notify("Période validée dans la démonstration locale."); renderPedagogyModule(); });
    var parentChildSelect = document.getElementById("parentPedagogyChildSelect");
    if (parentChildSelect) parentChildSelect.addEventListener("change", function () { pedagogyState.selectedParentChild = Number(this.value); renderPedagogyModule(); });
    var parentBulletin = document.querySelector("[data-parent-bulletin]");
    if (parentBulletin) parentBulletin.addEventListener("click", function () { pedagogyState.activeTab = "bulletin"; renderPedagogyModule(); });
    var returnParent = document.querySelector("[data-return-parent]");
    if (returnParent) returnParent.addEventListener("click", function () { pedagogyState.activeTab = "parent"; renderPedagogyModule(); });
    document.querySelectorAll("[data-remediation-view]").forEach(function (button) {
      button.addEventListener("click", function () { pedagogyState.remediation.activeView = button.getAttribute("data-remediation-view"); renderPedagogyModule(); });
    });
    document.querySelectorAll("[data-remediation-case]").forEach(function (button) {
      button.addEventListener("click", function () { pedagogyState.remediation.selectedCase = Number(button.getAttribute("data-remediation-case")); renderPedagogyModule(); });
    });
    var remediationDecision = document.getElementById("remediationDecisionForm");
    if (remediationDecision) remediationDecision.addEventListener("submit", saveRemediationDecision);
    var cancelDetection = document.getElementById("cancelDetection");
    if (cancelDetection) cancelDetection.addEventListener("click", function () { var item = pedagogyState.remediation.cases[pedagogyState.remediation.selectedCase]; item.cancelled = true; item.status = "Détection annulée"; notify("Détection annulée avec justification locale."); renderPedagogyModule(); });
    document.querySelectorAll("[data-session-form]").forEach(function (form) {
      form.addEventListener("submit", function (event) { event.preventDefault(); var data = new FormData(form); var item = pedagogyState.remediation.cases[Number(form.getAttribute("data-session-form"))]; var present = data.get("presence") === "present"; item.sessions.push({ date: data.get("date"), subject: data.get("subject"), present: present }); notify(present ? "Séance enregistrée." : "Absence enregistrée. Alerte parent et Responsable pédagogique préparée."); renderPedagogyModule(); });
    });
    document.querySelectorAll("[data-add-installment]").forEach(function (button) {
      button.addEventListener("click", function () { var item = pedagogyState.remediation.cases[Number(button.getAttribute("data-add-installment"))]; var remaining = item.price - item.paid; var installment = Math.min(remaining, Math.max(10000, Math.round(item.price / 3 / 1000) * 1000)); if (remaining <= 0) { notify("Le programme est déjà entièrement payé."); return; } item.paid += installment; if (/premier versement/i.test(item.status)) item.status = "Suivi en cours"; notify("Tranche de " + money(installment) + " enregistrée localement."); renderPedagogyModule(); });
    });
    var closeRemediationMonth = document.getElementById("closeRemediationMonth");
    if (closeRemediationMonth) closeRemediationMonth.addEventListener("click", function () { notify("Clôture préparée : 60 % enseignants, 40 % école, sur les montants encaissés."); });
    document.querySelectorAll("[data-report-index]").forEach(function (control) { control.addEventListener("change", function () { pedagogyState.remediation.cases[Number(control.getAttribute("data-report-index"))].report = control.value; }); });
    document.querySelectorAll("[data-save-report]").forEach(function (button) { button.addEventListener("click", function () { notify("Bilan enregistré et transmis au Responsable pédagogique."); }); });
    document.querySelectorAll("[data-validate-report]").forEach(function (button) { button.addEventListener("click", function () { var item = pedagogyState.remediation.cases[Number(button.getAttribute("data-validate-report"))]; item.validated = true; item.status = "Bilan validé"; notify("Bilan de rattrapage validé."); renderPedagogyModule(); }); });
    document.querySelectorAll("[data-cert-exam]").forEach(function (button) { button.addEventListener("click", function () { pedagogyState.certifications.activeExam = button.getAttribute("data-cert-exam"); pedagogyState.certifications.selectedCandidate = 0; pedagogyState.certifications.filters = { className: "Toutes", center: "Tous", decision: "Tous", option: "Toutes" }; renderPedagogyModule(); }); });
    document.querySelectorAll("[data-cert-view]").forEach(function (button) { button.addEventListener("click", function () { pedagogyState.certifications.activeView = button.getAttribute("data-cert-view"); renderPedagogyModule(); }); });
    document.querySelectorAll("[data-cert-filter]").forEach(function (control) { control.addEventListener("change", function () { pedagogyState.certifications.filters[control.getAttribute("data-cert-filter")] = control.value; renderPedagogyModule(); }); });
    document.querySelectorAll("[data-cert-candidate]").forEach(function (button) { button.addEventListener("click", function () { pedagogyState.certifications.selectedCandidate = Number(button.getAttribute("data-cert-candidate")); renderPedagogyModule(); }); });
    document.querySelectorAll("[data-export-cert]").forEach(function (button) { button.addEventListener("click", function () { exportCertificationPdf(button.getAttribute("data-export-cert")); }); });
    document.querySelectorAll("[data-export-cert-person]").forEach(function (button) { button.addEventListener("click", function () { exportCertificationPdf("individual", Number(button.getAttribute("data-export-cert-person"))); }); });
    var saveCertification = document.querySelector("[data-cert-save]");
    if (saveCertification) saveCertification.addEventListener("click", function () { notify("Contrôle du dossier enregistré localement."); });
  }

  function saveRemediationDecision(event) {
    event.preventDefault();
    var data = new FormData(event.currentTarget);
    var item = pedagogyState.remediation.cases[pedagogyState.remediation.selectedCase];
    item.teacher = data.get("teacher");
    item.price = Number(data.get("price"));
    item.start = data.get("start");
    item.end = data.get("end");
    item.status = item.teacher === "Non affecté" ? "Entretien requis" : (item.paid > 0 ? "Suivi en cours" : "En attente du premier versement");
    item.parentStatus = "Entretien effectué";
    notify("Programme mensuel validé et enseignant affecté.");
    renderPedagogyModule();
  }

  function createAssignment(form, published) {
    if (!form || !form.reportValidity()) return;
    var data = new FormData(form);
    var attachment = data.get("attachment");
    var format = attachment && attachment.name ? (/\.pdf$/i.test(attachment.name) ? "PDF" : "Images") : "Texte";
    var questions = pedagogyState.assignmentDraftQuestions.filter(function (question) { return question.text.trim(); }).map(function (question) { return Object.assign({}, question); });
    if (!questions.length && !attachment.name) { notify("Ajoutez au moins une question ou une pièce jointe."); return; }
    pedagogyState.assignments.unshift({ title: data.get("title"), subject: data.get("subject"), language: data.get("language"), className: data.get("className"), type: data.get("type"), due: data.get("due") || "À planifier", format: questions.length ? "PDF SchoolSafe" : format, scale: Number(data.get("scale")), published: published, teacher: data.get("teacher"), prerequisites: data.get("prerequisites") || "Aucun prérequis indiqué.", instructions: data.get("instructions") || "Consignes à compléter.", questions: questions, version: 1, grades: [null, null, null, null] });
    pedagogyState.selectedAssignment = 0;
    pedagogyState.assignmentDraftMeta = { title: "", className: "1re A", subject: "Mathématiques", language: "FR", type: "Devoir", teacher: data.get("teacher") || "Mme Y", scale: 10, due: "À planifier", prerequisites: "", instructions: "" };
    pedagogyState.assignmentDraftQuestions = [{ text: "", type: "Réponse courte", points: 1, answerSpace: "3 lignes", choices: "" }];
    queueOfflineOperation("assignment", (published ? "Publication du devoir · " : "Brouillon de devoir · ") + data.get("title"), { kind: published ? "assignment-publication" : "assignment-draft", title: data.get("title"), className: data.get("className"), subject: data.get("subject"), attachment: attachment && attachment.name ? attachment : null });
    notify(published ? (navigator.onLine ? "Devoir préparé pour publication dans la vue parent." : "Devoir conservé sur l’appareil; publication au retour de la connexion.") : "Devoir enregistré comme brouillon local.");
    renderPedagogyModule();
  }

  function savePedagogyRules(event) {
    event.preventDefault();
    var data = new FormData(event.currentTarget);
    var assessmentTotal = Number(data.get("homeworkWeight")) + Number(data.get("quizWeight")) + Number(data.get("examWeight"));
    var languageTotal = Number(data.get("frenchWeight")) + Number(data.get("englishWeight"));
    var conductTotal = Number(data.get("teacherConduct")) + Number(data.get("disciplineConduct"));
    if (assessmentTotal !== 100 || languageTotal !== 100 || conductTotal !== 100) {
      notify("Chaque groupe de poids doit totaliser 100 %.");
      return;
    }
    pedagogyState.periods.type = data.get("periodType");
    pedagogyState.periods.count = Number(data.get("periodCount"));
    pedagogyState.periods.passMark = Number(data.get("passMark"));
    pedagogyState.periods.precision = Number(data.get("precision"));
    pedagogyState.weights = { homework: Number(data.get("homeworkWeight")), quiz: Number(data.get("quizWeight")), exam: Number(data.get("examWeight")) };
    pedagogyState.languages[0].weight = Number(data.get("frenchWeight"));
    pedagogyState.languages[1].weight = Number(data.get("englishWeight"));
    pedagogyState.conduct = { teacher: Number(data.get("teacherConduct")), discipline: Number(data.get("disciplineConduct")) };
    queueOfflineOperation("pedagogy", "Modification des règles pédagogiques", { kind: "pedagogy-rules", periods: Object.assign({}, pedagogyState.periods), weights: Object.assign({}, pedagogyState.weights), conduct: Object.assign({}, pedagogyState.conduct) });
    notify("Règles pédagogiques enregistrées localement.");
  }

  function sessionDisplayName() {
    return (currentSession && currentSession.profile && currentSession.profile.display_name) || "";
  }

  function sessionInitials() {
    return initialsFromName(sessionDisplayName() || "SchoolSafe");
  }

  function sessionRoleLabel(roleKey) {
    var profile = roleCatalog[roleKey] || roleCatalog.admin;
    return profile.label;
  }

  // --- Cartes Executive KPI (démonstration) --------------------------------
  // Mode démo (aucun token) : cartes calculées depuis les fixtures exposées
  // (structure académique, RH, matières) et marquées DÉMONSTRATION.
  // Mode live : seules les données réelles de l'API Pilotage sont affichées.
  function executiveKpiCard(options) {
    var subs = (options.subs || []).map(function (sub) {
      return '<span class="kpi-exec-sub">' + sub + '</span>';
    }).join("");
    var bar = options.bar && options.bar.length
      ? '<div class="kpi-exec-bar" aria-hidden="true">' + options.bar.map(function (seg) {
          return '<i style="width:' + seg.width + '%;background:' + seg.color + '"></i>';
        }).join("") + '</div>'
      : "";
    return '<article class="kpi-card kpi-card--executive" data-domain="' + options.domain + '">' +
      '<header><span class="kpi-icon" aria-hidden="true"><i data-lucide="' + options.icon + '"></i></span>' +
      '<span class="kpi-exec-title">' + options.title + '</span>' +
      (options.demo ? '<span class="kpi-exec-chip">DÉMONSTRATION</span>' : "") + '</header>' +
      '<b class="kpi-exec-value">' + options.value + '</b>' +
      '<span class="kpi-exec-caption">' + options.caption + '</span>' +
      (subs ? '<div class="kpi-exec-subs">' + subs + '</div>' : "") + bar + '</article>';
  }

  function demoExecutiveKpis() {
    var studentsCard = null;
    var classesCard = null;
    var structure = window.SchoolSafeAcademicStructure;
    var classes = structure && typeof structure.getClasses === "function"
      ? structure.getClasses().filter(function (item) { return !item.isLocalDraft; }) : [];
    var levels = structure && typeof structure.getLevels === "function" ? structure.getLevels() : [];
    if (classes.length) {
      var cycleOf = function (clazz) {
        var level = levels.find(function (item) { return item.id === clazz.levelId; });
        return level ? level.cycle : "";
      };
      var activeClasses = classes.filter(function (item) { return item.status === "ACTIVE"; });
      var matClasses = classes.filter(function (item) { return cycleOf(item) === "Maternelle"; });
      var primClasses = classes.filter(function (item) { return cycleOf(item) === "Primaire"; });
      var sumEnrollment = function (list) {
        return list.reduce(function (total, item) { return total + (Number(item.enrollment) || 0); }, 0);
      };
      var matStudents = sumEnrollment(activeClasses.filter(function (item) { return cycleOf(item) === "Maternelle"; }));
      var primStudents = sumEnrollment(activeClasses.filter(function (item) { return cycleOf(item) === "Primaire"; }));
      var totalStudents = sumEnrollment(activeClasses);
      studentsCard = executiveKpiCard({
        domain: "ecole", icon: "users", title: "Élèves inscrits", value: totalStudents,
        caption: "Total élèves · classes actives", demo: true,
        subs: [matStudents + " Maternelle", primStudents + " Primaire", activeClasses.length + " classes actives"],
        bar: totalStudents ? [
          { width: Math.round((matStudents / totalStudents) * 100), color: "var(--ss-domain-ecole)" },
          { width: Math.round((primStudents / totalStudents) * 100), color: "var(--ss-domain-ecole-2)" }
        ] : null
      });
      classesCard = executiveKpiCard({
        domain: "ecole", icon: "school", title: "Classes", value: classes.length,
        caption: "Classes référencées", demo: true,
        subs: [
          matClasses.length + " Maternelle",
          primClasses.length + " Primaire",
          activeClasses.length + " actives",
          totalStudents && activeClasses.length ? "≈ " + Math.round(totalStudents / activeClasses.length) + " élèves / classe" : "Moyenne non disponible"
        ]
      });
    }
    var hr = window.SchoolSafeHrDemo && typeof window.SchoolSafeHrDemo.getDemoSummary === "function"
      ? window.SchoolSafeHrDemo.getDemoSummary() : null;
    var staffCard = hr ? executiveKpiCard({
      domain: "personnel", icon: "contact-round", title: "Personnel", value: hr.total,
      caption: hr.actifs + " actifs · " + hr.inactifs + " inactif(s)", demo: true,
      subs: [hr.femmes + " Femmes", hr.hommes + " Hommes", hr.enseignants + " Enseignants", hr.administration + " Administration / autres"],
      bar: hr.total ? [
        { width: Math.round((hr.femmes / hr.total) * 100), color: "var(--ss-domain-personnel)" },
        { width: Math.round((hr.hommes / hr.total) * 100), color: "var(--ss-domain-personnel-2)" }
      ] : null
    }) : null;
    var pedagogy = window.SchoolSafePedagogyModule && typeof window.SchoolSafePedagogyModule.getDemoSummary === "function"
      ? window.SchoolSafePedagogyModule.getDemoSummary() : null;
    if (!pedagogy && window.SchoolSafeTeacherPedagogy && Array.isArray(window.SchoolSafeTeacherPedagogy.SUBJECTS)) {
      var demoSubjects = window.SchoolSafeTeacherPedagogy.SUBJECTS;
      var assignedSubjects = demoSubjects.filter(function (subject) {
        return Array.isArray(subject.classIds) && subject.classIds.length > 0;
      });
      pedagogy = {
        total: demoSubjects.length,
        attribuees: assignedSubjects.length,
        nonAttribuees: demoSubjects.length - assignedSubjects.length,
        enseignants: null
      };
    }
    var subjectsCard = pedagogy ? executiveKpiCard({
      domain: "pedagogie", icon: "book-open", title: "Matières", value: pedagogy.total,
      caption: "Matières du référentiel démo", demo: true,
      subs: [pedagogy.attribuees + " attribuées", pedagogy.nonAttribuees + " non attribuées", pedagogy.enseignants == null ? "Enseignants liés · Non disponible" : pedagogy.enseignants + " enseignant(s) lié(s)"]
    }) : null;
    var financeCard = executiveKpiCard({
      domain: "finance", icon: "wallet", title: "Recettes (mois)", value: "—",
      caption: "Non disponible en démonstration",
      subs: ["En règle · Non disponible", "Partiel / attente · Non disponible"]
    });
    var alertsCard = executiveKpiCard({
      domain: "securite", icon: "siren", title: "Alertes actives", value: "0",
      caption: "Aucune alerte fictive ajoutée", demo: true,
      subs: ["0 incident simulé", "Données de démonstration"]
    });
    return [studentsCard, staffCard, classesCard, subjectsCard, financeCard, alertsCard].filter(Boolean);
  }

  function renderDemoExecutiveKpis(desktopContainer, mobileContainer) {
    var cards = demoExecutiveKpis();
    if (desktopContainer) desktopContainer.innerHTML = cards.join("");
    if (mobileContainer) mobileContainer.innerHTML = cards.slice(0, 4).join("");
    icons();
  }

  function renderProfileOverview() {
    var desktopContainer = document.getElementById("dashboardKpi");
    var mobileContainer = document.getElementById("mobileKpi");
    var loadingMarkup = '<article class="kpi-card"><span class="kpi-icon blue"><i data-lucide="loader-2"></i></span><div><b>—</b><span>Chargement…</span><small>—</small></div></article>';
    if (desktopContainer) desktopContainer.innerHTML = loadingMarkup.repeat(6);
    if (mobileContainer) mobileContainer.innerHTML = loadingMarkup.repeat(4);
    icons();

    var perms = (currentSession && currentSession.permissions) || [];
    var liveSession = hasLiveSession();
    var hasDashboardRead = perms.indexOf("pilotage.dashboard.read") >= 0;

    function renderEmpty(state, message) {
      var labels = ["Élèves inscrits", "Personnel actif", "Classes", "Matières", "Recettes (mois)", "Alertes actives"];
      var typeMap = { shield: "denied", wifi: "unavailable", error: "error", empty: "empty" };
      var iconMap = { shield: "shield-off", wifi: "wifi-off", error: "alert-circle", empty: "inbox" };
      var type = typeMap[state] || "empty";
      var icon = iconMap[state];
      if (desktopContainer) {
        desktopContainer.innerHTML = [0, 1, 2, 3, 4, 5].map(function (i) {
          return '<article class="kpi-card">' + window.ssState({ type: type, title: labels[i % labels.length], message: message, icon: icon, size: "compact" }) + '</article>';
        }).join("");
      }
      if (mobileContainer) {
        mobileContainer.innerHTML = [0, 1, 2, 3].map(function (i) {
          return '<article class="kpi-card">' + window.ssState({ type: type, title: labels[i % labels.length], message: message, icon: icon, size: "compact" }) + '</article>';
        }).join("");
      }
      icons();
    }

    if (liveSession && !hasDashboardRead) {
      renderEmpty("shield", "Non accessible");
      return;
    }
    if (!liveSession) {
      renderDemoExecutiveKpis(desktopContainer, mobileContainer);
      return;
    }
    if (!window.SchoolSafePilotageAPI) {
      renderEmpty("wifi", "Source non connectée");
      return;
    }

    window.SchoolSafePilotageAPI.dashboard().then(function (data) {
      var kpis = data && data.kpis ? data.kpis : [];
      if (!kpis.length) {
        renderEmpty("empty", "Aucun indicateur");
        return;
      }
      // Desktop : 6 premiers KPI
      if (desktopContainer) {
        desktopContainer.innerHTML = kpis.slice(0, 6).map(function (kpi, index) {
          return renderKpiCard(kpi, index);
        }).join("");
      }
      // Mobile : 4 premiers KPI
      if (mobileContainer) {
        mobileContainer.innerHTML = kpis.slice(0, 4).map(function (kpi, index) {
          return renderKpiCard(kpi, index);
        }).join("");
      }
      icons();
    }).catch(function () {
      renderEmpty("error", "Données indisponibles · source non connectée.");
    });
  }

  function renderKpiCard(kpi, index) {
    var icon = kpiIconForCode(kpi.code);
    var colors = ["blue", "green", "gold", "purple", "cyan", "coral"];
    var color = colors[index % colors.length];
    var label = kpiLabelForCode(kpi.code);
    var trend = kpi.trend ? String(kpi.trend) : "—";
    var value = escapeMarkup(kpi.value || "—");
    return '<article class="kpi-card"><span class="kpi-icon ' + color + '"><i data-lucide="' + icon + '"></i></span><div><b>' + value + '</b><span>' + escapeMarkup(label) + '</span><small>' + escapeMarkup(trend) + '</small></div></article>';
  }

  function kpiLabelForCode(code) {
    var map = {
      students: "Élèves inscrits", eleves: "Élèves inscrits", pupils: "Élèves inscrits", enrollment: "Élèves inscrits",
      girls: "Filles", filles: "Filles",
      boys: "Garçons", garcons: "Garçons",
      teachers: "Personnel actif", enseignants: "Personnel actif",
      classes: "Classes", cycles: "Cycles",
      presence: "Taux de présence", attendance: "Taux de présence",
      finance: "Recettes (mois)", fees: "Frais de scolarité", payments: "Paiements",
      alerts: "Alertes actives", incidents: "Incidents",
      documents: "Documents", messages: "Messages", announcements: "Annonces"
    };
    var key = String(code || "").toLowerCase().replace(/[^a-z]/g, "");
    return map[key] || escapeMarkup(code);
  }

  function kpiIconForCode(code) {
    var map = {
      students: "users", eleves: "users", pupils: "users", enrollment: "users",
      girls: "user-round", filles: "user-round", women: "user-round",
      boys: "user-round", garcons: "user-round", men: "user-round",
      teachers: "graduation-cap", enseignants: "graduation-cap",
      classes: "school", cycles: "layers-3",
      presence: "clipboard-check", attendance: "clipboard-check",
      finance: "wallet", fees: "wallet-cards", payments: "receipt-text",
      alerts: "triangle-alert", incidents: "siren",
      documents: "files", messages: "messages-square", announcements: "megaphone"
    };
    var key = String(code || "").toLowerCase().replace(/[^a-z]/g, "");
    return map[key] || "gauge";
  }

  function schoolLogoUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    value = value.trim();
    if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/\s]+=*$/i.test(value)) return value;
    try {
      // Les logos téléversés sont servis par l’API, pas par l’origine du frontend.
      var url = new URL(value, apiBase.replace(/\/$/, "") + "/");
      return /^(https?:)$/.test(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch (error) { return null; }
  }

  function renderSchoolBranding() {
    var revision = ++schoolBrandingRevision;
    if (schoolLogoRequest) schoolLogoRequest.abort();
    schoolLogoRequest = null;
    if (schoolLogoObjectUrl) URL.revokeObjectURL(schoolLogoObjectUrl);
    schoolLogoObjectUrl = null;
    var school = hasLiveSession() && currentSession.school;
    var sameSchool = school && school.id && (!currentSession.schoolId || currentSession.schoolId === school.id);
    var source = sameSchool ? schoolLogoUrl(school.logo_path) : null;
    var images = document.querySelectorAll("[data-school-logo]");
    images.forEach(function (image) {
      var brand = image.closest(".workspace-brand, .mobile-brand");
      image.onload = null;
      image.onerror = null;
      image.hidden = true;
      image.removeAttribute("src");
      image.alt = "";
      brand.classList.remove("has-school-logo");
    });
    if (!source) return;
    function displayLogo(url) {
      if (revision !== schoolBrandingRevision) return;
      images.forEach(function (image) {
        var brand = image.closest(".workspace-brand, .mobile-brand");
        image.alt = "Logo " + (school.name || "de l’école");
        image.onload = function () {
          if (revision !== schoolBrandingRevision) return;
          image.hidden = false;
          brand.classList.add("has-school-logo");
        };
        image.onerror = function () {
          if (revision !== schoolBrandingRevision) return;
          image.hidden = true;
          image.removeAttribute("src");
          brand.classList.remove("has-school-logo");
        };
        image.src = url;
      });
    }
    if (source.indexOf("data:") === 0 || new URL(source).origin === window.location.origin) {
      displayLogo(source);
      return;
    }
    // Charger les logos de l’API comme images locales conserve la CSP img-src restrictive.
    var controller = new AbortController();
    schoolLogoRequest = controller;
    fetch(source, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" })
      .then(function (response) {
        if (!response.ok || !/^image\/(png|jpeg|webp)(;|$)/i.test(response.headers.get("content-type") || "")) throw new Error("Logo indisponible");
        return response.blob();
      }).then(function (blob) {
        if (revision !== schoolBrandingRevision) return;
        schoolLogoObjectUrl = URL.createObjectURL(blob);
        displayLogo(schoolLogoObjectUrl);
      }).catch(function () { /* L’identité reste absente si l’image ne peut pas être chargée. */ });
  }

  function renderWorkspace(roleKey) {
    var profile = roleCatalog[roleKey] || roleCatalog.admin;
    currentDemoRole = roleCatalog[roleKey] ? roleKey : "admin";
    document.body.setAttribute("data-active-role", currentDemoRole);
    var accessUser = getCurrentUser();
    var access = window.SchoolSafeAccess;
    // Source unique du mode démo pour les modules finance/fee-control
    window.schoolSafeDemoMode = !hasLiveSession();

    var demoBanner = document.getElementById("workspaceDemoBanner");
    if (demoBanner) {
      demoBanner.hidden = hasLiveSession();
      if (!demoBanner.hidden) icons();
    }

    // Date honnête dans le hero
    var heroDate = document.getElementById("heroDate");
    if (heroDate) {
      heroDate.textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    document.getElementById("pedagogyModule").hidden = true;
    document.getElementById("financeModule").hidden = true;
    document.getElementById("securityModule").hidden = true;
    document.getElementById("pilotageModule").hidden = true;
    document.getElementById("feeControlModule").hidden = true;
    document.getElementById("accessConsole").hidden = true;
    document.getElementById("administrationModule").hidden = true;
    document.getElementById("schoolModule").hidden = true;

    var dashboardContainer = document.getElementById("dashboardContainer");
    setWorkspaceDashboardVisible(true);

    var liveName = sessionDisplayName();
    var roleLabel = sessionRoleLabel(currentDemoRole);
    var firstName = (liveName || profile.short || "Administrateur").split(" ")[0];

    // Greetings
    var greetingText = "Bonjour, " + firstName + " 👋";
    var desktopGreeting = document.getElementById("desktopGreeting");
    var mobileGreeting = document.getElementById("mobileGreeting");
    if (desktopGreeting) desktopGreeting.textContent = greetingText;
    if (mobileGreeting) mobileGreeting.textContent = greetingText;

    // Avatars
    var topbarAvatar = document.getElementById("topbarAvatar");
    var mobileTopbarAvatar = document.getElementById("mobileTopbarAvatar");
    var sidebarAvatar = document.getElementById("sidebarAvatar");
    var avatarUrl = (currentSession && currentSession.avatar) || "./schoolsafe-logo.png";
    if (topbarAvatar) topbarAvatar.src = avatarUrl;
    if (mobileTopbarAvatar) mobileTopbarAvatar.src = avatarUrl;
    if (sidebarAvatar) sidebarAvatar.src = avatarUrl;

    // Sidebar user
    var sidebarUserName = document.getElementById("sidebarUserName");
    if (sidebarUserName) sidebarUserName.textContent = liveName || profile.short;

    // Anciens éléments conservés pour compatibilité
    document.getElementById("workspaceRole").textContent = roleLabel;
    document.getElementById("workspaceTitle").textContent = "Tableau de bord";
    document.getElementById("workspaceInitials").textContent = sessionInitials() || profile.initials;
    document.getElementById("workspaceProfileName").textContent = liveName || profile.short;
    document.getElementById("workspaceEyebrow").textContent = profile.eyebrow;
    document.getElementById("workspaceWelcomeTitle").textContent = profile.welcome;
    document.getElementById("workspaceWelcomeCopy").textContent = profile.copy;

    // Nom de l’établissement (source réelle : currentSession.school.name)
    var workspaceSchoolName = document.getElementById("workspaceSchoolName");
    if (workspaceSchoolName) {
      var schoolName = (currentSession && currentSession.school && currentSession.school.name) || "Toutes les écoles";
      workspaceSchoolName.textContent = schoolName;
    }
    renderSchoolBranding();

    // Dropdown profil
    var profileDropdownAvatar = document.getElementById("profileDropdownAvatar");
    var profileDropdownName = document.getElementById("profileDropdownName");
    var profileDropdownRole = document.getElementById("profileDropdownRole");
    if (profileDropdownAvatar) profileDropdownAvatar.src = avatarUrl;
    if (profileDropdownName) profileDropdownName.textContent = liveName || profile.short;
    if (profileDropdownRole) profileDropdownRole.textContent = roleLabel;

    // KPI
    renderProfileOverview();

    // Role switch
    var roleSwitch = document.getElementById("workspaceRoleSwitch");
    if (roleSwitch) {
      var userRoles = (currentSession && currentSession.roles) || [currentDemoRole];
      roleSwitch.innerHTML = userRoles.map(function (role) {
        var label = roleCatalog[role] ? roleCatalog[role].label : role;
        return '<option value="' + escapeMarkup(role) + '"' + (role === currentDemoRole ? " selected" : "") + ">" + escapeMarkup(label) + "</option>";
      }).join("");
      roleSwitch.hidden = userRoles.length <= 1;
      roleSwitch.disabled = userRoles.length <= 1;
    }

    // Branches visibles selon ACCESS_LAW : permission + portée + condition + exception.
    // En session réelle, SchoolSafeAccess filtre selon currentSession.permissions.
    // En démo sans session, roleCatalog continue de fournir le modèle de navigation.
    var isLiveSession = hasLiveSession();
    var allBranches = Object.keys(branchDefinitions).map(function (key) {
      return { key: key, description: branchDefinitions[key].label, groups: [] };
    });
    var visibleBranches = (isLiveSession && access && typeof access.filterBranches === "function")
      ? access.filterBranches(accessUser, allBranches)
      : profile.branches;

    // Sidebar navigation
    var workspaceNav = document.getElementById("workspaceNav");
    if (workspaceNav) {
      workspaceNav.innerHTML = '<button class="active" type="button" data-dashboard><i data-lucide="layout-dashboard"></i><span>Tableau de bord</span></button>' +
        '<div class="nav-section"><span>Résumé école</span></div>' +
        visibleBranches.map(function (item, index) {
          var definition = branchDefinitions[item.key];
          return '<button type="button" data-branch="' + item.key + '"><i data-lucide="' + definition.icon + '"></i><span>' + definition.label + '</span></button>';
        }).join("") +
        '<div class="nav-section"><span>Système</span></div>' +
        '<button type="button" id="documentsNav"><i data-lucide="files"></i><span>Centre de documents</span></button>' +
        '<button type="button" data-action="Paramètres"><i data-lucide="settings"></i><span>Paramètres</span></button>' +
        '<button type="button" id="permissionsNav"' + (!canManageRoles(accessUser) ? " hidden" : "") + '><i data-lucide="shield-ellipsis"></i><span>Rôles et accès</span></button>' +
        '<button type="button" data-action="Audit et journaux"><i data-lucide="scroll-text"></i><span>Audit et journaux</span></button>' +
        '<button type="button" data-action="Intégrations"><i data-lucide="plug"></i><span>Intégrations</span></button>';
    }

    // Desktop module grid
    var desktopModuleGrid = document.getElementById("desktopModuleGrid");
    if (desktopModuleGrid) {
      desktopModuleGrid.innerHTML = visibleBranches.map(function (item) {
        return renderModuleCard(item);
      }).join("");
    }

    // Mobile quick access
    var mobileQuickAccess = document.getElementById("mobileQuickAccess");
    if (mobileQuickAccess) {
      mobileQuickAccess.innerHTML = visibleBranches.map(function (item) {
        return renderQuickAccessItem(item);
      }).join("");
    }

    // Anciens éléments
    document.getElementById("statusBranchList").innerHTML = visibleBranches.map(function (item) {
      return "<span>" + branchDefinitions[item.key].label + "</span>";
    }).join("");

    document.getElementById("workspaceToday").innerHTML = profile.today.map(function (item) {
      return '<div class="today-item"><span><i data-lucide="' + item[2] + '"></i></span><div><b>' + item[0] + "</b><small>À synchroniser</small></div></div>";
    }).join("");

    document.getElementById("workspaceBranches").innerHTML = visibleBranches.map(function (item) {
      var definition = branchDefinitions[item.key];
      var groups = item.groups.map(function (workGroup) {
        var actions = workGroup.actions.map(function (action) {
          return '<button class="action-button" type="button" data-action="' + action[0] + '"><i data-lucide="' + action[1] + '"></i><span>' + action[0] + "</span></button>";
        }).join("");
        return '<div class="work-group"><h4>' + workGroup.label + '</h4><div class="action-list">' + actions + "</div></div>";
      }).join("");
      return '<section class="branch-section" id="branch-' + item.key + '" style="--branch-color:' + definition.color + ';--branch-bg:' + definition.background + '"><header class="branch-head"><span><i data-lucide="' + definition.icon + '"></i></span><div><h3>' + definition.label + "</h3><p>" + item.description + "</p></div></header>" + groups + "</section>";
    }).join("") + '<div class="scope-note"><i data-lucide="map-pin-check"></i><span><b>Périmètre appliqué :</b> ' + profile.scope + "</span></div>";

    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    document.getElementById("demoRole").value = currentDemoRole;

    // Événements sidebar
    document.querySelectorAll("#workspaceNav [data-dashboard]").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll("#workspaceNav button").forEach(function (b) { b.classList.remove("active"); });
        button.classList.add("active");
        closeWorkspaceMenu();
        showDashboard();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

    document.querySelectorAll("#workspaceNav [data-branch]").forEach(function (button) {
      button.addEventListener("click", function () {
        var branchKey = button.getAttribute("data-branch");
        document.querySelectorAll("#workspaceNav button").forEach(function (b) { b.classList.remove("active"); });
        button.classList.add("active");
        closeWorkspaceMenu();
        openModuleByBranch(branchKey);
      });
    });

    document.querySelectorAll("#workspaceNav [data-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var actionName = button.getAttribute("data-action");
        document.querySelectorAll("#workspaceNav button").forEach(function (b) { b.classList.remove("active"); });
        button.classList.add("active");
        closeWorkspaceMenu();
        if (actionName === "Paramètres") { notify("Paramètres — ouverture dans une prochaine étape."); return; }
        if (actionName === "Audit et journaux") { notify("Audit et journaux — ouverture dans une prochaine étape."); return; }
        if (actionName === "Intégrations") { notify("Intégrations — ouverture dans une prochaine étape."); return; }
      });
    });

    document.querySelectorAll("#workspaceBranches [data-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var section = button.closest("[id^='branch-']");
        var branchKey = section ? section.id.replace(/^branch-/, "") : "";
        openActionByBranch(branchKey, button.getAttribute("data-action") || "");
      });
    });

    var permissionsNav = document.getElementById("permissionsNav");
    if (permissionsNav) {
      permissionsNav.addEventListener("click", function () {
        openAccessConsole();
      });
    }

    var documentsNav = document.getElementById("documentsNav");
    if (documentsNav) {
      documentsNav.addEventListener("click", function () {
        document.querySelectorAll("#workspaceNav button").forEach(function (button) { button.classList.remove("active"); });
        documentsNav.classList.add("active");
        closeWorkspaceMenu();
        openDocumentCenter();
      });
    }

    // Clics sur les cartes modules desktop
    document.querySelectorAll("#desktopModuleGrid .module-card").forEach(function (card) {
      card.addEventListener("click", function () {
        openModuleByBranch(card.getAttribute("data-branch"));
      });
    });

    // Clics sur les cartes écosystème (services SchoolSafe)
    document.querySelectorAll(".ecosystem-grid .ecosystem-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var eco = card.getAttribute("data-ecosystem") || "";
        var statusEl = card.querySelector(".ecosystem-card__status");
        if (statusEl && statusEl.getAttribute("data-status") === "soon") {
          notify("Service à venir — roadmap SchoolSafe.");
          return;
        }
        if (eco === "security" || eco === "guardian" || eco === "cards") {
          openModuleByBranch("security");
          return;
        }
        notify("Écosystème SchoolSafe — service connecté.");
      });
    });

    // Clics sur les accès rapides mobile
    document.querySelectorAll("#mobileQuickAccess .quick-access-item").forEach(function (item) {
      item.addEventListener("click", function () {
        openModuleByBranch(item.getAttribute("data-branch"));
      });
    });

    // Jaspe suggestions
    document.querySelectorAll(".jaspe-suggestions button, .jaspe-input button").forEach(function (button) {
      button.addEventListener("click", function () {
        var query = button.getAttribute("data-query") || "";
        var input = button.closest(".jaspe-card") && button.closest(".jaspe-card").querySelector(".jaspe-input input");
        if (!query && input) query = input.value;
        if (window.SafeAssistant && window.SafeAssistant.openWithQuery) {
          window.SafeAssistant.openWithQuery(query);
        } else {
          notify(query ? "Jaspe : " + query : "Posez votre question à Jaspe.");
        }
      });
    });
    document.querySelectorAll(".jaspe-input input").forEach(function (input) {
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          if (window.SafeAssistant && window.SafeAssistant.openWithQuery) {
            window.SafeAssistant.openWithQuery(input.value);
          } else {
            notify(input.value ? "Jaspe : " + input.value : "Posez votre question à Jaspe.");
          }
        }
      });
    });

    // Navigation mobile bas
    var bottomNav = document.getElementById("workspaceBottomNav");
    if (bottomNav) {
      bottomNav.hidden = false;
      document.querySelectorAll("#workspaceBottomNav [data-bottom-nav]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var target = btn.getAttribute("data-bottom-nav");
          document.querySelectorAll("#workspaceBottomNav .ss-bottom-nav__item").forEach(function (item) { item.classList.remove("active"); });
          btn.classList.add("active");
          if (target === "dashboard") {
            showDashboard();
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
          }
          if (target === "jaspe") {
            if (window.SchoolSafeJaspeDashboard) window.SchoolSafeJaspeDashboard.open(btn);
            return;
          }
          if (target === "menu") {
            var sidebar = document.getElementById("workspaceSidebar");
            var backdrop = document.getElementById("workspaceMenuBackdrop");
            if (sidebar) sidebar.classList.add("open");
            if (backdrop) backdrop.classList.add("visible");
            return;
          }
          notify(target + " — navigation rapide.");
        });
      });
    }

    // Dropdowns topbar desktop + mobile
    bindTopbarDropdown("topbarNotifications", "notificationsDropdown");
    bindTopbarDropdown("topbarMessages", "messagesDropdown");
    bindTopbarDropdown("topbarProfile", "profileDropdown");
    bindTopbarDropdown("mobileNotifications", "notificationsDropdown");
    bindTopbarDropdown("mobileMessages", "messagesDropdown");
    bindTopbarDropdown("mobileProfile", "profileDropdown");

    // Actions du dropdown profil
    var profileDropdownSettings = document.getElementById("profileDropdownSettings");
    if (profileDropdownSettings) {
      profileDropdownSettings.addEventListener("click", function () {
        closeAllDropdowns();
        notify("Paramètres — ouverture dans une prochaine étape.");
      });
    }
    var profileDropdownLogout = document.getElementById("profileDropdownLogout");
    if (profileDropdownLogout) {
      profileDropdownLogout.addEventListener("click", function () {
        closeAllDropdowns();
        showScreen("auth");
      });
    }

    // FAB menu
    var fabMenuBackdrop = document.getElementById("workspaceFabMenuBackdrop");
    if (fabMenuBackdrop && !fabMenuBackdrop.__ssFabBound) {
      fabMenuBackdrop.__ssFabBound = true;
      fabMenuBackdrop.addEventListener("click", function () { toggleFabMenu(false); });
    }
    renderFabMenu(accessUser);

    // Fermeture menu mobile
    var menuBackdrop = document.getElementById("workspaceMenuBackdrop");
    if (menuBackdrop && !menuBackdrop.__ssBackdropBound) {
      menuBackdrop.__ssBackdropBound = true;
      menuBackdrop.addEventListener("click", function () {
        var sidebar = document.getElementById("workspaceSidebar");
        if (sidebar) sidebar.classList.remove("open");
        menuBackdrop.classList.remove("visible");
      });
    }

    // Breadcrumb
    var breadcrumbBack = document.getElementById("workspaceBreadcrumbBack");
    if (breadcrumbBack && !breadcrumbBack.__ssBreadcrumbBound) {
      breadcrumbBack.__ssBreadcrumbBound = true;
      breadcrumbBack.addEventListener("click", function () {
        showDashboard();
      });
    }
    var breadcrumbHome = document.getElementById("workspaceBreadcrumbHome");
    if (breadcrumbHome && !breadcrumbHome.__ssBreadcrumbBound) {
      breadcrumbHome.__ssBreadcrumbBound = true;
      breadcrumbHome.addEventListener("click", function () {
        showDashboard();
      });
    }

    // Fermeture dropdowns au clic extérieur
    if (!document.body.__ssDropdownOutsideBound) {
      document.body.__ssDropdownOutsideBound = true;
      document.addEventListener("click", function (event) {
        var target = event.target;
        if (target.closest(".topbar-tool-wrap")) return;
        if (target.closest(".mobile-tools")) return;
        if (target.closest(".ss-fab-menu")) return;
        if (target.closest('[data-bottom-nav="create"]')) return;
        closeAllDropdowns();
        toggleFabMenu(false);
      });
    }

    // Bouton retour connexion
    var workspaceBack = document.getElementById("workspaceBack");
    if (workspaceBack && !workspaceBack.__ssBackBound) {
      workspaceBack.__ssBackBound = true;
      workspaceBack.addEventListener("click", function () {
        showScreen("auth");
      });
    }

    // Theme toggle
    var themeToggle = document.getElementById("sidebarThemeToggle");
    if (themeToggle && !themeToggle.__ssThemeBound) {
      themeToggle.__ssThemeBound = true;
      themeToggle.addEventListener("change", function () {
        var theme = themeToggle.checked ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", theme);
        try { localStorage.setItem("ss-theme", theme); } catch (e) {}
      });
      themeToggle.checked = document.documentElement.getAttribute("data-theme") === "dark";
    }

    bindDocumentRuntimeContext().catch(function (error) {
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn("[SchoolSafe][Documents] Contexte indisponible:", error && error.message ? error.message : error);
      }
    });
    icons();
    if (window.SchoolSafeCards) window.SchoolSafeCards.init();

    if (window.SchoolSafeJaspeDashboard) window.SchoolSafeJaspeDashboard.refresh(firstName);
  }

  function renderModuleCard(branchItem) {
    var definition = branchDefinitions[branchItem.key];
    var desc = branchItem.description || "";
    return '<button type="button" class="module-card module-card--' + branchItem.key + '" data-branch="' + branchItem.key + '" aria-label="' + escapeMarkup(definition.label) + '">' +
      '<span class="module-card__header"><span class="module-card__icon" aria-hidden="true"><i data-lucide="' + definition.icon + '"></i></span></span>' +
      '<span class="module-card__title">' + definition.label + '</span>' +
      '<span class="module-card__desc">' + desc + '</span>' +
      '<span class="module-card__link" aria-hidden="true"><i data-lucide="chevron-right"></i></span>' +
      '</button>';
  }

  function renderQuickAccessItem(branchItem) {
    var definition = branchDefinitions[branchItem.key];
    var label = definition.label;
    if (label === "Contrôle et rapports") label = "Rapports";
    return '<button class="quick-access-item quick-access-item--' + branchItem.key + '" type="button" data-branch="' + branchItem.key + '">' +
      '<span class="quick-access-item__icon"><i data-lucide="' + definition.icon + '"></i></span>' +
      '<span>' + label + '</span>' +
      '</button>';
  }

  function openAccountingModule() {
    ["pedagogyModule", "financeModule", "hrModule", "inventoryModule", "communicationModule", "administrationModule", "securityModule", "pilotageModule", "feeControlModule", "accessConsole", "schoolModule"].forEach(function (id) {
      var module = document.getElementById(id);
      if (module) module.hidden = true;
    });
    setWorkspaceDashboardVisible(false);
    document.getElementById("cardsProtected").hidden = true;
    if (window.SchoolSafeAccountingTreasury && typeof window.SchoolSafeAccountingTreasury.render === "function") {
      window.SchoolSafeAccountingTreasury.render("accountingModule");
    }

    document.querySelector(".workspace-content").scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeAccountingModule() {
    if (window.SchoolSafeAccountingTreasury && typeof window.SchoolSafeAccountingTreasury.close === "function") {
      window.SchoolSafeAccountingTreasury.close();
    } else {
      document.getElementById("accountingModule").hidden = true;
      setWorkspaceDashboardVisible(true);
    }
    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    document.getElementById("workspaceTitle").textContent = "Tableau de bord";
    setBreadcrumb(null);
  }

  function hrTabForAction(actionName) {
    if (/contrat/i.test(actionName)) return "contracts";
    if (/affectation/i.test(actionName)) return "assignments";
    if (/absence|congé/i.test(actionName)) return "absence";
    if (/présence/i.test(actionName)) return "attendance";
    if (/biométr/i.test(actionName)) return "biometric";
    if (/salaire|paie|prime|avance|retenue/i.test(actionName)) return "payroll";
    if (/rapport/i.test(actionName)) return "reports";
    if (/personnel|enseignant/i.test(actionName)) return "staff";
    return "dashboard";
  }

  function openHrModule(actionName) {
    ["pedagogyModule", "palmaresModule", "financeModule", "accountingModule", "inventoryModule", "communicationModule", "administrationModule", "securityModule", "pilotageModule", "feeControlModule", "accessConsole", "schoolModule"].forEach(function (id) {
      var module = document.getElementById(id);
      if (module) module.hidden = true;
    });
    setWorkspaceDashboardVisible(false);
    document.getElementById("cardsProtected").hidden = true;
    if (window.SchoolSafeHrDemo && typeof window.SchoolSafeHrDemo.render === "function") {
      window.SchoolSafeHrDemo.render("hrModule");
      window.SchoolSafeHrDemo.open(hrTabForAction(actionName || ""));
    }
    document.querySelector(".workspace-content").scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeHrModule() {
    if (window.SchoolSafeHrDemo && typeof window.SchoolSafeHrDemo.close === "function") window.SchoolSafeHrDemo.close();
    else {
      document.getElementById("hrModule").hidden = true;
      setWorkspaceDashboardVisible(true);
    }
    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    document.getElementById("workspaceTitle").textContent = "Tableau de bord";
    setBreadcrumb(null);
  }

  function inventoryTabForAction(actionName) {
    if (/catalogue|articles/i.test(actionName)) return "catalog";
    if (/emplacements|seuils|niveaux|ruptures/i.test(actionName)) return "levels";
    if (/mouvements/i.test(actionName)) return "movements";
    if (/demandes d’achat|commandes|fournisseurs/i.test(actionName)) return "procurement";
    if (/réceptions|anomalies/i.test(actionName)) return "receipts";
    if (/rapports/i.test(actionName)) return "reports";
    return "dashboard";
  }

  function openInventoryModule(actionName) {
    ["pedagogyModule", "palmaresModule", "financeModule", "accountingModule", "hrModule", "communicationModule", "administrationModule", "securityModule", "pilotageModule", "feeControlModule", "accessConsole", "schoolModule"].forEach(function (id) {
      var module = document.getElementById(id);
      if (module) module.hidden = true;
    });
    setWorkspaceDashboardVisible(false);
    document.getElementById("cardsProtected").hidden = true;
    if (window.SchoolSafeInventoryDemo && typeof window.SchoolSafeInventoryDemo.render === "function") {
      window.SchoolSafeInventoryDemo.render("inventoryModule");
      window.SchoolSafeInventoryDemo.open(inventoryTabForAction(actionName || ""));
    }
    document.querySelector(".workspace-content").scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeInventoryModule() {
    if (window.SchoolSafeInventoryDemo && typeof window.SchoolSafeInventoryDemo.close === "function") window.SchoolSafeInventoryDemo.close();
    else {
      document.getElementById("inventoryModule").hidden = true;
      setWorkspaceDashboardVisible(true);
    }
    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    document.getElementById("workspaceTitle").textContent = "Tableau de bord";
    setBreadcrumb(null);
  }

  function communicationTabForAction(actionName) {
    if (["dashboard", "messages", "announcements", "convocations", "notifications", "channels", "events", "handoffs"].indexOf(actionName) >= 0) return actionName;
    if (/message|direction|parents autorisés/i.test(actionName)) return "messages";
    if (/annonce/i.test(actionName)) return "announcements";
    if (/convocation|rendez-vous/i.test(actionName)) return "convocations";
    if (/notification/i.test(actionName)) return "notifications";
    if (/site|galerie|synchronisation|websync/i.test(actionName)) return "channels";
    if (/événement/i.test(actionName)) return "events";
    if (/liaison/i.test(actionName)) return "handoffs";
    return "dashboard";
  }

  function openCommunicationModule(actionName) {
    ["pedagogyModule", "palmaresModule", "financeModule", "accountingModule", "hrModule", "inventoryModule", "documentCenterModule", "administrationModule", "securityModule", "pilotageModule", "feeControlModule", "accessConsole", "schoolModule", "cardsStudio"].forEach(function (id) {
      var module = document.getElementById(id);
      if (module) module.hidden = true;
    });
    setWorkspaceDashboardVisible(false);
    var cardsProtected = document.getElementById("cardsProtected");
    if (cardsProtected) cardsProtected.hidden = true;
    if (window.SchoolSafeCommunication && typeof window.SchoolSafeCommunication.render === "function") {
      window.SchoolSafeCommunication.render("communicationModule");
      window.SchoolSafeCommunication.open(communicationTabForAction(actionName || ""));
    }
    setBreadcrumb("Communication");
    var workspaceContent = document.querySelector(".workspace-content");
    if (workspaceContent) workspaceContent.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeCommunicationModule() {
    if (window.SchoolSafeCommunication && typeof window.SchoolSafeCommunication.close === "function") window.SchoolSafeCommunication.close();
    else showDashboard();
  }

  function openDocumentCenter() {
    ["pedagogyModule", "palmaresModule", "financeModule", "accountingModule", "hrModule", "inventoryModule", "communicationModule", "administrationModule", "securityModule", "pilotageModule", "feeControlModule", "accessConsole", "schoolModule", "cardsStudio"].forEach(function (id) {
      var module = document.getElementById(id);
      if (module) module.hidden = true;
    });
    setWorkspaceDashboardVisible(false);
    var module = document.getElementById("documentCenterModule");
    if (!module) return;
    module.hidden = false;
    document.getElementById("cardsProtected").hidden = true;
    setBreadcrumb("Centre de documents");
    var documentContent = document.getElementById("documentCenterContent");
    if (documentContent) documentContent.innerHTML = '<div class="document-center__empty"><strong>Chargement du contexte documentaire…</strong><span>Permissions, portée et identité sont vérifiées avant affichage.</span></div>';
    bindDocumentRuntimeContext().then(function () {
      if (window.SchoolSafeDocumentCenter && typeof window.SchoolSafeDocumentCenter.render === "function") {
        window.SchoolSafeDocumentCenter.render("documentCenterContent", getCurrentUser());
      }
    }).catch(function () {
      if (window.SchoolSafeDocumentCenter && typeof window.SchoolSafeDocumentCenter.render === "function") {
        window.SchoolSafeDocumentCenter.render("documentCenterContent", getCurrentUser());
      }
      var content = document.getElementById("documentCenterContent");
      if (content) content.insertAdjacentHTML("afterbegin", '<section class="document-center__notice"><i data-lucide="shield-alert"></i><div><strong>DONNÉES DOCUMENTAIRES INDISPONIBLES</strong><span>Le catalogue Access_Law ou l’identité école n’est pas disponible. Accès fermé · BACKEND_LATER.</span></div></section>');
      icons();
    });
    var workspaceContent = document.querySelector(".workspace-content");
    if (workspaceContent) workspaceContent.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeDocumentCenter() {
    var module = document.getElementById("documentCenterModule");
    if (module) module.hidden = true;
    showDashboard();
  }

  function openAdministrationModule() {
    var access = window.SchoolSafeAccess;
    var user = getCurrentUser();
    var canOpen = access && typeof access.canAccessAny === "function" && access.canAccessAny(user, ["school.manage", "staff.read", "staff.manage", "roles.manage", "safe.assistant.use"]);
    if (!canOpen || !window.SchoolSafeAdministration || typeof window.SchoolSafeAdministration.render !== "function") {
      notify("Centre Administration non autorisé pour cette session.");
      return;
    }
    ["pedagogyModule", "palmaresModule", "financeModule", "accountingModule", "hrModule", "inventoryModule", "communicationModule", "documentCenterModule", "securityModule", "pilotageModule", "feeControlModule", "accessConsole", "schoolModule", "cardsStudio"].forEach(function (id) {
      var module = document.getElementById(id);
      if (module) module.hidden = true;
    });
    setWorkspaceDashboardVisible(false);
    var cardsProtected = document.getElementById("cardsProtected");
    if (cardsProtected) cardsProtected.hidden = true;
    window.SchoolSafeAdministration.render("administrationModule", user, {
      onClose: showDashboard,
      openSchool: function () { openSchoolModule("school"); },
      openStaff: function () { openHrModule("staff"); }
    });
    setBreadcrumb("Administration");
    var workspaceContent = document.querySelector(".workspace-content");
    if (workspaceContent) workspaceContent.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openPhaseDPedagogy(view) {
    if (!window.SchoolSafeTeacherPedagogy || (currentDemoRole !== "teacher" && currentDemoRole !== "pedagogy")) return false;
    if (currentDemoRole === "pedagogy" && view !== "direction") return false;
    setWorkspaceDashboardVisible(false);
    ["pedagogyModule", "palmaresModule", "financeModule", "accountingModule", "hrModule", "inventoryModule", "communicationModule", "administrationModule", "securityModule", "pilotageModule", "feeControlModule", "accessConsole", "schoolModule"].forEach(function (id) {
      var module = document.getElementById(id);
      if (module) module.hidden = true;
    });
    var portal = document.getElementById("teacherPedagogyPortal");
    if (!portal) return false;
    portal.hidden = false;
    window.SchoolSafeTeacherPedagogy.render("teacherPedagogyPortal", getCurrentUser());
    if (view && view !== "dashboard") window.SchoolSafeTeacherPedagogy.open(view);
    return true;
  }

  function openReportsModule(actionName) {
    ["pedagogyModule", "palmaresModule", "financeModule", "accountingModule", "hrModule", "inventoryModule", "communicationModule", "administrationModule", "securityModule", "pilotageModule", "feeControlModule", "accessConsole", "schoolModule"].forEach(function (id) {
      var module = document.getElementById(id);
      if (module) module.hidden = true;
    });
    setWorkspaceDashboardVisible(false);
    document.getElementById("cardsProtected").hidden = true;
    var module = document.getElementById("reportsModule");
    if (module) module.hidden = false;
    if (window.SchoolSafeReportsDemo && typeof window.SchoolSafeReportsDemo.open === "function") {
      var tab = /audit/i.test(actionName || "") ? "audit"
        : /administratif/i.test(actionName || "") ? "administrative"
        : /export/i.test(actionName || "") ? "exports"
        : /historique/i.test(actionName || "") ? "history"
        : "history";
      window.SchoolSafeReportsDemo.open(tab);
    }
    document.querySelector(".workspace-content").scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeReportsModule() {
    var module = document.getElementById("reportsModule");
    if (module) module.hidden = true;
    setWorkspaceDashboardVisible(true);
    document.getElementById("cardsProtected").hidden = false;
  }

  function openModuleByBranch(branchKey) {
    var documentCenter = document.getElementById("documentCenterModule");
    if (documentCenter) documentCenter.hidden = true;
    var definition = branchDefinitions[branchKey];
    if (!definition) return;
    setBreadcrumb(definition.label);
    if (branchKey === "pedagogy" && openPhaseDPedagogy("dashboard")) return;
    if (branchKey === "pedagogy") { openPedagogyModule("Devoirs et corrections"); return; }
    if (branchKey === "finance") { openFinanceModule(); return; }
    if (branchKey === "feeControl") { openFeeControlModule(); return; }
    if (branchKey === "security") { openSecurityModule(currentDemoRole === "guard" ? "Personnes autorisées" : "Scanner un QR"); return; }
    if (branchKey === "care" && currentDemoRole === "canteen") { openFinanceModule("Liaison financière"); return; }
    if (branchKey === "school") { openSchoolModule("school"); return; }
    if (branchKey === "pilotage") { openPilotageModule("Tableau de bord"); return; }
    if (branchKey === "people") { openHrModule(); return; }
    if (branchKey === "accounting") { openAccountingModule(); return; }
    if (branchKey === "inventory") { openInventoryModule(); return; }
    if (branchKey === "communication") { openCommunicationModule(); return; }
    if (branchKey === "administration") { openAdministrationModule(); return; }
    if (branchKey === "reports") { openReportsModule(); return; }
    notify(definition.label + " — ouverture dans une prochaine étape.");
  }

  function openActionByBranch(branchKey, actionName) {
    var documentCenter = document.getElementById("documentCenterModule");
    if (documentCenter) documentCenter.hidden = true;
    var definition = branchDefinitions[branchKey];
    if (!definition) return;
    setBreadcrumb(definition.label);
    if (branchKey === "school" && pedagogyTabForAction(actionName)) { openPedagogyModule(actionName); return; }
    if (branchKey === "school" && securityTabForAction(actionName)) { openSecurityModule(actionName); return; }
    var phaseDViews = {
      "Devoirs et corrections": "assignments",
      "Évaluations et notes": "evaluations",
      "Résultats et moyennes": "results",
      "Moyennes et coefficients": "results",
      "Bulletins": "results",
      "Bulletins à consulter": "results",
      "Palmarès": "results",
      "Difficultés": "difficulties",
      "Rattrapage pédagogique": "remediation",
      "Pilotage pédagogique": "direction"
    };
    if (branchKey === "pedagogy" && phaseDViews[actionName] && openPhaseDPedagogy(phaseDViews[actionName])) return;
    if (branchKey === "pedagogy") { openPedagogyModule(actionName); return; }
    if (branchKey === "care" && /liaison financière/i.test(actionName)) { openFinanceModule(actionName); return; }
    if (branchKey === "finance" && feeControlTabForAction(actionName)) { openFeeControlModule(actionName); return; }
    if (branchKey === "finance") { openFinanceModule(actionName); return; }
    if (branchKey === "accounting") { openAccountingModule(); return; }
    if (branchKey === "people") { openHrModule(actionName); return; }
    if (branchKey === "inventory") { openInventoryModule(actionName); return; }
    if (branchKey === "communication") { openCommunicationModule(actionName); return; }
    if (branchKey === "administration") { openAdministrationModule(); return; }
    if (branchKey === "feeControl") { openFeeControlModule(actionName); return; }
    if (branchKey === "security") { openSecurityModule(actionName); return; }
    if (branchKey === "school") { openSchoolModule(schoolTabForAction(actionName) || "school"); return; }
    if (branchKey === "pilotage") { openPilotageModule(actionName); return; }
    if (branchKey === "reports") { openReportsModule(actionName); return; }
    notify(actionName + " — ouverture dans une prochaine étape.");
  }

  function populateRoleSelect(select, value) {
    select.innerHTML = Array.prototype.map.call(document.getElementById("demoRole").options, function (option) {
      return '<option value="' + escapeMarkup(option.value) + '"' + (option.value === value ? " selected" : "") + ">" + escapeMarkup(option.textContent) + "</option>";
    }).join("");
  }

  function renderPermissionTree(roleKey) {
    var profile = roleCatalog[roleKey] || roleCatalog.guard;
    var person = staffSamples[selectedStaffIndex];
    person.permissions = person.permissions || {};
    person.actionLevels = person.actionLevels || {};
    person.dataViews = person.dataViews || {};
    document.getElementById("permissionTree").innerHTML = profile.branches.map(function (item) {
      var definition = branchDefinitions[item.key];
      var actionCount = item.groups.reduce(function (count, workGroup) { return count + workGroup.actions.length; }, 0);
      var groupMarkup = item.groups.map(function (workGroup) {
        var actionMarkup = workGroup.actions.map(function (action) {
          var permissionKey = item.key + "::" + action[0];
          var checked = person.permissions[permissionKey] !== false;
          var actionLevel = person.actionLevels[permissionKey] || (action[2] === "status" ? "view" : "execute");
          var dataView = person.dataViews[permissionKey] || (action[2] === "status" ? "status" : "useful");
          return '<div class="permission-row' + (checked ? "" : " disabled") + '"><label class="permission-toggle"><input type="checkbox" data-permission-key="' + permissionKey + '"' + (checked ? " checked" : "") + '><span>' + action[0] + '</span></label><label class="permission-choice"><span>Action</span><select data-action-level="' + permissionKey + '"><option value="view"' + (actionLevel === "view" ? " selected" : "") + '>Consulter</option><option value="execute"' + (actionLevel === "execute" ? " selected" : "") + '>Exécuter</option><option value="approve"' + (actionLevel === "approve" ? " selected" : "") + '>Valider</option><option value="admin"' + (actionLevel === "admin" ? " selected" : "") + '>Administrer</option></select></label><label class="permission-choice"><span>Données</span><select data-data-view="' + permissionKey + '"><option value="status"' + (dataView === "status" ? " selected" : "") + '>Statut uniquement</option><option value="useful"' + (dataView === "useful" ? " selected" : "") + '>Informations utiles</option><option value="detailed"' + (dataView === "detailed" ? " selected" : "") + '>Détails autorisés</option><option value="full"' + (dataView === "full" ? " selected" : "") + '>Données complètes</option></select></label></div>';
        }).join("");
        return '<div class="permission-group"><h4>' + workGroup.label + '</h4><div class="permission-rows">' + actionMarkup + "</div></div>";
      }).join("");
      return '<section class="permission-branch"><header><b>' + definition.label + '</b><span class="protected-state">' + actionCount + ' fonctions indépendantes</span></header>' + groupMarkup + "</section>";
    }).join("");
    document.querySelectorAll("[data-permission-key]").forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        person.permissions[checkbox.getAttribute("data-permission-key")] = checkbox.checked;
        checkbox.closest(".permission-row").classList.toggle("disabled", !checkbox.checked);
      });
    });
    document.querySelectorAll("[data-action-level]").forEach(function (select) {
      select.addEventListener("change", function () { person.actionLevels[select.getAttribute("data-action-level")] = select.value; });
    });
    document.querySelectorAll("[data-data-view]").forEach(function (select) {
      select.addEventListener("change", function () { person.dataViews[select.getAttribute("data-data-view")] = select.value; });
    });
  }

  function renderStaffList() {
    document.getElementById("staffList").innerHTML = staffSamples.map(function (person, index) {
      return '<button class="staff-item' + (index === selectedStaffIndex ? " active" : "") + '" type="button" data-staff-index="' + index + '"><span>' + escapeMarkup(person.initials) + '</span><div><b>' + escapeMarkup(person.name) + "</b><small>" + escapeMarkup(roleCatalog[person.role].short) + "</small></div></button>";
    }).join("");
    document.querySelectorAll("[data-staff-index]").forEach(function (button) {
      button.addEventListener("click", function () {
        selectedStaffIndex = Number(button.getAttribute("data-staff-index"));
        renderPermissionEditor();
      });
    });
  }

  function renderPermissionEditor() {
    var person = staffSamples[selectedStaffIndex];
    document.getElementById("editorAvatar").textContent = person.initials;
    document.getElementById("editorName").textContent = person.name;
    document.getElementById("editorAssignment").textContent = roleCatalog[person.role].label + " · " + person.scope;
    populateRoleSelect(document.getElementById("editorRole"), person.role);
    document.getElementById("scopeType").value = person.scopeType;
    document.getElementById("scopeValue").value = person.scope;
    var policy = document.getElementById("accessDataPolicy");
    policy.hidden = person.role !== "pedagogy";
    if (person.role === "pedagogy") {
      policy.innerHTML = '<div><span><i data-lucide="shield-check"></i></span><div><b>Attribution financière limitée</b><p>Régularité scolaire · statut uniquement · périmètre ' + escapeMarkup(person.scope) + '</p></div></div><ul><li>Visible : identité scolaire, classe, En ordre / À régulariser / Indisponible</li><li>Masqué : montants, soldes, paiements, reçus, caisse et trésorerie</li></ul>';
    }
    renderStaffList();
    renderPermissionTree(person.role);
    icons();
  }

  var accessConsoleRevision = 0;

  function showAccessConsoleSurface(live) {
    setWorkspaceDashboardVisible(false);
    ["pedagogyModule", "documentCenterModule", "financeModule", "accountingModule", "hrModule", "inventoryModule", "communicationModule", "administrationModule", "securityModule", "pilotageModule", "feeControlModule", "schoolModule", "cardsStudio", "teacherPedagogyPortal"].forEach(function (id) {
      var element = document.getElementById(id);
      if (element) element.hidden = true;
    });
    document.getElementById("accessConsole").hidden = false;
    document.getElementById("accessConsole").dataset.sessionMode = live ? "native" : "demo";
    document.getElementById("cardsProtected").hidden = true;
    document.getElementById("accessDemoLayout").hidden = live;
    document.getElementById("nativeAccessContent").hidden = !live;
    document.getElementById("accessConsoleTitle").textContent = live ? "Rôles et accès de l’école" : "Attribuer un rôle et limiter son périmètre";
    document.getElementById("accessConsoleDescription").textContent = live
      ? "Compte, rôles, permissions et périmètres de votre école. Un refus explicite reste prioritaire."
      : "Le modèle du rôle active les branches et actions utiles ; les ajustements restent des brouillons de démonstration.";
    setBreadcrumb("Rôles et accès");
    closeWorkspaceMenu();
  }

  async function openAccessConsole() {
    var revision = ++accessConsoleRevision;
    if (!canManageRoles(getCurrentUser())) {
      document.getElementById("nativeAccessContent").replaceChildren();
      document.getElementById("accessConsole").hidden = true;
      notify("Console Rôles et accès non autorisée pour cette session.");
      return;
    }
    var live = hasLiveSession();
    showAccessConsoleSurface(live);
    if (!live) {
      document.getElementById("nativeAccessContent").replaceChildren();
      renderPermissionEditor();
    } else {
      var expectedSession = currentSession;
      var content = document.getElementById("nativeAccessContent");
      content.textContent = "Vérification des droits auprès du serveur…";
      try {
        if (!expectedSession.native || !window.SchoolSafeAuthNative) throw new Error("Session native requise");
        var fresh = await window.SchoolSafeAuthNative.sessionBootstrap();
        if (revision !== accessConsoleRevision || currentSession !== expectedSession || document.getElementById("accessConsole").hidden) return;
        if (!fresh || !fresh.data || fresh.data.schoolId !== expectedSession.schoolId || !fresh.data.profile || fresh.data.profile.id !== expectedSession.profile.id) {
          var changed = new Error("Contexte de session modifié");
          changed.status = 401;
          throw changed;
        }
        applyBootstrap(fresh.data);
        expectedSession = currentSession;
        if (!canManageRoles(getCurrentUser())) {
          content.replaceChildren();
          notify("Vos droits ont changé. La console n’est plus autorisée.");
          return;
        }
        showAccessConsoleSurface(true);
        var catalog = await window.SchoolSafeAccess.loadPermissions();
        if (revision !== accessConsoleRevision || currentSession !== expectedSession || document.getElementById("accessConsole").hidden) return;
        if (!catalog.length || window.SchoolSafeAccess.isPermissionsLoadFailed()) throw new Error("Catalogue indisponible");
        window.SchoolSafeNativeAccessConsole.render(content, getCurrentUser(), catalog, openAccessConsole, {
          isCurrent: function () { return revision === accessConsoleRevision && currentSession === expectedSession && !document.getElementById("accessConsole").hidden; },
          onDenied: function () {
            clearSession();
            closeAccessConsole();
            showScreen("auth");
            notify("Accès expiré ou refusé. Reconnectez-vous pour vérifier vos droits.");
          }
        });
      } catch (error) {
        // applyBootstrap already cleared a malformed projection. Still close this
        // console; stale responses and sessions replaced elsewhere remain ignored.
        var invalidatedProjection = error.code === "INVALID_ACCESS_PROJECTION" && currentSession === null;
        if (revision !== accessConsoleRevision || (currentSession !== expectedSession && !invalidatedProjection) || document.getElementById("accessConsole").hidden) return;
        content.replaceChildren();
        if (error.status === 401 || error.status === 403) {
          clearSession();
          closeAccessConsole();
          showScreen("auth");
          notify("Session expirée ou refusée. Reconnectez-vous pour consulter vos droits.");
          return;
        }
        showAccessConsoleSurface(true);
        var alert = document.createElement("p");
        alert.setAttribute("role", "alert");
        alert.textContent = "Droits indisponibles. La connexion au serveur est nécessaire pour vérifier les accès.";
        var retry = document.createElement("button");
        retry.type = "button";
        retry.id = "retryNativeAccess";
        retry.className = "ss-button ss-button--secondary";
        retry.textContent = "Réessayer";
        retry.addEventListener("click", openAccessConsole);
        content.append(alert, retry);
      }
    }
    document.getElementById("accessConsole").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeAccessConsole() {
    accessConsoleRevision += 1;
    document.getElementById("nativeAccessContent").replaceChildren();
    document.getElementById("accessConsole").hidden = true;
    setWorkspaceDashboardVisible(true);
    document.getElementById("cardsProtected").hidden = currentDemoRole !== "admin" && currentDemoRole !== "admissions";
    setBreadcrumb(null);
  }

  function closeWorkspaceMenu() {
    var sidebar = document.getElementById("workspaceSidebar");
    if (sidebar) sidebar.classList.remove("open");
    var backdrop = document.getElementById("workspaceMenuBackdrop");
    if (backdrop) backdrop.classList.remove("visible");
  }

  function icons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
  }
  window.icons = icons;

  function showScreen(name) {
    if (name === "auth" && window.SchoolSafeAuthLayouts) window.SchoolSafeAuthLayouts.enter(screens.auth);
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("active", key === name);
    });
    screens.splash.inert = name !== "splash";
    document.body.classList.remove("screen-splash", "screen-auth", "screen-setup", "screen-workspace");
    document.body.classList.add("screen-" + name);
    if (name === "workspace") {
      renderWorkspace(document.getElementById("demoRole").value || currentDemoRole);
    }
    if (window.SafeAssistant) window.SafeAssistant.setSurface(name);
    if (window.SchoolSafeJaspeDashboard) window.SchoolSafeJaspeDashboard.syncAccess();
    icons();
    var entryFocus = name === "splash"
      ? screens[name].querySelector("h1")
      : null;
    if (entryFocus) window.requestAnimationFrame(function focusEntry() {
      if (!screens[name].classList.contains("active")) return;
      if (screens[name].contains(document.activeElement) && document.activeElement !== entryFocus) return;
      if (getComputedStyle(entryFocus).visibility !== "visible") {
        window.requestAnimationFrame(focusEntry);
        return;
      }
      entryFocus.focus({ preventScroll: true });
    });
  }
  window.schoolSafeShow = showScreen;

  function notify(message) {
    var toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove("show"); }, 3200);
    dispatchSafeEvent(message);
  }
  window.notify = notify;
  window.SchoolSafeApp = window.SchoolSafeApp || {};
  window.SchoolSafeApp.notify = notify;

  function dispatchSafeEvent(message) {
    var type = "action:success";
    if (/erreur|échec|impossible|refusé/i.test(message)) type = "action:error";
    else if (/publié|terminé|réussi|enregistré|généré/i.test(message)) type = "action:big_success";
    window.dispatchEvent(new CustomEvent("safe:event", { detail: { type: type, message: message } }));
  }

  document.getElementById("enterSplash").addEventListener("click", function () { showScreen("auth"); });
  document.getElementById("backToSplash").addEventListener("click", function () { showScreen("splash"); });

  // JASPE 2.5D — visuel uniquement (aucun raccordement IA dans ce lot)
  (function initJaspe2d() {
    if (window.SchoolSafeJaspe2d) window.SchoolSafeJaspe2d.init();
    var host = document.getElementById("authJaspe");
    var authScreen = document.getElementById("auth");
    var loginForm = document.getElementById("loginForm");
    var returnToPresentationTimer = 0;
    var presence = window.SchoolSafeAuthPresence.bind(authScreen, loginForm);
    function setAuthView(isTyping) { presence.setTyping(isTyping); }
    var showcase = null;
    if (host && window.SchoolSafeJaspe2d && window.SchoolSafeJaspe2d.mountShowcase) {
      // JASPE vivante (LOT B) : poses qui alternent en fondu + réactions ponctuelles.
      // Visuel pur : aucun listener métier modifié, réactions branchées sur des
      // événements déjà émis (focus champ, submit, safe:event du toast).
      showcase = window.SchoolSafeJaspe2d.mountShowcase(host, {
        bubbleHost: document.getElementById("authJaspeDialogue"),
        intervalMs: 8000,
        transparent: true,
        // Both phone presentations and the desktop use the existing V12 welcome
        // engine. Cropping belongs to CSS; it must not disable visual reactions.
        photoOnly: false,
        variants: [
          { pack: "pack3", key: "explain", bubble: "Bonjour ! Je suis Jaspe, votre assistante. Entrez vos identifiants pour continuer." },
          { pack: "pack1", key: "idle", bubble: "Vos données restent dans votre école, en toute confiance." },
          { pack: "pack1", key: "wave", bubble: "Un souci ? « Mot de passe oublié » ou la démonstration ci-dessous." },
          // poses de réaction (hors rotation automatique)
          { pack: "pack2", key: "listening", rotate: false, bubble: "Je vous écoute…" },
          { pack: "pack2", key: "thinking", rotate: false, bubble: "Je vérifie vos identifiants…" },
          { pack: "pack2", key: "speaking", rotate: false, bubble: "Je vous accompagne…" },
          { pack: "pack4", key: "worried", rotate: false, bubble: "Hmm… vérifiez vos identifiants et réessayez." },
          { pack: "pack3", key: "congratulate", rotate: false, bubble: "Bienvenue ! J'ouvre votre espace…" }
        ]
      });
    }
    // Deux présentations automatiques d'un même formulaire : accueil avec Jaspe,
    // puis saisie. Le formulaire reste monté et conserve toutes ses valeurs.
    setAuthView(false);
    if (authScreen && loginForm) {
      var authTextFields = 'input[type="email"], input[type="tel"], input[type="password"], input[type="text"], textarea';
      loginForm.addEventListener("focusin", function (event) {
        window.clearTimeout(returnToPresentationTimer);
        // Ne pas déplacer les boutons au pointerdown : le clic E-mail/Téléphone
        // doit se terminer avant toute réduction de la présentation.
        if (!event.target.matches(authTextFields)) return;
        setAuthView(true);
        if (showcase) showcase.dispatch({ kind: "listen", holdMs: 4000, source: "auth-focus" });
      });
      loginForm.addEventListener("input", function (event) {
        if (event.target.matches(authTextFields)) setAuthView(true);
      });
      loginForm.addEventListener("focusout", function () {
        window.clearTimeout(returnToPresentationTimer);
        returnToPresentationTimer = window.setTimeout(function () {
          if (!loginForm.contains(document.activeElement)) setAuthView(false);
        }, 180);
      });
      ["enterSplash", "backToSplash"].forEach(function (id) {
        document.getElementById(id).addEventListener("click", function () {
          window.clearTimeout(returnToPresentationTimer);
          presence.reset();
        });
      });
      if (showcase) {
        loginForm.addEventListener("click", function (event) {
          var control = event.target.closest('[data-login-mode], #forgotPassword, #demoRole, #demoEntry');
          if (!control) return;
          var english = document.documentElement.lang === "en";
          var message = control.id === "forgotPassword"
            ? (english ? "Let's recover your access together." : "Je vous accompagne pour retrouver votre accès.")
            : control.id === "demoEntry" || control.id === "demoRole"
              ? (english ? "Explore SchoolSafe with demonstration data." : "Découvrez SchoolSafe avec les données de démonstration.")
              : control.dataset.loginMode === "phone"
                ? (english ? "Enter your phone number to continue." : "Entrez votre numéro de téléphone pour continuer.")
                : (english ? "Enter your e-mail address to continue." : "Entrez votre adresse e-mail pour continuer.");
          showcase.dispatch({ kind: "explain", holdMs: 4500, source: "auth-control" }, message);
        });
        loginForm.addEventListener("submit", function () {
          showcase.dispatch({ kind: "think", holdMs: 6000, source: "auth-submit" });
        });
        // Réactions passives : le toast applicatif émet déjà safe:event (aucune logique touchée)
        window.addEventListener("safe:event", function (event) {
          var type = event && event.detail && event.detail.type;
          if (type === "action:error") showcase.dispatch({ kind: "error", holdMs: 4200, source: "auth-result" });
          else if (type === "action:big_success") showcase.dispatch({ kind: "success", holdMs: 3600, source: "auth-result" });
        });
      }
    }
  })();
  document.getElementById("setupHome").addEventListener("click", function () { showScreen("splash"); });
  document.getElementById("closeSetup").addEventListener("click", function () { showScreen("auth"); });
  document.getElementById("startSetup").addEventListener("click", function () {
    if (window.ssModal) {
      window.ssModal({
        title: "Configuration de l'école",
        subtitle: "Saisissez le token de configuration fourni par SchoolSafe",
        content: '<div class="school-form"><label for="setup-token-input">Token</label><input type="text" id="setup-token-input" class="ss-input" placeholder="Token de configuration" autocomplete="off"></div>',
        size: "sm",
        closeOnBackdrop: false,
        actions: [
          { label: "Annuler", variant: "ghost", close: true },
          {
            label: "Valider",
            variant: "primary",
            close: false,
            onClick: async function (event, modalApi) {
              var input = document.getElementById("setup-token-input");
              var token = input ? input.value.trim() : "";
              if (!token) { modalApi.setError("Veuillez saisir un token."); return; }
              modalApi.setLoading(true);
              try {
                await validateSetupToken(token);
              } catch (error) {
                modalApi.setLoading(false);
                modalApi.setError(error.message || "Impossible de valider le token.");
              }
            }
          }
        ]
      });
    } else {
      var token = window.prompt("Token de configuration de l'école :");
      if (!token) return;
      validateSetupToken(token).catch(function (e) { notify(e.message || "Impossible de valider le token."); });
    }
  });
  function bindIfExists(id, event, handler) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }

  // ─── INC-7 : choix explicite du profil/école ───
  // pendingNativeLogin : identifiants en MÉMOIRE seulement, jamais stockés.
  var pendingNativeLogin = null;
  var profileChoiceMode = "login"; // "login" | "switch"

  function renderProfileChoice(profiles, mode) {
    profileChoiceMode = mode;
    var list = document.getElementById("profileChoiceList");
    if (!list) return;
    list.innerHTML = "";
    profiles.forEach(function (profile) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "ss-button ss-button--secondary profile-choice-item";
      button.setAttribute("role", "option");
      button.setAttribute("data-profile-id", profile.profileId);
      var icon = document.createElement("i");
      icon.setAttribute("data-lucide", "school");
      var schoolName = document.createElement("b");
      schoolName.textContent = profile.schoolName || profile.schoolCode || "École";
      var displayName = document.createElement("span");
      displayName.textContent = profile.displayName || "";
      button.append(icon, schoolName, displayName);
      button.addEventListener("click", function () { chooseNativeProfile(profile.profileId); });
      list.appendChild(button);
    });
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
  }

  async function chooseNativeProfile(profileId) {
    var screen = document.getElementById("profileChoice");
    if (screen.getAttribute("aria-busy") === "true") return;
    var controls = Array.from(screen.querySelectorAll("button"));
    var disabledStates = controls.map(function (control) { return control.disabled; });
    screen.setAttribute("aria-busy", "true");
    controls.forEach(function (control) { control.disabled = true; });
    try {
      if (profileChoiceMode === "login" && pendingNativeLogin) {
        // Les identifiants restent en mémoire pendant le choix explicite.
        var result = await window.SchoolSafeAuthNative.login(
          pendingNativeLogin.login, pendingNativeLogin.password, profileId);
        pendingNativeLogin = null;
        if (!result || !result.profile_id) throw new Error("Profil incomplet");
      } else if (profileChoiceMode === "switch") {
        await window.SchoolSafeAuthNative.switchProfile(profileId);
        clearSession();
      } else {
        throw new Error("Session requise");
      }
      var fresh = await window.SchoolSafeAuthNative.sessionBootstrap();
      if (!fresh || !fresh.data) throw new Error("Profil incomplet");
      currentSession = { token: null, native: true };
      applyBootstrap(fresh.data);
      document.getElementById("password").value = "";
      enterLiveSession();
    } catch (error) {
      pendingNativeLogin = null;
      notify("Choix impossible : session expirée ou profil non autorisé.");
      clearSession();
      showScreen("auth");
    } finally {
      controls.forEach(function (control, index) { control.disabled = disabledStates[index]; });
      screen.removeAttribute("aria-busy");
    }
  }

  bindIfExists("profileChoiceCancel", "click", function () {
    pendingNativeLogin = null;
    showScreen(profileChoiceMode === "switch" ? "workspace" : "auth");
  });

  bindIfExists("topbarCampus", "click", async function () {
    if (!window.SchoolSafeAuthNative) return;
    try {
      var data = await window.SchoolSafeAuthNative.listProfiles();
      if (data && data.profiles && data.profiles.length > 1) {
        renderProfileChoice(data.profiles, "switch");
        showScreen("profileChoice");
      }
    } catch (e) { /* indisponible : rester sur l'espace courant */ }
  });

  bindIfExists("workspaceBack", "click", async function () {    clearSession();
    // Session native (cookie HttpOnly) : déconnexion serveur réelle.
    try { if (window.SchoolSafeAuthNative) await window.SchoolSafeAuthNative.logout(); } catch (e) {}
    document.getElementById("emailIdentifier").value = "";
    document.getElementById("phoneIdentifier").value = "";
    document.getElementById("password").value = "";
    document.getElementById("otpIdentifier").value = "";
    document.getElementById("otpIdentity").classList.add("hidden");
    pendingPhone = null;
    showScreen("auth");
  });
  bindIfExists("closePedagogyModule", "click", closePedagogyModule);
  bindIfExists("closePalmaresModule", "click", closePalmaresModule);
  document.querySelectorAll("#pedagogyTabs [data-pedagogy-tab]").forEach(function (button) {
    button.addEventListener("click", function () {
      pedagogyState.activeTab = button.getAttribute("data-pedagogy-tab");
      renderPedagogyModule();
    });
  });
  bindIfExists("closeFinanceModule", "click", closeFinanceModule);
  bindIfExists("closeAccountingModule", "click", closeAccountingModule);
  bindIfExists("closeHrModule", "click", closeHrModule);
  bindIfExists("closeInventoryModule", "click", closeInventoryModule);
  bindIfExists("closeCommunicationModule", "click", closeCommunicationModule);
  bindIfExists("closeDocumentCenter", "click", closeDocumentCenter);
  bindIfExists("closeSecurityModule", "click", closeSecurityModule);
  bindIfExists("closePilotageModule", "click", closePilotageModule);
  bindIfExists("closeReportsModule", "click", closeReportsModule);
  bindIfExists("closeFeeControlModule", "click", closeFeeControlModule);
  bindIfExists("closeSchoolModule", "click", closeSchoolModule);
  document.querySelectorAll("#pilotageTabs [data-pilotage-tab]").forEach(function (button) {
    button.addEventListener("click", function () {
      document.querySelectorAll("#pilotageTabs [data-pilotage-tab]").forEach(function (b) {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
      renderPilotageTab(button.getAttribute("data-pilotage-tab"));
    });
  });
  var closeWorkspaceMenuBtn = document.getElementById("closeWorkspaceMenu");
  if (closeWorkspaceMenuBtn) closeWorkspaceMenuBtn.addEventListener("click", closeWorkspaceMenu);
  var workspaceMenuBackdrop = document.getElementById("workspaceMenuBackdrop");
  if (workspaceMenuBackdrop) workspaceMenuBackdrop.addEventListener("click", closeWorkspaceMenu);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeWorkspaceMenu();
    if (event.key === "Escape" && !document.getElementById("syncPanel").hidden) closeSyncPanel();
  });
  var syncStatusButton = document.getElementById("syncStatusButton");
  if (syncStatusButton) syncStatusButton.addEventListener("click", openSyncPanel);
  var closeSyncPanelBtn = document.getElementById("closeSyncPanel");
  if (closeSyncPanelBtn) closeSyncPanelBtn.addEventListener("click", closeSyncPanel);
  var syncPanelBackdrop = document.getElementById("syncPanelBackdrop");
  if (syncPanelBackdrop) syncPanelBackdrop.addEventListener("click", closeSyncPanel);
  var syncNowButton = document.getElementById("syncNowButton");
  if (syncNowButton) syncNowButton.addEventListener("click", function () {
    if (!navigator.onLine) { notify("Aucune connexion. La reprise restera automatique."); return; }
    window.SchoolSafeSync.syncNow();
  });
  var installPwaButton = document.getElementById("installPwaButton");
  if (installPwaButton) installPwaButton.addEventListener("click", function () {
    if (!deferredInstallPrompt) { notify("L’installation sera proposée lorsque le navigateur l’autorisera."); return; }
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(function () { deferredInstallPrompt = null; installPwaButton.hidden = true; });
  });
  bindIfExists("workspaceRoleSwitch", "change", function () {
    closeAccessConsole();
    storageSet("schoolsafe-v2-active-role", this.value);
    renderWorkspace(this.value);
  });
  bindIfExists("permissionsNav", "click", openAccessConsole);
  bindIfExists("closeAccessConsole", "click", closeAccessConsole);
  bindIfExists("editorRole", "change", function () {
    var person = staffSamples[selectedStaffIndex];
    person.role = this.value;
    document.getElementById("editorAssignment").textContent = roleCatalog[person.role].label + " · " + person.scope;
    renderStaffList();
    renderPermissionTree(person.role);
    icons();
  });
  bindIfExists("scopeType", "change", function () {
    staffSamples[selectedStaffIndex].scopeType = this.value;
  });
  bindIfExists("scopeValue", "input", function () {
    staffSamples[selectedStaffIndex].scope = this.value;
    document.getElementById("editorAssignment").textContent = roleCatalog[staffSamples[selectedStaffIndex].role].label + " · " + this.value;
  });
  bindIfExists("savePermissions", "click", function () {
    if (hasLiveSession() || !canManageRoles(getCurrentUser())) {
      notify("Les brouillons de démonstration ne modifient pas les droits du compte connecté.");
      return;
    }
    var person = staffSamples[selectedStaffIndex];
    queueOfflineOperation("administration", "Modification des droits · " + person.name, { kind: "permission-change", person: person.name, role: person.role, scopeType: person.scopeType, scope: person.scope, permissions: Object.assign({}, person.permissions || {}), actionLevels: Object.assign({}, person.actionLevels || {}), dataViews: Object.assign({}, person.dataViews || {}) });
    notify("Brouillon d’accès enregistré localement. Aucun serveur n’a été modifié.");
  });

  bindIfExists("demoEntry", "click", function () {
    enterDemo();
  });

  document.getElementById("loginForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    if (form.getAttribute("aria-busy") === "true") return;

    var mode = document.querySelector("[data-login-mode].selected")?.getAttribute("data-login-mode") || "email";
    var identifierInput = document.getElementById(mode === "phone" ? "phoneIdentifier" : "emailIdentifier");
    var passwordInput = document.getElementById("password");
    var identifier = identifierInput.value.trim();
    var password = passwordInput.value;
    identifierInput.removeAttribute("aria-invalid");
    passwordInput.removeAttribute("aria-invalid");

    if (!identifier || (mode === "email" && !identifierInput.validity.valid)
        || (mode === "phone" && !/^\+243\d{9}$/.test(normalizePhone(identifier)))) {
      identifierInput.setAttribute("aria-invalid", "true");
      notify(mode === "phone" ? "Renseignez un numéro de téléphone valide." : "Renseignez une adresse e-mail valide.");
      identifierInput.focus();
      return;
    }
    if (!password) {
      passwordInput.setAttribute("aria-invalid", "true");
      notify("Renseignez le mot de passe.");
      passwordInput.focus();
      return;
    }
    if (mode === "phone") identifier = normalizePhone(identifier);

    var submitButton = form.querySelector('button[type="submit"]');
    var submitContent = submitButton.innerHTML;
    var controls = Array.from(form.querySelectorAll("input, button, select"));
    var disabledStates = controls.map(function (control) { return control.disabled; });
    form.setAttribute("aria-busy", "true");
    controls.forEach(function (control) { control.disabled = true; });
    submitButton.textContent = "Connexion en cours…";

    try {
      if (!window.SchoolSafeAuthNative) throw new Error("Service de connexion indisponible. Rechargez la page.");
      var rememberMe = document.getElementById("remember")?.checked === true;
      var nativeResult = await window.SchoolSafeAuthNative.login(identifier, password, undefined, rememberMe);
      if (!nativeResult) throw new Error("Réponse de connexion incomplète. Réessayez.");
      if (nativeResult.code === "PROFILE_CHOICE_REQUIRED"
          && nativeResult.profiles && nativeResult.profiles.length) {
        pendingNativeLogin = { login: identifier, password: password };
        renderProfileChoice(nativeResult.profiles, "login");
        showScreen("profileChoice");
        return;
      }
      if (!nativeResult.profile_id) throw new Error("Réponse de connexion incomplète. Réessayez.");
      var nativeBootstrap = await window.SchoolSafeAuthNative.sessionBootstrap();
      if (!nativeBootstrap || !nativeBootstrap.data) throw new Error("Profil incomplet");
      currentSession = { token: null, native: true };
      applyBootstrap(nativeBootstrap.data);
      passwordInput.value = "";
      enterLiveSession();
    } catch (error) {
      clearSession();
      notify("Échec de connexion : " + (error.message || error.statusText || "erreur inconnue"));
    } finally {
      controls.forEach(function (control, index) { control.disabled = disabledStates[index]; });
      submitButton.innerHTML = submitContent;
      form.removeAttribute("aria-busy");
      icons();
    }
  });
  document.querySelectorAll("[data-login-mode]").forEach(function (button) {
    button.addEventListener("click", function () {
      var mode = button.getAttribute("data-login-mode");
      document.querySelectorAll("[data-login-mode]").forEach(function (item) {
        var selected = item === button;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      var emailGroup = document.getElementById("emailIdentity");
      var phoneGroup = document.getElementById("phoneIdentity");
      var otpGroup = document.getElementById("otpIdentity");
      var emailInput = document.getElementById("emailIdentifier");
      var phoneInput = document.getElementById("phoneIdentifier");
      var otpInput = document.getElementById("otpIdentifier");
      emailGroup.classList.toggle("hidden", mode !== "email");
      phoneGroup.classList.toggle("hidden", mode !== "phone");
      otpGroup.classList.add("hidden");
      otpInput.value = "";
      pendingPhone = null;
      emailInput.required = mode === "email";
      phoneInput.required = mode === "phone";
      otpInput.required = false;
      (mode === "email" ? emailInput : phoneInput).focus();
    });
  });
  document.getElementById("forgotPassword").addEventListener("click", async function () {
    var overlay = document.createElement("div");
    overlay.className = "ss-overlay";
    overlay.innerHTML = '<div class="ss-modal ss-modal--lg"><div class="ss-modal-head"><h2>Récupérer mon compte</h2><p>Saisissez votre identifiant pour découvrir les méthodes disponibles.</p></div><div class="ss-modal-body"><div class="ss-field"><label class="ss-label" for="recoveryIdentifier">E-mail ou téléphone</label><input class="ss-input" id="recoveryIdentifier" type="text" autocomplete="username" placeholder="nom@ecole.cd ou +243..."></div><div id="recoveryMethodsList" class="recovery-methods-list" hidden></div><div id="recoveryFeedback" class="ss-field-note"></div></div><div class="ss-modal-actions"><button class="ss-button ss-button--ghost" id="recoveryCancel" type="button">Annuler</button><button class="ss-button ss-button--primary" id="recoveryDiscover" type="button">Découvrir les méthodes</button></div></div>';
    document.body.appendChild(overlay);
    var identifierInput = document.getElementById("recoveryIdentifier");
    var methodsList = document.getElementById("recoveryMethodsList");
    var feedback = document.getElementById("recoveryFeedback");
    var discoverBtn = document.getElementById("recoveryDiscover");
    var cancelBtn = document.getElementById("recoveryCancel");
    identifierInput.focus();

    function closeRecovery() { overlay.remove(); }
    cancelBtn.addEventListener("click", closeRecovery);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeRecovery(); });
    identifierInput.addEventListener("keydown", function (e) { if (e.key === "Enter") discoverBtn.click(); if (e.key === "Escape") closeRecovery(); });

    discoverBtn.addEventListener("click", async function () {
      var login = identifierInput.value.trim();
      if (!login) { feedback.textContent = "Veuillez saisir un identifiant."; feedback.className = "ss-field-note ss-field-note--error"; return; }
      discoverBtn.disabled = true;
      discoverBtn.textContent = "Recherche en cours…";
      feedback.className = "ss-field-note";
      feedback.textContent = "";
      try {
        if (!window.SchoolSafeAuthNative) throw new Error("Service indisponible.");
        var data = await window.SchoolSafeAuthNative.getRecoveryMethods(login);
        var methods = data && data.methods ? data.methods : [];
        methodsList.innerHTML = "";
        if (!methods.length) {
          methodsList.innerHTML = "<p>Aucune méthode de récupération disponible pour cet identifiant.</p>";
        } else {
          methods.forEach(function (method) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ss-button ss-button--secondary recovery-method-btn";
            btn.setAttribute("data-method", method);
            if (method === "email") { btn.innerHTML = '<i data-lucide="mail"></i> Recevoir par e-mail'; }
            else if (method === "sms") { btn.innerHTML = '<i data-lucide="message-square"></i> Recevoir par SMS'; }
            else if (method === "webauthn") { btn.innerHTML = '<i data-lucide="smartphone"></i> Utiliser cet appareil'; }
            else if (method === "admin") { btn.innerHTML = '<i data-lucide="shield-check"></i> Assistance administrateur'; }
            methodsList.appendChild(btn);
          });
          if (window.lucide) window.lucide.createIcons();
        }
        methodsList.hidden = false;
        discoverBtn.textContent = "Actualiser";
        discoverBtn.disabled = false;
      } catch (err) {
        feedback.textContent = "Erreur : " + (err.message || "échec de la découverte");
        feedback.className = "ss-field-note ss-field-note--error";
        discoverBtn.disabled = false;
        discoverBtn.textContent = "Découvrir les méthodes";
      }
    });

    methodsList.addEventListener("click", async function (e) {
      var btn = e.target.closest(".recovery-method-btn");
      if (!btn) return;
      var method = btn.getAttribute("data-method");
      var login = identifierInput.value.trim();
      
      if (method === "email") {
        try {
          await window.SchoolSafeAuthNative.forgot(login);
          feedback.textContent = "Si un compte existe, un lien a été envoyé.";
          feedback.className = "ss-field-note ss-field-note--success";
        } catch (err) { feedback.textContent = "Erreur envoi e-mail."; feedback.className = "ss-field-note ss-field-note--error"; }
      } else if (method === "sms") {
        try {
          await window.SchoolSafeAuthNative.requestSmsRecovery(login);
          feedback.textContent = "Si un compte existe, un code SMS a été envoyé.";
          feedback.className = "ss-field-note ss-field-note--success";
          // TODO: Afficher champ saisie OTP
        } catch (err) { feedback.textContent = "Erreur envoi SMS."; feedback.className = "ss-field-note ss-field-note--error"; }
      } else if (method === "webauthn") {
        try {
          var options = await window.SchoolSafeAuthNative.getWebAuthnRecoveryOptions(login);
          var assertion = await navigator.credentials.get({ publicKey: options });
          var result = await window.SchoolSafeAuthNative.assertWebAuthnRecovery(assertion);
          if (result && result.authorization) {
            feedback.textContent = "Appareil validé. Veuillez créer un nouveau mot de passe.";
            feedback.className = "ss-field-note ss-field-note--success";
            // TODO: Afficher formulaire nouveau mot de passe
          }
        } catch (err) { feedback.textContent = "Échec WebAuthn."; feedback.className = "ss-field-note ss-field-note--error"; }
      } else if (method === "admin") {
        feedback.textContent = "Contactez l'administrateur principal de votre école pour obtenir un code de récupération.";
        feedback.className = "ss-field-note";
        // TODO: Afficher champ saisie code admin
      }
    });
  });
  document.getElementById("togglePassword").addEventListener("click", function () {
    var input = document.getElementById("password");
    var isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    this.setAttribute("aria-label", isPassword ? "Masquer le mot de passe" : "Afficher le mot de passe");
    this.setAttribute("title", isPassword ? "Masquer le mot de passe" : "Afficher le mot de passe");
    this.setAttribute("aria-pressed", String(isPassword));
    this.innerHTML = isPassword ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
    icons();
  });
  document.querySelectorAll(".language-switch button").forEach(function (button) {
    button.addEventListener("click", function () {
      var language = button.getAttribute("data-language") || "fr";
      window.SchoolSafeI18n.setLanguage(language);
      notify(language === "en" ? "English interface enabled." : "Interface française activée.");
    });
  });
  var pdfLanguageMode = document.getElementById("pdfLanguageMode");
  if (pdfLanguageMode) {
    if (window.SchoolSafeI18n) pdfLanguageMode.value = window.SchoolSafeI18n.documentLanguage();
    pdfLanguageMode.addEventListener("change", function () {
      window.SchoolSafeI18n.setDocumentLanguage(this.value);
      queueOfflineOperation("administration", "Modification de la langue des documents PDF", { kind: "document-language", value: this.value });
      notify(window.SchoolSafeI18n.current() === "en" ? "PDF document language saved." : "Langue des documents PDF enregistrée.");
    });
  }

  var stepIndex = 0;
  var stepLabels = [
    "Identité",
    "Cycles",
    "Année scolaire",
    "Coordonnées",
    "Identité visuelle",
    "Administrateur",
    "Vérification"
  ];
  var stepTitles = [
    "Identité de l’école",
    "Cycles d’enseignement",
    "Organisation de l’année scolaire",
    "Coordonnées officielles",
    "Identité visuelle et documents",
    "Administrateur principal",
    "Vérification de l’instance"
  ];
  var defaults = {
    schoolName: "",
    legalName: "",
    schoolType: "Privée agréée",
    schoolCode: "",
    cycles: ["primary"],
    yearLabel: "2026-2027",
    yearStart: "2026-09-01",
    yearEnd: "2027-07-15",
    periods: "Trimestres",
    country: "République démocratique du Congo",
    province: "Kinshasa",
    city: "Kinshasa",
    address: "",
    email: "",
    phone: "+243 ",
    website: "",
    websiteMode: "Créer un nouveau site SchoolSafe",
    websiteAddress: "",
    publicNews: "Après validation",
    publicGallery: "Après validation et consentement",
    publicHonors: "Après validation",
    primaryColor: "#071a3d",
    accentColor: "#e9a515",
    documentFooter: "",
    officialLogoData: "",
    adminFirstName: "",
    adminLastName: "",
    adminEmail: "",
    adminPhone: "+243 ",
    adminPassword: "",
    adminPasswordConfirm: ""
  };
  var state = loadDraft();

  function loadDraft() {
    try {
      var saved = window.localStorage.getItem("schoolsafe-v2-setup");
      return saved ? Object.assign({}, defaults, JSON.parse(saved)) : Object.assign({}, defaults);
    } catch (error) {
      return Object.assign({}, defaults);
    }
  }

  function saveDraft() {
    var toStore = Object.assign({}, state);
    delete toStore.adminPassword;
    delete toStore.adminPasswordConfirm;
    try { window.localStorage.setItem("schoolsafe-v2-setup", JSON.stringify(toStore)); } catch (error) {}
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function field(label, id, value, options) {
    var config = options || {};
    var wideClass = config.wide ? " ss-field--wide" : "";
    var type = config.type || "text";
    var help = config.hint ? String(config.hint) : "";
    var inputHtml;
    if (config.select) {
      inputHtml = ssSelect({
        id: id,
        name: id,
        value: value,
        options: config.select.map(function (item) { return { value: item, label: item }; })
      });
    } else if (config.textarea) {
      inputHtml = ssTextarea({
        id: id,
        name: id,
        value: value,
        placeholder: config.placeholder
      });
    } else {
      inputHtml = ssInput({
        id: id,
        name: id,
        type: type,
        value: value,
        placeholder: config.placeholder
      });
    }
    return ssField({ label: label, inputHtml: inputHtml, help: help, className: wideClass });
  }

  function intro(title, copy) {
    return '<div class="section-intro"><h2>' + title + "</h2><p>" + copy + "</p></div>";
  }

  function renderIdentity() {
    return [
      intro("Présentez l’établissement", "Ces informations identifieront l’instance et alimenteront les en-têtes administratifs. Aucune école n’est préconfigurée."),
      '<div class="ss-form-grid ss-form-grid--2">',
      field("Nom usuel de l’école", "schoolName", state.schoolName, { placeholder: "Ex. Groupe scolaire..." }),
      field("Dénomination légale", "legalName", state.legalName, { placeholder: "Nom figurant sur les documents officiels" }),
      field("Statut de l’établissement", "schoolType", state.schoolType, { select: ["Privée agréée", "Publique", "Conventionnée", "Confessionnelle", "Autre"] }),
      field("Numéro d’agrément ou code école", "schoolCode", state.schoolCode, { placeholder: "À compléter selon les documents officiels" }),
      "</div>"
    ].join("");
  }

  function cycleCard(key, icon, title, description, color, background) {
    var selected = state.cycles.indexOf(key) !== -1;
    return [
      '<label class="cycle-option' + (selected ? " selected" : "") + '" style="--cycle:' + color + ";--cycle-bg:" + background + '">',
      '<input type="checkbox" name="cycles" value="' + key + '"' + (selected ? " checked" : "") + ">",
      '<span class="cycle-icon"><i data-lucide="' + icon + '"></i></span>',
      "<h3>" + title + "</h3><p>" + description + "</p></label>"
    ].join("");
  }

  function activeModules() {
    var modules = ["Pilotage", "Élèves", "Admissions", "Sécurité et accès", "Cartes élèves · protégées", "Finances", "Personnel", "Communication", "PDF officiels", "Audit"];
    if (state.cycles.indexOf("nursery") !== -1) modules.push("Éveil et suivi maternel", "Sorties autorisées", "Santé et cantine");
    if (state.cycles.indexOf("primary") !== -1) modules.push("Matières et devoirs", "Notes et bulletins", "Rattrapage", "TENAFEP / ENAFEP");
    if (state.cycles.indexOf("secondary") !== -1) modules.push("Coefficients", "Interrogations et examens", "Palmarès", "EXETAT");
    return modules;
  }

  function renderCycles() {
    return [
      intro("Choisissez les cycles présents", "SchoolSafe ouvrira les fonctions pédagogiques utiles à ces cycles. Les modules administratifs, financiers et de sécurité restent communs."),
      '<div class="cycle-grid">',
      cycleCard("nursery", "shapes", "Maternelle", "Suivi quotidien, éveil, santé, cantine et autorisations de sortie.", "#c64b45", "#ffe7e4"),
      cycleCard("primary", "book-open", "Primaire", "Classes, matières, devoirs, notes, bulletins et rattrapage.", "#087a55", "#dff8ee"),
      cycleCard("secondary", "graduation-cap", "Secondaire et Humanités", "Coefficients, évaluations, examens, palmarès et rapports officiels.", "#6b42c7", "#eee7ff"),
      '</div><div class="module-preview"><h3>Modules prévus pour cette instance</h3><div class="module-tags">',
      activeModules().map(function (module) { return '<span class="module-tag"><i data-lucide="check"></i>' + module + "</span>"; }).join(""),
      "</div></div>"
    ].join("");
  }

  function renderAcademicYear() {
    return [
      intro("Cadrez l’année scolaire", "Les périodes seront réutilisées dans les présences, les paiements, les évaluations, les bulletins et les rapports."),
      '<div class="ss-form-grid ss-form-grid--2">',
      field("Libellé de l’année scolaire", "yearLabel", state.yearLabel),
      field("Organisation pédagogique", "periods", state.periods, { select: ["Trimestres", "Semestres"] }),
      field("Date de début", "yearStart", state.yearStart, { type: "date" }),
      field("Date de fin", "yearEnd", state.yearEnd, { type: "date" }),
      "</div>"
    ].join("");
  }

  function renderContact() {
    return [
      intro("Renseignez les coordonnées", "Elles apparaîtront sur les documents officiels et serviront aux communications de l’établissement."),
      '<div class="ss-form-grid ss-form-grid--2">',
      field("Pays", "country", state.country),
      field("Province", "province", state.province),
      field("Ville ou territoire", "city", state.city),
      field("Adresse complète", "address", state.address, { placeholder: "Avenue, numéro, commune..." }),
      field("E-mail officiel", "email", state.email, { type: "email", placeholder: "contact@ecole.cd" }),
      field("Téléphone officiel", "phone", state.phone, { type: "tel" }),
      field("Site web actuel", "website", state.website, { wide: true, type: "url", placeholder: "https://..." }),
      "</div>",
      '<section class="school-site-setup"><div class="site-setup-head"><span><i data-lucide="globe-2"></i></span><div><h3>Application privée + site public de l’école</h3><p>SchoolSafe prépare le site avec l’école; seules les publications validées quittent l’espace privé.</p></div></div><div class="ss-form-grid ss-form-grid--2">',
      field("Mode du site", "websiteMode", state.websiteMode, { select: ["Créer un nouveau site SchoolSafe", "Relier un site existant", "Configurer plus tard"] }),
      field("Adresse souhaitée ou existante", "websiteAddress", state.websiteAddress, { type: "url", placeholder: "https://nom-ecole..." }),
      field("Publication des actualités", "publicNews", state.publicNews, { select: ["Après validation", "Désactivée"] }),
      field("Publication des photos", "publicGallery", state.publicGallery, { select: ["Après validation et consentement", "Désactivée"] }),
      field("Publication du palmarès", "publicHonors", state.publicHonors, { select: ["Après validation", "Désactivée"] }),
      '</div><div class="publication-flow"><span>Privé</span><i data-lucide="arrow-right"></i><span>Brouillon</span><i data-lucide="arrow-right"></i><span>Validation</span><i data-lucide="arrow-right"></i><span>Site public</span></div></section>'
    ].join("");
  }

  function renderBrand() {
    var logoInputHtml = '<label class="logo-upload" for="officialLogoInput"><span><i data-lucide="image-up"></i><b>' + (state.officialLogoData ? "Logo officiel chargé" : "Sélectionner le logo officiel") + '</b><span>PNG haute définition, fond transparent recommandé</span></span><input id="officialLogoInput" type="file" accept="image/png,image/jpeg" hidden></label>';
    return [
      intro("Installez l’identité officielle", "Le logo validé sera obligatoire sur chaque PDF officiel. Les couleurs personnalisent l’interface sans modifier le moteur de cartes."),
      '<div class="ss-form-grid ss-form-grid--2">',
      ssField({ label: "Logo officiel de l’école", inputHtml: logoInputHtml, className: "ss-field--wide" }),
      field("Couleur principale", "primaryColor", state.primaryColor, { type: "color" }),
      field("Couleur d’accent", "accentColor", state.accentColor, { type: "color" }),
      field("Mention de pied de page des PDF", "documentFooter", state.documentFooter, { wide: true, textarea: true, placeholder: "Adresse, contacts et références légales" }),
      "</div>"
    ].join("");
  }

  function renderAdmin() {
    return [
      intro("Créez le premier responsable", "L’Administrateur principal attribuera ensuite les profils, les modules, les actions et les périmètres de chaque membre du personnel."),
      '<div class="ss-form-grid ss-form-grid--2">',
      field("Prénom", "adminFirstName", state.adminFirstName),
      field("Nom", "adminLastName", state.adminLastName),
      field("E-mail professionnel", "adminEmail", state.adminEmail, { type: "email", placeholder: "direction@ecole.cd" }),
      field("Téléphone", "adminPhone", state.adminPhone, { type: "tel" }),
      field("Mot de passe", "adminPassword", state.adminPassword, { type: "password", placeholder: "Minimum 8 caractères" }),
      field("Confirmer le mot de passe", "adminPasswordConfirm", state.adminPasswordConfirm, { type: "password" }),
      '<div class="ss-field ss-field--wide">' + ssState({ type: "warning", title: "Sécurité", message: "Ce compte sera créé immédiatement. L’authentification forte sera exigée pour les profils sensibles.", size: "inline" }) + "</div>",
      "</div>"
    ].join("");
  }

  function row(label, value) {
    return '<div class="review-row"><span>' + label + "</span><b>" + esc(value || "À compléter") + "</b></div>";
  }

  function renderReview() {
    var cycleNames = { nursery: "Maternelle", primary: "Primaire", secondary: "Secondaire et Humanités" };
    return [
      intro("Contrôlez avant de poursuivre", "Cette étape termine uniquement la maquette locale. Elle ne crée aucune base, aucun compte et aucun service sur le VPS."),
      '<div class="review-grid">',
      '<section class="review-block"><h3>Établissement</h3>',
      row("Nom", state.schoolName), row("Statut", state.schoolType), row("Code", state.schoolCode),
      '</section><section class="review-block"><h3>Cycles et année</h3>',
      row("Cycles", state.cycles.map(function (key) { return cycleNames[key]; }).join(", ")), row("Année", state.yearLabel), row("Périodes", state.periods),
      '</section><section class="review-block"><h3>Contact</h3>',
      row("Localisation", [state.city, state.province].filter(Boolean).join(", ")), row("E-mail", state.email), row("Téléphone", state.phone),
      row("Site", state.websiteMode), row("Adresse", state.websiteAddress || state.website), row("Publications", "Actualités, galerie et palmarès après validation"),
      '</section><section class="review-block"><h3>Administrateur principal</h3>',
      row("Nom", [state.adminFirstName, state.adminLastName].filter(Boolean).join(" ")), row("E-mail", state.adminEmail), row("Téléphone", state.adminPhone),
      '</section></div>',
      '<div class="warning-note"><i data-lucide="shield-alert"></i><span>La prochaine phase préparera l’analyse d’impact de l’authentification, des permissions et du schéma de données. Les opérations officielles sont traitées par le serveur de l’école.</span></div>'
    ].join("");
  }

  var renderers = [renderIdentity, renderCycles, renderAcademicYear, renderContact, renderBrand, renderAdmin, renderReview];

  function collectFields() {
    document.querySelectorAll("#stepContent input:not([name=cycles]), #stepContent select, #stepContent textarea").forEach(function (control) {
      if (control.name) state[control.name] = control.value;
    });
    var cycleControls = Array.prototype.slice.call(document.querySelectorAll('input[name="cycles"]'));
    if (cycleControls.length) {
      state.cycles = cycleControls.filter(function (control) { return control.checked; }).map(function (control) { return control.value; });
    }
    saveDraft();
  }

  function renderNav() {
    var nav = document.getElementById("stepNav");
    nav.innerHTML = stepLabels.map(function (label, index) {
      var status = index === stepIndex ? " active" : index < stepIndex ? " done" : "";
      var endIcon = index < stepIndex ? '<i data-lucide="check"></i>' : "";
      return '<button class="step-link' + status + '" type="button" data-step="' + index + '"><span class="number">' + (index < stepIndex ? "✓" : index + 1) + '</span><span>' + label + "</span>" + endIcon + "</button>";
    }).join("");
    nav.querySelectorAll(".step-link").forEach(function (button) {
      button.addEventListener("click", function () {
        collectFields();
        stepIndex = Number(button.getAttribute("data-step"));
        renderStep();
      });
    });
  }

  function bindStepEvents() {
    document.querySelectorAll('input[name="cycles"]').forEach(function (control) {
      control.addEventListener("change", function () {
        collectFields();
        if (!state.cycles.length) {
          state.cycles = [control.value];
          control.checked = true;
        }
        renderStep();
      });
    });
    var upload = document.getElementById("officialLogoInput");
    if (upload) upload.addEventListener("change", function () {
      var file = upload.files && upload.files[0];
      if (!file) return;
      if (!/^image\/(png|jpeg)$/.test(file.type)) { notify("Utilisez un logo PNG ou JPEG."); return; }
      var reader = new FileReader();
      reader.onload = function () { state.officialLogoData = reader.result; saveDraft(); notify("Logo officiel enregistré dans le brouillon local."); renderStep(); };
      reader.readAsDataURL(file);
    });
    document.querySelectorAll("#stepContent input, #stepContent select, #stepContent textarea").forEach(function (control) {
      control.addEventListener("change", collectFields);
    });
  }

function validateStep(index) {
    if (index === 0) {
      if (!state.schoolName.trim()) return "Le nom de l'école est obligatoire.";
    }
    if (index === 1) {
      if (!state.cycles.length) return "Sélectionnez au moins un cycle.";
    }
    if (index === 2) {
      if (!state.yearLabel.trim()) return "Le libellé de l'année est obligatoire.";
      if (!state.yearStart) return "La date de début d'année est obligatoire.";
      if (!state.yearEnd) return "La date de fin d'année est obligatoire.";
    }
    if (index === 3) {
      if (!state.email.trim()) return "L'e-mail officiel est obligatoire.";
      if (!state.phone.trim()) return "Le téléphone officiel est obligatoire.";
      if (state.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) return "L'e-mail saisi n'est pas valide.";
    }
    if (index === 4) {
      if (!state.officialLogoData) return "Le logo officiel est obligatoire.";
    }
    if (index === 5) {
      if (!state.adminFirstName.trim() || !state.adminLastName.trim()) return "Le prénom et le nom sont obligatoires.";
      if (!state.adminEmail.trim()) return "L'e-mail de l'administrateur est obligatoire.";
      if (state.adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.adminEmail.trim())) return "L'e-mail de l'administrateur n'est pas valide.";
      if (!state.adminPassword || state.adminPassword.length < 8) return "Le mot de passe doit faire au moins 8 caractères.";
      if (state.adminPassword !== state.adminPasswordConfirm) return "Les mots de passe ne correspondent pas.";
    }
    return null;
  }

  async function submitSetup() {
    if (!setupToken) throw new Error("Token de configuration manquant.");

    var schoolPayload = {
      token: setupToken,
      identity: {
        name_fr: state.schoolName,
        name_en: state.name_en || state.schoolName,
        legal_name: state.legalName,
        school_type: state.schoolType,
        approval_code: state.schoolCode
      },
      cycles: state.cycles,
      academic_year: {
        label: state.yearLabel,
        starts_on: state.yearStart,
        ends_on: state.yearEnd,
        periods: state.periods
      },
      contact: {
        country: state.country,
        province: state.province,
        city: state.city,
        address: state.address,
        email: state.email,
        phone: state.phone,
        website_url: state.website,
        website_mode: state.websiteMode,
        public_news: state.publicNews,
        public_gallery: state.publicGallery,
        public_honors: state.publicHonors
      },
      brand: {
        primary_color: state.primaryColor,
        accent_color: state.accentColor,
        document_footer: state.documentFooter,
        logo_path: state.officialLogoData || null
      }
    };

    await apiPost("/setup/school", schoolPayload);

    var adminPayload = {
      token: setupToken,
      email: state.adminEmail,
      password: state.adminPassword,
      first_name: state.adminFirstName,
      last_name: state.adminLastName,
      phone: state.adminPhone
    };

    await apiPost("/setup/admin", adminPayload);
  }

  function renderStep() {
    document.getElementById("stepCounter").textContent = "Étape " + (stepIndex + 1) + " sur " + stepLabels.length;
    document.getElementById("stepTitle").textContent = stepTitles[stepIndex];
    document.getElementById("progressBar").style.width = ((stepIndex + 1) / stepLabels.length * 100) + "%";
    document.getElementById("stepContent").innerHTML = renderers[stepIndex]();
    document.getElementById("prevStep").disabled = stepIndex === 0;
    document.getElementById("nextStep").innerHTML = stepIndex === stepLabels.length - 1
      ? 'Terminer la configuration <i data-lucide="check"></i>'
      : 'Continuer <i data-lucide="arrow-right"></i>';
    renderNav();
    bindStepEvents();
    icons();
    document.querySelector(".setup-main").scrollTo({ top: 0, behavior: "smooth" });
  }

  async function restoreSession() {
    var saved = loadSession();
    // La session est désormais vérifiée exclusivement par le cookie du VPS.
    if (saved && saved.token) { clearSession(); saved = null; }
    if (window.SchoolSafeAuthNative) {
      try {
        var meData = await window.SchoolSafeAuthNative.me();
        if (!meData || !meData.profile_id) throw new Error("Session invalide");
        var nativeBootstrap = await window.SchoolSafeAuthNative.sessionBootstrap();
        if (!nativeBootstrap || !nativeBootstrap.data) throw new Error("Profil incomplet");
        currentSession = { token: null, native: true };
        applyBootstrap(nativeBootstrap.data);
        notify("Session restaurée.");
        return;
      } catch (error) {
        // Un refus de session par le VPS interdit la reprise depuis le cache.
        var refused = error.status >= 400 && error.status < 500;
        var unavailable = !refused && (!navigator.onLine || error instanceof TypeError || error.status >= 500);
        if (unavailable && saved && saved.native && saved.profile) {
          currentSession = { token: null, native: true };
          applyBootstrap(saved);
          notify("Hors-ligne : lecture des données autorisées. Les actions sûres seront synchronisées au retour du réseau ; les opérations sensibles (finances, administration) restent bloquées jusqu'à validation par le serveur.");
          return;
        }
        clearSession();
      }
    }
    renderStep();
    initPwaExperience();
    icons();
  }

  document.getElementById("prevStep").addEventListener("click", function () {
    collectFields();
    if (stepIndex > 0) stepIndex -= 1;
    renderStep();
  });
  document.getElementById("nextStep").addEventListener("click", async function () {
    collectFields();
    var error = validateStep(stepIndex);
    if (error) { notify(error); return; }

    if (stepIndex < stepLabels.length - 1) {
      stepIndex += 1;
      renderStep();
      return;
    }

    var button = document.getElementById("nextStep");
    button.disabled = true;
    button.innerHTML = 'Configuration en cours…';

    try {
      await submitSetup();
      storageRemove("schoolsafe-v2-setup");
      notify("Configuration enregistrée. Connectez-vous avec le compte administrateur.");
      window.setTimeout(function () {
        showScreen("auth");
        button.disabled = false;
      }, 900);
    } catch (error) {
      console.error("Setup error", error);
      notify("Échec de la configuration : " + (error.message || "erreur inconnue"));
      button.disabled = false;
      button.innerHTML = 'Terminer la configuration <i data-lucide="check"></i>';
      icons();
    }
  });

  restoreSession();
}());
