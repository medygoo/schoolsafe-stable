(function (root) {
  "use strict";

  function academicClasses() {
    var structure = root.SchoolSafeAcademicStructure;
    var fallback = [
      { id: "demo-class-1", name: "6e A", levelId: "level-6" },
      { id: "demo-class-2", name: "5e A", levelId: "level-5" },
      { id: "demo-class-3", name: "3e Maternelle", levelId: "level-mat-3" },
      { id: "demo-class-4", name: "1re Secondaire B", levelId: "level-sec-1" }
    ];
    var classes = structure && typeof structure.getClasses === "function" ? structure.getClasses().filter(function (item) { return !item.isLocalDraft; }) : fallback;
    var levels = structure && typeof structure.getLevels === "function" ? structure.getLevels() : [];
    var rooms = { "demo-class-1": "B12", "demo-class-2": "C04", "demo-class-3": "M03", "demo-class-4": "D08" };
    return classes.map(function (source) {
      var level = levels.find(function (item) { return item.id === source.levelId; });
      return { id: source.id, name: source.name, cycle: level ? level.cycle : "Cycle à confirmer", room: rooms[source.id] || "À affecter" };
    });
  }

  var CLASSES = academicClasses();

  var SUBJECTS = [
    { id: "demo-subject-math", name: "Mathématiques", classIds: ["demo-class-1"] },
    { id: "demo-subject-french", name: "Français", classIds: ["demo-class-2"] },
    { id: "demo-subject-physics", name: "Sciences physiques", classIds: ["demo-class-3"] }
  ];

  var STUDENTS = [
    { id: "demo-student-lucas", name: "Lucas Martin", classId: "demo-class-1", lifecycleStatus: "active", attention: "Lecture des consignes" },
    { id: "demo-student-chloe", name: "Chloé Bernard", classId: "demo-class-1", lifecycleStatus: "active", attention: "Progression régulière" },
    { id: "demo-student-ethan", name: "Ethan Leroy", classId: "demo-class-2", lifecycleStatus: "active", attention: "Expression écrite" },
    { id: "demo-student-amina", name: "Amina Mbuyi", classId: "demo-class-1", lifecycleStatus: "draft", attention: "Dossier en préparation" },
    { id: "demo-student-foreign", name: "Noah Kasongo", classId: "demo-class-3", lifecycleStatus: "active", attention: "Hors périmètre" }
  ];

  var ASSIGNMENT_STORAGE_KEY = "schoolsafe-v2-teacher-assignment-drafts";
  var ASSIGNMENTS = [
    { id: "demo-assignment-fractions", title: "Fractions équivalentes", classId: "demo-class-1", subjectId: "demo-subject-math", instructions: "Résoudre les exercices 1 à 5.", publishOn: "2026-09-01", dueOn: "2026-09-08", workType: "Devoir", status: "PUBLIÉ", local: false },
    { id: "demo-assignment-reading", title: "Lecture expressive", classId: "demo-class-2", subjectId: "demo-subject-french", instructions: "Préparer une lecture de deux minutes.", publishOn: "2026-09-02", dueOn: "2026-09-09", workType: "Travail individuel", status: "À PUBLIER", local: true },
    { id: "demo-assignment-foreign", title: "Forces et mouvements", classId: "demo-class-3", subjectId: "demo-subject-physics", instructions: "Hors périmètre.", publishOn: "2026-09-01", dueOn: "2026-09-08", workType: "TP", status: "BROUILLON", local: false }
  ];
  var EVALUATION_STORAGE_KEY = "schoolsafe-v2-teacher-evaluation-drafts";
  var GRADE_STORAGE_KEY = "schoolsafe-v2-teacher-grade-drafts";
  var EVALUATIONS = [
    { id: "demo-evaluation-calcul", title: "Calcul mental", classId: "demo-class-1", subjectId: "demo-subject-math", type: "interrogation", date: "2026-09-05", scale: 10, coefficient: 1, instructions: "Calculs rapides sans calculatrice.", status: "BROUILLON", local: true },
    { id: "demo-evaluation-redaction", title: "Rédaction descriptive", classId: "demo-class-2", subjectId: "demo-subject-french", type: "devoir", date: "2026-09-06", scale: 20, coefficient: 1, instructions: "Décrire un lieu familier.", status: "À PRÉPARER", local: true },
    { id: "demo-evaluation-foreign", title: "Mécanique", classId: "demo-class-3", subjectId: "demo-subject-physics", type: "TP", date: "2026-09-07", scale: 20, coefficient: 2, instructions: "Hors périmètre.", status: "BROUILLON", local: false }
  ];
  var APPRECIATION_STORAGE_KEY = "schoolsafe-v2-teacher-appreciation-drafts";
  var RESULT_SUMMARIES = [
    { classId: "demo-class-1", subjectId: "demo-subject-math", monthlyAverage: "13,8 / 20", termAverage: "13,2 / 20", coverage: "82 %", source: "Devoirs · interrogations" },
    { classId: "demo-class-2", subjectId: "demo-subject-french", monthlyAverage: "12,6 / 20", termAverage: "12,9 / 20", coverage: "76 %", source: "Devoirs · travaux" },
    { classId: "demo-class-3", subjectId: "demo-subject-physics", monthlyAverage: "15,1 / 20", termAverage: "14,7 / 20", coverage: "91 %", source: "TP · examens" }
  ];
  var RANKING_SCORES = [
    { studentId: "demo-student-chloe", name: "Chloé Bernard", classId: "demo-class-1", score: 16.2 },
    { studentId: "demo-student-lucas", name: "Lucas Martin", classId: "demo-class-1", score: 14.8 },
    { studentId: "demo-student-ethan", name: "Ethan Leroy", classId: "demo-class-2", score: 13.6 },
    { studentId: "demo-student-foreign", name: "Noah Kasongo", classId: "demo-class-3", score: 17.4 }
  ];
  var TRACKING_STORAGE_KEY = "schoolsafe-v2-teacher-monthly-tracking-drafts";
  var MONTHLY_TRACKING = [
    { id: "demo-tracking-august", month: "2026-08", classId: "demo-class-1", subjectId: "demo-subject-math", objectives: "Consolider les opérations sur les nombres décimaux.", progress: 85, skills: "Calculer et expliquer une démarche.", collectiveDifficulty: "Alignement des décimales.", studentId: "", individualDifficulty: "", actions: "Atelier de correction guidée.", observation: "Progression collective satisfaisante.", status: "TERMINÉ", local: false },
    { id: "demo-tracking-foreign", month: "2026-08", classId: "demo-class-3", subjectId: "demo-subject-physics", objectives: "Hors périmètre.", progress: 50, skills: "Mesurer.", collectiveDifficulty: "Unités.", studentId: "demo-student-foreign", individualDifficulty: "Hors périmètre.", actions: "Aucune.", observation: "Hors périmètre.", status: "EN COURS", local: false }
  ];
  var REMEDIATION_STORAGE_KEY = "schoolsafe-v2-teacher-remediation-drafts";
  var REMEDIATIONS = [
    { id: "demo-remediation-chloe", studentId: "demo-student-chloe", classId: "demo-class-1", subjectId: "demo-subject-math", difficulty: "Automatiser les tables de multiplication.", objective: "Réduire le temps de résolution.", plannedSessions: 2, calendar: "2026-09-08, 2026-09-11", progress: 50, observations: "Exercices courts et répétés.", result: "Progression à confirmer.", status: "EN COURS", local: false },
    { id: "demo-remediation-foreign", studentId: "demo-student-foreign", classId: "demo-class-3", subjectId: "demo-subject-physics", difficulty: "Hors périmètre.", objective: "Hors périmètre.", plannedSessions: 1, calendar: "2026-09-10", progress: 0, observations: "Hors périmètre.", result: "Aucun.", status: "PROPOSÉ", local: false }
  ];
  var DIRECTION_REVIEW_STORAGE_KEY = "schoolsafe-v2-pedagogy-direction-reviews";

  var activeContainerId = null;
  var activeUser = null;
  var activeView = "dashboard";
  var selectedEvaluationId = null;
  var resultsPeriod = "monthly";
  var lastJaspeMessage = "";

  function escapeMarkup(value) {
    if (root.ssEscapeHtml) return root.ssEscapeHtml(value == null ? "" : String(value));
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
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
    if (root.SchoolSafeAccess && typeof root.SchoolSafeAccess.scopeFor === "function") return root.SchoolSafeAccess.scopeFor(user || {}, permission);
    var scopes = Array.isArray(user && user.scopes) ? user.scopes : [];
    return scopes.find(function (scope) { return scope && scope.permission === permission; }) || null;
  }

  function allowsScope(user, permission, expectedScope) {
    if (root.SchoolSafeAccess && typeof root.SchoolSafeAccess.allowsScope === "function") return root.SchoolSafeAccess.allowsScope(user || {}, permission, expectedScope);
    var scope = scopeFor(user, permission);
    return hasPermission(user, permission) && !!scope && scope.type === expectedScope;
  }

  function canUseJaspe(user) {
    return allowsScope(user, "safe.assistant.use", "own");
  }

  function canPrepareRemediation(user) {
    return allowsScope(user, "pedagogy.lesson-plan.manage", "assigned_classes");
  }

  function getAssignedProjection(user) {
    var canReadClasses = allowsScope(user, "school.class.read", "assigned_classes");
    var canReadSubjects = allowsScope(user, "pedagogy.subject.read", "assigned_subjects");
    if (!canReadClasses || !canReadSubjects) {
      return { allowed: false, classes: [], subjects: [], students: [] };
    }
    var classIds = Array.isArray(user && user.assignedClassIds) ? user.assignedClassIds : [];
    var subjectIds = Array.isArray(user && user.assignedSubjectIds) ? user.assignedSubjectIds : [];
    var classes = CLASSES.filter(function (item) { return classIds.indexOf(item.id) >= 0; });
    var subjects = SUBJECTS.filter(function (item) {
      return subjectIds.indexOf(item.id) >= 0 && item.classIds.some(function (classId) { return classIds.indexOf(classId) >= 0; });
    });
    var students = allowsScope(user, "school.student.read", "assigned_classes") ? STUDENTS.filter(function (item) {
      return item.lifecycleStatus === "active" && classIds.indexOf(item.classId) >= 0;
    }) : [];
    return { allowed: true, scopeType: "assigned", classes: classes, subjects: subjects, students: students };
  }

  function getDirectionProjection(user) {
    if (allowsScope(user, "pedagogy.report.read", "assigned_classes")) return getAssignedProjection(user);
    if (!allowsScope(user, "pedagogy.report.read", "school") || !allowsScope(user, "school.class.read", "school") || !allowsScope(user, "pedagogy.subject.read", "school")) {
      return { allowed: false, scopeType: "none", classes: [], subjects: [], students: [] };
    }
    var students = allowsScope(user, "school.student.read", "school") ? STUDENTS.filter(function (item) { return item.lifecycleStatus === "active"; }) : [];
    return { allowed: true, scopeType: "school", classes: CLASSES.slice(), subjects: SUBJECTS.slice(), students: students };
  }

  function icon(name) {
    return '<i data-lucide="' + name + '"></i>';
  }

  function normalizeText(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function jaspeRefusal(message) {
    return { allowed: false, refusal: true, message: "REFUS — " + message };
  }

  function answerJaspe(query, context) {
    var user = context && context.user ? context.user : activeUser;
    if (!user || !canUseJaspe(user)) return jaspeRefusal("safe.assistant.use avec scope own est obligatoire.");
    var projection = getAssignedProjection(user);
    if (!projection.allowed && canOpenDirection(user)) projection = getDirectionProjection(user);
    if (!projection.allowed) return jaspeRefusal("les permissions assigned_classes / assigned_subjects sont insuffisantes.");
    var text = normalizeText(query);
    var foreignClass = CLASSES.find(function (item) { return text.indexOf(normalizeText(item.name)) >= 0 && !projection.classes.some(function (allowed) { return allowed.id === item.id; }); });
    if (foreignClass) return jaspeRefusal("la classe " + foreignClass.name + " n’est pas affectée à cet utilisateur.");
    var foreignSubject = SUBJECTS.find(function (item) { return text.indexOf(normalizeText(item.name)) >= 0 && !projection.subjects.some(function (allowed) { return allowed.id === item.id; }); });
    if (foreignSubject) return jaspeRefusal("la matière " + foreignSubject.name + " n’est pas affectée à cet utilisateur.");
    if (/(change|changer|modifier|favoris|favoriser|mettre|publie|publier|valide|valider).*(palmares|classement)|(palmares|classement).*(change|changer|modifier|favoris|favoriser|publie|publier|valide|valider)/.test(text)) return jaspeRefusal("Jaspe ne peut jamais changer, publier, valider ni favoriser un palmarès ou classement.");
    if (/(publie|publier|publication|valide|valider|validation).*(devoir|travail|note|evaluation|bulletin|decision)|(devoir|travail|note|evaluation|bulletin|decision).*(publie|publier|publication|valide|valider|validation)|toutes les notes/.test(text)) return jaspeRefusal("la publication ou validation officielle est interdite à Jaspe — BACKEND_LATER.");
    if (/(modifie|modifier|change|changer).*(note|cotation)/.test(text)) {
      if (!allowsScope(user, "pedagogy.grade.manage", "assigned_classes")) return jaspeRefusal("pedagogy.grade.manage est absente ou explicitement refusée.");
      return { allowed: true, refusal: false, action: "evaluations", message: "Je peux ouvrir une saisie en BROUILLON LOCAL, sans modifier silencieusement ni publier la note." };
    }
    if (/(devoir|travail)/.test(text) && /(prepare|preparer|propose|creer)/.test(text)) {
      if (!allowsScope(user, "pedagogy.assignment.manage", "assigned_classes")) return jaspeRefusal("la préparation des devoirs n’est pas autorisée.");
      return { allowed: true, refusal: false, action: "assignments", message: "Formulaire ouvert pour préparer un BROUILLON LOCAL dans le périmètre affecté. La publication reste BACKEND_LATER." };
    }
    if (/evaluation|interrogation|examen|tp/.test(text) && /(prepare|preparer|propose|creer)/.test(text)) {
      if (!allowsScope(user, "pedagogy.grade.manage", "assigned_classes")) return jaspeRefusal("la préparation des évaluations n’est pas autorisée.");
      return { allowed: true, refusal: false, action: "evaluations", message: "Formulaire ouvert pour préparer une évaluation en BROUILLON LOCAL. Jaspe ne la publiera pas." };
    }
    if (/difficult/.test(text) && /(resume|resumer|synthese|affiche)/.test(text)) {
      if (!allowsScope(user, "pedagogy.lesson-plan.read", "assigned_classes")) return jaspeRefusal("le suivi des difficultés n’est pas visible.");
      return { allowed: true, refusal: false, action: "difficulties", message: "Résumé limité aux difficultés des classes affectées; aucun diagnostic officiel." };
    }
    if (/rattrapage|accompagnement/.test(text)) {
      if (!canPrepareRemediation(user)) return jaspeRefusal("pedagogy.lesson-plan.manage avec assigned_classes est nécessaire pour préparer ce brouillon local.");
      return { allowed: true, refusal: false, action: "remediation", message: "Plan de rattrapage proposé en BROUILLON LOCAL · BACKEND_LATER · PÉDAGOGIE UNIQUEMENT." };
    }
    if (canOpenDirection(user) && /pilotage|direction|synthese/.test(text)) return { allowed: true, refusal: false, action: "direction", message: "Synthèse limitée aux scopes pédagogiques réellement projetés." };
    return { allowed: true, refusal: false, action: null, message: "Je peux expliquer, résumer et préparer des brouillons dans " + projection.classes.map(function (item) { return item.name; }).join(", ") + "." };
  }

  function supportsJaspeContext(context) {
    var user = context && context.user;
    return !!(user && canUseJaspe(user) && (getAssignedProjection(user).allowed || getDirectionProjection(user).allowed));
  }

  function storageGet(key) {
    try { return root.localStorage.getItem(key); } catch (error) { return null; }
  }

  function storageSet(key, value) {
    try { root.localStorage.setItem(key, value); } catch (error) {}
  }

  function readAssignmentDrafts() {
    try {
      var parsed = JSON.parse(storageGet(ASSIGNMENT_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) { return []; }
  }

  function saveAssignmentDrafts(items) {
    storageSet(ASSIGNMENT_STORAGE_KEY, JSON.stringify(items));
  }

  function readJson(key, fallback) {
    try {
      var parsed = JSON.parse(storageGet(key) || "null");
      return parsed == null ? fallback : parsed;
    } catch (error) { return fallback; }
  }

  function readEvaluationDrafts() {
    var items = readJson(EVALUATION_STORAGE_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function saveEvaluationDrafts(items) {
    storageSet(EVALUATION_STORAGE_KEY, JSON.stringify(items));
  }

  function readGradeDrafts() {
    var drafts = readJson(GRADE_STORAGE_KEY, {});
    return drafts && typeof drafts === "object" && !Array.isArray(drafts) ? drafts : {};
  }

  function saveGradeDrafts(drafts) {
    storageSet(GRADE_STORAGE_KEY, JSON.stringify(drafts));
  }

  function readAppreciationDrafts() {
    var items = readJson(APPRECIATION_STORAGE_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function saveAppreciationDrafts(items) {
    storageSet(APPRECIATION_STORAGE_KEY, JSON.stringify(items));
  }

  function readTrackingDrafts() {
    var items = readJson(TRACKING_STORAGE_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function saveTrackingDrafts(items) {
    storageSet(TRACKING_STORAGE_KEY, JSON.stringify(items));
  }

  function readRemediationRecords() {
    var items = readJson(REMEDIATION_STORAGE_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function readRemediationDrafts() {
    return readRemediationRecords().filter(function (item) { return item.proposal !== true; });
  }

  function readRemediationProposals() {
    return readRemediationRecords().filter(function (item) { return item.proposal === true && item.officialEnrollment === false; });
  }

  function saveRemediationDrafts(items) {
    storageSet(REMEDIATION_STORAGE_KEY, JSON.stringify(items));
  }

  function readDirectionReviews() {
    var items = readJson(DIRECTION_REVIEW_STORAGE_KEY, []);
    return Array.isArray(items) ? items : [];
  }

  function saveDirectionReviews(items) {
    storageSet(DIRECTION_REVIEW_STORAGE_KEY, JSON.stringify(items));
  }

  function canOpenDirection(user) {
    return allowsScope(user, "pedagogy.report.read", "assigned_classes") || allowsScope(user, "pedagogy.report.read", "school");
  }

  function canReviewDirection(user) {
    return allowsScope(user, "pedagogy.report.manage", "assigned_classes") || allowsScope(user, "pedagogy.report.manage", "school");
  }

  function labelFor(items, id) {
    var found = items.find(function (item) { return item.id === id; });
    return found ? found.name : "Indisponible";
  }

  function renderDenied(container) {
    container.innerHTML = '<div class="teacher-pedagogy-state teacher-pedagogy-state--denied">' + icon("shield-off") +
      '<div><p class="teacher-eyebrow">ACCESS_LAW · DENY par défaut</p><h1>Accès pédagogique refusé</h1>' +
      '<p>Les permissions et portées assigned_classes / assigned_subjects sont obligatoires.</p></div></div>';
  }

  function renderOperationalState(container, type) {
    var states = {
      loading: ["loader-2", "Chargement de la projection pédagogique", "Les affectations autorisées sont en cours de projection."],
      error: ["triangle-alert", "Erreur de projection", "Les données ne peuvent pas être affichées. Réessayez sans élargir le scope."],
      empty: ["inbox", "Aucune affectation", "Aucune classe ou matière n’est actuellement projetée pour cet utilisateur."]
    };
    var state = states[type] || states.error;
    container.innerHTML = '<div class="teacher-pedagogy-state teacher-pedagogy-state--' + type + '">' + icon(state[0]) + '<div><p class="teacher-eyebrow">État pédagogique</p><h1>' + state[1] + '</h1><p>' + state[2] + '</p></div></div>';
  }

  function jaspeMarkup(projection) {
    var className = projection.classes[0] ? projection.classes[0].name : "la classe affectée";
    var subjectName = projection.subjects[0] ? projection.subjects[0].name : "la matière affectée";
    return '<section class="teacher-jaspe" aria-labelledby="teacherJaspeTitle"><button class="teacher-jaspe-launcher" type="button" data-open-jaspe="teacher" aria-label="Ouvrir Jaspe"><span aria-hidden="true">J2D</span><small>Ouvrir Jaspe</small></button><div class="teacher-jaspe-content"><p class="teacher-eyebrow">Assistant pédagogique borné</p><h2 id="teacherJaspeTitle">Jaspe prépare, l’utilisateur décide</h2><p>Devoir, évaluation, difficultés ou rattrapage — jamais de publication ni de contournement.</p><div class="teacher-jaspe-suggestions"><button type="button" data-teacher-jaspe-query="Prépare un devoir pour ' + escapeMarkup(className) + ' en ' + escapeMarkup(subjectName) + '">Préparer un devoir</button><button type="button" data-teacher-jaspe-query="Résume les difficultés de ' + escapeMarkup(className) + '">Résumer les difficultés</button></div><div class="teacher-jaspe-input"><input id="teacherJaspeInput" aria-label="Question à Jaspe sur la pédagogie" placeholder="Demander à Jaspe…"><button type="button" data-teacher-jaspe-send aria-label="Envoyer à Jaspe">' + icon("send") + '</button></div><p class="teacher-jaspe-response" data-teacher-jaspe-response>' + escapeMarkup(lastJaspeMessage || "En attente d’une demande autorisée.") + '</p></div></section>';
  }

  function bindJaspe(container) {
    function handle(query) {
      var context = root.SchoolSafeAppContext && root.SchoolSafeAppContext.getAssistantContext ? root.SchoolSafeAppContext.getAssistantContext() : { user: activeUser };
      var answer = answerJaspe(query, context);
      lastJaspeMessage = answer.message;
      if (answer.action) {
        open(answer.action);
        var shell = container.querySelector(".teacher-pedagogy-shell");
        if (shell) shell.insertAdjacentHTML("afterbegin", '<aside class="teacher-jaspe-inline" data-teacher-jaspe-response>' + escapeMarkup(answer.message) + '</aside>');
      } else {
        var response = container.querySelector("[data-teacher-jaspe-response]");
        if (response) response.textContent = answer.message;
      }
    }
    container.querySelectorAll("[data-teacher-jaspe-query]").forEach(function (button) { button.addEventListener("click", function () { handle(button.getAttribute("data-teacher-jaspe-query") || ""); }); });
    var input = container.querySelector("#teacherJaspeInput");
    var send = container.querySelector("[data-teacher-jaspe-send]");
    if (send) send.addEventListener("click", function () { handle(input && input.value); });
    if (input) input.addEventListener("keydown", function (event) { if (event.key === "Enter") handle(input.value); });
  }

  function dashboardCard(label, value, detail, iconName, target, state) {
    return '<button class="teacher-priority-card" type="button" data-teacher-open="' + target + '">' +
      '<span class="teacher-priority-icon">' + icon(iconName) + '</span><span><small>' + escapeMarkup(label) + '</small>' +
      '<strong>' + escapeMarkup(value) + '</strong><em>' + escapeMarkup(detail) + '</em></span>' +
      '<b>' + escapeMarkup(state || "PHASE D") + '</b></button>';
  }

  function renderDashboard(container, projection) {
    activeView = "dashboard";
    var classCards = projection.classes.map(function (item) {
      return '<article class="teacher-scope-card" data-assigned-class="' + escapeMarkup(item.id) + '">' + icon("users-round") +
        '<div><small>Classe affectée</small><strong>' + escapeMarkup(item.name) + '</strong><span>' + escapeMarkup(item.cycle + " · Salle " + item.room) + '</span></div></article>';
    }).join("");
    var subjectCards = projection.subjects.map(function (item) {
      var classNames = item.classIds.map(function (classId) {
        var found = projection.classes.find(function (classItem) { return classItem.id === classId; });
        return found ? found.name : "";
      }).filter(Boolean).join(", ");
      return '<article class="teacher-scope-card" data-assigned-subject="' + escapeMarkup(item.id) + '">' + icon("book-open") +
        '<div><small>Matière affectée</small><strong>' + escapeMarkup(item.name) + '</strong><span>' + escapeMarkup(classNames) + '</span></div></article>';
    }).join("");
    var attentionRows = projection.students.map(function (student) {
      var classItem = projection.classes.find(function (item) { return item.id === student.classId; });
      return '<li><span>' + escapeMarkup(student.name) + '</span><small>' + escapeMarkup((classItem ? classItem.name : "") + " · " + student.attention) + '</small></li>';
    }).join("");

    container.innerHTML = '<div class="teacher-pedagogy-shell">' +
      '<header class="teacher-hero"><div><p class="teacher-eyebrow">Espace Enseignant · démonstration locale</p><h1>Mon espace pédagogique</h1>' +
      '<p>Classes et matières limitées aux affectations autorisées.</p></div><span class="teacher-boundary">assigned_classes + assigned_subjects</span></header>' +
      '<section class="teacher-priority-grid" aria-label="Priorités pédagogiques">' +
        dashboardCard("Cours du jour", "3 séances", projection.classes.map(function (item) { return item.name; }).join(" et "), "calendar-clock", "schedule", "FEATURE_LATER") +
        dashboardCard("Devoirs", "2 à préparer", "4 remises à corriger", "notebook-pen", "assignments") +
        dashboardCard("Évaluations", "1 planifiée", "6 notes à compléter", "star", "evaluations") +
        dashboardCard("Résultats", "Moyennes", "Bulletins et palmarès", "chart-no-axes-combined", "results") +
        dashboardCard("Difficultés", "2 élèves", "Suivi pédagogique", "triangle-alert", "difficulties") +
        dashboardCard("Rattrapages", "1 proposition", "Pédagogie uniquement", "life-buoy", "remediation") +
        dashboardCard("Notifications", "2 utiles", "Direction et calendrier", "bell-ring", "notifications", "FEATURE_LATER") +
      '</section>' +
      '<div class="teacher-dashboard-columns"><section class="teacher-panel"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Périmètre actif</p><h2>Mes affectations</h2></div><span>ACCÈS LIMITÉ</span></div>' +
        '<div class="teacher-scope-grid">' + (classCards || '<p class="teacher-empty">Aucune classe affectée.</p>') + (subjectCards || '<p class="teacher-empty">Aucune matière affectée.</p>') + '</div></section>' +
        '<section class="teacher-panel"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Élèves actifs</p><h2>À suivre</h2></div><span>drafts exclus</span></div>' +
        '<ul class="teacher-attention-list">' + (attentionRows || '<li><span>Aucun élève actif autorisé</span></li>') + '</ul></section></div>' +
      '<aside class="teacher-honesty-note">' + icon("cloud-off") + '<div><strong>Données de démonstration</strong><p>Aucune publication officielle ni écriture serveur. Les fonctions non disponibles sont indiquées FEATURE_LATER ou BACKEND_LATER.</p></div></aside>' + (canUseJaspe(activeUser) ? jaspeMarkup(projection) : "") +
      '<section class="teacher-feature-state" data-teacher-feature-state hidden></section>' +
    '</div>';

    container.querySelectorAll("[data-teacher-open]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-teacher-open");
        if (["assignments", "evaluations", "results", "difficulties", "remediation"].indexOf(target) >= 0) {
          open(target);
          return;
        }
        var state = container.querySelector("[data-teacher-feature-state]");
        if (!state) return;
        state.hidden = false;
        state.innerHTML = '<p class="teacher-eyebrow">Navigation Phase D</p><h2>' + escapeMarkup(button.textContent.trim()) +
          '</h2><span>' + (target === "schedule" || target === "notifications" ? "FEATURE_LATER" : "Disponible dans un lot Phase D suivant") + '</span>';
      });
    });
    bindJaspe(container);
  }

  function assignmentCard(item) {
    var statusLabel = item.status === "PUBLIÉ" ? "PUBLIÉ · APERÇU" : item.status;
    return '<article class="teacher-record-card" data-assignment-id="' + escapeMarkup(item.id) + '"><header><div><p class="teacher-eyebrow">' +
      escapeMarkup(labelFor(CLASSES, item.classId) + " · " + labelFor(SUBJECTS, item.subjectId)) + '</p><h3>' + escapeMarkup(item.title) +
      '</h3></div><span class="teacher-status">' + escapeMarkup(statusLabel) + '</span></header><p>' + escapeMarkup(item.instructions) +
      '</p><dl><div><dt>Publication prévue</dt><dd>' + escapeMarkup(item.publishOn || "À planifier") + '</dd></div><div><dt>Date limite</dt><dd>' +
      escapeMarkup(item.dueOn || "À planifier") + '</dd></div><div><dt>Type</dt><dd>' + escapeMarkup(item.workType) + '</dd></div></dl>' +
      (item.local ? '<footer><b>BROUILLON LOCAL</b><span>BACKEND_LATER</span></footer>' : '<footer><span>APERÇU DE DÉMONSTRATION</span><span>BACKEND_LATER</span></footer>') + '</article>';
  }

  function renderAssignmentForm(projection) {
    if (!allowsScope(activeUser, "pedagogy.assignment.manage", "assigned_classes")) {
      return '<aside class="teacher-access-note teacher-access-note--denied"><strong>Préparation non autorisée</strong><p>La permission pedagogy.assignment.manage est absente ou refusée par un DENY explicite.</p></aside>';
    }
    var classOptions = projection.classes.map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(item.name) + '</option>'; }).join("");
    var subjectOptions = projection.subjects.map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(item.name) + '</option>'; }).join("");
    return '<form class="teacher-form" id="teacherAssignmentForm"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Préparation locale</p><h2>Nouveau devoir</h2></div><span>BROUILLON LOCAL</span></div>' +
      '<div class="teacher-form-grid"><label><span>Titre</span><input name="title" required maxlength="120"></label>' +
      '<label><span>Classe</span><select name="classId" required>' + classOptions + '</select></label>' +
      '<label><span>Matière</span><select name="subjectId" required>' + subjectOptions + '</select></label>' +
      '<label><span>Type de travail</span><select name="workType"><option>Devoir</option><option>Travail individuel</option><option>Travail de groupe</option><option>TP</option></select></label>' +
      '<label><span>Publication prévue</span><input name="publishOn" type="date"></label><label><span>Date limite</span><input name="dueOn" type="date" required></label>' +
      '<label><span>Statut</span><select name="status"><option>BROUILLON</option><option>À PUBLIER</option><option>PUBLIÉ</option><option>TERMINÉ</option></select></label>' +
      '<label><span>Pièce/document futur</span><input name="attachmentNote" placeholder="BACKEND_LATER"></label>' +
      '<label class="teacher-form-wide"><span>Consigne</span><textarea name="instructions" rows="4" required></textarea></label></div>' +
      '<aside class="teacher-access-note"><strong>Publication officielle indisponible</strong><p>Même le statut PUBLIÉ reste un aperçu local tant que le backend est absent — BACKEND_LATER.</p></aside>' +
      '<button class="ss-button" type="submit"><i data-lucide="save"></i> Enregistrer la préparation</button></form>';
  }

  function renderAssignments(container, projection) {
    activeView = "assignments";
    if (!allowsScope(activeUser, "pedagogy.assignment.read", "assigned_classes")) {
      renderDenied(container);
      return;
    }
    var classIds = projection.classes.map(function (item) { return item.id; });
    var subjectIds = projection.subjects.map(function (item) { return item.id; });
    var items = ASSIGNMENTS.concat(readAssignmentDrafts()).filter(function (item) {
      return classIds.indexOf(item.classId) >= 0 && subjectIds.indexOf(item.subjectId) >= 0;
    });
    container.innerHTML = '<div class="teacher-pedagogy-shell"><header class="teacher-workspace-header"><button class="ss-button ss-button--secondary" type="button" data-teacher-back>' + icon("arrow-left") + ' Tableau de bord</button>' +
      '<div><p class="teacher-eyebrow">D2 · Devoirs / travaux / remises</p><h1>Devoirs de mes affectations</h1><p>Préparation locale uniquement, sans publication serveur.</p></div><span class="teacher-boundary">BACKEND_LATER</span></header>' +
      '<div class="teacher-workspace-grid"><section class="teacher-panel"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Classes et matières autorisées</p><h2>Travaux préparés</h2></div><span>' + items.length + ' élément(s)</span></div>' +
      '<div class="teacher-record-list" data-assignment-list>' + (items.length ? items.map(assignmentCard).join("") : '<p class="teacher-empty">Aucun devoir dans ce périmètre.</p>') + '</div></section>' +
      '<section class="teacher-panel">' + renderAssignmentForm(projection) + '</section></div>' +
      '<aside class="teacher-honesty-note" data-submissions-state>' + icon("inbox") + '<div><strong>Remises et corrections · BACKEND_LATER</strong><p>Aucune remise serveur inventée. Les statuts réels seront consultables lorsque la projection backend existera.</p></div></aside></div>';

    var back = container.querySelector("[data-teacher-back]");
    if (back) back.addEventListener("click", function () { render(activeContainerId, activeUser); });
    var form = container.querySelector("#teacherAssignmentForm");
    if (form) form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      var classId = String(data.get("classId") || "");
      var subjectId = String(data.get("subjectId") || "");
      var subject = projection.subjects.find(function (item) { return item.id === subjectId; });
      if (!subject || subject.classIds.indexOf(classId) < 0) {
        var note = form.querySelector(".teacher-access-note");
        if (note) note.innerHTML = '<strong>Couple classe / matière refusé</strong><p>La matière doit être affectée à la classe choisie.</p>';
        return;
      }
      var drafts = readAssignmentDrafts();
      drafts.unshift({
        id: "teacher-assignment-" + Date.now(),
        title: String(data.get("title") || ""),
        classId: classId,
        subjectId: subjectId,
        instructions: String(data.get("instructions") || ""),
        publishOn: String(data.get("publishOn") || ""),
        dueOn: String(data.get("dueOn") || ""),
        workType: String(data.get("workType") || "Devoir"),
        attachmentNote: String(data.get("attachmentNote") || ""),
        status: String(data.get("status") || "BROUILLON"),
        local: true
      });
      saveAssignmentDrafts(drafts);
      renderAssignments(container, projection);
    });
  }

  function evaluationCard(item) {
    return '<article class="teacher-record-card" data-evaluation-id="' + escapeMarkup(item.id) + '"><header><div><p class="teacher-eyebrow">' +
      escapeMarkup(labelFor(CLASSES, item.classId) + " · " + labelFor(SUBJECTS, item.subjectId)) + '</p><h3>' + escapeMarkup(item.title) +
      '</h3></div><span class="teacher-status">' + escapeMarkup(item.status) + '</span></header><p>' + escapeMarkup(item.instructions) +
      '</p><dl><div><dt>Type</dt><dd>' + escapeMarkup(item.type) + '</dd></div><div><dt>Date</dt><dd>' + escapeMarkup(item.date) +
      '</dd></div><div><dt>Barème</dt><dd>/' + escapeMarkup(item.scale) + ' · coef. ' + escapeMarkup(item.coefficient) + '</dd></div></dl>' +
      '<footer><b>BROUILLON LOCAL</b><span>BACKEND_LATER</span></footer></article>';
  }

  function renderEvaluationForm(projection) {
    var classOptions = projection.classes.map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(item.name) + '</option>'; }).join("");
    var subjectOptions = projection.subjects.map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(item.name) + '</option>'; }).join("");
    return '<form class="teacher-form" id="teacherEvaluationForm"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Préparation locale</p><h2>Nouvelle évaluation</h2></div><span>BACKEND_LATER</span></div>' +
      '<div class="teacher-form-grid"><label><span>Titre</span><input name="title" required maxlength="120"></label>' +
      '<label><span>Classe</span><select name="classId" required>' + classOptions + '</select></label><label><span>Matière</span><select name="subjectId" required>' + subjectOptions + '</select></label>' +
      '<label><span>Type</span><select name="type"><option value="devoir">Devoir</option><option value="interrogation">Interrogation</option><option value="TP">TP</option><option value="examen">Examen</option><option value="autre">Autre</option></select></label>' +
      '<label><span>Date</span><input name="date" type="date" required></label><label><span>Barème</span><input name="scale" type="number" min="1" max="100" value="20" required></label>' +
      '<label><span>Coefficient</span><input name="coefficient" type="number" min="0.1" max="10" step="0.1" value="1"></label><label><span>Statut</span><select name="status"><option>BROUILLON</option><option>À PRÉPARER</option><option>TERMINÉ</option></select></label>' +
      '<label class="teacher-form-wide"><span>Consigne</span><textarea name="instructions" rows="3" required></textarea></label></div>' +
      '<button class="ss-button" type="submit">' + icon("save") + ' Enregistrer l’évaluation</button></form>';
  }

  function gradeRow(student, saved) {
    saved = saved || {};
    return '<fieldset class="teacher-grade-row" data-grade-student="' + escapeMarkup(student.id) + '"><legend>' + escapeMarkup(student.name) + '</legend>' +
      '<label><span>Valeur</span><input type="number" min="0" step="0.25" data-grade-value="' + escapeMarkup(student.id) + '" value="' + escapeMarkup(saved.value == null ? "" : saved.value) + '"></label>' +
      '<label class="teacher-check"><input type="checkbox" data-grade-absent="' + escapeMarkup(student.id) + '"' + (saved.absent ? " checked" : "") + '><span>Absent</span></label>' +
      '<label class="teacher-check"><input type="checkbox" data-grade-unmarked="' + escapeMarkup(student.id) + '"' + (saved.unmarked ? " checked" : "") + '><span>Non noté</span></label>' +
      '<label><span>Observation</span><input data-grade-observation="' + escapeMarkup(student.id) + '" value="' + escapeMarkup(saved.observation || "") + '"></label></fieldset>';
  }

  function renderGradebook(projection, evaluations) {
    var selected = evaluations.find(function (item) { return item.id === selectedEvaluationId; }) || evaluations[0];
    if (!selected) return '<p class="teacher-empty">Préparez une évaluation pour ouvrir la saisie locale.</p>';
    selectedEvaluationId = selected.id;
    var options = evaluations.map(function (item) { return '<option value="' + escapeMarkup(item.id) + '"' + (item.id === selected.id ? " selected" : "") + '>' + escapeMarkup(item.title) + '</option>'; }).join("");
    var savedByEvaluation = readGradeDrafts()[selected.id] || {};
    var students = projection.students.filter(function (item) { return item.classId === selected.classId && item.lifecycleStatus === "active"; });
    return '<form class="teacher-form" id="teacherGradebookForm"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Saisie frontend</p><h2>Notes en préparation</h2></div><span>NON PUBLIÉ · BACKEND_LATER</span></div>' +
      '<label><span>Évaluation</span><select id="teacherEvaluationSelect">' + options + '</select></label><div class="teacher-grade-list">' +
      students.map(function (student) { return gradeRow(student, savedByEvaluation[student.id]); }).join("") + '</div>' +
      '<button class="ss-button" type="submit">' + icon("save") + ' Sauvegarder les notes locales</button></form>';
  }

  function renderEvaluations(container, projection) {
    activeView = "evaluations";
    if (!allowsScope(activeUser, "pedagogy.grade.read", "assigned_classes")) {
      renderDenied(container);
      return;
    }
    var classIds = projection.classes.map(function (item) { return item.id; });
    var subjectIds = projection.subjects.map(function (item) { return item.id; });
    var evaluations = EVALUATIONS.concat(readEvaluationDrafts()).filter(function (item) {
      return classIds.indexOf(item.classId) >= 0 && subjectIds.indexOf(item.subjectId) >= 0;
    });
    var canManage = allowsScope(activeUser, "pedagogy.grade.manage", "assigned_classes");
    var controls = canManage ? '<div class="teacher-workspace-grid"><section class="teacher-panel">' + renderEvaluationForm(projection) + '</section><section class="teacher-panel">' + renderGradebook(projection, evaluations) + '</section></div>' :
      '<aside class="teacher-access-note teacher-access-note--denied"><strong>Modification des notes refusée</strong><p>Le DENY explicite ou l’absence de pedagogy.grade.manage interdit toute préparation.</p></aside>';
    container.innerHTML = '<div class="teacher-pedagogy-shell"><header class="teacher-workspace-header"><button class="ss-button ss-button--secondary" type="button" data-teacher-back>' + icon("arrow-left") + ' Tableau de bord</button>' +
      '<div><p class="teacher-eyebrow">D3 · Évaluations et notes</p><h1>Évaluations de mes classes</h1><p>Saisie locale, jamais une publication officielle.</p></div><span class="teacher-boundary">BACKEND_LATER</span></header>' +
      '<section class="teacher-panel"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Périmètre affecté</p><h2>Évaluations préparées</h2></div><span>' + evaluations.length + ' élément(s)</span></div>' +
      '<div class="teacher-record-list" data-evaluation-list>' + evaluations.map(evaluationCard).join("") + '</div></section>' + controls + '</div>';
    var back = container.querySelector("[data-teacher-back]");
    if (back) back.addEventListener("click", function () { render(activeContainerId, activeUser); });
    var evaluationForm = container.querySelector("#teacherEvaluationForm");
    if (evaluationForm) evaluationForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!evaluationForm.reportValidity()) return;
      var data = new FormData(evaluationForm);
      var classId = String(data.get("classId") || "");
      var subjectId = String(data.get("subjectId") || "");
      var subject = projection.subjects.find(function (item) { return item.id === subjectId; });
      if (!subject || subject.classIds.indexOf(classId) < 0) return;
      var drafts = readEvaluationDrafts();
      var item = { id: "teacher-evaluation-" + Date.now(), title: String(data.get("title") || ""), classId: classId, subjectId: subjectId, type: String(data.get("type") || "devoir"), date: String(data.get("date") || ""), scale: Number(data.get("scale") || 20), coefficient: Number(data.get("coefficient") || 1), instructions: String(data.get("instructions") || ""), status: String(data.get("status") || "BROUILLON"), local: true };
      drafts.unshift(item);
      selectedEvaluationId = item.id;
      saveEvaluationDrafts(drafts);
      renderEvaluations(container, projection);
    });
    var evaluationSelect = container.querySelector("#teacherEvaluationSelect");
    if (evaluationSelect) evaluationSelect.addEventListener("change", function () { selectedEvaluationId = evaluationSelect.value; renderEvaluations(container, projection); });
    container.querySelectorAll("[data-grade-absent], [data-grade-unmarked]").forEach(function (control) {
      control.addEventListener("change", function () {
        var studentId = control.getAttribute(control.hasAttribute("data-grade-absent") ? "data-grade-absent" : "data-grade-unmarked");
        var row = container.querySelector('[data-grade-student="' + studentId + '"]');
        if (!row || !control.checked) return;
        var other = row.querySelector(control.hasAttribute("data-grade-absent") ? "[data-grade-unmarked]" : "[data-grade-absent]");
        var value = row.querySelector("[data-grade-value]");
        if (other) other.checked = false;
        if (value) value.value = "";
      });
    });
    var gradebook = container.querySelector("#teacherGradebookForm");
    if (gradebook) gradebook.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!gradebook.reportValidity()) return;
      var evaluation = evaluations.find(function (item) { return item.id === selectedEvaluationId; });
      if (!evaluation) return;
      var drafts = readGradeDrafts();
      var nextGrades = {};
      var valid = true;
      gradebook.querySelectorAll("[data-grade-student]").forEach(function (row) {
        var studentId = row.getAttribute("data-grade-student");
        var rawValue = row.querySelector("[data-grade-value]").value;
        var value = rawValue === "" ? null : Number(rawValue);
        if (value != null && (value < 0 || value > evaluation.scale)) { valid = false; return; }
        nextGrades[studentId] = { value: value, absent: row.querySelector("[data-grade-absent]").checked, unmarked: row.querySelector("[data-grade-unmarked]").checked, observation: row.querySelector("[data-grade-observation]").value };
      });
      if (!valid) return;
      drafts[evaluation.id] = nextGrades;
      saveGradeDrafts(drafts);
      renderEvaluations(container, projection);
    });
  }

  function renderRanking(title, scope, rows, classId) {
    var content = rows.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, 10).map(function (item, index) {
      return '<li><b>' + (index + 1) + '</b><span>' + escapeMarkup(item.name) + '<small>' + escapeMarkup(labelFor(CLASSES, item.classId)) + '</small></span><strong>' + escapeMarkup(item.score.toFixed(1)) + '</strong></li>';
    }).join("");
    return '<section class="teacher-panel teacher-ranking" data-ranking-scope="' + scope + '"' + (classId ? ' data-ranking-class="' + escapeMarkup(classId) + '"' : "") + '><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Classement calculé</p><h2>' + escapeMarkup(title) + '</h2></div><span>lecture seule</span></div><ol>' + content + '</ol><p class="teacher-demo-caption">Sources compatibles de démonstration : devoirs, interrogations, TP et autres évaluations. Aucun classement officiel n’est calculé.</p></section>';
  }

  function renderResults(container, projection) {
    activeView = "results";
    if (!allowsScope(activeUser, "pedagogy.grade.read", "assigned_classes")) {
      renderDenied(container);
      return;
    }
    var classIds = projection.classes.map(function (item) { return item.id; });
    var subjectIds = projection.subjects.map(function (item) { return item.id; });
    var summaries = RESULT_SUMMARIES.filter(function (item) { return classIds.indexOf(item.classId) >= 0 && subjectIds.indexOf(item.subjectId) >= 0; });
    var summaryCards = summaries.map(function (item) {
      return '<article class="teacher-result-card"><p class="teacher-eyebrow">' + escapeMarkup(labelFor(CLASSES, item.classId)) + '</p><h3>' + escapeMarkup(labelFor(SUBJECTS, item.subjectId)) + '</h3>' +
        '<strong>' + escapeMarkup(resultsPeriod === "monthly" ? item.monthlyAverage : item.termAverage) + '</strong><span>Couverture des notes : ' + escapeMarkup(item.coverage) + '</span><small>' + escapeMarkup(item.source) + '</small></article>';
    }).join("");
    var classRankings = projection.classes.map(function (classItem) {
      var rows = RANKING_SCORES.filter(function (item) { return item.classId === classItem.id; });
      return renderRanking("Top 10 classe · " + classItem.name, "class", rows, classItem.id);
    }).join("");
    var canSeeSchoolRanking = allowsScope(activeUser, "palmarques.read", "school");
    var schoolRanking = canSeeSchoolRanking ? renderRanking("Top 10 école", "school", RANKING_SCORES) : '<aside class="teacher-access-note"><strong>Top école non autorisé</strong><p>La permission palmarques.read avec scope school est nécessaire; aucun scope school n’est accordé automatiquement.</p></aside>';
    var appreciations = readAppreciationDrafts().filter(function (item) { return classIds.indexOf(item.classId) >= 0; });
    var appreciationRows = appreciations.map(function (item) { return '<li><strong>' + escapeMarkup(item.studentName) + '</strong><span>' + escapeMarkup(item.text) + '</span><small>BROUILLON LOCAL</small></li>'; }).join("");
    var studentOptions = projection.students.map(function (student) { return '<option value="' + escapeMarkup(student.id) + '">' + escapeMarkup(student.name) + '</option>'; }).join("");
    var appreciationForm = allowsScope(activeUser, "pedagogy.grade.manage", "assigned_classes") ? '<form class="teacher-form" id="teacherAppreciationForm"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Appréciation</p><h2>Préparer une appréciation</h2></div><span>BROUILLON LOCAL</span></div><label><span>Élève actif</span><select name="studentId">' + studentOptions + '</select></label><label><span>Texte</span><textarea name="text" rows="3" required></textarea></label><button class="ss-button" type="submit">' + icon("save") + ' Enregistrer localement</button></form>' : '<p>Préparation non autorisée.</p>';

    container.innerHTML = '<div class="teacher-pedagogy-shell"><header class="teacher-workspace-header"><button class="ss-button ss-button--secondary" type="button" data-teacher-back>' + icon("arrow-left") + ' Tableau de bord</button>' +
      '<div><p class="teacher-eyebrow">D4 · Résultats / bulletins / palmarès</p><h1>Résultats et moyennes</h1><p>DONNÉES DE DÉMONSTRATION · aucun calcul officiel.</p></div><span class="teacher-boundary">BACKEND_LATER</span></header>' +
      '<nav class="teacher-period-tabs" aria-label="Période"><button type="button" data-results-period="monthly"' + (resultsPeriod === "monthly" ? ' class="active"' : "") + '>Mensuel</button><button type="button" data-results-period="term"' + (resultsPeriod === "term" ? ' class="active"' : "") + '>Trimestriel</button></nav>' +
      '<section class="teacher-panel"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Synthèse par matière</p><h2>Moyennes de démonstration</h2></div><span>NON OFFICIEL</span></div><div class="teacher-result-grid">' + summaryCards + '</div></section>' +
      '<div class="teacher-workspace-grid">' + classRankings + schoolRanking + '</div>' +
      '<section class="teacher-panel" data-bulletin-preview><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Aperçu uniquement</p><h2>Bulletin en préparation</h2></div><span>BACKEND_LATER</span></div><p>Le Bulletin officiel et sa publication restent une fonction serveur future. Cet aperçu reprend seulement les synthèses visibles du périmètre affecté.</p></section>' +
      '<div class="teacher-workspace-grid"><section class="teacher-panel">' + appreciationForm + '</section><section class="teacher-panel"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Historique local</p><h2>Appréciations préparées</h2></div></div><ul class="teacher-appreciation-list" data-appreciation-list>' + (appreciationRows || '<li>Aucune appréciation préparée.</li>') + '</ul></section></div></div>';
    var back = container.querySelector("[data-teacher-back]");
    if (back) back.addEventListener("click", function () { render(activeContainerId, activeUser); });
    container.querySelectorAll("[data-results-period]").forEach(function (button) { button.addEventListener("click", function () { resultsPeriod = button.getAttribute("data-results-period"); renderResults(container, projection); }); });
    var form = container.querySelector("#teacherAppreciationForm");
    if (form) form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      var student = projection.students.find(function (item) { return item.id === String(data.get("studentId") || ""); });
      if (!student || student.lifecycleStatus !== "active") return;
      var items = readAppreciationDrafts();
      items.unshift({ id: "teacher-appreciation-" + Date.now(), studentId: student.id, studentName: student.name, classId: student.classId, text: String(data.get("text") || "") });
      saveAppreciationDrafts(items);
      renderResults(container, projection);
    });
  }

  function trackingCard(item) {
    var student = STUDENTS.find(function (entry) { return entry.id === item.studentId; });
    return '<article class="teacher-timeline-item"><span class="teacher-timeline-dot"></span><div><header><div><p class="teacher-eyebrow">' + escapeMarkup(item.month + " · " + labelFor(CLASSES, item.classId)) + '</p><h3>' + escapeMarkup(labelFor(SUBJECTS, item.subjectId)) + '</h3></div><span class="teacher-status">' + escapeMarkup(item.status) + '</span></header>' +
      '<p><strong>Objectifs :</strong> ' + escapeMarkup(item.objectives) + '</p><div class="teacher-progress"><span style="width:' + Math.max(0, Math.min(100, Number(item.progress) || 0)) + '%"></span></div><small>Progression : ' + escapeMarkup(item.progress) + ' %</small>' +
      '<dl><div><dt>Compétences</dt><dd>' + escapeMarkup(item.skills) + '</dd></div><div><dt>Difficulté collective</dt><dd>' + escapeMarkup(item.collectiveDifficulty || "Non signalée") + '</dd></div>' +
      '<div><dt>Suivi individuel</dt><dd>' + escapeMarkup(student ? student.name + " · " + item.individualDifficulty : "Aucun") + '</dd></div><div><dt>Actions prévues</dt><dd>' + escapeMarkup(item.actions) + '</dd></div></dl>' +
      '<blockquote>' + escapeMarkup(item.observation) + '</blockquote><footer><b>' + (item.local ? "BROUILLON LOCAL" : "DÉMONSTRATION") + '</b><span>Historique conservé</span></footer></div></article>';
  }

  function trackingForm(projection) {
    var classOptions = projection.classes.map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(item.name) + '</option>'; }).join("");
    var subjectOptions = projection.subjects.map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(item.name) + '</option>'; }).join("");
    var firstClass = projection.classes[0] && projection.classes[0].id;
    var studentOptions = '<option value="">Suivi collectif</option>' + projection.students.filter(function (item) { return item.classId === firstClass; }).map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(item.name) + '</option>'; }).join("");
    return '<form class="teacher-form" id="teacherMonthlyTrackingForm"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Nouveau jalon</p><h2>Suivi pédagogique mensuel</h2></div><span>BROUILLON LOCAL</span></div>' +
      '<div class="teacher-form-grid"><label><span>Mois</span><input name="month" type="month" required></label><label><span>Classe</span><select name="classId">' + classOptions + '</select></label>' +
      '<label><span>Matière</span><select name="subjectId">' + subjectOptions + '</select></label><label><span>Progression (%)</span><input name="progress" type="number" min="0" max="100" value="0" required></label>' +
      '<label class="teacher-form-wide"><span>Objectifs du mois</span><textarea name="objectives" rows="2" required></textarea></label><label class="teacher-form-wide"><span>Compétences travaillées</span><textarea name="skills" rows="2" required></textarea></label>' +
      '<label class="teacher-form-wide"><span>Difficultés collectives</span><textarea name="collectiveDifficulty" rows="2"></textarea></label><label><span>Élève nécessitant attention</span><select name="studentId">' + studentOptions + '</select></label>' +
      '<label><span>Difficulté individuelle</span><input name="individualDifficulty"></label><label class="teacher-form-wide"><span>Actions prévues</span><textarea name="actions" rows="2" required></textarea></label>' +
      '<label class="teacher-form-wide"><span>Observation</span><textarea name="observation" rows="2" required></textarea></label><label><span>Statut du suivi</span><select name="status"><option>À PRÉPARER</option><option>EN COURS</option><option>À REVOIR</option><option>TERMINÉ</option></select></label></div>' +
      '<aside class="teacher-access-note"><strong>Aide Jaspe encadrée</strong><p>Jaspe pourra reformuler et proposer des exercices ou un plan; il ne pose jamais de diagnostic officiel.</p></aside><button class="ss-button" type="submit">' + icon("save") + ' Ajouter à la chronologie</button></form>';
  }

  function renderDifficulties(container, projection) {
    activeView = "difficulties";
    if (!allowsScope(activeUser, "pedagogy.lesson-plan.read", "assigned_classes")) {
      renderDenied(container);
      return;
    }
    var classIds = projection.classes.map(function (item) { return item.id; });
    var subjectIds = projection.subjects.map(function (item) { return item.id; });
    var items = MONTHLY_TRACKING.concat(readTrackingDrafts()).filter(function (item) { return classIds.indexOf(item.classId) >= 0 && subjectIds.indexOf(item.subjectId) >= 0; }).sort(function (a, b) { return String(b.month).localeCompare(String(a.month)); });
    var canManage = allowsScope(activeUser, "pedagogy.lesson-plan.manage", "assigned_classes");
    var composer = canManage ? '<section class="teacher-panel">' + trackingForm(projection) + '</section>' : '<aside class="teacher-access-note teacher-access-note--denied"><strong>Préparation du suivi refusée</strong><p>Le DENY explicite ou l’absence de pedagogy.lesson-plan.manage interdit l’ajout de jalons.</p></aside>';
    container.innerHTML = '<div class="teacher-pedagogy-shell"><header class="teacher-workspace-header"><button class="ss-button ss-button--secondary" type="button" data-teacher-back>' + icon("arrow-left") + ' Tableau de bord</button><div><p class="teacher-eyebrow">D5 · Objectifs / difficultés / suivi</p><h1>Chronologie pédagogique mensuelle</h1><p>Chaque nouveau jalon s’ajoute sans supprimer les suivis antérieurs.</p></div><span class="teacher-boundary">assigned_classes</span></header>' +
      '<div class="teacher-workspace-grid">' + composer + '<section class="teacher-panel"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Historique append-only</p><h2>Suivis mensuels</h2></div><span>' + items.length + ' jalon(s)</span></div><div class="teacher-timeline" data-monthly-timeline>' + (items.length ? items.map(trackingCard).join("") : '<p class="teacher-empty">Aucun suivi préparé.</p>') + '</div></section></div></div>';
    var back = container.querySelector("[data-teacher-back]");
    if (back) back.addEventListener("click", function () { render(activeContainerId, activeUser); });
    var form = container.querySelector("#teacherMonthlyTrackingForm");
    if (!form) return;
    var classSelect = form.querySelector('[name="classId"]');
    var subjectSelect = form.querySelector('[name="subjectId"]');
    var studentSelect = form.querySelector('[name="studentId"]');
    function syncOptions() {
      var classId = classSelect.value;
      var allowedSubjects = projection.subjects.filter(function (item) { return item.classIds.indexOf(classId) >= 0; });
      subjectSelect.innerHTML = allowedSubjects.map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(item.name) + '</option>'; }).join("");
      studentSelect.innerHTML = '<option value="">Suivi collectif</option>' + projection.students.filter(function (item) { return item.classId === classId && item.lifecycleStatus === "active"; }).map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(item.name) + '</option>'; }).join("");
    }
    classSelect.addEventListener("change", syncOptions);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      var classId = String(data.get("classId") || "");
      var subjectId = String(data.get("subjectId") || "");
      var studentId = String(data.get("studentId") || "");
      var subject = projection.subjects.find(function (item) { return item.id === subjectId && item.classIds.indexOf(classId) >= 0; });
      var student = studentId ? projection.students.find(function (item) { return item.id === studentId && item.classId === classId && item.lifecycleStatus === "active"; }) : null;
      if (!subject || (studentId && !student)) return;
      var drafts = readTrackingDrafts();
      drafts.unshift({ id: "teacher-tracking-" + Date.now(), month: String(data.get("month") || ""), classId: classId, subjectId: subjectId, objectives: String(data.get("objectives") || ""), progress: Number(data.get("progress") || 0), skills: String(data.get("skills") || ""), collectiveDifficulty: String(data.get("collectiveDifficulty") || ""), studentId: studentId, individualDifficulty: String(data.get("individualDifficulty") || ""), actions: String(data.get("actions") || ""), observation: String(data.get("observation") || ""), status: String(data.get("status") || "À PRÉPARER"), local: true });
      saveTrackingDrafts(drafts);
      renderDifficulties(container, projection);
    });
  }

  function remediationCard(item) {
    var student = STUDENTS.find(function (entry) { return entry.id === item.studentId; });
    if (item.proposal) {
      return '<article class="teacher-record-card teacher-remediation-card"><header><div><p class="teacher-eyebrow">' + escapeMarkup(labelFor(CLASSES, item.classId) + " · " + labelFor(SUBJECTS, item.subjectId)) + '</p><h3>' + escapeMarkup(student ? student.name : "Élève indisponible") + '</h3></div><span class="teacher-status">PROPOSITION À VALIDER</span></header>' +
        '<p><strong>Cause / difficulté détectée :</strong> ' + escapeMarkup(item.difficulty) + '</p><p><strong>Éléments sources D5 :</strong> ' + escapeMarkup(item.sourceElements) + '</p><p><strong>Objectif proposé :</strong> ' + escapeMarkup(item.objective) + '</p>' +
        '<p><strong>Observation :</strong> ' + escapeMarkup(item.observations) + '</p><dl><div><dt>Validation pédagogique</dt><dd>BACKEND_LATER</dd></div><div><dt>Inscription officielle</dt><dd>AUCUNE INSCRIPTION OFFICIELLE</dd></div><div><dt>Suivi</dt><dd>APRÈS VALIDATION</dd></div></dl>' +
        '<footer><b>BROUILLON LOCAL</b><span>BACKEND_LATER · PÉDAGOGIE UNIQUEMENT</span></footer></article>';
    }
    return '<article class="teacher-record-card teacher-remediation-card"><header><div><p class="teacher-eyebrow">' + escapeMarkup(labelFor(CLASSES, item.classId) + " · " + labelFor(SUBJECTS, item.subjectId)) + '</p><h3>' + escapeMarkup(student ? student.name : "Élève indisponible") + '</h3></div><span class="teacher-status">' + escapeMarkup(item.status) + '</span></header>' +
      '<p><strong>Difficulté :</strong> ' + escapeMarkup(item.difficulty) + '</p><p><strong>Objectif :</strong> ' + escapeMarkup(item.objective) + '</p><dl><div><dt>Séances prévues</dt><dd>' + escapeMarkup(item.plannedSessions) + '</dd></div><div><dt>Calendrier</dt><dd>' + escapeMarkup(item.calendar) + '</dd></div><div><dt>Progression</dt><dd>' + escapeMarkup(item.progress) + ' %</dd></div></dl>' +
      '<p><strong>Observations :</strong> ' + escapeMarkup(item.observations) + '</p><p><strong>Résultat pédagogique :</strong> ' + escapeMarkup(item.result) + '</p><footer><b>' + (item.local ? "BROUILLON LOCAL" : "DÉMONSTRATION") + '</b><span>BACKEND_LATER · PÉDAGOGIE UNIQUEMENT</span></footer></article>';
  }

  function remediationSources(projection) {
    var classIds = projection.classes.map(function (item) { return item.id; });
    var subjectIds = projection.subjects.map(function (item) { return item.id; });
    return MONTHLY_TRACKING.concat(readTrackingDrafts()).filter(function (item) {
      var hasDifficulty = !!String(item.individualDifficulty || item.collectiveDifficulty || "").trim();
      var studentAllowed = !item.studentId || projection.students.some(function (student) { return student.id === item.studentId && student.lifecycleStatus === "active"; });
      return hasDifficulty && studentAllowed && classIds.indexOf(item.classId) >= 0 && subjectIds.indexOf(item.subjectId) >= 0;
    });
  }

  function remediationSourceLabel(item) {
    var date = new Date(String(item.month || "") + "-01T00:00:00");
    var month = Number.isNaN(date.getTime()) ? String(item.month || "Période") : date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    month = month.charAt(0).toUpperCase() + month.slice(1);
    return month + " · " + labelFor(CLASSES, item.classId) + " · " + labelFor(SUBJECTS, item.subjectId) + " · " + (item.individualDifficulty ? "difficulté individuelle" : "difficulté collective");
  }

  function remediationSourceElements(item) {
    return [
      item.objectives ? "Objectifs : " + item.objectives : "",
      item.skills ? "Compétences : " + item.skills : "",
      item.actions ? "Action D5 : " + item.actions : "",
      item.observation ? "Observation : " + item.observation : ""
    ].filter(Boolean).join(" · ");
  }

  function remediationStudentsForSource(projection, source) {
    return projection.students.filter(function (student) {
      return student.lifecycleStatus === "active" && student.classId === source.classId && (!source.studentId || source.studentId === student.id);
    });
  }

  function remediationForm(projection, sources) {
    if (!sources.length) return '<aside class="teacher-access-note"><strong>Aucune difficulté source</strong><p>Une difficulté doit d’abord être consignée dans le suivi D5 avant de pouvoir préparer une proposition de rattrapage.</p></aside>';
    var firstSource = sources[0];
    var sourceOptions = sources.map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(remediationSourceLabel(item)) + '</option>'; }).join("");
    var studentOptions = remediationStudentsForSource(projection, firstSource).map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(item.name) + '</option>'; }).join("");
    return '<form class="teacher-form" id="teacherRemediationForm"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">DÉTECTION / PROPOSITION</p><h2>Proposer un rattrapage à valider</h2></div><span>BROUILLON LOCAL</span></div>' +
      '<aside class="teacher-access-note"><strong>RÉSULTATS / DIFFICULTÉS → DÉTECTION / PROPOSITION → VALIDATION PÉDAGOGIQUE → PLAN → SÉANCES / CALENDRIER → PROGRESSION → OBSERVATIONS → RÉSULTAT</strong><p>La Direction pédagogique assurera la VALIDATION PÉDAGOGIQUE · BACKEND_LATER.</p></aside><div class="teacher-form-grid">' +
      '<label class="teacher-form-wide"><span>Difficulté source D5</span><select name="sourceId" required>' + sourceOptions + '</select></label><label><span>Élève concerné dans la portée source</span><select name="studentId" required>' + studentOptions + '</select></label>' +
      '<aside class="teacher-access-note teacher-form-wide" data-remediation-source-summary><strong>Cause / difficulté : ' + escapeMarkup(firstSource.individualDifficulty || firstSource.collectiveDifficulty) + '</strong><p>Éléments sources : ' + escapeMarkup(remediationSourceElements(firstSource)) + '</p></aside>' +
      '<label class="teacher-form-wide"><span>Objectif proposé</span><textarea name="objective" rows="2" required></textarea></label><label class="teacher-form-wide"><span>Observation pour validation pédagogique</span><textarea name="observations" rows="2" required></textarea></label></div>' +
      '<aside class="teacher-access-note"><strong>BACKEND_LATER · PÉDAGOGIE UNIQUEMENT</strong><p>Le plan, les séances, le calendrier, la progression et le résultat seront ouverts après validation pédagogique. Aucune inscription financière et aucune inscription officielle locale.</p></aside><button class="ss-button" type="submit">' + icon("save") + ' Enregistrer la proposition</button></form>';
  }

  function renderRemediation(container, projection) {
    activeView = "remediation";
    if (!canPrepareRemediation(activeUser)) {
      renderDenied(container);
      return;
    }
    var classIds = projection.classes.map(function (item) { return item.id; });
    var subjectIds = projection.subjects.map(function (item) { return item.id; });
    var studentIds = projection.students.map(function (item) { return item.id; });
    var items = REMEDIATIONS.concat(readRemediationRecords()).filter(function (item) { return classIds.indexOf(item.classId) >= 0 && subjectIds.indexOf(item.subjectId) >= 0 && studentIds.indexOf(item.studentId) >= 0; });
    var sources = remediationSources(projection);
    var canManage = canPrepareRemediation(activeUser);
    var composer = canManage ? '<section class="teacher-panel">' + remediationForm(projection, sources) + '</section>' : '<aside class="teacher-access-note teacher-access-note--denied"><strong>Préparation du rattrapage refusée</strong><p>pedagogy.lesson-plan.manage avec assigned_classes est nécessaire.</p></aside>';
    container.innerHTML = '<div class="teacher-pedagogy-shell"><header class="teacher-workspace-header"><button class="ss-button ss-button--secondary" type="button" data-teacher-back>' + icon("arrow-left") + ' Tableau de bord</button><div><p class="teacher-eyebrow">D6 · Rattrapage pédagogique</p><h1>Propositions issues des difficultés détectées</h1><p>Suivi pédagogique uniquement · aucune inscription officielle ou financière.</p></div><span class="teacher-boundary">assigned_classes</span></header><div class="teacher-workspace-grid">' + composer + '<section class="teacher-panel"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Données D5 / D6 conservées</p><h2>Propositions et suivis pédagogiques</h2></div><span>' + items.length + ' élément(s)</span></div><div class="teacher-record-list" data-remediation-list>' + (items.length ? items.map(remediationCard).join("") : '<p class="teacher-empty">Aucune proposition préparée.</p>') + '</div></section></div></div>';
    var back = container.querySelector("[data-teacher-back]");
    if (back) back.addEventListener("click", function () { render(activeContainerId, activeUser); });
    var form = container.querySelector("#teacherRemediationForm");
    if (!form) return;
    var sourceSelect = form.querySelector('[name="sourceId"]');
    var studentSelect = form.querySelector('[name="studentId"]');
    var sourceSummary = form.querySelector("[data-remediation-source-summary]");
    function selectedSource() {
      return sources.find(function (item) { return item.id === sourceSelect.value; });
    }
    function syncSource() {
      var source = selectedSource();
      if (!source) return;
      studentSelect.innerHTML = remediationStudentsForSource(projection, source).map(function (item) { return '<option value="' + escapeMarkup(item.id) + '">' + escapeMarkup(item.name) + '</option>'; }).join("");
      sourceSummary.innerHTML = '<strong>Cause / difficulté : ' + escapeMarkup(source.individualDifficulty || source.collectiveDifficulty) + '</strong><p>Éléments sources : ' + escapeMarkup(remediationSourceElements(source)) + '</p>';
    }
    sourceSelect.addEventListener("change", syncSource);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      var studentId = String(data.get("studentId") || "");
      var source = sources.find(function (item) { return item.id === String(data.get("sourceId") || ""); });
      var student = source && remediationStudentsForSource(projection, source).find(function (item) { return item.id === studentId; });
      if (!source || !student) return;
      var drafts = readRemediationRecords();
      drafts.unshift({ id: "teacher-remediation-proposal-" + Date.now(), studentId: studentId, classId: source.classId, subjectId: source.subjectId, difficulty: String(source.individualDifficulty || source.collectiveDifficulty || ""), objective: String(data.get("objective") || ""), plannedSessions: 0, calendar: "APRÈS VALIDATION BACKEND_LATER", progress: 0, observations: String(data.get("observations") || ""), result: "NON ÉVALUÉ", status: "PROPOSITION À VALIDER", local: true, proposal: true, officialEnrollment: false, sourceId: source.id, sourceElements: remediationSourceElements(source), validationStatus: "BACKEND_LATER" });
      saveRemediationDrafts(drafts);
      renderRemediation(container, projection);
    });
  }

  function directionMetric(label, value, detail, iconName) {
    return '<article class="teacher-direction-metric"><span>' + icon(iconName) + '</span><div><small>' + escapeMarkup(label) + '</small><strong>' + escapeMarkup(value) + '</strong><em>' + escapeMarkup(detail) + '</em></div></article>';
  }

  function reviewMatchesProjection(item, projection) {
    var classIds = projection.classes.map(function (entry) { return entry.id; });
    var subjectIds = projection.subjects.map(function (entry) { return entry.id; });
    if (!Array.isArray(item.classIds) || !Array.isArray(item.subjectIds)) return false;
    return item.classIds.every(function (id) { return classIds.indexOf(id) >= 0; }) && item.subjectIds.every(function (id) { return subjectIds.indexOf(id) >= 0; });
  }

  function coverageFor(summaries) {
    var values = summaries.map(function (item) { return Number.parseFloat(String(item.coverage || "").replace(",", ".")); }).filter(function (value) { return Number.isFinite(value); });
    if (!values.length) return "Indisponible";
    return Math.round(values.reduce(function (total, value) { return total + value; }, 0) / values.length) + " %";
  }

  function renderDirection(container, projection) {
    activeView = "direction";
    if (!canOpenDirection(activeUser)) {
      renderDenied(container);
      return;
    }
    var classIds = projection.classes.map(function (item) { return item.id; });
    var subjectIds = projection.subjects.map(function (item) { return item.id; });
    var assignments = ASSIGNMENTS.concat(readAssignmentDrafts()).filter(function (item) { return classIds.indexOf(item.classId) >= 0 && subjectIds.indexOf(item.subjectId) >= 0; });
    var evaluations = EVALUATIONS.concat(readEvaluationDrafts()).filter(function (item) { return classIds.indexOf(item.classId) >= 0 && subjectIds.indexOf(item.subjectId) >= 0; });
    var tracking = MONTHLY_TRACKING.concat(readTrackingDrafts()).filter(function (item) { return classIds.indexOf(item.classId) >= 0 && subjectIds.indexOf(item.subjectId) >= 0; });
    var remediation = REMEDIATIONS.concat(readRemediationRecords()).filter(function (item) { return classIds.indexOf(item.classId) >= 0 && subjectIds.indexOf(item.subjectId) >= 0; });
    var teachers = projection.subjects.map(function (item) { return item.id === "demo-subject-math" ? "Mme Y" : "M. Ilunga"; }).filter(function (name, index, items) { return items.indexOf(name) === index; });
    var reviews = readDirectionReviews().filter(function (item) { return reviewMatchesProjection(item, projection); });
    var reviewRows = reviews.map(function (item) { return '<li><strong>' + escapeMarkup(item.subject) + '</strong><span>' + escapeMarkup(item.observation) + '</span><small>' + escapeMarkup(item.status) + ' · BROUILLON LOCAL</small></li>'; }).join("");
    var resultSummaries = RESULT_SUMMARIES.filter(function (item) { return classIds.indexOf(item.classId) >= 0 && subjectIds.indexOf(item.subjectId) >= 0; });
    var appreciations = readAppreciationDrafts().filter(function (item) { return classIds.indexOf(item.classId) >= 0; });
    var reviewForm = canReviewDirection(activeUser) ? '<form class="teacher-form" id="pedagogyDirectionReviewForm"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Revue locale</p><h2>Préparer une observation</h2></div><span>BACKEND_LATER</span></div><label><span>Objet</span><select name="subject"><option>Classes</option><option>Enseignants</option><option>Devoirs</option><option>Évaluations</option><option>Couverture des notes</option><option>Objectifs mensuels</option><option>Difficultés</option><option>Rattrapages</option><option>Bulletins en préparation</option><option>Palmarès</option><option>Alertes pédagogiques</option></select></label><label><span>État de revue</span><select name="status"><option>À EXAMINER</option><option>EN REVUE</option><option>OBSERVATION</option><option>PRÊT</option><option>VALIDATION BACKEND_LATER</option></select></label><label><span>Observation</span><textarea name="observation" rows="3" required></textarea></label><button class="ss-button" type="submit">' + icon("save") + ' Enregistrer la revue locale</button></form>' : '<aside class="teacher-access-note teacher-access-note--denied"><strong>Revue non autorisée</strong><p>Consultation seulement; aucune validation serveur.</p></aside>';

    container.innerHTML = '<div class="teacher-pedagogy-shell" data-direction-workspace><header class="teacher-hero"><div><p class="teacher-eyebrow">D7 · Direction pédagogique</p><h1>Pilotage du périmètre projeté</h1><p>Consultation consolidée des données préparées D1 à D6.</p></div><span class="teacher-boundary">AUCUN SCOPE SCHOOL IMPLICITE</span></header>' +
      '<button class="ss-button ss-button--secondary teacher-direction-back" type="button" data-direction-back>' + icon("arrow-left") + ' Tableau de bord</button>' +
      '<section class="teacher-direction-grid">' +
        directionMetric("Classes", projection.classes.length, projection.classes.map(function (item) { return item.name; }).join(" · "), "users-round") +
        directionMetric("Enseignants", teachers.length, teachers.join(" · "), "graduation-cap") +
        directionMetric("Matières", projection.subjects.length, projection.subjects.map(function (item) { return item.name; }).join(" · "), "book-open") +
        directionMetric("Devoirs", assignments.length, "Préparés et aperçus", "notebook-pen") +
        directionMetric("Évaluations", evaluations.length, "Aucune publication officielle", "star") +
        directionMetric("Couverture des notes", coverageFor(resultSummaries), "DONNÉES DE DÉMONSTRATION", "chart-no-axes-combined") +
        directionMetric("Objectifs mensuels", tracking.length, "Jalons conservés", "target") +
        directionMetric("Difficultés", tracking.filter(function (item) { return item.collectiveDifficulty || item.individualDifficulty; }).length, "Collectives et individuelles", "triangle-alert") +
        directionMetric("Rattrapages", remediation.length, "Pédagogie uniquement", "life-buoy") +
        directionMetric("Bulletins en préparation", appreciations.length, "BACKEND_LATER", "file-text") +
        directionMetric("Palmarès", projection.classes.length + " classe(s)", "Lecture seule", "trophy") +
        directionMetric("Alertes pédagogiques", tracking.filter(function (item) { return Number(item.progress) < 60; }).length, "À examiner", "bell-ring") +
      '</section><aside class="teacher-honesty-note">' + icon("shield-alert") + '<div><strong>VALIDATION BACKEND_LATER</strong><p>Les états de revue préparent le pilotage; aucun bouton ne valide une décision sur le serveur.</p></div></aside>' +
      '<div class="teacher-workspace-grid"><section class="teacher-panel">' + reviewForm + '</section><section class="teacher-panel"><div class="teacher-section-heading"><div><p class="teacher-eyebrow">Historique local</p><h2>Revues préparées</h2></div></div><ul class="teacher-appreciation-list" data-direction-reviews>' + (reviewRows || '<li>Aucune revue préparée.</li>') + '</ul></section></div></div>';
    var back = container.querySelector("[data-direction-back]");
    if (back) back.addEventListener("click", function () { if (root.SchoolSafeAppContext && root.SchoolSafeAppContext.showDashboard) root.SchoolSafeAppContext.showDashboard(); });
    var form = container.querySelector("#pedagogyDirectionReviewForm");
    if (form) form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      var items = readDirectionReviews();
      items.unshift({ id: "direction-review-" + Date.now(), subject: String(data.get("subject") || ""), status: String(data.get("status") || "À EXAMINER"), observation: String(data.get("observation") || ""), scopeType: projection.scopeType, classIds: projection.classes.map(function (item) { return item.id; }), subjectIds: projection.subjects.map(function (item) { return item.id; }) });
      saveDirectionReviews(items);
      renderDirection(container, projection);
    });
  }

  function open(view) {
    var container = document.getElementById(activeContainerId || "teacherPedagogyPortal");
    if (!container || !activeUser) return false;
    var projection = view === "direction" ? getDirectionProjection(activeUser) : getAssignedProjection(activeUser);
    if (!projection.allowed || (view === "direction" && !canOpenDirection(activeUser))) {
      renderDenied(container);
      return false;
    }
    if (view === "assignments") renderAssignments(container, projection);
    else if (view === "evaluations") renderEvaluations(container, projection);
    else if (view === "results") renderResults(container, projection);
    else if (view === "difficulties") renderDifficulties(container, projection);
    else if (view === "remediation") renderRemediation(container, projection);
    else if (view === "direction") renderDirection(container, projection);
    else renderDashboard(container, projection);
    if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
    return true;
  }

  function clear() {
    activeContainerId = null;
    activeUser = null;
    activeView = "dashboard";
    var workspace = document.querySelector(".workspace-screen");
    if (workspace) workspace.classList.remove("teacher-pedagogy-active");
  }

  function render(containerId, user) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.hidden = false;
    activeContainerId = containerId;
    activeUser = user || {};
    var workspace = document.querySelector(".workspace-screen");
    if (workspace) workspace.classList.add("teacher-pedagogy-active");
    if (activeUser.projectionState === "loading") {
      renderOperationalState(container, "loading");
      if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
      return;
    }
    if (activeUser.projectionState === "error") {
      renderOperationalState(container, "error");
      if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
      return;
    }
    var projection = getAssignedProjection(activeUser);
    var directionProjection = !projection.allowed && canOpenDirection(activeUser) ? getDirectionProjection(activeUser) : null;
    if (!projection.allowed && directionProjection && directionProjection.allowed) renderDirection(container, directionProjection);
    else if (!projection.allowed) renderDenied(container);
    else if (activeUser.native === true || activeUser.token) {
      container.innerHTML = '<section class="teacher-operational-state" role="status"><i data-lucide="cloud-off"></i><div><span>SESSION LIVE</span><h1>DONNÉES INDISPONIBLES</h1><p>Les classes, matières, élèves, devoirs, notes et statistiques réels ne sont pas connectés. Aucune fixture pédagogique n’est affichée · BACKEND_LATER.</p></div></section>';
    }
    else if (!projection.classes.length || !projection.subjects.length) renderOperationalState(container, "empty");
    else renderDashboard(container, projection);
    if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
  }

  root.SchoolSafeTeacherPedagogy = {
    CLASSES: CLASSES,
    SUBJECTS: SUBJECTS,
    STUDENTS: STUDENTS,
    getAssignedProjection: getAssignedProjection,
    getDirectionProjection: getDirectionProjection,
    readAssignmentDrafts: readAssignmentDrafts,
    readEvaluationDrafts: readEvaluationDrafts,
    readGradeDrafts: readGradeDrafts,
    readAppreciationDrafts: readAppreciationDrafts,
    readTrackingDrafts: readTrackingDrafts,
    readRemediationDrafts: readRemediationDrafts,
    readRemediationProposals: readRemediationProposals,
    readDirectionReviews: readDirectionReviews,
    canPrepareRemediation: canPrepareRemediation,
    canOpenDirection: canOpenDirection,
    supportsJaspeContext: supportsJaspeContext,
    answerJaspe: answerJaspe,
    open: open,
    clear: clear,
    render: render
  };
}(window));
