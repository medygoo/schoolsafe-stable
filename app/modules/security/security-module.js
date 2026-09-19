(function (root) {
  "use strict";

  var currentEventType = "entry";
  var currentMode = "scan";
  var currentUser = null;
  var currentPortalId = null;
  var frontendDemo = false;
  var hideModeTabs = false;
  var LOCAL_EVENT_KEY = "schoolsafe-v2-security-local-events";

  // Familles (V05–V11) : afficher les deux groupes séparés de récupérateurs —
  // responsables familiaux et accrédités externes — avec photos, pour le
  // contrôle humain du gardien (V09). Repli silencieux si la route échoue.
  function renderPickupGroups(resultBox, studentId) {
    var apiBase = window.schoolSafeApiBase || (window.schoolSafeBackendConfig ? window.schoolSafeBackendConfig.api_base : "http://127.0.0.1:8787");
    fetch(apiBase + "/native/family/students/" + encodeURIComponent(studentId) + "/pickup-authorizations", {
      credentials: "include",
      headers: { "Accept": "application/json" }
    }).then(function (res) { return res.ok ? res.json() : null; }).then(function (payload) {
      var data = payload && payload.data;
      if (!data) return;
      var html = '<div class="authorized-persons pickup-groups" data-student-id="' + escapeHtml(studentId) + '">';
      if (Array.isArray(data.family) && data.family.length) {
        html += '<h4>Responsables familiaux</h4><ul>';
        data.family.forEach(function (person) {
          html += '<li><b>' + escapeHtml(person.name) + '</b> <small>' + escapeHtml(person.type) +
            (person.is_primary ? ' · principal' : '') + '</small>' +
            (person.authorized ? '' : ' <small>— récupération suspendue</small>');
          if (person.authorized) {
            html += ' <button type="button" class="ss-button ss-button--secondary" data-pickup-confirm="' + escapeHtml(person.guardian_id) + '">Confirmer la remise</button>';
          }
          html += '</li>';
        });
        html += '</ul>';
      }
      if (Array.isArray(data.accredited) && data.accredited.length) {
        html += '<h4>Personnes accréditées à la récupération</h4><ul>';
        data.accredited.forEach(function (person) {
          var valid = person.status === 'active';
          html += '<li><b>' + escapeHtml(person.name) + '</b> <small>' +
            escapeHtml(person.status) +
            (person.starts_on ? ' · du ' + escapeHtml(String(person.starts_on).slice(0, 10)) : '') +
            (person.ends_on ? ' au ' + escapeHtml(String(person.ends_on).slice(0, 10)) : '') +
            '</small>' + (valid ? '' : ' <small>— non utilisable</small>');
          if (valid) {
            html += ' <button type="button" class="ss-button ss-button--secondary" data-pickup-confirm="' + escapeHtml(person.guardian_id) + '">Confirmer la remise</button>';
          }
          html += '</li>';
        });
        html += '</ul>';
      }
      html += '<p class="ss-muted">Comparez la personne présente à sa photo avant de confirmer la remise — un QR valide ne suffit jamais.</p>';
      html += '</div>';
      resultBox.insertAdjacentHTML("beforeend", html);

      // V16/R16–R17 : confirmation serveur au moment du clic — droit
      // revalidé, idempotent, une seule remise par jour. Comparaison humaine
      // demandée avant le clic (le logiciel ne la remplace jamais).
      var groups = resultBox.querySelector(".pickup-groups");
      if (groups) {
        groups.querySelectorAll("[data-pickup-confirm]").forEach(function (button) {
          button.addEventListener("click", async function () {
            var guardianId = button.getAttribute("data-pickup-confirm");
            var studentKey = groups.getAttribute("data-student-id") || studentId;
            if (!window.confirm("Avez-vous comparé la personne présente à sa photo ? Confirmer la remise ?")) return;
            button.disabled = true;
            try {
              var res = await fetch(apiBase + "/native/family/pickup-confirm", {
                method: "POST",
                credentials: "include",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify({
                  student_id: studentKey,
                  guardian_id: guardianId,
                  request_key: "pickup-" + studentKey + "-" + guardianId + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10)
                })
              });
              var payload = null;
              try { payload = await res.json(); } catch (e) {}
              if (!res.ok) throw new Error(payload && payload.message ? payload.message : "Erreur " + res.status);
              var d = payload && payload.data;
              button.textContent = d && d.idempotent ? "Remise déjà confirmée" : "Remise confirmée ✓";
              button.classList.add("ss-button--primary");
            } catch (e) {
              button.disabled = false;
              window.alert("Remise refusée : " + e.message);
            }
          });
        });
      }
    }).catch(function () { /* repli silencieux : l'ancienne liste reste affichée */ });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var scanStream = null;
  var scanTimeout = null;

  function readLocalEvents() {
    try {
      var parsed = JSON.parse(root.localStorage.getItem(LOCAL_EVENT_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) { return []; }
  }

  function saveLocalEvent(event) {
    var events = readLocalEvents();
    events.unshift(event);
    try { root.localStorage.setItem(LOCAL_EVENT_KEY, JSON.stringify(events.slice(0, 60))); } catch (error) {}
  }

  function canScanAssignedPortal(user) {
    var access = root.SchoolSafeAccess;
    return !!(access && typeof access.allowsScope === "function" && access.allowsScope(user || {}, "security.scan", "assigned_portal"));
  }

  function refreshIcons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  function renderScanner(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (frontendDemo && !canScanAssignedPortal(currentUser)) {
      container.innerHTML = '<div class="security-scan-panel">' + window.ssState({ type: "error", title: "REFUSÉ", message: "security.scan avec assigned_portal est obligatoire.", size: "compact" }) + '</div>';
      return;
    }
    container.innerHTML =
      '<div class="security-scan-panel">' +
        '<header><span>Contrôle d’accès' + (frontendDemo ? " · assigned_portal" : "") + '</span><h2>Scanner une carte SchoolSafe</h2><p>Saisissez le contenu du QR, utilisez un lecteur connecté ou activez la caméra.</p></header>' +
        '<div class="scan-form ss-form-grid">' +
          window.ssField({
            label: "QR payload",
            labelFor: "qrPayloadInput",
            inputHtml: window.ssInput({ type: "text", id: "qrPayloadInput", placeholder: "schoolsafe://card/...", autocomplete: "off" })
          }) +
          '<div class="scan-actions ss-form-grid ss-form-grid--4">' +
            window.ssButton({ label: "Entrée", icon: "log-in", attrs: { "data-event-type": "entry" } }) +
            window.ssButton({ label: "Sortie", icon: "log-out", attrs: { "data-event-type": "exit" } }) +
            window.ssButton({ label: "Incident", variant: "secondary", icon: "siren", attrs: { "data-event-type": "incident" } }) +
            window.ssButton({ label: "Caméra", variant: "secondary", icon: "camera", attrs: { id: "cameraToggle" } }) +
          '</div>' +
        '</div>' +
        '<div id="cameraContainer" class="camera-container hidden">' +
          '<video id="cameraVideo" autoplay playsinline muted></video>' +
          '<p class="camera-hint">Placez le QR code devant la caméra.</p>' +
        '</div>' +
        '<div id="scanResult" class="scan-result hidden"></div>' +
        (frontendDemo ? '<p class="security-demo-boundary"><b>DÉMONSTRATION LOCALE</b> · BACKEND_LATER</p>' : '') +
      '</div>';

    bind(containerId);
  }

  function modeTabs() {
    return '<nav class="security-mode-tabs" aria-label="Modes du contrôle de sécurité">' +
      '<button type="button" data-security-mode="pickup" class="' + (currentMode === "pickup" ? "active" : "") + '"><i data-lucide="contact-round"></i>Contrôle Gardien</button>' +
      '<button type="button" data-security-mode="scan" class="' + (currentMode === "scan" ? "active" : "") + '"><i data-lucide="scan-line"></i>Scanner existant</button>' +
      '</nav><div id="securityModeContent"></div>';
  }

  function bindModeTabs(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll("[data-security-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        currentMode = button.getAttribute("data-security-mode");
        render(containerId, { mode: currentMode, user: currentUser });
      });
    });
  }

  function render(containerId, options) {
    options = options || {};
    currentMode = options.mode || currentMode || "scan";
    currentUser = options.user || currentUser || { permissions: [] };
    currentPortalId = options.portalId || currentPortalId;
    frontendDemo = options.frontendDemo === true;
    hideModeTabs = options.hideModeTabs === true;
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = hideModeTabs ? '<div id="securityModeContent"></div>' : modeTabs();
    if (currentMode === "pickup" && root.SchoolSafeStudentPickup) {
      root.SchoolSafeStudentPickup.resetControl();
      root.SchoolSafeStudentPickup.renderControl("securityModeContent", currentUser);
    } else {
      currentMode = "scan";
      renderScanner("securityModeContent");
    }
    if (!hideModeTabs) bindModeTabs(containerId);
    refreshIcons();
  }

  function bindCameraToggle(containerId) {
    var container = document.getElementById(containerId);
    var cameraToggle = container.querySelector("#cameraToggle");
    if (!cameraToggle) return;
    cameraToggle.addEventListener("click", function () {
      var cameraContainer = container.querySelector("#cameraContainer");
      if (cameraContainer.classList.contains("hidden")) {
        startCamera(containerId);
      } else {
        stopCamera(containerId);
      }
    });
  }

  function bind(containerId) {
    var container = document.getElementById(containerId);
    container.querySelectorAll("[data-event-type]").forEach(function (button) {
      button.addEventListener("click", function () {
        currentEventType = button.getAttribute("data-event-type");
        performScan(containerId);
      });
    });
    var input = container.querySelector("#qrPayloadInput");
    if (input) {
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          performScan(containerId);
        }
      });
    }
    bindCameraToggle(containerId);
  }

  function startCamera(containerId) {
    var container = document.getElementById(containerId);
    var cameraContainer = container.querySelector("#cameraContainer");
    var video = container.querySelector("#cameraVideo");
    var toggle = container.querySelector("#cameraToggle");

    if (!window.BarcodeDetector) {
      showResult(containerId, "error", "La détection de QR par caméra n’est pas supportée par ce navigateur. Utilisez la saisie manuelle.");
      return;
    }

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(function (stream) {
        scanStream = stream;
        video.srcObject = stream;
        cameraContainer.classList.remove("hidden");
        toggle.outerHTML = window.ssButton({ label: "Arrêter", variant: "secondary", icon: "camera-off", attrs: { id: "cameraToggle" } });
        refreshIcons();
        bindCameraToggle(containerId);
        detectLoop(containerId);
      })
      .catch(function (err) {
        showResult(containerId, "error", "Impossible d’accéder à la caméra : " + (err.message || err.name));
      });
  }

  function stopCamera(containerId) {
    var container = document.getElementById(containerId);
    var cameraContainer = container.querySelector("#cameraContainer");
    var video = container.querySelector("#cameraVideo");
    var toggle = container.querySelector("#cameraToggle");

    if (scanTimeout) {
      clearTimeout(scanTimeout);
      scanTimeout = null;
    }
    if (scanStream) {
      scanStream.getTracks().forEach(function (track) { track.stop(); });
      scanStream = null;
    }
    if (video) video.srcObject = null;
    if (cameraContainer) cameraContainer.classList.add("hidden");
    if (toggle) {
      toggle.outerHTML = window.ssButton({ label: "Caméra", variant: "secondary", icon: "camera", attrs: { id: "cameraToggle" } });
      refreshIcons();
      bindCameraToggle(containerId);
    }
  }

  function detectLoop(containerId) {
    var container = document.getElementById(containerId);
    var video = container.querySelector("#cameraVideo");
    if (!video || !scanStream) return;

    var detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    detector.detect(video).then(function (barcodes) {
      if (barcodes.length > 0) {
        var payload = barcodes[0].rawValue;
        var input = container.querySelector("#qrPayloadInput");
        if (input) input.value = payload;
        stopCamera(containerId);
        performScan(containerId);
        return;
      }
      scanTimeout = setTimeout(function () { detectLoop(containerId); }, 300);
    }).catch(function () {
      scanTimeout = setTimeout(function () { detectLoop(containerId); }, 300);
    });
  }

  function showResult(containerId, type, message) {
    var container = document.getElementById(containerId);
    var resultBox = container.querySelector("#scanResult");
    var config = { size: "compact" };
    if (type === "error") {
      config.type = "error";
      config.title = "Erreur";
      config.message = message;
    } else if (type === "info") {
      config.type = "loading";
      config.title = "Vérification en cours";
      config.message = message;
    } else if (type === "success") {
      config.type = "success";
      config.title = "AUTORISÉ";
      config.message = message;
    } else if (type === "warning") {
      config.type = "unavailable";
      config.title = "PASSAGE MANUEL";
      config.message = message;
    } else {
      config.type = "error";
      config.title = "Erreur";
      config.message = message;
    }
    resultBox.innerHTML = window.ssState(config);
    resultBox.classList.remove("hidden");
    refreshIcons();
  }

  function performScan(containerId) {
    var container = document.getElementById(containerId);
    var input = container.querySelector("#qrPayloadInput");
    var resultBox = container.querySelector("#scanResult");
    var payload = input.value.trim();
    if (!payload) {
      showResult(containerId, "error", "Veuillez saisir un QR.");
      return;
    }

    if (frontendDemo) {
      performLocalScan(containerId, payload);
      return;
    }

    if (!window.SchoolSafeSecurityAPI) {
      showResult(containerId, "error", "API de sécurité non disponible.");
      return;
    }

    showResult(containerId, "info", "Vérification en cours…");

    window.SchoolSafeSecurityAPI.scan({ qr_payload: payload, event_type: currentEventType }).then(function (data) {
      var isAllowed = data.decision === "allowed";
      var isManual = data.decision === "manual_override";
      var stateConfig = isAllowed
        ? { type: "success", title: "AUTORISÉ", message: "Accès autorisé", size: "compact" }
        : isManual
        ? { type: "unavailable", title: "PASSAGE MANUEL", message: "Passage manuel requis", size: "compact" }
        : { type: "error", title: "REFUSÉ", message: "Accès refusé", size: "compact" };

      var html = window.ssState(stateConfig);
      html += '<div class="scan-result-details">';
      if (data.student) {
        html += '<p><b>' + escapeHtml(data.student.first_name + " " + data.student.last_name) + '</b> · ' + escapeHtml(data.student.matricule) + '</p>';
        html += '<p>' + escapeHtml(data.student.class_name || "") + '</p>';
      }
      if (data.reason) {
        html += '<p>Motif : ' + escapeHtml(data.reason) + '</p>';
      }
      if (data.authorized_persons && data.authorized_persons.length) {
        html += '<div class="authorized-persons"><h4>Personnes autorisées</h4><ul>';
        data.authorized_persons.forEach(function (person) {
          html += '<li>' + escapeHtml(person.full_name) + ' <small>' + escapeHtml(person.guardian_type) + '</small></li>';
        });
        html += '</ul></div>';
      }
      if (data.alert) {
        html += '<p class="alert-info">🚨 ' + escapeHtml(data.alert.title) + '</p>';
      }
      html += '</div>';
      resultBox.innerHTML = html;
      input.value = "";
      refreshIcons();

      // Familles (V05–V11) : enrichir avec les deux groupes séparés —
      // responsables familiaux et accrédités externes — depuis la route
      // native. Repli silencieux sur l'ancienne liste en cas d'échec.
      if (data.student && data.student.id && (data.decision === "allowed" || data.decision === "manual_override")) {
        renderPickupGroups(resultBox, data.student.id);
      }
    }).catch(function (err) {
      resultBox.innerHTML = window.ssState({ type: "error", title: "Erreur", message: err.message, size: "compact" });
      refreshIcons();
    });
  }

  function localDecision(payload) {
    var match = /^schoolsafe:\/\/card\/([^?]+)(?:\?portal=([^&]+))?$/.exec(payload);
    if (!match) return { title: "REFUSÉ", type: "error", message: "QR invalide.", student: null };
    var studentId = decodeURIComponent(match[1]);
    var portalId = match[2] ? decodeURIComponent(match[2]) : "";
    var assignedPortalIds = Array.isArray(currentUser && currentUser.assignedPortalIds) ? currentUser.assignedPortalIds : [];
    if (!portalId || portalId !== currentPortalId || assignedPortalIds.indexOf(portalId) < 0) {
      return { title: "REFUSÉ", type: "error", message: "QR hors du portail affecté.", student: null, studentId: studentId, portalId: portalId };
    }
    var catalog = root.SchoolSafeGuardSecurity && Array.isArray(root.SchoolSafeGuardSecurity.STUDENTS) ? root.SchoolSafeGuardSecurity.STUDENTS : [];
    var student = catalog.find(function (item) { return item.id === studentId; }) || null;
    if (!student) return { title: "VÉRIFICATION", type: "unavailable", message: "QR inconnu. Contrôle manuel requis.", student: null, studentId: studentId, portalId: portalId };
    if (student.lifecycleStatus !== "active") return { title: "DOSSIER NON ACTIF", type: "error", message: "Ce dossier brouillon ne peut produire aucun passage.", student: student, studentId: studentId, portalId: portalId };
    if (currentEventType === "incident") return { title: "VÉRIFICATION", type: "unavailable", message: "Incident enregistré localement au poste autorisé.", student: student, studentId: studentId, portalId: portalId };
    return { title: "AUTORISÉ", type: "success", message: (currentEventType === "exit" ? "Sortie" : "Entrée") + " enregistrée localement.", student: student, studentId: studentId, portalId: portalId };
  }

  function performLocalScan(containerId, payload) {
    var container = document.getElementById(containerId);
    var input = container && container.querySelector("#qrPayloadInput");
    var resultBox = container && container.querySelector("#scanResult");
    if (!container || !resultBox) return;
    if (!canScanAssignedPortal(currentUser)) {
      showResult(containerId, "error", "security.scan avec assigned_portal est obligatoire.");
      return;
    }
    var decision = localDecision(payload);
    var html = window.ssState({ type: decision.type, title: decision.title, message: decision.message, size: "compact" });
    html += '<div class="scan-result-details"><p><b>' + escapeHtml(decision.student ? decision.student.name : "Identité non confirmée") + '</b>' + (decision.student ? " · " + escapeHtml(decision.student.className) : "") + '</p><p>Portail : ' + escapeHtml(decision.portalId || currentPortalId || "Non reconnu") + '</p><p><b>BACKEND_LATER</b> · événement local uniquement</p></div>';
    resultBox.innerHTML = html;
    resultBox.classList.remove("hidden");
    saveLocalEvent({
      id: "security-event-" + Date.now(),
      type: currentEventType,
      decision: decision.title,
      studentId: decision.studentId || null,
      studentName: decision.student && decision.student.name || null,
      portalId: decision.portalId || currentPortalId || null,
      occurredAt: new Date().toISOString(),
      backendState: "BACKEND_LATER"
    });
    if (input) input.value = "";
    refreshIcons();
  }

  root.SchoolSafeSecurityModule = {
    readLocalEvents: readLocalEvents,
    render: render,
  };
})(window);
