(function (root) {
  "use strict";

  var READ_PERMISSION = "school.class.read";
  var MANAGE_PERMISSION = "school.structure.manage";
  var STORAGE_KEY = "schoolsafe-b6-academic-structure-drafts-v1";
  var activeUser = null;
  var activeContainer = null;

  var YEARS = [
    { id: "year-2027", label: "2027-2028", startsOn: "01/09/2027", endsOn: "30/06/2028", status: "EN PRÉPARATION" },
    { id: "year-2026", label: "2026-2027", startsOn: "01/09/2026", endsOn: "30/06/2027", status: "ACTIVE" },
    { id: "year-2025", label: "2025-2026", startsOn: "01/09/2025", endsOn: "30/06/2026", status: "TERMINÉE" },
    { id: "year-2024", label: "2024-2025", startsOn: "02/09/2024", endsOn: "30/06/2025", status: "ARCHIVÉE" }
  ];
  var LEVELS = [
    { id: "level-mat-3", name: "3e Maternelle", cycle: "Maternelle", order: 1 },
    { id: "level-5", name: "5e", cycle: "Primaire", order: 2 },
    { id: "level-6", name: "6e", cycle: "Primaire", order: 3 },
    { id: "level-sec-1", name: "1re Secondaire", cycle: "Secondaire", order: 4 }
  ];
  var CLASSES = [
    { id: "demo-class-1", name: "6e A", levelId: "level-6", level: "6e", yearId: "year-2026", year: "2026-2027", section: "A", teacher: "Mme Y", capacity: 36, enrollment: 32, status: "ACTIVE" },
    { id: "demo-class-2", name: "5e A", levelId: "level-5", level: "5e", yearId: "year-2026", year: "2026-2027", section: "A", teacher: "M. Kabeya", capacity: 34, enrollment: 29, status: "ACTIVE" },
    { id: "demo-class-3", name: "3e Maternelle", levelId: "level-mat-3", level: "3e Maternelle", yearId: "year-2026", year: "2026-2027", section: "", teacher: "Mme Lemba", capacity: 24, enrollment: 21, status: "ACTIVE" },
    { id: "demo-class-4", name: "1re Secondaire B", levelId: "level-sec-1", level: "1re Secondaire", yearId: "year-2026", year: "2026-2027", section: "B", teacher: "À affecter", capacity: 40, enrollment: null, status: "EN PRÉPARATION" }
  ];

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

  function canManage(user) {
    var scope = scopeFor(user, MANAGE_PERMISSION);
    return hasPermission(user, MANAGE_PERMISSION) && !!scope && scope.type === "school";
  }

  function canRead(user) {
    if (canManage(user)) return true;
    var scope = scopeFor(user, READ_PERMISSION);
    return hasPermission(user, READ_PERMISSION) && !!scope && (scope.type === "school" || scope.type === "assigned_classes");
  }

  function emptyDrafts() {
    return { years: [], levels: [], classes: [] };
  }

  function readDrafts() {
    try {
      var parsed = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(parsed)) return { years: [], levels: [], classes: parsed };
      if (!parsed || typeof parsed !== "object") return emptyDrafts();
      return {
        years: Array.isArray(parsed.years) ? parsed.years : [],
        levels: Array.isArray(parsed.levels) ? parsed.levels : [],
        classes: Array.isArray(parsed.classes) ? parsed.classes : []
      };
    } catch (error) { return emptyDrafts(); }
  }

  function writeDrafts(drafts) {
    root.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  }

  function draftId(kind) {
    return "draft-" + kind + "-" + Date.now();
  }

  function getYears() { return YEARS.concat(readDrafts().years).map(function (item) { return Object.assign({}, item); }); }
  function getLevels() { return LEVELS.concat(readDrafts().levels).map(function (item) { return Object.assign({}, item); }); }
  function getClasses() { return CLASSES.concat(readDrafts().classes).map(function (item) { return Object.assign({}, item); }); }
  function getActiveYear() { return getYears().find(function (item) { return item.status === "ACTIVE"; }); }

  function getVisibleClasses(user) {
    if (!canRead(user)) return [];
    var scope = scopeFor(user, READ_PERMISSION);
    if (scope && scope.type === "assigned_classes") {
      var assigned = Array.isArray(user.assignedClassIds) ? user.assignedClassIds : [];
      return getClasses().filter(function (item) { return assigned.indexOf(item.id) >= 0; });
    }
    return getClasses();
  }

  function statusVariant(status) {
    return status === "ACTIVE" ? "success" : status === "EN PRÉPARATION" || status === "BROUILLON LOCAL" ? "warning" : status === "ARCHIVÉE" ? "neutral" : "info";
  }

  function badge(status) {
    return root.ssBadge({ label: status, variant: statusVariant(status), size: "sm" });
  }

  function draftState(item) {
    if (!item.isLocalDraft) return "";
    var detail = item.draftAction === "update" ? "Modification préparée de " + item.sourceClassName : "Création préparée";
    return '<div class="academic-draft-indicator"><span>BROUILLON LOCAL</span><strong>BACKEND_LATER</strong><small>' + escapeMarkup(detail) + '</small></div>';
  }

  function renderYear(item) {
    return '<article class="academic-year-card" data-academic-year="' + escapeMarkup(item.id) + '"' + (item.isLocalDraft ? ' data-local-draft="true"' : '') + '><header><div><span>Année scolaire</span><h3>' + escapeMarkup(item.label) + '</h3></div>' + badge(item.status) + '</header><dl><div><dt>Début</dt><dd>' + escapeMarkup(item.startsOn) + '</dd></div><div><dt>Fin</dt><dd>' + escapeMarkup(item.endsOn) + '</dd></div></dl>' + draftState(item) + '<footer>Historique conservé · aucune suppression</footer></article>';
  }

  function renderLevel(item) {
    return '<article class="academic-level-card" data-academic-level="' + escapeMarkup(item.id) + '"' + (item.isLocalDraft ? ' data-local-draft="true"' : '') + '><span>' + escapeMarkup(item.cycle) + '</span><h3>' + escapeMarkup(item.name) + '</h3><p>Niveau configurable · ordre ' + item.order + '</p>' + draftState(item) + '</article>';
  }

  function renderClass(item) {
    return '<article class="academic-class-card" data-academic-class="' + escapeMarkup(item.id) + '"' + (item.isLocalDraft ? ' data-local-draft="true" data-draft-action="' + escapeMarkup(item.draftAction) + '"' : '') + (item.sourceClassId ? ' data-source-class="' + escapeMarkup(item.sourceClassId) + '"' : '') + '><header><div><span>' + escapeMarkup(item.level) + '</span><h3>' + escapeMarkup(item.name) + '</h3></div>' + badge(item.status) + '</header><dl><div><dt>Année scolaire</dt><dd>' + escapeMarkup(item.year) + '</dd></div><div><dt>Section</dt><dd>' + escapeMarkup(item.section || "—") + '</dd></div><div><dt>Enseignant principal</dt><dd>' + escapeMarkup(item.teacher || "À affecter") + '</dd></div><div><dt>Capacité indicative</dt><dd>' + escapeMarkup(item.capacity || "—") + '</dd></div><div><dt>Effectif visible</dt><dd>' + (item.enrollment == null ? "Indisponible" : escapeMarkup(item.enrollment)) + '</dd></div></dl>' + draftState(item) + (canManage(activeUser) && !item.isLocalDraft ? '<button type="button" class="academic-card-edit" data-edit-class="' + escapeMarkup(item.id) + '"><i data-lucide="pencil"></i> Modifier localement</button>' : '') + '</article>';
  }

  function render(container, user) {
    activeContainer = container;
    activeUser = user || { permissions: [] };
    if (!container) return;
    if (!canRead(activeUser)) {
      container.innerHTML = '<section class="academic-structure academic-structure--denied"><div class="academic-denied"><i data-lucide="shield-x"></i><div><h3>Accès à la structure refusé</h3><p>Permission, portée ou exception incompatible. DENY par défaut.</p></div></div></section>';
      if (root.lucide) root.lucide.createIcons();
      return;
    }
    if (activeUser.token) {
      container.innerHTML = '<section class="academic-structure academic-structure--unavailable" role="status"><div class="academic-denied"><i data-lucide="cloud-off"></i><div><span>SESSION LIVE</span><h3>DONNÉES INDISPONIBLES</h3><p>Les années, niveaux, classes, effectifs et préparations réels exigent une projection serveur sécurisée · BACKEND_LATER.</p></div></div></section>';
      if (root.lucide) root.lucide.createIcons();
      return;
    }
    var manage = canManage(activeUser);
    container.innerHTML = '<section class="academic-structure"><header class="academic-structure__hero"><div><span>Configuration académique partagée</span><h3>Structure scolaire</h3><p>Une source frontend commune pour les années, niveaux, classes et parcours élève.</p></div><div class="academic-structure__actions">' + (manage ? '<button class="ss-button ss-button--secondary" type="button" data-prepare-structure="year"><i data-lucide="calendar-plus"></i> Préparer une année</button><button class="ss-button ss-button--secondary" type="button" data-prepare-structure="level"><i data-lucide="layers-3"></i> Préparer un niveau</button><button class="ss-button" type="button" data-prepare-structure="class"><i data-lucide="school"></i> Préparer une classe</button>' : '<span class="academic-readonly"><i data-lucide="eye"></i> Lecture selon périmètre</span>') + '</div></header><aside class="academic-local-notice"><i data-lucide="cloud-off"></i><div><b>Préparation frontend uniquement</b><p>Les modifications restent des brouillons locaux. Toute écriture réelle est <strong>BACKEND_LATER</strong>.</p></div></aside><section class="academic-section"><header><div><span>Calendrier</span><h3>Années scolaires</h3></div><p>Passé conservé, prochaine année préparée.</p></header><div class="academic-year-grid">' + getYears().map(renderYear).join("") + '</div></section><section class="academic-section"><header><div><span>Référentiel générique</span><h3>Niveaux</h3></div><p>Aucun enum technique rigide.</p></header><div class="academic-level-grid">' + getLevels().map(renderLevel).join("") + '</div></section><section class="academic-section"><header><div><span>Organisation</span><h3>Classes</h3></div><p>' + getVisibleClasses(activeUser).length + ' classe(s) visible(s) dans votre portée.</p></header><div class="academic-class-grid">' + getVisibleClasses(activeUser).map(renderClass).join("") + '</div></section><aside class="academic-jaspe"><i data-lucide="sparkles"></i><div><b>Jaspe peut expliquer ou préparer un brouillon</b><p>Il ne valide aucune année, aucun niveau et aucune classe.</p></div></aside></section>';
    bind(container, activeUser);
  }

  function openDraftModal(kind, classId) {
    if (!canManage(activeUser)) return;
    var isClass = kind === "class";
    var sourceClass = isClass && classId ? CLASSES.find(function (item) { return item.id === classId; }) : null;
    if (classId && !sourceClass) return;
    var title = isClass ? (classId ? "Modifier une classe" : "Préparer une classe") : kind === "year" ? "Préparer une année scolaire" : "Préparer un niveau";
    var content = '<div class="academic-modal-state"><span>Brouillon local</span><strong>BACKEND_LATER</strong></div><form id="academicDraftForm" class="ss-form-grid">';
    if (isClass) {
      content += '<label class="ss-field"><span class="ss-label">Nom de la classe</span><input class="ss-input" name="name" required value="' + escapeMarkup(sourceClass ? sourceClass.name : "") + '"></label><label class="ss-field"><span class="ss-label">Niveau</span><select class="ss-select" name="level">' + getLevels().map(function (item) { return '<option value="' + escapeMarkup(item.id) + '"' + (sourceClass && sourceClass.levelId === item.id ? " selected" : "") + '>' + escapeMarkup(item.name) + '</option>'; }).join("") + '</select></label><label class="ss-field"><span class="ss-label">Capacité indicative</span><input class="ss-input" name="capacity" type="number" min="1" value="' + escapeMarkup(sourceClass ? sourceClass.capacity : 30) + '"></label>';
    } else {
      content += '<label class="ss-field"><span class="ss-label">Libellé</span><input class="ss-input" name="name" required></label>';
    }
    content += '<p class="academic-modal-copy">Aucune donnée officielle n’est créée. Un administrateur devra confirmer l’opération lorsque le backend sera disponible.</p></form>';
    var modal = root.ssModal({ title: title, className: "academic-structure-modal", content: content, actions: [{ label: "Annuler", variant: "secondary", onClick: function () { modal.close(); } }, { label: "Enregistrer le brouillon", variant: "primary", type: "submit", closeOnClick: false, attrs: { form: "academicDraftForm" } }] });
    var form = modal.content.querySelector("#academicDraftForm");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var drafts = readDrafts();
      if (isClass) {
        var level = getLevels().find(function (item) { return item.id === form.level.value; }) || getLevels()[0];
        var activeYear = getActiveYear();
        if (sourceClass) drafts.classes = drafts.classes.filter(function (item) { return item.sourceClassId !== sourceClass.id; });
        drafts.classes.push({ id: sourceClass ? "draft-class-update-" + sourceClass.id : draftId("class"), name: form.name.value.trim(), levelId: level.id, level: level.name, yearId: sourceClass ? sourceClass.yearId : activeYear.id, year: sourceClass ? sourceClass.year : activeYear.label, section: sourceClass ? sourceClass.section : "", teacher: sourceClass ? sourceClass.teacher : "À affecter", capacity: Number(form.capacity.value), enrollment: sourceClass ? sourceClass.enrollment : null, status: "BROUILLON LOCAL", backendState: "BACKEND_LATER", isLocalDraft: true, draftAction: sourceClass ? "update" : "create", sourceClassId: sourceClass ? sourceClass.id : null, sourceClassName: sourceClass ? sourceClass.name : null });
      } else if (kind === "year") {
        drafts.years.push({ id: draftId("year"), label: form.name.value.trim(), startsOn: "À définir", endsOn: "À définir", status: "BROUILLON LOCAL", backendState: "BACKEND_LATER", isLocalDraft: true, draftAction: "create" });
      } else if (kind === "level") {
        drafts.levels.push({ id: draftId("level"), name: form.name.value.trim(), cycle: "À définir", order: getLevels().length + 1, status: "BROUILLON LOCAL", backendState: "BACKEND_LATER", isLocalDraft: true, draftAction: "create" });
      }
      writeDrafts(drafts);
      modal.close();
      render(activeContainer, activeUser);
    });
  }

  function bind(container) {
    container.querySelectorAll("[data-prepare-structure]").forEach(function (button) {
      button.addEventListener("click", function () { openDraftModal(button.getAttribute("data-prepare-structure")); });
    });
    container.querySelectorAll("[data-edit-class]").forEach(function (button) {
      button.addEventListener("click", function () { openDraftModal("class", button.getAttribute("data-edit-class")); });
    });
    if (root.lucide) root.lucide.createIcons();
  }

  root.SchoolSafeAcademicStructure = {
    STORAGE_KEY: STORAGE_KEY,
    canRead: canRead,
    canManage: canManage,
    getYears: getYears,
    getLevels: getLevels,
    getClasses: getClasses,
    getVisibleClasses: getVisibleClasses,
    getActiveYear: getActiveYear,
    render: render,
    bind: bind
  };
})(window);
