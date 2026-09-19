// SchoolSafe School API — native (credentials: include, session cookie).
// Remplace progressivement school-api.js (bearer token).
// Pour l'instant : élève uniquement (LOT-06).
(function () {
  "use strict";

  function apiBase() {
    return (
      window.schoolSafeApiBase ||
      window.SCHOOLSAFE_API_BASE ||
      (["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname) ? "http://127.0.0.1:8787" : window.location.origin)
    );
  }

  async function request(path, options) {
    var res = await fetch(apiBase() + path, {
      method: options && options.method ? options.method : "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options && options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var err = new Error((data && data.message) || "Erreur " + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  window.SchoolSafeSchoolNativeAPI = {
    listStudents: function (status, query, classId, limit, offset) {
      var params = new URLSearchParams();
      if (status) params.set("status", status);
      if (query) params.set("query", query);
      if (classId) params.set("class_id", classId);
      if (limit) params.set("limit", String(limit));
      if (offset) params.set("offset", String(offset));
      return request("/native/students?" + params.toString(), { method: "GET" });
    },

    getStudent: function (studentId) {
      return request("/native/students/" + encodeURIComponent(studentId), { method: "GET" });
    },

    createStudentDraft: function (payload) {
      return request("/native/students/drafts", {
        method: "POST",
        body: {
          matricule: payload.matricule,
          first_name: payload.first_name,
          middle_name: payload.middle_name,
          last_name: payload.last_name,
          date_of_birth: payload.date_of_birth,
          gender: payload.gender,
          academic_year_id: payload.academic_year_id,
          planned_class_id: payload.planned_class_id,
          enrollment_starts_on: payload.enrollment_starts_on,
        },
      });
    },
  };
})();