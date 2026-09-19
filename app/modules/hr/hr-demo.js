// SchoolSafe V2 — Phase H — Personnel / RH frontend de démonstration uniquement.
(function (root) {
  "use strict";

  var activeTab = "dashboard";
  var sessionOverride = null;
  var staffFilters = { search: "", status: "" };
  var selectedStaffId = "hr-demo-1";
  var STAFF_DRAFTS_STORAGE_KEY = "schoolsafe-v2-hr-staff-drafts";
  var STAFF = [
    { id: "hr-demo-1", hrId: "HR-DEM-001", firstName: "Aline", lastName: "Kalala", gender: "F", job: "Enseignante", service: "Primaire", status: "ACTIF", entryDate: "2023-09-04", contact: "aline.kalala@example.test", assignment: "4e A · Français", history: ["Entrée démo · 04/09/2023", "Affectation démo · Primaire"] },
    { id: "hr-demo-2", hrId: "HR-DEM-002", firstName: "Patrick", lastName: "Mbala", gender: "M", job: "Enseignant", service: "Secondaire", status: "ACTIF", entryDate: "2022-08-29", contact: "patrick.mbala@example.test", assignment: "6e A · Mathématiques", history: ["Entrée démo · 29/08/2022"] },
    { id: "hr-demo-3", hrId: "HR-DEM-003", firstName: "Chantal", lastName: "Lukusa", gender: "F", job: "Secrétaire", service: "Administration", status: "ACTIF", entryDate: "2021-01-11", contact: "chantal.lukusa@example.test", assignment: "Secrétariat scolaire", history: ["Entrée démo · 11/01/2021"] },
    { id: "hr-demo-4", hrId: "HR-DEM-004", firstName: "Daniel", lastName: "Moke", gender: "M", job: "Gardien", service: "Sécurité", status: "ACTIF", entryDate: "2024-02-05", contact: "daniel.moke@example.test", assignment: "Portail principal", history: ["Entrée démo · 05/02/2024"] },
    { id: "hr-demo-5", hrId: "HR-DEM-005", firstName: "Esther", lastName: "Ilunga", gender: "F", job: "Responsable cantine", service: "Cantine", status: "ACTIF", entryDate: "2020-10-19", contact: "esther.ilunga@example.test", assignment: "Service cantine", history: ["Entrée démo · 19/10/2020"] },
    { id: "hr-demo-6", hrId: "HR-DEM-006", firstName: "Jean", lastName: "Kabeya", gender: "M", job: "Agent administratif", service: "Administration", status: "INACTIF", entryDate: "2019-03-18", contact: "jean.kabeya@example.test", assignment: "Archives · historique", history: ["Entrée démo · 18/03/2019", "Passage INACTIF · simulation"] }
  ];
  var CONTRACTS = [
    { id: "contract-demo-1", reference: "CTR-DEM-001", staffId: "hr-demo-1", type: "Exemple durée déterminée", job: "Enseignante", service: "Primaire", startDate: "2023-09-04", endDate: "2027-08-31", status: "ACTIF", deadline: "31/08/2027", observation: "Contrat fictif de démonstration" },
    { id: "contract-demo-2", reference: "CTR-DEM-002", staffId: "hr-demo-2", type: "Exemple renouvelable", job: "Enseignant", service: "Secondaire", startDate: "2022-08-29", endDate: "2026-09-30", status: "À RENOUVELER", deadline: "30/09/2026", observation: "Échéance à examiner" },
    { id: "contract-demo-3", reference: "CTR-DEM-003", staffId: "hr-demo-6", type: "Exemple mission terminée", job: "Agent administratif", service: "Administration", startDate: "2019-03-18", endDate: "2025-06-30", status: "TERMINÉ", deadline: "Terminée", observation: "Historique fictif conservé" }
  ];
  var ASSIGNMENTS = [
    { id: "assignment-demo-1", staffId: "hr-demo-1", service: "Primaire", job: "Enseignante", className: "4e A", subject: "Français", site: "Bâtiment A", startDate: "2026-09-01", endDate: "" },
    { id: "assignment-demo-2", staffId: "hr-demo-2", service: "Secondaire", job: "Enseignant", className: "6e A", subject: "Mathématiques", site: "Bâtiment B", startDate: "2026-09-01", endDate: "" },
    { id: "assignment-demo-3", staffId: "hr-demo-4", service: "Sécurité", job: "Gardien", className: "Sans objet", subject: "Sans objet", site: "Portail principal", startDate: "2026-01-08", endDate: "" }
  ];
  var ABSENCES = [
    { id: "absence-demo-1", staffId: "hr-demo-2", type: "Absence démo", reason: "Motif administratif non sensible", startDate: "2026-08-27", endDate: "2026-08-27", duration: "1 jour indicatif", observation: "Justificatif non sensible à examiner", status: "SOUMIS — simulation", history: ["Brouillon créé · simulation", "Soumis · simulation"] },
    { id: "absence-demo-2", staffId: "hr-demo-5", type: "Congé préparatoire", reason: "Organisation personnelle", startDate: "2026-09-03", endDate: "2026-09-05", duration: "3 jours indicatifs", observation: "Calendrier à contrôler", status: "EN REVUE", history: ["Demande préparée", "Passage en revue · simulation"] },
    { id: "absence-demo-3", staffId: "hr-demo-4", type: "Absence démo", reason: "Démarche administrative", startDate: "2026-09-12", endDate: "2026-09-12", duration: "1 jour indicatif", observation: "Prêt pour examen humain", status: "PRÊT POUR DÉCISION", history: ["Demande préparée", "Observation ajoutée", "Prêt pour décision · simulation"] }
  ];
  var ATTENDANCE = [
    { id: "attendance-demo-1", staffId: "hr-demo-1", status: "PRÉSENT", entry: "07:31", exit: "16:08", firstEntry: "07:31", lastExit: "16:08", hours: "8 h 37 visibles", history: "Entrée puis sortie", anomaly: "Aucune" },
    { id: "attendance-demo-2", staffId: "hr-demo-2", status: "RETARD", entry: "08:14", exit: "16:22", firstEntry: "08:14", lastExit: "16:22", hours: "8 h 08 visibles", history: "Entrée tardive démo", anomaly: "Retard à expliquer" },
    { id: "attendance-demo-3", staffId: "hr-demo-3", status: "PRÉSENT", entry: "07:42", exit: "16:01", firstEntry: "07:42", lastExit: "16:01", hours: "8 h 19 visibles", history: "Entrée puis sortie", anomaly: "Aucune" },
    { id: "attendance-demo-4", staffId: "hr-demo-4", status: "PRÉSENT", entry: "06:55", exit: "15:10", firstEntry: "06:55", lastExit: "15:10", hours: "8 h 15 visibles", history: "Poste portail", anomaly: "Aucune" },
    { id: "attendance-demo-5", staffId: "hr-demo-5", status: "ABSENT", entry: "—", exit: "—", firstEntry: "—", lastExit: "—", hours: "0 h visible", history: "Aucun passage démo", anomaly: "Absence à rapprocher" },
    { id: "attendance-demo-6", staffId: "hr-demo-6", status: "INACTIF", entry: "—", exit: "—", firstEntry: "—", lastExit: "—", hours: "Sans objet", history: "Profil inactif", anomaly: "Exclu du présentiel" }
  ];
  var CONTRACT_DRAFTS_STORAGE_KEY = "schoolsafe-v2-hr-contract-drafts";
  var ASSIGNMENT_DRAFTS_STORAGE_KEY = "schoolsafe-v2-hr-assignment-drafts";
  var ABSENCE_DRAFTS_STORAGE_KEY = "schoolsafe-v2-hr-absence-drafts";

  function readStaffDrafts() {
    try {
      var parsed = JSON.parse(root.localStorage.getItem(STAFF_DRAFTS_STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) { return {}; }
  }

  function persistStaffDrafts(drafts) {
    try { root.localStorage.setItem(STAFF_DRAFTS_STORAGE_KEY, JSON.stringify(drafts)); } catch (error) {}
  }

  var staffDrafts = readStaffDrafts();

  function readDraftList(key) {
    try {
      var parsed = JSON.parse(root.localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) { return []; }
  }

  function persistDraftList(key, drafts) {
    try { root.localStorage.setItem(key, JSON.stringify(drafts)); } catch (error) {}
  }

  var contractDrafts = readDraftList(CONTRACT_DRAFTS_STORAGE_KEY);
  var assignmentDrafts = readDraftList(ASSIGNMENT_DRAFTS_STORAGE_KEY);
  var absenceDrafts = readDraftList(ABSENCE_DRAFTS_STORAGE_KEY);

  function escapeMarkup(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function user() {
    if (sessionOverride) return sessionOverride;
    if (root.SchoolSafeAppContext && typeof root.SchoolSafeAppContext.getCurrentUser === "function") return root.SchoolSafeAppContext.getCurrentUser();
    return { permissions: [], scopes: [] };
  }

  function allowsFor(subject, permission, scope) {
    var access = root.SchoolSafeAccess;
    return !!(access && typeof access.allowsScope === "function" && access.allowsScope(subject, permission, scope));
  }

  function allows(permission, scope) { return allowsFor(user(), permission, scope); }
  function canReadStaff() { return allows("staff.read", "school"); }
  function canManageStaff() { return allows("staff.manage", "school"); }
  function canReadAttendance() { return allows("staff.attendance.read", "school"); }
  function canReadReports() { return allows("reports.hr.read", "school"); }
  function canAccessHr() { return canReadStaff() || canManageStaff() || canReadAttendance() || canReadReports(); }
  function isLiveSession() { return !!(user() && (user().native === true || user().token)); }

  function renderLiveUnavailable() {
    return '<section class="hr-future" data-hr-live-unavailable role="status"><span>SESSION LIVE</span><h3>DONNÉES INDISPONIBLES</h3><p>Les dossiers, contrats, affectations, absences, présences et statistiques RH réels ne sont pas connectés.</p><span class="hr-boundary-chip">BACKEND_LATER</span></section>';
  }

  function tabAllowed(tab) {
    if (tab === "dashboard") return canAccessHr();
    if (tab === "staff" || tab === "contracts" || tab === "assignments") return canReadStaff() || canManageStaff();
    if (tab === "absence") return canReadStaff() || canManageStaff() || canReadReports();
    if (tab === "attendance" || tab === "biometric") return canReadAttendance();
    if (tab === "payroll" || tab === "reports") return canReadReports();
    return false;
  }

  function metric(label, value, icon) {
    return '<article class="hr-dashboard-metric"><span><i data-lucide="' + icon + '"></i></span><div><small>' + escapeMarkup(label) + '</small><b>' + escapeMarkup(value) + "</b></div></article>";
  }

  function shortcut(tab, label, icon) {
    return '<button type="button" class="hr-dashboard-action" data-hr-open="' + tab + '"><i data-lucide="' + icon + '"></i><span>' + escapeMarkup(label) + "</span></button>";
  }

  function renderDashboard() {
    var metrics = [
      metric("Effectif visible", canReadStaff() ? "6 profils démo" : "Accès limité", "users"),
      metric("Actifs / inactifs", canReadStaff() ? "5 / 1" : "Non visible", "user-check"),
      metric("Présents aujourd’hui", canReadAttendance() ? "4 démo" : "Permission requise", "badge-check"),
      metric("Absents", canReadAttendance() ? "1 démo" : "Permission requise", "user-x"),
      metric("Retards", canReadAttendance() ? "1 démo" : "Permission requise", "clock-alert"),
      metric("Contrats à surveiller", canReadStaff() ? "2 échéances démo" : "Non visible", "files"),
      metric("Affectations", canReadStaff() ? "6 projections" : "Non visible", "user-cog"),
      metric("Demandes en préparation", canManageStaff() ? "2 brouillons locaux" : "Lecture seule", "calendar-x"),
      metric("Rapports RH", canReadReports() ? "Synthèses frontend" : "Permission requise", "file-chart-column"),
      metric("Alertes / échéances", canAccessHr() ? "3 signaux démo" : "Non visible", "triangle-alert")
    ].join("");
    var shortcuts = [
      ["staff", "Personnel", "contact-round"],
      ["contracts", "Contrats", "files"],
      ["assignments", "Affectations", "user-cog"],
      ["absence", "Absences", "calendar-x"],
      ["attendance", "Présence", "clipboard-check"],
      ["biometric", "Biométrie", "scan-face"],
      ["payroll", "Paie", "banknote"],
      ["reports", "Rapports RH", "file-chart-column"]
    ].filter(function (item) { return tabAllowed(item[0]); }).map(function (item) { return shortcut(item[0], item[1], item[2]); }).join("");
    return '<section class="hr-dashboard" data-hr-dashboard><header><div><span>Personnel / Ressources humaines</span><h3>Tableau de bord RH</h3><p>Projection frontend non sensible, sans donnée officielle ni décision RH.</p></div><span class="hr-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><aside class="hr-boundary"><i data-lucide="shield-check"></i><p>Permissions existantes uniquement · portées school / own · DENY explicite prioritaire.</p></aside><div class="hr-dashboard-grid">' + metrics + '</div><section class="hr-shortcuts"><header><span>Raccourcis autorisés</span><h3>Accès selon permission et portée</h3></header><div>' + shortcuts + "</div></section></section>";
  }

  function renderDenied() {
    return '<section class="hr-denied">' + root.ssState({ type: "error", title: "Ressources humaines non autorisées", message: "Une permission RH existante avec portée school est obligatoire.", details: "DENY explicite prioritaire · aucune donnée RH générale n’est révélée." }) + "</section>";
  }

  function selectedStaff() {
    return STAFF.find(function (member) { return member.id === selectedStaffId; }) || STAFF[0];
  }

  function visibleStaff() {
    var search = String(staffFilters.search || "").toLowerCase();
    return STAFF.filter(function (member) {
      if (staffFilters.status && member.status !== staffFilters.status) return false;
      if (search && [member.hrId, member.firstName, member.lastName, member.job, member.service, member.assignment].join(" ").toLowerCase().indexOf(search) < 0) return false;
      return true;
    });
  }

  function renderStaffDenied() {
    return root.ssState({ type: "error", title: "Dossier personnel non autorisé", message: "staff.read avec portée school est obligatoire pour consulter le personnel.", details: "staff.manage ne remplace pas staff.read · DENY explicite prioritaire." });
  }

  function renderStaffOriginal(member) {
    return '<article class="hr-staff-dossier" data-hr-staff-original="' + member.id + '"><header><div><span>' + escapeMarkup(member.hrId) + '</span><h3>' + escapeMarkup(member.firstName + " " + member.lastName) + '</h3></div><span class="hr-status">' + escapeMarkup(member.status) + '</span></header><dl><div><dt>Fonction</dt><dd>' + escapeMarkup(member.job) + '</dd></div><div><dt>Service</dt><dd>' + escapeMarkup(member.service) + '</dd></div><div><dt>Date d’entrée</dt><dd>' + escapeMarkup(member.entryDate) + '</dd></div><div><dt>Contact professionnel fictif</dt><dd>' + escapeMarkup(member.contact) + '</dd></div><div><dt>Affectation principale</dt><dd>' + escapeMarkup(member.assignment) + '</dd></div></dl><section><h4>Historique synthétique</h4><ul>' + member.history.map(function (item) { return '<li>' + escapeMarkup(item) + '</li>'; }).join("") + '</ul><small>Fiche originale de démonstration · aucune suppression d’historique.</small></section></article>';
  }

  function renderStaffDraft(member) {
    var draft = staffDrafts[member.id];
    if (!draft) return "";
    return '<article class="hr-staff-draft" data-hr-staff-draft="' + member.id + '"><header><div><span>BROUILLON LOCAL</span><h4>Modification préparée distincte</h4></div><span class="hr-boundary-chip">BACKEND_LATER</span></header><dl><div><dt>Fonction préparée</dt><dd>' + escapeMarkup(draft.job) + '</dd></div><div><dt>Service préparé</dt><dd>' + escapeMarkup(draft.service) + '</dd></div><div><dt>Statut préparé</dt><dd>' + escapeMarkup(draft.status) + '</dd></div><div><dt>Affectation préparée</dt><dd>' + escapeMarkup(draft.assignment) + '</dd></div></dl><p>' + escapeMarkup(draft.observation || "Aucune observation") + '</p><small>Source conservée : ' + escapeMarkup(member.hrId) + ' · aucune modification officielle.</small></article>';
  }

  function staffOptions(values, current) {
    return values.map(function (value) { return '<option value="' + escapeMarkup(value) + '"' + (value === current ? " selected" : "") + '>' + escapeMarkup(value) + '</option>'; }).join("");
  }

  function renderStaffForm(member) {
    if (!canManageStaff()) return '<aside class="hr-boundary"><i data-lucide="lock-keyhole"></i><p>Lecture seule · staff.manage avec portée school est requis pour préparer un brouillon.</p></aside>';
    var draft = staffDrafts[member.id] || member;
    return '<form class="hr-staff-form" data-hr-staff-form data-staff-id="' + member.id + '"><header><div><span>Préparation locale</span><h4>Modifier sans toucher à l’original</h4></div><span class="hr-boundary-chip">BROUILLON LOCAL</span></header><label>Fonction<input name="job" value="' + escapeMarkup(draft.job) + '" required></label><label>Service<select name="service">' + staffOptions(["Primaire", "Secondaire", "Administration", "Sécurité", "Cantine"], draft.service) + '</select></label><label>Statut<select name="status">' + staffOptions(["ACTIF", "SUSPENDU ADMINISTRATIVEMENT — simulation", "INACTIF", "SORTI"], draft.status) + '</select></label><label>Affectation<input name="assignment" value="' + escapeMarkup(draft.assignment) + '" required></label><label class="hr-form-wide">Observation RH<textarea name="observation" rows="3">' + escapeMarkup(draft.observation || "") + '</textarea></label><button class="ss-button ss-button--primary" type="submit">Préparer la modification</button><p class="hr-form-wide">BACKEND_LATER · aucun statut, licenciement ou dossier officiel n’est modifié.</p></form>';
  }

  function renderStaff() {
    if (!canReadStaff()) return '<section class="hr-staff-denied">' + renderStaffDenied() + '</section>';
    var rows = visibleStaff();
    var member = selectedStaff();
    return '<section class="hr-staff" data-hr-staff><header><div><span>Dossier personnel</span><h3>Personnel visible</h3><p>Données fictives non sensibles · consultation school.</p></div><span class="hr-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><div class="hr-staff-filters"><label>Rechercher<input data-hr-staff-filter="search" type="search" value="' + escapeMarkup(staffFilters.search) + '" placeholder="Nom, identifiant, fonction"></label><label>Statut<select data-hr-staff-filter="status"><option value="">Tous</option>' + staffOptions(["ACTIF", "INACTIF"], staffFilters.status) + '</select></label></div><div class="hr-staff-layout"><div class="hr-staff-list">' + (rows.length ? rows.map(function (item) { return '<button type="button" data-hr-staff-row="' + item.id + '" class="' + (item.id === member.id ? "active" : "") + '"><span><b>' + escapeMarkup(item.firstName + " " + item.lastName) + '</b><small>' + escapeMarkup(item.hrId + " · " + item.job) + '</small></span><span class="hr-status">' + escapeMarkup(item.status) + '</span></button>'; }).join("") : '<p class="hr-empty">Aucun membre ne correspond aux filtres.</p>') + '</div><div class="hr-staff-detail" data-hr-staff-dossier>' + renderStaffOriginal(member) + renderStaffDraft(member) + renderStaffForm(member) + '</div></div></section>';
  }

  function staffById(id) { return STAFF.find(function (member) { return member.id === id; }) || STAFF[0]; }
  function staffMemberOptions(selectedId) {
    return STAFF.map(function (member) { return '<option value="' + member.id + '"' + (member.id === selectedId ? " selected" : "") + '>' + escapeMarkup(member.firstName + " " + member.lastName + " · " + member.hrId) + '</option>'; }).join("");
  }

  function renderContractDrafts() {
    if (!contractDrafts.length) return "";
    return '<section class="hr-draft-list"><header><div><span>BROUILLONS LOCAUX</span><h4>Contrats préparés</h4></div><span class="hr-boundary-chip">BACKEND_LATER</span></header>' + contractDrafts.map(function (draft) { var member = staffById(draft.staffId); return '<article data-hr-contract-draft><small>BROUILLON LOCAL · BACKEND_LATER</small><b>' + escapeMarkup(draft.type) + '</b><span>' + escapeMarkup(member.firstName + " " + member.lastName + " · " + draft.status) + '</span><span>' + escapeMarkup(draft.startDate + " → " + (draft.endDate || "Sans fin préparée")) + '</span><p>' + escapeMarkup(draft.observation || "Aucune observation") + '</p></article>'; }).join("") + '</section>';
  }

  function renderContractForm() {
    if (!canManageStaff()) return '<aside class="hr-boundary"><i data-lucide="lock-keyhole"></i><p>Lecture seule · staff.manage avec portée school est requis pour préparer un contrat.</p></aside>';
    return '<form class="hr-preparation-form" data-hr-contract-form><header><div><span>Préparation locale</span><h4>Nouveau brouillon de contrat</h4></div><span class="hr-boundary-chip">BROUILLON LOCAL</span></header><label>Membre<select name="staffId">' + staffMemberOptions(STAFF[0].id) + '</select></label><label>Type exemple<input name="type" value="Exemple de contrat" required></label><label>Fonction<input name="job" value="Fonction à confirmer" required></label><label>Service<select name="service">' + staffOptions(["Primaire", "Secondaire", "Administration", "Sécurité", "Cantine"], "Primaire") + '</select></label><label>Date début<input name="startDate" type="date" value="2026-09-01" required></label><label>Date fin éventuelle<input name="endDate" type="date"></label><label>Statut<select name="status">' + staffOptions(["BROUILLON", "ACTIF", "À RENOUVELER", "EXPIRÉ", "TERMINÉ"], "BROUILLON") + '</select></label><label>Observation<input name="observation" value=""></label><button class="ss-button ss-button--primary" type="submit">Préparer le contrat</button><p class="hr-form-wide">Types configurables à confirmer · aucune décision ou signature officielle.</p></form>';
  }

  function renderContracts() {
    if (!canReadStaff()) return '<section>' + renderStaffDenied() + '</section>';
    return '<section class="hr-records" data-hr-contracts><header><div><span>Contrats du personnel</span><h3>Échéances visibles</h3><p>Les types présentés comme exemples ne constituent pas une enum juridique fermée.</p></div><span class="hr-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Référence</th><th>Personnel</th><th>Type</th><th>Fonction / service</th><th>Période</th><th>Statut</th><th>Échéance</th><th>Observation</th></tr></thead><tbody>' + CONTRACTS.map(function (contract) { var member = staffById(contract.staffId); return '<tr data-hr-contract-row="' + contract.id + '"><td>' + escapeMarkup(contract.reference) + '</td><td>' + escapeMarkup(member.firstName + " " + member.lastName) + '</td><td>' + escapeMarkup(contract.type) + '</td><td>' + escapeMarkup(contract.job + " · " + contract.service) + '</td><td>' + escapeMarkup(contract.startDate + " → " + contract.endDate) + '</td><td><span class="hr-status">' + escapeMarkup(contract.status) + '</span></td><td>' + escapeMarkup(contract.deadline) + '</td><td>' + escapeMarkup(contract.observation) + '</td></tr>'; }).join("") + '</tbody></table></div>' + renderContractDrafts() + renderContractForm() + '</section>';
  }

  function renderAssignmentDrafts() {
    if (!assignmentDrafts.length) return "";
    return '<section class="hr-draft-list"><header><div><span>BROUILLONS LOCAUX</span><h4>Affectations projetées</h4></div><span class="hr-boundary-chip">BACKEND_LATER</span></header>' + assignmentDrafts.map(function (draft) { var member = staffById(draft.staffId); return '<article data-hr-assignment-draft><small>BROUILLON LOCAL · BACKEND_LATER</small><b>' + escapeMarkup(member.firstName + " " + member.lastName) + '</b><span>' + escapeMarkup(draft.job + " · " + draft.service) + '</span><span>' + escapeMarkup([draft.className, draft.subject, draft.site].filter(Boolean).join(" · ")) + '</span><p>teacher_assignments backend inchangé · projection RH uniquement.</p></article>'; }).join("") + '</section>';
  }

  function renderAssignmentForm() {
    if (!canManageStaff()) return '<aside class="hr-boundary"><i data-lucide="lock-keyhole"></i><p>Lecture seule · staff.manage avec portée school est requis pour préparer une affectation.</p></aside>';
    return '<form class="hr-preparation-form" data-hr-assignment-form><header><div><span>Préparation locale</span><h4>Nouvelle projection d’affectation</h4></div><span class="hr-boundary-chip">BROUILLON LOCAL</span></header><label>Membre<select name="staffId">' + staffMemberOptions(STAFF[0].id) + '</select></label><label>Service<select name="service">' + staffOptions(["Primaire", "Secondaire", "Administration", "Sécurité", "Cantine"], "Primaire") + '</select></label><label>Fonction<input name="job" value="Fonction projetée" required></label><label>Classe si pertinent<input name="className" value=""></label><label>Matière si pertinent<input name="subject" value=""></label><label>Site / poste<input name="site" value="Site principal"></label><label>Date début<input name="startDate" type="date" value="2026-09-01" required></label><label>Date fin éventuelle<input name="endDate" type="date"></label><button class="ss-button ss-button--primary" type="submit">Préparer l’affectation</button><p class="hr-form-wide">teacher_assignments backend inchangé · BACKEND_LATER.</p></form>';
  }

  function renderAssignments() {
    if (!canReadStaff()) return '<section>' + renderStaffDenied() + '</section>';
    return '<section class="hr-records" data-hr-assignments><header><div><span>Affectations du personnel</span><h3>Projections visibles</h3><p>Lecture RH des affectations fictives sans mutation pédagogique.</p></div><span class="hr-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Personnel</th><th>Service</th><th>Fonction</th><th>Classe</th><th>Matière</th><th>Site / poste</th><th>Période</th></tr></thead><tbody>' + ASSIGNMENTS.map(function (assignment) { var member = staffById(assignment.staffId); return '<tr data-hr-assignment-row="' + assignment.id + '"><td>' + escapeMarkup(member.firstName + " " + member.lastName) + '</td><td>' + escapeMarkup(assignment.service) + '</td><td>' + escapeMarkup(assignment.job) + '</td><td>' + escapeMarkup(assignment.className) + '</td><td>' + escapeMarkup(assignment.subject) + '</td><td>' + escapeMarkup(assignment.site) + '</td><td>' + escapeMarkup(assignment.startDate + " → " + (assignment.endDate || "En cours")) + '</td></tr>'; }).join("") + '</tbody></table></div>' + renderAssignmentDrafts() + renderAssignmentForm() + '<aside class="hr-boundary"><i data-lucide="shield-check"></i><p>teacher_assignments backend inchangé · aucune affectation pédagogique officielle n’est écrite.</p></aside></section>';
  }

  function absenceDuration(startDate, endDate) {
    var start = String(startDate || "").split("-").map(Number);
    var end = String(endDate || "").split("-").map(Number);
    if (start.length !== 3 || end.length !== 3 || start.some(isNaN) || end.some(isNaN)) return "Durée à confirmer";
    var days = Math.floor((Date.UTC(end[0], end[1] - 1, end[2]) - Date.UTC(start[0], start[1] - 1, start[2])) / 86400000) + 1;
    return days > 0 ? days + (days === 1 ? " jour indicatif" : " jours indicatifs") : "Dates à vérifier";
  }

  function renderAbsenceSummary() {
    var counts = { review: ABSENCES.filter(function (item) { return item.status === "EN REVUE"; }).length, ready: ABSENCES.filter(function (item) { return item.status === "PRÊT POUR DÉCISION"; }).length };
    return '<section class="hr-absence-summary" data-hr-absence-summary><article><small>Demandes visibles</small><b>' + ABSENCES.length + '</b></article><article><small>En revue</small><b>' + counts.review + '</b></article><article><small>Prêtes pour examen humain</small><b>' + counts.ready + '</b></article></section>';
  }

  function renderAbsenceDrafts() {
    if (!absenceDrafts.length) return "";
    return '<section class="hr-draft-list"><header><div><span>BROUILLONS LOCAUX</span><h4>Absences / congés préparés</h4></div><span class="hr-boundary-chip">BACKEND_LATER</span></header>' + absenceDrafts.map(function (draft) { var member = staffById(draft.staffId); return '<article data-hr-absence-draft><small>BROUILLON LOCAL · BACKEND_LATER</small><b>' + escapeMarkup(member.firstName + " " + member.lastName + " · " + draft.type) + '</b><span>' + escapeMarkup(draft.startDate + " → " + draft.endDate + " · " + draft.duration) + '</span><span>' + escapeMarkup(draft.status) + '</span><p>' + escapeMarkup(draft.observation || draft.reason) + '</p></article>'; }).join("") + '</section>';
  }

  function renderAbsenceForm() {
    if (!canManageStaff() || !canReadStaff()) return '<aside class="hr-boundary"><i data-lucide="lock-keyhole"></i><p>Lecture seule · staff.manage et staff.read avec portée school sont requis pour préparer une demande.</p></aside>';
    return '<form class="hr-preparation-form" data-hr-absence-form><header><div><span>Préparation locale</span><h4>Nouvelle absence / demande de congé</h4></div><span class="hr-boundary-chip">BROUILLON LOCAL</span></header><label>Membre<select name="staffId">' + staffMemberOptions(STAFF[0].id) + '</select></label><label>Type<select name="type">' + staffOptions(["Absence démo", "Congé préparatoire", "Observation d’absence"], "Absence démo") + '</select></label><label>Motif non sensible<input name="reason" required></label><label>Date début<input name="startDate" type="date" required></label><label>Date fin<input name="endDate" type="date" required></label><label>Statut<select name="status">' + staffOptions(["BROUILLON", "SOUMIS — simulation", "EN REVUE", "OBSERVATION", "PRÊT POUR DÉCISION"], "BROUILLON") + '</select></label><label class="hr-form-wide">Observation<textarea name="observation" rows="3"></textarea></label><button class="ss-button ss-button--primary" type="submit">Préparer la demande</button><p class="hr-form-wide">Aucune logique légale automatique · DÉCISION OFFICIELLE — BACKEND_LATER.</p></form>';
  }

  function renderAbsence() {
    if (!canReadStaff() && !canReadReports()) return '<section>' + renderStaffDenied() + '</section>';
    var summaryOnly = !canReadStaff() && canReadReports();
    var table = summaryOnly ? "" : '<div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Personnel</th><th>Type / motif</th><th>Période</th><th>Durée</th><th>Observation</th><th>Statut</th><th>Historique</th></tr></thead><tbody>' + ABSENCES.map(function (absence) { var member = staffById(absence.staffId); return '<tr data-hr-absence-row="' + absence.id + '"><td>' + escapeMarkup(member.firstName + " " + member.lastName) + '</td><td>' + escapeMarkup(absence.type + " · " + absence.reason) + '</td><td>' + escapeMarkup(absence.startDate + " → " + absence.endDate) + '</td><td>' + escapeMarkup(absence.duration) + '</td><td>' + escapeMarkup(absence.observation) + '</td><td><span class="hr-status">' + escapeMarkup(absence.status) + '</span></td><td><b>Historique</b><br>' + absence.history.map(escapeMarkup).join(" · ") + '</td></tr>'; }).join("") + '</tbody></table></div>';
    return '<section class="hr-records" data-hr-absence><header><div><span>Absences / congés</span><h3>Suivi préparatoire</h3><p>' + (summaryOnly ? "Synthèse uniquement avec reports.hr.read." : "Données fictives non sensibles visibles avec staff.read.") + '</p></div><span class="hr-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header>' + renderAbsenceSummary() + table + (summaryOnly ? '<aside class="hr-boundary"><i data-lucide="lock-keyhole"></i><p>Synthèse uniquement · aucune fiche individuelle, préparation ou décision.</p></aside>' : renderAbsenceDrafts() + renderAbsenceForm()) + '<aside class="hr-boundary"><i data-lucide="shield-alert"></i><p>DÉCISION OFFICIELLE — BACKEND_LATER · aucune approbation automatique ou juridique.</p></aside></section>';
  }

  function renderAttendanceDenied() {
    return root.ssState({ type: "error", title: "Présence personnel non autorisées", message: "staff.attendance.read avec portée school est obligatoire.", details: "DENY explicite prioritaire · aucune donnée de présence n’est révélée." });
  }

  function renderAttendance() {
    if (!canReadAttendance()) return '<section>' + renderAttendanceDenied() + '</section>';
    var present = ATTENDANCE.filter(function (item) { return item.status === "PRÉSENT"; }).length;
    var absent = ATTENDANCE.filter(function (item) { return item.status === "ABSENT"; }).length;
    var late = ATTENDANCE.filter(function (item) { return item.status === "RETARD"; }).length;
    return '<section class="hr-records" data-hr-attendance><header><div><span>Présence personnel</span><h3>Registre visible du jour</h3><p>Projection frontend strictement en LECTURE SEULE.</p></div><span class="hr-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><section class="hr-absence-summary"><article><small>Présents</small><b>' + present + '</b></article><article><small>Absents</small><b>' + absent + '</b></article><article><small>Retards</small><b>' + late + '</b></article></section><div class="hr-table-wrap"><table class="hr-table"><thead><tr><th>Personnel</th><th>État</th><th>Entrée</th><th>Sortie</th><th>Première entrée</th><th>Dernière sortie</th><th>Heures visibles</th><th>Historique</th><th>Anomalies</th></tr></thead><tbody>' + ATTENDANCE.map(function (attendance) { var member = staffById(attendance.staffId); return '<tr data-hr-attendance-row="' + attendance.id + '"><td>' + escapeMarkup(member.firstName + " " + member.lastName) + '</td><td><span class="hr-status">' + escapeMarkup(attendance.status) + '</span></td><td>' + escapeMarkup(attendance.entry) + '</td><td>' + escapeMarkup(attendance.exit) + '</td><td>' + escapeMarkup(attendance.firstEntry) + '</td><td>' + escapeMarkup(attendance.lastExit) + '</td><td>' + escapeMarkup(attendance.hours) + '</td><td>' + escapeMarkup(attendance.history) + '</td><td>' + escapeMarkup(attendance.anomaly) + '</td></tr>'; }).join("") + '</tbody></table></div><aside class="hr-boundary"><i data-lucide="lock-keyhole"></i><p>LECTURE SEULE · aucune correction ou écriture officielle du registre.</p></aside></section>';
  }

  function renderBiometric() {
    if (!canReadAttendance()) return '<section>' + renderAttendanceDenied() + '</section>';
    return '<section class="hr-biometric" data-hr-biometric><header><div><span>Frontière biométrie</span><h3>Contrat frontend futur</h3><p>Aucun enrôlement ni capture n’est disponible dans cette phase.</p></div><span class="hr-boundary-chip">FEATURE_LATER · BACKEND_LATER</span></header><aside class="hr-biometric-warning"><i data-lucide="shield-alert"></i><div><b>AUCUNE DONNÉE BIOMÉTRIQUE STOCKÉE.</b><p>Pas d’empreinte, visage, template, webcam, identifiant biométrique ou localStorage.</p></div></aside><dl><div><dt>Salarié</dt><dd>Référence future non créée</dd></div><div><dt>Méthode future</dt><dd>À définir côté backend autorisé</dd></div><div><dt>Appareil</dt><dd>Aucun appareil connecté</dd></div><div><dt>Statut d’enrôlement futur</dt><dd>FEATURE_LATER</dd></div><div><dt>Dernière synchronisation future</dt><dd>BACKEND_LATER</dd></div></dl></section>';
  }

  function renderPayrollDenied() {
    return root.ssState({ type: "error", title: "Paie non autorisée", message: "reports.hr.read avec portée school permet uniquement de comprendre le contrat futur.", details: "staff.manage et finance.payment.record ne sont jamais des permissions Paie · DENY explicite prioritaire." });
  }

  function renderPayroll() {
    if (!canReadReports()) return '<section>' + renderPayrollDenied() + '</section>';
    var fields = ["Salaire de base", "Primes", "Avances", "Retenues", "Net à payer", "Période", "Statut", "Historique", "Bulletin de paie"];
    return '<section class="hr-payroll" data-hr-payroll><header><div><span>PAIE — CONTRAT FRONTEND FUTUR</span><h3>Structure de rémunération à autoriser ultérieurement</h3><p>Aucune source officielle, donnée individuelle ou valeur monétaire n’est disponible.</p></div><span class="hr-boundary-chip">FEATURE_LATER · BACKEND_LATER</span></header><aside class="hr-biometric-warning"><i data-lucide="shield-alert"></i><div><b>PERMISSION PAIE DÉDIÉE REQUISE</b><p>staff.manage et finance.payment.record ne permettent ni salaire, prime, avance, retenue, bulletin ou paiement.</p></div></aside><div class="hr-payroll-grid">' + fields.map(function (label) { return '<article><small>' + escapeMarkup(label) + '</small><b data-hr-payroll-value>Non disponible · FEATURE_LATER</b></article>'; }).join("") + '</div><aside class="hr-boundary"><i data-lucide="lock-keyhole"></i><p>Aucun calcul officiel, bulletin, paiement, modification de salaire, prime, avance ou retenue.</p></aside></section>';
  }

  function renderReportsDenied() {
    return root.ssState({ type: "error", title: "Rapports RH non autorisés", message: "reports.hr.read avec portée school est obligatoire.", details: "DENY explicite prioritaire · aucun rapport global ni dossier individuel n’est révélé." });
  }

  function reportCard(key, label, value, detail) {
    return '<article data-hr-report="' + key + '"><small>' + escapeMarkup(label) + '</small><b>' + escapeMarkup(value) + '</b><span>' + escapeMarkup(detail) + '</span></article>';
  }

  function renderReports() {
    if (!canReadReports()) return '<section>' + renderReportsDenied() + '</section>';
    var active = STAFF.filter(function (member) { return member.status === "ACTIF"; }).length;
    var inactive = STAFF.filter(function (member) { return member.status !== "ACTIF"; }).length;
    var arrived = ATTENDANCE.filter(function (item) { return item.status === "PRÉSENT" || item.status === "RETARD"; }).length;
    var late = ATTENDANCE.filter(function (item) { return item.status === "RETARD"; }).length;
    var expiring = CONTRACTS.filter(function (contract) { return contract.status === "À RENOUVELER"; }).length;
    var anomalies = ATTENDANCE.filter(function (item) { return item.anomaly !== "Aucune"; }).length;
    var cards = [
      reportCard("workforce", "Effectif", String(STAFF.length), "profils fictifs visibles"),
      reportCard("lifecycle", "Actifs / inactifs", active + " actifs · " + inactive + " inactif", "cycle de vie frontend"),
      reportCard("movements", "Mouvements du personnel", inactive + " mouvement visible", "projection de statut"),
      reportCard("attendance", "Présence", arrived + " arrivés", "présents et retard inclus"),
      reportCard("absence", "Absences", ABSENCES.length + " demandes", "statuts préparatoires"),
      reportCard("late", "Retards", late + " retard", "signal frontend"),
      reportCard("contracts", "Contrats à échéance", expiring + " échéance", "à renouveler"),
      reportCard("assignments", "Affectations", ASSIGNMENTS.length + " affectations", "projections visibles"),
      reportCard("anomalies", "Anomalies RH", anomalies + " signaux", "aucune correction automatique")
    ].join("");
    return '<section class="hr-reports" data-hr-reports><header><div><span>RAPPORT RH FRONTEND</span><h3>Synthèses Ressources humaines</h3><p>Calculées uniquement à partir des données fictives visibles dans ce module.</p></div><span class="hr-boundary-chip">BACKEND_LATER</span></header><div class="hr-reports-grid">' + cards + '</div><aside class="hr-biometric-warning"><i data-lucide="file-warning"></i><div><b>AUCUN PDF FINAL</b><p>Le moteur documentaire et le PDF final appartiennent à la Phase J.</p></div></aside><aside class="hr-boundary"><i data-lucide="shield-check"></i><p>Aucun bilan social légal, déclaration sociale ou fiscale, fichier bancaire, bulletin de paie légal ou rapport officiel de biométrie.</p></aside></section>';
  }

  function bindStaff() {
    var search = document.querySelector('[data-hr-staff-filter="search"]');
    var status = document.querySelector('[data-hr-staff-filter="status"]');
    if (search) search.oninput = function () { staffFilters.search = search.value; renderContent(); };
    if (status) status.onchange = function () { staffFilters.status = status.value; renderContent(); };
    document.querySelectorAll("[data-hr-staff-row]").forEach(function (button) {
      button.onclick = function () { selectedStaffId = button.getAttribute("data-hr-staff-row") || selectedStaffId; renderContent(); };
    });
    var form = document.querySelector("[data-hr-staff-form]");
    if (form) form.onsubmit = function (event) {
      event.preventDefault();
      var data = new root.FormData(form);
      var member = selectedStaff();
      staffDrafts[member.id] = {
        sourceStaffId: member.id,
        job: String(data.get("job") || member.job),
        service: String(data.get("service") || member.service),
        status: String(data.get("status") || member.status),
        assignment: String(data.get("assignment") || member.assignment),
        observation: String(data.get("observation") || ""),
        preparedAt: new Date().toISOString()
      };
      persistStaffDrafts(staffDrafts);
      renderContent();
    };
  }

  function bindContracts() {
    var form = document.querySelector("[data-hr-contract-form]");
    if (!form) return;
    form.onsubmit = function (event) {
      event.preventDefault();
      var data = new root.FormData(form);
      contractDrafts.push({
        id: "contract-draft-" + Date.now(), staffId: String(data.get("staffId") || ""), type: String(data.get("type") || ""),
        job: String(data.get("job") || ""), service: String(data.get("service") || ""), startDate: String(data.get("startDate") || ""),
        endDate: String(data.get("endDate") || ""), status: String(data.get("status") || "BROUILLON"), observation: String(data.get("observation") || "")
      });
      persistDraftList(CONTRACT_DRAFTS_STORAGE_KEY, contractDrafts);
      renderContent();
    };
  }

  function bindAssignments() {
    var form = document.querySelector("[data-hr-assignment-form]");
    if (!form) return;
    form.onsubmit = function (event) {
      event.preventDefault();
      var data = new root.FormData(form);
      assignmentDrafts.push({
        id: "assignment-draft-" + Date.now(), staffId: String(data.get("staffId") || ""), service: String(data.get("service") || ""),
        job: String(data.get("job") || ""), className: String(data.get("className") || ""), subject: String(data.get("subject") || ""),
        site: String(data.get("site") || ""), startDate: String(data.get("startDate") || ""), endDate: String(data.get("endDate") || "")
      });
      persistDraftList(ASSIGNMENT_DRAFTS_STORAGE_KEY, assignmentDrafts);
      renderContent();
    };
  }

  function bindAbsence() {
    var form = document.querySelector("[data-hr-absence-form]");
    if (!form) return;
    form.onsubmit = function (event) {
      event.preventDefault();
      var data = new root.FormData(form);
      var startDate = String(data.get("startDate") || "");
      var endDate = String(data.get("endDate") || "");
      absenceDrafts.push({
        id: "absence-draft-" + Date.now(), staffId: String(data.get("staffId") || ""), type: String(data.get("type") || ""),
        reason: String(data.get("reason") || ""), startDate: startDate, endDate: endDate, duration: absenceDuration(startDate, endDate),
        observation: String(data.get("observation") || ""), status: String(data.get("status") || "BROUILLON"), history: ["Brouillon préparé localement"]
      });
      persistDraftList(ABSENCE_DRAFTS_STORAGE_KEY, absenceDrafts);
      renderContent();
    };
  }

  function normalizeJaspeText(value) {
    var text = String(value || "").toLowerCase();
    return typeof text.normalize === "function" ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : text;
  }

  function isHrJaspeIntent(text, canReadStaffGeneral) {
    var strongHrTerms = /\b(rh|personnel|employe|salarie|paie|salaire|prime|avance|retenue|conge|biometrie|biometrique|empreinte|webcam|licencie|reactive)\b|bulletin de paie|dossier rh|contrat (du |de )?personnel|affectation (du |de )?personnel|hr-dem-/;
    var knownStaff = STAFF.some(function (member) {
      return text.indexOf(normalizeJaspeText(member.firstName)) >= 0 || text.indexOf(normalizeJaspeText(member.lastName)) >= 0 || text.indexOf(normalizeJaspeText(member.hrId)) >= 0;
    });
    if (strongHrTerms.test(text) || knownStaff) return true;
    // INC-3 : l'élargissement des termes génériques suit la permission réelle.
    return canReadStaffGeneral === true && /\b(presence|retard|absence|rapport|contrat|affectation)\b/.test(text);
  }

  function jaspeRefusal(message, action) {
    return { allowed: false, refusal: true, action: action || null, message: "REFUS — " + message };
  }

  function jaspeMember(text) {
    return STAFF.find(function (member) {
      return text.indexOf(normalizeJaspeText(member.firstName)) >= 0 || text.indexOf(normalizeJaspeText(member.lastName)) >= 0 || text.indexOf(normalizeJaspeText(member.hrId)) >= 0;
    }) || STAFF[0];
  }

  function prepareJaspeDraft(text, member) {
    var preparedAt = new Date().toISOString();
    if (/\bcontrat\b/.test(text)) {
      contractDrafts.push({ id: "contract-jaspe-" + Date.now(), staffId: member.id, type: "Contrat préparatoire", job: member.job, service: member.service, startDate: "", endDate: "", status: "BROUILLON", observation: "Préparé par Jaspe · aucune valeur officielle" });
      persistDraftList(CONTRACT_DRAFTS_STORAGE_KEY, contractDrafts);
      return { allowed: true, refusal: false, action: "contracts", message: "Contrat préparé pour " + member.firstName + " " + member.lastName + " · BROUILLON LOCAL · BACKEND_LATER. Aucun contrat officiel n’est modifié." };
    }
    if (/\baffectation\b/.test(text)) {
      assignmentDrafts.push({ id: "assignment-jaspe-" + Date.now(), staffId: member.id, service: member.service, job: member.job, className: "", subject: "", site: "À préciser", startDate: "", endDate: "" });
      persistDraftList(ASSIGNMENT_DRAFTS_STORAGE_KEY, assignmentDrafts);
      return { allowed: true, refusal: false, action: "assignments", message: "Affectation préparée pour " + member.firstName + " " + member.lastName + " · BROUILLON LOCAL · BACKEND_LATER. teacher_assignments reste inchangé." };
    }
    if (/\b(absence|conge)\b/.test(text)) {
      absenceDrafts.push({ id: "absence-jaspe-" + Date.now(), staffId: member.id, type: "Demande préparatoire", reason: "À préciser", startDate: "", endDate: "", duration: "Durée à confirmer", observation: "Préparé par Jaspe", status: "BROUILLON", history: ["Brouillon préparé localement"] });
      persistDraftList(ABSENCE_DRAFTS_STORAGE_KEY, absenceDrafts);
      return { allowed: true, refusal: false, action: "absence", message: "Demande préparée pour " + member.firstName + " " + member.lastName + " · BROUILLON LOCAL · BACKEND_LATER. Aucune décision de congé n’est prise." };
    }
    staffDrafts[member.id] = {
      sourceStaffId: member.id,
      job: member.job,
      service: member.service,
      status: member.status,
      assignment: member.assignment,
      observation: "Préparé par Jaspe · BROUILLON LOCAL",
      preparedAt: preparedAt
    };
    persistStaffDrafts(staffDrafts);
    return { allowed: true, refusal: false, action: "staff", message: "Observation RH préparée pour " + member.firstName + " " + member.lastName + " · BROUILLON LOCAL · BACKEND_LATER. La fiche originale " + member.hrId + " reste intacte." };
  }

  function answerJaspe(query, context) {
    var text = normalizeJaspeText(query);
    var subject = context && context.user ? context.user : user();
    // INC-3 : la permission staff.read (portée school) décide, pas le nom du rôle.
    var canReadStaffGeneral = allowsFor(subject, "staff.read", "school");
    if (!isHrJaspeIntent(text, canReadStaffGeneral)) return null;
    if (!allowsFor(subject, "safe.assistant.use", "own")) return jaspeRefusal("Jaspe n’est pas autorisé pour cette session.");
    if (!canReadStaffGeneral) return jaspeRefusal("les données RH générales ne sont pas accessibles avec vos permissions.");

    if (/\b(capture|enregistre|enrol|active)\b/.test(text) && /\b(biometrie|biometrique|empreinte|visage|webcam)\b/.test(text)) {
      return jaspeRefusal("aucune donnée biométrique réelle ne peut être capturée ou stockée.", "biometric");
    }
    if (/\b(cree|creer|modifie|modifier|calcule|calculer|applique|appliquer|produis|produire|paie|payer|verse|verser)\b/.test(text) && /\b(paie|salaire|prime|avance|retenue|bulletin|salarie)\b/.test(text)) {
      return jaspeRefusal("Jaspe ne crée ni salaire, prime, avance, retenue, bulletin ou paiement officiel.", "payroll");
    }
    if (/\b(licencie|licencier|reactive|reactiver|approuve|approuver|valide|valider|decide|decider)\b/.test(text)) {
      return jaspeRefusal("toute décision RH officielle reste sous contrôle humain.");
    }
    if (/\b(change|changer|modifie|modifier|corrige|corriger)\b/.test(text) && (/\bofficiel/.test(text) || /\b(contrat|affectation|presence|statut|dossier)\b/.test(text))) {
      return jaspeRefusal("aucun contrat, affectation, statut, dossier ou relevé de présence officiel n’est modifié.");
    }

    var member = jaspeMember(text);
    if (/\b(prepare|preparer|brouillon|observation)\b/.test(text)) {
      if (!allowsFor(subject, "staff.manage", "school")) return jaspeRefusal("staff.manage avec portée school est requis pour préparer un brouillon local.");
      return prepareJaspeDraft(text, member);
    }
    if (/\b(presence|retard)\b/.test(text)) {
      if (!allowsFor(subject, "staff.attendance.read", "school")) return jaspeRefusal("staff.attendance.read avec portée school est requis.", "attendance");
      return { allowed: true, refusal: false, action: "attendance", message: "Présence du personnel : 4 présents, 1 absence et 1 retard dans les données de démonstration · lecture seule · BACKEND_LATER." };
    }
    if (/\brapport\b/.test(text)) {
      if (!allowsFor(subject, "reports.hr.read", "school")) return jaspeRefusal("reports.hr.read avec portée school est requis.", "reports");
      return { allowed: true, refusal: false, action: "reports", message: "Rapports RH disponibles : effectif, présence, absences, contrats et affectations · synthèses frontend sans PDF final." };
    }
    if (/\b(paie|salaire|bulletin|prime|avance|retenue)\b/.test(text)) {
      if (!allowsFor(subject, "reports.hr.read", "school")) return jaspeRefusal("reports.hr.read avec portée school est requis pour voir la frontière Paie.", "payroll");
      return { allowed: true, refusal: false, action: "payroll", message: "Paie : surface informative uniquement · Non disponible · FEATURE_LATER · BACKEND_LATER. Aucun montant officiel n’est calculé." };
    }
    if (/\b(biometrie|biometrique|empreinte|visage|webcam)\b/.test(text)) {
      if (!allowsFor(subject, "staff.attendance.read", "school")) return jaspeRefusal("staff.attendance.read avec portée school est requis.", "biometric");
      return { allowed: true, refusal: false, action: "biometric", message: "Biométrie : capacité future uniquement · aucune empreinte, image, gabarit ou donnée réelle n’est capturé ou stocké." };
    }
    if (!allowsFor(subject, "staff.read", "school")) return jaspeRefusal("staff.read avec portée school est requis pour consulter un dossier RH.", "staff");
    var action = /\bcontrat\b/.test(text) ? "contracts" : /\baffectation\b/.test(text) ? "assignments" : /\b(absence|conge)\b/.test(text) ? "absence" : "staff";
    return { allowed: true, refusal: false, action: action, message: member.firstName + " " + member.lastName + " · " + member.hrId + " · " + member.job + " · " + member.service + " · statut " + member.status + ". Données fictives non sensibles, lecture seule." };
  }

  function renderFuture() {
    var labels = { staff: "Dossier personnel", contracts: "Contrats", assignments: "Affectations", absence: "Absences / congés", attendance: "Présence personnel", biometric: "Biométrie", payroll: "Paie", reports: "Rapports RH" };
    return '<section class="hr-future"><span>Phase H</span><h3>' + escapeMarkup(labels[activeTab] || "Ressources humaines") + '</h3><p>Surface frontend prévue dans le lot dédié, sans opération officielle.</p><span class="hr-boundary-chip">FEATURE_LATER · BACKEND_LATER</span></section>';
  }

  function bindNavigation() {
    document.querySelectorAll("#hrTabs [data-hr-tab]").forEach(function (button) {
      button.onclick = function () { activeTab = button.getAttribute("data-hr-tab") || "dashboard"; renderContent(); };
    });
    document.querySelectorAll("[data-hr-open]").forEach(function (button) {
      button.onclick = function () { activeTab = button.getAttribute("data-hr-open") || "dashboard"; renderContent(); };
    });
  }

  function renderContent() {
    var content = document.getElementById("hrContent");
    if (!content) return;
    var live = isLiveSession();
    document.querySelectorAll("#hrTabs [data-hr-tab]").forEach(function (button) {
      var tab = button.getAttribute("data-hr-tab") || "dashboard";
      button.hidden = live || !tabAllowed(tab);
      button.classList.toggle("active", tab === activeTab);
    });
    var blocked = !canAccessHr() || !tabAllowed(activeTab);
    content.innerHTML = blocked ? (activeTab === "attendance" || activeTab === "biometric" ? renderAttendanceDenied() : activeTab === "payroll" ? renderPayrollDenied() : activeTab === "reports" ? renderReportsDenied() : renderDenied()) : live ? renderLiveUnavailable() : activeTab === "dashboard" ? renderDashboard() : activeTab === "staff" ? renderStaff() : activeTab === "contracts" ? renderContracts() : activeTab === "assignments" ? renderAssignments() : activeTab === "absence" ? renderAbsence() : activeTab === "attendance" ? renderAttendance() : activeTab === "biometric" ? renderBiometric() : activeTab === "payroll" ? renderPayroll() : activeTab === "reports" ? renderReports() : renderFuture();
    bindNavigation();
    if (activeTab === "staff") bindStaff();
    if (activeTab === "contracts") bindContracts();
    if (activeTab === "assignments") bindAssignments();
    if (activeTab === "absence") bindAbsence();
    if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
  }

  function render(containerId) {
    var module = document.getElementById(containerId || "hrModule");
    if (!module) return;
    module.hidden = false;
    activeTab = "dashboard";
    renderContent();
  }

  function open(tab) { activeTab = tab || "dashboard"; renderContent(); }
  function close() {
    var module = document.getElementById("hrModule");
    if (module) module.hidden = true;
    if (root.SchoolSafeAppContext && typeof root.SchoolSafeAppContext.showDashboard === "function") root.SchoolSafeAppContext.showDashboard();
  }
  function setSession(session) { sessionOverride = session || null; }

  // Résumé démo calculé depuis les fixtures STAFF (dashboard executive KPI).
  function getDemoSummary() {
    var actifs = STAFF.filter(function (member) { return member.status === "ACTIF"; });
    var enseignants = STAFF.filter(function (member) { return /enseignant/i.test(member.job); });
    return {
      total: STAFF.length,
      actifs: actifs.length,
      inactifs: STAFF.length - actifs.length,
      femmes: STAFF.filter(function (member) { return member.gender === "F"; }).length,
      hommes: STAFF.filter(function (member) { return member.gender === "M"; }).length,
      enseignants: enseignants.length,
      administration: STAFF.length - enseignants.length
    };
  }

  root.SchoolSafeHrDemo = {
    render: render,
    open: open,
    close: close,
    setSession: setSession,
    canReadStaff: canReadStaff,
    canManageStaff: canManageStaff,
    canReadAttendance: canReadAttendance,
    canReadReports: canReadReports,
    getDemoSummary: getDemoSummary,
    answerJaspe: answerJaspe
  };
})(window);
