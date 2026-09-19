(function (root) {
  "use strict";

  var apiBase = window.schoolSafeApiBase || "http://127.0.0.1:8787";

  function currentToken() {
    try {
      var raw = window.sessionStorage.getItem("schoolsafe-v2-session");
      if (!raw) return null;
      var session = JSON.parse(raw);
      return session && session.token ? session.token : null;
    } catch (e) { return null; }
  }

  async function apiGet(path) {
    var token = currentToken();
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
    var token = currentToken();
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

  root.SchoolSafePilotageAPI = {
    setApiBase: function (value) { apiBase = value; },
    dashboard: function () {
      return apiGet("/pilotage/dashboard").then(function (res) { return res.data; });
    },
    listAlerts: function (options) {
      var params = new URLSearchParams();
      params.set("limit", String(options && options.limit ? options.limit : 20));
      params.set("offset", String(options && options.offset ? options.offset : 0));
      if (options && options.status) params.set("status", options.status);
      if (options && options.severity) params.set("severity", options.severity);
      return apiGet("/pilotage/alerts?" + params.toString()).then(function (res) { return { data: res.data, count: res.count }; });
    },
    acknowledgeAlert: function (id) {
      return apiPost("/pilotage/alerts/" + id + "/acknowledge", {}).then(function (res) { return res.data; });
    },
    resolveAlert: function (id, note) {
      return apiPost("/pilotage/alerts/" + id + "/resolve", { note: note || "" }).then(function (res) { return res.data; });
    },
  };
})(window);
