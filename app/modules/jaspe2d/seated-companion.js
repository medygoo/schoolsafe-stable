/* Registered 2x2 pose sheets. Only trusted UI states select an action. */
(function (global) {
  "use strict";
  var assetRoot = new URL("../../assets/jaspe2d/assise-v1/", document.currentScript.src).href;
  var sheets = { idle: "sourire", listen: "sourire", smile: "sourire", speak: "parole", speakBoth: "parole-deux-mains", think: "reflexion", read: "lecture", neutral: "sourire", rise: "se-lever", sit: "se-lever", standExplain: "debout-parole" };
  var sequences = {
    idle: [[0, 4600], [1, 500], [2, 110], [3, 320], [0, 3600]],
    listen: [[0, 2700], [2, 110], [0, 1900]],
    smile: [[0, 450], [1, 550], [3, 1000], [2, 110], [3, 500], [0, 600]],
    speak: [[0, 240], [1, 280], [2, 340], [3, 290], [0, 250]],
    speakBoth: [[0, 260], [1, 320], [2, 360], [1, 210], [3, 300], [0, 240]],
    think: [[0, 650], [1, 430], [2, 400], [3, 300], [2, 340], [3, 420], [1, 400], [0, 850]],
    read: [[0, 900], [1, 1700], [2, 600], [1, 1000], [3, 900]],
    neutral: [[0, 5000]],
    rise: [[0, 220], [1, 230], [2, 230], [3, 220]],
    sit: [[3, 180], [2, 180], [1, 180], [0, 180]],
    standExplain: [[0, 300], [1, 320], [2, 360], [1, 220], [3, 320], [0, 260]]
  };
  var images = new Map();

  function load(url) {
    if (!images.has(url)) images.set(url, new Promise(function (resolve) {
      var image = new Image();
      image.onload = function () { resolve(true); };
      image.onerror = function () { resolve(false); }; // Keep the last visible pose; do not retry a missing sheet every frame.
      image.src = url;
    }));
    return images.get(url);
  }

  function mount(host, options) {
    options = options || {};
    var layers = [document.createElement("span"), document.createElement("span")];
    var desk = document.createElement("span");
    host.classList.add("jaspe-seated");
    host.setAttribute("aria-hidden", "true");
    layers.forEach(function (layer) { layer.className = "jaspe-seated__frame"; host.appendChild(layer); });
    desk.className = "jaspe-seated__desk";
    host.appendChild(desk);
    var media = matchMedia("(prefers-reduced-motion: reduce)");
    var action = "idle", index = 0, active = true, inView = true, timer = 0;
    var layerIndex = 0, generation = 0, deadline = 0, destroyed = false, idleCycles = 0;
    var target = "idle", request = 0, loadingStand = false;
    var theme = options.theme || (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

    function url(name) { return assetRoot + sheets[name] + (theme === "dark" ? "-sombre.png" : "-clair.png"); }
    function clearTimer() { global.clearTimeout(timer); timer = 0; }
    function running() { return active && inView && !document.hidden && !destroyed; }

    async function paint(frame, instant) {
      var ticket = ++generation;
      var source = url(action);
      if (!await load(source) || ticket !== generation || destroyed) return false;
      var next = layers[1 - layerIndex];
      next.style.backgroundImage = 'url("' + source + '")';
      next.style.backgroundPosition = (frame % 2 ? "100%" : "0%") + " " + (frame > 1 ? "100%" : "0%");
      host.classList.toggle("jaspe-seated--still", media.matches || !!instant);
      next.style.opacity = "1";
      layers[layerIndex].style.opacity = "0";
      layerIndex = 1 - layerIndex;
      // Freeze the wooden front apron: the desk does not breathe with the girl.
      desk.style.backgroundImage = 'url("' + (action === "standExplain" || action === "sit" ? url("rise") : source) + '")';
      host.dataset.action = action;
      host.dataset.posture = action === "rise" ? "rising" : action === "sit" ? "sitting" : action === "standExplain" ? "standing" : "seated";
      host.dataset.frame = String(frame);
      host.dataset.theme = theme;
      host.dataset.ready = "true";
      return true;
    }

    function schedule() {
      clearTimer();
      host.dataset.playing = String(running() && !media.matches);
      if (!running() || media.matches) return;
      timer = global.setTimeout(step, sequences[action][index][1]);
    }

    async function step() {
      if (!running() || media.matches) return;
      if (deadline && Date.now() >= deadline) { setAction("idle"); return; }
      if (index === sequences[action].length - 1) {
        if (action === "rise") { enter("standExplain"); return; }
        if (action === "sit") { enter(target); return; }
      }
      index = (index + 1) % sequences[action].length;
      if (action === "idle" && index === 0 && options.autoRead !== false && ++idleCycles >= 3) {
        idleCycles = 0;
        setAction("read", { duration: 6200 });
        return;
      }
      if (await paint(sequences[action][index][0])) schedule();
    }

    function enter(next, startIndex) {
      clearTimer();
      action = next;
      index = startIndex || 0;
      paint(sequences[action][index][0], media.matches).then(function (painted) { if (painted) schedule(); });
    }

    function setAction(next, settings) {
      if (!Object.prototype.hasOwnProperty.call(sheets, next) || next === "rise" || next === "sit" || destroyed) return false;
      settings = settings || {};
      var ticket = ++request;
      target = next;
      deadline = settings.duration > 0 ? Date.now() + settings.duration : 0;
      if (next === "standExplain") {
        // Updating a live speech duration must not restart the rise or the gesture.
        if (action === "rise" || action === "standExplain") { loadingStand = false; return true; }
        clearTimer();
        ++generation;
        loadingStand = true;
        var requestedTheme = theme;
        Promise.all([load(url("rise")), load(url("standExplain"))]).then(function (ready) {
          if (ticket !== request || destroyed || requestedTheme !== theme) return;
          loadingStand = false;
          if (!ready.every(Boolean)) { setAction("speakBoth", settings); return; }
          var start = action === "sit" ? sequences.sit[index][0] : 0;
          enter(media.matches ? "standExplain" : "rise", media.matches ? 0 : start);
        });
      } else {
        loadingStand = false;
        if (!media.matches && (action === "standExplain" || action === "rise" || action === "sit") && next !== "neutral") {
          var frame = action === "standExplain" ? 3 : sequences[action][index][0];
          enter("sit", 3 - frame);
        } else enter(next);
      }
      return true;
    }

    function refresh() {
      clearTimer();
      if (!running()) {
        ++generation;
        host.dataset.playing = "false";
        return;
      }
      if (deadline && Date.now() >= deadline) { setAction("idle"); return; }
      if (loadingStand) { setAction(target, { duration: deadline ? Math.max(1, deadline - Date.now()) : 0 }); return; }
      if (media.matches) { action = target; index = 0; }
      paint(sequences[action][index][0], true).then(function (painted) { if (painted) schedule(); });
    }
    function syncTheme() {
      var next = options.theme || (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
      if (next !== theme) { theme = next; refresh(); }
    }
    var observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    var visibility = new IntersectionObserver(function (entries) { inView = entries[0].isIntersecting; refresh(); });
    visibility.observe(host);
    media.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();
    return {
      setAction: setAction,
      setActive: function (value) {
        value = !!value;
        if (value === active) return;
        active = value;
        if (!active) { ++request; loadingStand = false; target = action = "idle"; index = 0; deadline = 0; idleCycles = 0; }
        refresh();
      },
      destroy: function () {
        destroyed = true;
        ++request;
        ++generation;
        clearTimer();
        observer.disconnect();
        visibility.disconnect();
        media.removeEventListener("change", refresh);
        document.removeEventListener("visibilitychange", refresh);
        host.replaceChildren();
      }
    };
  }
  global.SchoolSafeJaspeSeated = { mount: mount };
})(window);
