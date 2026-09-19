(function (root) {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function formatDate(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return d.toLocaleString("fr-FR");
  }

  // Mode démo : aucune session réelle (même règle que safe-assistant.js).
  // En démo, l'API Pilotage n'est pas disponible : afficher un état de
  // démonstration explicite au lieu d'une erreur réseau « Failed to fetch ».
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

  function renderDemo(container, title, message) {
    container.innerHTML = window.ssState({ type: "empty", title: title, message: message });
    if (typeof window.icons === "function") window.icons();
  }

  function renderDashboard(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (isDemoMode()) {
      renderDemo(container, "Démonstration", "Le tableau de bord de pilotage s’affiche avec les données réelles de l’établissement après connexion. Aucune donnée en mode démonstration.");
      return;
    }
    container.innerHTML = window.ssState({ type: "loading", title: "Chargement…", message: "Chargement du tableau de bord…" });
    if (!window.SchoolSafePilotageAPI) {
      container.innerHTML = window.ssState({ type: "error", title: "Erreur", message: "API Pilotage non disponible.", retry: { attrs: { "data-pilotage-retry": "" } } });
      attachPilotageRetry(container, function () { renderDashboard(containerId); });
      return;
    }
    window.SchoolSafePilotageAPI.dashboard().then(function (data) {
      var html = '<div class="pilotage-dashboard">';
      html += '<header><span>Tableau de bord</span><h2>' + escapeHtml(data.date || "Aujourd’hui") + '</h2></header>';
      html += '<div class="pilotage-kpis">';
      (data.kpis || []).forEach(function (kpi) {
        html += '<article><small>' + escapeHtml(kpi.code) + '</small><b>' + kpi.value + '</b><span>' + escapeHtml(kpi.unit) + '</span></article>';
      });
      html += '</div>';
      if (data.lockdown_active) {
        html += '<div class="pilotage-lockdown">🔒 Lockdown actif</div>';
      }
      html += '<section class="pilotage-alerts"><h3>Alertes critiques récentes</h3>';
      if (data.latest_alerts && data.latest_alerts.length) {
        html += '<ul>';
        data.latest_alerts.forEach(function (alert) {
          html += '<li><span class="severity ' + escapeHtml(alert.severity) + '">' + escapeHtml(alert.severity) + '</span> ' + escapeHtml(alert.title) + '</li>';
        });
        html += '</ul>';
      } else {
        html += window.ssState({ type: "empty", title: "Aucune alerte", message: "Aucune alerte critique en cours.", size: "compact" });
      }
      html += '</section></div>';
      container.innerHTML = html;
      if (typeof window.icons === "function") window.icons();
    }).catch(function (err) {
      container.innerHTML = window.ssState({ type: "error", title: "Erreur", message: err.message, retry: { attrs: { "data-pilotage-retry": "" } } });
      attachPilotageRetry(container, function () { renderDashboard(containerId); });
    });
  }

  function renderAlerts(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (isDemoMode()) {
      renderDemo(container, "Démonstration", "Les alertes de pilotage s’affichent avec les données réelles de l’établissement après connexion. Aucune donnée en mode démonstration.");
      return;
    }
    container.innerHTML = window.ssState({ type: "loading", title: "Chargement…", message: "Chargement des alertes…" });
    if (!window.SchoolSafePilotageAPI) {
      container.innerHTML = window.ssState({ type: "error", title: "Erreur", message: "API Pilotage non disponible.", retry: { attrs: { "data-pilotage-retry": "" } } });
      attachPilotageRetry(container, function () { renderAlerts(containerId); });
      return;
    }
    window.SchoolSafePilotageAPI.listAlerts({ status: "open" }).then(function (result) {
      var html = '<div class="pilotage-alerts-list"><h3>Alertes ouvertes</h3>';
      if (result.data && result.data.length) {
        html += '<ul>';
        result.data.forEach(function (alert) {
          html += '<li data-alert-id="' + escapeHtml(alert.id) + '">' +
            '<span class="severity ' + escapeHtml(alert.severity) + '">' + escapeHtml(alert.severity) + '</span>' +
            '<b>' + escapeHtml(alert.title) + '</b>' +
            '<small>' + escapeHtml(alert.message || "") + ' · ' + formatDate(alert.detected_at) + '</small>' +
            '<div class="alert-actions">' +
              window.ssButton({ label: "Prendre en charge", variant: "secondary", size: "sm", attrs: { "data-action": "ack" } }) +
              window.ssButton({ label: "Résoudre", variant: "primary", size: "sm", attrs: { "data-action": "resolve" } }) +
            '</div>' +
          '</li>';
        });
        html += '</ul>';
      } else {
        html += window.ssState({ type: "empty", title: "Aucune alerte", message: "Aucune alerte ouverte en cours.", size: "compact" });
      }
      html += '</div>';
      container.innerHTML = html;
      if (typeof window.icons === "function") window.icons();
      bindAlerts(container);
    }).catch(function (err) {
      container.innerHTML = window.ssState({ type: "error", title: "Erreur", message: err.message, retry: { attrs: { "data-pilotage-retry": "" } } });
      attachPilotageRetry(container, function () { renderAlerts(containerId); });
    });
  }

  function bindAlerts(container) {
    container.querySelectorAll("[data-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var li = button.closest("[data-alert-id]");
        var id = li.getAttribute("data-alert-id");
        var action = button.getAttribute("data-action");
        if (!window.SchoolSafePilotageAPI) return;
        var promise = action === "ack"
          ? window.SchoolSafePilotageAPI.acknowledgeAlert(id)
          : window.SchoolSafePilotageAPI.resolveAlert(id, "Traité depuis le tableau de bord");
        promise.then(function () {
          li.remove();
        }).catch(function (err) {
          if (window.ssModal) {
            window.ssModal({
              title: "Erreur",
              content: "<p>" + escapeHtml("Erreur : " + err.message) + "</p>",
              size: "sm",
              actions: [{ label: "OK", variant: "primary" }]
            });
          } else {
            alert("Erreur : " + err.message);
          }
        });
      });
    });
  }

  function attachPilotageRetry(container, callback) {
    var btn = container.querySelector("[data-pilotage-retry]");
    if (btn) btn.addEventListener("click", callback);
    if (typeof window.icons === "function") window.icons();
  }

  root.SchoolSafePilotageModule = {
    renderDashboard: renderDashboard,
    renderAlerts: renderAlerts,
  };
})(window);
