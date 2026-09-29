(function (root) {
  "use strict";

  /**
   * SchoolSafe B1 — Student Record Real Module
   * Connects the existing demo UI design to the real backend API.
   * Replaces localStorage as the business data source.
   * Design preserved from student-dossier-demo.js / student-family-demo.js.
   */

  var SECTIONS = [
    { id: "summary", label: "Résumé", icon: "layout-dashboard", permission: "school.student.read" },
    { id: "identity", label: "Identité", icon: "contact", permission: "school.student.read" },
    { id: "schooling", label: "Scolarité", icon: "graduation-cap", permission: "school.student.read" },
    { id: "family", label: "Famille", icon: "users-round", permission: "school.guardian.read" },
    { id: "emergency", label: "Contacts urgence", icon: "phone-call", permission: "school.student.read" },
    { id: "health", label: "Santé", icon: "heart-pulse", permission: "school.student.health.read" },
    { id: "canteen", label: "Cantine", icon: "utensils", permission: "school.student.dietary.read" },
    { id: "pickup", label: "Personnes autorisées", icon: "shield-check", permission: "security.events.read" },
    { id: "documents", label: "Documents", icon: "files", permission: "school.student.read" },
    { id: "history", label: "Historique", icon: "history", permission: "school.student.read" }
  ];

  var WIZARD_STEPS = [
    { id: "identity", label: "Identité" },
    { id: "schooling", label: "Scolarité" },
    { id: "family", label: "Famille" },
    { id: "emergency", label: "Contacts d'urgence" },
    { id: "health", label: "Santé & Alimentation" },
    { id: "pickup", label: "Personnes autorisées" },
    { id: "verify", label: "Documents + Vérification finale" }
  ];

  function escapeMarkup(value) {
    if (root.ssEscapeHtml) return root.ssEscapeHtml(value == null ? "" : String(value));
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function hasPermission(user, permission) {
    if (!user || !permission) return false;
    if (root.SchoolSafeAccess && typeof root.SchoolSafeAccess.canAccess === "function") {
      return root.SchoolSafeAccess.canAccess(user, permission);
    }
    return true;
  }

  async function loadStudentRecord(studentId) {
    if (!root.StudentRecordAPI) throw new Error("StudentRecordAPI non disponible");
    var record = await root.StudentRecordAPI.getRecord(studentId);
    var completeness = await root.StudentRecordAPI.getCompleteness(studentId);
    return { record: record.data || record, completeness: completeness.data || completeness };
  }

  function renderCompletenessBadge(completeness) {
    var pct = completeness.percentage || 0;
    var status = completeness.status || "INCOMPLETE";
    var color = pct >= 100 ? "#16a34a" : "#e9a515";
    var label = pct >= 100 ? "PRÊT À VALIDER" : "DOSSIER " + pct + "% COMPLÉTÉ";
    return '<div class="ss-completeness-badge" style="background:' + color + ';color:#fff;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;display:inline-block;">' + escapeMarkup(label) + '</div>';
  }

  function renderMissingCheckpoints(completeness) {
    var missing = completeness.missing || [];
    if (!missing.length) return "";
    var labels = {
      identity_incomplete: "Identité incomplète",
      photo_missing: "Photo enfant manquante",
      academic_year_missing: "Année scolaire manquante",
      class_missing: "Classe manquante",
      no_guardian: "Aucun responsable familial",
      no_single_primary: "Responsable principal manquant ou multiple",
      primary_phone_missing: "Téléphone du responsable principal manquant",
      emergency_contact_primary_missing: "Contact d'urgence principal manquant",
      medical_declaration_incomplete: "Déclaration santé incomplète",
      dietary_declaration_incomplete: "Déclaration alimentation incomplète",
      confirmations_incomplete: "Confirmations manquantes",
      consents_missing: "Consentements manquants"
    };
    var html = '<div class="ss-missing-checkpoints" style="margin-top:12px;padding:12px;background:#fef3c7;border-radius:8px;font-size:13px;">';
    html += '<strong>Éléments manquants :</strong><ul style="margin:6px 0 0 18px;padding:0;">';
    for (var i = 0; i < missing.length; i++) {
      html += '<li>' + escapeMarkup(labels[missing[i]] || missing[i]) + '</li>';
    }
    html += '</ul></div>';
    return html;
  }

  function renderWizardStep(stepIndex, studentId, user) {
    var step = WIZARD_STEPS[stepIndex];
    if (!step) return "<p>Étape inconnue</p>";
    var html = '<div class="ss-wizard-step" data-step="' + step.id + '">';
    html += '<h3 style="margin:0 0 12px;">' + escapeMarkup(step.label) + '</h3>';
    html += '<div class="ss-step-content" id="ss-step-' + step.id + '">Chargement…</div>';
    html += '<div class="ss-step-actions" style="margin-top:16px;display:flex;gap:8px;">';
    if (stepIndex > 0) {
      html += '<button class="ss-btn ss-btn-secondary" data-action="prev">Précédent</button>';
    }
    html += '<button class="ss-btn ss-btn-secondary" data-action="save-draft">Enregistrer le brouillon</button>';
    if (stepIndex < WIZARD_STEPS.length - 1) {
      html += '<button class="ss-btn ss-btn-primary" data-action="next">Continuer</button>';
    } else {
      html += '<button class="ss-btn ss-btn-primary" data-action="verify">Vérifier le dossier</button>';
    }
    html += '</div></div>';
    return html;
  }

  async function initStudentRecordPage(container, studentId, user) {
    container.innerHTML = '<div class="ss-loading">Chargement du dossier…</div>';
    try {
      var data = await loadStudentRecord(studentId);
      var record = data.record;
      var completeness = data.completeness;

      var html = '<div class="ss-student-record">';
      html += '<div class="ss-record-header" style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">';
      html += '<div class="ss-student-photo" style="width:48px;height:48px;border-radius:50%;background:#e5e7eb;overflow:hidden;">';
      if (record.photo_path) {
        html += '<img src="' + escapeMarkup(record.photo_path) + '" alt="" style="width:100%;height:100%;object-fit:cover;">';
      }
      html += '</div>';
      html += '<div><h2 style="margin:0;font-size:18px;">' + escapeMarkup((record.first_name || "") + " " + (record.last_name || "")) + '</h2>';
      html += '<span style="font-size:13px;color:#6b7280;">' + escapeMarkup(record.matricule || "") + '</span></div>';
      html += '<div style="margin-left:auto;">' + renderCompletenessBadge(completeness) + '</div>';
      html += '</div>';

      if (completeness.percentage < 100) {
        html += renderMissingCheckpoints(completeness);
      }

      html += '<div class="ss-section-tabs" style="display:flex;gap:4px;margin:16px 0;flex-wrap:wrap;">';
      for (var i = 0; i < SECTIONS.length; i++) {
        var sec = SECTIONS[i];
        if (!hasPermission(user, sec.permission)) continue;
        html += '<button class="ss-tab" data-section="' + sec.id + '" style="padding:6px 14px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;">' + escapeMarkup(sec.label) + '</button>';
      }
      html += '</div>';

      html += '<div class="ss-section-content" id="ss-section-content">';
      html += '<p>Sélectionnez une section pour afficher les détails.</p>';
      html += '</div>';

      html += '</div>';
      container.innerHTML = html;

      var tabs = container.querySelectorAll(".ss-tab");
      for (var t = 0; t < tabs.length; t++) {
        tabs[t].addEventListener("click", function () {
          var sectionId = this.getAttribute("data-section");
          loadSectionContent(container, studentId, sectionId, user);
        });
      }
    } catch (err) {
      container.innerHTML = '<div class="ss-error" style="padding:16px;background:#fee2e2;border-radius:8px;color:#991b1b;">Erreur : ' + escapeMarkup(err.message || err) + '</div>';
    }
  }

  async function loadSectionContent(container, studentId, sectionId, user) {
    var contentDiv = container.querySelector("#ss-section-content");
    if (!contentDiv) return;
    contentDiv.innerHTML = '<div class="ss-loading">Chargement…</div>';
    try {
      var api = root.StudentRecordAPI;
      var html = "";
      switch (sectionId) {
        case "summary": {
          var summary = await api.getRecord(studentId);
          var sum = summary.data || summary;
          var comp = await api.getCompleteness(studentId);
          var cmp = comp.data || comp;
          html = '<div class="ss-summary-section">';
          html += '<p><strong>Élève :</strong> ' + escapeMarkup((sum.first_name || "") + " " + (sum.last_name || "")) + '</p>';
          html += '<p><strong>Matricule :</strong> ' + escapeMarkup(sum.matricule || "—") + '</p>';
          html += '<p><strong>Classe :</strong> ' + escapeMarkup((sum.schooling && sum.schooling.class_name) || "—") + '</p>';
          html += renderCompletenessBadge(cmp);
          html += '</div>';
          break;
        }
        case "identity": {
          var rec = await api.getRecord(studentId);
          var r = rec.data || rec;
          html = '<div class="ss-identity-section">';
          html += '<p><strong>Matricule :</strong> ' + escapeMarkup(r.matricule || "—") + '</p>';
          html += '<p><strong>Prénom :</strong> ' + escapeMarkup(r.first_name || "—") + '</p>';
          html += '<p><strong>Postnom :</strong> ' + escapeMarkup(r.middle_name || "—") + '</p>';
          html += '<p><strong>Nom :</strong> ' + escapeMarkup(r.last_name || "—") + '</p>';
          html += '<p><strong>Date de naissance :</strong> ' + escapeMarkup(r.date_of_birth || "—") + '</p>';
          html += '<p><strong>Lieu de naissance :</strong> ' + escapeMarkup(r.place_of_birth || "—") + '</p>';
          html += '<p><strong>Nationalité :</strong> ' + escapeMarkup(r.nationality || "—") + '</p>';
          html += '<p><strong>Adresse :</strong> ' + escapeMarkup(r.home_address || "—") + '</p>';
          html += '</div>';
          break;
        }
        case "schooling": {
          var schoolRec = await api.getRecord(studentId);
          var sr = schoolRec.data || schoolRec;
          var sc = sr.schooling || {};
          html = '<div class="ss-schooling-section">';
          html += '<p><strong>Classe :</strong> ' + escapeMarkup(sc.class_name || "—") + '</p>';
          html += '<p><strong>Année scolaire :</strong> ' + escapeMarkup(sc.academic_year_id || "—") + '</p>';
          html += '<p><strong>Statut :</strong> ' + escapeMarkup(sr.lifecycle_status || "—") + '</p>';
          html += '</div>';
          break;
        }
        case "family": {
          var fam = await api.getFamily(studentId);
          var f = fam.data || fam || [];
          html = '<div class="ss-family-section">';
          if (!f.length) html += '<p>Aucun responsable familial enregistré.</p>';
          for (var i = 0; i < f.length; i++) {
            var guardian = f[i];
            var role = guardian.guardian_type === "pere" ? "PÈRE" : guardian.guardian_type === "mere" ? "MÈRE" : "TUTEUR";
            html += '<div class="ss-guardian-card" style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">';
            html += '<strong>' + escapeMarkup(role) + (guardian.is_primary ? " · Principal" : "") + '</strong>';
            html += '<p style="margin:4px 0 0;">' + escapeMarkup(guardian.full_name || "—") + '</p>';
            html += '</div>';
          }
          html += '</div>';
          break;
        }
        case "emergency": {
          var emergency = await api.getEmergencyContacts(studentId);
          var contacts = emergency.data || emergency || [];
          html = '<div class="ss-emergency-section">';
          if (!contacts.length) html += '<p>Aucun contact d\'urgence enregistré.</p>';
          for (var e = 0; e < contacts.length; e++) {
            var contact = contacts[e];
            html += '<div style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>Contact ' + escapeMarkup(contact.slot_no) + ' :</strong> ' + escapeMarkup(contact.full_name || "—") + ' · ' + escapeMarkup(contact.phone || "—") + '</div>';
          }
          html += '</div>';
          break;
        }
        case "health": {
          var health = await api.getHealth(studentId);
          var h = health.data || health || {};
          var hp = h.profile || {};
          html = '<div class="ss-health-section">';
          html += '<p><strong>Groupe sanguin :</strong> ' + escapeMarkup(hp.blood_type || "UNKNOWN") + '</p>';
          html += '<p><strong>Médecin :</strong> ' + escapeMarkup(hp.primary_doctor_name || "—") + '</p>';
          html += '<p><strong>Déclaration santé complétée :</strong> ' + (hp.medical_declaration_completed ? "Oui" : "Non") + '</p>';
          html += '<p><strong>Conditions :</strong> ' + escapeMarkup((h.conditions || []).length) + '</p>';
          html += '<p><strong>Allergies :</strong> ' + escapeMarkup((h.allergies || []).length) + '</p>';
          html += '<p><strong>Médicaments :</strong> ' + escapeMarkup((h.medications || []).length) + '</p>';
          html += '</div>';
          break;
        }
        case "canteen": {
          var dietary = await api.getDietary(studentId);
          var d = dietary.data || dietary || {};
          var dp = d.profile || {};
          html = '<div class="ss-canteen-section">';
          html += '<p><strong>Déclaration alimentation complétée :</strong> ' + (dp.dietary_declaration_completed ? "Oui" : "Non") + '</p>';
          html += '<p><strong>Note parent :</strong> ' + escapeMarkup(dp.parent_food_note || "—") + '</p>';
          html += '<p><strong>Restrictions :</strong> ' + escapeMarkup((d.restrictions || []).length) + '</p>';
          html += '<p><strong>Préférences :</strong> ' + escapeMarkup((d.preferences || []).length) + '</p>';
          html += '</div>';
          break;
        }
        case "pickup": {
          var pickupFamily = await api.getFamily(studentId);
          var pf = pickupFamily.data || pickupFamily || [];
          var authorized = pf.filter(function (guardian) { return guardian.is_authorized_pickup; });
          html = '<div class="ss-pickup-section"><p><strong>Responsables familiaux autorisés :</strong> ' + escapeMarkup(authorized.length) + '</p>';
          html += '<p style="font-size:13px;color:#6b7280;">Les personnes externes autorisées restent gérées par le module sécurité existant (maximum 3).</p></div>';
          break;
        }
        case "documents":
          html = '<p>Documents et consentements du dossier élève.</p>';
          break;
        case "history":
          html = '<p>Historique audité des modifications matérielles du dossier.</p>';
          break;
        default:
          html = '<p>Section indisponible.</p>';
      }
      contentDiv.innerHTML = html;
    } catch (err) {
      contentDiv.innerHTML = '<div class="ss-error" style="padding:12px;background:#fee2e2;border-radius:6px;color:#991b1b;">Erreur : ' + escapeMarkup(err.message || err) + '</div>';
    }
  }

  root.StudentRecordReal = {
    init: initStudentRecordPage,
    loadRecord: loadStudentRecord,
    renderWizardStep: renderWizardStep,
    sections: SECTIONS,
    wizardSteps: WIZARD_STEPS
  };
})(typeof window !== "undefined" ? window : globalThis);