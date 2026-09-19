(function (root) {
  "use strict";

  /*
  THESIS: Le brouillon élève devient un dossier familial lisible d’un coup d’œil, sans imiter une validation officielle.
  OWN-WORLD: Aura Blue existant, surfaces unies, cartes administratives blanches, statuts sémantiques et accents or mesurés.
  STORY: L’administration parcourt identité, famille, urgence, preuves et complétion dans un ordre de vérification naturel.
  FIRST VIEWPORT: résumé élève, état EN COURS, avertissement BACKEND_LATER et navigation tactile vers les huit sections.
  FORM: extension locale code-led du dossier B1, spécification B2-FE officielle du 27 août 2026.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
  */

  var STORAGE_KEY = "schoolsafe-b2-family-demo-v1";
  var activeModal = null;
  var activeStudent = null;
  var activeState = null;
  var activeUser = null;

  function escapeMarkup(value) {
    if (value == null) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initials(value) {
    return String(value || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) { return part.charAt(0).toUpperCase(); })
      .join("");
  }

  function isDemoMode() {
    return root.schoolSafeDemoMode === true;
  }

  function readStore() {
    try { return JSON.parse(root.localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (error) { return {}; }
  }

  function saveStore() {
    var store = readStore();
    store[activeStudent.id] = activeState;
    try { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }
    catch (error) {}
  }

  function photoState() {
    return { src: "", zoom: 100, x: 0, y: 0 };
  }

  function createState(student) {
    var parent = student.primary_parent || {};
    return {
      studentPhoto: photoState(),
      guardians: [
        {
          relation: "tante", lastName: "Kalonji", middleName: "Wa", firstName: "Mireille",
          phone: "+243 820 100 201", email: "mireille.kalonji@example.test",
          idType: "Carte d’électeur", idNumber: "EL-0091842", status: "authorized", photo: photoState()
        },
        {
          relation: "oncle", lastName: "Mbuyi", middleName: "Kabeya", firstName: "Patrick",
          phone: "+243 820 100 202", email: "patrick.mbuyi@example.test",
          idType: "Passeport", idNumber: "OP-441082", status: "suspended", photo: photoState()
        },
        {
          relation: "grand-parent", lastName: "Mbuyi", middleName: "Tshibangu", firstName: "Jeanne",
          phone: "+243 820 100 203", email: "",
          idType: "Carte d’électeur", idNumber: "EL-0076139", status: "authorized", photo: photoState()
        }
      ],
      emergency: {
        relation: "Voisine de confiance", lastName: "Lukusa", middleName: "Ngoie", firstName: "Cécile",
        phonePrimary: "+243 820 100 204", phoneSecondary: "+243 890 300 204",
        email: "", idType: "Carte d’électeur", idNumber: "EL-0064820", callOrder: "2", photo: photoState()
      },
      parentSnapshot: {
        name: parent.display_name || "Parent principal",
        relation: parent.guardian_type || "tuteur",
        phone: parent.phone || "Téléphone non renseigné",
        email: parent.email || "E-mail non renseigné",
        accountStatus: parent.account_status || "pending_activation",
        idType: "Carte d’électeur",
        idNumber: "EL-0052701",
        photo: photoState()
      },
      history: [
        { at: "Aujourd’hui · 09:40", label: "Dossier familial ouvert en démonstration" },
        { at: "Aujourd’hui · 09:30", label: "Contact d’urgence ajouté" },
        { at: "Aujourd’hui · 09:15", label: "Trois tuteurs secondaires ajoutés" },
        { at: "Hier · 16:15", label: "Parent principal rattaché au brouillon" },
        { at: "Hier · 15:52", label: "Dossier élève créé en préparation" }
      ],
      verification: { status: "incomplete" }
    };
  }

  function stateFor(student) {
    var stored = readStore()[student.id];
    if (stored && stored.guardians && stored.guardians.length === 3) {
      stored.verification = stored.verification || { status: "incomplete" };
      stored.parentSnapshot = stored.parentSnapshot || {};
      stored.parentSnapshot.idType = stored.parentSnapshot.idType || "Carte d’électeur";
      stored.parentSnapshot.idNumber = stored.parentSnapshot.idNumber || "EL-0052701";
      stored.parentSnapshot.photo = stored.parentSnapshot.photo || photoState();
      return stored;
    }
    return createState(student);
  }

  function relationLabel(value) {
    return {
      mere: "Mère", pere: "Père", tante: "Tante", oncle: "Oncle", "grand-parent": "Grand-parent",
      sibling: "Frère ou sœur majeur(e)", other: "Autre personne autorisée", tuteur: "Tuteur"
    }[value] || value || "Relation non renseignée";
  }

  function accountBadge(status) {
    return root.ssBadge({
      label: status === "active" ? "ACTIF" : "PARENT À ACTIVER",
      variant: status === "active" ? "success" : "warning",
      icon: status === "active" ? "badge-check" : "mail-warning"
    });
  }

  function guardianBadge(status) {
    return root.ssBadge({
      label: status === "suspended" ? "SUSPENDU" : "AUTORISÉ",
      variant: status === "suspended" ? "error" : "success"
    });
  }

  function demoField(label, path, value, options) {
    options = options || {};
    var id = "family-" + path.replace(/[^a-z0-9]+/gi, "-");
    var input;
    if (options.choices) {
      input = '<select id="' + id + '" data-demo-field="' + escapeMarkup(path) + '">' + options.choices.map(function (choice) {
        return '<option value="' + escapeMarkup(choice.value) + '"' + (choice.value === value ? " selected" : "") + '>' + escapeMarkup(choice.label) + '</option>';
      }).join("") + "</select>";
    } else {
      input = '<input id="' + id + '" data-demo-field="' + escapeMarkup(path) + '" type="' + (options.type || "text") + '" value="' + escapeMarkup(value || "") + '"' + (options.optional ? "" : " required") + ">";
    }
    return '<label class="family-field" for="' + id + '"><span>' + escapeMarkup(label) + (options.optional ? " · facultatif" : "") + "</span>" + input + "</label>";
  }

  function relationChoices() {
    return [
      { value: "mere", label: "Mère" }, { value: "pere", label: "Père" },
      { value: "tante", label: "Tante" }, { value: "oncle", label: "Oncle" },
      { value: "grand-parent", label: "Grand-parent" },
      { value: "sibling", label: "Frère ou sœur majeur(e)" },
      { value: "other", label: "Autre personne autorisée" }
    ];
  }

  function photoTransform(photo) {
    return "translate(" + Number(photo.x || 0) + "%, " + Number(photo.y || 0) + "%) scale(" + (Number(photo.zoom || 100) / 100) + ")";
  }

  function photoEditor(owner, title, photo) {
    var hasPhoto = !!photo.src;
    return '<div class="family-photo-editor" data-photo-owner="' + escapeMarkup(owner) + '">' +
      '<div class="family-photo-stage">' + (hasPhoto
        ? '<img data-photo-preview src="' + escapeMarkup(photo.src) + '" alt="Aperçu de ' + escapeMarkup(title) + '" style="transform:' + escapeMarkup(photoTransform(photo)) + '">'
        : '<div class="family-photo-empty"><i data-lucide="image-off"></i><b>Photo manquante</b><span>Cadrage haut du corps attendu</span></div>') + '</div>' +
      '<div class="family-photo-actions"><label class="family-file-action"><i data-lucide="camera"></i>' + (hasPhoto ? "Remplacer" : "Ajouter une photo") +
        '<input type="file" accept="image/*" data-photo-input="' + escapeMarkup(owner) + '"></label>' +
        (hasPhoto ? root.ssButton({ label: "Supprimer la photo", variant: "ghost", size: "sm", icon: "trash-2", attrs: { "data-photo-remove": owner } }) : "") + '</div>' +
      (hasPhoto ? '<div class="family-photo-controls">' +
        '<label>Zoom photo<input aria-label="Zoom photo" type="range" min="100" max="180" value="' + Number(photo.zoom || 100) + '" data-photo-control="zoom" data-photo-target="' + escapeMarkup(owner) + '"></label>' +
        '<label>Position horizontale<input aria-label="Position horizontale" type="range" min="-30" max="30" value="' + Number(photo.x || 0) + '" data-photo-control="x" data-photo-target="' + escapeMarkup(owner) + '"></label>' +
        '<label>Position verticale<input aria-label="Position verticale" type="range" min="-30" max="30" value="' + Number(photo.y || 0) + '" data-photo-control="y" data-photo-target="' + escapeMarkup(owner) + '"></label>' +
        '<p data-photo-position>Déplacement : ' + Number(photo.x || 0) + ' / ' + Number(photo.y || 0) + '</p></div>' : "") +
      '<small>Prévisualisation locale · BACKEND_LATER</small></div>';
  }

  function parentCard() {
    var parent = activeState.parentSnapshot;
    return '<article class="family-person family-person--primary" data-primary-parent>' +
      '<span class="family-avatar" aria-hidden="true">' + escapeMarkup(initials(parent.name)) + '</span>' +
      '<div class="family-person__body"><div class="family-person__title"><div><h3>' + escapeMarkup(parent.name) + '</h3><p>' + escapeMarkup(relationLabel(parent.relation)) + '</p></div>' + accountBadge(parent.accountStatus) + '</div>' +
      '<dl><div><dt>Téléphone</dt><dd>' + escapeMarkup(parent.phone) + '</dd></div><div><dt>E-mail</dt><dd>' + escapeMarkup(parent.email) + '</dd></div></dl>' +
      '<p class="family-account-note"><i data-lucide="key-round"></i>Le Parent principal possède le compte SchoolSafe.</p></div></article>';
  }

  function guardianCard(guardian, index) {
    var prefix = "guardians." + index + ".";
    return '<article class="family-guardian" data-secondary-guardian="' + (index + 1) + '">' +
      '<header><div><h3>Tuteur secondaire ' + (index + 1) + '</h3><p>Aucun compte SchoolSafe dans ce lot.</p></div>' + guardianBadge(guardian.status) + '</header>' +
      '<div class="family-guardian__layout">' + photoEditor("guardian-" + (index + 1), "Tuteur secondaire " + (index + 1), guardian.photo) +
      '<div class="family-form-grid">' +
        demoField("Relation", prefix + "relation", guardian.relation, { choices: relationChoices() }) +
        demoField("Nom", prefix + "lastName", guardian.lastName) + demoField("Postnom", prefix + "middleName", guardian.middleName) +
        demoField("Prénom", prefix + "firstName", guardian.firstName) + demoField("Téléphone", prefix + "phone", guardian.phone, { type: "tel" }) +
        demoField("E-mail", prefix + "email", guardian.email, { type: "email", optional: true }) +
        demoField("Type de pièce", prefix + "idType", guardian.idType) + demoField("Numéro de pièce", prefix + "idNumber", guardian.idNumber) +
        demoField("Statut", prefix + "status", guardian.status, { choices: [{ value: "authorized", label: "AUTORISÉ" }, { value: "suspended", label: "SUSPENDU" }] }) +
      '</div></div></article>';
  }

  function emergencyCard() {
    var item = activeState.emergency;
    var prefix = "emergency.";
    return '<div class="family-emergency" data-emergency-contact>' +
      '<div class="family-emergency__heading"><div><h3>CONTACT D’URGENCE</h3><p>Bloc distinct des trois tuteurs secondaires.</p></div>' + root.ssBadge({ label: "PRIORITÉ D’APPEL", variant: "info", icon: "phone-call" }) + '</div>' +
      '<div class="family-guardian__layout">' + photoEditor("emergency", "Contact d’urgence", item.photo) +
      '<div class="family-form-grid">' +
        demoField("Relation", prefix + "relation", item.relation) + demoField("Nom", prefix + "lastName", item.lastName) +
        demoField("Postnom", prefix + "middleName", item.middleName) + demoField("Prénom", prefix + "firstName", item.firstName) +
        demoField("Téléphone principal", prefix + "phonePrimary", item.phonePrimary, { type: "tel" }) +
        demoField("Téléphone secondaire", prefix + "phoneSecondary", item.phoneSecondary, { type: "tel", optional: true }) +
        demoField("E-mail", prefix + "email", item.email, { type: "email", optional: true }) +
        demoField("Type de pièce", prefix + "idType", item.idType) + demoField("Numéro de pièce", prefix + "idNumber", item.idNumber) +
        demoField("Ordre d’appel", prefix + "callOrder", item.callOrder, { choices: [{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }] }) +
      '</div></div>' +
      '<ol class="family-call-order" data-call-order><li><b>1</b> <span>Parent principal</span></li><li><b>2</b> <span>Contact d’urgence</span></li><li><b>3</b> <span>Direction</span></li></ol></div>';
  }

  function checklist() {
    var student = activeStudent;
    var enrollment = student.enrollment || {};
    var items = [
      ["Identité de l’élève complète", !!(student.first_name && student.last_name && student.matricule)],
      ["Parent principal enregistré", !!activeState.parentSnapshot.name],
      ["Compte Parent actif ou invitation en attente", ["active", "pending_activation"].indexOf(activeState.parentSnapshot.accountStatus) >= 0],
      ["Trois tuteurs secondaires enregistrés", activeState.guardians.every(function (item) { return !!(item.firstName && item.lastName && item.phone); })],
      ["Contact d’urgence enregistré", !!(activeState.emergency.firstName && activeState.emergency.lastName && activeState.emergency.phonePrimary)],
      ["Photos présentes", !!activeState.studentPhoto.src && activeState.guardians.every(function (item) { return !!item.photo.src; }) && !!activeState.emergency.photo.src],
      ["Pièces d’identité renseignées", activeState.guardians.every(function (item) { return !!(item.idType && item.idNumber); }) && !!(activeState.emergency.idType && activeState.emergency.idNumber)],
      ["Année et classe prévues", !!(enrollment.academic_year_label && enrollment.planned_class_name)]
    ];
    var completed = items.filter(function (item) { return item[1]; }).length;
    var status = completed === items.length ? "ready" : completed === 0 ? "incomplete" : "progress";
    return '<div class="family-completion">' +
      '<div class="family-completion__summary"><div><strong>' + completed + ' / ' + items.length + '</strong><span>éléments prêts</span></div><div class="family-completion__scale" aria-label="États possibles de complétion">' +
        '<span class="' + (status === "incomplete" ? "active" : "") + '">INCOMPLET</span><span class="' + (status === "progress" ? "active" : "") + '">EN COURS</span><span class="' + (status === "ready" ? "active" : "") + '">PRÊT POUR VÉRIFICATION</span></div></div>' +
      '<ul>' + items.map(function (item) { return '<li data-completion-item class="' + (item[1] ? "complete" : "missing") + '"><i data-lucide="' + (item[1] ? "check" : "circle-dashed") + '"></i><span>' + escapeMarkup(item[0]) + '</span><b>' + (item[1] ? "Prêt" : "À compléter") + '</b></li>'; }).join("") + '</ul>' +
      '<p>Aucune activation n’est disponible dans cette interface.</p></div>';
  }

  function identityMatrix() {
    var rows = [
      ["Élève", activeState.studentPhoto.src, "Sans pièce B2-FE"],
      ["Tuteur secondaire 1", activeState.guardians[0].photo.src, activeState.guardians[0].idNumber],
      ["Tuteur secondaire 2", activeState.guardians[1].photo.src, activeState.guardians[1].idNumber],
      ["Tuteur secondaire 3", activeState.guardians[2].photo.src, activeState.guardians[2].idNumber],
      ["Contact d’urgence", activeState.emergency.photo.src, activeState.emergency.idNumber]
    ];
    return '<div class="family-proof-list">' + rows.map(function (row) {
      return '<div><b>' + escapeMarkup(row[0]) + '</b><span class="' + (row[1] ? "ready" : "missing") + '">' + (row[1] ? "Photo présente" : "Photo manquante") + '</span><span>' + escapeMarkup(row[2]) + '</span></div>';
    }).join("") + '</div>';
  }

  function history() {
    return '<ol class="family-history">' + activeState.history.map(function (entry) {
      return '<li><span></span><div><time>' + escapeMarkup(entry.at) + '</time><p>' + escapeMarkup(entry.label) + '</p></div></li>';
    }).join("") + '</ol>';
  }

  function section(id, icon, title, content, className) {
    return '<section id="student-dossier-' + id + '" class="family-section ' + (className || "") + '"><header><i data-lucide="' + icon + '"></i><h2>' + escapeMarkup(title) + '</h2></header>' + content + '</section>';
  }

  function renderDossier() {
    var student = activeStudent;
    var enrollment = student.enrollment || {};
    var parent = activeState.parentSnapshot;
    return '<div class="student-family-dossier">' +
      '<div class="family-dossier-hero"><div class="family-dossier-identity"><span class="family-avatar family-avatar--student">' + escapeMarkup(initials(student.first_name + " " + student.last_name)) + '</span><div><div class="family-dossier-badges">' + root.ssBadge({ label: "EN PRÉPARATION", variant: "warning" }) + root.ssBadge({ label: "DÉMO FRONTEND", variant: "info", icon: "flask-conical" }) + '</div><h2>' + escapeMarkup([student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ")) + '</h2><p>Matricule ' + escapeMarkup(student.matricule) + ' · ' + escapeMarkup(enrollment.planned_class_name || "Classe à confirmer") + '</p></div></div>' +
      '<div class="family-backend-note"><i data-lucide="database-zap"></i><div><b>BACKEND_LATER</b><span>Sauvegarde, photos, pièces, suspension, vérification et activation restent locales ou indisponibles.</span></div></div></div>' +
      '<nav class="family-dossier-nav" aria-label="Sections du dossier familial">' +
        [["identity", "Identité"], ["schooling", "Scolarité prévue"], ["lifecycle", "Parcours scolaire"], ["parent", "Parent principal"], ["guardians", "Tuteurs secondaires"], ["pickup", "Personnes autorisées"], ["emergency", "Contact d’urgence"], ["proofs", "Photos et identités"], ["checklist", "Checklist"], ["verification", "Vérification et activation"], ["history", "Historique"]].map(function (item) {
          return '<button type="button" data-dossier-section="' + item[0] + '">' + item[1] + '</button>';
        }).join("") + '</nav>' +
      '<div class="family-dossier-content">' +
        section("identity", "contact", "Identité", '<div class="family-identity-layout">' + photoEditor("student", "l’élève", activeState.studentPhoto) + '<dl class="family-facts"><div><dt>Nom complet</dt><dd>' + escapeMarkup([student.first_name, student.middle_name, student.last_name].filter(Boolean).join(" ")) + '</dd></div><div><dt>Date de naissance</dt><dd>' + escapeMarkup(student.date_of_birth || "Non renseignée") + '</dd></div><div><dt>Genre</dt><dd>' + escapeMarkup(student.gender || "Non renseigné") + '</dd></div><div><dt>Statut</dt><dd>EN PRÉPARATION</dd></div></dl></div>') +
        section("schooling", "school", "Scolarité prévue", '<dl class="family-facts family-facts--school"><div><dt>Année scolaire</dt><dd>' + escapeMarkup(enrollment.academic_year_label || "Non renseignée") + '</dd></div><div><dt>Classe prévue</dt><dd>' + escapeMarkup(enrollment.planned_class_name || "Non renseignée") + '</dd></div><div><dt>Début prévu</dt><dd>' + escapeMarkup(enrollment.starts_on || "Non renseigné") + '</dd></div><div><dt>Projection opérationnelle</dt><dd>Aucune · brouillon</dd></div></dl>') +
        (root.SchoolSafeStudentLifecycle ? root.SchoolSafeStudentLifecycle.renderSection({ student: student, user: activeUser }) : "") +
        section("parent", "shield-check", "Parent principal", parentCard()) +
        section("guardians", "users-round", "Tuteurs secondaires", '<p class="family-section-intro">Exactement trois personnes autorisées, sans compte SchoolSafe dans B2-FE.</p><div class="family-guardians">' + activeState.guardians.map(guardianCard).join("") + '</div>') +
        (root.SchoolSafeStudentPickup ? root.SchoolSafeStudentPickup.renderDossierSection({ student: student, state: activeState, user: activeUser }) : "") +
        section("emergency", "siren", "Contact d’urgence", emergencyCard(), "family-section--emergency") +
        section("proofs", "scan-face", "Photos et identités", '<div class="family-proof-heading"><p>Vue de contrôle des éléments de démonstration.</p>' + root.ssBadge({ label: "BACKEND_LATER", variant: "warning" }) + '</div>' + identityMatrix()) +
        section("checklist", "list-checks", "Checklist", checklist()) +
        (root.SchoolSafeStudentVerification ? root.SchoolSafeStudentVerification.renderSection({ student: student, state: activeState, user: activeUser }) : "") +
        section("history", "history", "Historique du brouillon", history()) +
      '</div><footer class="family-dossier-footer"><i data-lucide="shield-alert"></i><p><b>Dossier non opérationnel.</b> Cette démonstration ne valide, n’active et ne transmet aucune donnée au serveur.</p></footer></div>';
  }

  function resolvePath(path) {
    if (path === "student") return activeState.studentPhoto;
    if (path === "emergency") return activeState.emergency.photo;
    var match = /^guardian-(\d)$/.exec(path);
    return match ? activeState.guardians[Number(match[1]) - 1].photo : null;
  }

  function setPath(path, value) {
    var segments = path.split(".");
    var target = activeState;
    for (var index = 0; index < segments.length - 1; index += 1) target = target[segments[index]];
    target[segments[segments.length - 1]] = value;
  }

  function rerender() {
    if (!activeModal || !activeModal.isOpen()) return;
    activeModal.content.innerHTML = renderDossier();
    bindDossier();
  }

  function recordDemoChange(label) {
    activeState.history.unshift({ at: "À l’instant", label: label });
    activeState.history = activeState.history.slice(0, 12);
    saveStore();
  }

  function bindDossier() {
    var rootElement = activeModal.content.querySelector(".student-family-dossier");
    rootElement.querySelectorAll("[data-dossier-section]").forEach(function (button) {
      button.addEventListener("click", function () {
        var target = rootElement.querySelector("#student-dossier-" + button.getAttribute("data-dossier-section"));
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    rootElement.querySelectorAll("[data-demo-field]").forEach(function (field) {
      field.addEventListener("change", function () {
        setPath(field.getAttribute("data-demo-field"), field.value);
        recordDemoChange("Informations familiales ajustées dans la démo");
        rerender();
      });
    });

    rootElement.querySelectorAll("[data-photo-input]").forEach(function (input) {
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var photo = resolvePath(input.getAttribute("data-photo-input"));
          photo.src = String(reader.result || "");
          photo.zoom = 100; photo.x = 0; photo.y = 0;
          recordDemoChange("Photo ajoutée à la prévisualisation locale");
          rerender();
        };
        reader.readAsDataURL(file);
      });
    });

    rootElement.querySelectorAll("[data-photo-remove]").forEach(function (button) {
      button.addEventListener("click", function () {
        var photo = resolvePath(button.getAttribute("data-photo-remove"));
        photo.src = ""; photo.zoom = 100; photo.x = 0; photo.y = 0;
        recordDemoChange("Photo supprimée avant vérification");
        rerender();
      });
    });

    rootElement.querySelectorAll("[data-photo-control]").forEach(function (control) {
      control.addEventListener("input", function () {
        var owner = control.getAttribute("data-photo-target");
        var photo = resolvePath(owner);
        photo[control.getAttribute("data-photo-control")] = Number(control.value);
        var editor = rootElement.querySelector('[data-photo-owner="' + owner + '"]');
        var preview = editor && editor.querySelector("[data-photo-preview]");
        var position = editor && editor.querySelector("[data-photo-position]");
        if (preview) preview.style.transform = photoTransform(photo);
        if (position) position.textContent = "Déplacement : " + photo.x + " / " + photo.y;
        saveStore();
      });
    });

    if (root.SchoolSafeStudentVerification) {
      root.SchoolSafeStudentVerification.bind({
        rootElement: rootElement,
        student: activeStudent,
        state: activeState,
        user: activeUser,
        onChange: function (label) {
          recordDemoChange(label);
          rerender();
        }
      });
    }

    if (root.SchoolSafeStudentPickup) {
      root.SchoolSafeStudentPickup.bindDossier({
        rootElement: rootElement,
        student: activeStudent,
        state: activeState,
        user: activeUser,
        onChange: function (label) {
          recordDemoChange(label);
          rerender();
        }
      });
    }

    if (root.SchoolSafeStudentLifecycle) {
      root.SchoolSafeStudentLifecycle.bind({
        rootElement: rootElement,
        student: activeStudent,
        user: activeUser
      });
    }

    if (root.lucide) root.lucide.createIcons();
  }

  function open(student, user) {
    if (user && user.token) {
      activeUser = user;
      activeModal = root.ssModal({
        title: "Dossier familial",
        subtitle: "Session live · frontend uniquement",
        size: "full",
        className: "student-family-modal",
        content: '<section class="student-family-unavailable" role="status"><i data-lucide="cloud-off"></i><div><span>SESSION LIVE</span><h2>DONNÉES INDISPONIBLES</h2><p>La lecture et la préparation du dossier familial réel exigent une projection serveur sécurisée. Aucun contenu fictif ou sensible n’est conservé dans localStorage · BACKEND_LATER.</p></div></section>',
        actions: [{ label: "Fermer le dossier", variant: "secondary" }],
        onClose: function () { activeModal = null; activeStudent = null; activeState = null; activeUser = null; }
      });
      if (root.lucide) root.lucide.createIcons();
      return;
    }
    activeStudent = student;
    activeState = stateFor(student);
    activeUser = user || { permissions: [] };
    activeModal = root.ssModal({
      title: "Dossier élève en préparation",
      subtitle: isDemoMode() ? "Données familiales fictives · aucune écriture serveur" : "Interface de préparation · persistance réelle BACKEND_LATER",
      size: "full",
      className: "student-family-modal",
      content: renderDossier(),
      actions: [{ label: "Fermer le dossier", variant: "secondary" }],
      onClose: function () { activeModal = null; activeStudent = null; activeState = null; activeUser = null; }
    });
    bindDossier();
  }

  root.SchoolSafeStudentFamily = { open: open };
})(window);
