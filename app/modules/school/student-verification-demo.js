(function (root) {
  "use strict";

  var PERMISSION = "school.student.activate";
  var STATUS_ORDER = ["incomplete", "review", "ready", "active"];
  var STATUS_LABELS = {
    incomplete: "INCOMPLET",
    review: "EN COURS DE VÉRIFICATION",
    ready: "PRÊT POUR ACTIVATION",
    active: "ACTIF"
  };

  function escapeMarkup(value) {
    if (root.ssEscapeHtml) return root.ssEscapeHtml(value == null ? "" : String(value));
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function filled(value) {
    return String(value == null ? "" : value).trim().length > 0;
  }

  function personComplete(person, phoneKey) {
    return !!person && ["relation", "lastName", "middleName", "firstName", phoneKey].every(function (key) {
      return filled(person[key]);
    });
  }

  function photoPresent(photo) {
    return !!(photo && filled(photo.src));
  }

  function identityPresent(person) {
    return !!person && filled(person.idType) && filled(person.idNumber);
  }

  function conditions(student, state) {
    var enrollment = student.enrollment || {};
    var guardians = Array.isArray(state.guardians) ? state.guardians : [];
    var emergency = state.emergency || {};
    var parent = state.parentSnapshot || {};
    return [
      { key: "student", label: "Identité élève complète", detail: "Prénom, nom et matricule", complete: filled(student.first_name) && filled(student.last_name) && filled(student.matricule) },
      { key: "year", label: "Année scolaire définie", detail: enrollment.academic_year_label || "À renseigner", complete: filled(enrollment.academic_year_label) },
      { key: "class", label: "Classe prévue définie", detail: enrollment.planned_class_name || "À renseigner", complete: filled(enrollment.planned_class_name) },
      { key: "parent", label: "Parent principal enregistré", detail: parent.name || "À rattacher", complete: filled(parent.name) },
      { key: "parent-account", label: "Compte Parent actif", detail: parent.accountStatus === "active" ? "ACTIF" : "Activation du compte requise", complete: parent.accountStatus === "active" },
      { key: "guardians", label: "Exactement trois tuteurs secondaires", detail: guardians.length + " / 3", complete: guardians.length === 3 },
      { key: "guardians-complete", label: "Tuteurs obligatoires complets", detail: "Relation, identité et téléphone", complete: guardians.length === 3 && guardians.every(function (item) { return personComplete(item, "phone"); }) },
      { key: "emergency", label: "Contact d’urgence distinct enregistré", detail: "Bloc et téléphone dédiés", complete: personComplete(emergency, "phonePrimary") },
      { key: "photos", label: "Photos présentes", detail: "Élève, trois tuteurs et urgence", complete: photoPresent(state.studentPhoto) && guardians.length === 3 && guardians.every(function (item) { return photoPresent(item.photo); }) && photoPresent(emergency.photo) },
      { key: "ids", label: "Pièces d’identité renseignées", detail: "Trois tuteurs et contact d’urgence", complete: guardians.length === 3 && guardians.every(identityPresent) && identityPresent(emergency) }
    ];
  }

  function evaluate(student, state) {
    var list = conditions(student, state);
    var missing = list.filter(function (item) { return !item.complete; });
    return { conditions: list, missing: missing, complete: missing.length === 0 };
  }

  function ensureVerification(state) {
    state.verification = state.verification || { status: "incomplete" };
    if (STATUS_ORDER.indexOf(state.verification.status) < 0) state.verification.status = "incomplete";
    return state.verification;
  }

  function canManage(user) {
    var access = root.SchoolSafeAccess;
    return !!(access && typeof access.canAccess === "function" && access.canAccess(user || {}, PERMISSION));
  }

  function statusBadge(status) {
    var variant = status === "active" ? "success" : status === "ready" ? "primary" : status === "review" ? "info" : "warning";
    var icon = status === "active" ? "badge-check" : status === "ready" ? "circle-check-big" : status === "review" ? "scan-search" : "circle-alert";
    return root.ssBadge({ label: STATUS_LABELS[status], variant: variant, icon: icon });
  }

  function renderStages(status) {
    var current = STATUS_ORDER.indexOf(status);
    return '<ol class="student-verification__stages" aria-label="États du dossier">' + STATUS_ORDER.map(function (item, index) {
      var className = index === current ? "active" : index < current ? "done" : "";
      return '<li class="' + className + '"><span>' + (index + 1) + '</span><b>' + STATUS_LABELS[item] + '</b></li>';
    }).join("") + "</ol>";
  }

  function renderConditions(summary) {
    return '<div class="student-verification__conditions">' + summary.conditions.map(function (item) {
      return '<article data-verification-condition class="' + (item.complete ? "complete" : "missing") + '"><i data-lucide="' + (item.complete ? "check" : "triangle-alert") + '"></i><div><b>' + escapeMarkup(item.label) + '</b><span>' + escapeMarkup(item.detail) + '</span></div><strong>' + (item.complete ? "PRÊT" : "À CORRIGER") + '</strong></article>';
    }).join("") + "</div>";
  }

  function renderMissing(summary) {
    if (summary.complete) return '<div class="student-verification__clear"><i data-lucide="badge-check"></i><b>Aucune information obligatoire ne manque.</b></div>';
    return '<aside class="student-verification__missing"><div><i data-lucide="clipboard-x"></i><div><b>Informations à corriger</b><p>' + summary.missing.length + " condition" + (summary.missing.length > 1 ? "s" : "") + " avant la préparation finale.</p></div></div><ul>" + summary.missing.map(function (item) {
      return "<li>" + escapeMarkup(item.label) + "</li>";
    }).join("") + "</ul></aside>";
  }

  function actionButton(label, action, variant, icon) {
    return root.ssButton({ label: label, variant: variant, icon: icon, attrs: { "data-verification-action": action } });
  }

  function renderActions(status, summary, allowed) {
    if (!allowed) {
      return '<aside class="student-verification__readonly"><i data-lucide="eye"></i><div><b>Consultation uniquement</b><p>Les actions exigent la permission frontend de démonstration.</p></div></aside>';
    }
    if (status === "active") return "";
    var buttons = [];
    if (status === "incomplete") buttons.push(actionButton("Vérifier le dossier", "verify", "primary", "scan-search"));
    if (status === "review") {
      buttons.push(actionButton("Retourner pour correction", "return", "secondary", "undo-2"));
      if (summary.complete) buttons.push(actionButton("Marquer prêt pour activation", "ready", "primary", "circle-check-big"));
    }
    if (status === "ready") {
      buttons.push(actionButton("Retourner pour correction", "return", "secondary", "undo-2"));
      buttons.push(actionButton("Activer dans la démonstration", "activate", "primary", "sparkles"));
    }
    return '<div class="student-verification__actions">' + buttons.join("") + "</div>";
  }

  function renderNextFunctions(status) {
    if (status !== "active") return "";
    var items = [
      ["Carte élève", "badge"], ["QR", "qr-code"], ["Présence", "clipboard-check"],
      ["Finance", "wallet-cards"], ["Pédagogie", "book-open-check"], ["Documents", "files"]
    ];
    return '<div class="student-verification__next"><header><div><span>APERÇU UNIQUEMENT</span><h3>Fonctions disponibles dans une phase future</h3></div>' + root.ssBadge({ label: "BACKEND_LATER", variant: "warning" }) + '</header><div>' + items.map(function (item) {
      return '<article data-next-function><i data-lucide="' + item[1] + '"></i><b>' + item[0] + '</b></article>';
    }).join("") + "</div></div>";
  }

  function renderSection(options) {
    var student = options.student;
    var state = options.state;
    var verification = ensureVerification(state);
    var summary = evaluate(student, state);
    var allowed = canManage(options.user);
    var readyCount = summary.conditions.length - summary.missing.length;
    return '<section id="student-dossier-verification" class="family-section student-verification" data-verification-section>' +
      '<header><i data-lucide="shield-check"></i><h2>Vérification et activation</h2></header>' +
      '<div class="student-verification__surface"><div class="student-verification__lead"><div><span>SYNTHÈSE ADMINISTRATIVE</span><h3>' + readyCount + " / " + summary.conditions.length + ' conditions prêtes</h3><p>Contrôle visuel local avant une future activation officielle.</p></div>' + statusBadge(verification.status) + "</div>" +
      renderStages(verification.status) + renderConditions(summary) + renderMissing(summary) +
      '<div class="student-verification__permission"><i data-lucide="shield-alert"></i><div><b>' + PERMISSION + " — BACKEND_LATER</b><p>Aucune permission backend, aucune écriture serveur et aucun audit distant dans B3-FE.</p></div></div>" +
      renderActions(verification.status, summary, allowed) + renderNextFunctions(verification.status) +
      "</div></section>";
  }

  function bind(options) {
    var section = options.rootElement.querySelector("[data-verification-section]");
    if (!section || !canManage(options.user)) return;
    var verification = ensureVerification(options.state);
    var summary = evaluate(options.student, options.state);
    section.querySelectorAll("[data-verification-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var action = button.getAttribute("data-verification-action");
        if (action === "verify") {
          verification.status = "review";
          options.onChange("Dossier vérifié");
        } else if (action === "return") {
          verification.status = "incomplete";
          options.onChange("Retourné pour correction");
        } else if (action === "ready" && summary.complete) {
          verification.status = "ready";
          options.onChange("Prêt pour activation");
        } else if (action === "activate" && verification.status === "ready" && summary.complete) {
          root.ssConfirm({
            title: "Activation de démonstration",
            message: "Confirmer cet aperçu local ? BACKEND_LATER : aucune activation serveur et aucune confirmation officielle ne seront produites.",
            confirmLabel: "Confirmer la démonstration",
            cancelLabel: "Annuler",
            confirmIcon: "sparkles"
          }).then(function (confirmed) {
            if (!confirmed || !canManage(options.user)) return;
            verification.status = "active";
            options.onChange("Activation de démonstration");
          });
        }
      });
    });
  }

  root.SchoolSafeStudentVerification = {
    PERMISSION: PERMISSION,
    evaluate: evaluate,
    canManage: canManage,
    renderSection: renderSection,
    bind: bind
  };
})(window);
