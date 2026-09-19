/* Phase J6 — Rapports opérationnels frontend liés à l’école autorisée courante. */
(function (root) {
  "use strict";

  var today = new Date().toISOString().slice(0, 10);
  var common = {
    date: today,
    status: "draft",
    formats: ["pdf"],
    authority: "preview",
    currencyPolicy: "not-applicable",
    dataBoundary: "aggregates-only",
    officialBoundary: "Synthèse frontend · aucune valeur officielle",
  };
  var descriptors = [];

  function descriptor(value) { return Object.assign({}, common, value); }

  var blueprints = [
    descriptor({
      id: "security-summary", type: "security-report", label: "Synthèse Sécurité école",
      description: "Agrégats d’événements de sécurité déjà visibles, sans identité sensible détaillée.",
      sourceModule: "security", nature: "DOCUMENT", permission: "reports.security.read", templateKind: "report",
      contextKind: "school",
    }),
    descriptor({
      id: "security-events-summary", type: "security-events-summary", label: "Événements Sécurité agrégés",
      description: "Liste synthétique des catégories et états, sans donnée corporelle ou de santé.",
      sourceModule: "security", nature: "REGISTRE/LISTE IMPRIMABLE", permission: "reports.security.read", templateKind: "table",
      contextKind: "school",
    }),
    descriptor({
      id: "hr-summary", type: "hr-report", label: "Synthèse RH frontend",
      description: "Indicateurs RH non sensibles, sans décision ni valeur juridique.",
      sourceModule: "hr", nature: "DOCUMENT", permission: "reports.hr.read", templateKind: "report",
      contextKind: "school",
    }),
    descriptor({
      id: "hr-attendance-summary", type: "staff-attendance-summary", label: "Présence personnel — synthèse",
      description: "Agrégats de présence déjà autorisés, sans pointage individuel exporté.",
      sourceModule: "hr", nature: "REGISTRE/LISTE IMPRIMABLE", permission: "reports.hr.read", templateKind: "table",
      contextKind: "school",
    }),
    descriptor({
      id: "hr-absence-summary", type: "staff-absence-summary", label: "Absences personnel — synthèse",
      description: "Volumes agrégés, sans motif privé ni décision.",
      sourceModule: "hr", nature: "DOCUMENT", permission: "reports.hr.read", templateKind: "report",
      contextKind: "school",
    }),
    descriptor({
      id: "inventory-operational-summary", type: "inventory-summary", label: "Synthèse Stock / Inventaire",
      description: "Agrégats opérationnels, sans article ou tiers détaillé.",
      sourceModule: "inventory", nature: "DOCUMENT", permission: "reports.operational.read", templateKind: "report",
      contextKind: "school",
    }),
    descriptor({
      id: "inventory-levels-report", type: "stock-levels-report", label: "Niveaux et seuils — synthèse",
      description: "Répartition agrégée des niveaux, seuils et ruptures préparatoires.",
      sourceModule: "inventory", nature: "REGISTRE/LISTE IMPRIMABLE", permission: "reports.operational.read", templateKind: "table",
      contextKind: "school",
    }),
    descriptor({
      id: "inventory-movements-report", type: "stock-movements-report", label: "Mouvements Stock — synthèse",
      description: "Totaux agrégés des mouvements, sans ligne commerciale détaillée.",
      sourceModule: "inventory", nature: "REGISTRE/LISTE IMPRIMABLE", permission: "reports.operational.read", templateKind: "table",
      contextKind: "school",
    }),
    descriptor({
      id: "inventory-procurement-summary", type: "procurement-summary", label: "Achats internes — synthèse",
      description: "États agrégés du workflow interne, sans coordonnées ni conditions commerciales tierces.",
      sourceModule: "inventory", nature: "DOCUMENT", permission: "reports.operational.read", templateKind: "report",
      contextKind: "school",
    }),
  ];

  var columnsByType = {
    "security-events-summary": ["Catégorie", "Période", "Volume", "État"],
    "staff-attendance-summary": ["Période", "Présents", "Absents", "À contrôler"],
    "stock-levels-report": ["Catégorie", "Normal", "Bas", "Rupture"],
    "stock-movements-report": ["Période", "Entrées", "Sorties", "Ajustements"],
  };

  var boundaries = Object.freeze({
    payroll: "BACKEND_LATER · PERMISSION FUTURE REQUISE pour toute sortie de paie",
    hrContract: "BACKEND_LATER · PERMISSION FUTURE REQUISE pour tout contrat engageant",
    biometric: "BACKEND_LATER · PERMISSION FUTURE REQUISE ; aucune donnée corporelle exportée",
    medical: "BACKEND_LATER · PERMISSION FUTURE REQUISE ; aucune donnée de santé exportée",
    supplier: "BACKEND_LATER · PERMISSION FUTURE REQUISE pour les informations commerciales tierces",
    officialInventory: "BACKEND_LATER · PERMISSION FUTURE REQUISE pour toute validation d’inventaire",
  });

  async function getTemplate(descriptorId) {
    var item = descriptors.find(function (entry) { return entry.id === descriptorId; });
    if (!item) throw new Error("Operational document not found: " + descriptorId);
    var engine = await import("../document-engine/index.js");
    var headers = columnsByType[item.type] || [];
    return engine.createUniversalDocumentTemplate({
      type: item.type,
      label: item.label,
      sourceModule: item.sourceModule,
      kind: item.templateKind,
      permissions: [item.permission],
      columns: headers.map(function (header) { return { header: header, width: 125 }; }),
    });
  }

  function register(options) {
    if (!root.SchoolSafeDocumentCenter || !options || typeof options.buildDescriptors !== "function") {
      descriptors = [];
      return [];
    }
    descriptors = options.buildDescriptors(blueprints);
    return root.SchoolSafeDocumentCenter.registerMany(descriptors);
  }

  root.SchoolSafeOperationalDocuments = {
    register: register,
    list: function () { return descriptors.map(function (item) { return Object.assign({}, item); }); },
    getTemplate: getTemplate,
    boundaries: boundaries,
  };
}(window));
