(function (global) {
  "use strict";

  var state = {
    activeView: "class",
    selectedMonth: currentYearMonth(),
    selectedClassId: null,
    rankings: [],
    currentRanking: null,
    stars: [],
    children: [],
    classes: [],
    loading: false,
    error: null,
  };

  var container = null;
  var demoState = null;
  var activeSession = null;

  function currentYearMonth() {
    var now = new Date();
    return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  }

  function escapeMarkup(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function notify(message) {
    if (global.SchoolSafeApp && global.SchoolSafeApp.notify) global.SchoolSafeApp.notify(message);
    else global.dispatchEvent(new CustomEvent("schoolsafe-toast", { detail: { message: message } }));
  }

  function hasValidSessionToken() {
    try {
      var raw = global.sessionStorage.getItem("schoolsafe-v2-session");
      if (!raw) return false;
      var session = JSON.parse(raw);
      return !!(session && (session.native === true || session.token));
    } catch (e) { return false; }
  }

  function isDemoMode() {
    if (hasValidSessionToken()) return false;
    if (global.schoolSafeDemoMode === true) return true;
    var host = String(global.location && global.location.hostname || "").toLowerCase();
    var isLocalhost = host === "localhost" || host === "127.0.0.1";
    return isLocalhost && !hasValidSessionToken();
  }

  // INC-3 : "vue parent" = palmarès à portée own_children, jamais le nom du rôle.
  function isParent(session) {
    return !!(session && allowsScope(session, "palmarques.read", "own_children"));
  }

  function explicitDeny(session, permission) {
    if (global.SchoolSafeAccess && typeof global.SchoolSafeAccess.explicitDeny === "function") return global.SchoolSafeAccess.explicitDeny(session || {}, permission);
    if (Array.isArray(session && session.deniedPermissions) && session.deniedPermissions.indexOf(permission) >= 0) return true;
    return Array.isArray(session && session.permissionExceptions) && session.permissionExceptions.some(function (item) {
      return item && item.permission === permission && String(item.effect || "").toLowerCase() === "deny";
    });
  }

  function hasPermission(session, permission) {
    if (explicitDeny(session, permission)) return false;
    if (global.SchoolSafeAccess && typeof global.SchoolSafeAccess.canAccess === "function") return global.SchoolSafeAccess.canAccess(session || {}, permission);
    return !!(session && Array.isArray(session.permissions) && session.permissions.indexOf(permission) >= 0);
  }

  function scopeFor(session, permission) {
    var scopes = Array.isArray(session && session.scopes) ? session.scopes : [];
    return scopes.find(function (scope) { return scope && scope.permission === permission; }) || null;
  }

  function allowsScope(session, permission, type) {
    var scope = scopeFor(session, permission);
    return hasPermission(session, permission) && !!scope && scope.type === type;
  }

  function canReadClass() {
    return allowsScope(activeSession, "palmarques.read", "assigned_classes") || allowsScope(activeSession, "palmarques.read", "school") || (isParent(activeSession) && allowsScope(activeSession, "palmarques.read", "own_children"));
  }

  function canReadSchool() {
    return allowsScope(activeSession, "palmarques.read", "school");
  }

  function canManage() {
    return allowsScope(activeSession, "palmarques.manage", "school");
  }

  function createDemoState() {
    return {
      activeView: "class",
      selectedMonth: currentYearMonth(),
      selectedClassId: "demo-c1",
      rankings: [
        { id: "demo-r-class", school_id: "demo-school", class_id: "demo-c1", month: currentYearMonth(), status: "preview", computed_at: new Date().toISOString() },
        { id: "demo-r-school", school_id: "demo-school", class_id: null, month: currentYearMonth(), status: "preview", computed_at: new Date().toISOString() },
      ],
      currentRanking: null,
      stars: [{ ranking_id: "demo-r-class", student_id: "demo-s1", parent_profile_id: "demo-parent" }],
      children: [{ students: { id: "demo-s1", first_name: "Lucas", last_name: "Martin", class_id: "demo-c1", classes: { name: "1re A" } } }],
      classes: [{ id: "demo-c1", name: "1re A" }, { id: "demo-c2", name: "2e B" }],
      loading: false,
      error: null,
    };
  }

  function createDemoRankingEntries(rankingId) {
    var entries = [
      { student_id: "demo-s1", first_name: "Lucas", last_name: "Martin", classes: { name: "1re A" }, photo_path: null, rank: 1, monthly_average: 18.5 },
      { student_id: "demo-s2", first_name: "Emma", last_name: "Martin", classes: { name: "1re A" }, photo_path: null, rank: 2, monthly_average: 17.25 },
      { student_id: "demo-s3", first_name: "Ethan", last_name: "Leroy", classes: { name: "1re A" }, photo_path: null, rank: 3, monthly_average: 16 },
      { student_id: "demo-s4", first_name: "Chloé", last_name: "Bernard", classes: { name: "1re A" }, photo_path: null, rank: 4, monthly_average: 14 },
    ];
    return entries.map(function (e) {
      return {
        id: "demo-entry-" + e.student_id,
        ranking_id: rankingId,
        student_id: e.student_id,
        rank: e.rank,
        monthly_average: e.monthly_average,
        students: e,
      };
    });
  }

  async function init(parentContainer, session) {
    container = parentContainer;
    activeSession = session || {};
    demoState = isDemoMode() ? createDemoState() : null;
    if (demoState) {
      Object.assign(state, demoState);
      state.selectedClassId = session && isParent(session) ? "demo-c1" : state.selectedClassId;
      await loadCurrentRanking();
      render();
      return;
    }

    state.loading = true;
    render();
    try {
      state.classes = await global.SchoolSafePedagogyAPI.listClasses();
      if (session && isParent(session)) {
        state.children = await global.SchoolSafePedagogyAPI.getParentChildren();
        if (state.children.length > 0) {
          state.selectedClassId = state.children[0].students.class_id;
        }
      } else if (state.classes.length > 0) {
        state.selectedClassId = state.classes[0].id;
      }
      await loadRankingsList();
      await loadCurrentRanking();
    } catch (e) {
      state.error = e.message || "Erreur de chargement";
      notify(state.error);
    }
    state.loading = false;
    render();
  }

  async function loadRankingsList() {
    if (state.activeView === "school" && !canReadSchool()) state.activeView = "class";
    var options = { month: state.selectedMonth };
    if (state.activeView === "class" && state.selectedClassId) options.class_id = state.selectedClassId;
    if (state.activeView === "school") options.class_id = "null";
    state.rankings = await global.SchoolSafePalmaresAPI.listRankings(options);
  }

  async function loadCurrentRanking() {
    var ranking = state.rankings.find(function (r) {
      if (state.activeView === "school") return r.class_id === null;
      return r.class_id === state.selectedClassId;
    });
    if (!ranking) {
      state.currentRanking = null;
      state.stars = [];
      return;
    }
    if (demoState) {
      state.currentRanking = {
        id: ranking.id,
        school_id: ranking.school_id,
        class_id: ranking.class_id,
        month: ranking.month,
        status: ranking.status,
        computed_at: ranking.computed_at,
        published_at: ranking.published_at,
        computed_by_profile_id: ranking.computed_by_profile_id,
        entries: createDemoRankingEntries(ranking.id),
      };
      state.stars = demoState.stars;
      return;
    }
    state.currentRanking = await global.SchoolSafePalmaresAPI.getRanking(ranking.id);
    state.stars = await global.SchoolSafePalmaresAPI.listStars(ranking.id);
  }

  async function computeRanking() {
    if (!canManage()) return;
    state.loading = true;
    render();
    try {
      await global.SchoolSafePalmaresAPI.computeRanking(state.selectedMonth, state.activeView === "school" ? undefined : state.selectedClassId);
      notify("Palmarès calculé.");
      await loadRankingsList();
      await loadCurrentRanking();
    } catch (e) {
      notify(e.message || "Erreur de calcul");
    }
    state.loading = false;
    render();
  }

  async function publishRanking() {
    if (!state.currentRanking || !canManage()) return;
    state.loading = true;
    render();
    try {
      await global.SchoolSafePalmaresAPI.publishRanking(state.currentRanking.id);
      notify("Palmarès publié.");
      await loadRankingsList();
      await loadCurrentRanking();
    } catch (e) {
      notify(e.message || "Erreur de publication");
    }
    state.loading = false;
    render();
  }

  async function toggleStar(studentId) {
    if (!state.currentRanking) return;
    var session = activeSession;
    if (!session || !isParent(session)) return;
    if (!allowsScope(session, "palmarques.read", "own_children") || !isParentChild(studentId)) return;
    var existing = state.stars.find(function (s) { return s.student_id === studentId; });
    try {
      if (existing) {
        await global.SchoolSafePalmaresAPI.removeStar(state.currentRanking.id, studentId);
        notify("Étoile retirée.");
      } else {
        await global.SchoolSafePalmaresAPI.addStar(state.currentRanking.id, studentId);
        notify("⭐ Élève encouragé !");
      }
      state.stars = await global.SchoolSafePalmaresAPI.listStars(state.currentRanking.id);
      render();
    } catch (e) {
      notify(e.message || "Erreur");
    }
  }

  function studentPhotoUrl(student) {
    if (!student) return "./schoolsafe-logo.png";
    if (student.photo_path) return student.photo_path;
    return "./schoolsafe-logo.png";
  }

  function starCount(studentId) {
    return state.stars.filter(function (s) { return s.student_id === studentId; }).length;
  }

  function hasStarred(studentId) {
    var session = activeSession;
    if (!session) return false;
    var profileId = session.profile && session.profile.id;
    return state.stars.some(function (s) { return s.student_id === studentId && s.parent_profile_id === profileId; });
  }

  function render() {
    if (!container) return;
    var session = activeSession;
    var isParentUser = session && isParent(session);
    var html = '<div class="palmares-module">';
    if (!canReadClass()) {
      container.innerHTML = global.ssState({ type: "denied", title: "Palmarès non autorisé", message: "palmarques.read avec une portée compatible est requis. Le DENY explicite reste prioritaire." });
      return;
    }
    html += renderHeader(isParentUser);
    html += renderControls(isParentUser);
    if (state.loading) html += global.ssState({ type: "loading", title: "Chargement du palmarès", message: "Veuillez patienter pendant le chargement des classements." });
    else if (state.error) html += global.ssState({ type: "error", title: "Erreur", message: state.error, retry: { attrs: { id: "retryPalmares" } } });
    else if (!state.currentRanking) html += renderEmpty();
    else html += renderRanking();
    html += "</div>";
    container.innerHTML = html;
    bindEvents();
  }

  function renderHeader(isParentUser) {
    return '<div class="palmares-header"><h2><i data-lucide="trophy"></i> Palmarès</h2><p>' + (isParentUser ? "Position de l’enfant lié uniquement ; aucun autre élève détaillé" : "Vue classe, vue école, podium et Top 10 selon la portée accordée") + '</p><aside class="palmares-draft-badge"><strong>CALCUL_BACKEND_LATER</strong> · aperçu de démonstration non officiel · Aucune formule officielle n\'est exécutée dans le frontend.</aside></div>';
  }

  function renderControls(isParentUser) {
    var html = '<div class="palmares-controls">';
    html += '<label>Mois <input type="month" id="palmaresMonth" value="' + escapeMarkup(state.selectedMonth) + '"></label>';
    html += '<div class="palmares-view-toggle">' +
      '<button type="button" data-view="class" class="' + (state.activeView === "class" ? "active" : "") + '">Par classe</button>' +
      (canReadSchool() ? '<button type="button" data-view="school" class="' + (state.activeView === "school" ? "active" : "") + '">Toute l’école</button>' : '') +
      '</div>';
    if (!isParentUser && state.activeView === "class") {
      html += '<label>Classe <select id="palmaresClass">';
      state.classes.forEach(function (c) {
        html += '<option value="' + escapeMarkup(c.id) + '"' + (c.id === state.selectedClassId ? " selected" : "") + '>' + escapeMarkup(c.name) + '</option>';
      });
      html += '</select></label>';
    }
    if (!isParentUser && canManage()) {
      html += global.ssButton({ label: "Calculer", variant: "primary", className: "small", attrs: { id: "palmaresCompute" } });
      if (state.currentRanking && state.currentRanking.status === "draft") {
        html += global.ssButton({ label: "Publier", variant: "primary", className: "small", attrs: { id: "palmaresPublish" } });
      }
    }
    html += "</div>";
    return html;
  }

  function renderEmpty() {
    return global.ssState({
      type: "empty",
      title: "Aucun palmarès",
      message: "Aucun palmarès n'a été calculé pour ce mois.",
      action: canManage() ? { label: "Calculer le palmarès", variant: "primary", attrs: { id: "palmaresComputeEmpty" } } : undefined
    });
  }

  function renderRanking() {
    var entries = (state.currentRanking.entries || []).slice(0, 10);
    if (isParent(activeSession)) entries = entries.filter(function (entry) { return isParentChild(entry.student_id); });
    var html = '<div class="palmares-ranking">';
    html += '<div class="palmares-draft-badge">' + (demoState ? "APERÇU LOCAL · NON OFFICIEL" : escapeMarkup(state.currentRanking.status || "ÉTAT À CONFIRMER")) + '</div>';
    html += '<div class="palmares-podium">';
    entries.slice(0, 3).forEach(function (entry, index) {
      html += renderPodiumCard(entry, index);
    });
    html += '</div>';
    if (entries.length > 3) {
      html += '<ol class="palmares-list" start="4">';
      entries.slice(3).forEach(function (entry) {
        html += renderListItem(entry);
      });
      html += '</ol>';
    }
    html += '<aside class="palmares-draft-badge">Critères futurs : résultats validés · progression · effort / régularité · mentions / distinctions BACKEND_LATER.</aside>';
    html += '</div>';
    return html;
  }

  function renderPodiumCard(entry, index) {
    var medal = ["🥇", "🥈", "🥉"][index];
    var student = entry.students;
    var stars = starCount(entry.student_id);
    var starred = hasStarred(entry.student_id);
    return '<div class="palmares-card podium rank-' + (index + 1) + '">' +
      '<div class="palmares-medal">' + medal + '</div>' +
      '<img class="palmares-photo" src="' + escapeMarkup(studentPhotoUrl(student)) + '" alt="">' +
      '<div class="palmares-name">' + escapeMarkup(student.first_name + " " + student.last_name) + '</div>' +
      '<div class="palmares-class">' + escapeMarkup(student.classes && student.classes.name ? student.classes.name : "") + '</div>' +
      '<div class="palmares-average">' + entry.monthly_average + '/20</div>' +
      '<div class="palmares-stars">⭐ ' + stars + '</div>' +
      renderStarButton(entry.student_id, starred) +
      '</div>';
  }

  function renderListItem(entry) {
    var student = entry.students;
    var stars = starCount(entry.student_id);
    var starred = hasStarred(entry.student_id);
    return '<li class="palmares-list-item">' +
      '<span class="palmares-rank">' + entry.rank + '</span>' +
      '<img class="palmares-photo small" src="' + escapeMarkup(studentPhotoUrl(student)) + '" alt="">' +
      '<span class="palmares-name">' + escapeMarkup(student.first_name + " " + student.last_name) + '</span>' +
      '<span class="palmares-class">' + escapeMarkup(student.classes && student.classes.name ? student.classes.name : "") + '</span>' +
      '<span class="palmares-average">' + entry.monthly_average + '/20</span>' +
      '<span class="palmares-stars">⭐ ' + stars + '</span>' +
      renderStarButton(entry.student_id, starred) +
      '</li>';
  }

  function isParentChild(studentId) {
    if (!state.children || !state.children.length) return false;
    return state.children.some(function (child) {
      return child && child.students && child.students.id === studentId;
    });
  }

  function renderStarButton(studentId, starred) {
    var session = activeSession;
    if (!session || !Array.isArray(session.roles) || session.roles.indexOf("parent") < 0) return '';
    if (!allowsScope(session, "palmarques.read", "own_children")) return '';
    if (!isParentChild(studentId)) return '';
    return '<button type="button" class="palmares-star-btn' + (starred ? " starred" : "") + '" data-star-student="' + escapeMarkup(studentId) + '">' +
      (starred ? "⭐ Retirer" : "⭐ Encourager") +
      '</button>';
  }

  function bindEvents() {
    var monthInput = container.querySelector("#palmaresMonth");
    if (monthInput) monthInput.addEventListener("change", function (e) { state.selectedMonth = e.target.value; loadRankingsList().then(loadCurrentRanking).then(render); });

    container.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.addEventListener("click", function () { state.activeView = btn.getAttribute("data-view"); loadRankingsList().then(loadCurrentRanking).then(render); });
    });

    var classSelect = container.querySelector("#palmaresClass");
    if (classSelect) classSelect.addEventListener("change", function (e) { state.selectedClassId = e.target.value; loadRankingsList().then(loadCurrentRanking).then(render); });

    var computeBtn = container.querySelector("#palmaresCompute");
    if (computeBtn) computeBtn.addEventListener("click", computeRanking);
    var computeEmptyBtn = container.querySelector("#palmaresComputeEmpty");
    if (computeEmptyBtn) computeEmptyBtn.addEventListener("click", computeRanking);
    var retryBtn = container.querySelector("#retryPalmares");
    if (retryBtn) retryBtn.addEventListener("click", function () { init(container, activeSession); });

    var publishBtn = container.querySelector("#palmaresPublish");
    if (publishBtn) publishBtn.addEventListener("click", publishRanking);

    container.querySelectorAll("[data-star-student]").forEach(function (btn) {
      btn.addEventListener("click", function () { toggleStar(btn.getAttribute("data-star-student")); });
    });

    if (global.lucide && global.lucide.createIcons) {
      try { global.lucide.createIcons(); } catch (e) {}
    }
  }

  global.renderPalmaresModule = function (parentContainer, session) {
    return init(parentContainer, session);
  };

  global.refreshPalmaresModule = function () {
    if (container) render();
  };
})(window);
