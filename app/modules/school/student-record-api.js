(function (root) {
  "use strict";

  /**
   * SchoolSafe B1 — Student Record API Adapter
   * Replaces localStorage as the business data source for child record.
   * All methods call native backend routes; school_id comes from session.
   */

  var BASE = "/native/students";
  var CANTEEN_BASE = "/native/canteen/students";
  var PARENT_BASE = "/native/parent";

  function buildUrl(path) {
    return path;
  }

  async function request(method, url, body) {
    var opts = {
      method: method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(buildUrl(url), opts);
    if (!res.ok) {
      var errBody = null;
      try { errBody = await res.json(); } catch (_) {}
      var err = new Error(errBody && errBody.message ? errBody.message : "Request failed");
      err.status = res.status;
      err.code = errBody && errBody.code;
      throw err;
    }
    return res.json();
  }

  root.StudentRecordAPI = {
    // === RECORD ===
    getRecord: function (studentId) {
      return request("GET", BASE + "/" + studentId + "/record");
    },

    getCompleteness: function (studentId) {
      return request("GET", BASE + "/" + studentId + "/completeness");
    },

    // === IDENTITY ===
    updateIdentity: function (studentId, payload) {
      return request("PATCH", BASE + "/" + studentId + "/identity", payload);
    },

    // === FAMILY / GUARDIANS ===
    getFamily: function (studentId) {
      return request("GET", BASE + "/" + studentId + "/family");
    },

    addGuardian: function (studentId, payload) {
      return request("POST", BASE + "/" + studentId + "/guardians", payload);
    },

    updateGuardian: function (studentId, guardianId, payload) {
      return request("PATCH", BASE + "/" + studentId + "/guardians/" + guardianId, payload);
    },

    setPrimaryGuardian: function (studentId, guardianId) {
      return request("POST", BASE + "/" + studentId + "/guardians/" + guardianId + "/set-primary", {});
    },

    deactivateGuardian: function (studentId, guardianId) {
      return request("POST", BASE + "/" + studentId + "/guardians/" + guardianId + "/deactivate", {});
    },

    // === EMERGENCY CONTACTS ===
    getEmergencyContacts: function (studentId) {
      return request("GET", BASE + "/" + studentId + "/emergency-contacts");
    },

    updateEmergencyContact: function (studentId, slot, payload) {
      return request("PUT", BASE + "/" + studentId + "/emergency-contacts/" + slot, payload);
    },

    // === HEALTH ===
    getHealth: function (studentId) {
      return request("GET", BASE + "/" + studentId + "/health");
    },

    updateHealth: function (studentId, payload) {
      return request("PUT", BASE + "/" + studentId + "/health", payload);
    },

    addCondition: function (studentId, payload) {
      return request("POST", BASE + "/" + studentId + "/health/conditions", payload);
    },

    updateCondition: function (studentId, conditionId, payload) {
      return request("PATCH", BASE + "/" + studentId + "/health/conditions/" + conditionId, payload);
    },

    // === ALLERGIES ===
    addAllergy: function (studentId, payload) {
      return request("POST", BASE + "/" + studentId + "/allergies", payload);
    },

    updateAllergy: function (studentId, allergyId, payload) {
      return request("PATCH", BASE + "/" + studentId + "/allergies/" + allergyId, payload);
    },

    // === MEDICATIONS ===
    addMedication: function (studentId, payload) {
      return request("POST", BASE + "/" + studentId + "/medications", payload);
    },

    updateMedication: function (studentId, medicationId, payload) {
      return request("PATCH", BASE + "/" + studentId + "/medications/" + medicationId, payload);
    },

    // === DIETARY ===
    getDietary: function (studentId) {
      return request("GET", BASE + "/" + studentId + "/dietary");
    },

    updateDietary: function (studentId, payload) {
      return request("PUT", BASE + "/" + studentId + "/dietary", payload);
    },

    addRestriction: function (studentId, payload) {
      return request("POST", BASE + "/" + studentId + "/dietary/restrictions", payload);
    },

    updateRestriction: function (studentId, restrictionId, payload) {
      return request("PATCH", BASE + "/" + studentId + "/dietary/restrictions/" + restrictionId, payload);
    },

    addPreference: function (studentId, payload) {
      return request("POST", BASE + "/" + studentId + "/dietary/preferences", payload);
    },

    updatePreference: function (studentId, preferenceId, payload) {
      return request("PATCH", BASE + "/" + studentId + "/dietary/preferences/" + preferenceId, payload);
    },

    // === CONFIRMATIONS & CONSENTS ===
    setConfirmation: function (studentId, key, confirmed) {
      return request("PUT", BASE + "/" + studentId + "/confirmations/" + key, { confirmed: confirmed });
    },

    setConsent: function (studentId, key, decision) {
      return request("PUT", BASE + "/" + studentId + "/consents/" + key, { decision: decision });
    },

    // === CANTEEN PROJECTION ===
    getCanteenDietary: function (studentId) {
      return request("GET", CANTEEN_BASE + "/" + studentId + "/dietary");
    },

    // === PARENT MULTI-CHILDREN ===
    getParentChildren: function () {
      return request("GET", PARENT_BASE + "/children");
    },

    getParentChildRecord: function (studentId) {
      return request("GET", PARENT_BASE + "/children/" + studentId + "/record");
    },
  };
})(typeof window !== "undefined" ? window : globalThis);