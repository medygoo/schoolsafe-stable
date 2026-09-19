// SchoolSafe V2 — Cartes Native API client
// Remplace l'ancien appel Supabase + /cards/request-print
(function (root) {
  "use strict";

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

    /** Lot 1 : construire un lot ZIP (manifeste + PNG) pour Control */
    buildBatch: function (opts) {
      return apiRequest("/native/cards/batches", {
        method: "POST",
        body: {
          request_ids: (opts && opts.request_ids) || undefined,
          status: (opts && opts.status) || undefined,
        },
      });
    },

    /** Lot 2 : signaler une perte/vol (suspension immédiate de la carte active) */
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

    /** Lot 2 : remplacer une carte (révoque l'ancienne, nouveau QR) */
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

    /** Lot 2 : autoriser une réimpression contrôlée (même credential) */
    reprintAuthorize: function (input) {
      return apiRequest("/native/cards/reprint", {
        method: "POST",
        body: {
          card_id: input.card_id,
          reason: input.reason,
        },
      });
    },

    /** Lot 2 : confirmer la distribution de la carte à l'élève (admin) */
    markDistributed: function (input) {
      return apiRequest("/native/cards/distribute", {
        method: "POST",
        body: {
          card_id: input.card_id,
        },
      });
    },

    /** Ajouter une demande Control App (depuis LOT-10/11) */
    submitControlPrintRequest: function (input) {
      return apiRequest("/native/control/print-request", {
        method: "POST",
        body: input,
      });
    },

    /** Liste des demandes Control App */
    listControlPrintRequests: function (opts) {
      var params = new URLSearchParams();
      if (opts && opts.limit) params.set("limit", opts.limit);
      if (opts && opts.offset) params.set("offset", opts.offset);
      var qs = params.toString();
      return apiRequest("/native/control/print-requests" + (qs ? "?" + qs : ""));
    },
  };
})(window);