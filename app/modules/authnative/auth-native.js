// SchoolSafe Auth Native v2 — client frontend (LOT 4).
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
      err.code = data && data.code ? data.code : null;
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

  // Récupération du mot de passe classique (email).
  async function forgot(login) {
    return request("/auth/native/forgot", { method: "POST", body: { login: login } });
  }

  // Réinitialisation du mot de passe avec le token reçu par email.
  async function reset(token, password) {
    return request("/auth/native/reset", { method: "POST", body: { token: token, password: password } });
  }

  // --- LOT 4 : Recovery Methods Discovery ---
  async function getRecoveryMethods(login) {
    return request("/auth/recovery-methods?login=" + encodeURIComponent(login), {});
  }

  // --- LOT 4 : Verification ---
  async function verifyEmail(token) {
    return request("/auth/verify-email", { method: "POST", body: { token: token } });
  }

  async function verifyPhone(code) {
    return request("/auth/verify-phone", { method: "POST", body: { code: code } });
  }

  // --- LOT 4 : SMS Recovery ---
  async function requestSmsRecovery(login) {
    return request("/auth/sms-recovery/request", { method: "POST", body: { login: login } });
  }

  async function redeemSmsCode(login, code) {
    return request("/auth/sms-recovery/redeem", { method: "POST", body: { login: login, code: code } });
  }

  // --- LOT 4 : WebAuthn / Passkey ---
  async function getWebAuthnRegistrationOptions() {
    return request("/auth/webauthn/register/options", {});
  }

  async function registerWebAuthnCredential(response) {
    return request("/auth/webauthn/register", { method: "POST", body: { response: response } });
  }

  async function getWebAuthnRecoveryOptions(login) {
    return request("/auth/webauthn/recovery/options", { method: "POST", body: { login: login } });
  }

  async function assertWebAuthnRecovery(response) {
    return request("/auth/webauthn/recovery/assert", { method: "POST", body: { response: response } });
  }

  // --- HOTFIX RECOVERY V1-R1 : Parent Recovery ---
  async function recoverParent(parentFullName, phoneNumber, childFullName, className) {
    return request("/auth/recover/parent", { 
      method: "POST", 
      body: { parentFullName: parentFullName, phoneNumber: phoneNumber, childFullName: childFullName, className: className } 
    });
  }

  // --- HOTFIX RECOVERY V1-R1 : Admin Assisted Recovery ---
  async function generateAdminRecoveryCode(targetProfileId) {
    return request("/auth/recovery/admin/generate", { 
      method: "POST", 
      body: { targetProfileId: targetProfileId } 
    });
  }

  async function redeemAdminRecoveryCode(login, code) {
    return request("/auth/recovery/admin/redeem", { 
      method: "POST", 
      body: { login: login, code: code } 
    });
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
    // LOT 4 additions (kept for backward compatibility where needed, but deprecated in UI)
    getRecoveryMethods: getRecoveryMethods,
    verifyEmail: verifyEmail,
    verifyPhone: verifyPhone,
    requestSmsRecovery: requestSmsRecovery,
    redeemSmsCode: redeemSmsCode,
    getWebAuthnRegistrationOptions: getWebAuthnRegistrationOptions,
    registerWebAuthnCredential: registerWebAuthnCredential,
    getWebAuthnRecoveryOptions: getWebAuthnRecoveryOptions,
    assertWebAuthnRecovery: assertWebAuthnRecovery,
    requestAdminRecovery: requestAdminRecovery,
    redeemAdminCode: redeemAdminCode,
    // HOTFIX V1-R1 additions
    recoverParent: recoverParent,
    generateAdminRecoveryCode: generateAdminRecoveryCode,
    redeemAdminRecoveryCode: redeemAdminRecoveryCode,
  };
})();