(function (root) {
  "use strict";

  var controlSessionOverride = null;
  var selectedCampaignId = "demo-control-september";
  var CAMPAIGN_DRAFT_STORAGE_KEY = "schoolsafe-v2-finance-control-campaign-drafts";
  var CONTROL_HISTORY_STORAGE_KEY = "schoolsafe-v2-finance-control-history-drafts";

  var feeTypes = [
    { id: "school-fees", label: "Frais scolaires" },
    { id: "transport-fees", label: "Transport scolaire" },
    { id: "canteen-fees", label: "Cantine · frais financiers" }
  ];
  var classes = [
    { id: "demo-class-5", label: "5e primaire", activeStudents: 5 },
    { id: "demo-class-4", label: "4e primaire", activeStudents: 4 },
    { id: "demo-class-3", label: "3e primaire", activeStudents: 6 }
  ];
  var controllers = [
    { id: "demo-controller-gate", label: "Grâce Mbuyi" },
    { id: "demo-controller-library", label: "Jean Ilunga" }
  ];
  var demoCampaigns = [
    {
      id: "demo-control-september",
      label: "Contrôle du portail · septembre",
      feeTypeId: "school-fees",
      feeTypeLabel: "Frais scolaires",
      classIds: ["demo-class-5"],
      classLabels: ["5e primaire"],
      studentIds: ["demo-control-student-paid", "demo-control-student-partial", "demo-control-student-pending", "demo-control-student-exempted", "demo-control-student-anomaly"],
      activeStudentCount: 5,
      controllerIds: ["demo-controller-gate"],
      controllerLabels: ["Grâce Mbuyi"],
      starts_at: "2026-09-01",
      ends_at: "2026-09-30",
      status: "published",
      instruction: "Laisser poursuivre si le statut est en règle ou exempté ; orienter vers Finance pour toute régularisation ou anomalie."
    }
  ];
  var demoScanRecords = {
    "schoolsafe://card/DEMO-PAID/verification": { id: "demo-control-student-paid", name: "Amina Kalonji", matricule: "DEMO-001", classId: "demo-class-5", className: "5e primaire", status: "paid", lifecycleStatus: "active" },
    "schoolsafe://card/DEMO-PARTIAL/verification": { id: "demo-control-student-partial", name: "Noah Ilunga", matricule: "DEMO-002", classId: "demo-class-5", className: "5e primaire", status: "partial", lifecycleStatus: "active" },
    "schoolsafe://card/DEMO-PENDING/verification": { id: "demo-control-student-pending", name: "Sarah Mbuyi", matricule: "DEMO-003", classId: "demo-class-5", className: "5e primaire", status: "pending", lifecycleStatus: "active" },
    "schoolsafe://card/DEMO-EXEMPTED/verification": { id: "demo-control-student-exempted", name: "David Tshibangu", matricule: "DEMO-004", classId: "demo-class-5", className: "5e primaire", status: "exempted", lifecycleStatus: "active" },
    "schoolsafe://card/DEMO-NO-FEE/verification": { id: "demo-control-student-anomaly", name: "Lina Kabasele", matricule: "DEMO-005", classId: "demo-class-5", className: "5e primaire", status: "anomaly", lifecycleStatus: "active" }
  };
  var demoHistory = [
    { reference: "DÉMO-HIST-001", scannedAt: "8 septembre · 07:42", student: "Amina Kalonji", matricule: "DEMO-001", className: "5e primaire", status: "paid" },
    { reference: "DÉMO-HIST-002", scannedAt: "8 septembre · 07:51", student: "Noah Ilunga", matricule: "DEMO-002", className: "5e primaire", status: "partial" },
    { reference: "DÉMO-HIST-003", scannedAt: "8 septembre · 08:03", student: "Sarah Mbuyi", matricule: "DEMO-003", className: "5e primaire", status: "pending" },
    { reference: "DÉMO-HIST-004", scannedAt: "8 septembre · 08:16", student: "David Tshibangu", matricule: "DEMO-004", className: "5e primaire", status: "exempted" },
    { reference: "DÉMO-HIST-005", scannedAt: "8 septembre · 08:25", student: "Lina Kabasele", matricule: "DEMO-005", className: "5e primaire", status: "anomaly" }
  ];

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function readLocalRows(key) {
    try {
      var parsed = JSON.parse(root.localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function persistLocalRows(key, values) {
    try {
      root.localStorage.setItem(key, JSON.stringify(Array.isArray(values) ? values : []));
    } catch (error) {
      console.warn("[FeeControl] brouillon local indisponible", error);
    }
  }

  var campaignDrafts = readLocalRows(CAMPAIGN_DRAFT_STORAGE_KEY);
  var localHistory = readLocalRows(CONTROL_HISTORY_STORAGE_KEY);

  function demoControlUser() {
    var role = String(root.currentDemoRole || "");
    if (role !== "finance" && role !== "admin") return { role: role, permissions: [], scopes: [] };
    return {
      role: role,
      permissions: ["finance.control.read", "finance.control.manage"],
      scopes: [
        { permission: "finance.control.read", type: "school" },
        { permission: "finance.control.manage", type: "school" }
      ]
    };
  }

  function controlAccessUser() {
    if (controlSessionOverride) return controlSessionOverride;
    var appUser = root.SchoolSafeAppContext && typeof root.SchoolSafeAppContext.getCurrentUser === "function"
      ? root.SchoolSafeAppContext.getCurrentUser()
      : null;
    if (appUser && (appUser.native === true || appUser.token)) return appUser;
    if (appUser && Array.isArray(appUser.permissions) && appUser.permissions.some(function (permission) { return permission.indexOf("finance.control.") === 0; })) return appUser;
    return demoControlUser();
  }

  function isLiveSession() {
    var user = controlAccessUser();
    return !!(user && (user.native === true || user.token));
  }

  function permissionScopes(user, permission) {
    return (user && Array.isArray(user.scopes) ? user.scopes : []).filter(function (scope) {
      return scope && (!scope.permission || scope.permission === permission);
    });
  }

  function canUse(permission, allowedScopeTypes) {
    var access = root.SchoolSafeAccess;
    var user = controlAccessUser();
    if (!access || typeof access.canAccess !== "function" || !access.canAccess(user, permission)) return false;
    return permissionScopes(user, permission).some(function (scope) {
      return allowedScopeTypes.indexOf(scope.type) !== -1;
    });
  }

  function canReadFeeControl() {
    return canUse("finance.control.read", ["school", "assigned_classes"]);
  }

  function canManageFeeControl() {
    return canUse("finance.control.manage", ["school"]);
  }

  function canScanFeeControl() {
    return canUse("finance.control.scan", ["assigned_classes"]);
  }

  function assignedClassIdsForScan() {
    var user = controlAccessUser();
    var ids = (user && Array.isArray(user.assignedClassIds) ? user.assignedClassIds : []).slice();
    permissionScopes(user, "finance.control.scan").forEach(function (scope) {
      (Array.isArray(scope.classIds) ? scope.classIds : []).forEach(function (id) {
        if (ids.indexOf(id) === -1) ids.push(id);
      });
    });
    return ids;
  }

  function authorizedCampaigns() {
    if (!canScanFeeControl() || canReadFeeControl() || canManageFeeControl()) return demoCampaigns.slice();
    var assigned = assignedClassIdsForScan();
    return demoCampaigns.filter(function (campaign) {
      return campaign.classIds.some(function (classId) { return assigned.indexOf(classId) !== -1; });
    });
  }

  function statusDefinition(status) {
    return {
      paid: { title: "EN RÈGLE", label: "En règle", variant: "success", state: "ready", message: "Le statut de contrôle autorise la poursuite selon la consigne." },
      partial: { title: "PAIEMENT PARTIEL", label: "Paiement partiel", variant: "warning", state: "unavailable", message: "Orienter l’élève vers Finance selon la consigne." },
      pending: { title: "NON EN RÈGLE", label: "Non en règle", variant: "danger", state: "error", message: "La régularisation doit être traitée par Finance." },
      exempted: { title: "EXEMPTÉ", label: "Exempté", variant: "success", state: "ready", message: "Le statut d’exemption autorise la poursuite selon la consigne." },
      anomaly: { title: "ANOMALIE", label: "Anomalie", variant: "danger", state: "error", message: "Aucun statut exploitable : orienter vers Finance sans déduire de décision." }
    }[status] || { title: "ANOMALIE", label: "Anomalie", variant: "danger", state: "error", message: "Statut indisponible." };
  }

  function optionRows(rows) {
    return rows.map(function (row) { return '<option value="' + escapeHtml(row.id) + '">' + escapeHtml(row.label) + '</option>'; }).join("");
  }

  function formatPeriod(campaign) {
    return escapeHtml(campaign.starts_at) + " → " + escapeHtml(campaign.ends_at);
  }

  function renderCampaignCard(campaign) {
    return '<article class="fee-control-campaign" data-fee-control-campaign><label><input type="radio" name="feeControlCampaign" value="' + escapeHtml(campaign.id) + '"' + (selectedCampaignId === campaign.id ? " checked" : "") + '><span><small>' + escapeHtml(campaign.feeTypeLabel) + '</small><strong>' + escapeHtml(campaign.label) + '</strong><em>' + formatPeriod(campaign) + '</em></span></label><dl><div><dt>Classes</dt><dd>' + escapeHtml(campaign.classLabels.join(", ")) + '</dd></div><div><dt>Élèves actifs</dt><dd>' + escapeHtml(campaign.activeStudentCount) + '</dd></div><div><dt>Contrôleurs</dt><dd>' + escapeHtml(campaign.controllerLabels.join(", ")) + '</dd></div><div><dt>Statut</dt><dd>' + escapeHtml(campaign.status) + '</dd></div></dl><p><strong>Consigne :</strong> ' + escapeHtml(campaign.instruction) + '</p></article>';
  }

  function renderCampaigns() {
    var rows = authorizedCampaigns();
    if (!rows.length) return window.ssState({ type: "empty", title: "Aucune campagne autorisée", message: "Aucune campagne ne correspond aux classes affectées." });
    if (!rows.some(function (campaign) { return campaign.id === selectedCampaignId; })) selectedCampaignId = rows[0].id;
    return '<section id="feeControlCampaigns" class="fee-control-campaigns"><header><div><span>Projection locale</span><h3>Campagnes de contrôle autorisées</h3><p>Types de frais, classes, élèves actifs et contrôleurs restent bornés à la campagne.</p></div>' + window.ssBadge({ variant: "info", label: "DÉMONSTRATION" }) + '</header><div class="fee-control-campaign-grid">' + rows.map(renderCampaignCard).join("") + '</div></section>';
  }

  function renderManagement() {
    if (!canManageFeeControl()) return "";
    var drafts = campaignDrafts.map(function (draft) {
      return '<article class="fee-control-campaign-draft" data-fee-control-campaign-draft><header><div><span>BROUILLON LOCAL</span><h4>' + escapeHtml(draft.label) + '</h4></div>' + window.ssBadge({ variant: "warning", label: "BACKEND_LATER" }) + '</header><p>' + escapeHtml(draft.feeTypeLabel) + ' · ' + escapeHtml(draft.classLabel) + ' · ' + escapeHtml(draft.activeStudentCount) + ' élèves actifs</p><small>Contrôleur : ' + escapeHtml(draft.controllerLabel) + ' · ' + escapeHtml(draft.startsAt) + ' → ' + escapeHtml(draft.endsAt) + '</small></article>';
    }).join("");
    return '<section class="fee-control-management"><header><div><span>Gestion autorisée</span><h3>Préparer une campagne</h3><p>La préparation reste locale et ne publie aucune campagne officielle.</p></div>' + window.ssBadge({ variant: "warning", label: "BACKEND_LATER" }) + '</header><form id="feeControlCampaignForm" class="fee-control-campaign-form"><label>Nom de campagne<input name="label" required maxlength="120"></label><label>Type de frais<select name="fee_type" required>' + optionRows(feeTypes) + '</select></label><label>Classe active<select name="class_id" required>' + optionRows(classes) + '</select></label><label>Contrôleur autorisé<select name="controller_id" required>' + optionRows(controllers) + '</select></label><label>Début<input type="date" name="starts_at" required></label><label>Fin<input type="date" name="ends_at" required></label>' + window.ssButton({ label: "Préparer la campagne", type: "submit", icon: "calendar-check-2" }) + '</form><div class="fee-control-campaign-drafts">' + drafts + '</div></section>';
  }

  function renderScanner() {
    if (!canScanFeeControl()) {
      return '<section class="fee-control-scanner-boundary">' + window.ssState({ type: "denied", title: "Scanner non autorisé", message: "finance.control.scan avec scope assigned_classes est obligatoire." }) + '</section>';
    }
    return '<section id="feeControlScan" class="fee-control-scan"><header><div><span>Contrôleur affecté</span><h3>Scanner de contrôle · démonstration</h3><p>Identité, classe, résultat, consigne et statut uniquement.</p></div>' + window.ssBadge({ variant: "info", label: "BACKEND_LATER" }) + '</header><form id="feeControlDemoScanForm"><label>QR de démonstration<input id="feeControlQrInput" required autocomplete="off" placeholder="schoolsafe://card/DEMO-PAID/verification"></label>' + window.ssButton({ label: "Analyser le statut", type: "submit", icon: "scan-line" }) + '</form><div id="feeControlResult" class="fee-control-result" aria-live="polite"></div></section>';
  }

  function renderHistory() {
    if (!canReadFeeControl()) return "";
    var entries = localHistory.concat(demoHistory);
    var rows = entries.map(function (entry) {
      var definition = statusDefinition(entry.status);
      return '<tr><td><strong>' + escapeHtml(entry.reference) + '</strong><small>' + escapeHtml(entry.scannedAt) + '</small></td><td><strong>' + escapeHtml(entry.student) + '</strong><small>' + escapeHtml(entry.matricule) + ' · ' + escapeHtml(entry.className) + '</small></td><td>' + window.ssBadge({ variant: definition.variant, label: definition.label }) + '</td></tr>';
    }).join("");
    return '<section id="feeControlHistory" class="fee-control-history"><header><div><span>Historique local autorisé</span><h3>Contrôles de démonstration</h3><p>Aucune donnée de caisse ou transactionnelle n’est exposée.</p></div>' + window.ssBadge({ variant: "warning", label: "BACKEND_LATER" }) + '</header>' + window.ssTable({ headers: ["Référence", "Élève", "Résultat"], rows: rows, empty: "Aucun contrôle local.", emptyTitle: "Historique de contrôle", responsive: true }) + '</section>';
  }

  function render(containerId, user) {
    if (user) controlSessionOverride = user;
    var container = document.getElementById(containerId);
    if (!container) return false;
    var canOpen = canReadFeeControl() || canManageFeeControl() || canScanFeeControl();
    if (!canOpen) {
      container.innerHTML = window.ssState({ type: "denied", title: "Contrôle des frais non autorisé", message: "Une permission et une portée compatibles sont requises." });
      return false;
    }
    if (isLiveSession()) {
      container.innerHTML = '<section class="fee-control-panel" data-fee-control-live-unavailable role="status">' + window.ssState({ type: "unavailable", title: "DONNÉES INDISPONIBLES", message: "Les campagnes, élèves, statuts et historiques réels ne sont pas connectés.", details: "Aucune fixture de contrôle des frais n’est affichée · BACKEND_LATER." }) + '</section>';
      if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
      return true;
    }
    container.innerHTML = '<div class="fee-control-panel"><header class="fee-control-hero"><div><span>F5-FE · frontend uniquement</span><h2>Contrôle des frais</h2><p>Campagnes, scan et historique appliquent des gardes indépendantes. Les résultats ne montrent aucun détail financier.</p></div>' + window.ssBadge({ variant: "info", label: "PÉRIMÈTRE MINIMAL" }) + '</header>' + renderCampaigns() + renderManagement() + renderScanner() + renderHistory() + '</div>';
    bind(containerId);
    if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
    return true;
  }

  function bind(containerId) {
    var container = document.getElementById(containerId);
    container.querySelectorAll('input[name="feeControlCampaign"]').forEach(function (radio) {
      radio.addEventListener("change", function () { selectedCampaignId = this.value; render(containerId); });
    });

    var campaignForm = container.querySelector("#feeControlCampaignForm");
    if (campaignForm) campaignForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!canManageFeeControl()) return;
      var data = new FormData(campaignForm);
      var label = String(data.get("label") || "").trim();
      var feeType = feeTypes.find(function (item) { return item.id === data.get("fee_type"); });
      var classItem = classes.find(function (item) { return item.id === data.get("class_id"); });
      var controller = controllers.find(function (item) { return item.id === data.get("controller_id"); });
      var startsAt = String(data.get("starts_at") || "");
      var endsAt = String(data.get("ends_at") || "");
      if (!label || !feeType || !classItem || !controller || !startsAt || !endsAt || endsAt < startsAt) return;
      campaignDrafts.unshift({ id: "local-control-campaign-" + Date.now(), label: label, feeTypeId: feeType.id, feeTypeLabel: feeType.label, classId: classItem.id, classLabel: classItem.label, activeStudentCount: classItem.activeStudents, controllerId: controller.id, controllerLabel: controller.label, startsAt: startsAt, endsAt: endsAt, local: true, backendLater: true });
      persistLocalRows(CAMPAIGN_DRAFT_STORAGE_KEY, campaignDrafts);
      render(containerId);
    });

    var scanForm = container.querySelector("#feeControlDemoScanForm");
    if (scanForm) scanForm.addEventListener("submit", function (event) {
      event.preventDefault();
      performDemoScan(containerId);
    });
  }

  function selectedCampaign() {
    return authorizedCampaigns().find(function (campaign) { return campaign.id === selectedCampaignId; }) || null;
  }

  function performDemoScan(containerId) {
    if (!canScanFeeControl()) return false;
    var container = document.getElementById(containerId);
    var input = container.querySelector("#feeControlQrInput");
    var resultBox = container.querySelector("#feeControlResult");
    var campaign = selectedCampaign();
    var payload = String(input && input.value || "").trim();
    var record = demoScanRecords[payload];
    var assignedClasses = assignedClassIdsForScan();
    if (!campaign || !record || record.lifecycleStatus !== "active" || campaign.studentIds.indexOf(record.id) === -1 || assignedClasses.indexOf(record.classId) === -1) {
      resultBox.innerHTML = '<div data-fee-control-result>' + window.ssState({ type: "error", title: "QR non autorisé", message: "Élève inconnu, non actif ou hors des classes affectées.", size: "compact" }) + '</div>';
      return false;
    }
    var definition = statusDefinition(record.status);
    resultBox.innerHTML = '<article class="fee-control-minimal-result" data-fee-control-result data-control-status="' + escapeHtml(record.status) + '"><header><div><span>' + escapeHtml(record.matricule) + '</span><h3>' + escapeHtml(record.name) + '</h3><p>' + escapeHtml(record.className) + '</p></div>' + window.ssBadge({ variant: definition.variant, label: definition.title }) + '</header><p><strong>Résultat :</strong> ' + escapeHtml(definition.message) + '</p><p><strong>Consigne :</strong> ' + escapeHtml(campaign.instruction) + '</p><small>Statut local de démonstration · BACKEND_LATER</small></article>';
    if (canReadFeeControl()) {
      localHistory.unshift({ reference: "LOCAL-CTRL-" + Date.now(), scannedAt: new Date().toLocaleString("fr-FR"), student: record.name, matricule: record.matricule, className: record.className, status: record.status, local: true, backendLater: true });
      persistLocalRows(CONTROL_HISTORY_STORAGE_KEY, localHistory);
    }
    input.value = "";
    if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
    return true;
  }

  root.SchoolSafeFeeControlModule = {
    render: render,
    setSession: function (user) { controlSessionOverride = user || null; },
    canRead: canReadFeeControl,
    canManage: canManageFeeControl,
    canScan: canScanFeeControl,
    _state: function () { return { campaignDrafts: campaignDrafts, localHistory: localHistory, selectedCampaignId: selectedCampaignId }; }
  };
})(window);
