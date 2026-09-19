// SchoolSafe Auth Native — client frontend (lot 2.4).
// La session vit dans un cookie HttpOnly : ce module NE LIT JAMAIS de token.
// Toutes les requêtes passent credentials: 'include' (le cookie voyage seul).
// Le VPS est l’unique autorité d’authentification.
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

  // Disponibilité du serveur ; la connexion valide ensuite le service natif.
  async function isAvailable() {
    try {
      await request("/health", {});
      return true;
    } catch (e) {
      return false;
    }
  }

  async function login(login, password, profileId, remember) {
    return request("/auth/native/login", {
      method: "POST",
      body: { login: login, password: password, profileId: profileId, remember: remember === true },
    });
  }

  async function me() {
    return request("/auth/native/me", {});
  }

  async function sessionBootstrap() {
    return request("/native/session/bootstrap", {});
  }

  async function logout() {
    return request("/auth/native/logout", { method: "POST", body: {} });
  }

  // INC-7 : choix explicite du profil/école — jamais de sélection arbitraire.
  async function listProfiles() {
    return request("/auth/native/profiles", {});
  }

  async function switchProfile(profileId) {
    return request("/auth/native/switch-profile", { method: "POST", body: { profileId: profileId } });
  }

  // Récupération du mot de passe (LOT-02).
  async function forgot(login) {
    return request("/auth/native/forgot", { method: "POST", body: { login: login } });
  }

  // Réinitialisation du mot de passe avec le token reçu par email (LOT-02).
  async function reset(token, password) {
    return request("/auth/native/reset", { method: "POST", body: { token: token, password: password } });
  }

  window.SchoolSafeAuthNative = {
    isAvailable: isAvailable,
    login: login,
    me: me,
    sessionBootstrap: sessionBootstrap,
    logout: logout,
    listProfiles: listProfiles,
    switchProfile: switchProfile,
    forgot: forgot,
    reset: reset,
  };
})();
