/* Accès IAM natifs ; le cookie HttpOnly reste la seule session transportée. */
(function (root) {
  "use strict";
  async function read(path, body) {
    var base = root.schoolSafeApiBase || root.SCHOOLSAFE_API_BASE ||
      (["127.0.0.1", "localhost", "[::1]"].includes(location.hostname) ? "http://127.0.0.1:8787" : location.origin);
    var headers = { Accept: "application/json" };
    if (body) { headers["Content-Type"] = "application/json"; headers["X-SchoolSafe-Action"] = "access-write"; }
    var response = await fetch(base + "/native/access/" + path, { credentials: "include", cache: "no-store", headers: headers,
      method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined });
    var payload = null;
    try { payload = await response.json(); } catch (error) {}
    if (!response.ok) {
      var failure = new Error(payload && payload.message || "Lecture des accès indisponible");
      failure.status = response.status;
      throw failure;
    }
    if (!payload || !payload.data) throw new Error("Réponse des accès invalide");
    return payload.data;
  }
  function page(kind, query, offset) {
    return read(kind + "?" + new URLSearchParams({ query: query || "", limit: "25", offset: String(offset || 0) }));
  }
  root.SchoolSafeAccessNative = {
    profiles: function (query, offset) { return page("profiles", query, offset); },
    roles: function (query, offset) { return page("roles", query, offset); },
    profile: function (id) { return read("profiles/" + encodeURIComponent(id)); },
    role: function (id) { return read("roles/" + encodeURIComponent(id)); },
    roleEditor: function (id) { return read("role-editor" + (id ? "?roleId=" + encodeURIComponent(id) : "")); },
    createRole: function (body) { return read("roles", body); },
    saveRole: function (id, body) { return read("roles/" + encodeURIComponent(id), body); },
    changeRole: function (id, body) { return read("profiles/" + encodeURIComponent(id) + "/roles", body); }
  };
})(window);
