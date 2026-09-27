/**
 * SchoolSafePhotoEditor — composant réutilisable de préparation d'image de profil.
 *
 * Choisir/capturer → recadrage réel (déplacement X/Y, zoom +/−, slider,
 * recentrer) → valider/annuler → image finale RÉELLEMENT recadrée (canvas,
 * ratio carré, aucune déformation). Souris + tactile.
 *
 * Générique : élève, enseignant, personnel, Parent/Tuteur, personne autorisée.
 * Ne doit PAS être utilisé pour le logo de l'école (parcours séparé).
 *
 * API : window.SchoolSafePhotoEditor.open({ title, onCancel, onValidate }).
 * onValidate reçoit { dataUrl, width, height } — PNG recadré réel.
 */
(function (root) {
  "use strict";

  var OUT_SIZE = 640; // taille de sortie carrée (PNG), nette pour la carte HD

  var active = null; // état de l'éditeur ouvert

  function el(tag, className, textContent) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent != null) node.textContent = textContent;
    return node;
  }

  function buildDom() {
    var backdrop = el("div", "sspe-backdrop");
    var dialog = el("div", "sspe-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    var header = el("div", "sspe-header");
    var title = el("h3", "sspe-title", active.title || "Photo de profil");
    var closeBtn = el("button", "sspe-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Fermer");
    closeBtn.innerHTML = "&times;";
    header.appendChild(title);
    header.appendChild(closeBtn);

    var stage = el("div", "sspe-stage");
    var canvas = document.createElement("canvas");
    canvas.className = "sspe-canvas";
    canvas.width = 320;
    canvas.height = 320;
    stage.appendChild(canvas);
    var frame = el("div", "sspe-frame");
    stage.appendChild(frame);

    var pickRow = el("div", "sspe-actions sspe-actions--pick");
    var pickBtn = el("button", "ss-button ss-button--secondary sspe-btn");
    pickBtn.type = "button";
    pickBtn.innerHTML = '<i data-lucide="image-plus"></i> Choisir une photo';
    var captureBtn = el("button", "ss-button ss-button--secondary sspe-btn");
    captureBtn.type = "button";
    captureBtn.innerHTML = '<i data-lucide="camera"></i> Appareil photo';
    captureBtn.setAttribute("capture", "user");
    pickRow.appendChild(pickBtn);
    pickRow.appendChild(captureBtn);
    var fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.className = "sspe-file-input";
    fileInput.setAttribute("aria-hidden", "true");

    var zoomRow = el("div", "sspe-zoom-row");
    var zoomOut = el("button", "sspe-zoom-btn");
    zoomOut.type = "button";
    zoomOut.textContent = "−";
    zoomOut.setAttribute("aria-label", "Dézoomer");
    var slider = document.createElement("input");
    slider.type = "range";
    slider.className = "sspe-slider";
    slider.min = "100";
    slider.max = "300";
    slider.value = "100";
    slider.setAttribute("aria-label", "Zoom");
    var zoomIn = el("button", "sspe-zoom-btn");
    zoomIn.type = "button";
    zoomIn.textContent = "+";
    zoomIn.setAttribute("aria-label", "Zoomer");
    zoomRow.appendChild(zoomOut);
    zoomRow.appendChild(slider);
    zoomRow.appendChild(zoomIn);

    var hint = el("p", "sspe-hint", "Glissez la photo pour la positionner. Le cadre final reste carré.");

    var footer = el("div", "sspe-actions sspe-actions--footer");
    var resetBtn = el("button", "ss-button ss-button--secondary sspe-btn");
    resetBtn.type = "button";
    resetBtn.innerHTML = '<i data-lucide="rotate-ccw"></i> Réinitialiser';
    var cancelBtn = el("button", "ss-button ss-button--secondary sspe-btn");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Annuler";
    var validateBtn = el("button", "ss-button sspe-btn sspe-btn--primary");
    validateBtn.type = "button";
    validateBtn.innerHTML = '<i data-lucide="check"></i> Valider';
    validateBtn.disabled = true;
    footer.appendChild(resetBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(validateBtn);

    dialog.appendChild(header);
    dialog.appendChild(stage);
    dialog.appendChild(pickRow);
    dialog.appendChild(fileInput);
    dialog.appendChild(zoomRow);
    dialog.appendChild(hint);
    dialog.appendChild(footer);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    return {
      backdrop, dialog, canvas, frame, slider, validateBtn,
      pickBtn, captureBtn, fileInput, zoomIn, zoomOut,
      resetBtn, cancelBtn, closeBtn, stage,
    };
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("Image illisible")); };
      img.src = src;
    });
  }

  function draw(ctx, dom) {
    var st = active;
    var canvas = dom.canvas;
    var ctx2d = canvas.getContext("2d");
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.fillStyle = "#eef1f6";
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    if (!st.img) return;
    // drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh) : le carré affiché
    // correspond à la zone 1:1 de l'image source — recadrage RÉEL.
    var side = Math.min(st.naturalWidth, st.naturalHeight) / st.zoom;
    var sx = (st.naturalWidth - side) / 2 + st.offsetX * side;
    var sy = (st.naturalHeight - side) / 2 + st.offsetY * side;
    ctx2d.drawImage(st.img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
  }

  function clampOffsets(st) {
    var max = (st.zoom - 1) / (2 * st.zoom);
    st.offsetX = Math.max(-max, Math.min(max, st.offsetX));
    st.offsetY = Math.max(-max, Math.min(max, st.offsetY));
  }

  function refreshZoomUI(dom) {
    dom.slider.value = String(Math.round(active.zoom * 100));
  }

  function setZoom(value, dom) {
    active.zoom = Math.max(1, Math.min(3, value));
    clampOffsets(active);
    refreshZoomUI(dom);
    draw(active.ctx, dom);
  }

  function resetView(dom) {
    active.zoom = 1;
    active.offsetX = 0;
    active.offsetY = 0;
    refreshZoomUI(dom);
    draw(active.ctx, dom);
  }

  function bindPointer(dom) {
    var dragging = false;
    var lastX = 0, lastY = 0;

    function pointerDown(clientX, clientY) {
      dragging = true;
      lastX = clientX;
      lastY = clientY;
    }
    function pointerMove(clientX, clientY) {
      if (!dragging || !active.img) return;
      var rect = dom.canvas.getBoundingClientRect();
      var scale = (Math.min(active.naturalWidth, active.naturalHeight) / active.zoom) / rect.width;
      active.offsetX -= (clientX - lastX) * scale / Math.min(active.naturalWidth, active.naturalHeight);
      active.offsetY -= (clientY - lastY) * scale / Math.min(active.naturalWidth, active.naturalHeight);
      lastX = clientX;
      lastY = clientY;
      clampOffsets(active);
      draw(active.ctx, dom);
    }
    function pointerUp() { dragging = false; }

    dom.canvas.addEventListener("mousedown", function (e) { pointerDown(e.clientX, e.clientY); });
    window.addEventListener("mousemove", function (e) { pointerMove(e.clientX, e.clientY); });
    window.addEventListener("mouseup", pointerUp);
    dom.canvas.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) pointerDown(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    dom.canvas.addEventListener("touchmove", function (e) {
      if (e.touches.length === 1) {
        pointerMove(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
      }
    }, { passive: false });
    dom.canvas.addEventListener("touchend", pointerUp);

    dom.zoomIn.addEventListener("click", function () { setZoom(active.zoom * 1.2, dom); });
    dom.zoomOut.addEventListener("click", function () { setZoom(active.zoom / 1.2, dom); });
    dom.slider.addEventListener("input", function () {
      setZoom(Number(dom.slider.value) / 100, dom);
    });
    dom.resetBtn.addEventListener("click", function () { resetView(dom); });
  }

  function close(backdrop) {
    backdrop.remove();
    if (active && active.fileInputUrl) URL.revokeObjectURL(active.fileInputUrl);
    active = null;
  }

  /**
   * Ouvre l'éditeur. options : { title, onCancel, onValidate }.
   * onValidate({ dataUrl, width, height }) reçoit le PNG carré recadré.
   */
  function open(options) {
    if (active) return null;
    active = {
      title: (options && options.title) || "Photo de profil",
      img: null,
      naturalWidth: 0,
      naturalHeight: 0,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      ctx: null,
      fileInputUrl: null,
    };

    var dom = buildDom();
    active.ctx = dom.canvas.getContext("2d");
    draw(active.ctx, dom);
    bindPointer(dom);

    function handleFile(file) {
      if (!file || !/^image\//.test(file.type)) return;
      if (active.fileInputUrl) URL.revokeObjectURL(active.fileInputUrl);
      active.fileInputUrl = URL.createObjectURL(file);
      loadImage(active.fileInputUrl).then(function (img) {
        active.img = img;
        active.naturalWidth = img.naturalWidth;
        active.naturalHeight = img.naturalHeight;
        active.zoom = 1;
        active.offsetX = 0;
        active.offsetY = 0;
        refreshZoomUI(dom);
        dom.validateBtn.disabled = false;
        draw(active.ctx, dom);
      }).catch(function (err) {
        if (options && typeof options.onError === "function") options.onError(err);
      });
    }

    dom.pickBtn.addEventListener("click", function () { dom.fileInput.click(); });
    dom.captureBtn.addEventListener("click", function () {
      // capture = environ appareil photo sur mobile ; sinon sélecteur de fichier
      dom.fileInput.setAttribute("capture", "user");
      dom.fileInput.click();
    });
    dom.fileInput.addEventListener("change", function () {
      handleFile(dom.fileInput.files && dom.fileInput.files[0]);
    });

    dom.closeBtn.addEventListener("click", function () {
      close(dom.backdrop);
      if (options && typeof options.onCancel === "function") options.onCancel();
    });
    dom.cancelBtn.addEventListener("click", function () {
      close(dom.backdrop);
      if (options && typeof options.onCancel === "function") options.onCancel();
    });
    dom.backdrop.addEventListener("click", function (event) {
      if (event.target === dom.backdrop) {
        close(dom.backdrop);
        if (options && typeof options.onCancel === "function") options.onCancel();
      }
    });

    dom.validateBtn.addEventListener("click", function () {
      if (!active.img) return;
      // Sortie carrée OUT_SIZE : recadrage RÉEL depuis l'image source,
      // jamais un simple object-fit cover de l'image d'origine.
      var out = document.createElement("canvas");
      out.width = OUT_SIZE;
      out.height = OUT_SIZE;
      var ctx = out.getContext("2d");
      var side = Math.min(active.naturalWidth, active.naturalHeight) / active.zoom;
      var sx = (active.naturalWidth - side) / 2 + active.offsetX * side;
      var sy = (active.naturalHeight - side) / 2 + active.offsetY * side;
      ctx.drawImage(active.img, sx, sy, side, side, 0, 0, OUT_SIZE, OUT_SIZE);
      var dataUrl = out.toDataURL("image/png");
      close(dom.backdrop);
      if (options && typeof options.onValidate === "function") {
        options.onValidate({ dataUrl: dataUrl, width: OUT_SIZE, height: OUT_SIZE });
      }
    });

    if (root.icons && typeof root.icons === "function") root.icons();
    return {
      close: function () { close(dom.backdrop); },
    };
  }

  root.SchoolSafePhotoEditor = { open: open, OUTPUT_SIZE: OUT_SIZE };
})(window);
