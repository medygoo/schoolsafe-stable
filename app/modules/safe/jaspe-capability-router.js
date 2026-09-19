(function (global) {
  "use strict";

  var DOMAIN_RULES = [
    { key: "documents", pattern: /\b(document|documents|pdf|centre de documents|attestation|certificat)\b/ },
    { key: "communication", pattern: /\b(message|messages|annonce|annonces|notification|notifications|convocation|convocations|email|websync|site public|evenement|evenements)\b/ },
    { key: "staff", pattern: /\b(rh|personnel|contrat|contrats|salaire|salaires|paie|prime|primes|avance|avances|retenue|retenues|fiche rh)\b/ },
    { key: "inventory", pattern: /\b(stock|inventaire|article|articles|seuil|rupture|achat|achats|fournisseur|fournisseurs|reception|receptions)\b/ },
    { key: "accounting", pattern: /\b(comptabilite|tresorerie|journal comptable|journal de tresorerie|rapprochement|devise|debit|credit|bilan|grand livre|ecriture|ecritures|depense|depenses|cloture)\b/ },
    { key: "security", pattern: /\b(scan|scanner|portail|recuperation|pickup|sortie|entree|personne autorisee|incident|urgence|securite)\b/ },
    { key: "pedagogy", pattern: /\b(pedagogie|devoir|devoirs|evaluation|evaluations|note|notes|difficulte|difficultes|rattrapage|palmares|matiere|matieres|classement)\b/ },
    { key: "finance", pattern: /\b(finance|financier|financiere|frais|paiement|paiements|recu|recus|solde|impaye|obligation|caisse|rapport financier|statut paid|statut partial|statut pending|statut exempted|statut anomaly)\b/ },
    { key: "school", pattern: /\b(enfant|enfants|eleve|eleves|dossier scolaire|inscription|reinscription)\b/ }
  ];

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function baseRefusal(base, domain) {
    return { matched: true, allowed: false, domain: domain || null, target: null, permission: "safe.assistant.use", scope: base.scope || null, reason: base.reason, message: "Jaspe refuse cette demande : safe.assistant.use avec portée own est obligatoire et tout DENY explicite reste prioritaire.", flow: ["safe+own"] };
  }

  // INC-3 : le « persona » de routage est dérivé des PERMISSIONS réelles,
  // jamais du nom du rôle. (L'autorisation reste évaluée par la politique.)
  function personaFor(user) {
    var access = global.SchoolSafeAccess;
    if (!access || typeof access.canAccess !== "function") return null;
    if (typeof access.allowsScope === "function" && access.allowsScope(user, "security.scan", "assigned_portal")) return "guard";
    if (typeof access.allowsScope === "function"
        && access.allowsScope(user, "school.student.read", "own_children")
        && !access.canAccess(user, "finance.fee.manage")
        && !access.canAccess(user, "roles.manage")) return "parent";
    if (typeof access.allowsScope === "function" && access.allowsScope(user, "pedagogy.assignment.read", "assigned_classes")) return "teacher";
    return null;
  }

  function resolveDomain(query, persona) {
    var text = normalize(query);
    if (persona === "guard" && /\b(evenement|evenements)\b/.test(text)) return { domain: "security", ambiguous: false, matches: ["security"] };
    var matches = DOMAIN_RULES.filter(function (rule) { return rule.pattern.test(text); }).map(function (rule) { return rule.key; });
    if (matches.length > 1 && /\b(et|puis|ainsi que)\b/.test(text)) return { domain: null, ambiguous: true, matches: matches };
    return { domain: matches[0] || null, ambiguous: false, matches: matches };
  }

  function targetFor(domain, persona) {
    if (persona === "parent" && ["school", "pedagogy", "security", "finance"].indexOf(domain) >= 0) return "parent";
    if (domain === "pedagogy" && persona === "teacher") return "teacher";
    if (domain === "security" && persona === "guard") return "security";
    return { documents: "documents", communication: "communication", staff: "staff", inventory: "inventory", accounting: "accounting", finance: "finance", school: "legacy", pedagogy: "legacy", security: "legacy" }[domain] || null;
  }

  function defaultRegistry() {
    return {
      documents: global.SchoolSafeDocumentAssistant,
      communication: global.SchoolSafeCommunication,
      parent: global.SchoolSafeParentPortal,
      teacher: global.SchoolSafeTeacherPedagogy,
      security: global.SchoolSafeGuardSecurity,
      staff: global.SchoolSafeHrDemo,
      inventory: global.SchoolSafeInventoryDemo,
      accounting: global.SchoolSafeAccountingTreasury,
      finance: global.SchoolSafeFinanceModule,
      legacy: { answer: true }
    };
  }

  function moduleAvailable(target, registry) {
    var module = registry && registry[target];
    if (!module) return false;
    if (target === "documents") return typeof module.answer === "function";
    if (target === "legacy") return true;
    return typeof module.answerJaspe === "function";
  }

  function contextAvailable(user, scope) {
    if (scope === "own") return !!(user && (user.userId || user.profileId || (user.profile && user.profile.id)));
    if (scope === "own_children") return !!(user && Array.isArray(user.childIds) && user.childIds.length);
    if (scope === "assigned_classes") return !!(user && Array.isArray(user.assignedClassIds) && user.assignedClassIds.length);
    if (scope === "assigned_subjects") return !!(user && Array.isArray(user.assignedSubjectIds) && user.assignedSubjectIds.length);
    if (scope === "assigned_portal") return !!(user && Array.isArray(user.assignedPortalIds) && user.assignedPortalIds.length);
    if (scope === "school") return !!(user && user.schoolId);
    return false;
  }

  function refusal(domain, target, reason, permission, scope, message) {
    return { matched: true, allowed: false, domain: domain, target: target || null, permission: permission || null, scope: scope || null, reason: reason, message: message || "Jaspe refuse cette demande : permission, portée ou contexte métier incompatible.", flow: ["safe+own", domain].filter(Boolean) };
  }

  function route(query, context, registryOverride) {
    var user = context && context.user ? context.user : {};
    var persona = personaFor(user);
    var policy = global.SchoolSafeJaspeGovernance;
    if (!policy || typeof policy.evaluateBase !== "function" || typeof policy.evaluateDomain !== "function") return refusal(null, null, "POLITIQUE_INDISPONIBLE", null, null, "Jaspe refuse cette demande : politique de gouvernance indisponible.");
    var base = policy.evaluateBase(user);
    if (!base.allowed) return baseRefusal(base, null);
    var text = normalize(query);
    if (/(ajoute|ajouter|retire|retirer|supprime|supprimer|modifie|modifier|change|changer|accorde|accorder|attribue|attribuer|cree|creer).*(role|permission|portee|exception|identite)|(role|permission|portee|exception|identite).*(ajoute|retire|supprime|modifie|change|accorde|attribue|cree)/.test(text)) {
      return refusal("administration", null, "ADMINISTRATION_ACCES_INTERDITE", "roles.manage", "school", "Jaspe ne modifie ni rôle, ni permission, ni portée, ni exception, ni identité.");
    }
    var resolution = resolveDomain(query, persona);
    if (resolution.ambiguous) return refusal(null, null, "DEMANDE_AMBIGUË", null, null, "Jaspe refuse cette demande ambiguë : choisissez un seul domaine métier.");
    if (!resolution.domain) return { matched: false, allowed: true, domain: null, target: null, permission: null, scope: null, reason: "AUCUN_DOMAINE", message: "", flow: ["safe+own"] };
    var domain = policy.evaluateDomain(user, resolution.domain);
    var target = targetFor(resolution.domain, persona);
    if (!domain.allowed) return refusal(resolution.domain, target, domain.reason, domain.permission, domain.scope);
    if (!contextAvailable(user, domain.scope)) return refusal(resolution.domain, target, "BUSINESS_CONTEXTE_MANQUANT", domain.permission, domain.scope, "Jaspe refuse cette demande : le contexte requis par la portée métier est manquant.");
    var registry = registryOverride === undefined ? defaultRegistry() : registryOverride;
    if (!moduleAvailable(target, registry)) return refusal(resolution.domain, target, "MODULE_INDISPONIBLE", domain.permission, domain.scope, "Jaspe refuse cette demande : module métier indisponible.");
    return { matched: true, allowed: true, domain: resolution.domain, target: target, permission: domain.permission, scope: domain.scope, reason: "ROUTE_AUTORISÉE", message: "", flow: ["safe+own", resolution.domain, domain.permission, domain.scope, "context", target] };
  }

  global.SchoolSafeJaspeCapabilityRouter = { route: route, resolveDomain: resolveDomain };
})(window);
