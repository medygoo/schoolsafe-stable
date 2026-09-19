/* Jaspe Documents — lecture et proposition strictement bornées aux documents visibles. */
(function (root) {
  "use strict";

  var GENERIC_TERMS = ["document", "documents", "pdf", "centre", "trouve", "trouver", "montre", "montrer", "propose", "apercu", "imprime", "imprimer", "telecharge", "pedagogique", "pedagogiques"];

  function assistantAllowed(user) {
    var access = root.SchoolSafeAccess;
    if (!user || !access) return false;
    if (typeof access.explicitDeny === "function" && access.explicitDeny(user, "safe.assistant.use")) return false;
    return typeof access.allowsScope === "function" && access.allowsScope(user, "safe.assistant.use", "own");
  }

  function visibleDocuments(user) {
    if (!root.SchoolSafeDocumentCenter || !assistantAllowed(user)) return [];
    return root.SchoolSafeDocumentCenter.visibleDocuments(user);
  }

  function answer(raw, context) {
    var query = normalize(raw);
    if (!query) return null;

    var dangerous = isForbiddenRequest(query);
    if (!dangerous && !isDocumentIntent(query)) return null;

    var user = context && context.user
      ? context.user
      : root.SchoolSafeAppContext && typeof root.SchoolSafeAppContext.getCurrentUser === "function"
        ? root.SchoolSafeAppContext.getCurrentUser()
        : null;
    if (!assistantAllowed(user)) return refusal("Jaspe Documents exige safe.assistant.use avec la portée own.");
    if (dangerous) {
      return refusal("Jaspe peut expliquer ou proposer un aperçu PDF autorisé, mais ne peut ni fabriquer un document officiel, ni signer, valider, archiver, modifier une carte ou changer une portée.");
    }

    var visible = visibleDocuments(user);
    var matches = matchingDocuments(query, visible);
    var target = matches[0] || null;
    var asksPdf = /\bpdf\b|telecharg|imprim/.test(query);

    if (target && asksPdf) {
      var canPdf = target.formats.indexOf("pdf") >= 0 &&
        root.SchoolSafeDocumentCenter.canAccessDescriptor(user, target, "pdf");
      if (!canPdf) {
        return {
          allowed: true,
          unavailable: true,
          documentId: target.id,
          message: "Le PDF est indisponible pour ce document visible. Jaspe n’élargit ni le format, ni la permission, ni la portée ; utilisez uniquement l’aperçu proposé par le Centre de documents.",
        };
      }
      return {
        allowed: true,
        action: "documents",
        documentId: target.id,
        proposedAction: "pdf",
        message: "APERÇU PDF autorisé : « " + target.label + " ». Ouvrez le Centre de documents pour générer le BROUILLON frontend ; aucune sortie n’est officielle ni archivée.",
      };
    }

    if (target) {
      return {
        allowed: true,
        action: "documents",
        documentId: target.id,
        message: "Document visible : « " + target.label + " ». " + target.description + " Portée appliquée : " + target.scope + ". " + target.officialBoundary,
      };
    }

    if (isGeneralDiscovery(query)) {
      if (!visible.length) return refusal("Aucun document n’est visible avec vos permissions et portées actuelles.");
      return {
        allowed: true,
        action: "documents",
        documentIds: visible.map(function (item) { return item.id; }),
        message: "Centre de documents — documents visibles : " + visible.slice(0, 6).map(function (item) { return item.label; }).join(" · ") + ". Jaspe ne montre aucun document hors de votre portée.",
      };
    }

    return refusal("Ce document est indisponible dans votre périmètre actuel. Jaspe ne confirme ni le nom ni le contenu d’un document interdit.");
  }

  function matchingDocuments(query, documents) {
    var queryTerms = terms(query);
    return documents.map(function (document) {
      var searchable = normalize([document.label, document.type, document.sourceModule, document.nature].join(" "));
      var score = queryTerms.reduce(function (total, term) { return total + (searchable.indexOf(term) >= 0 ? 1 : 0); }, 0);
      return { document: document, score: score };
    }).filter(function (item) { return item.score > 0; })
      .sort(function (left, right) { return right.score - left.score; })
      .map(function (item) { return item.document; });
  }

  function terms(query) {
    return query.split(/[^a-z0-9]+/).filter(function (term) {
      return term.length > 2 && GENERIC_TERMS.indexOf(term) < 0 && ["dans", "avec", "pour", "mes", "mon", "une", "des", "du", "de", "les"].indexOf(term) < 0;
    });
  }

  function isDocumentIntent(query) {
    return /centre de documents|\bdocument|\bpdf\b|telecharg|imprim/.test(query);
  }

  function isGeneralDiscovery(query) {
    return /trouv|liste|affiche|montre|quels|centre de documents/.test(query) && terms(query).length === 0;
  }

  function isForbiddenRequest(query) {
    var action = /fabriqu|invent|cree|creer|sign|valid|archiv|change|modifi|publie|officialis/;
    var target = /document|pdf|recu|bulletin|fiche de paie|carte|badge|rapport|registre|scope|portee/;
    return action.test(query) && target.test(query);
  }

  function refusal(reason) {
    return { allowed: false, refusal: true, message: "REFUS — Je ne peux pas répondre à cette demande. " + reason };
  }

  function normalize(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  root.SchoolSafeDocumentAssistant = {
    answer: answer,
    isAllowed: assistantAllowed,
    visibleDocuments: visibleDocuments,
  };
}(window));
