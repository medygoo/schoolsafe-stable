// SchoolSafe V2 — Finance API client
// Connecte le front PWA aux endpoints backend /finance/*

(function (root) {
  "use strict";

  var apiBase = window.schoolSafeApiBase || "http://127.0.0.1:8787";

  function getSessionToken() {
    try {
      var raw = window.sessionStorage.getItem("schoolsafe-v2-session");
      if (!raw) return null;
      var session = JSON.parse(raw);
      return session && session.token ? session.token : null;
    } catch (e) {
      return null;
    }
  }

  async function apiGet(path) {
    var token = getSessionToken();
    var res = await fetch(apiBase + path, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data && data.message ? data.message : "Erreur " + res.status);
    return data;
  }

  async function apiPost(path, body) {
    var token = getSessionToken();
    var res = await fetch(apiBase + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(body),
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data && data.message ? data.message : "Erreur " + res.status);
    return data;
  }

  root.SchoolSafeFinanceAPI = {
    setApiBase: function (value) { apiBase = value; },
    getSessionToken: getSessionToken,

    listFeeStructures: function () {
      return apiGet("/finance/fee-structures").then(function (res) { return res.data; });
    },

    createFeeStructure: function (input) {
      return apiPost("/finance/fee-structures", input).then(function (res) { return res.data; });
    },

    listStudentFees: function (options) {
      var params = new URLSearchParams();
      if (options && options.student_id) params.set("student_id", options.student_id);
      if (options && options.status) params.set("status", options.status);
      return apiGet("/finance/student-fees?" + params.toString()).then(function (res) { return res.data; });
    },

    createPayment: function (input) {
      return apiPost("/finance/payments", input).then(function (res) { return res.data; });
    },

    getReceiptData: function (paymentId) {
      return apiGet("/finance/receipts/" + encodeURIComponent(paymentId)).then(function (res) { return res.data; });
    },

    getDailyReport: function (date) {
      return apiGet("/finance/reports/daily?date=" + encodeURIComponent(date)).then(function (res) { return res.data; });
    },

    closeCashRegister: function (input) {
      return apiPost("/finance/cash-register/close", input).then(function (res) { return res.data; });
    },

    cancelPayment: function (paymentId, reason) {
      return apiPost("/finance/payments/" + encodeURIComponent(paymentId) + "/cancel", { reason: reason }).then(function (res) { return res.data; });
    },

    getStudentFee: function (studentFeeId) {
      return apiGet("/finance/student-fees/" + encodeURIComponent(studentFeeId)).then(function (res) { return res.data; });
    },

    listCampaigns: function () {
      return apiGet("/finance/fee-control/campaigns").then(function (res) { return res.data; });
    },

    createCampaign: function (input) {
      return apiPost("/finance/fee-control/campaigns", input).then(function (res) { return res.data; });
    },

    createScan: function (input) {
      return apiPost("/finance/fee-control/scans", input).then(function (res) { return res.data; });
    },
  };
})(window);
