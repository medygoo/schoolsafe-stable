(function (global) {
  "use strict";

  var DOMAINS = [
    { key: "school", label: "École / Élèves", capabilities: [
      { permission: "school.student.read", scopes: ["own_children", "assigned_classes", "school"] },
      { permission: "school.class.read", scopes: ["assigned_classes", "school"] },
      { permission: "school.manage", scopes: ["school"] }
    ] },
    { key: "staff", label: "Personnel / RH", capabilities: [
      { permission: "staff.read", scopes: ["school"] },
      { permission: "staff.attendance.read", scopes: ["school"] },
      { permission: "reports.hr.read", scopes: ["school"] }
    ] },
    { key: "pedagogy", label: "Pédagogie", capabilities: [
      { permission: "pedagogy.report.read", scopes: ["own_children", "assigned_classes", "school"] },
      { permission: "pedagogy.assignment.read", scopes: ["own_children", "assigned_classes"] },
      { permission: "pedagogy.grade.read", scopes: ["own_children", "assigned_classes"] }
    ] },
    { key: "security", label: "Sécurité", capabilities: [
      { permission: "security.pickup.read", scopes: ["own_children"] },
      { permission: "security.pickup.manage", scopes: ["assigned_portal"] },
      { permission: "security.events.read", scopes: ["own_children", "assigned_classes", "school"] }
    ] },
    { key: "finance", label: "Finance", capabilities: [
      { permission: "finance.report.read", scopes: ["school"] },
      { permission: "finance.status.read", scopes: ["own_children", "assigned_classes", "school"] },
      { permission: "finance.receipt.read", scopes: ["own", "own_children", "school"] }
    ] },
    { key: "accounting", label: "Comptabilité", capabilities: [
      { permission: "reports.financial.read", scopes: ["school"] },
      { permission: "finance.report.read", scopes: ["school"] }
    ] },
    { key: "inventory", label: "Stock / Inventaire", capabilities: [
      { permission: "reports.operational.read", scopes: ["school"] }
    ] },
    { key: "documents", label: "Documents", capabilities: [
      { permission: "file.download", scopes: ["own"] },
      { permission: "finance.receipt.read", scopes: ["own", "own_children", "school"] },
      { permission: "reports.operational.read", scopes: ["school"] }
    ] },
    { key: "communication", label: "Communication", capabilities: [
      { permission: "communication.message.send", scopes: ["own_children", "assigned_classes", "assigned_subjects", "school"] },
      { permission: "communication.announcement.manage", scopes: ["school"] },
      { permission: "notification.subscribe", scopes: ["own"] }
    ] }
  ];

  function accessEngine() { return global.SchoolSafeAccess || null; }

  function evaluateBase(user) {
    var access = accessEngine();
    if (!access || typeof access.explicitDeny !== "function" || typeof access.canAccess !== "function" || typeof access.scopeFor !== "function" || typeof access.allowsScope !== "function") return { allowed: false, reason: "ACCESS_LAW_INDISPONIBLE", permission: "safe.assistant.use", scope: null };
    if (access.explicitDeny(user || {}, "safe.assistant.use")) return { allowed: false, reason: "SAFE_DENY_EXPLICITE", permission: "safe.assistant.use", scope: null };
    if (!access.canAccess(user || {}, "safe.assistant.use")) return { allowed: false, reason: "SAFE_PERMISSION_ABSENTE", permission: "safe.assistant.use", scope: null };
    var scope = access.scopeFor(user || {}, "safe.assistant.use");
    if (!scope || !access.allowsScope(user || {}, "safe.assistant.use", "own")) return { allowed: false, reason: "SAFE_SCOPE_OWN_REQUIS", permission: "safe.assistant.use", scope: scope && scope.type || null };
    return { allowed: true, reason: "SAFE_AUTORISÉ", permission: "safe.assistant.use", scope: "own" };
  }

  function evaluateDomain(user, domainKey) {
    var base = evaluateBase(user);
    if (!base.allowed) return { allowed: false, domain: domainKey, reason: base.reason, permission: null, scope: null };
    var domain = DOMAINS.find(function (item) { return item.key === domainKey; });
    if (!domain) return { allowed: false, domain: domainKey, reason: "DOMAINE_INCONNU", permission: null, scope: null };
    var access = accessEngine();
    var sawDeny = false;
    var sawPermission = false;
    var incompatible = null;
    for (var i = 0; i < domain.capabilities.length; i += 1) {
      var capability = domain.capabilities[i];
      if (access.explicitDeny(user || {}, capability.permission)) {
        sawDeny = true;
        continue;
      }
      if (!access.canAccess(user || {}, capability.permission)) continue;
      sawPermission = true;
      var scope = access.scopeFor(user || {}, capability.permission);
      if (!scope || capability.scopes.indexOf(scope.type) < 0 || !access.allowsScope(user || {}, capability.permission, scope.type)) {
        incompatible = { permission: capability.permission, scope: scope && scope.type || null };
        continue;
      }
      return { allowed: true, domain: domainKey, reason: "BUSINESS_AUTORISÉ", permission: capability.permission, scope: scope.type };
    }
    if (sawDeny) return { allowed: false, domain: domainKey, reason: "BUSINESS_DENY_EXPLICITE", permission: null, scope: null };
    if (sawPermission || incompatible) return { allowed: false, domain: domainKey, reason: "BUSINESS_SCOPE_INCOMPATIBLE", permission: incompatible && incompatible.permission || null, scope: incompatible && incompatible.scope || null };
    return { allowed: false, domain: domainKey, reason: "BUSINESS_PERMISSION_ABSENTE", permission: null, scope: null };
  }

  function summarize(user) {
    return { base: evaluateBase(user), domains: DOMAINS.map(function (domain) {
      return Object.assign({ label: domain.label }, evaluateDomain(user, domain.key));
    }) };
  }

  global.SchoolSafeJaspeGovernance = { evaluateBase: evaluateBase, evaluateDomain: evaluateDomain, summarize: summarize, domains: DOMAINS.slice() };
})(window);
