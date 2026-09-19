(function (root) {
  "use strict";

  var REQUIRED_PERMISSION = "school.student.read";
  var PEDAGOGY_PERMISSIONS = ["pedagogy.assignment.read", "pedagogy.grade.read", "pedagogy.report.read", "palmarques.read"];
  var FINANCE_PERMISSIONS = ["finance.status.read", "finance.fee.read", "finance.receipt.read"];
  var SECURITY_PERMISSIONS = ["school.guardian.read", "security.pickup.read", "security.events.read"];

  function isLiveSession(user) {
    return !!(user && (user.native === true || user.token));
  }

  var CHILDREN = [
    {
      id: "demo-parent-child-lucas",
      profile_id: "demo-parent-child-lucas-profile",
      first_name: "Lucas",
      last_name: "Martin",
      matricule: "P-C2-0001",
      class_id: "demo-class-1",
      class_name: "6e A",
      academic_year: "2026-2027",
      lifecycle_status: "active",
      enrollment: { planned_class_id: "demo-class-1", planned_class_name: "6e A", academic_year_label: "2026-2027" },
      primary_parent: { display_name: "Sophie Martin", account_status: "Compte Parent actif" },
      communications: {
        notifications: [{ title: "Réunion de rentrée", detail: "Information de démonstration à consulter", date: "26 août 2026" }],
        convocations: [{ title: "Entretien avec la Direction", detail: "Convocation de démonstration · réponse côté serveur indisponible", date: "2 septembre 2026" }],
        messages: [{ title: "Accueil de l’établissement", detail: "Historique de démonstration non synchronisé", date: "25 août 2026" }]
      },
      pedagogy: {
        assignments: [{ title: "Exercices sur les fractions", subject: "Mathématiques", due: "30 août 2026", state: "À faire" }],
        evaluations: [{ title: "Interrogation de mathématiques", subject: "Mathématiques", grade: "14 / 20", comment: "Aperçu de démonstration" }],
        averages: [{ subject: "Mathématiques", value: "14 / 20" }, { subject: "Français", value: "12 / 20" }],
        overall: "13 / 20",
        bulletin: "Aperçu disponible · document officiel BACKEND_LATER",
        ranking: "7e position · APERÇU DE DÉMONSTRATION · NON OFFICIEL",
        difficulty: "Lecture des consignes longues",
        remediation: "Fiche d’exercices guidés · information de démonstration"
      },
      finance: {
        fees: [
          { label: "Frais de scolarité", amount: "180 000 CDF", state: "PARTIEL" },
          { label: "Transport scolaire", amount: "75 000 CDF", state: "PAYÉ" },
          { label: "Fournitures", amount: "45 000 CDF", state: "EN ATTENTE" },
          { label: "Activité culturelle", amount: "25 000 CDF", state: "EXEMPTÉ" },
          { label: "Régularisation", amount: "À vérifier", state: "ANOMALIE" }
        ],
        payments: [
          { label: "Versement scolarité", amount: "90 000 CDF", date: "20 août 2026" },
          { label: "Transport scolaire", amount: "75 000 CDF", date: "18 août 2026" }
        ],
        receipts: [
          { id: "REC-2026-0586", label: "Versement scolarité", amount: "90 000 CDF" },
          { id: "REC-2026-0584", label: "Transport scolaire", amount: "75 000 CDF" }
        ],
        history: ["Situation familiale consultée", "Reçu REC-2026-0586 enregistré dans l’aperçu", "Échéance de scolarité à consulter"]
      },
      security: {
        people: [
          { name: "Mireille Wa Kalonji", relation: "Tante", status: "AUTORISÉ" },
          { name: "Patrick Kabeya Mbuyi", relation: "Oncle", status: "SUSPENDU" },
          { name: "Jeanne Tshibangu Mbuyi", relation: "Grand-parent", status: "AUTORISÉ" }
        ],
        emergency: { name: "Cécile Ngoie Lukusa", relation: "Voisine de confiance", phone: "+243 820 100 204" },
        entryExit: ["Entrée enregistrée dans l’aperçu · 07 h 28", "Sortie attendue · 16 h 15"],
        pickups: ["Récupération de démonstration · Mireille Wa Kalonji · 25 août 2026"],
        alerts: ["Aucune alerte urgente dans cet aperçu"]
      },
      summary: {
        presence: "Présent",
        safety: "Sortie prévue à 16 h 15",
        homework: "2 devoirs à consulter",
        notification: "1 notification récente",
        convocation: "Aucune convocation urgente",
        finance: "Paiement partiel"
      }
    },
    {
      id: "demo-parent-child-emma",
      profile_id: "demo-parent-child-emma-profile",
      first_name: "Emma",
      last_name: "Martin",
      matricule: "P-C2-0002",
      class_id: "demo-class-2",
      class_name: "Maternelle 3",
      academic_year: "2026-2027",
      lifecycle_status: "active",
      enrollment: { planned_class_id: "demo-class-2", planned_class_name: "Maternelle 3", academic_year_label: "2026-2027" },
      primary_parent: { display_name: "Sophie Martin", account_status: "Compte Parent actif" },
      communications: {
        notifications: [{ title: "Activité pédagogique", detail: "Information de démonstration à consulter", date: "27 août 2026" }],
        convocations: [],
        messages: [{ title: "Accueil maternelle", detail: "Historique de démonstration non synchronisé", date: "24 août 2026" }]
      },
      pedagogy: {
        assignments: [{ title: "Activité de motricité", subject: "Éveil", due: "29 août 2026", state: "À découvrir" }],
        evaluations: [{ title: "Observation langage", subject: "Langage", grade: "Acquis", comment: "Aperçu de démonstration" }],
        averages: [{ subject: "Langage", value: "Acquis" }],
        overall: "Suivi qualitatif",
        bulletin: "Aperçu disponible · document officiel BACKEND_LATER",
        ranking: "Non applicable en maternelle",
        difficulty: "Aucune difficulté signalée dans cet aperçu",
        remediation: "Aucun rattrapage signalé"
      },
      finance: {
        fees: [
          { label: "Frais de scolarité", amount: "120 000 CDF", state: "PAYÉ" },
          { label: "Activité d’éveil", amount: "30 000 CDF", state: "EN ATTENTE" }
        ],
        payments: [{ label: "Frais de scolarité", amount: "120 000 CDF", date: "19 août 2026" }],
        receipts: [{ id: "REC-2026-0585", label: "Frais de scolarité", amount: "120 000 CDF" }],
        history: ["Reçu REC-2026-0585 enregistré dans l’aperçu"]
      },
      security: {
        people: [
          { name: "Sophie Martin", relation: "Mère", status: "AUTORISÉ" },
          { name: "Jeanne Tshibangu Mbuyi", relation: "Grand-parent", status: "AUTORISÉ" }
        ],
        emergency: { name: "Claire Banza", relation: "Tante", phone: "+243 820 100 205" },
        entryExit: ["Entrée enregistrée dans l’aperçu · 07 h 42", "Sortie attendue · 15 h 30"],
        pickups: [],
        alerts: ["Rappel de vérification du contact d’urgence · démonstration"]
      },
      summary: {
        presence: "Présente",
        safety: "Sortie prévue à 15 h 30",
        homework: "1 activité à consulter",
        notification: "Aucune nouvelle notification",
        convocation: "1 convocation à consulter",
        finance: "À jour"
      }
    },
    {
      id: "demo-draft-student",
      profile_id: "demo-draft-student-profile",
      first_name: "Amina",
      last_name: "Mbuyi",
      matricule: "BROUILLON-P-C2-0003",
      class_id: null,
      class_name: "5e A",
      academic_year: "2026-2027",
      lifecycle_status: "draft",
      enrollment: { planned_class_id: "demo-class-4", planned_class_name: "5e A", academic_year_label: "2026-2027" },
      primary_parent: { display_name: "Sophie Martin", account_status: "À préparer" },
      communications: { notifications: [], convocations: [], messages: [] },
      pedagogy: null,
      finance: null,
      security: null,
      summary: null
    },
    {
      id: "demo-unrelated-child-ethan",
      profile_id: "demo-unrelated-child-ethan-profile",
      first_name: "Ethan",
      last_name: "Leroy",
      matricule: "HORS-PERIMETRE",
      class_id: "demo-class-3",
      class_name: "4e B",
      academic_year: "2026-2027",
      lifecycle_status: "active",
      enrollment: { planned_class_id: "demo-class-3", planned_class_name: "4e B", academic_year_label: "2026-2027" },
      primary_parent: { display_name: "Autre famille", account_status: "Hors périmètre" },
      communications: { notifications: [], convocations: [], messages: [] },
      pedagogy: null,
      finance: null,
      security: null,
      summary: null
    }
  ];

  var selectedChildId = null;
  var activeContainerId = null;
  var activeUser = null;

  function escapeMarkup(value) {
    if (root.ssEscapeHtml) return root.ssEscapeHtml(value == null ? "" : String(value));
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function childName(child) {
    return [child.first_name, child.last_name].filter(Boolean).join(" ");
  }

  function explicitDeny(user, permission) {
    if (root.SchoolSafeAccess && typeof root.SchoolSafeAccess.explicitDeny === "function") return root.SchoolSafeAccess.explicitDeny(user || {}, permission);
    if (Array.isArray(user && user.deniedPermissions) && user.deniedPermissions.indexOf(permission) >= 0) return true;
    return Array.isArray(user && user.permissionExceptions) && user.permissionExceptions.some(function (item) {
      return item && item.permission === permission && String(item.effect || "").toLowerCase() === "deny";
    });
  }

  function hasPermission(user, permission) {
    if (explicitDeny(user, permission)) return false;
    return !!(root.SchoolSafeAccess && root.SchoolSafeAccess.canAccess(user || {}, permission));
  }

  function scopeFor(user, permission) {
    var scopes = Array.isArray(user && user.scopes) ? user.scopes : [];
    return scopes.find(function (scope) { return scope.permission === permission; }) ||
      scopes.find(function (scope) { return !scope.permission; }) || null;
  }

  function getLinkedChildren(user) {
    var scope = scopeFor(user, REQUIRED_PERMISSION);
    if (!hasPermission(user, REQUIRED_PERMISSION) || !scope || scope.type !== "own_children") return [];
    var linkedIds = Array.isArray(user && user.childIds) ? user.childIds : [];
    return CHILDREN.filter(function (child) { return linkedIds.indexOf(child.id) >= 0; });
  }

  function getSelectedChild(user) {
    var linked = getLinkedChildren(user);
    if (!linked.length) return null;
    var selected = linked.find(function (child) { return child.id === selectedChildId; });
    return selected || linked[0];
  }

  function openChildDossier(childId, user) {
    var linked = getLinkedChildren(user || {});
    var child = linked.find(function (item) { return item.id === childId; });
    if (!child || !root.SchoolSafeStudentDossier) return false;
    root.SchoolSafeStudentDossier.open(child, user || {});
    return true;
  }

  function scopeAllowsChild(user, permission, child) {
    var scope = scopeFor(user, permission);
    return !!(child && hasPermission(user, permission) && scope && scope.type === "own_children" &&
      Array.isArray(user && user.childIds) && user.childIds.indexOf(child.id) >= 0);
  }

  function someScopeAllowsChild(user, permissions, child) {
    return permissions.some(function (permission) { return scopeAllowsChild(user, permission, child); });
  }

  function canUseJaspe(user) {
    var scope = scopeFor(user, "safe.assistant.use");
    return hasPermission(user, "safe.assistant.use") && !!scope && scope.type === "own";
  }

  function unavailablePanel(title, detail, className) {
    return '<section class="pedagogy-panel parent-readonly-panel ' + (className || "") + '"><h2>' + escapeMarkup(title) +
      '</h2><p class="parent-feature-empty"><strong>' + escapeMarkup(detail) + '</strong></p></section>';
  }

  function communicationsMarkup(child, user) {
    var draft = child.lifecycle_status !== "active";
    var canPrepare = scopeAllowsChild(user, "communication.message.send", child);
    var history = draft ? '<div class="parent-communication-draft"><strong>EN PRÉPARATION</strong><p>Aucun historique officiel : le dossier n’est pas encore opérationnel.</p></div>' :
      '<aside class="parent-communication-denied"><span>' + icon("cloud-off") + '</span><div><strong>Historique non disponible · BACKEND_LATER</strong>' +
      '<p>Aucune permission de lecture des notifications, convocations ou messages n’est définie dans le catalogue actuel. Aucun historique n’est exposé.</p></div></aside>';
    var composer = canPrepare ? '<section class="parent-message-composer"><header><div><p class="parent-eyebrow">Préparation locale uniquement</p><h2>Nouveau message</h2></div><span>BACKEND_LATER</span></header>' +
      '<div class="parent-message-recipient" data-parent-message-recipient><span>Destinataire autorisé</span><strong>Direction de l’établissement</strong><small>Aucun enseignant n’est ajouté implicitement.</small></div>' +
      '<label for="parentMessageDraft">Votre message</label><textarea id="parentMessageDraft" rows="5" placeholder="Rédigez un brouillon pour la Direction"></textarea>' +
      '<button class="ss-button" type="button" data-prepare-parent-message>Préparer le message</button><p class="parent-message-draft-state" role="status">Aucun envoi effectué.</p></section>' :
      '<aside class="parent-communication-denied"><span>' + icon("shield-x") + '</span><div><strong>Préparation de message indisponible</strong><p>La permission et la portée requises ne sont pas accordées, ou un DENY explicite s’applique.</p></div></aside>';
    return '<div class="parent-communications"><header class="parent-feature-header"><div><p class="parent-eyebrow">Communication familiale · own_children</p><h1>' +
      escapeMarkup(childName(child)) + '</h1><p>Lecture limitée aux permissions définies · préparation locale sans envoi.</p></div><span>DÉMO · BACKEND_LATER</span></header>' +
      history + composer + '</div>';
  }

  function openCommunications(childId, user) {
    var linked = getLinkedChildren(user || {});
    var child = linked.find(function (item) { return item.id === childId; });
    if (!child || !root.ssModal) return false;
    var modal = root.ssModal({
      title: "Communications Parent",
      subtitle: "Consultation et préparation locale selon Access_Law",
      size: "full",
      className: "parent-communications-modal",
      content: communicationsMarkup(child, user || {}),
      actions: [{ label: "Fermer", variant: "secondary" }]
    });
    var prepare = modal.content.querySelector("[data-prepare-parent-message]");
    if (prepare) prepare.addEventListener("click", function () {
      var textarea = modal.content.querySelector("#parentMessageDraft");
      var state = modal.content.querySelector(".parent-message-draft-state");
      if (!textarea || !state) return;
      if (!String(textarea.value || "").trim()) {
        state.textContent = "Rédigez un message avant de préparer le brouillon.";
        return;
      }
      state.textContent = "Brouillon local préparé · aucun envoi effectué · BACKEND_LATER";
    });
    if (root.lucide) root.lucide.createIcons();
    return true;
  }

  function pedagogyList(items, renderItem, emptyText) {
    if (!items || !items.length) return '<p class="parent-feature-empty">' + escapeMarkup(emptyText) + '</p>';
    return '<div class="parent-readonly-list">' + items.map(renderItem).join("") + '</div>';
  }

  function pedagogyMarkup(child, user) {
    var assignmentsAllowed = scopeAllowsChild(user, "pedagogy.assignment.read", child);
    var gradesAllowed = scopeAllowsChild(user, "pedagogy.grade.read", child);
    var reportsAllowed = scopeAllowsChild(user, "pedagogy.report.read", child);
    var rankingAllowed = scopeAllowsChild(user, "palmarques.read", child);
    var header = '<header class="parent-feature-header"><div><p class="parent-eyebrow">Suivi pédagogique · own_children</p><h1>' +
      escapeMarkup(childName(child)) + '</h1><p>Consultation seule · composants Pédagogie partagés · aucune écriture.</p></div><span>DÉMO · BACKEND_LATER</span></header>';
    if (!assignmentsAllowed && !gradesAllowed && !reportsAllowed && !rankingAllowed) {
      return '<div class="parent-pedagogy">' + header + '<aside class="parent-pedagogy-denied">' + icon("shield-x") +
        '<div><strong>Suivi pédagogique non autorisé</strong><p>La permission, la portée own_children ou une exception individuelle bloque cette consultation.</p></div></aside></div>';
    }
    if (child.lifecycle_status !== "active" || !child.pedagogy) {
      return '<div class="parent-pedagogy">' + header + '<aside class="parent-pedagogy-draft"><strong>EN PRÉPARATION</strong>' +
        '<p>Aucune donnée pédagogique officielle n’est disponible pour ce dossier non opérationnel.</p></aside></div>';
    }
    var data = child.pedagogy;
    var assignments = assignmentsAllowed ? pedagogyList(data.assignments, function (item) {
      return '<article><div><strong>' + escapeMarkup(item.title) + '</strong><p>' + escapeMarkup(item.subject) + '</p></div><span>' + escapeMarkup(item.state) + '<small>Échéance ' + escapeMarkup(item.due) + '</small></span></article>';
    }, "Aucun devoir visible.") : '<p class="parent-feature-empty"><strong>Devoirs non autorisés</strong></p>';
    var evaluations = gradesAllowed ? pedagogyList(data.evaluations, function (item) {
      return '<article><div><strong>' + escapeMarkup(item.title) + '</strong><p>' + escapeMarkup(item.subject) + ' · ' + escapeMarkup(item.comment) + '</p></div><span class="parent-grade">' + escapeMarkup(item.grade) + '</span></article>';
    }, "Aucune évaluation visible.") : '<p class="parent-feature-empty"><strong>Notes non autorisées</strong></p>';
    var averages = gradesAllowed ? pedagogyList(data.averages, function (item) {
      return '<article><div><strong>' + escapeMarkup(item.subject) + '</strong><p>Moyenne de démonstration</p></div><span class="parent-grade">' + escapeMarkup(item.value) + '</span></article>';
    }, "Aucune moyenne calculable.") : '<p class="parent-feature-empty"><strong>Moyennes non autorisées</strong></p>';
    return '<div class="parent-pedagogy">' + header + '<div class="parent-pedagogy-grid">' +
      '<section class="pedagogy-panel parent-readonly-panel"><h2>Devoirs</h2>' + assignments + '</section>' +
      '<section class="pedagogy-panel parent-readonly-panel"><h2>Évaluations</h2>' + evaluations + '</section>' +
      '<section class="pedagogy-panel parent-readonly-panel"><h2>Moyennes</h2>' + (gradesAllowed ? '<p class="parent-overall">Moyenne générale <strong>' + escapeMarkup(data.overall) + '</strong></p>' : '') + averages + '</section>' +
      (reportsAllowed ? '<section class="pedagogy-panel parent-readonly-panel"><h2>Bulletin</h2><p>' + escapeMarkup(data.bulletin) + '</p><span class="parent-feature-source">FEATURE_LATER / BACKEND_LATER</span></section>' : unavailablePanel("Bulletin", "Rapport pédagogique non autorisé")) +
      (rankingAllowed ? '<section class="pedagogy-panel parent-readonly-panel"><h2>Palmarès</h2><p>' + escapeMarkup(data.ranking) + '</p><span class="parent-feature-source">CALCUL_BACKEND_LATER · enfant lié uniquement</span></section>' : unavailablePanel("Palmarès", "Palmarès non autorisé")) +
      (reportsAllowed ? '<section class="pedagogy-panel parent-readonly-panel"><h2>Difficultés et suivi</h2><p>' + escapeMarkup(data.difficulty) + '</p><span class="parent-feature-source">Aperçu de démonstration</span></section>' : unavailablePanel("Difficultés et suivi", "Rapport pédagogique non autorisé")) +
      (reportsAllowed ? '<section class="pedagogy-panel parent-readonly-panel"><h2>Rattrapage</h2><p>' + escapeMarkup(data.remediation) + '</p><span class="parent-feature-source">Information uniquement</span></section>' : unavailablePanel("Rattrapage", "Rapport pédagogique non autorisé")) +
      '</div><aside class="parent-readonly-boundary">' + icon("eye") + '<p>Consultation seule : aucune cote, moyenne, difficulté ou décision pédagogique ne peut être modifiée ici.</p></aside></div>';
  }

  function openPedagogy(childId, user) {
    var linked = getLinkedChildren(user || {});
    var child = linked.find(function (item) { return item.id === childId; });
    if (!child || !root.ssModal) return false;
    root.ssModal({
      title: "Suivi pédagogique Parent",
      subtitle: "Vue familiale en consultation seule",
      size: "full",
      className: "parent-pedagogy-modal",
      content: pedagogyMarkup(child, user || {}),
      actions: [{ label: "Fermer", variant: "secondary" }]
    });
    if (root.lucide) root.lucide.createIcons();
    return true;
  }

  function palmaresMarkup(child, user) {
    if (!scopeAllowsChild(user, "palmarques.read", child)) return "";
    var header = '<header class="parent-feature-header"><div><p class="parent-eyebrow">Palmarès Parent · own_children</p><h1>' +
      escapeMarkup(childName(child)) + '</h1><p>Lecture limitée à l’enfant lié sélectionné · aucun autre élève détaillé.</p></div><span>APERÇU NON OFFICIEL</span></header>';
    if (child.lifecycle_status !== "active" || !child.pedagogy) {
      return '<div class="parent-palmares">' + header + '<aside class="parent-pedagogy-draft"><strong>EN PRÉPARATION</strong><p>Aucun classement officiel n’est disponible pour ce dossier non opérationnel.</p></aside></div>';
    }
    return '<div class="parent-palmares">' + header + '<div class="parent-pedagogy-grid">' +
      '<section class="pedagogy-panel parent-readonly-panel"><h2>Position de l’enfant</h2><p class="parent-overall">' + escapeMarkup(child.pedagogy.ranking) + '</p><span class="parent-feature-source">Vue classe / école publiée future · enfant lié uniquement</span></section>' +
      '<section class="pedagogy-panel parent-readonly-panel"><h2>Podium et Top 10</h2><p>La publication serveur pourra fournir le contexte du classement. Les données détaillées des autres élèves restent masquées au Parent.</p><span class="parent-feature-source">PUBLICATION_BACKEND_LATER</span></section>' +
      '<section class="pedagogy-panel parent-readonly-panel"><h2>Critères futurs</h2><p>Résultats validés · progression · effort / régularité.</p><span class="parent-feature-source">Aucune formule figée dans le frontend</span></section>' +
      '<section class="pedagogy-panel parent-readonly-panel"><h2>Mentions / distinctions</h2><p>Préparation d’affichage uniquement après calcul et publication officiels.</p><span class="parent-feature-source">BACKEND_LATER</span></section>' +
      '</div><aside class="parent-readonly-boundary">' + icon("calculator") + '<p><strong>CALCUL_BACKEND_LATER</strong> · cet aperçu local n’est pas un résultat officiel et n’exécute aucune formule de classement.</p></aside></div>';
  }

  function openPalmares(childId, user) {
    var linked = getLinkedChildren(user || {});
    var child = linked.find(function (item) { return item.id === childId; });
    if (!child || !scopeAllowsChild(user || {}, "palmarques.read", child) || !root.ssModal) return false;
    root.ssModal({
      title: "Palmarès Parent",
      subtitle: "Lecture filtrée sur own_children",
      size: "full",
      className: "parent-palmares-modal",
      content: palmaresMarkup(child, user || {}),
      actions: [{ label: "Fermer", variant: "secondary" }]
    });
    if (root.lucide) root.lucide.createIcons();
    return true;
  }

  function financeStateClass(state) {
    return {
      "PAYÉ": "success",
      "PARTIEL": "warning",
      "EN ATTENTE": "neutral",
      "EXEMPTÉ": "info",
      "ANOMALIE": "error"
    }[state] || "neutral";
  }

  function financeMarkup(child, user) {
    var statusAllowed = scopeAllowsChild(user, "finance.status.read", child);
    var feesAllowed = scopeAllowsChild(user, "finance.fee.read", child);
    var receiptsAllowed = scopeAllowsChild(user, "finance.receipt.read", child);
    var header = '<header class="parent-feature-header"><div><p class="parent-eyebrow">Finance familiale · own_children</p><h1>' +
      escapeMarkup(childName(child)) + '</h1><p>Consultation des opérations enregistrées par l’école · aucun paiement en ligne.</p></div><span>DÉMO · BACKEND_LATER</span></header>';
    if (!statusAllowed && !feesAllowed && !receiptsAllowed) {
      return '<div class="parent-finance">' + header + '<aside class="parent-finance-denied">' + icon("shield-x") +
        '<div><strong>Situation financière non autorisée</strong><p>La permission, la portée own_children ou un DENY explicite bloque cette consultation.</p></div></aside></div>';
    }
    if (child.lifecycle_status !== "active" || !child.finance) {
      return '<div class="parent-finance">' + header + '<aside class="parent-finance-draft"><strong>EN PRÉPARATION</strong>' +
        '<p>Aucune opération financière officielle n’est disponible pour ce dossier non opérationnel.</p></aside></div>';
    }
    var data = child.finance;
    var fees = feesAllowed ? data.fees.map(function (item) {
      return '<article class="parent-fee-row"><div><strong>' + escapeMarkup(item.label) + '</strong><small>Montant de démonstration</small></div>' +
        '<span>' + escapeMarkup(item.amount) + '</span><b class="parent-finance-state parent-finance-state--' + financeStateClass(item.state) + '">' + escapeMarkup(item.state) + '</b></article>';
    }).join("") : '<p class="parent-feature-empty"><strong>Frais non autorisés</strong></p>';
    var receipts = receiptsAllowed ? data.receipts.map(function (item) {
      return '<li><span>' + icon("receipt-text") + '</span><div><strong>' + escapeMarkup(item.id) + '</strong><small>' + escapeMarkup(item.label) + '</small></div><b>' + escapeMarkup(item.amount) + '</b></li>';
    }).join("") : '<li class="parent-feature-empty"><strong>Reçus non autorisés</strong></li>';
    return '<div class="parent-finance">' + header +
      (statusAllowed ? '<section class="parent-finance-panel"><h2>Statut financier</h2><p>' + escapeMarkup(child.summary.finance) + '</p></section>' : unavailablePanel("Statut financier", "Statut financier non autorisé")) +
      '<section class="parent-finance-panel"><h2>Situation des frais</h2><div class="parent-fee-list">' + fees + '</div></section>' +
      '<div class="parent-finance-columns">' +
        '<section class="parent-finance-panel"><h2>Paiements enregistrés</h2><p class="parent-feature-empty"><strong>Paiements non disponibles · BACKEND_LATER</strong></p></section>' +
        '<section class="parent-finance-panel"><h2>Reçus</h2><ul>' + receipts + '</ul></section>' +
        '<section class="parent-finance-panel"><h2>Historique</h2><p class="parent-feature-empty"><strong>Historique non disponible · BACKEND_LATER</strong></p></section>' +
      '</div><aside class="parent-finance-boundary">' + icon("landmark") + '<div><strong>Consultation uniquement</strong><p>Aucun paiement en ligne, aucune création, modification ou annulation de caisse. Les données officielles viendront du backend.</p></div></aside></div>';
  }

  function openFinance(childId, user) {
    var linked = getLinkedChildren(user || {});
    var child = linked.find(function (item) { return item.id === childId; });
    if (!child || !root.ssModal) return false;
    root.ssModal({
      title: "Finance Parent",
      subtitle: "Situation familiale en consultation seule",
      size: "full",
      className: "parent-finance-modal",
      content: financeMarkup(child, user || {}),
      actions: [{ label: "Fermer", variant: "secondary" }]
    });
    if (root.lucide) root.lucide.createIcons();
    return true;
  }

  function securityList(title, items, iconName) {
    var rows = items.length ? items.map(function (item) {
      return '<li><span>' + icon(iconName) + '</span><p>' + escapeMarkup(item) + '</p></li>';
    }).join("") : '<li class="parent-feature-empty">Aucun élément dans cet aperçu.</li>';
    return '<section class="parent-security-panel"><h2>' + escapeMarkup(title) + '</h2><ul>' + rows + '</ul></section>';
  }

  function securityMarkup(child, user) {
    var guardianAllowed = scopeAllowsChild(user, "school.guardian.read", child);
    var pickupAllowed = scopeAllowsChild(user, "security.pickup.read", child);
    var eventsAllowed = scopeAllowsChild(user, "security.events.read", child);
    var header = '<header class="parent-feature-header"><div><p class="parent-eyebrow">Sécurité familiale · cadre B4 réutilisé</p><h1>' +
      escapeMarkup(childName(child)) + '</h1><p>Consultation Parent limitée à own_children · aucun contrôle de sortie.</p></div><span>DÉMO · BACKEND_LATER</span></header>';
    if (child.lifecycle_status !== "active" || !child.security) {
      return '<div class="parent-security-family">' + header + '<aside class="parent-security-draft"><strong>EN PRÉPARATION</strong>' +
        '<p>Aucun événement de sécurité officiel n’est disponible pour ce dossier non opérationnel.</p></aside></div>';
    }
    var data = child.security;
    var people = pickupAllowed ? '<section class="parent-security-panel"><h2>Personnes autorisées</h2><div class="parent-security-person-list">' + data.people.map(function (person) {
      return '<article><span class="parent-person-avatar">' + escapeMarkup(person.name.split(/\s+/).slice(0, 2).map(function (part) { return part.charAt(0); }).join("")) + '</span>' +
        '<div><strong>' + escapeMarkup(person.name) + '</strong><small>' + escapeMarkup(person.relation) + '</small></div><b class="parent-person-state parent-person-state--' + (person.status === "AUTORISÉ" ? "active" : "suspended") + '">' + escapeMarkup(person.status) + '</b></article>';
    }).join("") + '</div></section>' :
      '<aside class="parent-security-people-denied">' + icon("shield-x") + '<div><strong>Récupérations non autorisées</strong><p>La permission security.pickup.read ou sa portée est refusée.</p></div></aside>';
    var emergency = guardianAllowed ? '<section class="parent-security-panel"><h2>Contact d’urgence</h2><article class="parent-emergency-contact">' + icon("phone-call") +
      '<div><strong>' + escapeMarkup(data.emergency.name) + '</strong><small>' + escapeMarkup(data.emergency.relation) + ' · ' + escapeMarkup(data.emergency.phone) + '</small></div></article></section>' :
      '<aside class="parent-security-people-denied">' + icon("shield-x") + '<div><strong>Contact d’urgence non visible</strong><p>La permission school.guardian.read ou sa portée est refusée.</p></div></aside>';
    var events = eventsAllowed ? '<div class="parent-security-events">' +
      securityList("Entrées et sorties", data.entryExit, "log-in") +
      securityList("Alertes de sécurité", data.alerts, "shield-alert") + '</div>' :
      '<aside class="parent-security-events-denied">' + icon("shield-x") + '<div><strong>Événements de sécurité non autorisés</strong><p>La permission security.events.read est absente ou explicitement refusée.</p></div></aside>';
    var pickups = pickupAllowed ? securityList("Historique des récupérations", data.pickups, "contact-round") : '';
    return '<div class="parent-security-family">' + header + '<div class="parent-security-people">' + people + emergency + '</div>' + events + pickups + '<aside class="parent-security-boundary">' + icon("eye") +
      '<div><strong>Consultation uniquement</strong><p>Le Parent ne peut ni scanner, autoriser une sortie, valider une remise, suspendre une personne ou agir comme Gardien.</p></div></aside></div>';
  }

  function openSecurity(childId, user) {
    var linked = getLinkedChildren(user || {});
    var child = linked.find(function (item) { return item.id === childId; });
    if (!child || !root.ssModal) return false;
    root.ssModal({
      title: "Sécurité familiale",
      subtitle: "Consultation Parent · cadre B4",
      size: "full",
      className: "parent-security-modal",
      content: securityMarkup(child, user || {}),
      actions: [{ label: "Fermer", variant: "secondary" }]
    });
    if (root.lucide) root.lucide.createIcons();
    return true;
  }

  function openCanteen(childId, user) {
    var linked = getLinkedChildren(user || {});
    var child = linked.find(function (item) { return item.id === childId; });
    if (!child || !root.ssModal) return false;
    root.ssModal({
      title: "Cantine Parent",
      subtitle: "Limite fonctionnelle explicite",
      className: "parent-canteen-modal",
      content: '<div class="parent-canteen"><header><p class="parent-eyebrow">' + escapeMarkup(childName(child)) + ' · own_children</p><h1>Cantine</h1><span>FEATURE_LATER</span></header>' +
        '<div>' + icon("utensils") + '<h2>Fonctionnalité non disponible</h2><p>Aucun repas, consommation, paiement ou solde n’est inventé dans cette prévisualisation.</p><small>BACKEND_LATER · aucune donnée officielle</small></div></div>',
      actions: [{ label: "Fermer", variant: "secondary" }]
    });
    if (root.lucide) root.lucide.createIcons();
    return true;
  }

  function normalized(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function jaspeRefusal(reason) {
    return { message: "REFUS — " + reason + " Jaspe ne peut pas dépasser les permissions et la portée du Parent.", refusal: true };
  }

  function answerJaspe(query, context) {
    var user = context && context.user ? context.user : activeUser;
    // INC-3 : la permission own_children réelle décide, jamais le nom du rôle.
    var isParentUser = !!(user && root.SchoolSafeAccess && typeof root.SchoolSafeAccess.allowsScope === "function"
      && root.SchoolSafeAccess.allowsScope(user, "school.student.read", "own_children"));
    if (!user || !isParentUser) return null;
    if (!canUseJaspe(user)) return jaspeRefusal("l’utilisation de Jaspe n’est pas autorisée pour cette session.");
    var child = getSelectedChild(user);
    if (!child) return jaspeRefusal("aucun enfant lié n’est accessible.");
    var text = normalized(query);
    if (!text) return { message: "Posez une question sur les informations visibles de l’enfant sélectionné." };

    var asksOtherChild = /autre enfant|tous les enfants|n'importe quel enfant|hors perimetre/.test(text) || CHILDREN.some(function (item) {
      if (item.id === child.id) return false;
      var full = normalized(childName(item));
      return (full && text.indexOf(full) >= 0) || text.indexOf(normalized(item.first_name)) >= 0;
    });
    if (asksOtherChild) return jaspeRefusal("la demande concerne un autre enfant que celui sélectionné.");

    var mutation = /(modifi|change|ajout|supprim|publ|valid|autor|annul|enregistr|ignore|contourn|retir)/.test(text);
    var protectedArea = /(cote|note|moyenne|paiement|recu|sortie|remise|permission|deny|droit|classe|dossier)/.test(text);
    if (mutation && protectedArea) return jaspeRefusal("cette action modifierait une donnée scolaire, financière, de sécurité ou d’autorisation.");

    if (/prepare|redige|brouillon/.test(text) && /message|direction/.test(text)) {
      if (!scopeAllowsChild(user, "communication.message.send", child)) {
        return jaspeRefusal("la préparation de message n’est pas autorisée.");
      }
      return { message: "Je peux ouvrir un brouillon local vers la Direction pour " + childName(child) + ". Aucun envoi ne sera effectué · BACKEND_LATER.", action: "communications" };
    }

    if (/devoir/.test(text)) {
      if (!scopeAllowsChild(user, "pedagogy.assignment.read", child)) return jaspeRefusal("les devoirs ne sont pas visibles.");
      if (!child.pedagogy) return { message: childName(child) + " est EN PRÉPARATION : aucune donnée pédagogique officielle n’est disponible." };
      return { message: childName(child) + " · " + child.pedagogy.assignments.length + " devoir(s) visible(s) · consultation seule." };
    }
    if (/evaluation|cote|note|moyenne/.test(text)) {
      if (!scopeAllowsChild(user, "pedagogy.grade.read", child)) return jaspeRefusal("les notes ne sont pas visibles.");
      if (!child.pedagogy) return { message: childName(child) + " est EN PRÉPARATION : aucune donnée pédagogique officielle n’est disponible." };
      return { message: childName(child) + " · moyenne générale " + child.pedagogy.overall + " · consultation seule." };
    }
    if (/bulletin|rattrapage|difficulte/.test(text)) {
      if (!scopeAllowsChild(user, "pedagogy.report.read", child)) return jaspeRefusal("le rapport pédagogique n’est pas visible.");
      if (!child.pedagogy) return { message: childName(child) + " est EN PRÉPARATION : aucune donnée pédagogique officielle n’est disponible." };
      return { message: childName(child) + " · " + child.pedagogy.bulletin + " · consultation seule." };
    }
    if (/palmares|classement/.test(text)) {
      if (!scopeAllowsChild(user, "palmarques.read", child)) return jaspeRefusal("le palmarès n’est pas visible.");
      if (!child.pedagogy) return { message: childName(child) + " est EN PRÉPARATION : aucune donnée pédagogique officielle n’est disponible." };
      return { message: childName(child) + " · " + child.pedagogy.ranking + " · consultation seule · CALCUL_BACKEND_LATER." };
    }

    if (/recu/.test(text)) {
      if (!scopeAllowsChild(user, "finance.receipt.read", child)) return jaspeRefusal("les reçus ne sont pas visibles.");
      if (!child.finance) return { message: childName(child) + " est EN PRÉPARATION : aucune opération financière officielle n’est disponible." };
      return { message: childName(child) + " · " + child.finance.receipts.length + " reçu(s) visible(s) · aucun paiement en ligne." };
    }
    if (/frais/.test(text)) {
      if (!scopeAllowsChild(user, "finance.fee.read", child)) return jaspeRefusal("les frais ne sont pas visibles.");
      if (!child.finance) return { message: childName(child) + " est EN PRÉPARATION : aucune opération financière officielle n’est disponible." };
      return { message: childName(child) + " · " + child.finance.fees.length + " frais visible(s) · aucun paiement en ligne." };
    }
    if (/finance|paiement|solde/.test(text)) {
      if (!scopeAllowsChild(user, "finance.status.read", child)) return jaspeRefusal("le statut financier n’est pas visible.");
      if (!child.finance) return { message: childName(child) + " est EN PRÉPARATION : aucune opération financière officielle n’est disponible." };
      return { message: childName(child) + " · statut " + child.summary.finance + " · aucun paiement en ligne." };
    }

    if (/recuperation|personne autorisee/.test(text)) {
      if (!scopeAllowsChild(user, "security.pickup.read", child)) return jaspeRefusal("les autorisations de récupération ne sont pas visibles.");
      if (!child.security) return { message: childName(child) + " est EN PRÉPARATION : aucun événement de sécurité officiel n’est disponible." };
      return { message: childName(child) + " · " + child.security.people.length + " personne(s) de récupération visible(s) · consultation seule." };
    }
    if (/securite|entree|sortie|alerte/.test(text)) {
      if (!scopeAllowsChild(user, "security.events.read", child)) return jaspeRefusal("les événements de sécurité ne sont pas visibles.");
      if (!child.security) return { message: childName(child) + " est EN PRÉPARATION : aucun événement de sécurité officiel n’est disponible." };
      return { message: childName(child) + " · " + child.security.entryExit.join(" · ") + " · consultation seule, aucune autorisation de sortie." };
    }

    var summary = childName(child) + " · " + child.class_name + " · " + child.academic_year + " · " + (child.lifecycle_status === "active" ? "dossier actif" : "EN PRÉPARATION");
    if (child.lifecycle_status === "active" && scopeAllowsChild(user, "pedagogy.grade.read", child) && child.pedagogy) summary += " · moyenne " + child.pedagogy.overall;
    if (child.lifecycle_status === "active" && scopeAllowsChild(user, "finance.status.read", child) && child.summary) summary += " · statut financier " + child.summary.finance;
    if (child.lifecycle_status === "active" && scopeAllowsChild(user, "finance.receipt.read", child) && child.finance) summary += " · " + child.finance.receipts.length + " reçu(s) visible(s)";
    return { message: summary + ". Je résume uniquement les informations autorisées de l’enfant sélectionné." };
  }

  function jaspeMarkup(child) {
    return '<section class="parent-jaspe-card" aria-labelledby="parentJaspeTitle"><button class="parent-jaspe-launcher" type="button" data-open-jaspe="parent" aria-label="Ouvrir Jaspe"><span aria-hidden="true">J2D</span><small>Ouvrir Jaspe</small></button>' +
      '<div class="parent-jaspe-content"><p class="parent-eyebrow">Jaspe Parent · périmètre contrôlé</p><h2 id="parentJaspeTitle">Comment puis-je vous aider pour ' + escapeMarkup(child.first_name) + ' ?</h2>' +
      '<p>Je peux résumer, expliquer et préparer un message autorisé. Je ne peux modifier aucune donnée.</p><div class="parent-jaspe-suggestions">' +
      '<button type="button" data-parent-jaspe-query="Résume la situation de mon enfant">Résumer la situation</button>' +
      '<button type="button" data-parent-jaspe-query="Quels devoirs sont visibles ?">Voir les devoirs visibles</button>' +
      '<button type="button" data-parent-jaspe-query="Prépare un message à la Direction">Préparer un message à la Direction</button></div>' +
      '<div class="parent-jaspe-input"><input id="parentJaspeInput" type="text" aria-label="Question à Jaspe sur l’enfant sélectionné" placeholder="Posez une question sur l’enfant sélectionné"><button type="button" data-parent-jaspe-send aria-label="Interroger Jaspe">' + icon("send") + '</button></div>' +
      '<p class="parent-jaspe-response" role="status">Jaspe respecte toujours permission, portée et DENY explicite.</p></div></section>';
  }

  function icon(name) {
    return '<i data-lucide="' + name + '" aria-hidden="true"></i>';
  }

  function summaryCard(label, value, iconName, state) {
    return '<article class="parent-summary-card parent-summary-card--' + state + '">' +
      '<span class="parent-summary-icon">' + icon(iconName) + '</span>' +
      '<div><small>' + escapeMarkup(label) + '</small><strong>' + escapeMarkup(value) + '</strong></div>' +
      '<span class="parent-summary-source">DÉMO · BACKEND_LATER</span>' +
    '</article>';
  }

  function renderSummary(child, user) {
    if (child.lifecycle_status === "draft") {
      return [
        ["Présence du jour", "Indisponible · dossier EN PRÉPARATION", "calendar-clock"],
        ["Sécurité", "Indisponible · dossier EN PRÉPARATION", "shield"],
        ["Devoirs", "Indisponible · dossier EN PRÉPARATION", "notebook-pen"],
        ["Notification", "Indisponible · dossier EN PRÉPARATION", "bell"],
        ["Convocations", "Indisponible · dossier EN PRÉPARATION", "mail-warning"],
        ["Situation financière", "Indisponible · dossier EN PRÉPARATION", "receipt-text"]
      ].map(function (item) { return summaryCard(item[0], item[1], item[2], "unavailable"); }).join("");
    }
    return [
      ["Présence du jour", scopeAllowsChild(user, "school.student.read", child) ? child.summary.presence : "Indisponible", "calendar-check-2", "success"],
      ["Sécurité", scopeAllowsChild(user, "security.events.read", child) ? child.summary.safety : "Indisponible · accès non autorisé", "shield-check", "info"],
      ["Devoirs", scopeAllowsChild(user, "pedagogy.assignment.read", child) ? child.summary.homework : "Indisponible · accès non autorisé", "notebook-pen", "info"],
      ["Notification", "Indisponible · permission de lecture non définie", "bell", "unavailable"],
      ["Convocations", "Indisponible · permission de lecture non définie", "mail-check", "unavailable"],
      ["Situation financière", scopeAllowsChild(user, "finance.status.read", child) ? child.summary.finance : "Indisponible · accès non autorisé", "receipt-text", "warning"]
    ].map(function (item) { return summaryCard(item[0], item[1], item[2], item[3]); }).join("");
  }

  function renderShortcuts(user, child) {
    return [
      ["Dossier", "folder-user", scopeAllowsChild(user, "school.student.read", child)],
      ["Pédagogie", "book-open-check", someScopeAllowsChild(user, PEDAGOGY_PERMISSIONS, child)],
      ["Palmarès", "trophy", scopeAllowsChild(user, "palmarques.read", child)],
      ["Communications", "messages-square", scopeAllowsChild(user, "communication.message.send", child)],
      ["Finance", "receipt-text", someScopeAllowsChild(user, FINANCE_PERMISSIONS, child)],
      ["Sécurité", "shield-check", someScopeAllowsChild(user, SECURITY_PERMISSIONS, child)],
      ["Cantine", "utensils", scopeAllowsChild(user, "school.student.read", child)]
    ].filter(function (item) { return item[2]; }).map(function (item) {
      return '<button class="parent-shortcut" type="button" data-parent-shortcut="' + escapeMarkup(item[0].toLowerCase()) + '">' +
        icon(item[1]) + '<span>' + escapeMarkup(item[0]) + '</span><small>Consulter</small>' + icon("chevron-right") +
      '</button>';
    }).join("");
  }

  function renderDenied(container) {
    container.innerHTML = '<section class="parent-portal-denied" role="alert">' +
      '<span>' + icon("shield-x") + '</span><div><p class="parent-eyebrow">Périmètre protégé</p>' +
      '<h1>Accès refusé</h1><p>La permission de consulter les enfants liés avec la portée <code>own_children</code> est absente ou explicitement refusée.</p></div>' +
    '</section>';
  }

  function renderUnavailable(container) {
    container.innerHTML = '<section class="parent-portal-unavailable" role="status">' +
      '<span>' + icon("cloud-off") + '</span><div><p class="parent-eyebrow">Projection familiale indisponible</p>' +
      '<h1>Enfants liés non chargés</h1><p>La session est autorisée, mais la projection des identifiants <code>own_children</code> n’est pas fournie. Aucune donnée n’est affichée · BACKEND_LATER.</p></div>' +
    '</section>';
  }

  function renderLiveUnavailable(container) {
    container.innerHTML = '<section class="parent-portal-unavailable" role="status">' +
      '<span>' + icon("cloud-off") + '</span><div><p class="parent-eyebrow">Session live</p>' +
      '<h1>DONNÉES INDISPONIBLES</h1><p>La projection réelle <code>own_children</code> n’est pas connectée. Aucun enfant, message, montant ou événement de démonstration n’est affiché · BACKEND_LATER.</p></div>' +
    '</section>';
  }

  function renderEmpty(container) {
    container.innerHTML = '<section class="parent-portal-empty" role="status">' +
      '<span>' + icon("users-round") + '</span><div><p class="parent-eyebrow">Périmètre familial</p>' +
      '<h1>Aucun enfant rattaché</h1><p>La session est autorisée et la projection <code>own_children</code> est vide. Aucune donnée d’un autre enfant n’est affichée.</p></div>' +
    '</section>';
  }

  function clear() {
    activeUser = null;
    activeContainerId = null;
    selectedChildId = null;
  }

  function render(containerId, user) {
    var container = document.getElementById(containerId);
    if (!container) return;
    activeContainerId = containerId;
    activeUser = user || {};
    var requiredScope = scopeFor(activeUser, REQUIRED_PERMISSION);
    var baseAccessAllowed = hasPermission(activeUser, REQUIRED_PERMISSION) && requiredScope && requiredScope.type === "own_children";
    if (!baseAccessAllowed) {
      selectedChildId = null;
      renderDenied(container);
      if (root.lucide) root.lucide.createIcons();
      return;
    }
    if (isLiveSession(activeUser)) {
      selectedChildId = null;
      renderLiveUnavailable(container);
      if (root.lucide) root.lucide.createIcons();
      return;
    }
    if (!Array.isArray(activeUser.childIds)) {
      selectedChildId = null;
      renderUnavailable(container);
      if (root.lucide) root.lucide.createIcons();
      return;
    }
    if (!activeUser.childIds.length) {
      selectedChildId = null;
      renderEmpty(container);
      if (root.lucide) root.lucide.createIcons();
      return;
    }
    var linked = getLinkedChildren(activeUser);
    if (!linked.length) {
      selectedChildId = null;
      renderUnavailable(container);
      if (root.lucide) root.lucide.createIcons();
      return;
    }

    var child = getSelectedChild(activeUser);
    selectedChildId = child.id;
    var isDraft = child.lifecycle_status === "draft";
    var options = linked.map(function (item) {
      var suffix = item.lifecycle_status === "draft" ? " · EN PRÉPARATION" : "";
      return '<option value="' + escapeMarkup(item.id) + '"' + (item.id === child.id ? " selected" : "") + '>' +
        escapeMarkup(childName(item) + suffix) + '</option>';
    }).join("");

    container.innerHTML = '<div class="parent-dashboard">' +
      '<header class="parent-dashboard-header"><div><p class="parent-eyebrow">Espace Parent · démonstration locale</p>' +
      '<h1>Mes enfants</h1><p>Consultez uniquement les informations autorisées de vos enfants liés.</p></div>' +
      '<label class="parent-child-picker" for="parentChildSelect"><span>Enfant sélectionné</span><select id="parentChildSelect">' + options + '</select></label></header>' +
      '<section class="parent-child-identity" data-parent-selected-child="' + escapeMarkup(child.id) + '">' +
        '<span class="parent-child-avatar" aria-hidden="true">' + escapeMarkup(child.first_name.charAt(0) + child.last_name.charAt(0)) + '</span>' +
        '<div><p class="parent-eyebrow">Enfant lié · portée own_children</p><h2>' + escapeMarkup(childName(child)) + '</h2>' +
        '<p>' + escapeMarkup(child.class_name) + ' · Année scolaire ' + escapeMarkup(child.academic_year) + '</p></div>' +
        '<span class="parent-status parent-status--' + (isDraft ? "draft" : "active") + '">' + (isDraft ? "EN PRÉPARATION" : "DOSSIER ACTIF") + '</span>' +
      '</section>' +
      (isDraft ? '<aside class="parent-draft-boundary">' + icon("cloud-off") + '<div><strong>Dossier local en préparation</strong><p>Aucune opération scolaire officielle ne peut être affichée ou préparée pour cet enfant.</p></div></aside>' : '') +
      '<section aria-labelledby="parentSummaryTitle"><div class="parent-section-heading"><div><p class="parent-eyebrow">Aujourd’hui</p><h2 id="parentSummaryTitle">Vue d’ensemble autorisée</h2></div><span>DÉMONSTRATION · BACKEND_LATER</span></div>' +
      '<div class="parent-dashboard-summary">' + renderSummary(child, activeUser) + '</div></section>' +
      '<section aria-labelledby="parentShortcutsTitle"><div class="parent-section-heading"><div><p class="parent-eyebrow">Navigation familiale</p><h2 id="parentShortcutsTitle">Accès rapides</h2></div></div>' +
      '<div class="parent-shortcuts">' + renderShortcuts(activeUser, child) + '</div></section>' + (canUseJaspe(activeUser) ? jaspeMarkup(child) : '') +
    '</div>';

    var selector = container.querySelector("#parentChildSelect");
    if (selector) selector.addEventListener("change", function () {
      selectedChildId = selector.value;
      render(activeContainerId, activeUser);
    });
    container.querySelectorAll("[data-parent-shortcut]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.getAttribute("data-parent-shortcut") === "dossier") {
          openChildDossier(selectedChildId, activeUser);
          return;
        }
        if (button.getAttribute("data-parent-shortcut") === "communications") {
          openCommunications(selectedChildId, activeUser);
          return;
        }
        if (button.getAttribute("data-parent-shortcut") === "pédagogie") {
          openPedagogy(selectedChildId, activeUser);
          return;
        }
        if (button.getAttribute("data-parent-shortcut") === "palmarès") {
          openPalmares(selectedChildId, activeUser);
          return;
        }
        if (button.getAttribute("data-parent-shortcut") === "finance") {
          openFinance(selectedChildId, activeUser);
          return;
        }
        if (button.getAttribute("data-parent-shortcut") === "sécurité") {
          openSecurity(selectedChildId, activeUser);
          return;
        }
        if (button.getAttribute("data-parent-shortcut") === "cantine") {
          openCanteen(selectedChildId, activeUser);
          return;
        }
        var label = button.querySelector("span");
        if (typeof root.schoolSafeNotify === "function") {
          root.schoolSafeNotify((label ? label.textContent : "Fonction") + " — disponible dans les prochains lots Parent.");
        }
      });
    });
    function handleJaspeQuery(query) {
      var answer = answerJaspe(query);
      var response = container.querySelector(".parent-jaspe-response");
      if (response && answer) response.textContent = answer.message;
      if (answer && answer.action === "communications") openCommunications(selectedChildId, activeUser);
    }
    container.querySelectorAll("[data-parent-jaspe-query]").forEach(function (button) {
      button.addEventListener("click", function () { handleJaspeQuery(button.getAttribute("data-parent-jaspe-query") || ""); });
    });
    var jaspeInput = container.querySelector("#parentJaspeInput");
    var jaspeSend = container.querySelector("[data-parent-jaspe-send]");
    if (jaspeSend) jaspeSend.addEventListener("click", function () { handleJaspeQuery(jaspeInput && jaspeInput.value); });
    if (jaspeInput) jaspeInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") handleJaspeQuery(jaspeInput.value);
    });
    if (root.lucide) root.lucide.createIcons();
  }

  root.SchoolSafeParentPortal = {
    CHILDREN: CHILDREN,
    getLinkedChildren: getLinkedChildren,
    getSelectedChild: getSelectedChild,
    openChildDossier: openChildDossier,
    openCommunications: openCommunications,
    openPedagogy: openPedagogy,
    openPalmares: openPalmares,
    openFinance: openFinance,
    openSecurity: openSecurity,
    openCanteen: openCanteen,
    answerJaspe: answerJaspe,
    clear: clear,
    render: render
  };
}(window));
