// SchoolSafe V2 — Cartes Native API client
// Session cookie (credentials:include) — le navigateur ne transporte jamais
// de secret carte ; les credentials QR sont émis et signés côté serveur.
(function (root) {
  "use strict";

  var lastPackageFilename = null;

  function apiBase() {
    return window.schoolSafeApiBase || (window.schoolSafeBackendConfig ? window.schoolSafeBackendConfig.api_base : "http://127.0.0.1:8787");
  }

  async function apiRequest(path, opts) {
    var options = opts || {};
    var url = apiBase() + path;
    var fetchOpts = {
      method: options.method || "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
    };
    if (options.body) fetchOpts.body = JSON.stringify(options.body);
    var res = await fetch(url, fetchOpts);
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data && data.message ? data.message : "Erreur " + res.status);
    return data;
  }

  root.SchoolSafeCardsNativeAPI = {
    /** Nom de fichier du dernier package ZIP reçu (Content-Disposition). */
    get lastPackageFilename() { return lastPackageFilename; },

    /** Envoyer une demande d'impression complète (recto + verso base64) */
    submitPrintRequest: function (input) {
      return apiRequest("/native/cards/print-request", {
        method: "POST",
        body: {
          student_id: input.student_id,
          format: input.format,
          front_image_base64: input.front_image_base64,
          back_image_base64: input.back_image_base64,
          metadata: input.metadata || {},
        },
      });
    },

    /** Impression rapide pour un élève */
    submitStudentPrint: function (studentId, input) {
      return apiRequest("/native/cards/students/" + encodeURIComponent(studentId) + "/print", {
        method: "POST",
        body: {
          format: input.format || "carte",
          front_image_base64: input.front_image_base64,
          back_image_base64: input.back_image_base64,
          metadata: input.metadata || {},
        },
      });
    },

    /**
     * Projection carte complète d'un élève (source de vérité serveur) :
     * student/school/class/academic_year/teacher/primary_guardian/
     * authorized_persons/active_card + readiness.
     */
    getCardProjection: function (studentId) {
      return apiRequest("/native/cards/students/" + encodeURIComponent(studentId) + "/card-projection");
    },

    /**
     * Télécharge le package ZIP individuel (recto.png, verso.png, manifest.json)
     * et renvoie un Blob prêt pour <a download>. Nom de fichier mémorisé depuis
     * Content-Disposition. En cas de CARD_NOT_READY (409), l'erreur expose
     * error.missing pour un affichage clair.
     */
    downloadCardPackage: async function (studentId, input) {
      var url = apiBase() + "/native/cards/students/" + encodeURIComponent(studentId) + "/card-package";
      var res = await fetch(url, {
        method: "POST",
        headers: { "Accept": "application/zip, application/json", "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          recto_png_base64: input.recto_png_base64,
          verso_png_base64: input.verso_png_base64,
        }),
      });
      if (!res.ok) {
        var payload = null;
        try { payload = await res.json(); } catch (e) {}
        var message = payload && payload.error && payload.error.message ? payload.error.message : "Erreur " + res.status;
        var error = new Error(message);
        error.status = res.status;
        if (payload && payload.error) error.missing = payload.error.missing;
        throw error;
      }
      var disposition = res.headers.get("Content-Disposition") || "";
      var match = disposition.match(/filename="?([^";]+)"?/);
      lastPackageFilename = match ? match[1] : null;
      return await res.blob();
    },

    /** Liste des demandes d'impression */
    listPrintRequests: function (opts) {
      var params = new URLSearchParams();
      if (opts && opts.status) params.set("status", opts.status);
      if (opts && opts.limit) params.set("limit", opts.limit);
      if (opts && opts.offset) params.set("offset", opts.offset);
      var qs = params.toString();
      return apiRequest("/native/cards/print-requests" + (qs ? "?" + qs : ""));
    },

    /** Compteurs */
    getCounts: function () {
      return apiRequest("/native/cards/print-requests/counts");
    },

    /** Lot de classe : ZIP Cartes_<CLASSE>_<ANNEE>.zip (élèves prêts uniquement) */
    buildBatch: function (opts) {
      return apiRequest("/native/cards/batches", {
        method: "POST",
        body: {
          request_ids: (opts && opts.request_ids) || undefined,
          status: (opts && opts.status) || undefined,
        },
      });
    },

    /** Cycle de vie : signaler une perte/vol (suspension immédiate de la carte active) */
    lossReport: function (input) {
      return apiRequest("/native/cards/loss-report", {
        method: "POST",
        body: {
          student_id: input.student_id,
          card_id: input.card_id || undefined,
          reason: input.reason,
          reported_by_relation: input.reported_by_relation || "school",
        },
      });
    },

    /** Cycle de vie : remplacer une carte (révoque l'ancienne, nouveau QR serveur) */
    replaceCard: function (input) {
      return apiRequest("/native/cards/replace", {
        method: "POST",
        body: {
          student_id: input.student_id,
          old_card_id: input.old_card_id,
          reason: input.reason,
        },
      });
    },

    /** Cycle de vie : autoriser une réimpression contrôlée (même credential) */
    reprintAuthorize: function (input) {
      return apiRequest("/native/cards/reprint", {
        method: "POST",
        body: {
          card_id: input.card_id,
          reason: input.reason,
        },
      });
    },

    /** Cycle de vie : confirmer la distribution de la carte à l'élève (admin) */
    markDistributed: function (input) {
      return apiRequest("/native/cards/distribute", {
        method: "POST",
        body: {
          card_id: input.card_id,
        },
      });
    },
  };
})(window);