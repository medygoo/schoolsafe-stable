/* ============================================================
   SchoolSafe V2 — Moteur central d’autorisation
   Source unique : shared/permissions.json
   Compatible ACCESS_LAW.md : user → school → role → permission → scope → condition → exception → audit
   ============================================================ */
(function () {
  "use strict";

  var ADMIN_ROLE = "admin";
  var permissionsCache = null;
  var permissionsLoadFailed = false;

  // Permissions qui rendent une branche de navigation visible.
  // Une branche est visible si l’utilisateur possède AU MOINS UNE de ces permissions
  // (ou s’il est Administrateur principal).
  var BRANCH_PERMISSIONS = {
    pilotage: [
      "pilotage.dashboard.read",
      "pilotage.alerts.read",
      "pilotage.alerts.manage",
      "pilotage.approvals.read",
      "pilotage.approvals.manage"
    ],
    school: [
      "school.class.read",
      "school.student.read",
      "school.guardian.read",
      "school.guardian.manage",
      "school.manage",
      "security.card.create",
      "cards.request.print"
    ],
    people: [
      "staff.read",
      "staff.attendance.read",
      "staff.manage"
    ],
    pedagogy: [
      "pedagogy.subject.read",
      "pedagogy.subject.manage",
      "pedagogy.assignment.read",
      "pedagogy.assignment.manage",
      "pedagogy.grade.read",
      "pedagogy.grade.manage",
      "pedagogy.lesson-plan.read",
      "pedagogy.lesson-plan.manage",
      "pedagogy.report.read",
      "pedagogy.report.manage",
      "palmarques.read",
      "palmarques.manage"
    ],
    security: [
      "security.pickup.read",
      "security.pickup.manage",
      "security.scan",
      "security.lockdown.manage",
      "security.events.read",
      "security.card.create"
    ],
    finance: [
      "finance.fee.read",
      "finance.fee.manage",
      "finance.payment.record",
      "finance.payment.cancel",
      "finance.receipt.read",
      "finance.report.read",
      "finance.cash_register.close",
      "finance.status.read"
    ],
    feeControl: [
      "finance.control.read",
      "finance.control.manage",
      "finance.control.scan"
    ],
    accounting: [
      "finance.report.read",
      "reports.financial.read"
    ],
    communication: [
      "communication.announcement.manage",
      "communication.message.send"
    ],
    administration: [
      "school.manage",
      "staff.manage",
      "roles.manage"
    ],
    reports: [
      "reports.operational.read",
      "reports.financial.read",
      "reports.security.read",
      "reports.hr.read"
    ],
    care: [
      "canteen.manage",
      "infirmary.manage"
    ]
  };

  // Actions rapides proposées par le bouton + de la bottom nav mobile.
  // Chaque action pointe vers une fonctionnalité déjà existante.
  var QUICK_ACTIONS = [
    { key: "record-payment", label: "Enregistrer un paiement", icon: "wallet", permission: "finance.payment.record" },
    { key: "scan-qr", label: "Scanner un QR", icon: "scan-line", permission: "security.scan" },
    { key: "publish-assignment", label: "Publier un devoir", icon: "notebook-pen", permission: "pedagogy.assignment.manage" },
    { key: "send-message", label: "Envoyer un message", icon: "messages-square", permission: "communication.message.send" }
  ];

  function isAdmin(user) {
    if (!user) return false;
    if (user.role === ADMIN_ROLE) return true;
    if (user.isAdmin === true) return true;
    if (Array.isArray(user.roles) && user.roles.indexOf(ADMIN_ROLE) >= 0) return true;
    return false;
  }

  function userPermissions(user) {
    if (!user) return [];
    return Array.isArray(user.permissions) ? user.permissions : [];
  }

  function permissionExceptions(user) {
    return Array.isArray(user && user.permissionExceptions) ? user.permissionExceptions : [];
  }

  // Navigation metadata for the active school, never authorization of a target.
  var DENY_SCOPES = ["none", "school", "own", "own_children", "assigned_classes", "assigned_subjects", "assigned_portal", "assigned_fee_classes"];
  var DENY_CONDITIONS = ["academic_year_active", "cash_register_open", "campaign_published", "within_cancellation_window", "quota_available", "device_managed", "status_pending", "portal_open"];

  function normalizeDeniedRules(value) {
    function text(value) { return typeof value === "string" && value.length > 0; }
    function date(value) { return value === null || (text(value) && Number.isFinite(Date.parse(value))); }
    if (!Array.isArray(value)) throw new Error("Projection des refus invalide");
    return value.map(function (rule) {
      if (!rule || typeof rule !== "object" || !text(rule.permission) || !text(rule.originId)
        || ["role", "exception"].indexOf(rule.source) < 0 || rule.effect !== "deny"
        || DENY_SCOPES.indexOf(rule.scopeType) < 0 || !(rule.target === null || text(rule.target))
        || !(rule.conditionCode === null || DENY_CONDITIONS.indexOf(rule.conditionCode) >= 0)
        || !(rule.conditionParams === null || (typeof rule.conditionParams === "object" && !Array.isArray(rule.conditionParams)))
        || !date(rule.startsAt) || !date(rule.endsAt)
        || (rule.startsAt && rule.endsAt && Date.parse(rule.startsAt) > Date.parse(rule.endsAt))) {
        throw new Error("Projection des refus invalide");
      }
      return { permission: rule.permission, source: rule.source, originId: rule.originId,
        effect: rule.effect, scopeType: rule.scopeType, target: rule.target,
        conditionCode: rule.conditionCode, conditionParams: rule.conditionParams,
        startsAt: rule.startsAt, endsAt: rule.endsAt };
    });
  }

  function deniedRules(user) {
    // null = old response. [] = explicit empty projection. Invalid data throws.
    return user && Object.prototype.hasOwnProperty.call(user, "deniedRules") ? normalizeDeniedRules(user.deniedRules) : null;
  }

  function currentDeny(rule) {
    var now = Date.now();
    return (!rule.startsAt || Date.parse(rule.startsAt) <= now) && (!rule.endsAt || Date.parse(rule.endsAt) >= now);
  }

  function isGlobalDeny(rule, rules) {
    // IAM ignores target for school/none; it remains descriptive metadata here.
    if (!rule || !currentDeny(rule) || ["school", "none"].indexOf(rule.scopeType) < 0 || rule.conditionCode) return false;
    // SQL grant_scopes_match/exception_scopes_match require class AND subject
    // when the same origin has teacher scopes, even beside a school scope.
    return !(rules || []).some(function (other) {
      return other.source === rule.source && other.originId === rule.originId && currentDeny(other)
        && ["assigned_classes", "assigned_subjects"].indexOf(other.scopeType) >= 0;
    });
  }

  function targetedDenies(user, permissionCode) {
    var rules;
    try { rules = deniedRules(user) || []; } catch (_) { return []; }
    return rules.filter(function (rule) {
      return rule.permission === permissionCode && currentDeny(rule) && !isGlobalDeny(rule, rules);
    });
  }

  function explicitDeny(user, permissionCode) {
    var rules;
    try { rules = deniedRules(user); } catch (_) { return true; }
    if (rules !== null) {
      var matching = rules.filter(function (rule) { return rule.permission === permissionCode; });
      if (matching.length) return matching.some(function (rule) { return isGlobalDeny(rule, rules); });
      // An incomplete projection must not erase an unexplained legacy refusal.
    }
    if (Array.isArray(user && user.deniedPermissions) && user.deniedPermissions.indexOf(permissionCode) >= 0) return true;
    return permissionExceptions(user).some(function (item) {
      return item && item.permission === permissionCode && String(item.effect || "").toLowerCase() === "deny";
    });
  }

  function allowedByException(user, permissionCode) {
    return permissionExceptions(user).some(function (item) {
      return item && item.permission === permissionCode && String(item.effect || "").toLowerCase() === "allow";
    });
  }

  function normalizeScope(permissionCode, value) {
    if (!value) return null;
    if (typeof value === "string") return { permission: permissionCode, type: value };
    if (typeof value === "object" && value.type) return Object.assign({ permission: permissionCode }, value);
    return null;
  }

  // Normaliseur unique (INC-1/INC-2) : tout ce que le frontend consomme passe
  // ici. Format canonique : { permission, type, target }.
  // - canonique/natif : { permission, type|scope, target } → conservé
  // - legacy transitoire : { permission: null, type, target } → écarté
  //   (une portée sans permission est interdite : fail-closed, rien n'apparaît
  //   à tort)
  function normalizeScopes(rawScopes) {
    if (!Array.isArray(rawScopes)) return [];
    var out = [];
    for (var i = 0; i < rawScopes.length; i += 1) {
      var s = rawScopes[i];
      if (!s || typeof s !== "object") continue;
      var permission = s.permission || null;
      var type = s.type || s.scope || null;
      var target = s.target !== undefined ? s.target : (s.id !== undefined ? s.id : null);
      if (!permission || !type) continue;
      out.push({ permission: permission, type: type, target: target });
    }
    return out;
  }

  function scopeFor(user, permissionCode) {
    if (explicitDeny(user, permissionCode)) return null;
    var exception = permissionExceptions(user).find(function (item) {
      return item && item.permission === permissionCode && String(item.effect || "").toLowerCase() === "allow";
    });
    if (exception) {
      // Contrat canonique (INC-6) : les portées de l'exception remontent de la base.
      var canonical = normalizeScopes(exception.scopes);
      if (canonical.length) return canonical[0];
      // Transitoire legacy : portée simple sur l'exception.
      var exceptionScope = normalizeScope(permissionCode, exception.scope || exception.scopeType || exception.scope_type);
      if (exceptionScope) return exceptionScope;
    }
    var scopes = normalizeScopes(user && user.scopes);
    return scopes.find(function (scope) { return scope && scope.permission === permissionCode; }) || null;
  }

  function allowsScope(user, permissionCode, expectedScope) {
    var scope = scopeFor(user, permissionCode);
    return canAccess(user, permissionCode) && !!scope && scope.type === expectedScope;
  }

  /**
   * Vérifie une permission unique.
   * Aucun bypass : l’Administrateur principal passe par ses permissions réelles,
   * comme tout le monde (Access_Law — un DENY explicite l’emporte toujours).
   */
  function canAccess(user, permissionCode) {
    if (explicitDeny(user, permissionCode)) return false;
    return userPermissions(user).indexOf(permissionCode) >= 0 || allowedByException(user, permissionCode);
  }

  /**
   * Vérifie si au moins une permission de la liste est accordée.
   */
  function canAccessAny(user, permissionCodes) {
    if (!Array.isArray(permissionCodes) || permissionCodes.length === 0) return false;
    for (var i = 0; i < permissionCodes.length; i += 1) {
      if (canAccess(user, permissionCodes[i])) return true;
    }
    return false;
  }

  /**
   * Détermine si une branche de navigation doit être visible.
   */
  function isBranchVisible(user, branchKey) {
    var perms = BRANCH_PERMISSIONS[branchKey];
    if (!perms || perms.length === 0) return false;
    return canAccessAny(user, perms);
  }

  /**
   * Filtre un tableau de branches selon les permissions de l’utilisateur.
   */
  function filterBranches(user, branches) {
    if (!Array.isArray(branches)) return [];
    return branches.filter(function (branch) {
      return branch && isBranchVisible(user, branch.key);
    });
  }

  /**
   * Retourne les actions rapides autorisées pour le bouton +.
   */
  function getAllowedQuickActions(user) {
    return QUICK_ACTIONS.filter(function (action) {
      return canAccess(user, action.permission);
    });
  }

  /**
   * Charge le catalogue officiel des permissions.
   */
  function loadPermissions() {
    if (permissionsCache) return Promise.resolve(permissionsCache);
    return fetch("./shared/permissions.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        permissionsLoadFailed = false;
        permissionsCache = data;
        return data;
      })
      .catch(function (err) {
        console.error("[SchoolSafeAccess] catalogue canonique indisponible — accès par portée fermé", err);
        permissionsLoadFailed = true;
        permissionsCache = null;
        return [];
      });
  }

  /**
   * Retourne la portée par défaut d’une permission selon le catalogue officiel.
   */
  function getPermissionScope(permissionCode) {
    return loadPermissions().then(function (permissions) {
      var def = permissions.find(function (p) { return p.code === permissionCode; });
      return def ? def.scope : null;
    });
  }

  window.SchoolSafeAccess = {
    ADMIN_ROLE: ADMIN_ROLE,
    isPermissionsLoadFailed: function () { return permissionsLoadFailed; },
    isAdmin: isAdmin,
    explicitDeny: explicitDeny,
    normalizeDeniedRules: normalizeDeniedRules,
    targetedDenies: targetedDenies,
    isGlobalDeny: isGlobalDeny,
    canAccess: canAccess,
    scopeFor: scopeFor,
    normalizeScopes: normalizeScopes,
    allowsScope: allowsScope,
    canAccessAny: canAccessAny,
    isBranchVisible: isBranchVisible,
    filterBranches: filterBranches,
    getAllowedQuickActions: getAllowedQuickActions,
    getPermissionScope: getPermissionScope,
    loadPermissions: loadPermissions
  };
}());
