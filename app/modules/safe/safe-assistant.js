(function (global) {
  "use strict";

  var DEFAULT_ANIMATION = "Idle";
  var POSITION_STORAGE_KEY = "schoolsafe-v2-jaspe-position";
  var VIEWPORT_MARGIN = 12;
  var BUBBLE_GAP = 12;
  var DRAG_THRESHOLD = 5;
  var DISCREET_STORAGE_KEY = "schoolsafe-v2-jaspe-discreet";

  // Branche de navigation associée à chaque entrée FAQ qui pointe vers une
  // fonctionnalité (null = sujet général, toujours disponible).
  var faq = [
    { keywords: ["ajouter", "élève"], question: "Comment ajouter un élève ?", answer: "Va dans Élèves, clique sur « + Ajouter », remplis les informations puis enregistre.", animation: "TalkHandsOpen", branch: "school" },
    { keywords: ["présence", "appel"], question: "Comment faire l’appel ?", answer: "Va dans Présences, choisis ta classe et la date, marque les absents/retards, puis valide.", animation: "TalkHandsOpen", branch: "pedagogy" },
    { keywords: ["paiement", "caisse"], question: "Comment enregistrer un paiement ?", answer: "Dans Caisse, clique « + Nouveau paiement », choisis l’élève, le type de frais et le montant.", animation: "TalkHandsOpen", branch: "finance" },
    { keywords: ["rapport"], question: "Comment générer un rapport ?", answer: "Va dans Rapports, choisis le type et la période, puis clique « Générer ».", animation: "TalkHandsOpen", branch: "reports" },
    { keywords: ["palmarès", "classement"], question: "C’est quoi le Palmarès ?", answer: "Le Palmarès montre le Top 10 de chaque classe et de toute l’école, basé sur les cotes publiées du mois.", animation: "TalkPassionately", branch: "pedagogy" },
  ];

  // Suggestions par défaut, chacune rattachée à sa branche de navigation.
  var DEFAULT_SUGGESTIONS = [
    { text: "Comment ajouter un élève ?", branch: "school" },
    { text: "Comment faire l’appel ?", branch: "pedagogy" },
    { text: "Comment enregistrer un paiement ?", branch: "finance" },
  ];

  var onboardingSteps = [
    { animation: "Wave", message: "Bonjour ! Je suis Jaspe, ton assistante SchoolSafe. Je te fais découvrir l’application en 2 minutes ?" },
    { animation: "TalkHandsOpen", message: "Le menu à gauche te donne accès à toutes les fonctions : élèves, classes, présences, caisse, rapports…" },
    { animation: "TalkPassionately", message: "Tu connais les bases ! Clique sur moi quand tu as une question. 🎉" },
  ];

  // Session réelle = cookie natif ou ancien token (contexte exposé par app.js,
  // sinon sessionStorage pendant la restauration asynchrone).
  // Sans session : mode démo, comportement historique inchangé.
  function sessionUser() {
    var live = global.currentSession;
    if (live && (live.native === true || live.token)) return live;
    try {
      var raw = global.sessionStorage && global.sessionStorage.getItem("schoolsafe-v2-session");
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && (saved.native === true || saved.token)) return saved;
      }
    } catch (e) { /* session illisible : traiter comme démo */ }
    return null;
  }

  function assistantUser() {
    var live = sessionUser();
    if (live) return live;
    if (global.document && global.document.body && global.document.body.classList.contains("screen-workspace") && global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getCurrentUser === "function") {
      return global.SchoolSafeAppContext.getCurrentUser();
    }
    return null;
  }

  // En session réelle, Jaspe exige la permission safe.assistant.use (DENY par défaut).
  function isAllowed(userOverride) {
    var user = userOverride || assistantUser();
    if (!user) return true;
    var access = global.SchoolSafeAccess;
    if (!access || typeof access.allowsScope !== "function") return false;
    return access.allowsScope(user, "safe.assistant.use", "own");
  }

  // En session réelle, une branche n’est proposée que si elle est visible pour l’utilisateur.
  function branchVisible(branchKey) {
    if (!branchKey) return true;
    var user = assistantUser();
    if (!user) return true;
    var access = global.SchoolSafeAccess;
    if (!access || typeof access.isBranchVisible !== "function") return false;
    return access.isBranchVisible(user, branchKey);
  }

  function defaultSuggestions() {
    return DEFAULT_SUGGESTIONS.filter(function (s) { return branchVisible(s.branch); })
      .map(function (s) { return s.text; });
  }

  var state = {
    open: false,
    minimized: false,
    userHidden: false,
    animation: DEFAULT_ANIMATION,
    currentMessage: "",
    suggestions: defaultSuggestions(),
    onboardingIndex: -1,
    inputDraft: "",
    lastTopic: "",
    discreet: readDiscreetPreference(),
  };

  
  var container = null;
  var floatingPosition = null;
  var customPosition = false;
  var layoutFrame = 0;
  var viewportListenersBound = false;
  var suppressAvatarClickUntil = 0;
  var initialized = false;
  var currentSurface = "";
  var dashboardVisible = true;
  var authGreetingStarted = false;
  var authGreetingCompleted = false;
  var authGreetingTimers = [];
  var authInputMode = false;
  var authFocusListenerBound = false;
  var conversationOwner = null;
  var conversationRevision = 0;
  var embeddedPresentation = false;

  function readDiscreetPreference() {
    try { return global.localStorage.getItem(DISCREET_STORAGE_KEY) === "1"; } catch (e) { return false; }
  }

  function syncConversationOwner() {
    var user = assistantUser() || {};
    var owner = [currentSurface, user.token || "", user.userId || "", user.profileId || (user.profile && user.profile.id) || "", user.schoolId || "", user.role || ""].join("|");
    if (owner === conversationOwner) return;
    conversationOwner = owner;
    conversationRevision += 1;
    if (container) container.innerHTML = "";
    state.currentMessage = "";
    state.inputDraft = "";
    state.lastTopic = "";
    state.animation = "Idle";
    state.open = false;
    state.suggestions = defaultSuggestions();
  }

  function greetIfNeeded() {
    if (state.currentMessage) { state.animation = "Idle"; return; }
    var greeting = new Date().getHours() >= 18 ? "Bonsoir" : "Bonjour";
    state.currentMessage = greeting + " ! Je suis Jaspe, ton assistante SchoolSafe. Par quoi souhaites-tu commencer ?";
    state.animation = "Wave";
    state.suggestions = defaultSuggestions();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    listenToAppEvents();
    listenToLaunchers();
    listenToEscape();
    listenToViewport();
    listenToAuthFocus();
    setSurface(detectSurface());
  }

  function detectSurface() {
    var names = ["splash", "auth", "setup", "workspace"];
    for (var index = 0; index < names.length; index += 1) {
      var name = names[index];
      if (document.body.classList.contains("screen-" + name)) return name;
      var screen = document.getElementById(name);
      if (screen && screen.classList.contains("active")) return name;
    }
    return "splash";
  }

  function surfaceSupportsJaspe(name) {
    return name === "auth" || name === "workspace";
  }

  function ensureContainer() {
    if (container) return container;
    container = document.createElement("div");
    container.className = "safe-assistant";
    container.setAttribute("aria-label", "Assistant Jaspe");
    document.body.appendChild(container);
    return container;
  }

  function clearAuthGreetingTimers() {
    authGreetingTimers.forEach(function (timer) { global.clearTimeout(timer); });
    authGreetingTimers = [];
    if (authGreetingStarted && !authGreetingCompleted) authGreetingStarted = false;
    if (container) container.classList.remove("is-auth-entering");
  }

  function removeVisualSurface(destroyRuntime) {
    clearAuthGreetingTimers();
    if (container) {
      container.remove();
      container = null;
    }
    if (destroyRuntime) {
      // JASPE 2.5D ne conserve aucun runtime visuel après démontage.
    }
  }

  function setSurface(name) {
    var nextSurface = name || detectSurface();
    if (nextSurface !== currentSurface) {
      clearAuthGreetingTimers();
      setAuthInputMode(false);
      currentSurface = nextSurface;
      floatingPosition = currentSurface === "workspace" ? readStoredPosition() : null;
      customPosition = !!floatingPosition;
      if (currentSurface === "auth") {
        dashboardVisible = true;
        state.minimized = false;
        state.userHidden = false;
      }
    }
    syncConversationOwner();
    if (!surfaceSupportsJaspe(currentSurface)) {
      removeVisualSurface(true);
      notifyHistoryListeners();
      return false;
    }
    if (!isAllowed()) {
      removeVisualSurface(true);
      notifyHistoryListeners();
      return false;
    }
    ensureContainer();
    container.hidden = false;
    container.dataset.surface = currentSurface;
    container.classList.toggle("is-auth-suspended", currentSurface === "auth" && authInputMode);
    if (currentSurface !== "auth") {
      clearAuthGreetingTimers();
      state.open = false;
      state.onboardingIndex = -1;
      state.animation = "Idle";
    }
    render();
    return true;
  }

  function readStoredPosition() {
    try {
      var parsed = JSON.parse(global.localStorage.getItem(POSITION_STORAGE_KEY) || "null");
      if (parsed && Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) {
        return { left: parsed.left, top: parsed.top };
      }
    } catch (e) { /* stockage indisponible ou valeur obsolète */ }
    return null;
  }

  function storePosition() {
    if (!floatingPosition || currentSurface !== "workspace") return;
    try {
      global.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify({
        left: Math.round(floatingPosition.left * 100) / 100,
        top: Math.round(floatingPosition.top * 100) / 100,
      }));
    } catch (e) { /* Jaspe reste déplaçable sans stockage persistant */ }
  }

  function clearStoredPosition() {
    if (currentSurface === "workspace") {
      try { global.localStorage.removeItem(POSITION_STORAGE_KEY); } catch (e) { /* reset visuel sans stockage */ }
    }
    customPosition = false;
    floatingPosition = null;
    scheduleLayout(false);
  }

  function visibleBottomLimit() {
    var viewport = global.visualViewport;
    var limit = (viewport ? viewport.offsetTop + viewport.height : global.innerHeight) - VIEWPORT_MARGIN;
    var bottomNav = document.querySelector(".ss-bottom-nav");
    if (!bottomNav) return limit;
    var style = global.getComputedStyle ? global.getComputedStyle(bottomNav) : null;
    var rect = bottomNav.getBoundingClientRect();
    var visible = (!style || (style.display !== "none" && style.visibility !== "hidden")) && rect.height > 0 && rect.top < global.innerHeight;
    return visible ? Math.min(limit, rect.top - VIEWPORT_MARGIN) : limit;
  }

  function clampPosition(left, top) {
    var visual = container && (container.querySelector(".safe-avatar") || container.querySelector(".safe-companion-toggle"));
    var width = visual ? visual.offsetWidth : 0;
    var height = visual ? visual.offsetHeight : 0;
    var maxLeft = Math.max(VIEWPORT_MARGIN, global.innerWidth - VIEWPORT_MARGIN - width);
    var maxTop = Math.max(VIEWPORT_MARGIN, visibleBottomLimit() - height);
    return {
      left: Math.min(maxLeft, Math.max(VIEWPORT_MARGIN, Number(left) || 0)),
      top: Math.min(maxTop, Math.max(VIEWPORT_MARGIN, Number(top) || 0)),
    };
  }

  function defaultPosition() {
    if (state.userHidden) return clampPosition(global.innerWidth, visibleBottomLimit());
    var selector = currentSurface === "auth"
      ? "#authJaspeAnchor"
      : (dashboardVisible ? ".dashboard-hero:not([hidden]) .hero-jaspe-anchor" : "");
    var anchors = selector ? document.querySelectorAll(selector) : [];
    var avatar = container && container.querySelector(".safe-avatar");
    for (var index = 0; index < anchors.length; index += 1) {
      var rect = anchors[index].getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      return clampPosition(
        rect.left + (rect.width - (avatar ? avatar.offsetWidth : 0)) / 2,
        rect.top + (rect.height - (avatar ? avatar.offsetHeight : 0)) / 2
      );
    }
    return clampPosition(global.innerWidth, visibleBottomLimit());
  }

  function applyFloatingPosition(left, top, persist, rememberPosition) {
    if (!container || !(container.querySelector(".safe-avatar") || container.querySelector(".safe-companion-toggle"))) return;
    var nextPosition = clampPosition(left, top);
    if (rememberPosition !== false) floatingPosition = nextPosition;
    container.style.left = nextPosition.left + "px";
    container.style.top = nextPosition.top + "px";
    container.dataset.positioned = "true";
    if (persist && rememberPosition !== false) storePosition();
    layoutBubble();
  }

  function layoutBubble() {
    if (!container) return;
    var avatar = container.querySelector(".safe-avatar");
    var bubble = container.querySelector(".safe-bubble");
    if (!avatar || !bubble) return;

    var avatarRect = avatar.getBoundingClientRect();
    var bubbleWidth = bubble.offsetWidth;
    var bubbleHeight = bubble.offsetHeight;
    var usableBottom = visibleBottomLimit();
    var usableTop = (global.visualViewport ? global.visualViewport.offsetTop : 0) + VIEWPORT_MARGIN;
    bubble.style.maxHeight = Math.max(80, usableBottom - usableTop) + "px";
    bubbleHeight = bubble.offsetHeight;
    var leftSpace = avatarRect.left - VIEWPORT_MARGIN;
    var rightSpace = global.innerWidth - VIEWPORT_MARGIN - avatarRect.right;
    var topSpace = avatarRect.top - usableTop;
    // La bulle de dialogue se place AU-DESSUS de la tête de Jaspe par défaut ;
    // repli latéral uniquement si l'espace au-dessus est insuffisant.
    var placement = topSpace >= bubbleHeight + BUBBLE_GAP
      ? "top"
      : (leftSpace >= rightSpace ? "left" : "right");
    var left;
    var top;

    if (placement === "left") {
      left = avatarRect.left - bubbleWidth - BUBBLE_GAP;
      top = avatarRect.top + (avatarRect.height - bubbleHeight) / 2;
    } else if (placement === "right") {
      left = avatarRect.right + BUBBLE_GAP;
      top = avatarRect.top + (avatarRect.height - bubbleHeight) / 2;
    } else {
      left = avatarRect.left + (avatarRect.width - bubbleWidth) / 2;
      top = avatarRect.top - bubbleHeight - BUBBLE_GAP;
    }

    var maxBubbleLeft = Math.max(VIEWPORT_MARGIN, global.innerWidth - VIEWPORT_MARGIN - bubbleWidth);
    var maxBubbleTop = Math.max(VIEWPORT_MARGIN, usableBottom - bubbleHeight);
    left = Math.min(maxBubbleLeft, Math.max(VIEWPORT_MARGIN, left));
    top = Math.min(maxBubbleTop, Math.max(usableTop, top));
    bubble.style.left = left + "px";
    bubble.style.top = top + "px";
    bubble.classList.remove("safe-bubble--left", "safe-bubble--right", "safe-bubble--top");
    bubble.classList.add("safe-bubble--" + placement);
    bubble.dataset.placement = placement;
  }

  function scheduleLayout(persistClamp) {
    if (!container) return;
    if (layoutFrame && typeof global.cancelAnimationFrame === "function") global.cancelAnimationFrame(layoutFrame);
    var run = function () {
      layoutFrame = 0;
      var mayUseCustomPosition = currentSurface === "workspace" && !state.userHidden && customPosition && floatingPosition;
      var target = mayUseCustomPosition ? floatingPosition : defaultPosition();
      var transientDock = currentSurface === "workspace" && !dashboardVisible && !mayUseCustomPosition;
      applyFloatingPosition(target.left, target.top, !!persistClamp && customPosition && !state.userHidden, !transientDock && !state.userHidden);
    };
    layoutFrame = typeof global.requestAnimationFrame === "function" ? global.requestAnimationFrame(run) : global.setTimeout(run, 0);
  }

  function listenToViewport() {
    if (viewportListenersBound || !global.addEventListener) return;
    viewportListenersBound = true;
    var recalculate = function () { scheduleLayout(true); };
    global.addEventListener("resize", recalculate, { passive: true });
    global.addEventListener("orientationchange", recalculate, { passive: true });
    if (global.visualViewport) {
      global.visualViewport.addEventListener("resize", recalculate, { passive: true });
      global.visualViewport.addEventListener("scroll", recalculate, { passive: true });
    }
  }

  function refreshAccess() {
    conversationOwner = null;
    if (!initialized) init();
    syncConversationOwner();
    if (!surfaceSupportsJaspe(currentSurface || detectSurface())) {
      removeVisualSurface(true);
      return false;
    }
    if (!isAllowed()) {
      removeVisualSurface(true);
      notifyHistoryListeners();
      return false;
    }
    return setSurface(currentSurface || detectSurface());
  }

  function hasCompletedOnboarding() {
    try { return localStorage.getItem("safe_onboarding_done") === "1"; } catch (e) { return true; }
  }

  function markOnboardingDone() {
    try { localStorage.setItem("safe_onboarding_done", "1"); } catch (e) {}
  }

  function maybeStartOnboarding() {
    if (hasCompletedOnboarding()) return;
    // L'onboarding démarre uniquement dans l'espace de travail : l'utilisateur est alors authentifié
    if (!document.body.classList.contains("screen-workspace")) return;
    state.onboardingIndex = 0;
    state.open = true;
    showOnboardingStep();
  }

  function showOnboardingStep() {
    var step = onboardingSteps[state.onboardingIndex];
    if (!step) {
      state.onboardingIndex = -1;
      state.currentMessage = "Tu peux me poser tes questions quand tu veux !";
      state.animation = "Idle";
      render();
      return;
    }
    state.animation = step.animation;
    state.currentMessage = step.message;
    state.suggestions = state.onboardingIndex < onboardingSteps.length - 1
      ? ["Continuer", "Plus tard"]
      : ["Terminer"];
    render();
  }

  function escape(text) {
    return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Seule la réponse en cours est conservée en mémoire, jamais de journal de chat.
  // Miroir dashboard : sections chat fixes (desktop + mobile) synchronisées
  // depuis l'état de la conversation Jaspe, sans duplication de logique.
  function mirrorDashboardChats() {
    var mirrors = document.querySelectorAll("[data-jaspe-chat]");
    for (var index = 0; index < mirrors.length; index += 1) {
      var output = mirrors[index].querySelector("[data-jaspe-chat-log]");
      var input = mirrors[index].querySelector("input[data-jaspe-chat-input]");
      if (!output) continue;
      var html = "";
      if (state.currentMessage) {
        html += '<p class="safe-history-line safe-history-line--jaspe"><b>Jaspe</b> ' + escape(state.currentMessage) + '</p>';
      } else {
        html += '<p class="safe-chat-empty">Écrivez ou parlez à Jaspe. Sa réponse apparaît ici.</p>';
      }
      output.innerHTML = html;
      output.scrollTop = output.scrollHeight;
      if (input && input.dataset.bound !== "true") {
        input.dataset.bound = "true";
        input.addEventListener("keydown", function (event) {
          if (event.key !== "Enter") return;
          var value = event.target.value;
          if (!value.trim()) return;
          event.target.value = "";
          if (global.SafeAssistant && typeof global.SafeAssistant.openWithQuery === "function") {
            global.SafeAssistant.openWithQuery(value);
          }
        });
      }
      var sendBtn = mirrors[index].querySelector("[data-jaspe-chat-send]");
      if (sendBtn && sendBtn.dataset.bound !== "true") {
        sendBtn.dataset.bound = "true";
        sendBtn.addEventListener("click", function (event) {
          var mirror = event.currentTarget.closest("[data-jaspe-chat]");
          var field = mirror && mirror.querySelector("input[data-jaspe-chat-input]");
          if (!field) return;
          var value = field.value;
          if (!value.trim()) return;
          field.value = "";
          if (global.SafeAssistant && typeof global.SafeAssistant.openWithQuery === "function") {
            global.SafeAssistant.openWithQuery(value);
          }
        });
      }
    }
  }

  function render() {
    if (!container || !surfaceSupportsJaspe(currentSurface)) return;
    if (!isAllowed()) { // session devenue réelle sans safe.assistant.use : masquer Jaspe
      container.innerHTML = "";
      container.hidden = true;
      notifyHistoryListeners();
      return;
    }
    if (embeddedPresentation) {
      container.hidden = true;
      mirrorDashboardChats();
      notifyHistoryListeners();
      return;
    }
    var previousInput = container.querySelector("#safeInput");
    var hadInputFocus = previousInput && document.activeElement === previousInput;
    var selection = hadInputFocus ? [previousInput.selectionStart, previousInput.selectionEnd] : null;
    if (previousInput) state.inputDraft = previousInput.value;
    container.hidden = false;
    container.classList.toggle("is-discreet", state.discreet);
    container.classList.toggle("is-user-hidden", currentSurface === "workspace" && state.userHidden);
    var html = "";
    if (state.open && !state.userHidden) {
      html += '<div class="safe-bubble" id="safeJaspeBubble" role="dialog" aria-label="Dialogue Jaspe">';
      html += '<div class="safe-bubble-header"><strong>Jaspe</strong><span class="safe-bubble-tools"><button class="safe-position-reset" type="button" aria-label="Réinitialiser la position de Jaspe" title="Réinitialiser la position de Jaspe">↺</button><button class="safe-bubble-close" aria-label="Fermer">✕</button></span></div>';
      html += '<div class="safe-bubble-body" role="log" aria-live="polite">';
      html += '<p role="status" aria-live="polite">' + escape(state.currentMessage) + '</p>';
      if (state.suggestions.length) {
        html += '<div class="safe-suggestions">';
        state.suggestions.forEach(function (s) {
          html += '<button type="button" data-suggestion="' + escape(s) + '">' + escape(s) + '</button>';
        });
        html += '</div>';
      }
      html += '</div><div class="safe-bubble-footer"><button class="safe-discreet-toggle" type="button" aria-pressed="' + state.discreet + '">Mode discret</button>';
      html += '<div class="safe-input-row"><input type="text" id="safeInput" aria-label="Ta question à Jaspe" autocomplete="off" placeholder="Pose ta question…"><button type="button" id="safeSend">Envoyer</button></div>';
      html += '</div></div>';
    }
    if (!state.userHidden) {
      html += '<div class="safe-avatar' + (state.minimized ? " safe-minimized" : "") + '" role="button" tabindex="0" aria-label="' + (state.open ? "Fermer Jaspe" : "Ouvrir Jaspe") + '" aria-expanded="' + (state.open ? "true" : "false") + '" aria-controls="safeJaspeBubble">';
      html += '<div class="safe-avatar-stage" aria-hidden="true"></div>';
      html += '</div>';
    }
    if (currentSurface === "workspace") {
      html += '<button class="safe-companion-toggle" type="button" aria-label="' + (state.userHidden ? "Afficher Jaspe" : "Masquer Jaspe") + '" title="' + (state.userHidden ? "Afficher Jaspe" : "Masquer Jaspe") + '"><span aria-hidden="true">' + (state.userHidden ? "✦" : "✕") + '</span></button>';
    }
    container.innerHTML = html;
    var nextInput = container.querySelector("#safeInput");
    if (nextInput) {
      nextInput.value = state.inputDraft;
      if (hadInputFocus) {
        nextInput.focus({ preventScroll: true });
        if (selection) nextInput.setSelectionRange(selection[0], selection[1]);
      }
    }
    bindEvents();
    mountJaspe2D();
    mirrorDashboardChats();
    notifyHistoryListeners();
    scheduleLayout(false);
  }

  function mountJaspe2D() {
    var stage = container && container.querySelector(".safe-avatar-stage");
    if (!stage) return;
    stage.classList.remove("is-loading");
    stage.classList.add("is-ready");
    // JASPE 2.5D : personnage réel (asset attente-v13), repli libellé si l'image manque.
    var visual = document.createElement("img");
    visual.src = "./assets/jaspe2d/attente-v13/adossee-detouree.png";
    visual.alt = "";
    visual.className = "safe-avatar-visual";
    visual.draggable = false;
    visual.addEventListener("error", function () {
      stage.innerHTML = '<span class="safe-avatar-fallback-label">Jaspe</span>';
      if (container) container.classList.add("has-avatar-fallback");
    });
    stage.innerHTML = "";
    stage.appendChild(visual);
    if (container) container.classList.remove("has-avatar-fallback");
    if (currentSurface === "auth") startAuthGreeting();
    else playVisual(state.animation, { once: state.animation !== "Idle" && state.animation !== "Listening" });
  }

  function startAuthGreeting() {
    if (authGreetingStarted || authGreetingCompleted || currentSurface !== "auth") return;
    authGreetingStarted = true;
    var diagnostics = null;
    if (state.discreet || (diagnostics && diagnostics.reducedMotion)) {
      playVisual("Idle", { once: false });
      authGreetingCompleted = true;
      return;
    }
    if (container) container.classList.add("is-auth-entering");
    playVisual("Wave", { once: true, fadeSeconds: 0.14, durationSeconds: 1.45, returnToIdle: false });
    authGreetingTimers.push(global.setTimeout(function () {
      if (currentSurface !== "auth") return;
      playVisual("Idle", { once: false, fadeSeconds: 0.3 });
      authGreetingCompleted = true;
      if (container) container.classList.remove("is-auth-entering");
    }, 1700));
  }

  function setAuthInputMode(active) {
    authInputMode = active === true;
    var authScreen = document.getElementById("auth");
    if (authScreen) authScreen.classList.toggle("auth-is-typing", authInputMode);
    if (container) container.classList.toggle("is-auth-suspended", currentSurface === "auth" && authInputMode);
    if (!authInputMode) return;
    clearAuthGreetingTimers();
    state.open = false;
    playVisual("Idle", { once: false, fadeSeconds: 0.16 });
  }

  function listenToAuthFocus() {
    if (authFocusListenerBound || !document || typeof document.addEventListener !== "function") return;
    authFocusListenerBound = true;
    document.addEventListener("focusin", function (event) {
      if (currentSurface !== "auth" || authInputMode) return;
      var target = event.target;
      if (!target || typeof target.matches !== "function") return;
      if (target.matches("#emailIdentifier, #phoneIdentifier, #password, #otpIdentifier")) setAuthInputMode(true);
    });
  }

  function setDashboardVisible(visible) {
    dashboardVisible = visible !== false;
    if (currentSurface !== "workspace" || !container) return;
    state.minimized = false;
    if (!dashboardVisible) {
      state.open = false;
      playVisual("Idle");
    }
    render();
  }

  function playVisual(animation, options) {
    state.animation = animation;
    if (embeddedPresentation) notifyHistoryListeners();
    // JASPE 2.5D : la synchronisation visuelle est gérée par le rendu 2.5D.
  }

  function bindEvents() {
    var avatar = container.querySelector(".safe-avatar");
    if (avatar) {
      avatar.addEventListener("click", function (event) {
        if (Date.now() < suppressAvatarClickUntil) {
          event.preventDefault();
          return;
        }
        toggleOpen();
      });
      avatar.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleOpen();
      });
      bindDrag(avatar);
    }

    var companionToggle = container.querySelector(".safe-companion-toggle");
    if (companionToggle) companionToggle.addEventListener("click", function (event) {
      event.stopPropagation();
      state.userHidden = !state.userHidden;
      state.open = false;
      state.animation = "Idle";
      render();
    });

    var closeBtn = container.querySelector(".safe-bubble-close");
    if (closeBtn) closeBtn.addEventListener("click", function (e) { e.stopPropagation(); closeBubble(); });
    var resetBtn = container.querySelector(".safe-position-reset");
    if (resetBtn) resetBtn.addEventListener("click", function (e) { e.stopPropagation(); clearStoredPosition(); });

    var suggestions = container.querySelectorAll("[data-suggestion]");
    suggestions.forEach(function (btn) {
      btn.addEventListener("click", function () { handleSuggestion(btn.getAttribute("data-suggestion")); });
    });

    var input = container.querySelector("#safeInput");
    var sendBtn = container.querySelector("#safeSend");
    if (sendBtn) sendBtn.addEventListener("click", function () { if (input) handleUserInput(input.value); });
    if (input) input.addEventListener("input", function () {
      state.inputDraft = input.value;
      playVisual(input.value.trim() ? "Listening" : "Idle", { once: false });
    });
    if (input) input.addEventListener("blur", function () { playVisual("Idle", { once: false }); });
    var discreetToggle = container.querySelector(".safe-discreet-toggle");
    if (discreetToggle) discreetToggle.addEventListener("click", function () {
      state.discreet = !state.discreet;
      try { global.localStorage.setItem(DISCREET_STORAGE_KEY, state.discreet ? "1" : "0"); } catch (e) { /* preference works without storage */ }
      state.animation = "Idle";
      render();
      container.querySelector(".safe-discreet-toggle").focus({ preventScroll: true });
    });
    if (input) input.addEventListener("keydown", function (e) { if (e.key === "Enter") handleUserInput(input.value); });
  }

  function bindDrag(avatar) {
    var drag = null;

    avatar.addEventListener("pointerdown", function (event) {
      if (typeof event.button === "number" && event.button !== 0) return;
      var rect = container.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false,
      };
      container.classList.add("is-dragging");
      try { avatar.setPointerCapture(event.pointerId); } catch (e) { /* capture optionnelle */ }
      event.preventDefault();
    });

    avatar.addEventListener("pointermove", function (event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      var deltaX = event.clientX - drag.startX;
      var deltaY = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) drag.moved = true;
      if (!drag.moved) return;
      event.preventDefault();
      applyFloatingPosition(drag.left + deltaX, drag.top + deltaY, false);
    });

    var finishDrag = function (event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.moved) {
        suppressAvatarClickUntil = Date.now() + 300;
        customPosition = true;
        storePosition();
      }
      container.classList.remove("is-dragging");
      try { avatar.releasePointerCapture(event.pointerId); } catch (e) { /* capture optionnelle */ }
      drag = null;
    };
    avatar.addEventListener("pointerup", finishDrag);
    avatar.addEventListener("pointercancel", finishDrag);
  }

  function listenToEscape() {
    if (!document || typeof document.addEventListener !== "function") return;
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !state.open || state.userHidden) return;
      // Sortie totale de la conversation : la bulle se referme complètement,
      // seul l'avatar flottant reste visible.
      closeBubble();
    });
  }

  function listenToLaunchers() {
    if (!document || typeof document.addEventListener !== "function") return;
    document.addEventListener("click", function (event) {
      var launcher = event.target && event.target.closest ? event.target.closest("[data-open-jaspe]") : null;
      if (!launcher) return;
      openWithQuery("");
    });
  }

  function toggleOpen() {
    if (!isAllowed()) { render(); return; }
    syncConversationOwner();
    state.open = !state.open;
    if (state.open) greetIfNeeded();
    else state.animation = "Idle";
    render();
  }

  function closeBubble() {
    state.open = false;
    state.animation = "Idle";
    render();
  }

  function openWithQuery(query) {
    if (!isAllowed()) { render(); return; }
    syncConversationOwner();
    if (currentSurface === "workspace") state.userHidden = false;
    state.open = true;
    if (query) {
      handleUserInput(query);
    } else {
      greetIfNeeded();
      render();
    }
  }

  function handleSuggestion(text) {
    if (state.onboardingIndex >= 0) {
      if (text === "Continuer") {
        state.onboardingIndex++;
        showOnboardingStep();
      } else if (text === "Plus tard") {
        state.onboardingIndex = -1;
        markOnboardingDone();
        closeBubble();
      } else if (text === "Terminer") {
        state.onboardingIndex = -1;
        markOnboardingDone();
        state.currentMessage = "Tu peux me poser tes questions quand tu veux !";
        state.animation = "Agree";
        state.suggestions = [];
        render();
      }
      return;
    }
    handleUserInput(text);
  }

  // Complete social utterances only: mixed business requests keep their normal route.
  function answerConversation(raw) {
    var words = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[’']/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    var message = "";
    var animation = "TalkHandsOpen";
    if (/^(merci( beaucoup| bien)?( jaspe)?|merci a toi|c est gentil)$/.test(words)) {
      message = "Avec plaisir !";
      animation = "Agree";
    } else if (/^(bonjour|bonsoir|salut|coucou)( jaspe)?$/.test(words)) {
      message = (words.indexOf("bonsoir") === 0 ? "Bonsoir" : "Bonjour") + " ! Que souhaites-tu faire dans SchoolSafe ?";
      animation = "Wave";
    } else if (/^(qui es tu|tu es qui|presente toi|qui est jaspe)$/.test(words)) {
      message = "Je suis Jaspe, ton assistante SchoolSafe ! Pose-moi tes questions.";
    } else if (/^(je (ne )?comprends pas|je n ai pas compris|je suis perdu(e)?|aide moi|j ai besoin d aide|aide)$/.test(words)) {
      message = state.lastTopic
        ? "Reprenons ta demande : « " + state.lastTopic + " ». Dis-moi ce que tu vois à l’écran et à quel moment tu bloques."
        : "On peut avancer étape par étape. Dis-moi ce que tu souhaites faire et ce que tu vois à l’écran.";
    } else if (/^(d accord|ok|okay|compris|c est bon)$/.test(words)) {
      message = "D’accord. Tu peux continuer, ou me poser une autre question.";
      animation = "Idle";
    }
    if (!message) return false;
    state.currentMessage = message;
    state.animation = animation;
    state.suggestions = defaultSuggestions();
    render();
    return true;
  }

  function handleUserInput(raw) {
    raw = String(raw || "").trim();
    var text = raw.toLowerCase();
    if (!text) return;
    state.inputDraft = "";
    var input = container && container.querySelector("#safeInput");
    if (input) input.value = "";
    playVisual("Listening", { once: false });

    var routingContext = global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getAssistantContext === "function"
      ? global.SchoolSafeAppContext.getAssistantContext()
      : { user: assistantUser() };
    if (!global.SchoolSafeJaspeCapabilityRouter || typeof global.SchoolSafeJaspeCapabilityRouter.route !== "function") {
      state.currentMessage = "Jaspe refuse cette demande : le routeur central de capacités est indisponible.";
      state.animation = "Shrug";
      state.suggestions = [];
      render();
      return;
    }
    var routingDecision = global.SchoolSafeJaspeCapabilityRouter.route(raw, routingContext);
    if (routingDecision && routingDecision.matched && !routingDecision.allowed) {
      state.lastTopic = "";
      state.currentMessage = routingDecision.message;
      state.animation = "Shrug";
      state.suggestions = [];
      render();
      return;
    }
    if (answerConversation(raw)) return;
    state.lastTopic = raw.length > 180 ? raw.slice(0, 177) + "…" : raw;
    var routedTarget = routingDecision && routingDecision.matched ? routingDecision.target : null;
    function routeAllows(target) {
      return !routedTarget || routedTarget === "legacy" || routedTarget === target;
    }
    // INC-3 : jamais de gate par NOM de rôle — la permission réelle décide.
    function domainAllows(context, permission) {
      return !!(context && context.user && global.SchoolSafeAccess
        && typeof global.SchoolSafeAccess.canAccess === "function"
        && global.SchoolSafeAccess.canAccess(context.user, permission));
    }

    if (routeAllows("documents") && global.SchoolSafeDocumentAssistant && typeof global.SchoolSafeDocumentAssistant.answer === "function") {
      var documentContext = global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getAssistantContext === "function"
        ? global.SchoolSafeAppContext.getAssistantContext()
        : null;
      var documentAnswer = global.SchoolSafeDocumentAssistant.answer(raw, documentContext);
      if (documentAnswer) {
        state.currentMessage = documentAnswer.message;
        state.animation = documentAnswer.refusal ? "Shrug" : "TalkHandsOpen";
        state.suggestions = [];
        if (!documentAnswer.refusal && documentAnswer.action === "documents" && global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.openDocuments === "function") {
          global.SchoolSafeAppContext.openDocuments();
        }
        render();
        return;
      }
    }

    if (routeAllows("communication") && global.SchoolSafeCommunication && typeof global.SchoolSafeCommunication.answerJaspe === "function") {
      var communicationContext = global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getAssistantContext === "function"
        ? global.SchoolSafeAppContext.getAssistantContext()
        : null;
      var communicationAnswer = communicationContext
        ? global.SchoolSafeCommunication.answerJaspe(raw, communicationContext)
        : null;
      if (communicationAnswer) {
        state.currentMessage = communicationAnswer.message;
        state.animation = communicationAnswer.refusal ? "Shrug" : "TalkHandsOpen";
        state.suggestions = [];
        if (!communicationAnswer.refusal && communicationAnswer.action && global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.openCommunication === "function") {
          global.SchoolSafeAppContext.openCommunication(communicationAnswer.action);
        }
        render();
        return;
      }
    }

    if (routeAllows("parent") && global.SchoolSafeParentPortal && typeof global.SchoolSafeParentPortal.answerJaspe === "function") {
      var assistantContext = global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getAssistantContext === "function"
        ? global.SchoolSafeAppContext.getAssistantContext()
        : null;
      var parentAnswer = domainAllows(assistantContext, "school.student.read")
        ? global.SchoolSafeParentPortal.answerJaspe(raw, assistantContext)
        : null;
      if (parentAnswer) {
        state.currentMessage = parentAnswer.message;
        state.animation = parentAnswer.refusal ? "Shrug" : "TalkHandsOpen";
        state.suggestions = [];
        render();
        return;
      }
    }

    if (routeAllows("teacher") && global.SchoolSafeTeacherPedagogy && typeof global.SchoolSafeTeacherPedagogy.answerJaspe === "function") {
      var pedagogyContext = global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getAssistantContext === "function"
        ? global.SchoolSafeAppContext.getAssistantContext()
        : null;
      var pedagogyAnswer = domainAllows(pedagogyContext, "pedagogy.assignment.read")
        ? global.SchoolSafeTeacherPedagogy.answerJaspe(raw, pedagogyContext)
        : null;
      if (pedagogyAnswer) {
        state.currentMessage = pedagogyAnswer.message;
        state.animation = pedagogyAnswer.refusal ? "Shrug" : "TalkHandsOpen";
        state.suggestions = [];
        render();
        return;
      }
    }

    if (routeAllows("security") && global.SchoolSafeGuardSecurity && typeof global.SchoolSafeGuardSecurity.answerJaspe === "function") {
      var securityContext = global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getAssistantContext === "function"
        ? global.SchoolSafeAppContext.getAssistantContext()
        : null;
      var securityAnswer = domainAllows(securityContext, "security.scan")
        ? global.SchoolSafeGuardSecurity.answerJaspe(raw, securityContext)
        : null;
      if (securityAnswer) {
        state.currentMessage = securityAnswer.message;
        state.animation = securityAnswer.refusal ? "Shrug" : "TalkHandsOpen";
        state.suggestions = [];
        render();
        return;
      }
    }

    if (routeAllows("staff") && global.SchoolSafeHrDemo && typeof global.SchoolSafeHrDemo.answerJaspe === "function") {
      var hrContext = global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getAssistantContext === "function"
        ? global.SchoolSafeAppContext.getAssistantContext()
        : null;
      var hrAnswer = domainAllows(hrContext, "staff.read")
        ? global.SchoolSafeHrDemo.answerJaspe(raw, hrContext)
        : null;
      if (hrAnswer) {
        state.currentMessage = hrAnswer.message;
        state.animation = hrAnswer.refusal ? "Shrug" : "TalkHandsOpen";
        state.suggestions = [];
        if (hrAnswer.action && global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.openHr === "function") {
          global.SchoolSafeAppContext.openHr(hrAnswer.action);
        }
        render();
        return;
      }
    }

    if (routeAllows("inventory") && global.SchoolSafeInventoryDemo && typeof global.SchoolSafeInventoryDemo.answerJaspe === "function") {
      var inventoryContext = global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getAssistantContext === "function"
        ? global.SchoolSafeAppContext.getAssistantContext()
        : null;
      var inventoryAnswer = inventoryContext
        ? global.SchoolSafeInventoryDemo.answerJaspe(raw, inventoryContext)
        : null;
      if (inventoryAnswer) {
        state.currentMessage = inventoryAnswer.message;
        state.animation = inventoryAnswer.refusal ? "Shrug" : "TalkHandsOpen";
        state.suggestions = [];
        if (!inventoryAnswer.refusal && inventoryAnswer.action && global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.openInventory === "function") {
          global.SchoolSafeAppContext.openInventory(inventoryAnswer.action);
        }
        render();
        return;
      }
    }

    if (routeAllows("reports") && global.SchoolSafeReportsDemo && typeof global.SchoolSafeReportsDemo.answerJaspe === "function") {
      var reportsContext = global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getAssistantContext === "function"
        ? global.SchoolSafeAppContext.getAssistantContext()
        : null;
      var reportsAnswer = reportsContext
        ? global.SchoolSafeReportsDemo.answerJaspe(raw, reportsContext)
        : null;
      if (reportsAnswer) {
        state.currentMessage = reportsAnswer.message;
        state.animation = reportsAnswer.refusal ? "Shrug" : "TalkHandsOpen";
        state.suggestions = [];
        if (!reportsAnswer.refusal && reportsAnswer.action && global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.openReports === "function") {
          global.SchoolSafeAppContext.openReports(reportsAnswer.action);
        }
        render();
        return;
      }
    }

    if (routeAllows("accounting") && global.SchoolSafeAccountingTreasury && typeof global.SchoolSafeAccountingTreasury.answerJaspe === "function") {
      var accountingContext = global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getAssistantContext === "function"
        ? global.SchoolSafeAppContext.getAssistantContext()
        : null;
      var accountingAnswer = accountingContext
        ? global.SchoolSafeAccountingTreasury.answerJaspe(raw, accountingContext)
        : null;
      if (accountingAnswer) {
        state.currentMessage = accountingAnswer.message;
        state.animation = accountingAnswer.refusal ? "Shrug" : "TalkHandsOpen";
        state.suggestions = [];
        if (accountingAnswer.action && global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.openAccounting === "function") {
          global.SchoolSafeAppContext.openAccounting(accountingAnswer.action);
        }
        render();
        return;
      }
    }

    if (routeAllows("finance") && global.SchoolSafeFinanceModule && typeof global.SchoolSafeFinanceModule.answerJaspe === "function") {
      var financeContext = global.SchoolSafeAppContext && typeof global.SchoolSafeAppContext.getAssistantContext === "function"
        ? global.SchoolSafeAppContext.getAssistantContext()
        : null;
      var reservedRole = financeContext && ["parent", "teacher", "pedagogy", "guard"].indexOf(financeContext.activeRole) >= 0;
      var financeAnswer = financeContext && !reservedRole
        ? global.SchoolSafeFinanceModule.answerJaspe(raw, financeContext)
        : null;
      if (financeAnswer) {
        state.currentMessage = financeAnswer.message;
        state.animation = financeAnswer.refusal ? "Shrug" : "TalkHandsOpen";
        state.suggestions = [];
        if (financeAnswer.action && financeAnswer.action !== "fee-control" && typeof global.SchoolSafeFinanceModule.render === "function") {
          global.SchoolSafeFinanceModule.render("financeModule", { tab: financeAnswer.action });
        }
        render();
        return;
      }
    }

    if (/autorise|autoriser|valide|valider/.test(text) && /sortie|remise|récup|recup/.test(text)) {
      state.currentMessage = "Je ne peux pas autoriser une sortie, valider une remise, suspendre ou rétablir une personne. Ces actions exigent les droits utilisateur correspondants et restent sous contrôle humain.";
      state.animation = "Shrug";
      state.suggestions = defaultSuggestions();
      render();
      return;
    }

    if (/activ/.test(text) && /dossier|élève|eleve/.test(text)) {
      state.currentMessage = "Je ne peux pas exécuter une activation. Ouvrez le dossier élève : l’action exige school.student.activate et reste BACKEND_LATER.";
      state.animation = "Shrug";
      state.suggestions = defaultSuggestions();
      render();
      return;
    }

    if (/valid|change|transf|départ|depart|inactif|archiv/.test(text) && /réinscri|reinscri|classe|élève|eleve|dossier|départ|depart|archiv/.test(text)) {
      state.currentMessage = "Je peux expliquer le parcours, préparer un résumé, une demande ou un brouillon. Je ne peux pas valider une réinscription, changer une classe, transférer un élève, enregistrer un départ, rendre un dossier inactif ou l’archiver.";
      state.animation = "Shrug";
      state.suggestions = defaultSuggestions();
      render();
      return;
    }

    var best = null;
    var bestScore = 0;
    for (var i = 0; i < faq.length; i++) {
      var item = faq[i];
      var score = 0;
      for (var j = 0; j < item.keywords.length; j++) {
        if (text.indexOf(item.keywords[j]) >= 0) score++;
      }
      if (score > bestScore) { bestScore = score; best = item; }
    }

    if (best && bestScore >= 1 && !branchVisible(best.branch)) {
      // La réponse pointe vers une branche inaccessible : ne pas la proposer.
      best = null;
    }

    if (best && bestScore >= 1) {
      state.currentMessage = best.answer;
      state.animation = best.animation;
    } else {
      state.currentMessage = "Je ne suis pas sûre de comprendre ta demande. Dis-moi ce que tu souhaites faire et sur quel écran tu te trouves, ou choisis un sujet ci-dessous.";
      state.animation = "Shrug";
    }
    state.suggestions = defaultSuggestions();
    render();
  }

  function listenToAppEvents() {
    global.addEventListener("safe:event", function (e) {
      var detail = e.detail || {};
      if (!state.open || !isAllowed() || state.userHidden) return;
      var input = container && container.querySelector("#safeInput");
      if (input && input.value.trim()) return;
      if (detail.type === "action:success") { state.animation = "Agree"; state.currentMessage = "L’action a bien été effectuée."; }
      else if (detail.type === "action:big_success") { state.animation = "TalkPassionately"; state.currentMessage = "Félicitations ! 🎉"; }
      else if (detail.type === "action:error") { state.animation = "Shrug"; state.currentMessage = "L’action n’a pas abouti. " + (detail.message || "Quelque chose n’a pas marché.") + " On réessaie ?"; }
      else if (detail.type === "loading:start") { state.animation = "Listening"; }
      else if (detail.type === "loading:stop") { state.animation = "Idle"; }
      if (state.open) render();
    });
  }

  // Notification de la réponse courante ; noms publics conservés pour compatibilité.
 var historyListeners = [];
 function notifyHistoryListeners() {
 for (var i = 0; i < historyListeners.length; i++) {
 try { historyListeners[i](); } catch (e) {}
 }
 }

 global.SafeAssistant = {
 init: init,
 isAllowed: isAllowed,
 openWithQuery: openWithQuery,
 refreshAccess: refreshAccess,
 setSurface: setSurface,
 setDashboardVisible: setDashboardVisible,
 // Compatibility: one current response, no accumulated conversation.
 getHistory: function () { return isAllowed() && state.currentMessage ? [{ from: "jaspe", text: state.currentMessage }] : []; },
 getCurrentMessage: function () { return isAllowed() ? state.currentMessage || "" : ""; },
 getConversationRevision: function () { return conversationRevision; },
 getAnimation: function () { return isAllowed() ? state.animation : "Idle"; },
 setEmbeddedPresentation: function (enabled) {
   embeddedPresentation = enabled === true;
   if (container) render();
 },
 onHistoryChange: function (fn) {
 if (typeof fn === "function" && historyListeners.indexOf(fn) < 0) {
 historyListeners.push(fn);
 }
 }
 };
  if (global.document && (global.document.readyState === "complete" || global.document.readyState === "interactive")) {
    init();
  } else if (global.addEventListener) {
    global.addEventListener("DOMContentLoaded", init);
  }
})(window);
