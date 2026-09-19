// SchoolSafe V2 — Contrôle et rapports — moteur frontend de démonstration.
// Historiques, audit des actions, rapports administratifs et exports simulés.
(function (root) {
  "use strict";

  var activeTab = "history";
  var HISTORY = [
    { date: "2026-09-17 08:12", actor: "Direction — profil démo", domain: "École", action: "Consultation de la liste des élèves", detail: "Filtrage par classe · lecture seule", status: "LU" },
    { date: "2026-09-17 07:55", actor: "Gardien — profil démo", domain: "Sécurité", action: "Scan d’entrée (QR)", detail: "Élève démo · portail principal · décision AUTORISÉ", status: "ÉVÉNEMENT" },
    { date: "2026-09-16 16:40", actor: "Caissier — profil démo", domain: "Finance", action: "Encaissement", detail: "Reçu démo · statut simulé EN_CAISSE", status: "ÉVÉNEMENT" },
    { date: "2026-09-16 11:20", actor: "Enseignant — profil démo", domain: "Pédagogie", action: "Publication de notes", detail: "Classe démo · publication filtrée par portée", status: "ÉVÉNEMENT" },
    { date: "2026-09-15 09:03", actor: "Administration — profil démo", domain: "Administration", action: "Génération d’attestation", detail: "Document démo · BACKEND_LATER", status: "BROUILLON" }
  ];
  var AUDIT = [
    { time: "2026-09-17 09:41", actor: "Administrateur principal", action: "Attribution de rôle", target: "Compte enseignant démo", result: "SUCCÈS", reason: "Affectation classe démo" },
    { time: "2026-09-17 09:12", actor: "Administrateur principal", action: "Retrait de permission", target: "Rôle caissier démo", result: "SUCCÈS", reason: "Réduction de périmètre (délégation bornée)" },
    { time: "2026-09-16 15:28", actor: "Directeur — profil démo", action: "Correction de pointage", target: "Présence élève démo", result: "SUCCÈS", reason: "Oubli d’entrée · événement original conservé" },
    { time: "2026-09-16 14:02", actor: "Système", action: "Refus d’accès", target: "Route /native/access", result: "REFUS", reason: "school.scope mismatch — simulation" }
  ];
  var REPORTS = [
    { name: "Rapport journalier des présences", domain: "Sécurité", permission: "reports.security.read", period: "Journée", state: "DÉMO" },
    { name: "Statistiques de retards et absences", domain: "Sécurité", permission: "reports.security.read", period: "Semaine / Mois", state: "DÉMO" },
    { name: "Rapport de caisse", domain: "Finance", permission: "reports.financial.read", period: "Journée", state: "DÉMO" },
    { name: "Impayés et soldes par classe", domain: "Finance", permission: "reports.financial.read", period: "Mois", state: "DÉMO" },
    { name: "Rapport de paie et contrats", domain: "RH", permission: "reports.hr.read", period: "Mois", state: "DÉMO" },
    { name: "Activité opérationnelle consolidée", domain: "Transversal", permission: "reports.operational.read", period: "Personnalisée", state: "DÉMO" }
  ];
  var EXPORTS = [
    { format: "PDF", name: "Bulletin simplifié", detail: "Par élève · lecture uniquement", state: "SIMULATION" },
    { format: "PDF", name: "Rapport de caisse", detail: "Journée clôturée", state: "SIMULATION" },
    { format: "XLSX", name: "Liste des élèves", detail: "Classe sélectionnée · champs autorisés", state: "SIMULATION" },
    { format: "XLSX", name: "Journal des présences", detail: "Période sélectionnée", state: "SIMULATION" },
    { format: "CSV", name: "Journal d’audit", detail: "Actions administratives", state: "SIMULATION" }
  ];

  function escapeMarkup(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function user() {
    if (root.SchoolSafeAppContext && typeof root.SchoolSafeAppContext.getCurrentUser === "function") return root.SchoolSafeAppContext.getCurrentUser();
    return { permissions: [], scopes: [] };
  }

  function allowsFor(subject, permission, scope) {
    var access = root.SchoolSafeAccess;
    return !!(access && typeof access.allowsScope === "function" && access.allowsScope(subject, permission, scope));
  }

  function canReadReports(subject) {
    var s = subject || user();
    return allowsFor(s, "reports.operational.read", "school")
      || allowsFor(s, "reports.financial.read", "school")
      || allowsFor(s, "reports.security.read", "school")
      || allowsFor(s, "reports.hr.read", "school");
  }

  function statusChip(value) {
    var tone = /SUCCÈS|AUTORISÉ|COMPLET/i.test(value) ? "ok" : /REFUS|ÉCHEC/i.test(value) ? "ko" : "neutral";
    return '<span class="ss-chip ss-chip--' + tone + '">' + escapeMarkup(value) + "</span>";
  }

  function renderTable(headers, rows) {
    var thead = "<tr>" + headers.map(function (h) { return "<th>" + escapeMarkup(h) + "</th>"; }).join("") + "</tr>";
    var tbody = rows.map(function (row) {
      return "<tr>" + row.map(function (cell) {
        var safe = escapeMarkup(cell);
        return "<td>" + (/^(SUCCÈS|REFUS|ÉVÉNEMENT|LU|BROUILLON|DÉMO|SIMULATION)$/.test(cell) ? statusChip(cell) : safe) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    return '<table class="ss-table"><thead>' + thead + "</thead><tbody>" + tbody + "</tbody></table>";
  }

  function renderDenied(message) {
    return '<div class="ss-empty"><i data-lucide="lock"></i><p>' + escapeMarkup(message) + "</p></div>";
  }

  function renderHistory() {
    return "<h3>Historiques</h3><p class=\"ss-muted\">Journal des consultations et événements récents — données fictives.</p>"
      + renderTable(["Date", "Acteur", "Domaine", "Action", "Détail", "Statut"], HISTORY.map(function (h) {
        return [h.date, h.actor, h.domain, h.action, h.detail, h.status];
      }));
  }

  function renderAudit() {
    return "<h3>Audit des actions</h3><p class=\"ss-muted\">Traçabilité des actions sensibles : qui, quoi, cible, résultat, motif.</p>"
      + renderTable(["Horodatage", "Acteur", "Action", "Cible", "Résultat", "Motif"], AUDIT.map(function (a) {
        return [a.time, a.actor, a.action, a.target, a.result, a.reason];
      }));
  }

  function renderAdministrative() {
    return "<h3>Rapports administratifs</h3><p class=\"ss-muted\">Chaque rapport exige sa permission reports.* en portée école.</p>"
      + renderTable(["Rapport", "Domaine", "Permission requise", "Période", "État"], REPORTS.map(function (r) {
        return [r.name, r.domain, r.permission, r.period, r.state];
      }));
  }

  function renderExports() {
    return "<h3>Exports PDF et Excel</h3><p class=\"ss-muted\">Génération simulée — aucun fichier produit, aucun appel réseau.</p>"
      + renderTable(["Format", "Document", "Contenu", "État"], EXPORTS.map(function (e) {
        return [e.format, e.name, e.detail, e.state];
      }))
      + '<p class="ss-muted">Les exports réels seront produits par le serveur après contrôle d’accès (BACKEND_LATER).</p>';
  }

  function render() {
    var content = document.getElementById("reportsContent");
    if (!content) return;
    var subject = user();
    if (!canReadReports(subject)) {
      content.innerHTML = renderDenied("Aucune permission reports.* (portée school) : consultation refusée.");
      return;
    }
    content.innerHTML = activeTab === "audit" ? renderAudit()
      : activeTab === "administrative" ? renderAdministrative()
      : activeTab === "exports" ? renderExports()
      : renderHistory();
    if (root.lucide && typeof root.lucide.createIcons === "function") root.lucide.createIcons();
  }

  function open(tab) {
    activeTab = tab || "history";
    document.querySelectorAll("#reportsTabs [data-reports-tab]").forEach(function (button) {
      var isActive = button.getAttribute("data-reports-tab") === activeTab;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    render();
  }

  function close() {
    var module = document.getElementById("reportsModule");
    if (module) module.hidden = true;
  }

  function bindTabs() {
    document.querySelectorAll("#reportsTabs [data-reports-tab]").forEach(function (button) {
      button.addEventListener("click", function () { open(button.getAttribute("data-reports-tab")); });
    });
  }

  document.addEventListener("DOMContentLoaded", bindTabs);

  // — Raccordement JASPE — JASPE agit avec les droits du profil, jamais davantage.
  function normalizeJaspeText(value) {
    return String(value == null ? "" : value).toLowerCase()
      .replace(/[’']/g, "'").replace(/[èéê]/g, "e").replace(/[àâ]/g, "a").replace(/ç/g, "c")
      .replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
  }

  function jaspeRefusal(message) {
    return { allowed: false, refusal: true, action: null, message: "REFUS — " + message };
  }

  function answerJaspe(query, context) {
    var text = normalizeJaspeText(query);
    var subject = context && context.user ? context.user : user();
    var reportsIntent = /rapport|audit|historique|journal|export|controle d activite|trace|presences.*jour|statistiques.*(retard|absence)/.test(text);
    if (!reportsIntent) return null;
    if (!allowsFor(subject, "safe.assistant.use", "own")) return jaspeRefusal("safe.assistant.use avec portée own est obligatoire.");

    var forbidden = /(cree|creer|modifie|modifier|supprime|supprimer|efface|effacer).*(rapport|audit|historique|journal)|(falsifie|falsifier|altere|alterer).*(trace|audit)/.test(text);
    if (forbidden) return jaspeRefusal("Jaspe ne crée, modifie ni supprime aucun rapport, audit ou historique officiel.");

    if (!canReadReports(subject)) return jaspeRefusal("Au moins une permission reports.* (portée school) est requise ; aucune donnée de contrôle n'est révélée.");

    var action = /audit|action|traca/.test(text) ? "audit"
      : /export|pdf|excel|csv/.test(text) ? "exports"
      : /administratif/.test(text) ? "administrative"
      : "history";

    return { allowed: true, refusal: false, action: action, message: "Contrôle et rapports : consultez l'historique, l'audit des actions et les rapports administratifs en lecture seule (permissions reports.* en portée école). Les exports et rapports réels restent produits par le serveur (BACKEND_LATER)." };
  }

  root.SchoolSafeReportsDemo = {
    render: render,
    open: open,
    close: close,
    canReadReports: canReadReports,
    answerJaspe: answerJaspe
  };
})(window);