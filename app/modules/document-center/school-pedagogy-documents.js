/* Phase J5 — Adaptateurs École / Élèves / Pédagogie liés au contexte autorisé courant. */
(function (root) {
  "use strict";

  var today = new Date().toISOString().slice(0, 10);
  var base = {
    date: today,
    status: "draft",
    formats: ["pdf"],
    currencyPolicy: "not-applicable",
    officialBoundary: "APERÇU / BROUILLON frontend uniquement",
  };
  var descriptors = [];

  function descriptor(value) { return Object.assign({}, base, value); }

  var blueprints = [
    descriptor({
      id: "pedagogy-assignment", type: "assignment", label: "Devoir / interrogation",
      description: "PDF pédagogique limité à la classe réellement affectée.",
      sourceModule: "pedagogy", nature: "DOCUMENT", permission: "pedagogy.assignment.read", templateKind: "assignment",
      includeAssignedSubject: true, contextKind: "class",
    }),
    descriptor({
      id: "pedagogy-answer-sheet", type: "answer-sheet", label: "Feuille de réponses",
      description: "Feuille associée au devoir visible dans la classe réellement affectée.",
      sourceModule: "pedagogy", nature: "FORMULAIRE", permission: "pedagogy.assignment.read", templateKind: "answer-sheet",
      includeAssignedSubject: true, contextKind: "class",
    }),
    descriptor({
      id: "pedagogy-report-school", type: "pedagogy-report", label: "Rapport pédagogique — école",
      description: "Synthèse pédagogique limitée à l’école réellement autorisée.",
      sourceModule: "pedagogy", nature: "DOCUMENT", permission: "pedagogy.report.read", templateKind: "report",
      contextKind: "school",
    }),
    descriptor({
      id: "school-student-summary-class", type: "student-summary", label: "Récapitulatif élève — classe affectée",
      description: "Fiche structurée limitée aux élèves actifs de la classe réellement affectée.",
      sourceModule: "school", nature: "FICHE", permission: "school.student.read", templateKind: "sheet",
      includeActiveStudent: true, contextKind: "class",
    }),
    descriptor({
      id: "school-class-register", type: "class-register", label: "Liste de classe affectée",
      description: "Liste imprimable limitée à la classe réellement affectée.",
      sourceModule: "school", nature: "REGISTRE/LISTE IMPRIMABLE", permission: "school.class.read", templateKind: "register",
      contextKind: "class",
    }),
    descriptor({
      id: "pedagogy-subject-register", type: "subject-register", label: "Liste de matière affectée",
      description: "Liste pédagogique limitée à la matière réellement affectée.",
      sourceModule: "pedagogy", nature: "REGISTRE/LISTE IMPRIMABLE", permission: "pedagogy.subject.read", templateKind: "register",
      contextKind: "subject",
    }),
    descriptor({
      id: "school-card-preparation", type: "student-card-preparation", label: "Préparation carte élève existante",
      description: "Adaptateur d’aperçu uniquement vers le sous-système carte protégé.",
      sourceModule: "school", nature: "CARTE/BADGE", permission: "security.card.create", templateKind: "card-adapter",
      formats: ["png"], actions: ["preview"], requiresActiveStudent: true,
      contextKind: "school",
      officialBoundary: "Safe Control — transmission et impression réelles BACKEND_LATER · carte existante intacte",
    }),
  ];

  var columnsByType = {
    "class-register": ["Matricule", "Nom", "Classe", "Statut"],
    "subject-register": ["Matière", "Classe", "Enseignant", "Période"],
  };

  async function getTemplate(descriptorId) {
    var item = descriptors.find(function (entry) { return entry.id === descriptorId; });
    if (!item) throw new Error("School/pedagogy document not found: " + descriptorId);
    if (item.templateKind === "assignment") {
      var assignmentModule = await import("../document-engine/templates/assignment-template.js");
      return assignmentModule.assignmentTemplate;
    }
    if (item.templateKind === "answer-sheet") {
      var answerModule = await import("../document-engine/templates/answer-sheet-template.js");
      return answerModule.answerSheetTemplate;
    }
    if (item.templateKind === "card-adapter") return null;
    var engine = await import("../document-engine/index.js");
    var headers = columnsByType[item.type] || [];
    return engine.createUniversalDocumentTemplate({
      type: item.type,
      label: item.label,
      sourceModule: item.sourceModule,
      kind: item.templateKind,
      permissions: [item.permission],
      columns: headers.map(function (header) { return { header: header, width: 120 }; }),
    });
  }

  async function openCardPreparation(descriptorValue, user, mode) {
    if (!root.SchoolSafeStudentCardPreparation || typeof root.SchoolSafeStudentCardPreparation.open !== "function") return false;
    var context = descriptorValue && descriptorValue.context ? descriptorValue.context : {};
    var student = context.student || null;
    if (!student && mode === "live" && context.studentId && root.SchoolSafeSchoolAPI && typeof root.SchoolSafeSchoolAPI.getStudent === "function") {
      try {
        student = await root.SchoolSafeSchoolAPI.getStudent(context.studentId);
      } catch (error) {
        return false;
      }
    }
    if (!student || String(student.id || "") !== String(context.studentId || "")) return false;
    if (String(student.lifecycle_status || student.lifecycleStatus || "").toLowerCase() !== "active") return false;
    root.SchoolSafeStudentCardPreparation.open(student, user || {});
    return true;
  }

  function register(options) {
    if (!root.SchoolSafeDocumentCenter || !options || typeof options.buildDescriptors !== "function") {
      descriptors = [];
      return [];
    }
    descriptors = options.buildDescriptors(blueprints);
    return root.SchoolSafeDocumentCenter.registerMany(descriptors);
  }

  root.SchoolSafeSchoolPedagogyDocuments = {
    register: register,
    list: function () { return descriptors.map(function (item) { return Object.assign({}, item); }); },
    getTemplate: getTemplate,
    openCardPreparation: openCardPreparation,
  };
}(window));
