(function (root) {
  "use strict";

  var activeModal = null;
  var activeStudent = null;
  var activeUser = null;
  var activeSection = "identity";

  var SECTIONS = [
    { id: "identity", label: "Identité", icon: "contact", permission: "school.student.read", state: "Disponible" },
    { id: "family", label: "Famille", icon: "users-round", permission: "school.guardian.read", state: "B2–B4" },
    { id: "schooling", label: "Scolarité", icon: "graduation-cap", permission: "school.student.read", state: "B5–B6" },
    { id: "attendance", label: "Présence", icon: "calendar-check", permission: "school.student.read", state: "Aperçu" },
    { id: "security", label: "Sécurité", icon: "shield-check", permission: "security.events.read", state: "Aperçu" },
    { id: "pedagogy", label: "Pédagogie", icon: "book-open-check", permission: "pedagogy.grade.read", state: "Aperçu" },
    { id: "finance", label: "Finance", icon: "wallet-cards", permission: "finance.status.read", state: "Aperçu" },
    { id: "canteen", label: "Cantine", icon: "utensils", permission: "canteen.manage", state: "Aperçu" },
    { id: "remediation", label: "Rattrapage", icon: "life-buoy", permission: "pedagogy.grade.read", state: "Aperçu" },
    { id: "documents", label: "Documents", icon: "files", permission: "school.student.read", state: "Aperçu" },
    { id: "communications", label: "Communications", icon: "messages-square", permission: "communication.message.send", state: "Aperçu" },
    { id: "history", label: "Historique", icon: "history", permission: "school.student.read", state: "Disponible" }
  ];

  function escapeMarkup(value) {
    if (root.ssEscapeHtml) return root.ssEscapeHtml(value == null ? "" : String(value));
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function studentName(student) { return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" "); }

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
    return scopes.find(function (scope) { return scope.permission === permission; }) || scopes.find(function (scope) { return !scope.permission; }) || null;
  }

  function scopeAllows(user, permission, student) {
    var scope = scopeFor(user, permission);
    if (!scope) return false;
    if (scope.type === "school") return true;
    if (scope.type === "own") return user && user.profile && user.profile.id === student.profile_id;
    if (scope.type === "own_children") return Array.isArray(user.childIds) && user.childIds.indexOf(student.id) >= 0;
    if (scope.type === "assigned_classes") return student.lifecycle_status === "active" && Array.isArray(user.assignedClassIds) && user.assignedClassIds.indexOf(student.class_id) >= 0;
    if (scope.type === "assigned_subjects") return student.lifecycle_status === "active" && Array.isArray(user.assignedStudentIds) && user.assignedStudentIds.indexOf(student.id) >= 0;
    return false;
  }

  function visibleSections(student, user) {
    if (!student) return [];
    return SECTIONS.filter(function (section) {
      return hasPermission(user, section.permission) && scopeAllows(user, section.permission, student);
    }).map(function (section) { return Object.assign({}, section); });
  }

  function classAndYear(student) {
    var enrollment = student.enrollment || {};
    var structure = root.SchoolSafeAcademicStructure;
    var matchedClass = structure && structure.getClasses().find(function (item) { return item.id === (student.class_id || enrollment.planned_class_id); });
    return {
      className: enrollment.planned_class_name || (matchedClass && matchedClass.name) || "Classe à confirmer",
      year: enrollment.academic_year_label || (matchedClass && matchedClass.year) || (structure && structure.getActiveYear() && structure.getActiveYear().label) || "Année à confirmer"
    };
  }

  function hero() {
    var facts = classAndYear(activeStudent);
    var parent = activeStudent.primary_parent || {};
    var name = studentName(activeStudent);
    var initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) { return part.charAt(0); }).join("");
    var draft = activeStudent.lifecycle_status !== "active";
    var cardAction = root.SchoolSafeStudentCardPreparation && (root.SchoolSafeStudentCardPreparation.canView(activeStudent, activeUser) || root.SchoolSafeStudentCardPreparation.canPrepare(activeStudent, activeUser)) ? '<button class="student-dossier-card-action" type="button" data-open-student-card><i data-lucide="badge-check"></i> Carte élève</button>' : '';
    return '<header class="student-dossier-hero"><div class="student-dossier-photo">' + escapeMarkup(initials) + '</div><div class="student-dossier-identity"><span>Dossier élève central</span><h2>' + escapeMarkup(name) + '</h2><div class="student-dossier-tags"><b>' + escapeMarkup(activeStudent.matricule) + '</b>' + root.ssBadge({ label: draft ? "EN PRÉPARATION" : "ACTIF", variant: draft ? "warning" : "success" }) + cardAction + '</div></div><dl><div><dt>Classe</dt><dd>' + escapeMarkup(facts.className) + '</dd></div><div><dt>Année</dt><dd>' + escapeMarkup(facts.year) + '</dd></div><div><dt>Parent principal</dt><dd>' + escapeMarkup(parent.display_name || "Non renseigné") + '</dd></div></dl></header>';
  }

  function draftWarning() {
    if (activeStudent.lifecycle_status === "active") return "";
    return '<aside class="student-dossier-lock"><i data-lucide="lock-keyhole"></i><div><b>DOSSIER NON OPÉRATIONNEL</b><p>EN PRÉPARATION · récupération, carte officielle et opérations scolaires officielles restent bloquées.</p></div></aside>';
  }

  function identityPanel() {
    var facts = classAndYear(activeStudent);
    return '<section class="student-dossier-panel"><header><span>Donnée source</span><h3>Identité</h3></header><dl class="student-dossier-facts"><div><dt>Nom complet</dt><dd>' + escapeMarkup(studentName(activeStudent)) + '</dd></div><div><dt>Matricule</dt><dd>' + escapeMarkup(activeStudent.matricule) + '</dd></div><div><dt>Statut</dt><dd>' + (activeStudent.lifecycle_status === "active" ? "ACTIF" : "EN PRÉPARATION") + '</dd></div><div><dt>Classe</dt><dd>' + escapeMarkup(facts.className) + '</dd></div><div><dt>Année scolaire</dt><dd>' + escapeMarkup(facts.year) + '</dd></div></dl></section>';
  }

  function familyPanel() {
    var parent = activeStudent.primary_parent || {};
    return '<section class="student-dossier-panel"><header><span>Parcours B2–B4</span><h3>Famille</h3></header><div class="student-dossier-summary"><article><small>Parent principal</small><b>' + escapeMarkup(parent.display_name || "Non renseigné") + '</b><span>' + escapeMarkup(parent.account_status || "Statut à vérifier") + '</span></article><article><small>Tuteurs secondaires</small><b>3 emplacements</b><span>Selon le dossier familial</span></article><article><small>Contact d’urgence</small><b>Séparé</b><span>Ordre d’appel contrôlé</span></article></div>' + (root.SchoolSafeStudentFamily && activeStudent.lifecycle_status !== "active" ? '<button class="ss-button" type="button" data-open-existing="family"><i data-lucide="users-round"></i> Ouvrir le dossier familial</button>' : '<p class="student-dossier-honest">Consultation synthétique. Les détails restent soumis à la permission et à la portée.</p>') + '</section>';
  }

  function schoolingPanel() {
    var facts = classAndYear(activeStudent);
    return '<section class="student-dossier-panel"><header><span>Parcours B5</span><h3>Scolarité</h3></header><div class="student-dossier-summary"><article><small>Année actuelle</small><b>' + escapeMarkup(facts.year) + '</b><span>Structure B6 partagée</span></article><article><small>Classe actuelle</small><b>' + escapeMarkup(facts.className) + '</b><span>Historique conservé</span></article><article><small>Opérations</small><b>Préparations locales</b><span>Aucune confirmation serveur</span></article></div><button class="ss-button" type="button" data-open-existing="schooling"><i data-lucide="graduation-cap"></i> Ouvrir le parcours scolaire</button></section>';
  }

  function futurePanel(section) {
    var draft = activeStudent.lifecycle_status !== "active";
    var unavailable = draft && ["attendance", "security", "pedagogy", "finance", "canteen", "remediation"].indexOf(section.id) >= 0;
    return '<section class="student-dossier-panel"><header><span>APERÇU — FEATURE_LATER</span><h3>' + escapeMarkup(section.label) + '</h3></header>' + (unavailable ? '<div class="student-dossier-unavailable"><i data-lucide="lock"></i><div><b>Module bloqué</b><p>Indisponible tant que le dossier n’est pas ACTIF.</p></div></div>' : '<div class="student-dossier-future"><i data-lucide="construction"></i><div><b>État futur clairement identifié</b><p>Aucune ' + escapeMarkup(section.label.toLowerCase()) + ' officielle n’est simulée dans ce frontend. L’entrée réelle sera reliée lorsque le module métier sera disponible.</p><span>BACKEND_LATER / FEATURE_LATER</span></div></div>') + '</section>';
  }

  function historyPanel() {
    return '<section class="student-dossier-panel"><header><span>Traçabilité du dossier</span><h3>Historique</h3></header><ol class="student-dossier-history"><li><b>Dossier central consulté</b><span>Démonstration locale · aucune écriture serveur</span></li><li><b>Statut actuel</b><span>' + (activeStudent.lifecycle_status === "active" ? "ACTIF" : "EN PRÉPARATION") + '</span></li><li><b>Historique scolaire</b><span>Accessible depuis le parcours B5 selon permission</span></li></ol></section>';
  }

  function panel(section) {
    if (!section) return '<section class="student-dossier-panel"><h3>Accès indisponible</h3></section>';
    if (section.id === "identity") return identityPanel();
    if (section.id === "family") return familyPanel();
    if (section.id === "schooling") return schoolingPanel();
    if (section.id === "history") return historyPanel();
    return futurePanel(section);
  }

  function render() {
    var sections = visibleSections(activeStudent, activeUser);
    if (!sections.some(function (item) { return item.id === activeSection; })) activeSection = sections.length ? sections[0].id : "";
    var selected = sections.find(function (item) { return item.id === activeSection; });
    var nav = sections.map(function (item) {
      return '<button type="button" data-dossier-section="' + item.id + '" class="' + (item.id === activeSection ? "active" : "") + '"><i data-lucide="' + item.icon + '"></i><span><b>' + escapeMarkup(item.label) + '</b><small>' + escapeMarkup(item.state) + '</small></span></button>';
    }).join("");
    return '<div class="student-central-dossier">' + hero() + draftWarning() + '<div class="student-dossier-layout"><nav class="student-dossier-nav" aria-label="Sections du dossier élève">' + nav + '</nav><main class="student-dossier-content" aria-live="polite">' + panel(selected) + '</main></div><aside class="student-dossier-jaspe"><i data-lucide="sparkles"></i><div><b>Jaspe reste dans votre périmètre</b><p>Il peut aider à naviguer et résumer uniquement les sections visibles. Aucun accès transversal caché.</p></div></aside></div>';
  }

  function rerender() {
    if (!activeModal || !activeModal.isOpen()) return;
    activeModal.content.innerHTML = render();
    bind();
  }

  function bind() {
    activeModal.content.querySelectorAll("[data-dossier-section]").forEach(function (button) {
      button.addEventListener("click", function () { activeSection = button.getAttribute("data-dossier-section"); rerender(); });
    });
    activeModal.content.querySelectorAll("[data-open-existing]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-open-existing");
        if (target === "family" && root.SchoolSafeStudentFamily) root.SchoolSafeStudentFamily.open(activeStudent, activeUser);
        if (target === "schooling" && root.SchoolSafeStudentLifecycle) root.SchoolSafeStudentLifecycle.open(activeStudent, activeUser);
      });
    });
    var cardButton = activeModal.content.querySelector("[data-open-student-card]");
    if (cardButton) cardButton.addEventListener("click", function () { root.SchoolSafeStudentCardPreparation.open(activeStudent, activeUser); });
    if (root.lucide) root.lucide.createIcons();
  }

  function open(student, user) {
    var sections = visibleSections(student, user || {});
    if (!sections.length) {
      root.ssModal({ title: "Dossier élève", content: '<div class="student-dossier-unavailable"><i data-lucide="shield-x"></i><div><b>Accès refusé</b><p>Aucune section n’est autorisée dans votre portée.</p></div></div>', actions: [{ label: "Fermer", variant: "secondary" }] });
      if (root.lucide) root.lucide.createIcons();
      return;
    }
    activeStudent = student;
    activeUser = user || {};
    activeSection = sections[0].id;
    activeModal = root.ssModal({ title: "Dossier élève central", subtitle: "Navigation transversale selon Access_Law", size: "full", className: "student-central-dossier-modal", content: render(), actions: [{ label: "Fermer le dossier", variant: "secondary" }], onClose: function () { activeModal = null; activeStudent = null; activeUser = null; } });
    bind();
  }

  root.SchoolSafeStudentDossier = { SECTIONS: SECTIONS, visibleSections: visibleSections, open: open };
})(window);
