(function () {
  "use strict";

  var apiBase = window.schoolSafeApiBase || (window.schoolSafeBackendConfig ? null : "http://127.0.0.1:8787");

  function getApiBase() {
    if (apiBase) return apiBase;
    if (window.schoolSafeApiBase) return window.schoolSafeApiBase;
    return window.schoolSafeBackendConfig && window.schoolSafeBackendConfig.api_base
      ? window.schoolSafeBackendConfig.api_base
      : "http://127.0.0.1:8787";
  }

  function currentToken() {
    try {
      var raw = window.sessionStorage.getItem("schoolsafe-v2-session");
      if (!raw) return null;
      var session = JSON.parse(raw);
      return session && session.token ? session.token : null;
    } catch (e) {
      return null;
    }
  }

  async function request(method, path, body) {
    var token = currentToken();
    var options = {
      method: method,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    var res = await fetch(getApiBase() + path, options);
    var data = null;
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      throw new Error(data && data.message ? data.message : "Erreur " + res.status);
    }
    return data;
  }

  window.SchoolSafeSchoolAPI = {
    getSettings: function () {
      return request("GET", "/school/settings");
    },
    updateSettings: function (payload) {
      return request("PUT", "/school/settings", payload);
    },
    listStaff: function () {
      return request("GET", "/school/staff");
    },
    inviteStaff: function (payload) {
      return request("POST", "/school/staff/invite", payload);
    },
    updateStaffRoles: function (profileId, roleIds) {
      return request("PUT", "/school/staff/" + profileId + "/roles", { role_ids: roleIds });
    },
    toggleStaffActive: function (profileId, isActive) {
      return request("POST", "/school/staff/" + profileId + "/toggle", { is_active: isActive });
    },
    listRoles: function () {
      return request("GET", "/school/roles");
    },
    listPermissions: function () {
      return request("GET", "/school/permissions");
    },
    listAcademicYears: function () {
      return request("GET", "/school/academic-years");
    },
    createAcademicYear: function (payload) {
      return request("POST", "/school/academic-years", payload);
    },
    updateAcademicYear: function (yearId, payload) {
      return request("PUT", "/school/academic-years/" + yearId, payload);
    },
    activateAcademicYear: function (yearId) {
      return request("POST", "/school/academic-years/" + yearId + "/activate");
    },
    listCycles: function () {
      return request("GET", "/school/cycles");
    },
    toggleCycle: function (cycleKey, isActive) {
      return request("PUT", "/school/cycles/" + cycleKey + "/toggle", { is_active: isActive });
    },
    uploadLogo: function (file) {
      var token = currentToken();
      var formData = new FormData();
      formData.append("logo", file);
      return fetch(getApiBase() + "/school/logo", {
        method: "POST",
        headers: token ? { Authorization: "Bearer " + token } : {},
        body: formData,
      }).then(function (res) {
        if (!res.ok) throw new Error("Échec de l’upload");
        return res.json();
      });
    },
    getStaffDetail: function (profileId) {
      return request("GET", "/school/staff/" + profileId);
    },
    resendInvite: function (profileId) {
      return request("POST", "/school/staff/" + profileId + "/resend-invite");
    },
    listStudentsByClass: function (classId) {
      return request("GET", "/school/classes/" + classId + "/students");
    },
    listStudents: function (status, query) {
      var params = new URLSearchParams({ status: status });
      if (query) params.set("query", query);
      return request("GET", "/school/students?" + params.toString());
    },
    getStudent: function (studentId) {
      return request("GET", "/school/students/" + encodeURIComponent(studentId));
    },
    searchParents: function (query) {
      return request("GET", "/school/parents?query=" + encodeURIComponent(query));
    },
    createStudentDraft: function (payload) {
      return request("POST", "/school/students/drafts", payload);
    },
    listClasses: function () {
      return request("GET", "/pedagogy/classes");
    },
  };
})();
