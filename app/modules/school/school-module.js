(function () {
  "use strict";

  var currentTab = "school";
  var settingsData = null;
  var staffData = [];
  var rolesData = [];
  var permissionsData = [];
  var studentsData = [];
  var studentStatus = "draft";
  var studentQuery = "";
  var currentUser = null;
  var studentSearchTimer = null;
  var tabsBound = false;

  function escapeMarkup(text) {
    if (text == null) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formField(name, label, type, value, extra) {
    extra = extra || {};
    var id = "school-field-" + name;
    var inputHtml;
    if (type === "textarea") {
      inputHtml = window.ssTextarea({ name: name, id: id, value: value, rows: extra.rows || 2 });
    } else if (type === "select") {
      inputHtml = window.ssSelect({ name: name, id: id, value: value, options: extra.options || [], required: extra.required });
    } else if (type === "file") {
      inputHtml = window.ssInput({ name: name, id: id, type: type, accept: extra.accept });
    } else if (type === "hidden") {
      inputHtml = '<input type="hidden" name="' + escapeMarkup(name) + '" value="' + escapeMarkup(value || "") + '">';
    } else {
      inputHtml = window.ssInput(Object.assign({ name: name, id: id, type: type, value: value }, extra));
    }
    return window.ssField({ label: label, labelFor: id, inputHtml: inputHtml, required: extra.required });
  }

  function formCheckbox(name, value, label, checked) {
    return '<label class="ss-checkbox"><input type="checkbox" name="' + escapeMarkup(name) + '" value="' + escapeMarkup(value) + '"' + (checked ? " checked" : "") + '> ' + escapeMarkup(label) + "</label>";
  }

  function notify(message) {
    if (window.SchoolSafeApp && window.SchoolSafeApp.notify) {
      window.SchoolSafeApp.notify(message);
    } else if (window.ssModal) {
      window.ssModal({
        title: "Information",
        content: "<p>" + escapeMarkup(message) + "</p>",
        size: "sm",
        actions: [{ label: "OK", variant: "primary" }]
      });
    } else {
      window.alert(message);
    }
  }

  // Mode démo : aucune session réelle (même règle que pilotage-module.js).
  // En démo, l'API école n'est pas disponible : état explicite, pas d'erreur réseau.
  function isDemoMode() {
    var live = window.currentSession;
    if (live && (live.native === true || live.token)) return false;
    try {
      var raw = window.sessionStorage && window.sessionStorage.getItem("schoolsafe-v2-session");
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && (saved.native === true || saved.token)) return false;
      }
    } catch (e) { /* session illisible : traiter comme démo */ }
    return true;
  }

  function renderDemoState(title, message) {
    var container = document.getElementById("schoolContent");
    if (!container) return;
    container.innerHTML = window.ssState({ type: "empty", title: title, message: message });
    if (typeof window.icons === "function") window.icons();
  }

  async function loadSchool() {
    if (isDemoMode()) {
      renderDemoState("Démonstration", "Les paramètres de l’école s’affichent avec les données réelles de l’établissement après connexion. Aucune donnée en mode démonstration.");
      return;
    }
    try {
      settingsData = await window.SchoolSafeSchoolAPI.getSettings();
      renderSchoolTab();
    } catch (e) {
      notify("Erreur chargement école : " + e.message);
    }
  }

  async function loadStaff() {
    if (isDemoMode()) {
      renderDemoState("Démonstration", "L’équipe de l’école s’affiche avec les données réelles de l’établissement après connexion. Aucune donnée en mode démonstration.");
      return;
    }
    try {
      var results = await Promise.all([
        window.SchoolSafeSchoolAPI.listStaff(),
        window.SchoolSafeSchoolAPI.listRoles(),
        window.SchoolSafeSchoolAPI.listPermissions(),
      ]);
      staffData = results[0];
      rolesData = results[1];
      permissionsData = results[2];
      renderStaffTab();
    } catch (e) {
      notify("Erreur chargement équipe : " + e.message);
    }
  }

  function canCreateStudent() {
    return hasScopedPermission("school.student.create", ["school"]);
  }

  function isExplicitlyDenied(permission) {
    if (window.SchoolSafeAccess && typeof window.SchoolSafeAccess.explicitDeny === "function") return window.SchoolSafeAccess.explicitDeny(currentUser || {}, permission);
    if (Array.isArray(currentUser && currentUser.deniedPermissions) && currentUser.deniedPermissions.indexOf(permission) >= 0) return true;
    return Array.isArray(currentUser && currentUser.permissionExceptions) && currentUser.permissionExceptions.some(function (item) {
      return item && item.permission === permission && String(item.effect || "").toLowerCase() === "deny";
    });
  }

  function hasPermission(permission) {
    if (isExplicitlyDenied(permission)) return false;
    return !!(window.SchoolSafeAccess && window.SchoolSafeAccess.canAccess(currentUser || {}, permission));
  }

  function scopeFor(permission) {
    var scopes = Array.isArray(currentUser && currentUser.scopes) ? currentUser.scopes : [];
    return scopes.find(function (scope) { return scope.permission === permission; }) || scopes.find(function (scope) { return !scope.permission; }) || null;
  }

  function hasScopedPermission(permission, allowedScopes) {
    var scope = scopeFor(permission);
    return hasPermission(permission) && !!scope && allowedScopes.indexOf(scope.type) >= 0;
  }

  function canViewStudent(student) {
    if (!hasPermission("school.student.read")) return false;
    var scope = scopeFor("school.student.read");
    if (!scope) return false;
    if (scope.type === "school") return true;
    if (scope.type === "own_children") return Array.isArray(currentUser.childIds) && currentUser.childIds.indexOf(student.id) >= 0;
    if (scope.type === "assigned_classes") return student.lifecycle_status === "active" && Array.isArray(currentUser.assignedClassIds) && currentUser.assignedClassIds.indexOf(student.class_id) >= 0;
    return false;
  }

  function canUseTab(tabName) {
    if (tabName === "school") return hasScopedPermission("school.manage", ["school"]);
    if (tabName === "staff") return hasScopedPermission("staff.read", ["school"]) || hasScopedPermission("staff.manage", ["school"]);
    if (tabName === "students") return hasScopedPermission("school.student.read", ["school", "own_children", "assigned_classes", "assigned_subjects"]);
    if (tabName === "structure") return !!(window.SchoolSafeAcademicStructure && window.SchoolSafeAcademicStructure.canRead(currentUser));
    return false;
  }

  function studentBadge(status) {
    return status === "draft"
      ? window.ssBadge({ label: "EN PRÉPARATION", variant: "warning" })
      : window.ssBadge({ label: "ACTIF", variant: "success" });
  }

  async function loadStudents() {
    var container = document.getElementById("schoolContent");
    if (!container) return;
    if (isDemoMode()) {
      renderDemoState("Démonstration", "Les dossiers élèves s’affichent avec les données réelles de l’établissement après connexion. Aucune donnée en mode démonstration.");
      return;
    }
    renderStudentsTab(true);
    try {
      var page = await (window.SchoolSafeSchoolNativeAPI || window.SchoolSafeSchoolAPI).listStudents(studentStatus, studentQuery);
      studentsData = Array.isArray(page) ? page : (page.rows || []);
      renderStudentsTab(false);
    } catch (e) {
      container.innerHTML = window.ssState({
        type: "error",
        title: "Dossiers indisponibles",
        message: "Impossible de charger les élèves. " + e.message,
      });
    }
  }

  function studentName(student) {
    return [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ");
  }

  function renderStudentList() {
    var visibleStudents = studentsData.filter(canViewStudent);
    if (!visibleStudents.length) {
      return window.ssState({
        type: "empty",
        title: studentStatus === "draft" ? "Aucun dossier en préparation" : "Aucun élève actif",
        message: studentQuery ? "Aucun résultat ne correspond à cette recherche." : "La liste se remplira ici.",
        size: "compact",
      });
    }
    return '<div class="student-record-list">' + visibleStudents.map(function (student) {
      var enrollment = student.enrollment || {};
      var parent = student.primary_parent || {};
      return (
        '<article class="student-record" data-student-id="' + escapeMarkup(student.id) + '">' +
          '<div class="student-record__identity"><span class="student-record__initials" aria-hidden="true">' +
            escapeMarkup((student.first_name || "?").charAt(0) + (student.last_name || "").charAt(0)) +
          '</span><div><h3>' + escapeMarkup(studentName(student)) + '</h3><p>Matricule ' + escapeMarkup(student.matricule) + '</p></div></div>' +
          '<div class="student-record__facts"><span><b>Classe prévue</b>' + escapeMarkup(enrollment.planned_class_name || student.class_name || "Non renseignée") + '</span>' +
          '<span><b>Parent principal</b>' + escapeMarkup(parent.display_name || "Non renseigné") +
          (parent.account_status === "pending_activation" ? '<small>pending_activation</small>' : '') + '</span></div>' +
          '<div class="student-record__status">' + studentBadge(student.lifecycle_status) +
          window.ssButton({ label: "Dossier central", variant: "primary", size: "sm", attrs: { "data-student-dossier": escapeMarkup(student.id) } }) +
          window.ssButton({ label: "Consulter", variant: "secondary", size: "sm", attrs: { "data-student-detail": escapeMarkup(student.id) } }) + '</div>' +
        '</article>'
      );
    }).join("") + '</div>';
  }

  function bindStudentWorkspace() {
    var container = document.getElementById("schoolContent");
    if (!container) return;
    container.querySelectorAll("[data-student-status]").forEach(function (button) {
      button.addEventListener("click", function () {
        studentStatus = button.getAttribute("data-student-status");
        loadStudents();
      });
    });
    var search = document.getElementById("studentSearch");
    if (search) {
      search.addEventListener("input", function () {
        window.clearTimeout(studentSearchTimer);
        studentSearchTimer = window.setTimeout(function () {
          studentQuery = search.value.trim();
          loadStudents();
        }, 250);
      });
    }
    var createButton = document.getElementById("newStudentDraftBtn");
    if (createButton) createButton.addEventListener("click", openStudentDraftModal);
    var importButton = document.getElementById("studentImportBtn");
    if (importButton) importButton.addEventListener("click", openStudentImportModal);
    container.querySelectorAll("[data-student-detail]").forEach(function (button) {
      button.addEventListener("click", function () { openStudentDetail(button.getAttribute("data-student-detail")); });
    });
    container.querySelectorAll("[data-student-dossier]").forEach(function (button) {
      button.addEventListener("click", async function () {
        try {
          var nativeApi = window.SchoolSafeSchoolNativeAPI || window.SchoolSafeSchoolAPI;
          var detail = await nativeApi.getStudent(button.getAttribute("data-student-dossier"));
          // La projection native renvoie { data: {...} }, l'ancienne API renvoie l'objet directement
          if (detail.data) detail = detail.data;
          if (window.SchoolSafeStudentDossier) window.SchoolSafeStudentDossier.open(detail, currentUser);
        } catch (error) { notify("Erreur : " + error.message); }
      });
    });
    if (window.lucide) window.lucide.createIcons();
  }

  function renderStudentsTab(loading) {
    var container = document.getElementById("schoolContent");
    if (!container) return;
    var warning = studentStatus === "draft"
      ? '<div class="student-draft-warning" role="note"><i data-lucide="info"></i><div><b>Dossier non opérationnel</b><p>Ce brouillon n’est pas opérationnel. Il ne peut être utilisé ni par Cartes, QR, Sécurité, Finance, Pédagogie ou Documents.</p></div></div>'
      : '';
    container.innerHTML =
      '<section id="studentWorkspace" class="student-workspace" aria-busy="' + (loading ? "true" : "false") + '">' +
        '<header class="student-workspace__header"><div><h3>Dossiers élèves</h3><p>Préparez les dossiers administratifs et consultez séparément les élèves actifs.</p></div>' +
        (canCreateStudent() ? window.ssButton({ label: "Nouveau dossier", icon: "user-plus", attrs: { id: "newStudentDraftBtn" } }) : '') +
        (canCreateStudent() ? window.ssButton({ label: "Importer des élèves (CSV)", icon: "upload", variant: "secondary", attrs: { id: "studentImportBtn" } }) : '') + '</header>' +
        '<div class="student-toolbar"><div class="student-status-filter" role="group" aria-label="Statut du dossier">' +
          '<button type="button" data-student-status="draft" class="' + (studentStatus === "draft" ? "active" : "") + '">En préparation</button>' +
          '<button type="button" data-student-status="active" class="' + (studentStatus === "active" ? "active" : "") + '">Actifs</button></div>' +
          '<label class="student-search" for="studentSearch"><i data-lucide="search"></i><span class="sr-only">Rechercher un élève</span><input id="studentSearch" type="search" value="' + escapeMarkup(studentQuery) + '" placeholder="Rechercher par nom ou matricule"></label></div>' +
        warning +
        '<div id="studentListRegion" aria-live="polite">' + (loading
          ? window.ssState({ type: "loading", title: "Chargement des dossiers", message: "Lecture sécurisée en cours.", size: "compact" })
          : renderStudentList()) + '</div>' +
      '</section>';
    bindStudentWorkspace();
  }

  // Familles (V05–V11) : section récupérateurs de la modale détail élève —
  // deux groupes séparés, actions valider/révoquer sur les routes natives.
  function familyApiBase() {
    return window.schoolSafeApiBase || (window.schoolSafeBackendConfig ? window.schoolSafeBackendConfig.api_base : "http://127.0.0.1:8787");
  }

  async function familyFetch(path, options) {
    var res = await fetch(familyApiBase() + path, Object.assign({ credentials: "include", headers: { "Accept": "application/json", "Content-Type": "application/json" } }, options || {}));
    var payload = null;
    try { payload = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(payload && payload.message ? payload.message : "Erreur " + res.status);
    return payload;
  }

  async function loadPickupAuthSection(section, studentId) {
    if (!section) return;
    try {
      var payload = await familyFetch("/native/family/students/" + encodeURIComponent(studentId) + "/pickup-authorizations");
      var data = payload && payload.data;
      if (!data) { section.innerHTML = '<p class="ss-muted">Récupérateurs indisponibles.</p>'; return; }
      var html = "";
      if (Array.isArray(data.family) && data.family.length) {
        html += '<h4>Responsables familiaux</h4><ul>';
        data.family.forEach(function (person) {
          html += '<li><b>' + escapeMarkup(person.name) + '</b> <small>' + escapeMarkup(person.type) +
            (person.is_primary ? ' · principal' : '') + (person.authorized ? '' : ' · récupération suspendue') + '</li>';
        });
        html += '</ul>';
      }
      html += '<h4>Personnes accréditées à la récupération</h4>';
      if (Array.isArray(data.accredited) && data.accredited.length) {
        html += '<ul>';
        data.accredited.forEach(function (person) {
          html += '<li data-authorization-id="' + escapeMarkup(person.authorization_id) + '"><b>' + escapeMarkup(person.name) + '</b> <small>' +
            escapeMarkup(person.status) +
            (person.starts_on ? ' · du ' + escapeMarkup(String(person.starts_on).slice(0, 10)) : '') +
            (person.ends_on ? ' au ' + escapeMarkup(String(person.ends_on).slice(0, 10)) : '') + '</small> ';
          if (person.status === "pending") {
            html += '<button type="button" class="ss-button ss-button--secondary" data-auth-action="validate" style="margin-left:6px">Valider</button>';
          }
          if (person.status === "active" || person.status === "pending" || person.status === "suspended") {
            html += '<button type="button" class="ss-button ss-button--secondary" data-auth-action="revoke" style="margin-left:6px">Retirer</button>';
          }
          html += '</li>';
        });
        html += '</ul>';
      } else {
        html += '<p class="ss-muted">Aucun accrédité externe enregistré pour cet élève.</p>';
      }
      html += '<p class="ss-muted">Jusqu’à trois accrédités actifs par enfant — aucun compte n’est créé pour eux.</p>';
      section.innerHTML = html;

      section.querySelectorAll("[data-auth-action]").forEach(function (button) {
        button.addEventListener("click", async function () {
          var id = button.closest("[data-authorization-id]").getAttribute("data-authorization-id");
          var action = button.getAttribute("data-auth-action");
          if (action === "revoke" && !window.confirm("Retirer cette accréditation ? L’effet est immédiat.")) return;
          button.disabled = true;
          try {
            if (action === "validate") {
              await familyFetch("/native/family/pickup-authorizations/" + encodeURIComponent(id) + "/validate", { method: "POST" });
              notify("Accréditation validée.");
            } else {
              await familyFetch("/native/family/pickup-authorizations/" + encodeURIComponent(id) + "/revoke", { method: "POST", body: JSON.stringify({ mode: "revoked" }) });
              notify("Accréditation retirée.");
            }
            loadPickupAuthSection(section, studentId);
          } catch (e) {
            button.disabled = false;
            notify("Erreur : " + e.message);
          }
        });
      });
    } catch (e) {
      section.innerHTML = '<p class="ss-muted">Récupérateurs indisponibles : ' + escapeMarkup(e.message) + '</p>';
    }
  }

  async function openStudentDetail(studentId) {
    try {
      var detail = await window.SchoolSafeSchoolAPI.getStudent(studentId);
      if (detail.lifecycle_status === "draft" && window.SchoolSafeStudentFamily) {
        window.SchoolSafeStudentFamily.open(detail, currentUser);
        return;
      }
      if (window.SchoolSafeStudentLifecycle) {
        window.SchoolSafeStudentLifecycle.open(detail, currentUser);
        return;
      }
      var enrollment = detail.enrollment || {};
      var parent = detail.primary_parent || {};
      window.ssModal({
        title: studentName(detail),
        content: '<div class="student-detail-readonly">' + studentBadge(detail.lifecycle_status) +
          '<dl><div><dt>Matricule</dt><dd>' + escapeMarkup(detail.matricule) + '</dd></div>' +
          '<div><dt>Classe prévue</dt><dd>' + escapeMarkup(enrollment.planned_class_name || "—") + '</dd></div>' +
          '<div><dt>Parent principal</dt><dd>' + escapeMarkup(parent.display_name || "—") + '</dd></div>' +
          '<div><dt>Statut Parent</dt><dd>' + escapeMarkup(parent.account_status || "—") + '</dd></div></dl>' +
          '<div id="pickupAuthSection" class="authorized-persons pickup-groups" data-student-id="' + escapeMarkup(detail.id) + '"><p class="ss-muted">Chargement des récupérateurs…</p></div>' +
          (detail.lifecycle_status === "draft" ? '<p class="student-detail-readonly__notice">Lecture seule · dossier non opérationnel.</p>' : '') + '</div>',
        actions: [{ label: "Fermer", variant: "secondary" }],
      });
      loadPickupAuthSection(document.getElementById("pickupAuthSection"), detail.id);
    } catch (e) {
      notify("Erreur : " + e.message);
    }
  }

  // Lot E : import collectif des élèves — parcours préparer → aperçu → confirmer.
  // Le CSV est lu localement (FileReader), l'aperçu s'affiche AVANT toute
  // écriture ; la confirmation appelle le commit idempotent côté serveur.
  async function openStudentImportModal() {
    var modal = window.ssModal({
      title: "Importer des élèves (CSV)",
      content: '<div class="student-import-modal">' +
        '<p class="ss-muted">Fichier CSV avec les colonnes : <code>matricule, first_name, last_name, class_code</code> (et facultativement <code>eleve_ref, pere, mere, tuteur</code>).</p>' +
        '<input type="file" id="studentImportFile" accept=".csv,text/csv" class="ss-input">' +
        '<div id="studentImportPreview" aria-live="polite"></div></div>',
      actions: [
        { label: "Annuler", variant: "secondary", onClick: function () { modal.close(); } },
        { label: "Aperçu", variant: "primary", type: "button", attrs: { id: "studentImportPreviewBtn" } },
        { label: "Confirmer l'import", variant: "primary", type: "button", attrs: { id: "studentImportCommitBtn" }, disabled: true },
      ],
    });
    var fileInput = modal.content.querySelector("#studentImportFile");
    var previewBox = modal.content.querySelector("#studentImportPreview");
    var previewBtn = modal.content.querySelector("#studentImportPreviewBtn");
    var commitBtn = modal.content.querySelector("#studentImportCommitBtn");
    var jobId = null;
    var fileContent = null;
    var filename = null;

    previewBtn.addEventListener("click", async function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) { modal.setError("Choisissez un fichier CSV."); return; }
      previewBtn.disabled = true;
      previewBox.innerHTML = '<p class="ss-muted">Lecture et préparation…</p>';
      try {
        fileContent = await file.text();
        filename = file.name;
        var prepare = await familyFetch("/native/family/student-imports", {
          method: "POST",
          body: JSON.stringify({ filename: filename, file_content: fileContent }),
        });
        var d = prepare && prepare.data;
        if (d && d.error_codes && d.error_codes.length) {
          previewBox.innerHTML = '<p class="ss-error">' + d.error_codes.map(escapeMarkup).join("<br>") + '</p>';
          previewBtn.disabled = false;
          return;
        }
        jobId = d.job_id;
        var preview = await familyFetch("/native/family/student-imports/" + encodeURIComponent(jobId) + "/preview", { method: "POST" });
        var p = preview && preview.data;
        var counts = p && p.counts;
        var plan = p && p.plan;
        var html = '<h4>Aperçu du lot' + (d.idempotent ? ' (déjà importé — idempotent)' : '') + '</h4>' +
          '<p>' + (counts.total || 0) + ' ligne(s) : <b>' + (counts.create || 0) + '</b> à créer, <b>' + (counts.match || 0) + '</b> existantes, <b>' + (counts.reject || 0) + '</b> rejetées.</p>';
        if (Array.isArray(plan) && plan.length) {
          html += '<div class="import-plan-list"><ul>';
          plan.slice(0, 200).forEach(function (line) {
            html += '<li><small>#' + line.line_no + '</small> <b>' + escapeMarkup(line.name || "—") + '</b>' +
              (line.matricule ? ' · ' + escapeMarkup(line.matricule) : '') +
              ' <small>' + escapeMarkup(line.action) + (line.error_code ? ' — ' + escapeMarkup(line.error_code) : '') + '</small></li>';
          });
          html += '</ul>';
          if (plan.length > 200) html += '<p class="ss-muted">… ' + (plan.length - 200) + ' ligne(s) supplémentaires.</p>';
          html += '</div>';
        }
        html += '<p class="ss-muted">Aucune donnée n\'est encore enregistrée. Confirmez pour appliquer.</p>';
        previewBox.innerHTML = html;
        commitBtn.disabled = false;
      } catch (e) {
        previewBox.innerHTML = '<p class="ss-error">Erreur : ' + escapeMarkup(e.message) + '</p>';
        previewBtn.disabled = false;
      }
    });

    commitBtn.addEventListener("click", async function () {
      if (!jobId) return;
      commitBtn.disabled = true;
      previewBox.insertAdjacentHTML("beforeend", '<p class="ss-muted">Application en cours…</p>');
      try {
        var result = await familyFetch("/native/family/student-imports/" + encodeURIComponent(jobId) + "/commit", { method: "POST" });
        var c = result && result.data;
        modal.close();
        notify("Import terminé : " + (c.created_rows || 0) + " créé(s), " + (c.matched_rows || 0) + " existant(s), " + (c.rejected_rows || 0) + " rejeté(s)." + (c.idempotent ? " (lot déjà appliqué)" : ""));
        await loadStudents();
      } catch (e) {
        modal.setError(e.message);
        commitBtn.disabled = false;
      }
    });
  }

  async function openStudentDraftModal() {
    var resources;
    try {
      resources = await Promise.all([
        window.SchoolSafeSchoolAPI.listAcademicYears(),
        window.SchoolSafeSchoolAPI.listClasses(),
      ]);
    } catch (e) {
      notify("Impossible de préparer le formulaire : " + e.message);
      return;
    }
    var years = resources[0] || [];
    var classes = resources[1] || [];
    var today = new Date().toISOString().slice(0, 10);
    var modal = window.ssModal({
      title: "Nouveau dossier élève",
      size: "lg",
      content:
        '<form id="studentDraftForm" class="ss-form-grid ss-form-grid--2">' +
          formField("matricule", "Matricule", "text", "", { required: true }) +
          formField("first_name", "Prénom", "text", "", { required: true }) +
          formField("middle_name", "Deuxième prénom", "text", "") +
          formField("last_name", "Nom", "text", "", { required: true }) +
          formField("date_of_birth", "Date de naissance", "date", "") +
          formField("gender", "Genre", "select", "", { options: [{ value: "", label: "Non renseigné" }, { value: "F", label: "Fille" }, { value: "M", label: "Garçon" }] }) +
          formField("academic_year_id", "Année scolaire", "select", "", { required: true, options: years.map(function (year) { return { value: year.id, label: year.label }; }) }) +
          formField("planned_class_id", "Classe prévue", "select", "", { required: true, options: classes.map(function (item) { return { value: item.id, label: item.name }; }) }) +
          formField("enrollment_starts_on", "Début prévu", "date", today, { required: true }) +
          formField("guardian_type", "Lien avec l’élève", "select", "mere", { required: true, options: [{ value: "mere", label: "Mère" }, { value: "pere", label: "Père" }, { value: "tuteur", label: "Tuteur" }, { value: "autre", label: "Autre" }] }) +
          '<fieldset class="student-parent-choice ss-field--wide"><legend>Parent principal obligatoire</legend>' +
            '<label for="studentParentExisting"><input id="studentParentExisting" type="radio" name="parent_mode" value="existing" checked> Parent existant</label>' +
            '<label for="studentParentInvite"><input id="studentParentInvite" type="radio" name="parent_mode" value="invite"> Inviter un nouveau Parent</label>' +
          '</fieldset>' +
          '<div id="existingParentFields" class="student-parent-fields ss-field--wide"><label class="ss-label" for="parentSearch">Rechercher le Parent</label><input id="parentSearch" type="search" placeholder="Nom ou email"><input id="existingParentId" type="hidden"><div id="parentSearchResults" class="student-parent-results" aria-live="polite"></div></div>' +
          '<div id="invitedParentFields" class="student-parent-fields ss-field--wide" hidden>' +
            '<div class="student-invite-status"><b>pending_activation</b><span>Le Parent activera lui-même son compte.</span></div>' +
            '<div class="ss-form-grid ss-form-grid--2">' +
              formField("parent_first_name", "Prénom du Parent", "text", "") +
              formField("parent_last_name", "Nom du Parent", "text", "") +
              formField("parent_email", "Email du Parent", "email", "") +
              formField("parent_phone", "Téléphone du Parent", "tel", "") +
            '</div><p class="student-password-notice">Aucun mot de passe n’est demandé : l’école ne le saisit, ne l’affiche et ne le connaît jamais.</p></div>' +
        '</form>',
      actions: [
        { label: "Annuler", variant: "secondary", onClick: function () { modal.close(); } },
        { label: "Créer le brouillon", variant: "primary", type: "submit", closeOnClick: false, attrs: { form: "studentDraftForm" } },
      ],
    });
    var form = modal.content.querySelector("#studentDraftForm");
    var existingFields = form.querySelector("#existingParentFields");
    var inviteFields = form.querySelector("#invitedParentFields");
    function updateParentMode() {
      var invited = form.parent_mode.value === "invite";
      existingFields.hidden = invited;
      inviteFields.hidden = !invited;
      ["parent_first_name", "parent_last_name", "parent_email"].forEach(function (name) { form[name].required = invited; });
    }
    form.querySelectorAll('[name="parent_mode"]').forEach(function (radio) { radio.addEventListener("change", updateParentMode); });
    var parentSearchTimer = null;
    form.querySelector("#parentSearch").addEventListener("input", function (event) {
      window.clearTimeout(parentSearchTimer);
      parentSearchTimer = window.setTimeout(async function () {
        var query = event.target.value.trim();
        var results = form.querySelector("#parentSearchResults");
        if (query.length < 2) { results.innerHTML = ""; return; }
        try {
          var parents = await window.SchoolSafeSchoolAPI.searchParents(query);
          results.innerHTML = parents.map(function (parent) {
            return '<button type="button" data-parent-id="' + escapeMarkup(parent.id) + '"><b>' + escapeMarkup(parent.display_name) + '</b><span>' + escapeMarkup(parent.email || "Compte actif") + '</span></button>';
          }).join("") || '<p>Aucun Parent trouvé.</p>';
          results.querySelectorAll("[data-parent-id]").forEach(function (button) {
            button.addEventListener("click", function () {
              form.existingParentId.value = button.getAttribute("data-parent-id");
              results.querySelectorAll("button").forEach(function (item) { item.classList.toggle("selected", item === button); });
            });
          });
        } catch (e) { modal.setError(e.message); }
      }, 250);
    });
    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var invited = form.parent_mode.value === "invite";
      if (!invited && !form.existingParentId.value) {
        modal.setError("Sélectionnez un Parent existant de l’école.");
        return;
      }
      modal.setLoading(true);
      try {
        await window.SchoolSafeSchoolAPI.createStudentDraft({
          matricule: form.matricule.value,
          first_name: form.first_name.value,
          middle_name: form.middle_name.value || undefined,
          last_name: form.last_name.value,
          date_of_birth: form.date_of_birth.value || undefined,
          gender: form.gender.value || undefined,
          academic_year_id: form.academic_year_id.value,
          planned_class_id: form.planned_class_id.value,
          enrollment_starts_on: form.enrollment_starts_on.value,
          primary_parent: invited ? {
            mode: "invite", email: form.parent_email.value, first_name: form.parent_first_name.value,
            last_name: form.parent_last_name.value, phone: form.parent_phone.value || undefined,
            guardian_type: form.guardian_type.value,
          } : { mode: "existing", profile_id: form.existingParentId.value, guardian_type: form.guardian_type.value },
        });
        modal.close();
        studentStatus = "draft";
        notify("Dossier élève créé en préparation.");
        await loadStudents();
      } catch (e) {
        modal.setError(e.message);
      } finally {
        modal.setLoading(false);
      }
    });
    updateParentMode();
  }

  function renderTabs() {
    var container = document.getElementById("schoolTabs");
    if (!container) return;
    container.querySelectorAll("button").forEach(function (btn) {
      var tabName = btn.getAttribute("data-school-tab");
      var allowed = canUseTab(tabName);
      btn.hidden = !allowed;
      btn.setAttribute("aria-hidden", allowed ? "false" : "true");
      btn.classList.toggle("active", allowed && tabName === currentTab);
    });
  }

  function renderAcademicYears() {
    var years = settingsData.academic_years || [];
    var rows = years.map(function (y) {
      return (
        '<tr data-year-id="' + escapeMarkup(y.id) + '">' +
        "<td>" + escapeMarkup(y.label) + "</td>" +
        "<td>" + escapeMarkup(y.starts_on) + "</td>" +
        "<td>" + escapeMarkup(y.ends_on) + "</td>" +
        '<td>' + (y.is_active ? window.ssBadge({ label: "Active", variant: "success" }) : '') + "</td>" +
        '<td class="school-actions">' +
        (y.is_active ? '' : window.ssIconButton({ icon: "check", title: "Activer", attrs: { "data-action": "activate-year" } })) +
        window.ssIconButton({ icon: "pencil", title: "Modifier", attrs: { "data-action": "edit-year" } }) +
        "</td></tr>"
      );
    }).join("");
    return (
      '<section class="form-section"><h3>Années scolaires</h3>' +
      window.ssTable({
        headers: ["Libellé", "Début", "Fin", "Statut", "Actions"],
        rows: rows,
        empty: "Aucune année scolaire.",
        emptyTitle: "Années scolaires",
        responsive: true
      }) +
      window.ssButton({ label: "Ajouter une année", icon: "plus", attrs: { id: "addYearBtn" } }) +
      "</section>"
    );
  }

  function renderCycles() {
    var cycles = settingsData.cycles || [];
    var rows = cycles.map(function (c) {
      return (
        '<tr><td>' + escapeMarkup(c.cycle_name) + '</td>' +
        '<td>' + (c.is_active ? window.ssBadge({ label: "Actif", variant: "success" }) : window.ssBadge({ label: "Inactif", variant: "error" })) + "</td>" +
        '<td>' + window.ssButton({ label: (c.is_active ? "Désactiver" : "Activer"), size: "sm", className: "toggle-cycle", attrs: { "data-cycle": escapeMarkup(c.cycle_key) } }) + "</td></tr>"
      );
    }).join("");
    return (
      '<section class="form-section"><h3>Cycles</h3>' +
      window.ssTable({
        headers: ["Cycle", "Statut", "Action"],
        rows: rows,
        empty: "Aucun cycle configuré.",
        emptyTitle: "Cycles",
        responsive: true
      }) +
      "</section>"
    );
  }

  function renderSchoolTab() {
    var container = document.getElementById("schoolContent");
    if (!container || !settingsData) return;
    var s = settingsData;
    container.innerHTML =
      '<form id="schoolSettingsForm" class="ss-form-grid ss-form-grid--2">' +
      '<div class="ss-panel ss-field--wide"><div class="ss-panel__header"><h3 class="ss-panel__title">Identité de l\'école</h3></div><div class="ss-panel__body ss-form-grid ss-form-grid--2">' +
      formField("name", "Nom (français)", "text", s.identity.name, { required: true }) +
      formField("name_en", "Nom (anglais)", "text", s.identity.name_en) +
      formField("legal_name", "Nom légal", "text", s.identity.legal_name) +
      formField("school_type", "Type", "text", s.identity.school_type) +
      formField("approval_code", "Code d\'agrément", "text", s.identity.approval_code) +
      formField("currency", "Devise", "text", s.identity.currency || "USD") +
      formField("motto", "Motto / devise de l\'école", "text", s.identity.motto) +
      formField("bank_name", "Nom de la banque", "text", s.identity.bank_name) +
      formField("bank_account", "Compte bancaire", "text", s.identity.bank_account) +
      formField("tax_id", "Numéro d\'identification fiscale", "text", s.identity.tax_id) +
      formField("director_name", "Nom du directeur", "text", s.identity.director_name) +
      formField("official_language", "Langue officielle", "text", s.identity.official_language || "FR") +
      "</div></div>" +
      '<div class="ss-panel ss-field--wide"><div class="ss-panel__header"><h3 class="ss-panel__title">Coordonnées</h3></div><div class="ss-panel__body ss-form-grid ss-form-grid--2">' +
      formField("country", "Pays", "text", s.contact.country) +
      formField("province", "Province", "text", s.contact.province) +
      formField("city", "Ville", "text", s.contact.city) +
      formField("address", "Adresse", "textarea", s.contact.address, { rows: 2 }) +
      formField("email", "Email", "email", s.contact.email) +
      formField("phone", "Téléphone", "tel", s.contact.phone) +
      formField("website_url", "Site web", "url", s.contact.website_url) +
      "</div></div>" +
      '<div class="ss-panel ss-field--wide"><div class="ss-panel__header"><h3 class="ss-panel__title">Apparence</h3></div><div class="ss-panel__body ss-form-grid ss-form-grid--2">' +
      formField("primary_color", "Couleur principale", "color", s.brand.primary_color || "#071a3d") +
      formField("accent_color", "Couleur d\'accent", "color", s.brand.accent_color || "#e9a515") +
      formField("document_footer", "Pied de page", "text", s.brand.document_footer) +
      '<div class="ss-field ss-field--wide"><label class="ss-label">Logo</label><label class="logo-upload" for="school-field-logo_file"><span><i data-lucide="image-up"></i><b>' + (s.brand.logo_path ? "Logo officiel chargé" : "Sélectionner le logo officiel") + '</b><span>PNG haute définition, fond transparent recommandé</span></span>' + window.ssInput({ name: "logo_file", id: "school-field-logo_file", type: "file", accept: "image/png,image/jpeg,image/webp", className: "sr-only" }) + '</label>' + formField("logo_path", "", "hidden", s.brand.logo_path) + (s.brand.logo_path ? '<img src="' + escapeMarkup(s.brand.logo_path) + '" alt="Logo" style="max-width:200px;max-height:100px;margin-top:var(--ss-space-3);">' : '') + "</div>" +
      "</div></div>" +
      renderAcademicYears() +
      renderCycles() +
      '<div class="ss-field--wide">' + window.ssButton({ label: "Enregistrer", icon: "save", type: "submit" }) + '</div>' +
      "</form>";

    document.getElementById("schoolSettingsForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var form = e.target;
      var logoPath = form.logo_path.value || null;
      try {
        if (form.logo_file.files && form.logo_file.files[0]) {
          var upload = await window.SchoolSafeSchoolAPI.uploadLogo(form.logo_file.files[0]);
          logoPath = upload && upload.logo_path ? upload.logo_path : logoPath;
        }
        var payload = {
          identity: {
            name: form.name.value,
            name_en: form.name_en.value || null,
            legal_name: form.legal_name.value || null,
            school_type: form.school_type.value || null,
            approval_code: form.approval_code.value || null,
            currency: form.currency.value || null,
            motto: form.motto.value || null,
            bank_name: form.bank_name.value || null,
            bank_account: form.bank_account.value || null,
            tax_id: form.tax_id.value || null,
            director_name: form.director_name.value || null,
            official_language: form.official_language.value || null,
          },
          contact: {
            country: form.country.value || null,
            province: form.province.value || null,
            city: form.city.value || null,
            address: form.address.value || null,
            email: form.email.value || null,
            phone: form.phone.value || null,
            website_url: form.website_url.value || null,
          },
          brand: {
            primary_color: form.primary_color.value,
            accent_color: form.accent_color.value,
            document_footer: form.document_footer.value || null,
            logo_path: logoPath,
          },
        };
        settingsData = await window.SchoolSafeSchoolAPI.updateSettings(payload);
        notify("Paramètres de l'école enregistrés.");
        renderSchoolTab();
      } catch (err) {
        notify("Erreur : " + err.message);
      }
    });

    var addYearBtn = document.getElementById("addYearBtn");
    if (addYearBtn) {
      addYearBtn.addEventListener("click", function () {
        openYearModal();
      });
    }

    container.querySelectorAll("[data-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var yearId = btn.closest("tr").getAttribute("data-year-id");
        var action = btn.getAttribute("data-action");
        if (action === "activate-year") activateYear(yearId);
        if (action === "edit-year") openYearModal(yearId);
      });
    });

    container.querySelectorAll(".toggle-cycle").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var cycleKey = btn.getAttribute("data-cycle");
        var cycle = (settingsData.cycles || []).find(function (c) {
          return c.cycle_key === cycleKey;
        });
        if (!cycle) return;
        var newState = !cycle.is_active;
        try {
          await window.SchoolSafeSchoolAPI.toggleCycle(cycleKey, newState);
          notify(newState ? "Cycle activé." : "Cycle désactivé.");
          await loadSchool();
        } catch (err) {
          notify("Erreur : " + err.message);
        }
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function openYearModal(yearId) {
    var year = null;
    if (yearId) {
      year = (settingsData.academic_years || []).find(function (y) {
        return y.id === yearId;
      });
      if (!year) return;
    }

    var isSubmitting = false;
    var modal = window.ssModal({
      title: yearId ? "Modifier l'année" : "Ajouter une année",
      content:
        '<form id="yearForm" class="ss-form-grid">' +
        formField("label", "Libellé", "text", year ? year.label : "", { required: true }) +
        formField("starts_on", "Date de début", "date", year ? year.starts_on : "", { required: true }) +
        formField("ends_on", "Date de fin", "date", year ? year.ends_on : "", { required: true }) +
        formField("periods", "Périodes", "select", year ? year.periods : "", { required: true, options: [{ value: "Trimestres", label: "Trimestres" }, { value: "Semestres", label: "Semestres" }] }) +
        '</form>',
      actions: [
        { label: "Annuler", variant: "secondary", onClick: function () { modal.close(); } },
        { label: "Enregistrer", variant: "primary", type: "submit", attrs: { form: "yearForm" } }
      ]
    });

    var form = modal.content.querySelector("#yearForm");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;
      modal.setLoading(true);
      var payload = {
        label: form.label.value,
        starts_on: form.starts_on.value,
        ends_on: form.ends_on.value,
        periods: form.periods.value
      };
      try {
        if (yearId) {
          await window.SchoolSafeSchoolAPI.updateAcademicYear(yearId, payload);
          notify("Année mise à jour.");
        } else {
          await window.SchoolSafeSchoolAPI.createAcademicYear(payload);
          notify("Année créée.");
        }
        modal.close();
        await loadSchool();
      } catch (err) {
        modal.setError(err.message);
      } finally {
        isSubmitting = false;
        modal.setLoading(false);
      }
    });
  }

  async function activateYear(yearId) {
    try {
      await window.SchoolSafeSchoolAPI.activateAcademicYear(yearId);
      notify("Année activée.");
      await loadSchool();
    } catch (err) {
      notify("Erreur : " + err.message);
    }
  }

  function renderStaffTab() {
    var container = document.getElementById("schoolContent");
    if (!container) return;

    var rows = staffData.map(function (person) {
      var roleBadges = (person.roles || [])
        .map(function (r) {
          return window.ssBadge({ label: r.label, variant: "info", size: "sm" });
        })
        .join("");
      return (
        '<tr data-profile-id="' + escapeMarkup(person.id) + '">' +
        "<td>" + escapeMarkup(person.display_name) + "</td>" +
        "<td>" + escapeMarkup(person.email) + "</td>" +
        "<td>" + escapeMarkup(person.phone || "—") + "</td>" +
        '<td class="school-roles-cell">' + roleBadges + "</td>" +
        "<td>" + (person.is_active ? window.ssBadge({ label: "Actif", variant: "success" }) : window.ssBadge({ label: "Inactif", variant: "error" })) + "</td>" +
        '<td class="school-actions">' +
        window.ssIconButton({ icon: "eye", title: "Détails", attrs: { "data-action": "view-staff" } }) +
        window.ssIconButton({ icon: "shield", title: "Modifier les rôles", attrs: { "data-action": "edit-roles" } }) +
        window.ssIconButton({ icon: "power", title: "Activer/Désactiver", attrs: { "data-action": "toggle-active" } }) +
        window.ssIconButton({ icon: "mail", title: "Renvoyer l'invitation", attrs: { "data-action": "resend-invite" } }) +
        "</td></tr>"
      );
    }).join("");

    container.innerHTML =
      '<div class="school-staff-header">' +
      '<h3>Membres de l\'équipe</h3>' +
      window.ssButton({ label: "Inviter", icon: "user-plus", attrs: { id: "inviteStaffBtn" } }) +
      "</div>" +
      window.ssTable({
        headers: ["Nom", "Email", "Téléphone", "Rôles", "Statut", "Actions"],
        rows: rows,
        empty: "Aucun membre pour l'instant.",
        emptyTitle: "Équipe",
        responsive: true
      });

    container.querySelectorAll("[data-action]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var profileId = btn.closest("tr").getAttribute("data-profile-id");
        var action = btn.getAttribute("data-action");
        if (action === "edit-roles") openRoleEditor(profileId);
        if (action === "toggle-active") toggleActive(profileId);
        if (action === "view-staff") viewStaffDetail(profileId);
        if (action === "resend-invite") resendStaffInvite(profileId);
      });
    });

    document.getElementById("inviteStaffBtn").addEventListener("click", openInviteModal);

    if (window.lucide) window.lucide.createIcons();
  }

  async function viewStaffDetail(profileId) {
    try {
      var detail = await window.SchoolSafeSchoolAPI.getStaffDetail(profileId);
      var roles = (detail.roles || []).map(function (r) {
        return escapeMarkup(r.label);
      }).join(", ");
      window.ssModal({
        title: escapeMarkup(detail.display_name),
        content:
          '<p><b>Email :</b> ' + escapeMarkup(detail.email) + "</p>" +
          '<p><b>Téléphone :</b> ' + escapeMarkup(detail.phone || "—") + "</p>" +
          '<p><b>Rôles :</b> ' + (roles || "—") + "</p>" +
          '<p><b>Statut :</b> ' + (detail.is_active ? "Actif" : "Inactif") + "</p>",
        actions: [{ label: "Fermer", variant: "secondary" }]
      });
    } catch (err) {
      notify("Erreur : " + err.message);
    }
  }

  async function resendStaffInvite(profileId) {
    try {
      await window.SchoolSafeSchoolAPI.resendInvite(profileId);
      notify("Invitation renvoyée.");
      await loadStaff();
    } catch (err) {
      notify("Erreur : " + err.message);
    }
  }

  function openInviteModal() {
    var rolesOptions = rolesData
      .map(function (r) {
        return formCheckbox("role", r.id, r.label, false);
      })
      .join("");

    var isSubmitting = false;
    var modal = window.ssModal({
      title: "Inviter un membre",
      content:
        '<form id="inviteStaffForm" class="ss-form-grid">' +
        formField("first_name", "Prénom", "text", "", { required: true }) +
        formField("last_name", "Nom", "text", "", { required: true }) +
        formField("email", "Email", "email", "", { required: true }) +
        formField("phone", "Téléphone", "tel", "") +
        '<div class="ss-field ss-field--wide"><span class="ss-label">Rôles</span><div class="ss-checkbox-group">' + rolesOptions + "</div></div>" +
        '</form>',
      actions: [
        { label: "Annuler", variant: "secondary", onClick: function () { modal.close(); } },
        { label: "Inviter", variant: "primary", type: "submit", attrs: { form: "inviteStaffForm" } }
      ]
    });

    var form = modal.content.querySelector("#inviteStaffForm");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (isSubmitting) return;
      var selectedRoles = Array.from(form.querySelectorAll('input[name="role"]:checked')).map(function (cb) {
        return cb.value;
      });
      if (selectedRoles.length === 0) {
        modal.setError("Sélectionnez au moins un rôle.");
        return;
      }
      isSubmitting = true;
      modal.setLoading(true);
      try {
        await window.SchoolSafeSchoolAPI.inviteStaff({
          email: form.email.value,
          first_name: form.first_name.value,
          last_name: form.last_name.value,
          phone: form.phone.value || undefined,
          role_ids: selectedRoles
        });
        notify("Invitation envoyée.");
        modal.close();
        await loadStaff();
      } catch (err) {
        modal.setError(err.message);
      } finally {
        isSubmitting = false;
        modal.setLoading(false);
      }
    });
  }

  function openRoleEditor(profileId) {
    var person = staffData.find(function (p) {
      return p.id === profileId;
    });
    if (!person) return;

    var rolesOptions = rolesData
      .map(function (r) {
        var checked = person.roles.some(function (pr) {
          return pr.id === r.id;
        });
        return formCheckbox("role", r.id, r.label, checked);
      })
      .join("");

    var isSubmitting = false;
    var modal = window.ssModal({
      title: "Rôles de " + escapeMarkup(person.display_name),
      content: '<form id="roleStaffForm"><div class="ss-checkbox-group">' + rolesOptions + "</div></form>",
      actions: [
        { label: "Annuler", variant: "secondary", onClick: function () { modal.close(); } },
        { label: "Enregistrer", variant: "primary", type: "submit", attrs: { form: "roleStaffForm" } }
      ]
    });

    var form = modal.content.querySelector("#roleStaffForm");
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (isSubmitting) return;
      var selectedRoles = Array.from(form.querySelectorAll('input[name="role"]:checked')).map(function (cb) {
        return cb.value;
      });
      isSubmitting = true;
      modal.setLoading(true);
      try {
        await window.SchoolSafeSchoolAPI.updateStaffRoles(profileId, selectedRoles);
        notify("Rôles mis à jour.");
        modal.close();
        await loadStaff();
      } catch (err) {
        modal.setError(err.message);
      } finally {
        isSubmitting = false;
        modal.setLoading(false);
      }
    });
  }

  async function toggleActive(profileId) {
    var person = staffData.find(function (p) {
      return p.id === profileId;
    });
    if (!person) return;
    var newState = !person.is_active;
    try {
      await window.SchoolSafeSchoolAPI.toggleStaffActive(profileId, newState);
      notify(newState ? "Utilisateur activé." : "Utilisateur désactivé.");
      await loadStaff();
    } catch (err) {
      notify("Erreur : " + err.message);
    }
  }

  function bindTabs() {
    if (tabsBound) return;
    var container = document.getElementById("schoolTabs");
    if (!container) return;
    tabsBound = true;
    container.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-school-tab]");
      if (!btn) return;
      var nextTab = btn.getAttribute("data-school-tab");
      if (!canUseTab(nextTab)) return;
      currentTab = nextTab;
      renderTabs();
      if (currentTab === "school") loadSchool();
      if (currentTab === "staff") loadStaff();
      if (currentTab === "students") loadStudents();
      if (currentTab === "structure" && window.SchoolSafeAcademicStructure) window.SchoolSafeAcademicStructure.render(document.getElementById("schoolContent"), currentUser);
    });
  }

  function render(tabName, user) {
    currentUser = user || currentUser || { permissions: [] };
    if ((tabName === "school" || tabName === "staff" || tabName === "students" || tabName === "structure") && canUseTab(tabName)) {
      currentTab = tabName;
    }
    if (!canUseTab(currentTab)) {
      currentTab = ["school", "staff", "students", "structure"].find(canUseTab) || "";
    }
    renderTabs();
    if (!currentTab) {
      var deniedContainer = document.getElementById("schoolContent");
      if (deniedContainer) deniedContainer.innerHTML = window.ssState({ type: "error", title: "Accès refusé", message: "Aucune permission et portée ne permettent d’afficher ce module." });
      return;
    }
    if (currentTab === "school") loadSchool();
    if (currentTab === "staff") loadStaff();
    if (currentTab === "students") loadStudents();
    if (currentTab === "structure" && window.SchoolSafeAcademicStructure) window.SchoolSafeAcademicStructure.render(document.getElementById("schoolContent"), currentUser);
  }

  window.SchoolSafeSchoolModule = {
    render: function (tabName, user) {
      bindTabs();
      render(tabName, user);
    },
  };
})();
