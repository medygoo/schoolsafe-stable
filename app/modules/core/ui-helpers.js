/**
 * SchoolSafe UI Helpers
 *
 * Petits utilitaires de création DOM/HTML pour le Design System --ss-*.
 * Aucune dépendance métier.
 */

(function (root) {
  "use strict";

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function buildAttrs(attrs) {
    if (!attrs || typeof attrs !== "object") return "";
    return Object.entries(attrs)
      .filter(function (_ref) { return _ref[1] != null && _ref[1] !== false; })
      .map(function (_ref) {
        var k = _ref[0], v = _ref[1];
        if (v === true) return " " + k;
        return " " + k + '="' + escapeHtml(String(v)) + '"';
      })
      .join("");
  }

  /**
   * Génère un badge Design System.
   *
   * @param {Object} p
   * @param {string} p.label - Texte du badge
   * @param {string} [p.variant='default'] - default | primary | success | warning | error | info | done | pending | active | danger | outline
   * @param {string} [p.icon] - Nom de l'icône Lucide
   * @param {boolean} [p.dot] - Affiche un point coloré avant le texte
   * @param {string} [p.size] - sm
   * @param {string} [p.className='']
   * @param {Object} [p.attrs={}]
   */
  function ssBadge(p) {
    p = p || {};
    var label = p.label != null ? String(p.label) : "";
    var variant = p.variant || "default";
    var classes = ["ss-badge"];
    if (variant && variant !== "default") classes.push("ss-badge--" + variant);
    if (p.dot) classes.push("ss-badge--dot");
    if (p.size) classes.push("ss-badge--" + p.size);
    if (p.className) classes.push(p.className);

    var attrs = Object.assign({}, p.attrs || {});
    attrs.class = classes.join(" ");

    var iconHtml = p.icon ? '<i data-lucide="' + escapeHtml(p.icon) + '"></i>' : "";
    return "<span" + buildAttrs(attrs) + ">" + iconHtml + escapeHtml(label) + "</span>";
  }

  /**
   * Génère un bouton Design System.
   *
   * @param {Object} p
   * @param {string} [p.label] - Texte du bouton
   * @param {string} [p.variant='primary'] - primary | secondary | ghost | danger | accent
   * @param {string} [p.size] - sm | lg
   * @param {string} [p.icon] - Nom de l'icône Lucide (ajoute <i data-lucide="...">)
   * @param {boolean} [p.disabled=false]
   * @param {boolean} [p.loading=false]
   * @param {boolean} [p.full=false]
   * @param {string} [p.type='button']
   * @param {string} [p.className=''] - Classes additionnelles
   * @param {Object} [p.attrs={}] - Attributs HTML supplémentaires
   */
  function ssButton(p) {
    p = p || {};
    var label = p.label != null ? String(p.label) : "";
    var variant = p.variant || "primary";
    var classes = ["ss-button"];
    if (variant && variant !== "primary") classes.push("ss-button--" + variant);
    if (p.size) classes.push("ss-button--" + p.size);
    if (p.full) classes.push("ss-button--full");
    if (p.loading) classes.push("ss-button--loading");
    if (p.className) classes.push(p.className);

    var iconHtml = p.icon ? '<i data-lucide="' + escapeHtml(p.icon) + '"></i>' : "";
    var content = iconHtml + (iconHtml && label ? " " : "") + escapeHtml(label);
    var attrs = Object.assign({}, p.attrs || {});
    attrs.type = p.type || "button";
    attrs.class = classes.join(" ");
    if (p.disabled) {
      attrs.disabled = true;
      attrs["aria-disabled"] = "true";
    }

    return "<button" + buildAttrs(attrs) + ">" + content + "</button>";
  }

  /**
   * Génère un bouton icône Design System.
   *
   * @param {Object} p
   * @param {string} p.icon - Nom de l'icône Lucide
   * @param {string} [p.variant] - light | danger
   * @param {string} [p.size] - small
   * @param {string} [p.title] - Attribut title / aria-label
   * @param {boolean} [p.disabled=false]
   * @param {string} [p.className='']
   * @param {Object} [p.attrs={}]
   */
  function ssIconButton(p) {
    p = p || {};
    var classes = ["ss-icon-button"];
    if (p.variant) classes.push("ss-icon-button--" + p.variant);
    if (p.size) classes.push("ss-icon-button--" + p.size);
    if (p.className) classes.push(p.className);

    var attrs = Object.assign({}, p.attrs || {});
    attrs.type = p.type || "button";
    attrs.class = classes.join(" ");
    if (p.title) {
      attrs.title = p.title;
      attrs["aria-label"] = p.title;
    }
    if (p.disabled) {
      attrs.disabled = true;
      attrs["aria-disabled"] = "true";
    }

    return "<button" + buildAttrs(attrs) + '><i data-lucide="' + escapeHtml(p.icon) + '"></i></button>';
  }

  /**
   * Génère un état vide / chargement / erreur / indisponible Design System.
   *
   * @param {Object} p
   * @param {string} p.type - loading | empty | error | unavailable | denied | success
   * @param {string} [p.title]
   * @param {string} [p.message]
   * @param {string} [p.icon] - Nom de l'icône Lucide (sinon icône par défaut selon le type)
   * @param {Object} [p.action] - Bouton d'action : { label, variant, icon, attrs }
   * @param {Object} [p.retry] - Bouton retry : { label, attrs } (shortcut pour action)
   * @param {string} [p.details] - Détails techniques affichés en petit
   * @param {string} [p.size] - compact | inline
   * @param {string} [p.className='']
   * @param {Object} [p.attrs={}]
   */
  function ssState(p) {
    p = p || {};
    var type = p.type || "empty";
    var icon = p.icon;
    if (!icon) {
      icon = {
        loading: "loader-2",
        empty: "inbox",
        error: "alert-circle",
        unavailable: "wifi-off",
        denied: "shield-off",
        success: "check-circle"
      }[type] || "info";
    }

    var title = p.title != null ? String(p.title) : "";
    var message = p.message != null ? String(p.message) : "";
    var details = p.details != null ? String(p.details) : "";

    var classes = ["ss-state", "ss-state--" + type];
    if (p.size) classes.push("ss-state--" + p.size);
    if (p.className) classes.push(p.className);

    var attrs = Object.assign({}, p.attrs || {});
    attrs.class = classes.join(" ");
    attrs.role = type === "error" || type === "unavailable" ? "alert" : "status";
    attrs["aria-live"] = type === "error" ? "assertive" : "polite";

    var actionHtml = "";
    if (p.action) {
      actionHtml = ssButton({
        label: p.action.label,
        variant: p.action.variant || "secondary",
        icon: p.action.icon,
        attrs: p.action.attrs || {}
      });
    } else if (p.retry) {
      actionHtml = ssButton({
        label: p.retry.label || "Réessayer",
        variant: "secondary",
        icon: "rotate-ccw",
        attrs: p.retry.attrs || {}
      });
    }

    var iconHtml = '<span class="ss-state__icon"><i data-lucide="' + escapeHtml(icon) + '"></i></span>';
    var titleHtml = title ? '<h3 class="ss-state__title">' + escapeHtml(title) + '</h3>' : "";
    var messageHtml = message ? '<p class="ss-state__text">' + escapeHtml(message) + '</p>' : "";
    var detailsHtml = details ? '<p class="ss-state__details">' + escapeHtml(details) + '</p>' : "";

    var bodyHtml = titleHtml + messageHtml + detailsHtml;
    if (p.size === "inline" && bodyHtml) {
      bodyHtml = '<div class="ss-state__body">' + bodyHtml + '</div>';
    }

    return "<div" + buildAttrs(attrs) + ">" + iconHtml + bodyHtml + (actionHtml ? '<div class="ss-state__action">' + actionHtml + '</div>' : "") + "</div>";
  }

  /**
   * Génère un tableau Design System.
   *
   * @param {Object} p
   * @param {Array} p.headers - Colonnes : string ou { key, label, align, hideSm, hideXs }
   * @param {Array} p.rows - Lignes : string HTML (<tr>...</tr>) OU array de cellules
   * @param {string} [p.empty] - Message affiché quand aucune ligne n'existe
   * @param {string} [p.emptyTitle] - Titre de l'état vide
   * @param {boolean} [p.loading]
   * @param {string} [p.error] - Message d'erreur
   * @param {string} [p.className='']
   * @param {Object} [p.attrs={}]
   * @param {string} [p.wrapClassName='']
   * @param {Object} [p.wrapAttrs={}]
   * @param {boolean} [p.responsive=true]
   * @param {boolean} [p.compact]
   * @param {boolean} [p.striped]
   */
  function ssTable(p) {
    p = p || {};
    var headers = p.headers || [];
    var rows = p.rows || [];
    var empty = p.empty != null ? String(p.empty) : "Aucune donnée.";
    var emptyTitle = p.emptyTitle != null ? String(p.emptyTitle) : "";
    var responsive = p.responsive !== false;
    var compact = !!p.compact;
    var striped = !!p.striped;

    var tableClasses = ["ss-table"];
    if (responsive) tableClasses.push("ss-table--responsive");
    if (compact) tableClasses.push("ss-table--compact");
    if (striped) tableClasses.push("ss-table--striped");
    if (p.className) tableClasses.push(p.className);

    var tableAttrs = Object.assign({}, p.attrs || {});
    tableAttrs.class = tableClasses.join(" ");

    var headerHtml = headers.map(function (h) {
      var label = typeof h === "string" ? h : (h.label || h.key || "");
      var classes = [];
      if (typeof h === "object" && h) {
        if (h.align === "right") classes.push("ss-table__cell--right");
        else if (h.align === "center") classes.push("ss-table__cell--center");
        if (h.hideSm) classes.push("ss-table__cell--hide-sm");
        if (h.hideXs) classes.push("ss-table__cell--hide-xs");
      }
      return "<th" + (classes.length ? ' class="' + classes.join(" ") + '"' : "") + ">" + escapeHtml(label) + "</th>";
    }).join("");

    var bodyHtml = "";
    if (p.loading) {
      bodyHtml = '<tr class="ss-table__empty-row"><td colspan="' + Math.max(1, headers.length) + '">' +
        ssState({ type: "loading", title: "Chargement…", message: "Veuillez patienter.", size: "inline" }) +
        "</td></tr>";
    } else if (p.error) {
      bodyHtml = '<tr class="ss-table__empty-row"><td colspan="' + Math.max(1, headers.length) + '">' +
        ssState({ type: "error", title: "Erreur", message: p.error, size: "inline" }) +
        "</td></tr>";
    } else if (typeof rows === "string") {
      bodyHtml = rows.trim() ? rows : '<tr class="ss-table__empty-row"><td colspan="' + Math.max(1, headers.length) + '">' +
        ssState({ type: "empty", title: emptyTitle, message: empty, size: "inline" }) +
        "</td></tr>";
    } else if (!rows.length) {
      bodyHtml = '<tr class="ss-table__empty-row"><td colspan="' + Math.max(1, headers.length) + '">' +
        ssState({ type: "empty", title: emptyTitle, message: empty, size: "inline" }) +
        "</td></tr>";
    } else {
      bodyHtml = rows.map(function (row) {
        if (typeof row === "string") return row;
        if (!Array.isArray(row)) return "";
        var cells = row.map(function (cell, idx) {
          var h = headers[idx];
          var classes = [];
          if (typeof h === "object" && h) {
            if (h.align === "right") classes.push("ss-table__cell--right");
            else if (h.align === "center") classes.push("ss-table__cell--center");
            if (h.hideSm) classes.push("ss-table__cell--hide-sm");
            if (h.hideXs) classes.push("ss-table__cell--hide-xs");
          }
          return "<td" + (classes.length ? ' class="' + classes.join(" ") + '"' : "") + ">" + (cell == null ? "" : String(cell)) + "</td>";
        }).join("");
        return "<tr>" + cells + "</tr>";
      }).join("");
    }

    var tableHtml = "<table" + buildAttrs(tableAttrs) + "><thead><tr>" + headerHtml + "</tr></thead><tbody>" + bodyHtml + "</tbody></table>";

    var wrapClasses = ["ss-table-wrap"];
    if (p.wrapClassName) wrapClasses.push(p.wrapClassName);

    var wrapAttrs = Object.assign({}, p.wrapAttrs || {});
    wrapAttrs.class = wrapClasses.join(" ");

    return "<div" + buildAttrs(wrapAttrs) + ">" + tableHtml + "</div>";
  }

  /**
   * Génère un input Design System.
   *
   * @param {Object} p
   * @param {string} p.type - type de l'input (text, email, number, password, etc.)
   * @param {string} [p.name]
   * @param {string} [p.id]
   * @param {string} [p.value]
   * @param {string} [p.placeholder]
   * @param {boolean} [p.required]
   * @param {boolean} [p.disabled]
   * @param {boolean} [p.readonly]
   * @param {string} [p.className]
   * @param {Object} [p.attrs={}] - Attributs supplémentaires
   */
  function ssInput(p) {
    p = p || {};
    var attrs = Object.assign({}, p.attrs || {});
    attrs.type = p.type || "text";
    if (p.name) attrs.name = p.name;
    if (p.id) attrs.id = p.id;
    if (p.placeholder) attrs.placeholder = p.placeholder;
    if (p.value != null) attrs.value = String(p.value);
    if (p.required) attrs.required = true;
    if (p.disabled) attrs.disabled = true;
    if (p.readonly) attrs.readonly = true;
    if (p.min != null) attrs.min = String(p.min);
    if (p.max != null) attrs.max = String(p.max);
    if (p.step != null) attrs.step = String(p.step);
    if (p.pattern) attrs.pattern = p.pattern;
    if (p.maxlength != null) attrs.maxlength = String(p.maxlength);
    if (p.minlength != null) attrs.minlength = String(p.minlength);
    if (p.inputmode) attrs.inputmode = p.inputmode;
    if (p.autocomplete) attrs.autocomplete = p.autocomplete;
    if (p.accept) attrs.accept = p.accept;
    if (p.multiple) attrs.multiple = true;

    var classes = ["ss-input"];
    if (p.className) classes.push(p.className);
    attrs.class = classes.join(" ");

    return "<input" + buildAttrs(attrs) + ">";
  }

  /**
   * Génère un select Design System.
   *
   * @param {Object} p
   * @param {string} [p.name]
   * @param {string} [p.id]
   * @param {boolean} [p.required]
   * @param {boolean} [p.disabled]
   * @param {Array} p.options - strings ou { value, label, selected }
   * @param {string} [p.value] - valeur sélectionnée
   * @param {string} [p.className]
   * @param {Object} [p.attrs={}]
   */
  function ssSelect(p) {
    p = p || {};
    var attrs = Object.assign({}, p.attrs || {});
    if (p.name) attrs.name = p.name;
    if (p.id) attrs.id = p.id;
    if (p.required) attrs.required = true;
    if (p.disabled) attrs.disabled = true;
    if (p.multiple) attrs.multiple = true;

    var classes = ["ss-select"];
    if (p.className) classes.push(p.className);
    attrs.class = classes.join(" ");

    var options = p.options || [];
    var selectedValue = p.value;
    var optionsHtml = options.map(function (opt) {
      var value = typeof opt === "string" ? opt : (opt.value != null ? String(opt.value) : "");
      var label = typeof opt === "string" ? opt : (opt.label != null ? String(opt.label) : value);
      var isSelected = typeof opt === "object" && opt.selected;
      if (selectedValue != null && value === String(selectedValue)) isSelected = true;
      return '<option value="' + escapeHtml(value) + '"' + (isSelected ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
    }).join("");

    return "<select" + buildAttrs(attrs) + ">" + optionsHtml + "</select>";
  }

  /**
   * Génère un textarea Design System.
   *
   * @param {Object} p
   * @param {string} [p.name]
   * @param {string} [p.id]
   * @param {string} [p.value]
   * @param {number} [p.rows=3]
   * @param {string} [p.placeholder]
   * @param {boolean} [p.required]
   * @param {boolean} [p.disabled]
   * @param {boolean} [p.readonly]
   * @param {string} [p.className]
   * @param {Object} [p.attrs={}]
   */
  function ssTextarea(p) {
    p = p || {};
    var attrs = Object.assign({}, p.attrs || {});
    if (p.name) attrs.name = p.name;
    if (p.id) attrs.id = p.id;
    if (p.placeholder) attrs.placeholder = p.placeholder;
    if (p.required) attrs.required = true;
    if (p.disabled) attrs.disabled = true;
    if (p.readonly) attrs.readonly = true;
    if (p.rows != null) attrs.rows = String(p.rows);

    var classes = ["ss-textarea"];
    if (p.className) classes.push(p.className);
    attrs.class = classes.join(" ");

    return "<textarea" + buildAttrs(attrs) + ">" + escapeHtml(p.value != null ? String(p.value) : "") + "</textarea>";
  }

  /**
   * Génère un champ de formulaire Design System (label + champ + message).
   *
   * Le contenu HTML du champ est passé par le caller (généré par ssInput,
   * ssSelect, ssTextarea, etc.). Seules les valeurs textuelles label/help/error
   * sont échappées.
   *
   * @param {Object} p
   * @param {string} p.label - Label du champ
   * @param {string} [p.labelFor] - Valeur de l'attribut for du label
   * @param {string} p.inputHtml - HTML du champ (input/select/textarea…)
   * @param {string} [p.help] - Texte d'aide
   * @param {string} [p.error] - Message d'erreur
   * @param {boolean} [p.required] - Ajoute l'indicateur requis
   * @param {string} [p.className] - Classes additionnelles
   * @param {Object} [p.attrs={}] - Attributs HTML supplémentaires sur le conteneur
   */
  function ssField(p) {
    p = p || {};
    var label = p.label != null ? String(p.label) : "";
    var labelFor = p.labelFor != null ? String(p.labelFor) : "";
    var inputHtml = p.inputHtml || "";
    var help = p.help != null ? String(p.help) : "";
    var error = p.error != null ? String(p.error) : "";
    var required = !!p.required;

    var classes = ["ss-field"];
    if (error) classes.push("ss-field--error");
    if (p.className) classes.push(p.className);

    var attrs = Object.assign({}, p.attrs || {});
    attrs.class = classes.join(" ");

    var labelClass = "ss-label" + (required ? " ss-label--required" : "");
    var labelHtml = label ? '<label class="' + labelClass + '"' + (labelFor ? ' for="' + escapeHtml(labelFor) + '"' : "") + ">" + escapeHtml(label) + "</label>" : "";
    var helpHtml = help ? '<p class="ss-help-text">' + escapeHtml(help) + "</p>" : "";
    var errorHtml = error ? '<p class="ss-validation-message">' + escapeHtml(error) + "</p>" : "";

    return "<div" + buildAttrs(attrs) + ">" + labelHtml + inputHtml + helpHtml + errorHtml + "</div>";
  }

  /**
   * Crée et affiche une modale Design System.
   *
   * @param {Object} p
   * @param {string} [p.title] - Titre de la modale
   * @param {string} [p.subtitle] - Sous-titre / message introductif
   * @param {string} [p.content] - Contenu HTML libre
   * @param {string} [p.size='md'] - sm | md | lg | xl | full
   * @param {boolean} [p.closeButton=true] - Bouton fermer dans le header
   * @param {boolean} [p.closeOnBackdrop=true] - Fermer au clic sur le fond
   * @param {boolean} [p.closeOnEscape=true] - Fermer avec Échap
   * @param {HTMLElement} [p.focusReturn] - Élément à focusser à la fermeture
   * @param {Function} [p.onClose] - Callback avant fermeture. Retourner false annule.
   * @param {string} [p.className] - Classes additionnelles sur l’overlay
   * @param {Array} [p.actions] - Boutons footer : { label, variant, icon, type, attrs, onClick, disabled, loading, closeOnClick }
   * @param {string} [p.error] - Message d’erreur affiché dans le corps
   * @returns {Object} { element, close, content, footer, setLoading, setError, isOpen }
   */
  function ssModal(p) {
    p = p || {};
    var id = "ss-modal-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
    var title = p.title != null ? String(p.title) : "";
    var subtitle = p.subtitle != null ? String(p.subtitle) : "";
    var content = p.content || "";
    var size = p.size || "md";
    var closeButton = p.closeButton !== false;
    var closeOnBackdrop = p.closeOnBackdrop !== false;
    var closeOnEscape = p.closeOnEscape !== false;

    var sizeStyles = {
      sm: "max-width:360px;",
      md: "max-width:520px;",
      lg: "max-width:720px;",
      xl: "max-width:960px;",
      full: "max-width:calc(100vw - var(--ss-space-8));"
    };

    var overlay = document.createElement("div");
    overlay.className = "ss-modal-overlay is-open" + (p.className ? " " + p.className : "");
    overlay.id = id;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("tabindex", "-1");
    if (title) overlay.setAttribute("aria-labelledby", id + "-title");

    var headerHtml = "";
    if (title || closeButton) {
      headerHtml =
        '<div class="ss-modal__header">' +
        (title ? '<h3 class="ss-modal__title" id="' + id + '-title">' + escapeHtml(title) + "</h3>" : "<div></div>") +
        (closeButton ? ssIconButton({ icon: "x", title: "Fermer", attrs: { "data-modal-close": "true", type: "button" } }) : "") +
        "</div>";
    }

    var subtitleHtml = subtitle ? '<p class="ss-modal__subtitle">' + escapeHtml(subtitle) + "</p>" : "";
    var errorHtml = p.error
      ? '<div class="ss-modal__error">' +
        ssState({ type: "error", title: "Erreur", message: p.error, size: "compact" }) +
        "</div>"
      : "";
    var bodyHtml = '<div class="ss-modal__body">' + subtitleHtml + errorHtml + '<div class="ss-modal__content">' + content + "</div></div>";

    var actions = p.actions || [];
    var footerHtml = "";
    if (actions.length) {
      var buttonsHtml = actions
        .map(function (action, idx) {
          return ssButton({
            label: action.label || "",
            variant: action.variant || (idx === actions.length - 1 ? "primary" : "secondary"),
            icon: action.icon,
            type: action.type,
            disabled: action.disabled,
            loading: action.loading,
            attrs: Object.assign({ "data-action-index": String(idx) }, action.attrs || {})
          });
        })
        .join("");
      footerHtml = '<div class="ss-modal__footer">' + buttonsHtml + "</div>";
    }

    overlay.innerHTML =
      '<div class="ss-modal" style="' + (sizeStyles[size] || sizeStyles.md) + '">' +
      headerHtml +
      bodyHtml +
      footerHtml +
      "</div>";
    document.body.appendChild(overlay);

    var isOpen = true;
    var activeElement = document.activeElement;

    function setError(message) {
      var existing = overlay.querySelector(".ss-modal__error");
      if (existing) existing.remove();
      if (!message) return;
      var body = overlay.querySelector(".ss-modal__body");
      var errorDiv = document.createElement("div");
      errorDiv.className = "ss-modal__error";
      errorDiv.innerHTML = ssState({
        type: "error",
        title: "Erreur",
        message: message,
        size: "compact"
      });
      body.insertBefore(errorDiv, body.firstChild);
    }

    function setLoading(loading) {
      overlay.classList.toggle("is-loading", !!loading);
      overlay.querySelectorAll(".ss-modal__footer button").forEach(function (btn) {
        btn.disabled = !!loading;
      });
    }

    function close() {
      if (!isOpen) return;
      if (p.onClose && p.onClose() === false) return;
      isOpen = false;
      overlay.classList.remove("is-open");
      document.removeEventListener("keydown", onKeyDown);
      setTimeout(function () {
        overlay.remove();
        var returnEl = p.focusReturn || activeElement;
        if (returnEl && returnEl.focus) {
          try {
            returnEl.focus();
          } catch (_) {}
        }
      }, 200);
    }

    function onKeyDown(e) {
      if (e.key === "Escape" && closeOnEscape) {
        e.preventDefault();
        close();
      }
    }

    if (closeOnBackdrop) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) close();
      });
    }

    overlay.querySelectorAll("[data-modal-close]").forEach(function (btn) {
      btn.addEventListener("click", close);
    });

    overlay.querySelectorAll("[data-action-index]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        var idx = parseInt(btn.getAttribute("data-action-index"), 10);
        var action = actions[idx];
        if (action && action.onClick) {
          var result = action.onClick(e, {
            modal: overlay,
            close: close,
            setLoading: setLoading,
            setError: setError
          });
          if (result === false) return;
        }
        if (!action || action.closeOnClick !== false) close();
      });
    });

    document.addEventListener("keydown", onKeyDown);

    setTimeout(function () {
      var focusable = overlay.querySelector(
        'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) focusable.focus();
      else overlay.focus();
    }, 10);

    if (root.lucide && root.lucide.createIcons) {
      try {
        root.lucide.createIcons({ nodes: [overlay] });
      } catch (_) {}
    }

    return {
      element: overlay,
      close: close,
      content: overlay.querySelector(".ss-modal__body"),
      footer: overlay.querySelector(".ss-modal__footer"),
      setLoading: setLoading,
      setError: setError,
      isOpen: function () {
        return isOpen;
      }
    };
  }

  /**
   * Modale de confirmation simple. Retourne une Promise.
   *
   * @param {Object} p
   * @param {string} [p.title='Confirmation']
   * @param {string} [p.message]
   * @param {string} [p.confirmLabel='Confirmer']
   * @param {string} [p.cancelLabel='Annuler']
   * @param {boolean} [p.danger=false] - Bouton confirm en variant danger
   * @param {string} [p.confirmIcon]
   * @param {string} [p.size='sm']
   * @param {Function} [p.onConfirm]
   * @param {Function} [p.onCancel]
   * @returns {Promise<boolean>}
   */
  function ssConfirm(p) {
    p = p || {};
    return new Promise(function (resolve) {
      var confirmed = false;
      var modal = ssModal({
        title: p.title || "Confirmation",
        subtitle: p.message || "",
        size: p.size || "sm",
        closeOnBackdrop: p.closeOnBackdrop !== false,
        closeOnEscape: p.closeOnEscape !== false,
        onClose: function () {
          if (!confirmed) {
            confirmed = true;
            if (p.onCancel) p.onCancel();
            resolve(false);
          }
        },
        actions: [
          {
            label: p.cancelLabel || "Annuler",
            variant: "secondary",
            onClick: function () {
              confirmed = true;
              if (p.onCancel) p.onCancel();
              resolve(false);
            }
          },
          {
            label: p.confirmLabel || "Confirmer",
            variant: p.danger ? "danger" : "primary",
            icon: p.confirmIcon,
            onClick: function () {
              confirmed = true;
              if (p.onConfirm) p.onConfirm();
              resolve(true);
            }
          }
        ]
      });
    });
  }

  root.ssButton = ssButton;
  root.ssIconButton = ssIconButton;
  root.ssState = ssState;
  root.ssTable = ssTable;
  root.ssBadge = ssBadge;
  root.ssInput = ssInput;
  root.ssSelect = ssSelect;
  root.ssTextarea = ssTextarea;
  root.ssField = ssField;
  root.ssModal = ssModal;
  root.ssConfirm = ssConfirm;
  root.ssEscapeHtml = escapeHtml;
})(typeof window !== "undefined" ? window : globalThis);
