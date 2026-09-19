(function (root) {
  "use strict";

  var activeContainerId = null;
  var activeUser = null;
  var activePickupStudent = null;
  var DISMISSAL_STORAGE_KEY = "schoolsafe-v2-security-dismissal-v1";
  var INCIDENT_STORAGE_KEY = "schoolsafe-v2-security-incidents-v1";
  var LOCKDOWN_STORAGE_KEY = "schoolsafe-v2-security-lockdown-v1";

  var PORTALS = [
    { id: "demo-portal-main", name: "Portail principal", station: "Poste A", status: "POSTE ACTIF" },
    { id: "demo-portal-east", name: "Portail Est", station: "Poste B", status: "HORS AFFECTATION" }
  ];

  var STUDENTS = [
    { id: "demo-active-student", name: "Lucas Martin", classId: "demo-class-1", className: "6e A", lifecycleStatus: "active", dismissalStatus: "À PRÉPARER", attendanceStatus: "PRÉSENT", movement: "ENTRÉ", firstEntry: "07:31", lastExit: "—", history: "Entrée portail principal · 07:31" },
    { id: "demo-student-chloe", name: "Chloé Bernard", classId: "demo-class-1", className: "6e A", lifecycleStatus: "active", dismissalStatus: "PRÊT", attendanceStatus: "RETARD", movement: "ENTRÉ", firstEntry: "08:12", lastExit: "—", history: "Retard vérifié · 08:12" },
    { id: "demo-student-ethan", name: "Ethan Leroy", classId: "demo-class-2", className: "5e A", lifecycleStatus: "active", dismissalStatus: "EN ATTENTE DU CONTRÔLE", attendanceStatus: "ABSENT", movement: "SORTI", firstEntry: "07:28", lastExit: "11:54", history: "Sortie autorisée · 11:54" },
    { id: "demo-draft-student", name: "Amina Mbuyi", classId: "demo-class-2", className: "5e A", lifecycleStatus: "draft", dismissalStatus: "DOSSIER NON ACTIF", attendanceStatus: "INDISPONIBLE", movement: "AUCUN", firstEntry: "—", lastExit: "—", history: "Dossier en préparation" }
  ];

  function escapeMarkup(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function icon(name) {
    return '<i data-lucide="' + name + '"></i>';
  }

  function allowsScope(user, permission, scope) {
    var access = root.SchoolSafeAccess;
    return !!(access && typeof access.allowsScope === "function" && access.allowsScope(user || {}, permission, scope));
  }

  function hasExplicitDeny(user) {
    var access = root.SchoolSafeAccess;
    return !!(access && typeof access.explicitDeny === "function" &&
      (access.explicitDeny(user || {}, "security.scan") || access.explicitDeny(user || {}, "security.pickup.manage")));
  }

  function getPortalProjection(user) {
    if (!allowsScope(user, "security.scan", "assigned_portal") || !allowsScope(user, "security.pickup.manage", "assigned_portal")) {
      return { allowed: false, portal: null, students: [] };
    }
    var assignedIds = Array.isArray(user && user.assignedPortalIds) ? user.assignedPortalIds : [];
    var portal = PORTALS.find(function (item) { return assignedIds.indexOf(item.id) >= 0; }) || null;
    return {
      allowed: !!portal,
      portal: portal,
      students: STUDENTS.filter(function (student) { return student.lifecycleStatus === "active"; })
    };
  }

  function getAttendanceProjection(user) {
    var activeStudents = STUDENTS.filter(function (student) { return student.lifecycleStatus === "active"; });
    var portalProjection = getPortalProjection(user);
    if (portalProjection.allowed) return { allowed: true, scopeType: "assigned_portal", students: portalProjection.students, portal: portalProjection.portal };
    if (!allowsScope(user, "security.events.read", "assigned_classes") || !allowsScope(user, "school.student.read", "assigned_classes")) {
      return { allowed: false, scopeType: "none", students: [], portal: null };
    }
    var classIds = Array.isArray(user && user.assignedClassIds) ? user.assignedClassIds : [];
    return {
      allowed: classIds.length > 0,
      scopeType: "assigned_classes",
      students: activeStudents.filter(function (student) { return classIds.indexOf(student.classId) >= 0; }),
      portal: null
    };
  }

  function readDismissalStore() {
    try {
      return JSON.parse(root.localStorage.getItem(DISMISSAL_STORAGE_KEY) || '{"statuses":{},"timeline":[],"notification":null}');
    } catch (error) {
      return { statuses: {}, timeline: [], notification: null };
    }
  }

  function writeDismissalStore(store) {
    try { root.localStorage.setItem(DISMISSAL_STORAGE_KEY, JSON.stringify(store)); }
    catch (error) {}
  }

  function pickupPortalFor(user) {
    if (!root.SchoolSafeStudentPickup || !root.SchoolSafeStudentPickup.canControlPickup(user || {})) return null;
    var assignedIds = Array.isArray(user && user.assignedPortalIds) ? user.assignedPortalIds : [];
    return PORTALS.find(function (portal) { return assignedIds.indexOf(portal.id) >= 0; }) || null;
  }

  function getDismissalProjection(user) {
    var portal = pickupPortalFor(user);
    if (!portal) return { allowed: false, portal: null, students: [], drafts: [], timeline: [], notification: null };
    var store = readDismissalStore();
    return {
      allowed: true,
      portal: portal,
      students: STUDENTS.filter(function (student) { return student.lifecycleStatus === "active"; }).map(function (student) {
        return Object.assign({}, student, { dismissalStatus: store.statuses[student.id] || student.dismissalStatus });
      }),
      drafts: STUDENTS.filter(function (student) { return student.lifecycleStatus !== "active"; }),
      timeline: Array.isArray(store.timeline) ? store.timeline : [],
      notification: store.notification || null
    };
  }

  function recordDismissal(student, status, eventType, detail) {
    if (!student || student.lifecycleStatus !== "active" || !pickupPortalFor(activeUser)) return false;
    var store = readDismissalStore();
    store.statuses = store.statuses || {};
    store.timeline = Array.isArray(store.timeline) ? store.timeline : [];
    store.statuses[student.id] = status;
    store.timeline.unshift({
      id: "dismissal-" + Date.now() + "-" + store.timeline.length,
      studentId: student.id,
      student: student.name,
      eventType: eventType,
      detail: detail || "",
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      portalId: pickupPortalFor(activeUser).id
    });
    store.timeline = store.timeline.slice(0, 30);
    if (eventType === "PRÉPARÉ") {
      store.notification = { studentId: student.id, student: student.name, text: "Votre enfant est en préparation de sortie" };
    }
    writeDismissalStore(store);
    return true;
  }

  function pickupStudentFrom(student) {
    var names = String(student.name || "Élève SchoolSafe").split(" ");
    return {
      id: student.id,
      matricule: student.id === "demo-active-student" ? "B1-0001" : "E5-" + student.id.slice(-4).toUpperCase(),
      first_name: names.shift() || "Élève",
      last_name: names.join(" ") || "SchoolSafe",
      lifecycle_status: student.lifecycleStatus,
      class_id: student.classId,
      enrollment: { status: "active", planned_class_id: student.classId, planned_class_name: student.className },
      primary_parent: { display_name: student.id === "demo-active-student" ? "Sophie Martin" : "Parent principal", account_status: "active" }
    };
  }

  function readIncidents() {
    try {
      var incidents = JSON.parse(root.localStorage.getItem(INCIDENT_STORAGE_KEY) || "[]");
      return Array.isArray(incidents) ? incidents : [];
    } catch (error) { return []; }
  }

  function saveIncident(incident) {
    var incidents = readIncidents();
    incidents.unshift(incident);
    try { root.localStorage.setItem(INCIDENT_STORAGE_KEY, JSON.stringify(incidents.slice(0, 40))); }
    catch (error) {}
  }

  function canPrepareIncident(user) {
    var assignedIds = Array.isArray(user && user.assignedPortalIds) ? user.assignedPortalIds : [];
    return assignedIds.length > 0 && (
      allowsScope(user, "security.scan", "assigned_portal") ||
      allowsScope(user, "security.pickup.manage", "assigned_portal")
    );
  }

  function canManageLockdown(user) {
    return allowsScope(user, "security.lockdown.manage", "school");
  }

  function canReadGlobalSecurityReport(user) {
    return allowsScope(user, "reports.security.read", "school");
  }

  function readLockdownState() {
    try {
      var state = JSON.parse(root.localStorage.getItem(LOCKDOWN_STORAGE_KEY) || "null");
      return state && state.status ? state : { status: "INACTIF", updatedAt: null };
    } catch (error) { return { status: "INACTIF", updatedAt: null }; }
  }

  function writeLockdownState(status) {
    try { root.localStorage.setItem(LOCKDOWN_STORAGE_KEY, JSON.stringify({ status: status, updatedAt: new Date().toISOString() })); }
    catch (error) {}
  }

  function eventStudent(event) {
    return STUDENTS.find(function (student) { return student.id === event.studentId; }) || null;
  }

  function historyAccess(user, event) {
    if (canReadGlobalSecurityReport(user)) return true;
    if (canPrepareIncident(user)) {
      var portals = Array.isArray(user && user.assignedPortalIds) ? user.assignedPortalIds : [];
      return !event.portalId || portals.indexOf(event.portalId) >= 0;
    }
    if (allowsScope(user, "security.events.read", "assigned_classes") && allowsScope(user, "school.student.read", "assigned_classes")) {
      var student = eventStudent(event);
      var classes = Array.isArray(user && user.assignedClassIds) ? user.assignedClassIds : [];
      return !!student && classes.indexOf(student.classId) >= 0;
    }
    return false;
  }

  function getSecurityHistory(user) {
    var events = [];
    var scanEvents = root.SchoolSafeSecurityModule && root.SchoolSafeSecurityModule.readLocalEvents ? root.SchoolSafeSecurityModule.readLocalEvents() : [];
    scanEvents.forEach(function (event) {
      events.push({ id: event.id, kind: event.type === "exit" ? "SORTIE" : event.type === "incident" ? "INCIDENT" : "ENTRÉE", studentId: event.studentId, student: event.studentName || "Identité non confirmée", detail: event.decision || "", portalId: event.portalId, time: event.occurredAt || "" });
    });
    var pickups = root.SchoolSafeStudentPickup && root.SchoolSafeStudentPickup.readPickupRecords ? root.SchoolSafeStudentPickup.readPickupRecords() : [];
    pickups.forEach(function (record, index) {
      events.push({ id: "pickup-history-" + index, kind: "RÉCUPÉRATION", studentId: record.studentId, student: record.student, detail: record.result + " · " + record.picker, portalId: "demo-portal-main", time: record.date + " " + record.time });
    });
    var dismissalTimeline = readDismissalStore().timeline;
    (Array.isArray(dismissalTimeline) ? dismissalTimeline : []).forEach(function (event) {
      events.push({ id: event.id, kind: event.eventType, studentId: event.studentId, student: event.student, detail: event.detail, portalId: event.portalId, time: event.time });
    });
    readIncidents().forEach(function (incident) {
      events.push({ id: incident.id, kind: "INCIDENT", studentId: incident.studentId, student: incident.studentName || "Sans élève", detail: incident.typeLabel + " · " + incident.status, portalId: incident.portalId, time: incident.occurredAt });
    });
    return events.filter(function (event) { return historyAccess(user, event); });
  }

  function getSecurityOperationsProjection(user) {
    var incidentAllowed = canPrepareIncident(user);
    var lockdownAllowed = canManageLockdown(user);
    var globalReportAllowed = canReadGlobalSecurityReport(user);
    var history = getSecurityHistory(user);
    var assignedIds = Array.isArray(user && user.assignedPortalIds) ? user.assignedPortalIds : [];
    var portal = PORTALS.find(function (item) { return assignedIds.indexOf(item.id) >= 0; }) || null;
    return {
      allowed: incidentAllowed || lockdownAllowed || globalReportAllowed || history.length > 0,
      canPrepareIncident: incidentAllowed,
      canManageLockdown: lockdownAllowed,
      canReadGlobalReport: globalReportAllowed,
      portal: portal,
      incidents: readIncidents().filter(function (incident) { return historyAccess(user, incident); }),
      lockdown: readLockdownState(),
      history: history
    };
  }

  function dashboardCard(label, value, detail, iconName) {
    return '<article class="guard-security-metric"><span>' + icon(iconName) + '</span><div><small>' + escapeMarkup(label) + '</small><strong>' + escapeMarkup(value) + '</strong><p>' + escapeMarkup(detail) + '</p></div></article>';
  }

  function shortcut(label, target, iconName) {
    return '<button type="button" data-guard-open="' + target + '"><span>' + icon(iconName) + '</span><strong>' + escapeMarkup(label) + '</strong><small>assigned_portal</small></button>';
  }

  function renderDenied(container, user) {
    container.innerHTML = '<section class="guard-security-denied">' + icon("shield-x") + '<div><p class="guard-security-eyebrow">Access_Law</p><h1>Accès sécurité refusé</h1><p>' +
      (hasExplicitDeny(user) ? "Un DENY explicite bloque ce poste." : "security.scan et security.pickup.manage avec assigned_portal sont obligatoires.") +
      '</p></div></section>';
  }

  function renderDashboard(container, projection) {
    var studentRows = projection.students.map(function (student) {
      return '<li><span><strong>' + escapeMarkup(student.name) + '</strong><small>' + escapeMarkup(student.className) + '</small></span><b>' + escapeMarkup(student.dismissalStatus) + '</b></li>';
    }).join("");
    container.innerHTML = '<div class="guard-security-shell guard-security-dashboard">' +
      '<header class="guard-security-hero"><div><p class="guard-security-eyebrow">Espace Gardien · démonstration locale</p><h1>' + escapeMarkup(projection.portal.name) + '</h1><p>' + escapeMarkup(projection.portal.station) + ' · contrôle limité au portail affecté.</p></div><span>' + escapeMarkup(projection.portal.status) + '</span></header>' +
      '<section class="guard-security-metrics" aria-label="Situation du poste">' +
        dashboardCard("Scans du jour", "18", "Entrées et sorties simulées", "scan-line") +
        dashboardCard("Élèves à préparer", "3", "Uniquement les dossiers actifs", "users-round") +
        dashboardCard("Contrôles de récupération", "2", "Une vérification en attente", "badge-check") +
        dashboardCard("Alertes à traiter", "1", "Identité à revérifier", "triangle-alert") +
      '</section>' +
      '<section class="guard-security-shortcuts" aria-label="Raccourcis du poste">' +
        shortcut("Scanner une carte", "scan", "scan-line") +
        shortcut("Contrôler une récupération", "pickup", "contact-round") +
        shortcut("Préparer une sortie", "dismissal", "clock-3") +
      '</section>' +
      '<button class="guard-security-inline-action" type="button" data-guard-attendance>' + icon("clipboard-check") + '<span><strong>Consulter la présence</strong><small>Statut du jour · démonstration</small></span></button>' +
      '<button class="guard-security-inline-action" type="button" data-guard-security-operations>' + icon("shield-alert") + '<span><strong>Incidents et historique</strong><small>Poste affecté · données locales</small></span></button>' +
      '<div class="guard-security-columns"><section class="guard-security-panel"><header><div><p class="guard-security-eyebrow">Opérations admissibles</p><h2>Élèves actifs du portail</h2></div><span>DRAFTS EXCLUS</span></header><ul class="guard-security-student-list">' + studentRows + '</ul></section>' +
      '<section class="guard-security-panel"><header><div><p class="guard-security-eyebrow">Session locale</p><h2>Événements récents</h2></div><span>DÉMONSTRATION</span></header><ol class="guard-security-event-list"><li><b>08:04</b><span>Entrée autorisée · Lucas Martin</span></li><li><b>12:15</b><span>Contrôle préparé · Chloé Bernard</span></li><li><b>14:02</b><span>Vérification d’identité requise</span></li></ol></section></div>' +
      '<aside class="guard-security-honesty">' + icon("cloud-off") + '<div><strong>FRONTEND UNIQUEMENT · BACKEND_LATER</strong><p>Les compteurs et événements sont des données de démonstration locales. Aucune action serveur réelle.</p></div></aside>' +
      '<section class="guard-security-feature" data-guard-feature hidden></section>' +
    '</div>';
    container.querySelectorAll("[data-guard-open]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = button.getAttribute("data-guard-open");
        if (target === "scan") {
          open("scan");
          return;
        }
        if (target === "pickup") {
          activePickupStudent = null;
          open("pickup");
          return;
        }
        if (target === "dismissal") {
          open("dismissal");
          return;
        }
        var feature = container.querySelector("[data-guard-feature]");
        if (!feature) return;
        feature.hidden = false;
        feature.innerHTML = '<p class="guard-security-eyebrow">Navigation Phase E</p><h2>' + escapeMarkup(button.textContent.trim()) + '</h2><strong>FEATURE_LATER</strong>';
      });
    });
    var attendance = container.querySelector("[data-guard-attendance]");
    if (attendance) attendance.addEventListener("click", function () { open("attendance"); });
    var operations = container.querySelector("[data-guard-security-operations]");
    if (operations) operations.addEventListener("click", function () { open("security"); });
  }

  function attendanceMetric(label, value, iconName) {
    return '<article><span>' + icon(iconName) + '</span><small>' + escapeMarkup(label) + '</small><strong>' + escapeMarkup(value) + '</strong></article>';
  }

  function renderAttendance(container, projection) {
    var students = projection.students;
    var rows = students.map(function (student) {
      return '<article class="guard-attendance-row" data-attendance-student="' + escapeMarkup(student.id) + '"><header><div><p class="guard-security-eyebrow">' + escapeMarkup(student.className) + '</p><h3>' + escapeMarkup(student.name) + '</h3></div><span>' + escapeMarkup(student.attendanceStatus) + '</span></header><dl><div><dt>Statut du jour</dt><dd>' + escapeMarkup(student.movement) + '</dd></div><div><dt>Première entrée</dt><dd>' + escapeMarkup(student.firstEntry) + '</dd></div><div><dt>Dernière sortie</dt><dd>' + escapeMarkup(student.lastExit) + '</dd></div></dl><p><strong>Historique synthétique :</strong> ' + escapeMarkup(student.history) + '</p></article>';
    }).join("");
    var present = students.filter(function (student) { return student.attendanceStatus === "PRÉSENT"; }).length;
    var absent = students.filter(function (student) { return student.attendanceStatus === "ABSENT"; }).length;
    var late = students.filter(function (student) { return student.attendanceStatus === "RETARD"; }).length;
    var entered = students.filter(function (student) { return student.movement === "ENTRÉ"; }).length;
    var exited = students.filter(function (student) { return student.movement === "SORTI"; }).length;
    container.innerHTML = '<div class="guard-security-shell guard-attendance-view"><header class="guard-security-workspace-header"><button type="button" data-guard-back>' + icon("arrow-left") + ' Tableau de bord</button><div><p class="guard-security-eyebrow">E2 · Présence frontend</p><h1>Présence des élèves actifs</h1><p>Consultation limitée à ' + escapeMarkup(projection.scopeType) + '.</p></div><span>DÉMONSTRATION · BACKEND_LATER</span></header><section class="guard-attendance-metrics">' + attendanceMetric("Présents", present, "user-check") + attendanceMetric("Absents", absent, "user-x") + attendanceMetric("Retards", late, "clock-alert") + attendanceMetric("Entrés", entered, "log-in") + attendanceMetric("Sortis", exited, "log-out") + '</section><section class="guard-security-panel"><header><div><p class="guard-security-eyebrow">Lecture seule</p><h2>Statut du jour</h2></div><span>AUCUNE MODIFICATION OFFICIELLE</span></header><div class="guard-attendance-list">' + (rows || '<p>Aucun élève actif dans le périmètre.</p>') + '</div></section><aside class="guard-security-honesty">' + icon("info") + '<div><strong>Données de démonstration</strong><p>Aucun historique serveur réel et aucune modification manuelle arbitraire.</p></div></aside></div>';
    var back = container.querySelector("[data-guard-back]");
    if (back) back.addEventListener("click", function () { render(activeContainerId, activeUser); });
  }

  function dismissalAction(student) {
    if (student.dismissalStatus === "RÉCUPÉRÉ") return '<small>Cycle local terminé.</small>';
    if (student.dismissalStatus === "PRÊT" || student.dismissalStatus === "EN ATTENTE DU CONTRÔLE") {
      return '<button type="button" data-dismissal-control="' + escapeMarkup(student.id) + '">' + icon("badge-check") + ' Passer au contrôle</button>';
    }
    return '<button type="button" data-dismissal-prepare="' + escapeMarkup(student.id) + '">' + icon("clock-3") + ' Préparer la sortie</button>';
  }

  function renderDismissal(container, projection) {
    var rows = projection.students.map(function (student) {
      return '<article class="guard-dismissal-row" data-dismissal-student="' + escapeMarkup(student.id) + '"><div><p class="guard-security-eyebrow">' + escapeMarkup(student.className) + '</p><h3>' + escapeMarkup(student.name) + '</h3><span>' + escapeMarkup(student.dismissalStatus) + '</span></div>' + dismissalAction(student) + '</article>';
    }).join("");
    var drafts = projection.drafts.map(function (student) {
      return '<article class="guard-dismissal-draft" data-dismissal-draft="' + escapeMarkup(student.id) + '">' + icon("shield-x") + '<div><strong>' + escapeMarkup(student.name) + '</strong><p>DOSSIER NON ACTIF · aucune préparation possible</p></div></article>';
    }).join("");
    var timeline = projection.timeline.map(function (event) {
      return '<li><time>' + escapeMarkup(event.time) + '</time><span><strong>' + escapeMarkup(event.eventType) + '</strong> · ' + escapeMarkup(event.student) + (event.detail ? '<small>' + escapeMarkup(event.detail) + '</small>' : '') + '</span></li>';
    }).join("");
    var notification = projection.notification
      ? '<aside class="guard-dismissal-notification" data-dismissal-notification-preview><span>Prévisualisation Parent · BACKEND_LATER</span><strong>' + escapeMarkup(projection.notification.student) + '</strong><p>' + escapeMarkup(projection.notification.text) + '</p></aside>'
      : '';
    container.innerHTML = '<div class="guard-security-shell guard-dismissal-view" data-guard-dismissal><header class="guard-security-workspace-header"><button type="button" data-guard-back>' + icon("arrow-left") + ' Tableau de bord</button><div><p class="guard-security-eyebrow">E5 · Préparation frontend</p><h1>Préparer les sorties</h1><p>security.pickup.manage · assigned_portal</p></div><span>' + escapeMarkup(projection.portal.name) + ' · BACKEND_LATER</span></header><aside class="guard-security-honesty"><strong>PRÊT ≠ SORTI</strong><p>La préparation n’autorise aucune remise. Seul un contrôle E4 autorisé produit l’état RÉCUPÉRÉ.</p></aside><div class="guard-security-columns"><section class="guard-security-panel"><header><div><p class="guard-security-eyebrow">Élèves actifs</p><h2>File de préparation</h2></div><span>DRAFTS EXCLUS</span></header><div class="guard-dismissal-list">' + rows + '</div>' + drafts + '</section><section class="guard-security-panel"><header><div><p class="guard-security-eyebrow">Chronologie locale</p><h2>Préparé → contrôlé → résultat</h2></div><span>LECTURE SEULE</span></header><ol class="guard-dismissal-timeline" data-dismissal-timeline>' + (timeline || '<li class="guard-dismissal-empty">Aucun changement local pour cette session.</li>') + '</ol></section></div>' + notification + '</div>';
    container.querySelectorAll("[data-dismissal-prepare]").forEach(function (button) {
      button.addEventListener("click", function () {
        var student = projection.students.find(function (item) { return item.id === button.getAttribute("data-dismissal-prepare"); });
        if (!recordDismissal(student, "PRÊT", "PRÉPARÉ", "Notification Parent prévisualisée · BACKEND_LATER")) return;
        renderDismissal(container, getDismissalProjection(activeUser));
        if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
      });
    });
    container.querySelectorAll("[data-dismissal-control]").forEach(function (button) {
      button.addEventListener("click", function () {
        var student = projection.students.find(function (item) { return item.id === button.getAttribute("data-dismissal-control"); });
        if (!recordDismissal(student, "EN ATTENTE DU CONTRÔLE", "CONTRÔLE DEMANDÉ", "Validation E4 obligatoire")) return;
        activePickupStudent = student;
        open("pickup");
      });
    });
    var back = container.querySelector("[data-guard-back]");
    if (back) back.addEventListener("click", function () { render(activeContainerId, activeUser); });
  }

  function incidentCard(incident) {
    return '<article class="guard-incident-card" data-security-incident><header><div><p class="guard-security-eyebrow">' + escapeMarkup(incident.typeLabel) + '</p><h3>' + escapeMarkup(incident.studentName || "Sans élève") + '</h3></div><span>' + escapeMarkup(incident.attention) + '</span></header><p>' + escapeMarkup(incident.description) + '</p><dl><div><dt>Portail</dt><dd>' + escapeMarkup(incident.portalName) + '</dd></div><div><dt>Statut</dt><dd>' + escapeMarkup(incident.status) + '</dd></div><div><dt>Action locale</dt><dd>' + escapeMarkup(incident.action) + '</dd></div></dl><small>' + escapeMarkup(new Date(incident.occurredAt).toLocaleString("fr-FR")) + ' · BACKEND_LATER</small></article>';
  }

  function lockdownActions(state) {
    if (state.status === "INACTIF") return '<button type="button" data-lockdown-next="PRÉPARATION">Préparer le lockdown</button>';
    if (state.status === "PRÉPARATION") return '<button type="button" data-lockdown-next="ACTIF — simulation uniquement">Simuler l’activation</button>';
    if (state.status === "ACTIF — simulation uniquement") return '<button type="button" data-lockdown-next="LEVÉ — simulation uniquement">Simuler la levée</button>';
    return '<button type="button" data-lockdown-next="INACTIF">Revenir à INACTIF</button>';
  }

  function renderSecurityOperationsMarkup(container, projection) {
    var studentOptions = STUDENTS.filter(function (student) { return student.lifecycleStatus === "active"; }).map(function (student) {
      return '<option value="' + escapeMarkup(student.id) + '">' + escapeMarkup(student.name + " · " + student.className) + '</option>';
    }).join("");
    var incidentForm = projection.canPrepareIncident
      ? '<form class="guard-incident-form" data-incident-form><label>Type<select name="incident_type"><option value="identity">Identité / récupération</option><option value="scan">Scan / QR</option><option value="safety">Sécurité du portail</option><option value="other">Autre</option></select></label><label>Élève<select name="incident_student"><option value="">Sans élève</option>' + studentOptions + '</select></label><label>Niveau d’attention<select name="incident_attention"><option value="normal">Normal</option><option value="high">Élevé</option><option value="critical">Critique</option></select></label><label>Description<textarea name="incident_description" required></textarea></label><label>Action locale<textarea name="incident_action" required></textarea></label><button type="submit">' + icon("file-plus-2") + ' Enregistrer l’incident local</button><small>Enregistrement frontend · aucune suppression · BACKEND_LATER</small></form>'
      : '<div class="guard-security-unavailable"><strong>Préparation d’incident non accordée</strong><p>Un poste `assigned_portal` autorisé est obligatoire.</p></div>';
    var incidents = projection.incidents.map(incidentCard).join("");
    var lockdown = projection.canManageLockdown
      ? '<div class="guard-lockdown-authorized"><span>SIMULATION UNIQUEMENT · BACKEND_LATER</span><strong data-lockdown-state>' + escapeMarkup(projection.lockdown.status) + '</strong><p>Aucune alerte réelle n’est déclenchée par cette interface.</p>' + lockdownActions(projection.lockdown) + '</div>'
      : '<div class="guard-security-unavailable"><strong>Gestion lockdown non accordée</strong><p>security.lockdown.manage + school est obligatoire. Aucun bouton de déclenchement n’est affiché.</p></div>';
    var history = projection.history.map(function (event) {
      return '<li><span>' + escapeMarkup(event.kind) + '</span><div><strong>' + escapeMarkup(event.student || "Sans élève") + '</strong><small>' + escapeMarkup(event.detail || "Événement local") + '</small></div><time>' + escapeMarkup(event.time || "—") + '</time></li>';
    }).join("");
    var globalReport = projection.canReadGlobalReport
      ? '<aside class="guard-global-report" data-global-security-report><strong>Rapport sécurité école disponible</strong><p>reports.security.read + school · synthèse frontend des événements locaux uniquement.</p><span>BACKEND_LATER</span></aside>'
      : '';
    container.innerHTML = '<div class="guard-security-shell guard-security-operations" data-security-operations><header class="guard-security-workspace-header"><button type="button" data-guard-back>' + icon("arrow-left") + ' Tableau de bord</button><div><p class="guard-security-eyebrow">E6 · Sécurité frontend</p><h1>Incidents, lockdown et historique</h1><p>' + escapeMarkup(projection.portal ? projection.portal.name : "Portée école") + '</p></div><span>LOCAL · BACKEND_LATER</span></header><div class="guard-security-columns"><section class="guard-security-panel"><header><div><p class="guard-security-eyebrow">Incident</p><h2>Préparer un enregistrement local</h2></div><span>AUCUNE SUPPRESSION</span></header>' + incidentForm + '<div class="guard-incident-list">' + (incidents || '<p>Aucun incident visible.</p>') + '</div></section><section class="guard-security-panel"><header><div><p class="guard-security-eyebrow">Lockdown</p><h2>Gestion bornée par Access_Law</h2></div><span>SIMULATION</span></header>' + lockdown + globalReport + '</section></div><section class="guard-security-panel"><header><div><p class="guard-security-eyebrow">Historique local</p><h2>Événements visibles</h2></div><span>LECTURE SEULE</span></header><ol class="guard-security-history" data-security-history>' + (history || '<li class="guard-dismissal-empty">Aucun événement visible dans cette portée.</li>') + '</ol></section></div>';
  }

  function bindSecurityOperations(container, projection) {
    var form = container.querySelector("[data-incident-form]");
    if (form) form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!canPrepareIncident(activeUser)) return;
      var data = new root.FormData(form);
      var studentId = String(data.get("incident_student") || "");
      var student = STUDENTS.find(function (item) { return item.id === studentId && item.lifecycleStatus === "active"; });
      var type = String(data.get("incident_type") || "other");
      var typeLabels = { identity: "Identité / récupération", scan: "Scan / QR", safety: "Sécurité du portail", other: "Autre" };
      var attentionLabels = { normal: "NORMAL", high: "ÉLEVÉ", critical: "CRITIQUE" };
      saveIncident({
        id: "incident-" + Date.now(),
        type: type,
        typeLabel: typeLabels[type] || typeLabels.other,
        studentId: student ? student.id : null,
        studentName: student ? student.name : null,
        portalId: projection.portal.id,
        portalName: projection.portal.name,
        description: String(data.get("incident_description") || ""),
        attention: attentionLabels[String(data.get("incident_attention") || "normal")] || "NORMAL",
        action: String(data.get("incident_action") || ""),
        status: "OUVERT",
        occurredAt: new Date().toISOString()
      });
      renderSecurityOperationsMarkup(container, getSecurityOperationsProjection(activeUser));
      bindSecurityOperations(container, getSecurityOperationsProjection(activeUser));
      if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
    });
    container.querySelectorAll("[data-lockdown-next]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!canManageLockdown(activeUser)) return;
        writeLockdownState(button.getAttribute("data-lockdown-next") || "INACTIF");
        var nextProjection = getSecurityOperationsProjection(activeUser);
        renderSecurityOperationsMarkup(container, nextProjection);
        bindSecurityOperations(container, nextProjection);
        if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
      });
    });
    var back = container.querySelector("[data-guard-back]");
    if (back) back.addEventListener("click", function () { render(activeContainerId, activeUser); });
  }

  function renderSecurityOperations(containerId, user) {
    var container = root.document.getElementById(containerId);
    if (!container) return false;
    activeContainerId = containerId;
    activeUser = user || {};
    var projection = getSecurityOperationsProjection(activeUser);
    if (!projection.allowed) {
      renderDenied(container, activeUser);
      return false;
    }
    renderSecurityOperationsMarkup(container, projection);
    bindSecurityOperations(container, projection);
    if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
    return true;
  }

  function renderScannerWorkspace(container, projection) {
    container.innerHTML = '<div class="guard-security-shell guard-scan-view"><header class="guard-security-workspace-header"><button type="button" data-guard-back>' + icon("arrow-left") + ' Tableau de bord</button><div><p class="guard-security-eyebrow">E3 · Scanner existant</p><h1>Entrée / sortie au ' + escapeMarkup(projection.portal.name) + '</h1><p>security.scan · assigned_portal</p></div><span>FRONTEND · BACKEND_LATER</span></header><section class="guard-security-panel"><div id="guardScannerHost" class="guard-scanner-host"></div></section></div>';
    root.SchoolSafeSecurityModule.render("guardScannerHost", { mode: "scan", user: activeUser, portalId: projection.portal.id, frontendDemo: true, hideModeTabs: true });
    var back = container.querySelector("[data-guard-back]");
    if (back) back.addEventListener("click", function () { render(activeContainerId, activeUser); });
  }

  function renderPickupWorkspace(container, projection) {
    container.innerHTML = '<div class="guard-security-shell guard-pickup-view"><header class="guard-security-workspace-header"><button type="button" data-guard-back>' + icon("arrow-left") + ' Tableau de bord</button><div><p class="guard-security-eyebrow">E4 · Contrôle frontend</p><h1>Contrôler une récupération</h1><p>security.pickup.manage · assigned_portal</p></div><span>' + escapeMarkup(projection.portal.name) + ' · BACKEND_LATER</span></header><section class="guard-security-panel"><div id="guardPickupHost" class="guard-pickup-host"></div></section></div>';
    root.SchoolSafeStudentPickup.resetControl();
    root.SchoolSafeStudentPickup.renderControl("guardPickupHost", activeUser, activePickupStudent ? pickupStudentFrom(activePickupStudent) : undefined);
    var back = container.querySelector("[data-guard-back]");
    if (back) back.addEventListener("click", function () { render(activeContainerId, activeUser); });
  }

  function open(view) {
    var container = root.document.getElementById(activeContainerId || "guardSecurityPortal");
    if (!container || !activeUser) return false;
    if (view === "attendance") {
      var projection = getAttendanceProjection(activeUser);
      if (!projection.allowed) {
        renderDenied(container, activeUser);
        if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
        return false;
      }
      renderAttendance(container, projection);
      if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
      return true;
    }
    if (view === "scan") {
      var portalProjection = getPortalProjection(activeUser);
      if (!portalProjection.allowed || !root.SchoolSafeSecurityModule) {
        renderDenied(container, activeUser);
        if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
        return false;
      }
      renderScannerWorkspace(container, portalProjection);
      if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
      return true;
    }
    if (view === "pickup") {
      var pickupProjection = getPortalProjection(activeUser);
      if (!pickupProjection.allowed || !root.SchoolSafeStudentPickup || !root.SchoolSafeStudentPickup.canControlPickup(activeUser)) {
        renderDenied(container, activeUser);
        if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
        return false;
      }
      renderPickupWorkspace(container, pickupProjection);
      if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
      return true;
    }
    if (view === "dismissal") {
      var dismissalProjection = getDismissalProjection(activeUser);
      if (!dismissalProjection.allowed) {
        renderDenied(container, activeUser);
        if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
        return false;
      }
      renderDismissal(container, dismissalProjection);
      if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
      return true;
    }
    if (view === "security") return renderSecurityOperations(activeContainerId || "guardSecurityPortal", activeUser);
    return false;
  }

  function render(containerId, user) {
    var container = root.document.getElementById(containerId);
    if (!container) return;
    activeContainerId = containerId;
    activeUser = user || {};
    var projection = getPortalProjection(activeUser);
    if (!projection.allowed) renderDenied(container, activeUser);
    else if (activeUser.native === true || activeUser.token) {
      container.innerHTML = '<section class="guard-security-denied" role="status"><i data-lucide="cloud-off"></i><div><span>SESSION LIVE</span><h1>DONNÉES INDISPONIBLES</h1><p>Les portails, élèves, scans, récupérations et événements réels ne sont pas connectés. Aucune fixture de sécurité n’est affichée · BACKEND_LATER.</p></div></section>';
    }
    else renderDashboard(container, projection);
    if (root.lucide && root.lucide.createIcons) root.lucide.createIcons();
  }

  function normalizedQuery(value) {
    var text = String(value || "").toLowerCase();
    if (typeof text.normalize === "function") text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return text;
  }

  function jaspeRefusal(message) {
    return { message: message, refusal: true };
  }

  function answerJaspe(query, context) {
    // INC-3 : la permission réelle décide, jamais le nom du rôle.
    var user = context && context.user ? context.user : null;
    if (!user || !allowsScope(user, "security.scan", "assigned_portal")) return null;
    if (!allowsScope(user, "safe.assistant.use", "own")) {
      return jaspeRefusal("Accès Jaspe non accordé : safe.assistant.use + own est requis et un DENY explicite reste prioritaire.");
    }
    var portalProjection = getPortalProjection(user);
    if (!portalProjection.allowed) {
      return jaspeRefusal("Je ne peux consulter aucune donnée de sécurité : aucun portail autorisé n’est disponible dans votre portée.");
    }
    var text = normalizedQuery(query);
    if ((/autorise|autoriser|valide|valider/.test(text) && /sortie|remise|recuper/.test(text)) ||
        (/suspend/.test(text) && /autoris/.test(text)) ||
        ((/declenche|active|leve|lever/.test(text)) && /lockdown/.test(text)) ||
        (/fabriqu|invente|cree/.test(text) && /scan|qr/.test(text)) ||
        (/modifi|supprim|efface/.test(text) && /historique|evenement/.test(text))) {
      return jaspeRefusal("Je ne peux pas exécuter cette action de sécurité. Les sorties, récupérations, autorisations familiales, scans, historiques et lockdown restent sous contrôle humain et Access_Law.");
    }
    if (/scan|qr/.test(text) && /explique|statut|dernier|visible/.test(text)) {
      var scans = root.SchoolSafeSecurityModule && root.SchoolSafeSecurityModule.readLocalEvents ? root.SchoolSafeSecurityModule.readLocalEvents() : [];
      var scan = scans.find(function (event) { return event.portalId === portalProjection.portal.id; });
      if (!scan) return { message: "Aucun scan local visible au portail affecté. Je ne fabrique aucun événement.", refusal: false };
      return { message: "Dernier scan visible : " + (scan.decision || "VÉRIFICATION") + " pour " + (scan.studentName || "identité non confirmée") + " au " + portalProjection.portal.name + ". Il s’agit d’un événement frontend BACKEND_LATER.", refusal: false };
    }
    if (/pourquoi|explique/.test(text) && /refus|recuper|remise/.test(text)) {
      var refusal = getSecurityHistory(user).find(function (event) { return event.kind === "REFUSÉ" || /SUSPENDUE|INCONNUE|REFUS/.test(event.detail || ""); });
      if (!refusal) return { message: "Aucun refus visible dans l’historique local de votre portail.", refusal: false };
      return { message: "La récupération de " + refusal.student + " est refusée : " + refusal.detail + ". La procédure d’urgence doit être suivie et aucune remise ne peut être validée.", refusal: false };
    }
    if (/resume|synthese|evenement/.test(text)) {
      var history = getSecurityHistory(user);
      if (!history.length) return { message: "Aucun événement local visible dans votre portail affecté.", refusal: false };
      return { message: history.length + " événement(s) visible(s) au portail affecté. Dernier élément : " + history[0].kind + " · " + history[0].student + ". Résumé frontend uniquement.", refusal: false };
    }
    if (/urgence|procedure/.test(text)) {
      return { message: "Procédure d’urgence : ne remettez pas l’enfant ; contactez d’abord le Parent principal, puis le contact d’urgence, puis la Direction. Les appels restent BACKEND_LATER.", refusal: false };
    }
    if (/rapport/.test(text) && /incident/.test(text)) {
      return { message: "Je peux aider à préparer le rapport : indiquez le type, la date et l’heure, le portail, l’élève actif concerné, la description, le niveau d’attention, l’action locale et le statut. Je ne l’enregistre pas à votre place.", refusal: false };
    }
    if (/retrouve|trouve|cherche/.test(text) && /eleve|lucas|chloe|ethan|amina/.test(text)) {
      var mentioned = STUDENTS.find(function (student) { return text.indexOf(normalizedQuery(student.name)) >= 0; });
      if (mentioned && mentioned.lifecycleStatus !== "active") return jaspeRefusal(mentioned.name + " : DOSSIER NON ACTIF. Ce brouillon est exclu de toutes les opérations de sécurité.");
      var visible = mentioned && portalProjection.students.find(function (student) { return student.id === mentioned.id; });
      if (!visible) return jaspeRefusal("Je ne peux pas retrouver cet élève dans le périmètre autorisé du portail.");
      return { message: visible.name + " est visible dans votre portail affecté : " + visible.className + " · " + visible.attendanceStatus + " · " + visible.dismissalStatus + ".", refusal: false };
    }
    return { message: "Je peux expliquer un scan visible, un refus de récupération, résumer les événements, rappeler la procédure d’urgence, préparer un rapport d’incident ou retrouver un élève actif dans votre portail.", refusal: false };
  }

  function clear() {
    activeContainerId = null;
    activeUser = null;
    activePickupStudent = null;
  }

  root.addEventListener("schoolsafe:pickup-decision", function (event) {
    var detail = event.detail || {};
    if (detail.allowed || !activeUser || !pickupPortalFor(activeUser)) return;
    var student = STUDENTS.find(function (item) { return item.id === detail.studentId && item.lifecycleStatus === "active"; });
    if (student) recordDismissal(student, "BLOQUÉ", "REFUSÉ", detail.label || "Contrôle non autorisé");
  });

  root.addEventListener("schoolsafe:pickup-recorded", function (event) {
    var detail = event.detail || {};
    if (!activeUser || !pickupPortalFor(activeUser)) return;
    var student = STUDENTS.find(function (item) { return item.id === detail.studentId && item.lifecycleStatus === "active"; });
    if (!student) return;
    recordDismissal(student, "EN ATTENTE DU CONTRÔLE", "CONTRÔLÉ", detail.result || "Personne autorisée");
    recordDismissal(student, "RÉCUPÉRÉ", "RÉCUPÉRÉ", detail.picker || "Remise locale validée");
  });

  root.SchoolSafeGuardSecurity = {
    PORTALS: PORTALS,
    STUDENTS: STUDENTS,
    getPortalProjection: getPortalProjection,
    getAttendanceProjection: getAttendanceProjection,
    getDismissalProjection: getDismissalProjection,
    getSecurityHistory: getSecurityHistory,
    getSecurityOperationsProjection: getSecurityOperationsProjection,
    answerJaspe: answerJaspe,
    open: open,
    clear: clear,
    render: render,
    renderSecurityOperations: renderSecurityOperations
  };
}(window));
