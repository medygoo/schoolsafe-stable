(function (root) {
  "use strict";

  var FAMILY_STORAGE_KEY = "schoolsafe-b2-family-demo-v1";
  var PICKUP_STORAGE_KEY = "schoolsafe-b4-pickup-events-v1";
  var controlContainerId = null;
  var controlUser = null;
  var controlStudent = null;
  var controlState = { scanned: false, selectedId: null, record: null };

  var demoActiveStudent = {
    id: "demo-active-student",
    matricule: "B1-0001",
    first_name: "Lucas",
    last_name: "Martin",
    lifecycle_status: "active",
    class_id: "demo-class-1",
    enrollment: { status: "active", planned_class_id: "demo-class-1", planned_class_name: "6e A" },
    primary_parent: {
      id: "demo-parent-2",
      display_name: "Sophie Martin",
      guardian_type: "mere",
      phone: "+243 810 000 222",
      email: "sophie.martin@example.test",
      account_status: "active"
    }
  };

  function isStudentActive(student) {
    return !!student && student.lifecycle_status === "active";
  }

  function escapeMarkup(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function readJson(key, fallback) {
    try { return JSON.parse(root.localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (error) { return fallback; }
  }

  function familyStateFor(student) {
    var store = readJson(FAMILY_STORAGE_KEY, {});
    var saved = store[student.id];
    if (saved && Array.isArray(saved.guardians) && saved.guardians.length === 3) return saved;
    return {
      guardians: [
        { relation: "tante", lastName: "Kalonji", middleName: "Wa", firstName: "Mireille", phone: "+243 820 100 201", idType: "Carte d’électeur", idNumber: "EL-0091842", status: "authorized", photo: { src: "" } },
        { relation: "oncle", lastName: "Mbuyi", middleName: "Kabeya", firstName: "Patrick", phone: "+243 820 100 202", idType: "Passeport", idNumber: "OP-441082", status: "suspended", photo: { src: "" } },
        { relation: "grand-parent", lastName: "Mbuyi", middleName: "Tshibangu", firstName: "Jeanne", phone: "+243 820 100 203", idType: "Carte d’électeur", idNumber: "EL-0076139", status: "authorized", photo: { src: "" } }
      ],
      emergency: { relation: "Voisine de confiance", lastName: "Lukusa", middleName: "Ngoie", firstName: "Cécile", phonePrimary: "+243 820 100 204", idType: "Carte d’électeur", idNumber: "EL-0064820", photo: { src: "" } },
      parentSnapshot: {
        name: student.primary_parent && student.primary_parent.display_name || "Parent principal",
        relation: student.primary_parent && student.primary_parent.guardian_type || "tuteur",
        phone: student.primary_parent && student.primary_parent.phone || "Téléphone non renseigné",
        idType: "Carte d’électeur",
        idNumber: "EL-0052701",
        photo: { src: "" }
      }
    };
  }

  function permissionAllowed(user, permission) {
    var access = root.SchoolSafeAccess;
    if (access && typeof access.canAccess === "function") return access.canAccess(user, permission);
    return !!(user && Array.isArray(user.permissions) && user.permissions.indexOf(permission) >= 0);
  }

  function scopeType(scope) {
    return scope && (scope.type || scope.scope || scope.scope_type);
  }

  function scopePermission(scope) {
    return scope && (scope.permission || scope.permission_code || scope.code);
  }

  function hasScope(user, permission, expected) {
    if (!user || !Array.isArray(user.scopes)) return false;
    return user.scopes.some(function (scope) {
      var boundPermission = scopePermission(scope);
      return scopeType(scope) === expected && (!boundPermission || boundPermission === permission);
    });
  }

  function canControlPickup(user) {
    var assignedPortalIds = Array.isArray(user && user.assignedPortalIds) ? user.assignedPortalIds : [];
    var access = root.SchoolSafeAccess;
    var scoped = access && typeof access.allowsScope === "function"
      ? access.allowsScope(user || {}, "security.pickup.manage", "assigned_portal")
      : permissionAllowed(user, "security.pickup.manage") && hasScope(user, "security.pickup.manage", "assigned_portal");
    return !!scoped && assignedPortalIds.length > 0;
  }

  function profileId(user) {
    return user && ((user.profile && user.profile.id) || user.profile_id || user.id);
  }

  function isOwnChild(user, student) {
    if (!user || !student) return false;
    if (Array.isArray(user.childIds) && user.childIds.indexOf(student.id) >= 0) return true;
    var parentId = student.primary_parent && student.primary_parent.id;
    return !!parentId && parentId === profileId(user);
  }

  function scopeAllowsStudent(user, permission, student) {
    if (hasScope(user, permission, "school")) return true;
    return hasScope(user, permission, "own_children") && isOwnChild(user, student);
  }

  function canReadGuardians(user, student) {
    if (permissionAllowed(user, "school.guardian.read") && scopeAllowsStudent(user, "school.guardian.read", student)) return true;
    return permissionAllowed(user, "school.guardian.manage") && scopeAllowsStudent(user, "school.guardian.manage", student);
  }

  function canManageGuardians(user, student) {
    return permissionAllowed(user, "school.guardian.manage") &&
      hasScope(user, "school.guardian.manage", "own_children") &&
      isOwnChild(user, student);
  }

  function relationLabel(value) {
    return {
      mere: "Mère", pere: "Père", tante: "Tante", oncle: "Oncle", "grand-parent": "Grand-parent",
      sibling: "Frère ou sœur majeur(e)", other: "Autre", tuteur: "Tuteur"
    }[value] || value || "Relation non renseignée";
  }

  function fullName(person) {
    return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ") || person.name || "Identité non renseignée";
  }

  function initials(name) {
    return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) { return part.charAt(0).toUpperCase(); }).join("");
  }

  function statusLabel(status) {
    if (status === "authorized") return "AUTORISÉ";
    if (status === "suspended") return "SUSPENDU";
    return "À VÉRIFIER";
  }

  function statusBadge(status) {
    return root.ssBadge({
      label: statusLabel(status),
      variant: status === "authorized" ? "success" : status === "suspended" ? "error" : "warning",
      icon: status === "authorized" ? "badge-check" : status === "suspended" ? "ban" : "scan-search"
    });
  }

  function photoFrame(person, large) {
    var name = fullName(person);
    var photo = person.photo || {};
    return '<div class="pickup-photo' + (large ? " pickup-photo--large" : "") + '">' +
      (photo.src
        ? '<img src="' + escapeMarkup(photo.src) + '" alt="Photo cadrée haut du corps de ' + escapeMarkup(name) + '">'
        : '<div class="pickup-photo__placeholder" role="img" aria-label="Emplacement photo cadrée haut du corps de ' + escapeMarkup(name) + '"><span>' + escapeMarkup(initials(name)) + '</span><small>Haut du corps</small></div>') +
      '</div>';
  }

  function peopleFor(student, state) {
    var parent = state.parentSnapshot || {};
    var studentParent = student.primary_parent || {};
    var people = [{
      id: "primary-parent",
      kind: "primary",
      name: parent.name || studentParent.display_name || "Parent principal",
      relation: parent.relation || studentParent.guardian_type || "tuteur",
      phone: parent.phone || studentParent.phone || "Téléphone non renseigné",
      idType: parent.idType || "Carte d’électeur",
      idNumber: parent.idNumber || "EL-0052701",
      status: "authorized",
      photo: parent.photo || { src: "" }
    }];
    state.guardians.forEach(function (guardian, index) {
      people.push(Object.assign({ id: "guardian-" + (index + 1), kind: "secondary", index: index }, guardian));
    });
    var emergency = state.emergency || {};
    people.push(Object.assign({ id: "emergency", kind: "emergency", status: "pending", phone: emergency.phonePrimary }, emergency));
    return people;
  }

  function personCard(person, student, user) {
    var attribute = person.kind === "primary" ? " data-pickup-primary-parent" : person.kind === "emergency" ? " data-pickup-emergency-contact" : ' data-pickup-secondary-guardian="' + (person.index + 1) + '"';
    var canManage = person.kind === "secondary" && canManageGuardians(user, student);
    var action = canManage
      ? root.ssButton({ label: person.status === "suspended" ? "Rétablir" : "Suspendre", variant: person.status === "suspended" ? "primary" : "secondary", size: "sm", icon: person.status === "suspended" ? "rotate-ccw" : "ban", attrs: { "data-toggle-pickup-guardian": person.index } })
      : "";
    return '<article class="pickup-person"' + attribute + '>' + photoFrame(person, false) +
      '<div class="pickup-person__content"><div class="pickup-person__heading"><div><h3>' + escapeMarkup(fullName(person)) + '</h3><p>' + escapeMarkup(relationLabel(person.relation)) + '</p></div>' + statusBadge(person.status) + '</div>' +
      '<dl><div><dt>Téléphone</dt><dd>' + escapeMarkup(person.phone || "Non renseigné") + '</dd></div><div><dt>Pièce d’identité</dt><dd>' + escapeMarkup(person.idType || "Non renseignée") + ' · ' + escapeMarkup(person.idNumber || "Non renseigné") + '</dd></div></dl>' +
      (person.kind === "primary" ? '<small>Parent principal · compte SchoolSafe rattaché</small>' : person.kind === "emergency" ? '<small>Contact distinct · vérification d’identité requise</small>' : '<small>Tuteur secondaire ' + (person.index + 1) + '</small>') + '</div>' +
      (action ? '<div class="pickup-person__action">' + action + '<small>Effet local · BACKEND_LATER</small></div>' : '') + '</article>';
  }

  function renderDossierSection(context) {
    var student = context.student;
    var state = context.state;
    var user = context.user || { permissions: [] };
    var readable = canReadGuardians(user, student);
    var manageable = canManageGuardians(user, student);
    var scopeMessage = manageable
      ? "Gestion locale autorisée pour cet enfant · portée own_children"
      : user.role === "parent" ? "Consultation uniquement · enfant hors portée" : "Consultation uniquement selon la portée accordée";
    var body = readable
      ? '<div class="pickup-people">' + peopleFor(student, state).map(function (person) { return personCard(person, student, user); }).join("") + '</div>'
      : '<div class="pickup-access-denied"><i data-lucide="lock-keyhole"></i><p><b>Accès non accordé.</b> La permission frontend school.guardian.read est requise.</p></div>';
    return '<section id="student-dossier-pickup" class="family-section pickup-dossier-section" data-authorized-pickup-section>' +
      '<header><i data-lucide="contact-round"></i><h2>Personnes autorisées à récupérer l’enfant</h2></header>' +
      '<div class="pickup-section-intro"><p>Le Parent principal, trois tuteurs secondaires et le contact d’urgence sont séparés pour un contrôle immédiat.</p>' + root.ssBadge({ label: "BACKEND_LATER", variant: "warning" }) + '</div>' +
      (student.lifecycle_status === "draft" ? '<p class="pickup-preparation-note" role="note"><i data-lucide="shield-alert"></i><span>Configuration préalable — aucune récupération autorisée avant activation.</span></p>' : '') +
      body + '<p class="pickup-scope-note"><i data-lucide="shield-check"></i>' + escapeMarkup(scopeMessage) + '</p></section>';
  }

  function bindDossier(context) {
    var section = context.rootElement.querySelector("[data-authorized-pickup-section]");
    if (!section) return;
    section.querySelectorAll("[data-toggle-pickup-guardian]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!canManageGuardians(context.user, context.student)) return;
        var index = Number(button.getAttribute("data-toggle-pickup-guardian"));
        var guardian = context.state.guardians[index];
        guardian.status = guardian.status === "suspended" ? "authorized" : "suspended";
        context.onChange((guardian.status === "suspended" ? "Tuteur secondaire suspendu" : "Tuteur secondaire rétabli") + " dans la démo B4-FE");
      });
    });
  }

  function decisionFor(person) {
    if (!person || person.id === "unknown") return { code: "unknown", label: "PERSONNE INCONNUE", allowed: false };
    if (person.status === "suspended") return { code: "suspended", label: "PERSONNE SUSPENDUE", allowed: false };
    if (person.status !== "authorized") return { code: "verification", label: "VÉRIFICATION NÉCESSAIRE", allowed: false };
    return { code: "authorized", label: "PERSONNE AUTORISÉE", allowed: true };
  }

  function emergencyProcedure() {
    return '<section class="pickup-emergency" data-emergency-procedure><h3>Procédure d’urgence simulée</h3><p>Ne remettez pas l’enfant. Contactez dans cet ordre :</p><ol>' +
      '<li><span>1</span><b>Parent principal</b><button type="button">Appeler · BACKEND_LATER</button></li>' +
      '<li><span>2</span><b>Contact d’urgence</b><button type="button">Appeler · BACKEND_LATER</button></li>' +
      '<li><span>3</span><b>Direction</b><button type="button">Alerter · BACKEND_LATER</button></li>' +
      '</ol></section>';
  }

  function selectedPerson(people) {
    if (controlState.selectedId === "unknown") return { id: "unknown", kind: "unknown", name: "Personne non enregistrée", relation: "Aucun lien connu", phone: "—", idType: "Non vérifiée", idNumber: "—", status: "unknown", photo: { src: "" } };
    return people.find(function (person) { return person.id === controlState.selectedId; });
  }

  function personChoice(person) {
    return '<button type="button" class="pickup-choice" data-pickup-person="' + escapeMarkup(person.id) + '" aria-pressed="' + (controlState.selectedId === person.id ? "true" : "false") + '">' +
      photoFrame(person, false) + '<span><b>' + escapeMarkup(fullName(person)) + '</b><small>' + escapeMarkup(relationLabel(person.relation)) + '</small></span>' + statusBadge(person.status) + '</button>';
  }

  function recordMarkup(record) {
    if (!record) return "";
    return '<section class="pickup-record" data-pickup-local-record><header><i data-lucide="check-check"></i><div><h3>Remise validée dans la démonstration</h3><p>Enregistrement local uniquement</p></div></header><dl>' +
      '<div><dt>Élève</dt><dd>' + escapeMarkup(record.student) + '</dd></div><div><dt>Personne</dt><dd>' + escapeMarkup(record.picker) + '</dd></div>' +
      '<div><dt>Relation</dt><dd>' + escapeMarkup(record.relation) + '</dd></div><div><dt>Date et heure</dt><dd>' + escapeMarkup(record.date + " · " + record.time) + '</dd></div>' +
      '<div><dt>Utilisateur simulé</dt><dd>' + escapeMarkup(record.guardianUser) + '</dd></div><div><dt>Résultat</dt><dd>' + escapeMarkup(record.result) + '</dd></div></dl></section>';
  }

  function notificationMarkup(record, parentName) {
    if (!record) return "";
    return '<aside class="pickup-notification" data-pickup-notification-preview><span>Prévisualisation · notification BACKEND_LATER</span><h3>' + escapeMarkup(parentName) + '</h3><p>' + escapeMarkup(record.student) + ' a été remis(e) à ' + escapeMarkup(record.picker) + ' à ' + escapeMarkup(record.time) + '.</p></aside>';
  }

  function renderControlMarkup() {
    var student = controlStudent || demoActiveStudent;
    if (!canControlPickup(controlUser)) {
      return '<div class="pickup-control" data-pickup-control><header class="pickup-control__header"><div><h2>Contrôle Gardien</h2><p>Consultation limitée par la permission et la portée accordées.</p></div>' + root.ssBadge({ label: "ACCÈS LIMITÉ", variant: "warning", icon: "lock-keyhole" }) + '</header>' +
        '<div class="pickup-access-denied"><i data-lucide="lock-keyhole"></i><p><b>Accès non accordé.</b> security.pickup.manage avec portée assigned_portal et un portail affecté est requis. Un DENY explicite reste prioritaire.</p></div></div>';
    }
    if (!isStudentActive(student)) {
      return '<div class="pickup-control" data-pickup-control data-pickup-student-blocked="true">' +
        '<header class="pickup-control__header"><div><h2>Contrôle Gardien</h2><p>La récupération est réservée aux dossiers élèves officiellement actifs.</p></div>' + root.ssBadge({ label: "DOSSIER NON ACTIF", variant: "error", icon: "shield-x" }) + '</header>' +
        '<section class="pickup-inactive-state" role="status"><i data-lucide="shield-x"></i><div><h3>DOSSIER NON ACTIF</h3><p>Le contrôle de récupération est indisponible tant que le dossier élève n’est pas officiellement activé.</p></div></section></div>';
    }
    var familyState = familyStateFor(student);
    var people = peopleFor(student, familyState);
    var selected = selectedPerson(people);
    var decision = decisionFor(selected);
    var canControl = canControlPickup(controlUser);
    var result = selected ? '<section class="pickup-decision pickup-decision--' + decision.code + '" data-pickup-decision>' +
      '<div class="pickup-decision__visual">' + photoFrame(selected, true) + '</div><div class="pickup-decision__content"><span>' + escapeMarkup(decision.label) + '</span><h3>' + escapeMarkup(fullName(selected)) + '</h3><p>' + escapeMarkup(relationLabel(selected.relation)) + ' · ' + escapeMarkup(selected.phone || "Téléphone non renseigné") + '</p><p>' + escapeMarkup(selected.idType || "Pièce non renseignée") + ' · ' + escapeMarkup(selected.idNumber || "—") + '</p>' +
      (decision.allowed && canControl ? root.ssButton({ label: "Valider la remise locale", icon: "check-check", attrs: { "data-validate-pickup": "true" } }) : '<small>Aucune validation disponible pour ce résultat.</small>') + '</div></section>' +
      (!decision.allowed ? emergencyProcedure() : "") : "";
    return '<div class="pickup-control" data-pickup-control>' +
      '<header class="pickup-control__header"><div><h2>Contrôle Gardien</h2><p>Identifiez rapidement la personne présente avant toute remise de l’enfant.</p></div>' + root.ssBadge({ label: "DÉMO LOCALE", variant: "info", icon: "flask-conical" }) + '</header>' +
      '<aside class="pickup-boundary"><i data-lucide="shield-alert"></i><p><b>Aucune sortie réelle.</b> QR, identité, audit, appels, notification et synchronisation SchoolSafe Control restent <b>BACKEND_LATER</b>.</p></aside>' +
      (!controlState.scanned
        ? '<section class="pickup-scan-sim"><i data-lucide="scan-line"></i><div><h3>Carte élève</h3><p>La lecture est simulée pour B4-FE.</p></div>' + root.ssButton({ label: "Simuler la lecture de la carte", icon: "scan-line", attrs: { "data-simulate-student-card": "true" } }) + '</section>'
        : '<section class="pickup-student"><span>' + escapeMarkup(initials(student.first_name + " " + student.last_name)) + '</span><div><h3>' + escapeMarkup(student.first_name + " " + student.last_name) + '</h3><p>Matricule ' + escapeMarkup(student.matricule) + ' · ' + escapeMarkup(student.enrollment.planned_class_name) + '</p></div>' + root.ssBadge({ label: "CARTE SIMULÉE", variant: "info" }) + '</section>' +
          '<section class="pickup-selector"><header><h3>Qui est présent ?</h3><p>Sélectionnez une personne pour afficher son identité en grand.</p></header><div class="pickup-choices">' + people.map(personChoice).join("") + personChoice({ id: "unknown", name: "Personne non enregistrée", relation: "Inconnue", status: "unknown", photo: { src: "" } }) + '</div></section>' + result) +
      recordMarkup(controlState.record) + notificationMarkup(controlState.record, familyState.parentSnapshot && familyState.parentSnapshot.name || student.primary_parent.display_name) + '</div>';
  }

  function saveRecord(record, student) {
    if (!isStudentActive(student)) return false;
    var records = readJson(PICKUP_STORAGE_KEY, []);
    records.unshift(record);
    try { root.localStorage.setItem(PICKUP_STORAGE_KEY, JSON.stringify(records.slice(0, 20))); }
    catch (error) {}
    return true;
  }

  function readPickupRecords() {
    var records = readJson(PICKUP_STORAGE_KEY, []);
    return Array.isArray(records) ? records : [];
  }

  function renderControl(containerId, user, student) {
    controlContainerId = containerId;
    controlUser = user || { permissions: [] };
    var nextStudent = student || demoActiveStudent;
    if (!controlStudent || controlStudent.id !== nextStudent.id) controlState = { scanned: false, selectedId: null, record: null };
    controlStudent = nextStudent;
    var container = root.document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = renderControlMarkup();
    bindControl();
  }

  function rerenderControl() {
    renderControl(controlContainerId, controlUser, controlStudent);
  }

  function bindControl() {
    var container = root.document.getElementById(controlContainerId);
    if (!container) return;
    var scan = container.querySelector("[data-simulate-student-card]");
    if (scan) scan.addEventListener("click", function () {
      if (!isStudentActive(controlStudent)) return;
      controlState.scanned = true; controlState.selectedId = null; controlState.record = null; rerenderControl();
    });
    container.querySelectorAll("[data-pickup-person]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!isStudentActive(controlStudent)) return;
        controlState.selectedId = button.getAttribute("data-pickup-person");
        controlState.record = null;
        var state = familyStateFor(controlStudent);
        var person = selectedPerson(peopleFor(controlStudent, state));
        var decision = decisionFor(person);
        if (!decision.allowed && typeof root.CustomEvent === "function") {
          root.dispatchEvent(new root.CustomEvent("schoolsafe:pickup-decision", { detail: {
            studentId: controlStudent.id,
            allowed: false,
            label: decision.label
          } }));
        }
        rerenderControl();
      });
    });
    var validate = container.querySelector("[data-validate-pickup]");
    if (validate) validate.addEventListener("click", function () {
      if (!isStudentActive(controlStudent)) return;
      var state = familyStateFor(controlStudent);
      var person = selectedPerson(peopleFor(controlStudent, state));
      var decision = decisionFor(person);
      if (!decision.allowed || !canControlPickup(controlUser)) return;
      var now = new Date();
      controlState.record = {
        student: controlStudent.first_name + " " + controlStudent.last_name,
        studentId: controlStudent.id,
        picker: fullName(person),
        pickerId: person.id,
        relation: relationLabel(person.relation),
        date: now.toLocaleDateString("fr-FR"),
        time: now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        guardianUser: "Agent Gardien · Portail principal",
        result: decision.label
      };
      if (!saveRecord(controlState.record, controlStudent)) {
        controlState.record = null;
        return;
      }
      if (typeof root.CustomEvent === "function") {
        root.dispatchEvent(new root.CustomEvent("schoolsafe:pickup-recorded", { detail: controlState.record }));
      }
      rerenderControl();
    });
    if (root.lucide) root.lucide.createIcons();
  }

  function resetControl() {
    controlState = { scanned: false, selectedId: null, record: null };
    controlStudent = null;
  }

  root.SchoolSafeStudentPickup = {
    bindDossier: bindDossier,
    canControlPickup: canControlPickup,
    canManageGuardians: canManageGuardians,
    readPickupRecords: readPickupRecords,
    renderControl: renderControl,
    renderDossierSection: renderDossierSection,
    resetControl: resetControl
  };
})(window);
