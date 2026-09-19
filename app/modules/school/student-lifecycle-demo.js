(function (root) {
  "use strict";

  /*
  THESIS: Le parcours scolaire sépare sans ambiguïté la situation actuelle des opérations administratives seulement préparées.
  OWN-WORLD: Aura Blue existant, chronologie administrative, statuts sémantiques et comparatifs avant/après sans décoration superflue.
  STORY: Un profil autorisé consulte l’historique, prépare une opération locale, puis retrouve la situation actuelle strictement inchangée.
  FIRST VIEWPORT: identité, statut, année, niveau, classe et prochaine opération précèdent toute action ou chronologie.
  FORM: extension locale code-led de la fiche Élèves, spécification B5-FE officielle du 27 août 2026.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
  */

  var STORAGE_KEY = "schoolsafe-b5-lifecycle-demo-v1";
  var READ_PERMISSION = "school.student.read";
  var MANAGE_PERMISSION = "school.enrollment.manage";
  var TRANSFER_PERMISSION = "school.student.transfer";
  var ARCHIVE_PERMISSION = "school.student.archive";
  var activeModal = null;
  var activeStudent = null;
  var activeUser = null;
  var activeState = null;
  var pendingFocus = "";

  function escapeMarkup(value) {
    if (root.ssEscapeHtml) return root.ssEscapeHtml(value == null ? "" : String(value));
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function studentName(student) {
    return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");
  }

  function isExplicitlyDenied(user, permission) {
    if (root.SchoolSafeAccess && typeof root.SchoolSafeAccess.explicitDeny === "function") return root.SchoolSafeAccess.explicitDeny(user || {}, permission);
    if (Array.isArray(user && user.deniedPermissions) && user.deniedPermissions.indexOf(permission) >= 0) return true;
    return Array.isArray(user && user.permissionExceptions) && user.permissionExceptions.some(function (exception) {
      return exception && exception.permission === permission && String(exception.effect || "").toLowerCase() === "deny";
    });
  }

  function hasPermission(user, permission) {
    if (isExplicitlyDenied(user, permission)) return false;
    var access = root.SchoolSafeAccess;
    return !!(access && typeof access.canAccess === "function" && access.canAccess(user || {}, permission));
  }

  function scopeType(user, permission) {
    var scopes = Array.isArray(user && user.scopes) ? user.scopes : [];
    var matched = scopes.find(function (scope) { return scope.permission === permission; }) || scopes.find(function (scope) { return !scope.permission; });
    return matched && matched.type;
  }

  function canView(user, student) {
    if (!hasPermission(user, READ_PERMISSION) || !student) return false;
    var scope = scopeType(user, READ_PERMISSION);
    if (scope === "school") return true;
    if (scope === "own_children") {
      return Array.isArray(user.childIds) && user.childIds.indexOf(student.id) >= 0;
    }
    if (scope === "assigned_classes") {
      return student.lifecycle_status === "active" && Array.isArray(user.assignedClassIds) && user.assignedClassIds.indexOf(student.class_id) >= 0;
    }
    return false;
  }

  function canPrepare(user, student, permission) {
    return !!student && student.lifecycle_status === "active" && hasPermission(user, permission) && scopeType(user, permission) === "school";
  }

  function nowStamp() {
    var now = new Date();
    return {
      date: now.toLocaleDateString("fr-FR"),
      time: now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    };
  }

  function actorName(user) {
    return user && user.profile && user.profile.display_name
      ? user.profile.display_name
      : user && user.role === "admin" ? "Administrateur principal" : "Profil de démonstration";
  }

  function displayDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return value || "—";
    var parts = String(value).split("-");
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  function readStore() {
    try { return JSON.parse(root.localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (error) { return {}; }
  }

  function saveState(student, state) {
    var store = readStore();
    store[student.id] = state;
    try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
    catch (error) {}
  }

  function currentSnapshot(student) {
    var enrollment = student.enrollment || {};
    var className = enrollment.planned_class_name || "Classe non renseignée";
    return {
      status: student.lifecycle_status === "active" ? "ACTIF" : "EN PRÉPARATION",
      year: enrollment.academic_year_label || (student.lifecycle_status === "active" ? "2026-2027" : "Année à confirmer"),
      level: enrollment.level_name || className.split(/\s+/)[0] || "Niveau à confirmer",
      className: className,
      section: enrollment.section_name || className.split(/\s+/).slice(1).join(" ") || "Section à confirmer",
      startsOn: enrollment.starts_on || "2026-09-01",
      entryDate: student.lifecycle_status === "active" ? (student.school_entry_date || "2023-09-04") : "—",
      yearsAtSchool: student.lifecycle_status === "active" ? (student.years_at_school || 3) : "—"
    };
  }

  function event(date, time, type, oldValue, newValue, actor, status) {
    return { date: date, time: time, type: type, oldValue: oldValue, newValue: newValue, actor: actor, status: status };
  }

  function createState(student) {
    var current = currentSnapshot(student);
    if (student.lifecycle_status !== "active") {
      return {
        current: current,
        enrollments: [{ year: current.year, className: current.className, level: current.level, status: "EN PRÉPARATION", startsOn: current.startsOn, endsOn: "—", reason: "Activation officielle requise" }],
        operations: [],
        activeForm: "",
        history: [
          event("27/08/2026", "09:15", "Inscription initiale", "Aucun dossier", current.className, "Responsable admissions", "EN PRÉPARATION"),
          event("27/08/2026", "09:40", "Dossier consulté", current.className, "Situation inchangée", "Administrateur principal", "EN PRÉPARATION")
        ]
      };
    }
    return {
      current: current,
      enrollments: [
        { year: current.year, className: current.className, level: current.level, status: "ACTUELLE", startsOn: current.startsOn, endsOn: "—", reason: "Année scolaire en cours" },
        { year: "2025-2026", className: "7e A", level: "7e", status: "TERMINÉE", startsOn: "2025-09-01", endsOn: "2026-06-30", reason: "Passage de classe" },
        { year: "2024-2025", className: "8e B", level: "8e", status: "TRANSFÉRÉE", startsOn: "2024-09-02", endsOn: "2025-06-30", reason: "Réorganisation interne" }
      ],
      operations: [],
      activeForm: "",
      history: [
        event("04/09/2023", "08:00", "Inscription initiale", "Aucun dossier", "Entrée dans l’école", "Responsable admissions", "TERMINÉE"),
        event("01/09/2026", "07:30", "Début d’année scolaire", "7e A", current.className, "Administrateur principal", "ACTUELLE"),
        event("12/08/2026", "10:20", "Changement de classe préparé", "6e A", "6e B", "Responsable pédagogique", "EN PRÉPARATION"),
        event("13/08/2026", "14:05", "Changement annulé", "6e B", "6e A conservée", "Administrateur principal", "TERMINÉE"),
        event("27/08/2026", "11:00", "Futur passage en inactif", "ACTIF", "INACTIF", "Démonstration SchoolSafe", "BACKEND_LATER"),
        event("27/08/2026", "11:05", "Futur archivage", "INACTIF", "ARCHIVÉ", "Démonstration SchoolSafe", "BACKEND_LATER")
      ]
    };
  }

  function stateFor(student) {
    var stored = readStore()[student.id];
    if (!stored || !stored.current || !Array.isArray(stored.enrollments) || !Array.isArray(stored.operations) || !Array.isArray(stored.history)) {
      return createState(student);
    }
    stored.activeForm = "";
    return stored;
  }

  function badge(label, variant) {
    return root.ssBadge({ label: label, variant: variant || "info" });
  }

  function renderSummary(student, state) {
    var current = state.current;
    var isActive = student.lifecycle_status === "active";
    var next = state.operations.length ? state.operations[state.operations.length - 1].status : "Aucune opération préparée";
    return '<div class="lifecycle-summary" data-lifecycle-summary>' +
      '<div class="lifecycle-summary__identity"><span aria-hidden="true">' + escapeMarkup((student.first_name || "?").charAt(0) + (student.last_name || "").charAt(0)) + '</span><div><h3>' + escapeMarkup(studentName(student)) + '</h3><p>Matricule ' + escapeMarkup(student.matricule) + '</p></div>' + badge(current.status, student.lifecycle_status === "active" ? "success" : "warning") + '</div>' +
      '<dl class="lifecycle-current"><div><dt>' + (isActive ? 'Statut actuel' : 'Statut du dossier') + '</dt><dd>' + escapeMarkup(current.status) + '</dd></div><div><dt>' + (isActive ? 'Année actuelle' : 'Année prévue') + '</dt><dd data-current-year>' + escapeMarkup(current.year) + '</dd></div><div><dt>' + (isActive ? 'Niveau actuel' : 'Niveau prévu') + '</dt><dd data-current-level>' + escapeMarkup(current.level) + '</dd></div><div><dt>' + (isActive ? 'Classe actuelle' : 'Classe prévue') + '</dt><dd data-current-class>' + escapeMarkup(current.className) + '</dd></div><div><dt>Entrée dans l’école</dt><dd>' + escapeMarkup(displayDate(current.entryDate)) + '</dd></div><div><dt>Ancienneté</dt><dd>' + escapeMarkup(current.yearsAtSchool) + (current.yearsAtSchool === "—" ? '' : ' ans') + '</dd></div></dl>' +
      '<div class="lifecycle-next"><span>Prochaine opération préparée</span><b>' + escapeMarkup(next) + '</b></div></div>';
  }

  function renderEnrollments(state) {
    return '<div class="lifecycle-enrollments">' + state.enrollments.map(function (item) {
      var variant = item.status === "ACTUELLE" ? "success" : item.status === "EN PRÉPARATION" ? "warning" : "info";
      return '<article data-lifecycle-enrollment><div class="lifecycle-enrollment__rail"><span></span></div><div><header><h3>' + escapeMarkup(item.year) + '</h3>' + badge(item.status, variant) + '</header><dl><div><dt>Classe</dt><dd>' + escapeMarkup(item.className) + '</dd></div><div><dt>Niveau</dt><dd>' + escapeMarkup(item.level) + '</dd></div><div><dt>Début</dt><dd>' + escapeMarkup(item.startsOn) + '</dd></div><div><dt>Fin</dt><dd>' + escapeMarkup(item.endsOn) + '</dd></div><div><dt>Motif</dt><dd>' + escapeMarkup(item.reason) + '</dd></div></dl></div></article>';
    }).join("") + '</div>';
  }

  function renderHistory(state) {
    return '<ol class="lifecycle-history">' + state.history.map(function (item) {
      return '<li data-lifecycle-history-item><time><b>' + escapeMarkup(item.date) + '</b><span>' + escapeMarkup(item.time) + '</span></time><div><header><h3>' + escapeMarkup(item.type) + '</h3>' + badge(item.status, item.status === "ACTUELLE" ? "success" : item.status === "BACKEND_LATER" ? "warning" : "info") + '</header><p><span>Ancienne valeur</span><b>' + escapeMarkup(item.oldValue) + '</b></p><p><span>Nouvelle valeur</span><b>' + escapeMarkup(item.newValue) + '</b></p><small>Préparé par ' + escapeMarkup(item.actor) + '</small></div></li>';
    }).join("") + '</ol>';
  }

  function renderOperations(state) {
    if (!state.operations.length) return '<div class="lifecycle-empty" data-lifecycle-empty tabindex="-1" role="status" aria-live="polite"><i data-lucide="calendar-clock"></i><div><b>Aucune opération préparée</b><p>La situation actuelle reste la seule référence affichée.</p></div></div>';
    return '<div class="lifecycle-operations" aria-live="polite">' + state.operations.map(function (operation) {
      var comparison = operation.before || operation.after
        ? '<div class="lifecycle-comparison"><p class="sr-only">' + escapeMarkup(operation.before || "Situation actuelle") + ' → ' + escapeMarkup(operation.after || "Situation préparée") + '</p><article><span>AVANT</span><b>' + escapeMarkup(operation.before || "Situation actuelle") + '</b></article><i data-lucide="arrow-right"></i><article><span>APRÈS</span><b>' + escapeMarkup(operation.after || "Situation préparée") + '</b></article></div>'
        : '';
      var notice = operation.type === "Réinscription"
        ? '<p class="lifecycle-operation__notice">Préparation locale — aucune donnée officielle modifiée. Connexion serveur ultérieure : BACKEND_LATER.</p>'
        : operation.type === "Départ" ? '<p class="lifecycle-operation__notice">Documents à préparer · aperçu uniquement</p>' : '';
      var cancel = operation.permission && canPrepare(activeUser, activeStudent, operation.permission)
        ? root.ssButton({ label: "Annuler cette préparation", variant: "secondary", icon: "undo-2", attrs: { "data-lifecycle-operation-cancel": operation.id } })
        : "";
      return '<article class="lifecycle-operation" data-lifecycle-operation="' + escapeMarkup(operation.id) + '" tabindex="-1"><header><div><h3>' + escapeMarkup(operation.type) + '</h3><p>' + escapeMarkup(operation.detail) + '</p></div>' + badge(operation.status, "warning") + '</header>' + comparison + notice + (cancel ? '<footer class="lifecycle-operation__actions">' + cancel + '</footer>' : '') + '</article>';
    }).join("") + '</div>';
  }

  function input(label, name, value, options) {
    options = options || {};
    var id = "lifecycle-" + name;
    var control;
    if (options.choices) {
      control = '<select id="' + id + '" name="' + name + '"' + (options.required ? ' required' : '') + '>' + options.choices.map(function (choice) {
        return '<option value="' + escapeMarkup(choice.value) + '"' + (choice.value === value ? ' selected' : '') + '>' + escapeMarkup(choice.label) + '</option>';
      }).join("") + '</select>';
    } else if (options.textarea) {
      control = '<textarea id="' + id + '" name="' + name + '" rows="3"' + (options.required ? ' required' : '') + '>' + escapeMarkup(value || "") + '</textarea>';
    } else {
      control = '<input id="' + id + '" name="' + name + '" type="' + (options.type || "text") + '" value="' + escapeMarkup(value || "") + '"' + (options.readonly ? ' readonly' : '') + (options.required ? ' required' : '') + '>';
    }
    return '<label class="lifecycle-field" for="' + id + '"><span>' + escapeMarkup(label) + (options.optional ? ' · facultatif' : '') + '</span>' + control + '</label>';
  }

  function submitButton() {
    return root.ssButton({ label: "Enregistrer la préparation", icon: "save", type: "submit" });
  }

  function renderForm(state) {
    var current = state.current;
    if (!state.activeForm) return "";
    var fields = "";
    var title = "";
    if (state.activeForm === "reenrollment") {
      title = "PRÉPARER UNE RÉINSCRIPTION";
      fields = input("Année scolaire actuelle", "current_year", current.year, { readonly: true }) + input("Prochaine année scolaire", "next_year", "2027-2028", { required: true }) + input("Niveau prévu", "planned_level", "5e", { required: true }) + input("Classe prévue", "planned_class", "5e A", { required: true }) + input("Date prévue", "planned_date", "2027-09-01", { type: "date", required: true }) + input("Observation", "observation", "", { textarea: true, optional: true });
    } else if (state.activeForm === "class_change") {
      title = "PRÉPARER UN CHANGEMENT DE CLASSE";
      fields = input("Année scolaire concernée", "current_year", current.year, { readonly: true }) + input("Classe actuelle", "current_class", current.className, { readonly: true }) + input("Nouvelle classe", "target_class", "", { required: true }) + input("Date d’effet prévue", "planned_date", "", { type: "date", required: true }) + input("Motif", "reason", "reorganisation", { required: true, choices: [{ value: "reorganisation", label: "Réorganisation pédagogique" }, { value: "level", label: "Changement de niveau" }, { value: "capacity", label: "Capacité de la classe" }, { value: "administrative", label: "Décision administrative" }, { value: "family", label: "Demande familiale approuvée" }, { value: "other", label: "Autre" }] }) + input("Observation", "observation", "", { textarea: true, optional: true });
    } else if (state.activeForm === "transfer") {
      title = "PRÉPARER UN TRANSFERT INTERNE";
      fields = input("Origine", "origin", current.className, { readonly: true }) + input("Destination", "destination", "", { required: true }) + input("Classe ou section cible", "target_class", "", { required: true }) + input("Date prévue", "planned_date", "", { type: "date", required: true }) + input("Motif", "reason", "", { required: true }) + input("Responsable ayant préparé l’opération", "prepared_by", actorName(activeUser), { readonly: true });
    } else if (state.activeForm === "departure") {
      title = "PRÉPARER UN DÉPART";
      fields = input("Type de départ", "departure_type", "other_school", { required: true, choices: [{ value: "other_school", label: "Transfert vers une autre école" }, { value: "voluntary", label: "Départ volontaire" }, { value: "cycle_end", label: "Fin de cycle" }, { value: "school_end", label: "Fin de scolarité" }, { value: "move", label: "Déménagement" }, { value: "other", label: "Autre motif administratif" }] }) + input("Date prévue", "planned_date", "", { type: "date", required: true }) + input("Motif", "reason", "", { required: true }) + input("Établissement de destination", "destination_school", "", { optional: true }) + input("Observation", "observation", "", { textarea: true, optional: true });
    }
    return '<form class="lifecycle-form" data-lifecycle-form="' + state.activeForm + '" tabindex="-1"><header><div><h3>' + title + '</h3><p>Préparation locale — aucune donnée officielle modifiée. <span>BACKEND_LATER</span></p></div><button type="button" data-lifecycle-cancel aria-label="Fermer le formulaire"><i data-lucide="x"></i></button></header><div class="lifecycle-form__grid">' + fields + '</div><footer>' + submitButton() + '</footer></form>';
  }

  function action(label, actionName, permission, icon) {
    if (!canPrepare(activeUser, activeStudent, permission)) return "";
    return root.ssButton({ label: label, variant: "secondary", icon: icon, attrs: { "data-lifecycle-action": actionName } });
  }

  function renderActions(student, user) {
    var allowed = [MANAGE_PERMISSION, TRANSFER_PERMISSION, ARCHIVE_PERMISSION].some(function (permission) { return canPrepare(user, student, permission); });
    if (!allowed) return '<aside class="lifecycle-readonly"><i data-lucide="eye"></i><div><b>Consultation uniquement</b><p>Ce profil peut lire le parcours dans sa portée, sans préparer d’opération administrative.</p></div></aside>';
    var commonActions = '<div class="lifecycle-actions__primary">' +
      action("Préparer une réinscription", "reenrollment", MANAGE_PERMISSION, "calendar-plus") +
      action("Préparer un changement de classe", "class_change", MANAGE_PERMISSION, "replace") +
      action("Préparer un transfert interne", "transfer", TRANSFER_PERMISSION, "arrow-left-right") +
      action("Préparer un départ", "departure", TRANSFER_PERMISSION, "log-out") + '</div>';
    var sensitiveActions = canPrepare(user, student, ARCHIVE_PERMISSION)
      ? '<details class="lifecycle-sensitive"><summary>Transitions futures sensibles</summary><div>' + action("Préparer le passage en inactif", "inactive", ARCHIVE_PERMISSION, "user-round-minus") + action("Préparer l’archivage", "archive", ARCHIVE_PERMISSION, "archive") + '</div></details>'
      : '';
    return '<div class="lifecycle-actions" aria-label="Opérations du cycle scolaire">' + commonActions + sensitiveActions + '</div>';
  }

  function renderBlocked(student, state) {
    return '<section class="family-section student-lifecycle" data-lifecycle-section><header><i data-lucide="route"></i><h2>Parcours scolaire</h2></header>' + renderSummary(student, state) + '<aside class="lifecycle-blocked" role="status"><i data-lucide="shield-ban"></i><div><b>DOSSIER NON ACTIF</b><p>La réinscription, le changement de classe et le départ ne sont disponibles qu’après l’activation officielle de l’élève.</p></div></aside><div class="lifecycle-backend"><span><strong>Préparation locale — aucune donnée officielle modifiée.</strong> Aucune opération de cycle scolaire ne peut consommer ce brouillon.</span><b>BACKEND_LATER</b></div><section class="lifecycle-panel"><h3>Inscription en préparation</h3>' + renderEnrollments(state) + '</section><section class="lifecycle-panel"><h3>Historique visuel</h3>' + renderHistory(state) + '</section></section>';
  }

  function renderSection(options) {
    var student = options.student;
    var user = options.user || {};
    if (!canView(user, student)) return "";
    if (user.token) return '<section class="family-section student-lifecycle" data-lifecycle-live-unavailable role="status"><header><i data-lucide="cloud-off"></i><h2>DONNÉES INDISPONIBLES</h2></header><p>Le cycle, l’historique et les préparations scolaires réels exigent une projection serveur sécurisée.</p><div class="lifecycle-backend"><span>Aucune fixture ni donnée sensible n’est conservée localement dans cette session.</span><b>BACKEND_LATER</b></div></section>';
    var state = options.state || stateFor(student);
    if (student.lifecycle_status !== "active") return renderBlocked(student, state);
    return '<section class="family-section student-lifecycle" data-lifecycle-section><header><i data-lucide="route"></i><h2>Parcours scolaire</h2></header>' +
      renderSummary(student, state) +
      '<div class="lifecycle-backend"><span><strong>Préparation locale — aucune donnée officielle modifiée.</strong> Les opérations ci-dessous restent dans cette démonstration.</span><b>BACKEND_LATER</b></div>' +
      renderActions(student, user) + renderForm(state) +
      '<section class="lifecycle-panel"><header><div><h3>Opérations préparées</h3><p>Stock séparé de l’inscription et de la classe actuelles.</p></div></header>' + renderOperations(state) + '</section>' +
      '<section class="lifecycle-panel"><header><div><h3>Chronologie des inscriptions</h3><p>Aucune ancienne inscription n’est supprimée.</p></div></header>' + renderEnrollments(state) + '</section>' +
      '<section class="lifecycle-panel"><header><div><h3>Historique visuel</h3><p>Chaque préparation ajoute une trace sans écraser les précédentes.</p></div></header>' + renderHistory(state) + '</section>' +
      '<section class="lifecycle-future"><article><b>INACTIF</b><p>L’élève ne participe plus aux opérations courantes ; son historique reste consultable.</p></article><article><b>ARCHIVÉ</b><p>Le dossier reste conservé et son accès demeure soumis aux permissions.</p></article><span>BACKEND_LATER</span></section></section>';
  }

  function addOperation(type, status, detail, before, after, permission) {
    var operation = { id: Date.now().toString(36), type: type, status: status, detail: detail, before: before, after: after, permission: permission };
    activeState.operations.push(operation);
    var stamp = nowStamp();
    activeState.history.push(event(stamp.date, stamp.time, type + " préparé", before || "Situation actuelle", after || detail, actorName(activeUser), status));
    activeState.activeForm = "";
    pendingFocus = "operation:" + operation.id;
    saveState(activeStudent, activeState);
  }

  function cancelOperation(operationId) {
    var index = activeState.operations.findIndex(function (operation) { return operation.id === operationId; });
    if (index < 0) return;
    var operation = activeState.operations[index];
    if (!operation.permission || !canPrepare(activeUser, activeStudent, operation.permission)) return;
    activeState.operations.splice(index, 1);
    var stamp = nowStamp();
    activeState.history.push(event(stamp.date, stamp.time, operation.type + " annulé", operation.after || operation.detail, activeState.current.className + " conservée", actorName(activeUser), "TERMINÉE"));
    pendingFocus = activeState.operations.length
      ? "operation:" + activeState.operations[Math.min(index, activeState.operations.length - 1)].id
      : "empty";
    saveState(activeStudent, activeState);
    rerender();
  }

  function submitForm(form) {
    if (!activeStudent || activeStudent.lifecycle_status !== "active") return;
    var data = new FormData(form);
    var kind = form.getAttribute("data-lifecycle-form");
    if (kind === "reenrollment" && canPrepare(activeUser, activeStudent, MANAGE_PERMISSION)) {
      addOperation("Réinscription", "RÉINSCRIPTION EN PRÉPARATION", String(data.get("next_year")) + " · " + String(data.get("planned_class")) + " · " + String(data.get("planned_date")), activeState.current.year + " · " + activeState.current.className, String(data.get("next_year")) + " · " + String(data.get("planned_class")), MANAGE_PERMISSION);
    } else if (kind === "class_change" && canPrepare(activeUser, activeStudent, MANAGE_PERMISSION)) {
      addOperation("Changement de classe", "EN ATTENTE DE VALIDATION", String(data.get("planned_date")) + " · " + String(data.get("reason")), activeState.current.className, String(data.get("target_class")), MANAGE_PERMISSION);
    } else if (kind === "transfer" && canPrepare(activeUser, activeStudent, TRANSFER_PERMISSION)) {
      addOperation("Transfert interne", "EN PRÉPARATION — BACKEND_LATER", String(data.get("destination")) + " · " + String(data.get("planned_date")), activeState.current.className + " · " + activeState.current.level + " · " + activeState.current.section, String(data.get("target_class")) + " · " + String(data.get("destination")), TRANSFER_PERMISSION);
    } else if (kind === "departure" && canPrepare(activeUser, activeStudent, TRANSFER_PERMISSION)) {
      addOperation("Départ", "DÉPART EN PRÉPARATION", String(data.get("departure_type")) + " · " + String(data.get("planned_date")) + (data.get("destination_school") ? " · " + String(data.get("destination_school")) : ""), "Dossier actif conservé", "Départ prévu · dossier conservé", TRANSFER_PERMISSION);
    }
    rerender();
  }

  function prepareFuture(kind) {
    if (!canPrepare(activeUser, activeStudent, ARCHIVE_PERMISSION)) return;
    var archive = kind === "archive";
    root.ssConfirm({
      title: archive ? "Préparer l’archivage" : "Préparer le passage en inactif",
      message: "Confirmer cette préparation locale ? Aucune donnée officielle ne sera modifiée et aucune transition serveur ne sera exécutée.",
      confirmLabel: "Confirmer la préparation",
      cancelLabel: "Annuler"
    }).then(function (confirmed) {
      if (!confirmed || !canPrepare(activeUser, activeStudent, ARCHIVE_PERMISSION)) return;
      if (archive) addOperation("Archivage futur", "ARCHIVÉE", "Dossier conservé sans suppression", "INACTIF", "ARCHIVÉ — BACKEND_LATER", ARCHIVE_PERMISSION);
      else addOperation("Passage futur en inactif", "INACTIF", "Aucune transition serveur", "ACTIF", "INACTIF — BACKEND_LATER", ARCHIVE_PERMISSION);
      rerender();
    });
  }

  function bind(options) {
    var rootElement = options.rootElement;
    if (!rootElement || !canView(options.user, options.student)) return;
    if (options.user && options.user.token) return;
    activeStudent = options.student;
    activeUser = options.user || {};
    activeState = options.state || stateFor(options.student);
    rootElement.querySelectorAll("[data-lifecycle-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var actionName = button.getAttribute("data-lifecycle-action");
        if (actionName === "inactive" || actionName === "archive") {
          prepareFuture(actionName);
          return;
        }
        activeState.activeForm = actionName;
        pendingFocus = "form";
        rerender();
      });
    });
    var form = rootElement.querySelector("[data-lifecycle-form]");
    if (form) form.addEventListener("submit", function (eventValue) { eventValue.preventDefault(); submitForm(form); });
    var cancel = rootElement.querySelector("[data-lifecycle-cancel]");
    if (cancel) cancel.addEventListener("click", function () { activeState.activeForm = ""; rerender(); });
    rootElement.querySelectorAll("[data-lifecycle-operation-cancel]").forEach(function (button) {
      button.addEventListener("click", function () { cancelOperation(button.getAttribute("data-lifecycle-operation-cancel")); });
    });
    if (root.lucide) root.lucide.createIcons();
    if (pendingFocus) {
      var focusTarget = pendingFocus === "form"
        ? rootElement.querySelector("[data-lifecycle-form]")
        : pendingFocus === "empty"
          ? rootElement.querySelector("[data-lifecycle-empty]")
          : rootElement.querySelector('[data-lifecycle-operation="' + pendingFocus.slice("operation:".length) + '"]');
      pendingFocus = "";
      if (focusTarget) root.requestAnimationFrame(function () { focusTarget.focus(); });
    }
  }

  function rerender() {
    if (!activeModal || !activeModal.isOpen()) return;
    activeModal.content.innerHTML = renderSection({ student: activeStudent, user: activeUser, state: activeState });
    bind({ rootElement: activeModal.content, student: activeStudent, user: activeUser, state: activeState });
  }

  function open(student, user) {
    if (!canView(user || {}, student)) {
      activeModal = root.ssModal({
        title: "Parcours scolaire",
        className: "student-lifecycle-modal",
        content: '<div class="lifecycle-denied"><i data-lucide="shield-x"></i><div><b>Accès au cycle scolaire indisponible</b><p>Ce profil ne dispose pas de la permission ou de la portée requise.</p></div></div>',
        actions: [{ label: "Fermer", variant: "secondary" }]
      });
      if (root.lucide) root.lucide.createIcons();
      return;
    }
    if (user && user.token) {
      activeUser = user;
      activeModal = root.ssModal({
        title: "Parcours scolaire",
        subtitle: "Session live · frontend uniquement",
        className: "student-lifecycle-modal",
        content: renderSection({ student: student, user: user }),
        actions: [{ label: "Fermer", variant: "secondary" }],
        onClose: function () { activeModal = null; activeStudent = null; activeUser = null; activeState = null; }
      });
      if (root.lucide) root.lucide.createIcons();
      return;
    }
    activeStudent = student;
    activeUser = user || {};
    activeState = stateFor(student);
    activeModal = root.ssModal({
      title: "Cycle scolaire · " + studentName(student),
      subtitle: "Consultation et préparations locales · aucune confirmation serveur",
      size: "full",
      className: "student-lifecycle-modal",
      content: renderSection({ student: student, user: activeUser, state: activeState }),
      actions: [{ label: "Fermer", variant: "secondary" }],
      onClose: function () { activeModal = null; activeStudent = null; activeUser = null; activeState = null; }
    });
    bind({ rootElement: activeModal.content, student: student, user: activeUser, state: activeState });
  }

  root.SchoolSafeStudentLifecycle = {
    STORAGE_KEY: STORAGE_KEY,
    PERMISSIONS: [MANAGE_PERMISSION, TRANSFER_PERMISSION, ARCHIVE_PERMISSION],
    canView: canView,
    canPrepare: canPrepare,
    getAcademicStructure: function () {
      var structure = root.SchoolSafeAcademicStructure;
      return structure ? { activeYear: structure.getActiveYear(), years: structure.getYears(), levels: structure.getLevels(), classes: structure.getClasses() } : { activeYear: null, years: [], levels: [], classes: [] };
    },
    renderSection: renderSection,
    bind: bind,
    open: open
  };
})(window);
