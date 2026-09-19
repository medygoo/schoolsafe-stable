(function (global) {
  "use strict";

  function getApiBase() {
    if (window.schoolSafeBackendConfig && window.schoolSafeBackendConfig.api_base) {
      return window.schoolSafeBackendConfig.api_base;
    }
    return window.location.protocol + "//" + window.location.host;
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
      headers: { Accept: "application/json", ...authHeaders() }
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data && data.message ? data.message : ("Erreur " + res.status));
    return data && data.data ? data.data : data;
  }

  async function apiPost(path, body) {
    var res = await fetch(getApiBase() + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
      body: JSON.stringify(body)
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data && data.message ? data.message : ("Erreur " + res.status));
    return data && data.data ? data.data : data;
  }

  async function apiPatch(path, body) {
    var res = await fetch(getApiBase() + path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
      body: JSON.stringify(body)
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data && data.message ? data.message : ("Erreur " + res.status));
    return data && data.data ? data.data : data;
  }

  async function apiDelete(path) {
    var res = await fetch(getApiBase() + path, {
      method: "DELETE",
      headers: { Accept: "application/json", ...authHeaders() }
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(data && data.message ? data.message : ("Erreur " + res.status));
    return data && data.data ? data.data : data;
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

  global.SchoolSafePedagogyAPI = {
    listClasses: function () { return apiGet("/pedagogy/classes"); },
    listSubjects: function () { return apiGet("/pedagogy/subjects"); },
    createSubject: function (input) { return apiPost("/pedagogy/subjects", input); },

    listTeacherAssignments: function () { return apiGet("/pedagogy/teacher-assignments"); },
    createTeacherAssignment: function (input) { return apiPost("/pedagogy/teacher-assignments", input); },
    deleteTeacherAssignment: function (id) { return apiDelete("/pedagogy/teacher-assignments/" + id); },

    listAssignments: function (options) { return apiGet("/pedagogy/assignments" + toQuery(options || {})); },
    createAssignment: function (input) { return apiPost("/pedagogy/assignments", input); },
    updateAssignment: function (id, input) { return apiPatch("/pedagogy/assignments/" + id, input); },
    publishAssignment: function (id) { return apiPost("/pedagogy/assignments/" + id + "/publish", {}); },

    getAssignmentGrades: function (id) { return apiGet("/pedagogy/assignments/" + id + "/grades"); },
    saveGrades: function (id, grades) { return apiPost("/pedagogy/assignments/" + id + "/grades", { grades: grades }); },
    publishGrades: function (id) { return apiPost("/pedagogy/assignments/" + id + "/grades/publish", {}); },

    listLessonPlans: function (options) { return apiGet("/pedagogy/lesson-plans" + toQuery(options || {})); },
    createLessonPlan: function (input) { return apiPost("/pedagogy/lesson-plans", input); },
    updateLessonPlan: function (id, input) { return apiPatch("/pedagogy/lesson-plans/" + id, input); },
    deleteLessonPlan: function (id) { return apiDelete("/pedagogy/lesson-plans/" + id); },

    getParentChildren: function () { return apiGet("/pedagogy/parent/children"); },
    getStudentGradesForParent: function (studentId) { return apiGet("/pedagogy/parent/grades/" + studentId); },
    computeStudentAverages: function (studentId) { return apiGet("/pedagogy/students/" + studentId + "/averages"); },
  };
})(window);
