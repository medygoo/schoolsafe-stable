/* One existing V12 renderer, cropped at the hips in the dashboard or full body.
 * Conversation and authorization remain owned by SafeAssistant / Access Law. */
(function (global) {
  "use strict";
  var initialized = false;
  var showcase = null;
  var voiceUtterance = null;
  var dialog, character, launcher, fullStage, input, log, mic, status;
  var audioMode = false;
  var recognition = null;
  var returnFocus = null;
  var renderedResponse = "";
  var lastAnimation = "";
  var lastSpoken = "";
  var conversationRevision = -1;

  function allowed() {
    return document.body.classList.contains("screen-workspace") &&
      !!global.SafeAssistant && global.SafeAssistant.isAllowed();
  }

  function intent(kind, settings) {
    if (!allowed()) return;
    if (showcase) {
      var current = showcase.getState();
      if (current && current.current.priority >= 100 && kind !== "refuse" && kind !== "error") return;
      // Audio phase changes end ordinary gestures immediately, while refusals/errors
      // retain the central controller's priority over decorative movement.
      if (current && current.current.priority < 100 &&
          (kind === "idle" || kind === "listen" || (settings && settings.audioPhase))) showcase.stop();
      var command = { kind: kind, source: "dashboard-ui" };
      if (settings && typeof settings.duration === "number") command.holdMs = settings.duration;
      showcase.dispatch(command);
    }
  }

  function stopSpeaking() {
    var hadVoice = !!voiceUtterance;
    if (voiceUtterance) voiceUtterance.onstart = voiceUtterance.onend = voiceUtterance.onerror = null;
    voiceUtterance = null;
    if (hadVoice && global.speechSynthesis) global.speechSynthesis.cancel();
    if (hadVoice) intent("idle");
    syncVoiceControls();
  }

  function syncVoiceControls() {
    var supported = !!(global.speechSynthesis && global.SpeechSynthesisUtterance);
    var response = global.SafeAssistant.getCurrentMessage();
    document.querySelectorAll("[data-jaspe-voice]").forEach(function (button) {
      button.textContent = !supported ? "Voix indisponible" : (voiceUtterance ? "Couper la voix" : "Écouter la réponse");
      button.disabled = !allowed() || !supported || (!voiceUtterance && !response);
    });
  }

  function setStatus(message) {
    status.textContent = message || "";
    status.hidden = !message;
    var heroStatus = document.getElementById("jaspeHeroAudioStatus");
    heroStatus.textContent = message || "";
    heroStatus.hidden = !message || dialog.open;
  }

  function stopListening() {
    var previous = recognition;
    recognition = null;
    if (previous) {
      previous.onresult = previous.onerror = previous.onend = null;
      previous.onstart = null;
      try { previous.abort(); } catch (e) { /* already stopped */ }
    }
    mic.setAttribute("aria-pressed", "false");
    mic.setAttribute("aria-label", "Démarrer l’écoute");
    var heroMic = document.getElementById("jaspeHeroMic");
    heroMic.setAttribute("aria-pressed", "false");
    heroMic.setAttribute("aria-label", "Parler à Jaspe dans le tableau de bord");
    if (previous) intent("idle");
  }

  function setMode(audio) {
    audioMode = audio;
    stopListening();
    stopSpeaking();
    intent("idle");
    document.querySelectorAll("[data-jaspe-mode]").forEach(function (button) {
      button.setAttribute("aria-pressed", String((button.dataset.jaspeMode === "audio") === audio));
    });
    var supported = !!(global.SpeechRecognition || global.webkitSpeechRecognition);
    mic.hidden = !audio;
    mic.disabled = !supported;
    setStatus(audio ? (supported ? "Appuyez sur le micro pour parler." : "L’écoute n’est pas disponible dans ce navigateur. Vous pouvez écrire à Jaspe.") : "");
    // Do not speak older or another account's messages when entering audio mode.
    lastSpoken = global.SafeAssistant.getCurrentMessage();
  }

  function prepareSubmission() {
    stopListening();
    stopSpeaking();
    renderedResponse = null;
    lastSpoken = "";
    setStatus(audioMode ? "Message envoyé." : "");
  }

  function submit(text) {
    text = String(text || "").trim();
    if (!text || !allowed()) return;
    input.value = "";
    prepareSubmission();
    global.SafeAssistant.openWithQuery(text);
  }

  function startListening() {
    if (recognition) { stopListening(); setStatus("Écoute arrêtée."); return; }
    var Recognition = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!allowed()) return;
    if (!Recognition) {
      setStatus("L’écoute n’est pas disponible dans ce navigateur. Vous pouvez écrire à Jaspe.");
      return;
    }
    stopSpeaking();
    try { recognition = new Recognition(); } catch (e) {
      setStatus("Impossible de démarrer le micro. Vous pouvez continuer par écrit.");
      return;
    }
    var session = recognition;
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = function () {
      if (recognition !== session || !allowed()) return;
      setStatus("Je vous écoute…");
    };
    recognition.onresult = function (event) {
      if (recognition !== session || !allowed() || document.hidden) return;
      var result = event.results && event.results[event.resultIndex || 0];
      var text = result && result[0] && result[0].transcript;
      if (String(text || "").trim()) submit(text);
    };
    recognition.onerror = function (event) {
      if (recognition !== session) return;
      stopListening();
      var messages = {
        "no-speech": "Aucune parole détectée. Appuyez sur le micro pour réessayer.",
        "network": "L’écoute a rencontré un problème de connexion. Vous pouvez continuer par écrit.",
        "not-allowed": "Accès au micro refusé. Vous pouvez continuer par écrit.",
        "service-not-allowed": "L’écoute est refusée par ce navigateur. Vous pouvez continuer par écrit.",
        "audio-capture": "Aucun microphone disponible. Vous pouvez continuer par écrit."
      };
      setStatus(messages[event && event.error] || "Micro indisponible. Vous pouvez continuer par écrit.");
    };
    recognition.onend = function () {
      if (recognition !== session) return;
      stopListening();
      setStatus("Écoute terminée. Appuyez sur le micro pour réessayer.");
    };
    mic.setAttribute("aria-pressed", "true");
    mic.setAttribute("aria-label", "Arrêter l’écoute");
    document.getElementById("jaspeHeroMic").setAttribute("aria-pressed", "true");
    document.getElementById("jaspeHeroMic").setAttribute("aria-label", "Arrêter l’écoute");
    setStatus("Ouverture du micro…");
    intent("listen", { duration: 0 });
    try { recognition.start(); } catch (e) {
      stopListening();
      setStatus("Impossible de démarrer le micro. Vous pouvez continuer par écrit.");
    }
  }

  function speakResponse(response, animation) {
    if (!response || !allowed() || document.hidden) return;
    stopListening();
    stopSpeaking();
    if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) {
      setStatus("La voix est indisponible dans ce navigateur. La réponse reste affichée.");
      return;
    }
    lastSpoken = response;
    var utterance = new global.SpeechSynthesisUtterance(response);
    utterance.lang = "fr-FR";
    voiceUtterance = utterance;
    syncVoiceControls();
    setStatus("Préparation de la voix…");
    utterance.onstart = function () {
      if (voiceUtterance !== utterance || !allowed()) return;
      setStatus("Jaspe vous répond…");
      var kind = animation === "Shrug" ? "refuse" :
        (animation === "TalkHandsOpen" || animation === "TalkPassionately" || animation === "Wave" ? "explain" : "speak");
      intent(kind, kind === "refuse" ? undefined : { duration: 0, audioPhase: true, standing: animation === "TalkHandsOpen" || animation === "TalkPassionately" });
    };
    function finish(failed) {
      if (voiceUtterance !== utterance) return;
      voiceUtterance = null;
      intent("idle");
      syncVoiceControls();
      setStatus(failed ? "La voix est indisponible. La réponse reste affichée ; vous pouvez réessayer." : "Lecture terminée. Vous pouvez reparler à Jaspe.");
    }
    utterance.onend = function () { finish(false); };
    utterance.onerror = function () { finish(true); };
    try { global.speechSynthesis.speak(utterance); } catch (e) { finish(true); }
  }

  function syncAccess() {
    if (!initialized) return;
    var canUse = allowed();
    document.querySelectorAll("[data-jaspe-open], [data-jaspe-audio], [data-jaspe-chat-input], [data-jaspe-chat-send], [data-bottom-nav='jaspe']").forEach(function (element) {
      element.disabled = !canUse;
    });
    document.getElementById("jaspeAccessMessage").hidden = canUse;
    if (!canUse) {
      close();
      setMode(false);
      renderedResponse = "";
      lastSpoken = "";
      lastAnimation = "";
      log.replaceChildren();
      document.querySelectorAll("[data-jaspe-chat-log]").forEach(function (element) { element.replaceChildren(); });
      document.querySelectorAll("[data-jaspe-chat-input]").forEach(function (element) { element.value = ""; });
      input.value = "";
      if (showcase) showcase.stop();
    }
    syncVoiceControls();
  }

  function syncConversation() {
    syncAccess();
    if (!allowed()) return;
    var revision = global.SafeAssistant.getConversationRevision();
    if (revision !== conversationRevision) {
      conversationRevision = revision;
      setMode(false);
      input.value = "";
      document.querySelectorAll("[data-jaspe-chat-input]").forEach(function (field) { field.value = ""; });
      renderedResponse = null;
      lastAnimation = "";
      lastSpoken = "";
    }
    var response = global.SafeAssistant.getCurrentMessage();
    var signature = response;
    var responseChanged = signature !== renderedResponse;
    if (responseChanged && voiceUtterance && response !== voiceUtterance.text) stopSpeaking();
    if (signature !== renderedResponse) {
      renderedResponse = signature;
      log.replaceChildren();
      if (!response) {
        var empty = document.createElement("p");
        empty.className = "jaspe-panel__empty";
        empty.textContent = "Bonjour ! Que souhaitez-vous faire aujourd’hui ?";
        log.appendChild(empty);
      }
      if (response) {
        var line = document.createElement("p");
        line.className = "jaspe-message jaspe-message--assistant";
        var label = document.createElement("b");
        label.textContent = "Jaspe";
        var text = document.createElement("span");
        text.textContent = response;
        line.append(label, text);
        log.appendChild(line);
      }
      log.scrollTop = log.scrollHeight;
    }
    var animation = global.SafeAssistant.getAnimation();
    if (animation !== lastAnimation || responseChanged) {
      lastAnimation = animation;
      var mapping = { Idle: "idle", Listening: "listen", Thinking: "think", Wave: "explain", Agree: "success", Shrug: "refuse", TalkHandsOpen: "explain", TalkPassionately: "explain" };
      var standing = animation === "TalkHandsOpen" || animation === "TalkPassionately";
      intent(mapping[animation] || "speak", standing ? { standing: true, duration: 6500 } : undefined);
    }
    if (audioMode && !recognition && !document.hidden && response && response !== lastSpoken && animation !== "Listening" && animation !== "Thinking") {
      speakResponse(response, animation);
    }
  }

  function mount() {
    if (showcase || !global.SchoolSafeJaspe2d || !allowed()) return;
    showcase = global.SchoolSafeJaspe2d.mountShowcase(character, {
      transparent: true,
      continuousSpeech: true,
      surface: "workspace-bust", // Existing registered dashboard surface; framing is injected below.
      label: "Jaspe, votre assistante SchoolSafe",
      isBust: function () { return !dialog.open; },
      isVisible: function () {
        if (!allowed() || !character.getClientRects().length) return false;
        var rect = (dialog.open ? fullStage : launcher).getBoundingClientRect();
        return rect.bottom > 0 && rect.top < global.innerHeight && rect.right > 0 && rect.left < global.innerWidth;
      },
      variants: [
        { pack: "pack1", key: "idle" }, { pack: "pack1", key: "wave" },
        { pack: "pack2", key: "listening", rotate: false },
        { pack: "pack2", key: "thinking", rotate: false },
        { pack: "pack2", key: "speaking", rotate: false },
        { pack: "pack3", key: "congratulate", rotate: false },
        { pack: "pack4", key: "worried", rotate: false }
      ]
    });
  }

  function open(trigger, audio) {
    init();
    if (!allowed() || dialog.open) return;
    mount();
    returnFocus = trigger || document.activeElement;
    fullStage.prepend(character);
    document.body.classList.add("jaspe-is-out");
    dialog.show();
    setMode(audio === true);
    global.SafeAssistant.openWithQuery("");
    syncConversation();
    input.focus({ preventScroll: true });
    intent("explain");
  }

  function returned() {
    setMode(false);
    if (showcase) showcase.stop();
    launcher.prepend(character);
    document.body.classList.remove("jaspe-is-out");
    input.value = "";
    intent("idle");
    if (returnFocus && returnFocus.isConnected && !returnFocus.disabled && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  function close() {
    if (dialog && dialog.open) dialog.close();
  }

  function init() {
    if (initialized) return;
    dialog = document.getElementById("jaspePanelOverlay");
    if (!dialog) return;
    initialized = true;
    character = document.getElementById("jaspeDashboardCharacter");
    launcher = document.getElementById("jaspeHeroLauncher");
    fullStage = document.getElementById("jaspeFullStage");
    input = document.getElementById("jaspePanelInput");
    log = document.getElementById("jaspePanelBody");
    mic = document.getElementById("jaspePanelMic");
    status = document.getElementById("jaspePanelStatus");
    function fitVisibleViewport() {
      var viewport = global.visualViewport;
      var height = viewport ? viewport.height : global.innerHeight;
      var bottom = viewport ? Math.max(0, global.innerHeight - height - viewport.offsetTop) : 0;
      dialog.style.setProperty("--jaspe-view-height", height + "px");
      dialog.style.setProperty("--jaspe-view-bottom", bottom + "px");
      dialog.dataset.compact = String(height < 500);
    }
    fitVisibleViewport();
    global.addEventListener("resize", fitVisibleViewport, { passive: true });
    if (global.visualViewport) {
      global.visualViewport.addEventListener("resize", fitVisibleViewport, { passive: true });
      global.visualViewport.addEventListener("scroll", fitVisibleViewport, { passive: true });
    }
    global.SafeAssistant.setEmbeddedPresentation(true);
    conversationRevision = global.SafeAssistant.getConversationRevision();
    global.SafeAssistant.onHistoryChange(syncConversation);
    document.querySelectorAll("[data-jaspe-voice]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!allowed()) return;
        if (voiceUtterance) {
          stopSpeaking();
          setStatus("Voix arrêtée. Vous pouvez continuer la discussion.");
        } else speakResponse(global.SafeAssistant.getCurrentMessage(), global.SafeAssistant.getAnimation());
      });
    });
    // SafeAssistant owns these submit handlers. Capture only the audio lifecycle,
    // before its existing listener routes the question (no duplicate submission).
    document.querySelectorAll("[data-jaspe-chat-input]").forEach(function (field) {
      field.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.isComposing && field.value.trim() && allowed()) prepareSubmission();
      }, true);
    });
    document.querySelectorAll("[data-jaspe-chat-send]").forEach(function (button) {
      button.addEventListener("click", function () {
        var field = button.closest("[data-jaspe-chat]").querySelector("[data-jaspe-chat-input]");
        if (field.value.trim() && allowed()) prepareSubmission();
      }, true);
    });
    document.getElementById("jaspeHeroMic").addEventListener("click", function () {
      if (!allowed()) return;
      if (recognition) { stopListening(); setStatus("Écoute arrêtée."); return; }
      setMode(true);
      startListening();
    });
    document.querySelectorAll("[data-jaspe-open]").forEach(function (button) {
      button.addEventListener("click", function () { open(button, button.hasAttribute("data-jaspe-audio")); });
    });
    document.querySelectorAll("[data-jaspe-open], [data-bottom-nav='jaspe']").forEach(function (button) {
      var holdTimer = 0;
      function cancelHold() { global.clearTimeout(holdTimer); }
      button.addEventListener("pointerdown", function (event) {
        if (event.button !== 0 || button.disabled) return;
        cancelHold();
        holdTimer = global.setTimeout(function () { open(button, button.hasAttribute("data-jaspe-audio")); }, 450);
      });
      ["pointerup", "pointercancel", "pointerleave", "blur"].forEach(function (name) { button.addEventListener(name, cancelHold); });
      button.addEventListener("contextmenu", function (event) { event.preventDefault(); });
    });
    document.querySelectorAll("[data-jaspe-mode]").forEach(function (button) {
      button.addEventListener("click", function () { setMode(button.dataset.jaspeMode === "audio"); });
    });
    document.getElementById("jaspePanelClose").addEventListener("click", close);
    dialog.addEventListener("close", returned);
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && dialog.open) close(); });
    document.getElementById("jaspePanelForm").addEventListener("submit", function (event) { event.preventDefault(); submit(input.value); });
    mic.addEventListener("click", startListening);
    document.querySelectorAll("[data-jaspe-chat-input], #jaspePanelInput").forEach(function (field) {
      field.addEventListener("focus", function () { if (!recognition && !voiceUtterance) intent("listen"); });
      field.addEventListener("blur", function () { if (!recognition && !voiceUtterance) intent("idle"); });
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { stopListening(); stopSpeaking(); intent("idle"); setStatus(""); }
    });
  }

  global.SchoolSafeJaspeDashboard = {
    open: open,
    syncAccess: syncAccess,
    refresh: function (firstName) {
      init();
      document.getElementById("jaspeHeroName").textContent = firstName || "";
      syncAccess();
      mount();
    }
  };
})(window);
