/* Phase J4 — Adaptateurs Finance / Comptabilité liés au contexte autorisé courant. */
(function (root) {
  "use strict";

  var today = new Date().toISOString().slice(0, 10);
  var common = {
    date: today,
    status: "draft",
    authority: "preview",
    currencyPolicy: "separate-usd-cdf",
    formats: ["pdf"],
    officialBoundary: "APERÇU / BROUILLON frontend · aucune pièce comptable officielle",
  };
  var descriptors = [];

  function descriptor(value) { return Object.assign({}, common, value); }

  var blueprints = [
    descriptor({
      id: "finance-receipt-family", type: "receipt", label: "Reçu familial — aperçu",
      description: "Reçu existant lié à l’enfant autorisé, généré avec le template A5 SchoolSafe.",
      sourceModule: "finance", nature: "DOCUMENT", permission: "finance.receipt.read", templateKind: "receipt",
      contextKind: "child",
    }),
    descriptor({
      id: "finance-cash-report", type: "cash-report", label: "Rapport de caisse par devise",
      description: "Projection de caisse CDF et USD séparée, sans clôture ni total inter-devise.",
      sourceModule: "finance", nature: "REGISTRE/LISTE IMPRIMABLE", permission: "finance.report.read", templateKind: "table",
      contextKind: "school",
    }),
    descriptor({
      id: "finance-situation-class", type: "financial-situation", label: "Situation financière — classe affectée",
      description: "Récapitulatif financier limité à la classe réellement affectée.",
      sourceModule: "finance", nature: "FICHE", permission: "finance.status.read", templateKind: "sheet",
      contextKind: "class",
    }),
    descriptor({
      id: "finance-register", type: "financial-register", label: "Liste financière autorisée",
      description: "Liste issue de la surface Finance visible, jamais un registre légal.",
      sourceModule: "finance", nature: "REGISTRE/LISTE IMPRIMABLE", permission: "finance.report.read", templateKind: "register",
      contextKind: "school",
    }),
    descriptor({
      id: "accounting-summary", type: "accounting-summary", label: "Synthèse comptable frontend",
      description: "Agrégats déjà visibles, sans écriture, débit/crédit ni valeur légale.",
      sourceModule: "accounting", nature: "DOCUMENT", permission: "reports.financial.read", templateKind: "report",
      contextKind: "school",
    }),
    descriptor({
      id: "accounting-treasury-report", type: "treasury-report", label: "Trésorerie par devise — aperçu",
      description: "Entrées et sorties visibles regroupées séparément en CDF et USD, sans conversion.",
      sourceModule: "accounting", nature: "REGISTRE/LISTE IMPRIMABLE", permission: "reports.financial.read", templateKind: "table",
      contextKind: "school",
    }),
  ];

  var columnsByType = {
    "cash-report": ["Date", "Référence", "Mode", "CDF", "USD"],
    "financial-register": ["Référence", "Libellé", "Statut", "Devise", "Montant"],
    "treasury-report": ["Date", "Nature", "Référence", "Entrée", "Sortie", "Devise"],
  };

  async function getTemplate(descriptorId) {
    var item = descriptors.find(function (entry) { return entry.id === descriptorId; });
    if (!item) throw new Error("Finance/accounting document not found: " + descriptorId);
    if (item.templateKind === "receipt") {
      var receiptModule = await import("../document-engine/templates/receipt-template.js");
      return receiptModule.receiptTemplate;
    }
    var engine = await import("../document-engine/index.js");
    var headers = columnsByType[item.type] || [];
    return engine.createUniversalDocumentTemplate({
      type: item.type,
      label: item.label,
      sourceModule: item.sourceModule,
      kind: item.templateKind,
      permissions: [item.permission],
      columns: headers.map(function (header) { return { header: header, width: 105 }; }),
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

  root.SchoolSafeFinanceAccountingDocuments = {
    register: register,
    list: function () { return descriptors.map(function (item) { return Object.assign({}, item); }); },
    getTemplate: getTemplate,
  };
}(window));
