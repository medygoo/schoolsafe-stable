/* JASPE 2.5D — moteur frontend léger (vanilla JS, aucune dépendance).
 * États : IDLE / LISTENING / THINKING / SPEAKING / ERROR / OFFLINE.
 * Chargement : pack 1 immédiat, packs 2→4 progressifs en veille ; résistant aux coupures.
 * Jamais de clé API ici : le modèle et les secrets vivent côté serveur (mission sections 7-8).
 */
(function () {
  "use strict";

  var STATES = Object.freeze({
    IDLE: "IDLE",
    LISTENING: "LISTENING",
    THINKING: "THINKING",
    SPEAKING: "SPEAKING",
    ERROR: "ERROR",
    OFFLINE: "OFFLINE"
  });

  var BASE = "./assets/jaspe2d/";
  var MANIFEST_URL = BASE + "jaspe2d-manifest.json";

  // État -> image (pack de provenance). Repli : idle si non chargé.
  var STATE_IMAGE = {
    IDLE: { pack: "pack1", key: "idle" },
    OFFLINE: { pack: "pack1", key: "idle" },
    LISTENING: { pack: "pack2", key: "listening" },
    THINKING: { pack: "pack2", key: "thinking" },
    SPEAKING: { pack: "pack2", key: "speaking" },
    ERROR: { pack: "pack4", key: "worried" }
  };

  var manifest = null;
  var loaded = {};       // "pack/key" -> true
  var state = STATES.IDLE;
  var listeners = [];
  var endpoints = { chat: "/native/jaspe/chat" };
  var mounts = [];

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state); } catch (e) { /* jamais bloquant */ }
    }
    for (var j = 0; j < mounts.length; j++) applyToMount(mounts[j]);
    for (var k = 0; k < showcases.length; k++) paintShowcase(showcases[k]);
  }

  function imageUrlFor(targetState) {
    var ref = STATE_IMAGE[targetState] || STATE_IMAGE.IDLE;
    if (!manifest) return null;
    var pack = manifest.packs && manifest.packs[ref.pack];
    var entry = pack && pack[ref.key];
    if (entry && loaded[ref.pack + "/" + ref.key]) return BASE + entry.file;
    // repli : idle du pack 1
    var idle = manifest.packs && manifest.packs.pack1 && manifest.packs.pack1.idle;
    if (idle && loaded["pack1/idle"]) return BASE + idle.file;
    return null;
  }

  function applyToMount(m) {
    var url = imageUrlFor(state);
    if (!url) return; // pack 1 pas encore là : on ne montre rien plutôt que casser
    if (m.img.getAttribute("src") !== url) {
      m.box.classList.add("jaspe2d--fading");
      var img = m.img;
      var done = function () { m.box.classList.remove("jaspe2d--fading"); };
      img.onload = done;
      img.onerror = done;
      img.setAttribute("src", url);
    }
    m.box.setAttribute("data-state", state);
  }

  function preload(packName) {
    if (!manifest || !manifest.packs[packName]) return Promise.resolve();
    var jobs = Object.keys(manifest.packs[packName]).map(function (key) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { loaded[packName + "/" + key] = true; resolve(); };
        img.onerror = function () { resolve(); }; // coupure : on retentera
        img.src = BASE + manifest.packs[packName][key].file;
      });
    });
    return Promise.all(jobs).then(function () { notify(); });
  }

  function progressiveLoad() {
    var order = ["pack2", "pack3", "pack4"];
    var step = function (i) {
      if (i >= order.length) return;
      if (navigator.onLine === false) return; // hors-ligne : on réessaiera au retour réseau
      preload(order[i]).then(function () {
        var idle = window.requestIdleCallback || function (fn) { setTimeout(fn, 1500); };
        idle(function () { step(i + 1); });
      });
    };
    step(0);
  }

  function init(options) {
    options = options || {};
    if (options.chatEndpoint) endpoints.chat = options.chatEndpoint;
    return fetch(MANIFEST_URL)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        manifest = m;
        if (!manifest) { setState(STATES.OFFLINE); return; }
        return preload("pack1").then(progressiveLoad);
      })
      .catch(function () { setState(STATES.OFFLINE); });
  }

  function setState(next) {
    if (!STATES[next]) return;
    if (state !== next) { state = next; notify(); }
  }

  function mount(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var box = document.createElement("div");
    box.className = "jaspe2d" + (opts.className ? " " + opts.className : "");
    box.setAttribute("data-state", state);
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", opts.label || "Jaspe, assistante SchoolSafe");
    var img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    box.appendChild(img);
    if (opts.bubble) {
      var b = document.createElement("p");
      b.className = "jaspe2d__bubble";
      b.textContent = opts.bubble;
      box.appendChild(b);
    }
    el.appendChild(box);
    var handle = { box: box, img: img, el: el };
    mounts.push(handle);
    applyToMount(handle);
    return handle;
  }

  function chat(text, opts) {
    opts = opts || {};
    setState(STATES.THINKING);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, opts.timeoutMs || 12000);
    return fetch(endpoints.chat, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: String(text || "") }),
      signal: ctrl.signal
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error("HTTP_" + r.status);
      return r.json();
    }).then(function (data) {
      setState(STATES.SPEAKING);
      var reply = data && data.data && typeof data.data.reply === "string" ? data.data.reply : "";
      setTimeout(function () { setState(STATES.IDLE); }, Math.min(6000, 1200 + reply.length * 30));
      return reply;
    }).catch(function (err) {
      clearTimeout(timer);
      var offline = err && (err.name === "TypeError" || err.name === "AbortError");
      setState(offline ? STATES.OFFLINE : STATES.ERROR);
      setTimeout(function () { setState(STATES.IDLE); }, 2500);
      return null;
    });
  }

  window.addEventListener("online", function () {
    if (state === STATES.OFFLINE) setState(STATES.IDLE);
    progressiveLoad(); // reprend les packs manquants
    for (var s = 0; s < showcases.length; s++) paintShowcase(showcases[s]);
  });

  // — Showcase : variantes de pose qui alternent en fondu (écran de connexion) —
  // Pause automatique : onglet caché, saisie (auth-is-typing), reduced-motion = statique.
  // Variantes avec rotate:false = poses de réaction uniquement (via handle.react).
  var showcases = [];
  var FALLBACK_REF = {
    IDLE: { pack: "pack1", key: "idle" },
    LISTENING: { pack: "pack2", key: "listening" },
    THINKING: { pack: "pack2", key: "thinking" },
    SPEAKING: { pack: "pack2", key: "speaking" },
    ERROR: { pack: "pack4", key: "worried" },
    CONGRATULATE: { pack: "pack3", key: "congratulate" }
  };

  function imageUrlByRef(ref) {
    if (!manifest) return null;
    var pack = manifest.packs && manifest.packs[ref.pack];
    var entry = pack && pack[ref.key];
    if (entry && loaded[ref.pack + "/" + ref.key]) return BASE + entry.file;
    return null;
  }

  function preparePortrait(sc, index) {
    if (!sc.portraits[index]) {
      sc.portraits[index] = import("./auth-portrait.js").then(function (module) {
        return module.authPortrait(sc.variants[index]);
      }).then(function (url) {
        sc.imgs[index].src = url;
        return sc.imgs[index].decode();
      }).catch(function () {
        // No raw photo fallback: the form remains usable if a portrait cannot load.
        delete sc.portraits[index];
      });
    }
    return sc.portraits[index];
  }

  function paintShowcase(sc) {
    if (sc.transparent) { preparePortrait(sc, sc.index); return; }
    sc.imgs.forEach(function (img, i) {
      // repli sur le repos tant que la pose n'est pas chargée (packs progressifs)
      var url = imageUrlByRef(sc.variants[i]) || imageUrlByRef({ pack: "pack1", key: "idle" });
      if (url && img.getAttribute("src") !== url) img.src = url;
    });
  }

  function showVariant(sc, i, bubbleOverride, prepared) {
    if (sc.transparent && !prepared) {
      var request = ++sc.request;
      preparePortrait(sc, i).then(function () {
        if (request === sc.request && sc.imgs[i].naturalWidth) showVariant(sc, i, bubbleOverride, true);
      });
      return;
    }
    sc.index = i;
    if (!sc.engine) sc.imgs.forEach(function (img, k) { img.classList.toggle("on", k === i); });
    if (!sc.bubble) return;
    var text = bubbleOverride !== undefined ? bubbleOverride : sc.variants[i].bubble;
    if (text === undefined || text === null || text === "") {
      sc.bubble.classList.add("jaspe2d__bubble--off");
      return;
    }
    sc.bubble.classList.remove("jaspe2d__bubble--off");
    sc.bubble.classList.add("switching");
    setTimeout(function () {
      sc.bubble.textContent = text;
      sc.bubble.classList.remove("switching");
    }, 220);
  }

  function mountShowcase(el, opts) {
    if (!el || !opts || !opts.variants || !opts.variants.length) return null;
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var box = document.createElement("div");
    box.className = "jaspe2d jaspe2d--showcase";
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", opts.label || "Jaspe, assistante SchoolSafe");
    var imgs = opts.variants.map(function (v, i) {
      var img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      if (i === 0) img.classList.add("on");
      box.appendChild(img);
      return img;
    });
    var bubble = null;
    if (opts.variants.some(function (v) { return v.bubble !== undefined; })) {
      bubble = document.createElement("p");
      bubble.className = "jaspe2d__bubble";
      bubble.textContent = opts.variants[0].bubble || "";
      (opts.bubbleHost || box).appendChild(bubble);
    }
    el.appendChild(box);

    var sc = { box: box, imgs: imgs, bubble: bubble, variants: opts.variants, index: 0, host: el, holdUntil: 0, holdTimer: 0, rotationTimer: 0, transparent: opts.transparent === true, portraits: {}, request: 0, cleanup: [], destroyed: false };
    // The docked layout keeps its complete image. A restrained CSS idle sway
    // supplies presence without deforming anatomy or reviving rejected clips.
    sc.photoOnly = opts.photoOnly === true;
    if (sc.photoOnly) {
      box.classList.add("jaspe2d--portrait");
      var syncPortraitVisibility = function () {
        box.classList.toggle("jaspe2d--paused", document.hidden);
      };
      syncPortraitVisibility();
      document.addEventListener("visibilitychange", syncPortraitVisibility);
      sc.cleanup.push(function () { document.removeEventListener("visibilitychange", syncPortraitVisibility); });
    }
    showcases.push(sc);
    paintShowcase(sc);
    sc.presentationReady = import("./presentation-controller.js").then(function (module) {
      if (sc.destroyed) return false;
      sc.presentation = module.createPresentationController({
        createFallback: function () {
          return {
            play: function (command) {
              var ref = FALLBACK_REF[command.fallback] || FALLBACK_REF.IDLE;
              var idx = sc.variants.findIndex(function (v) { return v.pack === ref.pack && v.key === ref.key; });
              if (sc.bubble && sc.pendingBubble !== undefined) {
                sc.bubble.textContent = sc.pendingBubble;
                sc.bubble.classList.remove("jaspe2d__bubble--off", "switching");
              }
              if (idx >= 0) showVariant(sc, idx, sc.pendingBubble);
              sc.pendingBubble = undefined;
              return true;
            },
            stop: function () { return true; },
            destroy: function () {},
            getState: function () { return { engine: "webp" }; }
          };
        },
        createPrimary: function (context) {
          if (!sc.transparent || sc.photoOnly) return null;
          sc.enginePending = true;
          return import("./live-companion.js?v=physical-controller-02").then(function (live) {
            return live.mountLiveCompanion(box, el, {
              isVisible: context.isVisible,
              isTyping: function () {
                var auth = el.closest && el.closest(".auth-screen");
                return !!auth && auth.classList.contains("auth-is-typing");
              },
              isBust: function () {
                if (typeof opts.isBust === "function") return opts.isBust();
                var auth = el.closest && el.closest(".auth-screen");
                return !!auth && auth.dataset.loginLayout === "welcome" && matchMedia("(max-width: 760px)").matches;
              },
              activityTarget: el.closest && el.closest(".auth-screen") || el
            });
          }).then(function (engine) {
            if (!engine) return null;
            sc.engine = engine;
            return {
              play: function (command) {
                if (command.action === "idle" || matchMedia("(prefers-reduced-motion: reduce)").matches) return engine.stop("intent-idle");
                // Dashboard speech reuses the registered talking sequence until
                // its trusted UI/audio intent ends; never an action from model text.
                return engine.play(command.action, {
                  intensity: command.intensity, source: command.source,
                  continuous: opts.continuousSpeech === true && command.fallback === "SPEAKING"
                });
              },
              stop: function (reason) { return engine.stop(reason); },
              destroy: function () {
                var result = engine.destroy();
                if (sc.engine === engine) sc.engine = null;
                return result;
              },
              getState: function () { return engine.getState(); }
            };
          }).finally(function () { sc.enginePending = false; });
        }
      });
      return sc.presentation.mount({
        host: box,
        surface: opts.surface || "auth",
        isVisible: function () {
          if (typeof opts.isVisible === "function") return !document.hidden && opts.isVisible();
          var screen = el.closest && el.closest(".auth-screen");
          return !document.hidden && (!screen || screen.classList.contains("active")) && (!screen || !screen.classList.contains("auth-jaspe-withdrawn"));
        }
      }).then(function (mounted) {
        if (mounted && sc.queuedIntent) {
          var intent = sc.queuedIntent;
          var queuedBubble = sc.queuedBubble;
          sc.queuedIntent = null;
          sc.queuedBubble = undefined;
          sc.dispatch(intent, queuedBubble);
        }
        return mounted;
      });
    }).catch(function () {
      if (!sc.destroyed) box.dataset.motion = "unavailable";
      return false;
    });

    sc.dispatch = function (intent, bubbleText) {
      if (sc.destroyed) return false;
      sc.pendingBubble = bubbleText;
      if (!sc.presentation) {
        sc.queuedIntent = intent;
        sc.queuedBubble = bubbleText;
        return true;
      }
      return sc.presentation.dispatch(intent);
    };
    sc.stop = function () { return !sc.destroyed && sc.presentation ? sc.presentation.stop("showcase") : false; };
    sc.destroy = function () {
      if (sc.destroyed) return false;
      sc.destroyed = true;
      ++sc.request;
      window.clearInterval(sc.rotationTimer);
      window.clearTimeout(sc.holdTimer);
      sc.cleanup.splice(0).forEach(function (remove) { remove(); });
      if (sc.presentation) sc.presentation.destroy();
      showcases = showcases.filter(function (item) { return item !== sc; });
      box.remove();
      return true;
    };
    sc.getState = function () { return sc.presentation ? sc.presentation.getState() : null; };

    // Compatibilité temporaire des pages de revue historiques ; l'application utilise dispatch().
    sc.react = function (ref, bubbleText, holdMs) {
      var intents = {
        listening: "listen",
        thinking: "think",
        speaking: "speak",
        explain: "explain",
        worried: "error",
        congratulate: "success"
      };
      var kind = ref && intents[ref.key];
      return kind ? sc.dispatch({ kind: kind, holdMs: holdMs, source: "legacy-review" }, bubbleText) : false;
    };

    var rotation = [];
    opts.variants.forEach(function (v, i) { if (v.rotate !== false) rotation.push(i); });

    if (!reduced && !sc.photoOnly && rotation.length > 1) {
      var cursor = 0;
      sc.rotationTimer = setInterval(function () {
        if (sc.transparent || sc.engine || sc.enginePending) return;
        if (document.hidden) return;
        if (Date.now() < sc.holdUntil) return; // une réaction est en cours
        var auth = sc.host.closest && sc.host.closest(".auth-screen");
        if (auth && (!auth.classList.contains("active") || auth.classList.contains("auth-is-typing"))) return; // la saisie prime
        cursor = (cursor + 1) % rotation.length;
        showVariant(sc, rotation[cursor]);
      }, opts.intervalMs || 8000);
    }
    return sc;
  }

  function speak(text, lang) {
    return fetch("/native/jaspe/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: String(text || "").slice(0, 2000), lang: lang === "en" ? "en" : "fr" }) }).then(function (r) {
      if (!r.ok) throw new Error("TTS_" + r.status);
      return r.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var audio = new Audio(url);
      audio.onended = function () { URL.revokeObjectURL(url); };
      return audio.play().then(function () { return true; });
    }).catch(function () { return false; });
  }

  window.SchoolSafeJaspe2d = {
    STATES: STATES,
    init: init,
    setState: setState,
    mount: mount,
    mountShowcase: mountShowcase,
    chat: chat,
    speak: speak,
    onStateChange: function (fn) { listeners.push(fn); },
    getState: function () { return state; },
    isReady: function () { return !!loaded["pack1/idle"]; }
  };
})();
