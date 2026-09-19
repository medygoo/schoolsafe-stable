(function (root) {
  "use strict";

  var READ_PERMISSION = "school.student.read";
  var PREPARE_PERMISSION = "security.card.create";

  function escapeMarkup(value) {
    if (root.ssEscapeHtml) return root.ssEscapeHtml(value == null ? "" : String(value));
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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
    return scopes.find(function (scope) { return scope.permission === permission; }) || scopes.find(function (scope) { return !scope.permission; }) || null;
  }

  function scopeAllows(user, permission, student) {
    var scope = scopeFor(user, permission);
    if (!scope) return false;
    if (scope.type === "school") return true;
    if (scope.type === "own_children") return Array.isArray(user.childIds) && user.childIds.indexOf(student.id) >= 0;
    if (scope.type === "assigned_classes") return student.lifecycle_status === "active" && Array.isArray(user.assignedClassIds) && user.assignedClassIds.indexOf(student.class_id) >= 0;
    return false;
  }

  function canView(student, user) { return !!student && hasPermission(user, READ_PERMISSION) && scopeAllows(user, READ_PERMISSION, student); }
  function canPrepare(student, user) { return !!student && student.lifecycle_status === "active" && hasPermission(user, PREPARE_PERMISSION) && scopeAllows(user, PREPARE_PERMISSION, student); }
  function studentName(student) { return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" "); }

  function facts(student) {
    var enrollment = student.enrollment || {};
    var structure = root.SchoolSafeAcademicStructure;
    var academicClass = structure && structure.getClasses().find(function (item) { return item.id === (student.class_id || enrollment.planned_class_id); });
    var year = enrollment.academic_year_label || (academicClass && academicClass.year) || (structure && structure.getActiveYear() && structure.getActiveYear().label) || "";
    return {
      name: studentName(student),
      className: enrollment.planned_class_name || (academicClass && academicClass.name) || "",
      classActive: !!academicClass && academicClass.status === "ACTIVE",
      year: year,
      yearActive: !!(structure && structure.getActiveYear() && structure.getActiveYear().label === year),
      school: "École de démonstration"
    };
  }

  function checklist(student) {
    var data = facts(student);
    return [
      { id: "active", label: "Élève actif", ok: student.lifecycle_status === "active", missing: "Dossier non actif" },
      { id: "identity", label: "Identité complète", ok: !!(student.first_name && student.last_name), missing: "Identité incomplète" },
      { id: "photo", label: "Photo", ok: !!(student.photo_url || student.photo), missing: "Photo manquante" },
      { id: "matricule", label: "Matricule", ok: !!student.matricule, missing: "Matricule manquant" },
      { id: "class", label: "Classe active", ok: !!data.className && data.classActive, missing: "Classe active à confirmer" },
      { id: "year", label: "Année scolaire active", ok: !!data.year && data.yearActive, missing: "Année active à confirmer" },
      { id: "required", label: "Données nécessaires à la carte", ok: !!(data.name && data.school && data.className && data.year), missing: "Données de carte incomplètes" }
    ];
  }

  function statusFor(student) {
    if (!student || student.lifecycle_status !== "active") return "NON PRÊTE";
    return checklist(student).every(function (item) { return item.ok; }) ? "PRÊTE POUR TRANSMISSION" : "À VÉRIFIER";
  }

  function statusVariant(status) { return status === "PRÊTE POUR TRANSMISSION" ? "success" : status === "À VÉRIFIER" ? "warning" : "error"; }

  function preview(student) {
    var data = facts(student);
    var name = data.name;
    var initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) { return part.charAt(0); }).join("");
    return '<article class="student-card-preview"><header><div class="student-card-brand"><img src="./schoolsafe-logo.png" alt=""><span><b>SchoolSafe</b><small>Identité SchoolSafe</small></span></div><span>CARTE ÉLÈVE</span></header><div class="student-card-preview__body"><div class="student-card-photo">' + (student.photo_url ? '<img src="' + escapeMarkup(student.photo_url) + '" alt="Photo de ' + escapeMarkup(name) + '">' : '<span>' + escapeMarkup(initials) + '</span><small>PHOTO À FOURNIR</small>') + '</div><div class="student-card-data"><span>' + escapeMarkup(data.school) + '</span><h3>' + escapeMarkup(name) + '</h3><dl><div><dt>Matricule</dt><dd>' + escapeMarkup(student.matricule || "À renseigner") + '</dd></div><div><dt>Classe</dt><dd>' + escapeMarkup(data.className || "À confirmer") + '</dd></div><div><dt>Année</dt><dd>' + escapeMarkup(data.year || "À confirmer") + '</dd></div></dl></div><div class="student-card-qr"><i data-lucide="qr-code"></i><b>EMPLACEMENT QR</b><small>Aucun QR officiel généré</small></div></div><footer><span>Prévisualisation SchoolSafe</span><b>NON OFFICIELLE</b></footer></article>';
  }

  function render(student, user) {
    if (!canView(student, user) && !canPrepare(student, user)) return '<div class="student-card-preparation student-card-preparation--denied"><div class="student-card-block"><i data-lucide="shield-x"></i><div><b>Accès à la carte refusé</b><p>Permission ou portée insuffisante.</p></div></div></div>';
    var status = statusFor(student);
    var draft = student.lifecycle_status !== "active";
    if (draft) return '<div class="student-card-preparation"><header class="student-card-heading"><div><span>Carte élève SchoolSafe</span><h2>Préparation de la carte</h2></div>' + root.ssBadge({ label: status, variant: statusVariant(status) }) + '</header><div class="student-card-block student-card-block--draft"><i data-lucide="badge-x"></i><div><b>CARTE INDISPONIBLE</b><h3>DOSSIER NON ACTIF</h3><p>Une carte officielle ne peut concerner qu’un élève ACTIF et opérationnel. Aucune génération ni transmission n’est proposée.</p></div></div><aside class="student-card-jaspe"><i data-lucide="sparkles"></i><p>Jaspe peut expliquer pourquoi la carte est indisponible. Il ne génère et ne transmet rien.</p></aside></div>';
    var checks = checklist(student);
    var rows = checks.map(function (item) { return '<li data-card-check="' + item.id + '" class="' + (item.ok ? "ok" : "missing") + '"><i data-lucide="' + (item.ok ? "circle-check" : "circle-alert") + '"></i><span><b>' + escapeMarkup(item.label) + '</b><small>' + escapeMarkup(item.ok ? "Conforme aux données frontend" : item.missing) + '</small></span></li>'; }).join("");
    var missing = checks.filter(function (item) { return !item.ok; }).map(function (item) { return item.missing; });
    return '<div class="student-card-preparation"><header class="student-card-heading"><div><span>Carte élève SchoolSafe</span><h2>Préparation de la carte</h2><p>Prévisualisation et contrôle avant future transmission à SchoolSafe Control.</p></div>' + root.ssBadge({ label: status, variant: statusVariant(status) }) + '</header><div class="student-card-layout"><div>' + preview(student) + '<aside class="student-card-boundary"><i data-lucide="printer-x"></i><div><b>SchoolSafe ne réalise pas l’impression finale</b><p>Aucun PDF officiel, téléchargement ou appel Safe Control dans ce lot.</p></div></aside></div><section class="student-card-checklist"><header><span>Contrôles frontend</span><h3>Checklist avant carte</h3></header><ul>' + rows + '</ul><div class="student-card-status"><span>État de préparation</span>' + root.ssBadge({ label: status, variant: statusVariant(status) }) + '</div>' + (canPrepare(student, user) ? '<button class="ss-button" type="button" disabled>Transmission à SchoolSafe Control — BACKEND_LATER</button>' : '<p class="student-card-readonly">Consultation uniquement · aucune préparation ni transmission autorisée.</p>') + '</section></div><aside class="student-card-jaspe"><i data-lucide="sparkles"></i><div><b>Jaspe signale ce qui manque</b><p>' + escapeMarkup(missing.length ? missing.join(" · ") : "Checklist prête pour une future transmission autorisée.") + '</p></div></aside></div>';
  }

  function open(student, user) {
    var modal = root.ssModal({ title: "Carte élève", subtitle: "Préparation frontend · SchoolSafe Control BACKEND_LATER", size: "full", className: "student-card-preparation-modal", content: render(student, user || {}), actions: [{ label: "Fermer", variant: "secondary" }] });
    if (root.lucide) root.lucide.createIcons();
    return modal;
  }

  root.SchoolSafeStudentCardPreparation = { canView: canView, canPrepare: canPrepare, checklist: checklist, statusFor: statusFor, render: render, open: open };
})(window);
