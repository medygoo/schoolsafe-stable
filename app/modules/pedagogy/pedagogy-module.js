(function (global) {
  "use strict";

  var state = {
    activeTab: "subjects",
    subjects: [],
    classes: [],
    students: [],
    teacherAssignments: [],
    assignments: [],
    lessonPlans: [],
    profiles: [],
    selectedAssignmentId: null,
    selectedLessonPlanId: null,
    assignmentStudents: [],
    assignmentGrades: [],
    gradeDrafts: {},
    parentChildren: [],
    selectedParentChildId: null,
    parentGrades: [],
    parentAverages: null,
    loading: false,
    error: null,
  };

  function escapeMarkup(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function notify(message) {
    if (global.SchoolSafeApp && global.SchoolSafeApp.notify) {
      global.SchoolSafeApp.notify(message);
    } else {
      window.dispatchEvent(new CustomEvent("schoolsafe-toast", { detail: { message: message } }));
    }
  }

  function refreshIcons() {
    if (global.lucide && global.lucide.createIcons) {
      try { global.lucide.createIcons(); } catch (e) {}
    }
  }

  // Document Engine integration (DOC-03)
  var documentEngine = null;
  var documentEnginePromise = null;

  function getCurrentUser() {
    try {
      if (global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getCurrentUser === "function") {
        var canonical = global.SchoolSafeAppContext.getCurrentUser();
        if (canonical) return canonical;
      }
      var session = JSON.parse(global.sessionStorage.getItem("schoolsafe-v2-session") || "{}");
      if (session && session.user) return session.user;
      return { id: "anonymous", role: "guest", permissions: [], scopes: [] };
    } catch (e) {
      return { id: "anonymous", role: "guest", permissions: [], scopes: [] };
    }
  }

  function getUserPermissions(user) {
    return user && Array.isArray(user.permissions) ? user.permissions : [];
  }

  async function getDocumentEngine() {
    if (documentEngine) return documentEngine;
    if (documentEnginePromise) return documentEnginePromise;
    documentEnginePromise = new Promise(async function (resolve, reject) {
      try {
        var mod = await import("../document-engine/index.js");
        var registry = mod.createTemplateRegistry();
        mod.registerDefaultTemplates(registry);

        var accessGate = mod.createAccessGate({ adminRole: "admin" });
        var schoolIdentityProvider = {
          load: async function () {
            try {
              var settings = await global.SchoolSafeSchoolAPI.getSettings();
              var identity = settings.identity || {};
              var brand = settings.brand || {};
              var contact = settings.contact || {};
              return {
                name: identity.name || "École",
                legalName: identity.legal_name || identity.name || "École",
                address: contact.address || "",
                city: contact.city || "",
                phone: contact.phone || "",
                email: contact.email || "",
                website: contact.website_url || "",
                primaryColor: brand.primary_color || "#071a3d",
                accentColor: brand.accent_color || "#e9a515",
                logoUrl: brand.logo_path || null,
                currency: identity.currency || "USD",
                activeAcademicYear: (settings.academic_years || []).find(function (y) { return y.is_active; }) || null,
              };
            } catch (e) {
              return {
                name: "École Pilote",
                legalName: "École Pilote",
                address: "",
                city: "",
                phone: "",
                email: "",
                website: "",
                primaryColor: "#071a3d",
                accentColor: "#e9a515",
                logoUrl: null,
                currency: "USD",
                activeAcademicYear: null,
              };
            }
          }
        };
        var schoolSafeIdentityProvider = mod.createSchoolSafeIdentityProvider();
        var dataResolver = mod.createDocumentDataResolver({
          schoolIdentityProvider: schoolIdentityProvider,
          schoolSafeIdentityProvider: schoolSafeIdentityProvider,
          contextResolvers: {
            pedagogy: function (context) { return context; }
          }
        });
        var layoutEngine = mod.createLayoutEngine();
        var renderer = mod.createFrontendRenderer({ layoutEngine: layoutEngine });
        documentEngine = mod.createDocumentEngine({
          accessGate: accessGate,
          dataResolver: dataResolver,
          templateRegistry: registry,
          layoutEngine: layoutEngine,
          renderer: renderer
        });
        resolve(documentEngine);
      } catch (e) {
        reject(e);
      }
    });
    return documentEnginePromise;
  }

  function classIdsFor(user, scope) {
    var values = [];
    if (Array.isArray(user && user.assignedClassIds)) values = values.concat(user.assignedClassIds);
    if (scope && scope.id) values.push(scope.id);
    if (scope && Array.isArray(scope.ids)) values = values.concat(scope.ids);
    if (scope && Array.isArray(scope.classIds)) values = values.concat(scope.classIds);
    return values.map(function (value) { return String(value); });
  }

  function permissionAllowsAssignment(user, permission, assignment) {
    var access = global.SchoolSafeAccess;
    if (!access || typeof access.canAccess !== "function" || typeof access.scopeFor !== "function") return false;
    if (!access.canAccess(user || {}, permission)) return false;
    if (typeof access.explicitDeny === "function" && access.explicitDeny(user || {}, permission)) return false;
    if (typeof access.allowsScope === "function" && access.allowsScope(user || {}, permission, "school")) return true;
    if (!assignment || assignment.class_id == null || typeof access.allowsScope !== "function") return false;
    if (!access.allowsScope(user || {}, permission, "assigned_classes")) return false;
    var scope = access.scopeFor(user || {}, permission);
    return classIdsFor(user || {}, scope).indexOf(String(assignment.class_id)) >= 0;
  }

  function canUseAssignmentDocument(user, assignment) {
    return permissionAllowsAssignment(user, "pedagogy.assignment.read", assignment)
      || permissionAllowsAssignment(user, "pedagogy.assignment.manage", assignment);
  }

  function hasPdfPermission(user, assignment) {
    return canUseAssignmentDocument(user, assignment);
  }

  function hasValidSessionToken() {
    try {
      var raw = global.sessionStorage.getItem("schoolsafe-v2-session");
      if (!raw) return false;
      var session = JSON.parse(raw);
      return !!(session && (session.native === true || session.token));
    } catch (e) { return false; }
  }

  function isDemoMode() {
    if (hasValidSessionToken()) return false;
    if (global.schoolSafeDemoMode === true) return true;
    var host = String(global.location && global.location.hostname || "").toLowerCase();
    var isLocalhost = host === "localhost" || host === "127.0.0.1";
    return isLocalhost && !hasValidSessionToken();
  }

  function createDemoStudents() {
    return [
      { id: "demo-s1", first_name: "Lucas", last_name: "Martin", matricule: "MAT-2026-001", sex: "M" },
      { id: "demo-s2", first_name: "Emma", last_name: "Martin", matricule: "MAT-2026-002", sex: "F" },
      { id: "demo-s3", first_name: "Ethan", last_name: "Leroy", matricule: "MAT-2026-003", sex: "M" },
      { id: "demo-s4", first_name: "Chloé", last_name: "Bernard", matricule: "MAT-2026-004", sex: "F" }
    ];
  }

  function createDemoState() {
    return {
      activeTab: "subjects",
      subjects: [
        { id: "demo-math", name: "Mathématiques", code: "MATH", language: "FR", cycle_key: "primary", subject_family_code: "MATH" },
        { id: "demo-fr", name: "Français", code: "FR", language: "FR", cycle_key: "primary", subject_family_code: "FR" },
        { id: "demo-en", name: "Anglais", code: "EN", language: "EN", cycle_key: "secondary", subject_family_code: "EN" }
      ],
      classes: [
        { id: "demo-c1", name: "1re A", cycle_key: "secondary" },
        { id: "demo-c2", name: "2e B", cycle_key: "secondary" },
        { id: "demo-c3", name: "Maternelle 3", cycle_key: "nursery" }
      ],
      students: createDemoStudents(),
      teacherAssignments: [
        { id: "demo-ta1", teacher_id: "demo-teacher", class_id: "demo-c1", subject_id: "demo-math" },
        { id: "demo-ta2", teacher_id: "demo-teacher", class_id: "demo-c2", subject_id: "demo-fr" }
      ],
      assignments: [
        { id: "demo-a1", title: "Devoir de mathématiques", class_id: "demo-c1", classes: { name: "1re A" }, subject_id: "demo-math", subjects: { name: "Mathématiques" }, language: "FR", type: "homework", scale_mode: "numeric", scale_max: 20, scale_label: "/20", coefficient: 1, due_date: "2026-08-25", instructions: "Exercices 1 à 5 page 42.", status: "draft" },
        { id: "demo-a2", title: "Interrogation de français", class_id: "demo-c2", classes: { name: "2e B" }, subject_id: "demo-fr", subjects: { name: "Français" }, language: "FR", type: "quiz", scale_mode: "numeric", scale_max: 10, scale_label: "/10", coefficient: 0.5, due_date: "2026-08-26", instructions: "Dictée et analyse de texte.", status: "published" }
      ],
      lessonPlans: [
        { id: "demo-lp1", title: "Le théorème de Pythagore", lesson_date: "2026-08-21", class_id: "demo-c1", classes: { name: "1re A" }, subject_id: "demo-math", subjects: { name: "Mathématiques" }, teacher_id: "demo-teacher", profiles: { display_name: "M. Dupont" }, objectives: "Comprendre et appliquer le théorème.", materials: "Règle, équerre.", procedure: "Cours, exemples, exercices." }
      ],
      profiles: [],
      selectedAssignmentId: null,
      selectedLessonPlanId: null,
      assignmentStudents: [],
      assignmentGrades: [],
      gradeDrafts: {},
      parentChildren: [
        { students: { id: "demo-s1", first_name: "Lucas", last_name: "Martin", matricule: "MAT-2026-001" } },
        { students: { id: "demo-s2", first_name: "Emma", last_name: "Martin", matricule: "MAT-2026-002" } }
      ],
      selectedParentChildId: "demo-s1",
      parentGrades: [
        { assignment_id: "demo-a2", assignments: { title: "Interrogation de français", type: "quiz", subjects: { name: "Français" } }, value_numeric: 8, value_text: null, comment: "Bonne participation." }
      ],
      parentAverages: {
        overall_average: 12.5,
        subjects: [
          { subject_name: "Mathématiques", average: 14, grade_count: 2 },
          { subject_name: "Français", average: 11, grade_count: 3 }
        ]
      },
      loading: false,
      error: null
    };
  }

  var demoState = isDemoMode() ? createDemoState() : null;

  async function loadAll() {
    if (demoState) {
      Object.assign(state, demoState);
      render();
      return;
    }
    state.loading = true;
    state.loading = true;
    state.error = null;
    render();
    try {
      var results = await Promise.all([
        global.SchoolSafePedagogyAPI.listClasses(),
        global.SchoolSafePedagogyAPI.listSubjects(),
        global.SchoolSafePedagogyAPI.listAssignments(),
        global.SchoolSafePedagogyAPI.listLessonPlans(),
        global.SchoolSafePedagogyAPI.listTeacherAssignments(),
      ]);
      state.classes = results[0] || [];
      state.subjects = results[1] || [];
      state.assignments = results[2] || [];
      state.lessonPlans = results[3] || [];
      state.teacherAssignments = results[4] || [];
      if (state.selectedAssignmentId) {
        await loadAssignmentStudentsAndGrades(state.selectedAssignmentId);
      }
      if (state.activeTab === "parent-view") {
        await loadParentView();
      }
    } catch (e) {
      state.error = e.message || "Erreur de chargement";
      notify(state.error);
    }
    state.loading = false;
    render();
  }

  async function loadAssignmentStudentsAndGrades(assignmentId) {
    var assignment = state.assignments.find(function (a) { return a.id === assignmentId; });
    if (!assignment || !assignment.class_id) {
      state.assignmentStudents = [];
      state.assignmentGrades = [];
      state.gradeDrafts = {};
      return;
    }
    if (demoState) {
      state.assignmentStudents = demoState.students.filter(function (s) { return true; });
      state.assignmentGrades = [];
      state.gradeDrafts = {};
      return;
    }
    try {
      var results = await Promise.all([
        global.SchoolSafeSchoolAPI.listStudentsByClass(assignment.class_id),
        global.SchoolSafePedagogyAPI.getAssignmentGrades(assignmentId),
      ]);
      state.assignmentStudents = results[0] || [];
      state.assignmentGrades = results[1] || [];
      state.gradeDrafts = {};
    } catch (e) {
      notify(e.message || "Erreur de chargement des élèves/cotes");
      state.assignmentStudents = [];
      state.assignmentGrades = [];
      state.gradeDrafts = {};
    }
  }

  function getExistingGrade(studentId) {
    return state.assignmentGrades.find(function (g) { return g.student_id === studentId; });
  }

  function getGradeValue(studentId) {
    if (state.gradeDrafts[studentId] && state.gradeDrafts[studentId].value !== undefined) {
      return state.gradeDrafts[studentId].value;
    }
    var existing = getExistingGrade(studentId);
    if (!existing) return "";
    return existing.value_numeric !== null && existing.value_numeric !== undefined
      ? String(existing.value_numeric)
      : (existing.value_text || "");
  }

  async function loadParentView() {
    if (demoState) {
      state.parentChildren = demoState.parentChildren;
      state.selectedParentChildId = demoState.selectedParentChildId;
      state.parentGrades = demoState.parentGrades;
      state.parentAverages = demoState.parentAverages;
      return;
    }
    try {
      state.parentChildren = await global.SchoolSafePedagogyAPI.getParentChildren();
      if (state.parentChildren.length > 0 && !state.selectedParentChildId) {
        state.selectedParentChildId = state.parentChildren[0].students.id;
      }
      if (state.selectedParentChildId) {
        var gradesResult = await global.SchoolSafePedagogyAPI.getStudentGradesForParent(state.selectedParentChildId);
        state.parentGrades = gradesResult.grades || [];
        var averagesResult = await global.SchoolSafePedagogyAPI.computeStudentAverages(state.selectedParentChildId);
        state.parentAverages = averagesResult.averages || null;
      } else {
        state.parentGrades = [];
        state.parentAverages = null;
      }
    } catch (e) {
      notify(e.message || "Erreur de chargement de la vue parent");
      state.parentChildren = [];
      state.parentGrades = [];
      state.parentAverages = null;
    }
  }

  async function submitGrades(assignmentId, publish) {
    var assignment = state.assignments.find(function (a) { return a.id === assignmentId; });
    if (!assignment) return;

    var grades = [];
    for (var i = 0; i < state.assignmentStudents.length; i++) {
      var student = state.assignmentStudents[i];
      var draft = state.gradeDrafts[student.id] || {};
      var existing = getExistingGrade(student.id);
      var rawValue = draft.value !== undefined ? draft.value : getGradeValue(student.id);
      if (rawValue === "" && !existing) continue;
      if (rawValue === "" && existing) continue;

      var grade = { student_id: student.id };
      if (assignment.scale_mode === "numeric") {
        grade.value_numeric = Number(rawValue);
        grade.normalized_value = Number(rawValue);
      } else {
        grade.value_text = String(rawValue);
      }
      if (draft.comment !== undefined) grade.comment = draft.comment;
      else if (existing && existing.comment) grade.comment = existing.comment;
      if (draft.change_reason !== undefined) grade.change_reason = draft.change_reason;
      else if (existing && existing.change_reason) grade.change_reason = existing.change_reason;
      if (publish) grade.status = "published";

      grades.push(grade);
    }

    try {
      await global.SchoolSafePedagogyAPI.saveGrades(assignmentId, grades);
      if (publish) {
        await global.SchoolSafePedagogyAPI.publishGrades(assignmentId);
        notify("Cotes publiées.");
      } else {
        notify("Cotes enregistrées.");
      }
      await loadAssignmentStudentsAndGrades(assignmentId);
      render();
    } catch (e) {
      notify(e.message || "Erreur d’enregistrement des cotes");
    }
  }

  function assignmentTypeLabel(type) {
    return { homework: "Devoir", quiz: "Interrogation", exam: "Examen", compensatory: "Activité compensatoire" }[type] || type;
  }

  function languageLabel(lang) {
    return lang === "EN" ? "Anglais" : "Français";
  }

  function renderTabs() {
    var tabs = [
      { key: "subjects", label: "Matières", icon: "book-open" },
      { key: "assignments", label: "Devoirs", icon: "notebook-pen" },
      { key: "lesson-plans", label: "Cahier de préparation", icon: "book-open-check" },
      { key: "parent-view", label: "Vue parent", icon: "users" },
    ];
    return '<nav class="pedagogy-tabs" aria-label="Fonctions pédagogiques">' +
      tabs.map(function (tab) {
        return '<button class="' + (state.activeTab === tab.key ? "active" : "") + '" type="button" data-pedagogy-tab="' + tab.key + '"><i data-lucide="' + tab.icon + '"></i><span>' + tab.label + '</span></button>';
      }).join("") +
      '</nav>';
  }

  function renderSubjects() {
    var rows = state.subjects.map(function (s) {
      return '<tr><td><b>' + escapeMarkup(s.name) + '</b></td><td>' + escapeMarkup(s.code) + '</td><td>' + languageLabel(s.language) + '</td><td>' + escapeMarkup(s.cycle_key) + '</td><td>' + (s.subject_family_code ? escapeMarkup(s.subject_family_code) : "—") + '</td></tr>';
    }).join("");

    return '<section class="pedagogy-panel"><header class="panel-heading"><div><span>Référentiel</span><h3>Matières de l’école</h3></div><i data-lucide="book-open"></i></header>' +
      '<form class="pedagogy-form" id="subjectForm"><div class="pedagogy-form-grid compact">' +
      '<label>Code<input name="code" required placeholder="MATH"></label>' +
      '<label>Nom<input name="name" required placeholder="Mathématiques FR"></label>' +
      '<label>Langue<select name="language"><option value="FR">Français</option><option value="EN">Anglais</option></select></label>' +
      '<label>Cycle<select name="cycle_key"><option value="nursery">Maternelle</option><option value="primary">Primaire</option><option value="secondary">Secondaire</option></select></label>' +
      '<label>Famille (optionnel)<input name="subject_family_code" placeholder="MATH"></label>' +
      '</div><footer>' + ssButton({ label: "Ajouter la matière", variant: "primary", type: "submit", icon: "plus" }) + '</footer></form>' +
      ssTable({
        headers: ["Nom", "Code", "Langue", "Cycle", "Famille"],
        rows: rows,
        empty: "Aucune matière enregistrée.",
        emptyTitle: "Matières",
        responsive: true
      }) + '</section>';
  }

  function renderAssignments() {
    var selected = state.assignments.find(function (a) { return a.id === state.selectedAssignmentId; }) || state.assignments[0] || null;
    var list = state.assignments.map(function (a) {
      return '<button class="assignment-row' + (selected && selected.id === a.id ? " active" : "") + '" type="button" data-assignment-id="' + a.id + '"><span><b>' + escapeMarkup(a.title) + '</b><small>' + escapeMarkup((a.classes ? a.classes.name : a.class_id) + " · " + (a.subjects ? a.subjects.name : a.subject_id)) + '</small></span>' + ssBadge({ label: a.status === "published" ? "Publié" : "Brouillon", variant: a.status === "published" ? "success" : "warning" }) + '</button>';
    }).join("");

    var detail = "";
    if (selected) {
      var pdfButtons = hasPdfPermission(getCurrentUser(), selected) ?
        '<div class="pdf-actions">' + ssButton({ label: "Aperçu PDF", variant: "secondary", icon: "eye", attrs: { "data-preview-assignment": selected.id } }) +
        ssButton({ label: "Télécharger PDF", variant: "secondary", icon: "download", attrs: { "data-download-assignment": selected.id } }) +
        ssButton({ label: "Imprimer", variant: "secondary", icon: "printer", attrs: { "data-print-assignment": selected.id } }) +
        ssButton({ label: "Feuille de réponses", variant: "secondary", icon: "file-text", attrs: { "data-download-answer-sheet": selected.id } }) + '</div>' : '';
      detail = '<article class="assignment-detail"><div><span class="subject-tag">' + escapeMarkup((selected.subjects ? selected.subjects.name : selected.subject_id) + " · " + selected.language) + '</span><h3>' + escapeMarkup(selected.title) + '</h3><p>' + escapeMarkup(selected.instructions || "Aucune consigne.") + '</p></div><dl>' +
        '<div><dt>Échéance</dt><dd>' + escapeMarkup(selected.due_date || "Non planifiée") + '</dd></div>' +
        '<div><dt>Barème</dt><dd>' + escapeMarkup(selected.scale_label || (selected.scale_max ? "/" + selected.scale_max : "Qualitatif")) + '</dd></div>' +
        '<div><dt>Coefficient</dt><dd>' + escapeMarkup(String(selected.coefficient || 1)) + '</dd></div>' +
        '<div><dt>Publication</dt><dd>' + (selected.status === "published" ? "Visible" : "Brouillon") + '</dd></div>' +
        '</dl>' + pdfButtons + '<div class="assignment-detail-actions">' +
        (selected.status === "draft" ? ssButton({ label: "Publier le devoir", variant: "primary", icon: "send", attrs: { "data-publish-assignment": selected.id } }) : '') +
        '</div></article>';
    }

    var composer = renderAssignmentComposer();

    var gradingPanel = "";
    if (selected) {
      gradingPanel = renderGradingPanel(selected);
    }

    return '<div class="pedagogy-two-column assignment-layout"><section class="pedagogy-panel"><header class="panel-heading"><div><span>Travaux</span><h3>Devoirs et évaluations</h3></div><b>' + state.assignments.length + '</b></header><div class="assignment-list">' + (list || global.ssState({ type: "empty", title: "Aucun devoir", message: "Aucun devoir n'a été créé pour le moment.", size: "compact" })) + '</div>' + detail + '</section>' + (gradingPanel || composer) + '</div>';
  }

  function renderAssignmentComposer() {
    return '<form class="pedagogy-form assignment-composer" id="assignmentForm" enctype="multipart/form-data"><div class="form-section-title"><span><i data-lucide="file-pen-line"></i></span><div><h3>Composer un devoir</h3></div></div>' +
      '<div class="assignment-mode-selector" role="group" aria-label="Mode de devoir">' +
      '<label><input type="radio" name="assignment_mode" value="text" checked> Texte SchoolSafe</label>' +
      '<label><input type="radio" name="assignment_mode" value="pdf"> Importer un PDF</label>' +
      '<label><input type="radio" name="assignment_mode" value="photo"> Importer une photo</label>' +
      '</div>' +
      '<div class="pedagogy-form-grid">' +
      '<label>Titre<input name="title" required placeholder="Titre du devoir"></label>' +
      '<label>Classe<select name="class_id" id="assignmentClassSelect">' + state.classes.map(function (c) { return '<option value="' + c.id + '">' + escapeMarkup(c.name) + '</option>'; }).join("") + '</select></label>' +
      '<label>Matière<select name="subject_id" id="assignmentSubjectSelect">' + state.subjects.map(function (s) { return '<option value="' + s.id + '">' + escapeMarkup(s.name) + '</option>'; }).join("") + '</select></label>' +
      '<label>Langue<select name="language"><option value="FR">Français</option><option value="EN">Anglais</option></select></label>' +
      '<label>Type<select name="type"><option value="homework">Devoir</option><option value="quiz">Interrogation</option><option value="exam">Examen</option><option value="compensatory">Activité compensatoire</option></select></label>' +
      '<label>Mode d’échelle<select name="scale_mode"><option value="numeric">Numérique</option><option value="qualitative">Qualitative</option><option value="custom">Libre</option></select></label>' +
      '<label>Barème max / libellé<input name="scale_label" placeholder="/20, %, Acquis…"></label>' +
      '<label>Coefficient<input name="coefficient" type="number" step="0.1" min="0" value="1"></label>' +
      '<label>Date de remise<input name="due_date" type="date"></label>' +
      '<label class="wide">Prérequis<textarea name="prerequisites" rows="2"></textarea></label>' +
      '<label class="wide">Consignes<textarea name="instructions" rows="3"></textarea></label>' +
      '</div>' +
      '<div class="assignment-upload-zone" id="assignmentUploadZone" hidden>' +
      '<label class="wide">Fichier<input type="file" name="uploaded_file" id="assignmentFileInput"></label>' +
      '<div id="assignmentUploadPreview" class="upload-preview"></div>' +
      '</div>' +
      '<div class="assignment-questions-zone" id="assignmentQuestionsZone">' +
      '<div class="form-section-title"><span><i data-lucide="list-ordered"></i></span><div><h4>Questions</h4></div></div>' +
      '<div id="assignmentQuestionsList"></div>' +
      ssButton({ label: "Ajouter une question", variant: "secondary", icon: "plus", attrs: { id: "addQuestionButton" } }) +
      '</div>' +
      '<footer>' + ssButton({ label: "Enregistrer en brouillon", variant: "secondary", type: "submit", icon: "save", attrs: { "data-draft": "true" } }) + ssButton({ label: "Publier", variant: "primary", type: "submit", icon: "send", attrs: { "data-publish": "true" } }) + '</footer></form>';
  }

  function renderGradingPanel(selected) {
    var rows = state.assignmentStudents.map(function (s) {
      var existing = getExistingGrade(s.id);
      var isPublished = existing && existing.status === "published";
      var value = getGradeValue(s.id);
      var draft = state.gradeDrafts[s.id] || {};
      var inputType = selected.scale_mode === "numeric" ? "number" : "text";
      var step = selected.scale_mode === "numeric" ? ' step="0.01"' : "";
      var maxAttr = selected.scale_max ? ' max="' + selected.scale_max + '"' : "";
      var commentValue = draft.comment !== undefined ? draft.comment : (existing && existing.comment ? existing.comment : "");
      var reasonValue = draft.change_reason !== undefined ? draft.change_reason : "";

      return '<tr data-student-id="' + s.id + '">' +
        '<td><b>' + escapeMarkup(s.last_name || "") + '</b> ' + escapeMarkup(s.first_name || "") + '</td>' +
        '<td>' + escapeMarkup(s.matricule || "—") + '</td>' +
        '<td><input type="' + inputType + '"' + step + maxAttr + ' value="' + escapeMarkup(value) + '" data-grade-input="' + s.id + '"' + (isPublished ? ' data-published="true"' : "") + '></td>' +
        '<td><input type="text" placeholder="Commentaire" value="' + escapeMarkup(commentValue) + '" data-grade-comment="' + s.id + '"></td>' +
        '<td>' + (isPublished ? '<input type="text" placeholder="Motif de modification" value="' + escapeMarkup(reasonValue) + '" data-grade-reason="' + s.id + '" required>' : '—') + '</td>' +
        '<td>' + (isPublished ? ssBadge({ label: "Publié", variant: "success" }) : (existing ? ssBadge({ label: "Brouillon", variant: "warning" }) : ssBadge({ label: "—", variant: "default" }))) + '</td>' +
        '</tr>';
    }).join("");

    return '<section class="pedagogy-panel grading-panel"><header class="panel-heading"><div><span>Cotation</span><h3>Saisir les cotes · ' + escapeMarkup(selected.title) + '</h3></div><b>' + state.assignmentStudents.length + '</b></header>' +
      ssTable({
        headers: ["Élève", "Matricule", "Cote", "Commentaire", "Motif", "Statut"],
        rows: rows,
        empty: "Aucun élève dans cette classe.",
        emptyTitle: "Cotation",
        responsive: true
      }) +
      '<footer class="grading-actions">' +
      ssButton({ label: "Enregistrer les cotes", variant: "secondary", icon: "save", attrs: { "data-save-grades": selected.id } }) +
      ssButton({ label: "Publier les cotes", variant: "primary", icon: "send", attrs: { "data-publish-grades": selected.id } }) +
      '</footer></section>';
  }

  function renderParentView() {
    var childrenList = state.parentChildren.map(function (g) {
      var s = g.students;
      return '<button class="assignment-row' + (state.selectedParentChildId === s.id ? " active" : "") + '" type="button" data-parent-child-id="' + s.id + '"><span><b>' + escapeMarkup(s.last_name || "") + '</b> ' + escapeMarkup(s.first_name || "") + '</span><small>' + escapeMarkup(s.matricule || "") + '</small></button>';
    }).join("");

    var gradesRows = state.parentGrades.map(function (g) {
      var assignment = g.assignments || {};
      var subject = assignment.subjects || {};
      var value = g.value_numeric !== null && g.value_numeric !== undefined ? g.value_numeric : (g.value_text || "—");
      return '<tr><td><b>' + escapeMarkup(assignment.title || "—") + '</b></td><td>' + escapeMarkup(subject.name || "—") + '</td><td>' + escapeMarkup(assignment.type || "—") + '</td><td>' + escapeMarkup(String(value)) + '</td><td>' + escapeMarkup(g.comment || "—") + '</td></tr>';
    }).join("");

    var averagesSection = "";
    if (state.parentAverages) {
      var avgRows = state.parentAverages.subjects.map(function (s) {
        return '<tr><td><b>' + escapeMarkup(s.subject_name) + '</b></td><td>' + escapeMarkup(String(s.average !== null ? s.average : "—")) + '</td><td>' + escapeMarkup(String(s.grade_count)) + '</td></tr>';
      }).join("");
      averagesSection = '<section class="pedagogy-panel"><header class="panel-heading"><div><span>Moyennes</span><h3>Bulletin simplifié</h3></div><b>' + (state.parentAverages.overall_average !== null ? escapeMarkup(String(state.parentAverages.overall_average)) : "—") + '</b></header>' +
        ssTable({
          headers: ["Matière", "Moyenne", "Nb cotes"],
          rows: avgRows,
          empty: "Aucune moyenne calculable.",
          emptyTitle: "Moyennes",
          responsive: true
        }) + '</section>';
    }

    return '<div class="pedagogy-two-column assignment-layout"><section class="pedagogy-panel"><header class="panel-heading"><div><span>Enfants</span><h3>Mes enfants</h3></div><b>' + state.parentChildren.length + '</b></header><div class="assignment-list">' + (childrenList || global.ssState({ type: "empty", title: "Aucun enfant lié", message: "Aucun enfant n'est lié à ce compte.", size: "compact" })) + '</div></section>' +
      '<div class="pedagogy-stack">' +
      '<section class="pedagogy-panel"><header class="panel-heading"><div><span>Cotes publiées</span><h3>Devoirs et évaluations</h3></div><b>' + state.parentGrades.length + '</b></header>' +
      ssTable({
        headers: ["Devoir", "Matière", "Type", "Cote", "Commentaire"],
        rows: gradesRows,
        empty: "Aucune cote publiée pour cet élève.",
        emptyTitle: "Cotes publiées",
        responsive: true
      }) + '</section>' +
      averagesSection +
      '</div></div>';
  }

  function renderLessonPlans() {
    var rows = state.lessonPlans.map(function (p) {
      return '<tr data-lesson-plan-id="' + p.id + '"><td><b>' + escapeMarkup(p.title) + '</b></td><td>' + escapeMarkup(p.lesson_date) + '</td><td>' + escapeMarkup((p.classes ? p.classes.name : p.class_id)) + '</td><td>' + escapeMarkup((p.subjects ? p.subjects.name : p.subject_id)) + '</td><td>' + escapeMarkup((p.profiles ? p.profiles.display_name : p.teacher_id)) + '</td></tr>';
    }).join("");

    return '<section class="pedagogy-panel"><header class="panel-heading"><div><span>Cahier de préparation</span><h3>Leçons planifiées</h3></div><i data-lucide="book-open-check"></i></header>' +
      '<form class="pedagogy-form" id="lessonPlanForm"><div class="pedagogy-form-grid">' +
      '<label>Titre<input name="title" required placeholder="Titre de la leçon"></label>' +
      '<label>Date<input name="lesson_date" type="date" required></label>' +
      '<label>Classe<select name="class_id">' + state.classes.map(function (c) { return '<option value="' + c.id + '">' + escapeMarkup(c.name) + '</option>'; }).join("") + '</select></label>' +
      '<label>Matière<select name="subject_id">' + state.subjects.map(function (s) { return '<option value="' + s.id + '">' + escapeMarkup(s.name) + '</option>'; }).join("") + '</select></label>' +
      '<label class="wide">Objectifs<textarea name="objectives" rows="2"></textarea></label>' +
      '<label class="wide">Matériel<textarea name="materials" rows="2"></textarea></label>' +
      '<label class="wide">Déroulement<textarea name="procedure" rows="4"></textarea></label>' +
      '</div><footer>' + ssButton({ label: "Ajouter la leçon", variant: "primary", type: "submit", icon: "plus" }) + '</footer></form>' +
      ssTable({
        headers: ["Titre", "Date", "Classe", "Matière", "Enseignant"],
        rows: rows,
        empty: "Aucune leçon enregistrée.",
        emptyTitle: "Leçons planifiées",
        responsive: true
      }) + '</section>';
  }

  function render(containerId, options) {
    options = options || {};
    if (options.tab) state.activeTab = options.tab;
    var container = document.getElementById(containerId || "pedagogyContent");
    if (!container) return;
    var content = state.loading ? global.ssState({ type: "loading", title: "Chargement…", message: "Veuillez patienter pendant le chargement des données." }) : (state.error ? global.ssState({ type: "error", title: "Erreur", message: state.error }) : "");
    if (!state.loading && !state.error) {
      if (state.activeTab === "subjects") content = renderSubjects();
      else if (state.activeTab === "assignments") content = renderAssignments();
      else if (state.activeTab === "lesson-plans") content = renderLessonPlans();
      else if (state.activeTab === "parent-view") content = renderParentView();
    }
    var contentContainer = document.getElementById("pedagogyModuleContent");
    if (contentContainer) {
      contentContainer.innerHTML = content;
    } else {
      container.innerHTML = content;
    }
    bindEvents();
    refreshIcons();
  }

  function bindEvents() {
    document.querySelectorAll("#pedagogyContent [data-pedagogy-tab]").forEach(function (button) {
      button.addEventListener("click", async function () {
        state.activeTab = button.getAttribute("data-pedagogy-tab");
        if (state.activeTab === "parent-view") {
          await loadParentView();
        }
        render();
      });
    });

    document.querySelectorAll("#pedagogyContent [data-parent-child-id]").forEach(function (button) {
      button.addEventListener("click", async function () {
        state.selectedParentChildId = button.getAttribute("data-parent-child-id");
        await loadParentView();
        render();
      });
    });

    document.querySelectorAll("#pedagogyContent [data-assignment-id]").forEach(function (button) {
      button.addEventListener("click", async function () {
        state.selectedAssignmentId = button.getAttribute("data-assignment-id");
        await loadAssignmentStudentsAndGrades(state.selectedAssignmentId);
        render();
      });
    });

    document.querySelectorAll("#pedagogyContent [data-publish-assignment]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var id = button.getAttribute("data-publish-assignment");
        try {
          await global.SchoolSafePedagogyAPI.publishAssignment(id);
          notify("Devoir publié.");
          await loadAll();
        } catch (e) {
          notify(e.message || "Erreur de publication");
        }
      });
    });

    document.querySelectorAll("#pedagogyContent [data-grade-input]").forEach(function (input) {
      input.addEventListener("input", function () {
        var studentId = input.getAttribute("data-grade-input");
        if (!state.gradeDrafts[studentId]) state.gradeDrafts[studentId] = {};
        state.gradeDrafts[studentId].value = input.value;
      });
    });

    document.querySelectorAll("#pedagogyContent [data-grade-comment]").forEach(function (input) {
      input.addEventListener("input", function () {
        var studentId = input.getAttribute("data-grade-comment");
        if (!state.gradeDrafts[studentId]) state.gradeDrafts[studentId] = {};
        state.gradeDrafts[studentId].comment = input.value;
      });
    });

    document.querySelectorAll("#pedagogyContent [data-grade-reason]").forEach(function (input) {
      input.addEventListener("input", function () {
        var studentId = input.getAttribute("data-grade-reason");
        if (!state.gradeDrafts[studentId]) state.gradeDrafts[studentId] = {};
        state.gradeDrafts[studentId].change_reason = input.value;
      });
    });

    document.querySelectorAll("#pedagogyContent [data-save-grades]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var assignmentId = button.getAttribute("data-save-grades");
        await submitGrades(assignmentId, false);
      });
    });

    document.querySelectorAll("#pedagogyContent [data-publish-grades]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var assignmentId = button.getAttribute("data-publish-grades");
        await submitGrades(assignmentId, true);
      });
    });

    // DOC-03 — Document Engine actions for assignments
    document.querySelectorAll("#pedagogyContent [data-preview-assignment]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var id = button.getAttribute("data-preview-assignment");
        await generateAssignmentDocument(id, { preview: true });
      });
    });
    document.querySelectorAll("#pedagogyContent [data-download-assignment]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var id = button.getAttribute("data-download-assignment");
        await generateAssignmentDocument(id, { preview: false });
      });
    });
    document.querySelectorAll("#pedagogyContent [data-print-assignment]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var id = button.getAttribute("data-print-assignment");
        await generateAssignmentDocument(id, { print: true });
      });
    });
    document.querySelectorAll("#pedagogyContent [data-download-answer-sheet]").forEach(function (button) {
      button.addEventListener("click", async function () {
        var id = button.getAttribute("data-download-answer-sheet");
        await generateAssignmentDocument(id, { answerSheet: true });
      });
    });

    var subjectForm = document.getElementById("subjectForm");
    if (subjectForm) {
      subjectForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        var data = new FormData(subjectForm);
        try {
          await global.SchoolSafePedagogyAPI.createSubject({
            code: String(data.get("code")),
            name: String(data.get("name")),
            language: String(data.get("language")),
            cycle_key: String(data.get("cycle_key")),
            subject_family_code: String(data.get("subject_family_code") || ""),
          });
          subjectForm.reset();
          notify("Matière créée.");
          await loadAll();
        } catch (e) {
          notify(e.message || "Erreur de création");
        }
      });
    }

    var assignmentForm = document.getElementById("assignmentForm");
    if (assignmentForm) {
      bindAssignmentComposer(assignmentForm);
      assignmentForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!assignmentForm.reportValidity()) return;
        var data = new FormData(assignmentForm);
        var submitter = event.submitter;
        var published = submitter && submitter.getAttribute("data-publish") === "true";
        try {
          var questions = collectAssignmentQuestions(assignmentForm);
          var mode = String(data.get("assignment_mode") || "text");
          var payload = {
            class_id: String(data.get("class_id")),
            subject_id: String(data.get("subject_id")),
            title: String(data.get("title")),
            type: String(data.get("type")),
            scale_mode: String(data.get("scale_mode")),
            scale_label: String(data.get("scale_label") || ""),
            coefficient: Number(data.get("coefficient") || 1),
            due_date: data.get("due_date") ? String(data.get("due_date")) : undefined,
            prerequisites: String(data.get("prerequisites") || ""),
            instructions: String(data.get("instructions") || ""),
            language: String(data.get("language")),
            mode: mode,
            questions: questions,
          };
          var fileInput = document.getElementById("assignmentFileInput");
          if (mode !== "text" && fileInput && fileInput.files && fileInput.files[0]) {
            // Frontend-only : en mode démo on conserve le fichier en base64 pour prototypage/QA.
            // En mode réel on n'envoie jamais de base64 au backend ; l'upload fera l'objet d'un
            // traitement backend distinct (BE-NEED documenté dans BACKEND_LATER.md).
            if (isDemoMode()) {
              payload.uploaded_file = await readFileAsDataUrl(fileInput.files[0]);
              payload.uploaded_file_name = fileInput.files[0].name;
              payload.uploaded_file_type = fileInput.files[0].type;
            } else {
              payload.uploaded_file_name = fileInput.files[0].name;
              payload.uploaded_file_type = fileInput.files[0].type;
              notify("Fichier sélectionné : l'upload officiel nécessitera le backend (DOC-03).");
            }
          }
          var assignment = await global.SchoolSafePedagogyAPI.createAssignment(payload);
          if (published) {
            await global.SchoolSafePedagogyAPI.publishAssignment(assignment.id);
          }
          assignmentForm.reset();
          notify(published ? "Devoir publié." : "Devoir enregistré.");
          await loadAll();
        } catch (e) {
          notify(e.message || "Erreur de création");
        }
      });
    }

    var lessonPlanForm = document.getElementById("lessonPlanForm");
    if (lessonPlanForm) {
      lessonPlanForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!lessonPlanForm.reportValidity()) return;
        var data = new FormData(lessonPlanForm);
        try {
          await global.SchoolSafePedagogyAPI.createLessonPlan({
            class_id: String(data.get("class_id")),
            subject_id: String(data.get("subject_id")),
            title: String(data.get("title")),
            lesson_date: String(data.get("lesson_date")),
            objectives: String(data.get("objectives") || ""),
            materials: String(data.get("materials") || ""),
            procedure: String(data.get("procedure") || ""),
          });
          lessonPlanForm.reset();
          notify("Leçon ajoutée.");
          await loadAll();
        } catch (e) {
          notify(e.message || "Erreur de création");
        }
      });
    }
  }

  function bindAssignmentComposer(form) {
    var modeInputs = form.querySelectorAll('input[name="assignment_mode"]');
    var uploadZone = document.getElementById("assignmentUploadZone");
    var questionsZone = document.getElementById("assignmentQuestionsZone");
    var addButton = document.getElementById("addQuestionButton");
    var fileInput = document.getElementById("assignmentFileInput");
    var preview = document.getElementById("assignmentUploadPreview");

    function updateMode() {
      var mode = form.querySelector('input[name="assignment_mode"]:checked');
      var value = mode ? mode.value : "text";
      if (value === "text") {
        if (uploadZone) uploadZone.hidden = true;
        if (questionsZone) questionsZone.hidden = false;
      } else {
        if (uploadZone) uploadZone.hidden = false;
        if (questionsZone) questionsZone.hidden = true;
      }
    }

    modeInputs.forEach(function (input) {
      input.addEventListener("change", updateMode);
    });
    updateMode();

    if (addButton) {
      addButton.addEventListener("click", function () {
        var list = document.getElementById("assignmentQuestionsList");
        if (!list) return;
        var index = list.children.length;
        var row = document.createElement("div");
        row.className = "assignment-question-row";
        row.innerHTML = '<textarea name="question_text_' + index + '" rows="2" placeholder="Texte de la question" required></textarea>' +
          '<input type="number" name="question_points_' + index + '" placeholder="Points" min="0" step="0.5">' +
          '<input type="text" name="question_answer_space_' + index + '" placeholder="Espace réponse (ex: 8 lignes)">' +
          ssIconButton({ icon: "trash-2", title: "Supprimer", attrs: { "data-remove-question": true } });
        list.appendChild(row);
        refreshIcons();
        row.querySelector("[data-remove-question]").addEventListener("click", function () {
          row.remove();
        });
      });
    }

    if (fileInput) {
      fileInput.addEventListener("change", function () {
        if (!preview) return;
        preview.innerHTML = "";
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (file.type.startsWith("image/")) {
          var img = document.createElement("img");
          img.style.maxWidth = "200px";
          img.style.maxHeight = "200px";
          img.src = URL.createObjectURL(file);
          preview.appendChild(img);
        } else if (file.type === "application/pdf") {
          var note = document.createElement("p");
          note.textContent = "PDF sélectionné : " + file.name;
          preview.appendChild(note);
        } else {
          var err = document.createElement("p");
          err.className = "error-text";
          err.textContent = "Format non supporté. Utilisez PDF ou image.";
          preview.appendChild(err);
          fileInput.value = "";
        }
      });
    }
  }

  function collectAssignmentQuestions(form) {
    var list = form.querySelector("#assignmentQuestionsList");
    if (!list) return [];
    var questions = [];
    Array.from(list.children).forEach(function (row, index) {
      var text = row.querySelector('textarea[name^="question_text_"]').value;
      var points = row.querySelector('input[name^="question_points_"]').value;
      var answerSpace = row.querySelector('input[name^="question_answer_space_"]').value;
      if (text.trim()) {
        questions.push({
          text: text,
          points: points ? Number(points) : undefined,
          answerSpace: answerSpace || undefined,
        });
      }
    });
    return questions;
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  async function generateAssignmentDocument(assignmentId, options) {
    options = options || {};
    var user = getCurrentUser();
    user.permissions = getUserPermissions(user);

    var assignment = state.assignments.find(function (a) { return a.id === assignmentId; });
    if (!assignment) {
      notify("Devoir introuvable.");
      return;
    }
    if (!canUseAssignmentDocument(user, assignment)) {
      notify("Document non autorisé pour cette classe et cette session.");
      return;
    }

    var subjectName = assignment.subjects ? assignment.subjects.name : assignment.subject_id;
    var className = assignment.classes ? assignment.classes.name : assignment.class_id;

    try {
      var engine = await getDocumentEngine();
      var request = {
        id: "doc-req-" + Date.now(),
        documentType: options.answerSheet ? "answer-sheet" : "assignment",
        sourceModule: "pedagogy",
        action: options.preview ? "preview" : "download",
        formats: ["pdf"],
        origin: "generated",
        context: {
          title: assignment.title,
          subjectName: subjectName,
          className: className,
          teacherName: user.name || user.displayName || user.role,
          dueDate: assignment.due_date,
          type: assignment.type,
          scaleLabel: assignment.scale_label || (assignment.scale_max ? "/" + assignment.scale_max : ""),
          coefficient: assignment.coefficient,
          instructions: assignment.instructions,
          questions: Array.isArray(assignment.questions) ? assignment.questions : [],
          studentFirstName: options.studentFirstName || "",
          studentLastName: options.studentLastName || "",
        },
        requestedBy: user,
        locale: assignment.language === "EN" ? "en-US" : "fr-FR",
      };

      // For uploaded mode, show native preview instead of generating a wrapper for now.
      if (assignment.mode === "pdf" || assignment.mode === "photo") {
        if (!assignment.uploaded_file) {
          notify("Aucun fichier importé pour ce devoir.");
          return;
        }
        if (options.preview) {
          openUploadedPreview(assignment);
          return;
        }
        notify("Téléchargement du fichier original.");
        downloadDataUrl(assignment.uploaded_file, assignment.uploaded_file_name || "fichier");
        return;
      }

      var result = await engine.generate(request);
      if (!result.ok) {
        notify("Génération refusée : " + (result.error || "accès interdit"));
        return;
      }
      var output = result.outputs && result.outputs.pdf;
      if (!output || output.ok === false) {
        notify("Erreur de génération PDF : " + (output && output.error ? output.error : "inconnue"));
        return;
      }

      if (options.preview) {
        openPdfPreview(output.objectUrl, assignment.title);
      } else if (options.print) {
        printPdf(output.objectUrl);
      } else {
        downloadBlob(output.blob, output.filename);
      }
    } catch (e) {
      console.error("[Pedagogy] generateAssignmentDocument error", e);
      notify("Erreur lors de la génération du document : " + (e.message || "inconnue"));
    }
  }

  function openPdfPreview(url, title) {
    window.ssModal({
      title: title || "Aperçu",
      size: "xl",
      content: '<div style="width:100%;height:70vh;min-height:320px;"><iframe src="' + escapeMarkup(url) + '" frameborder="0" style="width:100%;height:100%;border-radius:var(--ss-radius-md);"></iframe></div>',
      actions: [{ label: "Fermer", variant: "secondary" }]
    });
  }

  function openUploadedPreview(assignment) {
    if (assignment.mode === "photo") {
      openPdfPreview(assignment.uploaded_file, assignment.title);
    } else if (assignment.mode === "pdf") {
      openPdfPreview(assignment.uploaded_file, assignment.title);
    }
  }

  function printPdf(url) {
    var iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = function () {
      try {
        iframe.contentWindow.print();
      } catch (e) {
        notify("Impression non disponible dans ce navigateur.");
      }
      setTimeout(function () { iframe.remove(); }, 1000);
    };
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  function downloadDataUrl(dataUrl, filename) {
    var a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 100);
  }

  global.SchoolSafePedagogyModule = {
    canUseAssignmentDocument: canUseAssignmentDocument,
    render: function (containerId, options) {
      options = options || {};
      var container = document.getElementById(containerId || "pedagogyContent");
      if (!container) return;
      var wrapper = document.createElement("div");
      wrapper.innerHTML = renderTabs() + '<div id="pedagogyModuleContent"></div>';
      container.innerHTML = "";
      container.appendChild(wrapper);
      if (options.tab) {
        state.activeTab = options.tab;
        if (demoState) demoState.activeTab = options.tab;
      }
      loadAll();
    },
    renderTab: function (tab) {
      state.activeTab = tab;
      render();
    },
    load: loadAll,
    // Résumé démo calculé depuis les fixtures (dashboard executive KPI). null hors démo.
    getDemoSummary: function () {
      if (!demoState) return null;
      var subjects = demoState.subjects || [];
      var assignments = demoState.assignments || [];
      var teachers = [];
      (demoState.lessonPlans || []).forEach(function (plan) {
        var id = plan.teacher_id || (plan.profiles && plan.profiles.display_name) || "";
        if (id && teachers.indexOf(id) < 0) teachers.push(id);
      });
      var assigned = subjects.filter(function (subject) {
        return assignments.some(function (assignment) { return assignment.subject_id === subject.id; });
      });
      return { total: subjects.length, attribuees: assigned.length, nonAttribuees: subjects.length - assigned.length, enseignants: teachers.length };
    },
  };
})(window);
