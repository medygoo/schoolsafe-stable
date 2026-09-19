(function (global) {
  "use strict";

  function getApiBase() {
    if (global.schoolSafeBackendConfig && global.schoolSafeBackendConfig.api_base) {
      return global.schoolSafeBackendConfig.api_base;
    }
    return global.location.protocol + "//" + global.location.host;
  }

  function currentToken() {
    try {
      var session = JSON.parse(sessionStorage.getItem("schoolsafe-v2-session") || "{}");
      return session.token || null;
    } catch (e) {
      return null;
    }
  }

  function authHeaders() {
    var token = currentToken();
    return token ? { Authorization: "Bearer " + token } : {};
  }

  async function apiGet(path) {
    var res = await fetch(getApiBase() + path, {
      method: "GET",
      headers: { Accept: "application/json", ...authHeaders() },
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data && data.message ? data.message : "Erreur " + res.status);
    return data && data.data ? data.data : data;
  }

  async function apiPost(path, body) {
    var res = await fetch(getApiBase() + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
      body: JSON.stringify(body || {}),
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data && data.message ? data.message : "Erreur " + res.status);
    return data && data.data ? data.data : data;
  }

  async function apiDelete(path) {
    var res = await fetch(getApiBase() + path, {
      method: "DELETE",
      headers: { Accept: "application/json", ...authHeaders() },
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data && data.message ? data.message : "Erreur " + res.status);
    return data;
  }

  function toQuery(params) {
    var parts = [];
    for (var key in params) {
      if (params[key] != null && params[key] !== "") {
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
      }
    }
    return parts.length ? "?" + parts.join("&") : "";
  }

  global.SchoolSafePalmaresAPI = {
    listRankings: function (options) { return apiGet("/pedagogy/rankings" + toQuery(options || {})); },
    getRanking: function (id) { return apiGet("/pedagogy/rankings/" + id); },
    computeRanking: function (month, classId) { return apiPost("/pedagogy/rankings/compute", { month: month, class_id: classId }); },
    publishRanking: function (id) { return apiPost("/pedagogy/rankings/" + id + "/publish", {}); },
    listStars: function (id) { return apiGet("/pedagogy/rankings/" + id + "/stars"); },
    addStar: function (id, studentId) { return apiPost("/pedagogy/rankings/" + id + "/stars", { student_id: studentId }); },
    removeStar: function (id, studentId) { return apiDelete("/pedagogy/rankings/" + id + "/stars/" + studentId); },
  };
})(window);
