// SchoolSafe Auth v2 — service d'authentification complet.
// Intègre : login, sessions, recovery email/SMS/WebAuthn/admin, vérification identité.
// La base de données est injectée via une interface minimale (testable sans serveur).
// Règles : la session porte le profil EXACT choisi (jamais de LIMIT 1 ambigu),
// le login est normalisé par la base, l'expiration est glissante réelle.
import { verifyPassword, DUMMY_ARGON2ID_HASH_PROMISE } from "./passwords.js";
import { generateSessionToken, hashSessionToken } from "./tokens.js";
import type { SmsDelivery } from "./sms-delivery.js";
import type { AdminRecoveryService } from "./admin-recovery.js";

export interface AuthDatabase {
  query<T>(sql: string, params: unknown[]): Promise<{ rows: T[] }>;
}

export interface AuthSessionInfo {
  sessionId: string;
  identityId: string;
  userId: string;
  profileId: string;
  schoolId: string;
  mustChange: boolean;
  expiresAt: string;
}

export interface ProfileChoice {
  profileId: string;
  schoolId: string;
  schoolCode: string;
  schoolName: string;
  displayName: string;
}

export type LoginResult =
  | { ok: true; onboarding?: false; token: string; session: AuthSessionInfo }
  | { ok: true; onboarding: true; token: string }
  | { ok: false; reason: "invalid_credentials" | "locked" | "disabled" }
  | { ok: false; reason: "profile_choice_required"; profiles: ProfileChoice[] };

type IdentityRow = {
  identity_id: string;
  user_id: string;
  password_hash: string | null;
  status: string;
  must_change: boolean;
};

type SessionRow = {
  session_id: string;
  identity_id: string;
  user_id: string;
  profile_id: string;
  school_id: string;
  must_change: boolean;
};

type ProfileRow = {
  profile_id: string;
  school_id: string;
  school_code: string;
  school_name: string;
  display_name: string;
};

const SESSION_TTL_SECONDS = 43200; // 12 h, glissantes (touch à mi-vie)
const REMEMBER_TTL_SECONDS = 604800; // 7 jours, si remember coché

export type RecoveryDelivery = (message: {email: string; token: string}) => Promise<void>;

export interface VerificationDelivery {
  sendEmailVerification(email: string, token: string): Promise<boolean>;
  sendPhoneVerification(phone: string, code: string): Promise<boolean>;
}

export interface WebAuthnStore {
  getCredential(credentialId: Uint8Array): Promise<{ identityId: string; publicKey: Uint8Array; signCount: number } | null>;
  saveCredential(identityId: string, credentialId: Uint8Array, publicKey: Uint8Array, signCount: number, transports: string[], friendlyName?: string): Promise<void>;
  updateSignCount(credentialId: Uint8Array, signCount: number): Promise<boolean>;
  listCredentials(identityId: string): Promise<Array<{ credentialId: Uint8Array; friendlyName?: string; createdAt: Date }>>;
  revokeCredential(identityId: string, credentialId: Uint8Array): Promise<boolean>;
  hasActiveCredential(identityId: string): Promise<boolean>;
}

export interface ChallengeStore {
  set(key: string, challenge: string, ttlMs: number): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

export interface AdminRecoveryStore {
  generateCode(targetIdentityId: string, schoolId: string, adminProfileId: string, codeHash: string, ttlMs: number): Promise<string | null>;
  redeemCode(login: string, codeHash: string, maxAttempts: number): Promise<{ identityId: string; schoolId: string } | null>;
  canAdminRecover(adminProfileId: string, targetIdentityId: string): Promise<boolean>;
}

export interface AuthNativeDependencies {
  db: AuthDatabase;
  emailDelivery?: RecoveryDelivery;
  smsDelivery?: SmsDelivery;
  verificationDelivery?: VerificationDelivery;
  webauthnStore?: WebAuthnStore;
  challengeStore?: ChallengeStore;
  adminRecoveryStore?: AdminRecoveryStore;
  adminRecoveryService?: AdminRecoveryService;
  webauthnConfig?: { rpName: string; rpId: string; origin: string | string[] };
}

export function createAuthNativeService(deps: AuthNativeDependencies) {
  const { db } = deps;
  return {
    async loginWithPassword(
      login: string,
      password: string,
      profileId?: string,
      ip?: string,
      userAgent?: string,
      remember?: boolean,
    ): Promise<LoginResult> {
      const normalized = login.trim();
      if (!normalized || !password) {
        return { ok: false, reason: "invalid_credentials" };
      }

      const locked = await db.query<{ auth_is_locked: boolean }>(
        "select * from api.auth_is_locked($1)",
        [normalized],
      );
      if (locked.rows[0]?.auth_is_locked === true) {
        return { ok: false, reason: "locked" };
      }

      const resolved = await db.query<IdentityRow>(
        "select * from api.auth_resolve_identity($1)",
        [normalized],
      );
      let identity: IdentityRow | undefined = resolved.rows[0];
      let onboarding = false;
      if (!identity) {
        const pending = await db.query<IdentityRow>(
          "select * from api.auth_resolve_onboarding_identity($1)", [normalized]);
        // SQL only returns approved active accounts without an active profile.
        identity = pending.rows[0]?.status === "active" ? pending.rows[0] : undefined;
        onboarding = Boolean(identity);
      }

      // Anti-énumération : vérification argon2 factice si l'identité est absente.
      const hash = identity?.password_hash ?? (await DUMMY_ARGON2ID_HASH_PROMISE);
      const valid = await verifyPassword(hash, password);

      const succeeded = Boolean(identity && valid && identity.status === "active");
      await db.query("select * from api.auth_record_attempt($1, $2)", [normalized, succeeded]);

      if (!identity || !valid) {
        return { ok: false, reason: "invalid_credentials" };
      }
      if (identity.status !== "active") {
        return { ok: false, reason: "disabled" };
      }

      // Choix du profil : jamais de sélection arbitraire.
      if (onboarding) {
        const token = generateSessionToken();
        const created = await db.query<{session_id: string; expires_at: string}>(
          "select * from api.auth_create_onboarding_session($1,$2,$3,$4,$5)",
          [identity.identity_id, hashSessionToken(token), 3600, ip ?? null, userAgent ?? null]);
        if (!created.rows[0]?.session_id) return {ok: false, reason: "invalid_credentials"};
        return {ok: true, onboarding: true, token};
      }
      const profiles = await db.query<ProfileRow>(
        "select * from api.auth_list_profiles($1)",
        [identity.identity_id],
      );
      let chosenProfileId = profileId ?? "";
      if (!chosenProfileId) {
        if (profiles.rows.length === 0) {
          return { ok: false, reason: "invalid_credentials" };
        }
        if (profiles.rows.length > 1) {
          return {
            ok: false,
            reason: "profile_choice_required",
            profiles: profiles.rows.map((row) => ({
              profileId: row.profile_id,
              schoolId: row.school_id,
              schoolCode: row.school_code,
              schoolName: row.school_name,
              displayName: row.display_name,
            })),
          };
        }
        chosenProfileId = profiles.rows[0].profile_id;
      }

      const token = generateSessionToken();
      const ttl = remember ? REMEMBER_TTL_SECONDS : SESSION_TTL_SECONDS;
      const created = await db.query<{ session_id: string; expires_at: string }>(
        "select * from api.auth_create_session($1, $2, $3, $4, $5, $6)",
        [
          identity.identity_id,
          chosenProfileId,
          hashSessionToken(token),
          ttl,
          ip ?? null,
          userAgent ?? null,
        ],
      );
      const row = created.rows[0];

      return {
        ok: true,
        token,
        session: {
          sessionId: row.session_id,
          identityId: identity.identity_id,
          userId: identity.user_id,
          profileId: chosenProfileId,
          schoolId: "",
          mustChange: identity.must_change,
          expiresAt: row.expires_at,
        },
      };
    },

    async resolveSession(token: string): Promise<AuthSessionInfo | null> {
      const resolved = await db.query<SessionRow>(
        "select * from api.auth_resolve_session($1)",
        [hashSessionToken(token)],
      );
      const row = resolved.rows[0];
      if (!row) return null;
      return {
        sessionId: row.session_id,
        identityId: row.identity_id,
        userId: row.user_id,
        profileId: row.profile_id,
        schoolId: row.school_id,
        mustChange: row.must_change,
        expiresAt: "",
      };
    },

    async touchSession(token: string): Promise<string | null> {
      const result = await db.query<{ auth_touch_session: string | null }>(
        "select * from api.auth_touch_session($1, $2)",
        [hashSessionToken(token), SESSION_TTL_SECONDS],
      );
      return result.rows[0]?.auth_touch_session ?? null;
    },

    async logout(token: string): Promise<boolean> {
      const result = await db.query<{ auth_revoke_session: boolean }>(
        "select * from api.auth_revoke_session($1)",
        [hashSessionToken(token)],
      );
      return result.rows[0]?.auth_revoke_session === true;
    },

    // INC-7 : liste des profils actifs de l'utilisateur (pour le choix).
    async listProfiles(identityId: string): Promise<ProfileChoice[]> {
      const result = await db.query<ProfileRow>(
        "select * from api.auth_list_profiles($1)",
        [identityId],
      );
      return result.rows.map((row) => ({
        profileId: row.profile_id,
        schoolId: row.school_id,
        schoolCode: row.school_code,
        schoolName: row.school_name,
        displayName: row.display_name,
      }));
    },

    // INC-7 : changement de profil/école = NOUVELLE session liée au nouveau
    // profil, ancienne session révoquée. Le profil cible est re-validé en base
    // (appartenance à l'utilisateur + actif) par auth_create_session lui-même.
    async switchProfile(
      token: string,
      profileId: string,
      ip?: string,
      userAgent?: string,
    ): Promise<{ ok: true; token: string; session: AuthSessionInfo } | { ok: false }> {
      const current = await this.resolveSession(token);
      if (!current) return { ok: false }; // session expirée/révoquée → fail-closed

      const profiles = await this.listProfiles(current.identityId);
      if (!profiles.some((p) => p.profileId === profileId)) {
        return { ok: false }; // profil d'un autre utilisateur ou inactif → refusé
      }

      await this.logout(token); // l'ancien contexte meurt avec sa session

      const newToken = generateSessionToken();
      const created = await db.query<{ session_id: string; expires_at: string }>(
        "select * from api.auth_create_session($1, $2, $3, $4, $5, $6)",
        [
          current.identityId,
          profileId,
          hashSessionToken(newToken),
          SESSION_TTL_SECONDS,
          ip ?? null,
          userAgent ?? null,
        ],
      );
      const row = created.rows[0];
      return {
        ok: true,
        token: newToken,
        session: {
          sessionId: row.session_id,
          identityId: current.identityId,
          userId: current.userId,
          profileId,
          schoolId: "",
          mustChange: current.mustChange,
          expiresAt: row.expires_at,
        },
      };
    },

    async forgotPassword(login: string): Promise<void> {
      // Without a configured delivery channel no recovery capability is issued.
      if (!deps.emailDelivery) return;
      const token = generateSessionToken();
      const result = await db.query<{recovery_id: string; email: string}>(
        "select * from api.auth_create_recovery_request($1,$2)", [login, hashSessionToken(token)]);
      const row = result.rows[0];
      if (row?.email) {
        // The public response never reveals account existence or a provider failure.
        try { await deps.emailDelivery({email: row.email, token}); } catch { /* no secret logging */ }
      }
    },

    async resetPassword(token: string, newPasswordHash: string, password?: string): Promise<boolean> {
      // Only a phone-shaped candidate reaches SQL for canonical phone comparison.
      const phoneCandidate = password && /\d/.test(password) && !/[\p{L}@]/u.test(password) ? password : null;
      const result = await db.query<{auth_reset_password: boolean}>(
        "select * from api.auth_reset_password($1,$2,$3)", [hashSessionToken(token), newPasswordHash, phoneCandidate]);
      return result.rows[0]?.auth_reset_password === true;
    },

    // ─── LOT 4 : Recovery Methods ───────────────────────────────────────
    // Retourne les méthodes de récupération disponibles pour un identifiant,
    // sans révéler l'existence du compte si aucune méthode n'est disponible.
    async getRecoveryMethods(login: string): Promise<string[]> {
      const normalized = login.trim();
      if (!normalized) return [];
      const resolved = await db.query<{identity_id: string; email: string | null; phone: string | null; email_verified_at: string | null; phone_verified_at: string | null}>(
        "select i.id as identity_id, i.email, i.phone, i.email_verified_at, i.phone_verified_at from auth.identities i where i.email::text = $1 or i.phone = $1 limit 1",
        [normalized],
      );
      const row = resolved.rows[0];
      if (!row) return [];
      const methods: string[] = [];
      if (row.email && row.email_verified_at) methods.push("email");
      if (row.phone && row.phone_verified_at && deps.smsDelivery) methods.push("sms");
      if (deps.webauthnStore && await deps.webauthnStore.hasActiveCredential(row.identity_id)) methods.push("webauthn");
      // Admin recovery checked separately via canAdminRecover (requires admin session)
      return methods;
    },

    // ─── LOT 4 : Email Verification ─────────────────────────────────────
    async requestEmailVerification(identityId: string): Promise<boolean> {
      if (!deps.verificationDelivery) return false;
      const token = generateSessionToken();
      const result = await db.query<{identity_id: string; email: string}>(
        "select * from api.auth_create_email_verification($1,$2)", [identityId, hashSessionToken(token)]);
      const row = result.rows[0];
      if (!row?.email) return false;
      try { return await deps.verificationDelivery.sendEmailVerification(row.email, token); } catch { return false; }
    },

    async verifyEmail(token: string): Promise<boolean> {
      const result = await db.query<{auth_verify_email: boolean}>(
        "select * from api.auth_verify_email($1)", [hashSessionToken(token)]);
      return result.rows[0]?.auth_verify_email === true;
    },

    // ─── LOT 4 : Phone Verification ─────────────────────────────────────
    async requestPhoneVerification(identityId: string): Promise<boolean> {
      if (!deps.verificationDelivery || !deps.smsDelivery) return false;
      const token = generateSessionToken();
      const result = await db.query<{identity_id: string; phone: string}>(
        "select * from api.auth_create_phone_verification($1,$2)", [identityId, hashSessionToken(token)]);
      const row = result.rows[0];
      if (!row?.phone) return false;
      // Use first 6 chars of token as OTP code for SMS
      const code = token.substring(0, 6);
      try { return await deps.verificationDelivery.sendPhoneVerification(row.phone, code); } catch { return false; }
    },

    async verifyPhone(token: string): Promise<boolean> {
      const result = await db.query<{auth_verify_phone: boolean}>(
        "select * from api.auth_verify_phone($1)", [hashSessionToken(token)]);
      return result.rows[0]?.auth_verify_phone === true;
    },

    // ─── LOT 4 : SMS Recovery ───────────────────────────────────────────
    async requestSmsRecovery(login: string): Promise<boolean> {
      if (!deps.smsDelivery) return false;
      const normalized = login.trim();
      if (!normalized) return false;
      const resolved = await db.query<{identity_id: string; phone: string | null; phone_verified_at: string | null}>(
        "select i.id as identity_id, i.phone, i.phone_verified_at from auth.identities i where (i.email::text = $1 or i.phone = $1) and i.status = 'active' limit 1",
        [normalized],
      );
      const row = resolved.rows[0];
      if (!row?.phone || !row.phone_verified_at) return false;
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      // Store hashed code in recovery_requests with phone marker
      const token = generateSessionToken();
      await db.query("select * from api.auth_create_recovery_request($1,$2)", [normalized, hashSessionToken(code)]);
      try { return await deps.smsDelivery.sendRecoveryCode(row.phone, code); } catch { return false; }
    },

    // ─── HOTFIX RECOVERY V1-R1 : Admin Assisted Recovery ──────────────
    async adminGenerateRecoveryCode(
      adminProfileId: string,
      targetIdentityId: string,
      codeHash: string,
    ): Promise<boolean> {
      const result = await db.query<{ auth_admin_generate_recovery_code: string | null }>(
        "select * from api.auth_admin_generate_recovery_code($1, $2, $3)",
        [adminProfileId, targetIdentityId, codeHash],
      );
      return result.rows[0]?.auth_admin_generate_recovery_code === 'CODE_GENERATED';
    },

    async resolveAdminRecoveryTarget(adminProfileId: string, targetProfileId: string): Promise<string | null> {
      const result = await db.query<{auth_resolve_admin_recovery_target: string | null}>(
        'select * from api.auth_resolve_admin_recovery_target($1,$2)', [adminProfileId, targetProfileId]);
      return result.rows[0]?.auth_resolve_admin_recovery_target ?? null;
    },

    async redeemAdminRecoveryCode(
      login: string,
      codeHash: string,
      tokenHash: string,
    ): Promise<boolean> {
      const result = await db.query<{ auth_redeem_admin_recovery_code: boolean }>(
        "select * from api.auth_redeem_admin_recovery_code($1, $2, $3)",
        [login, codeHash, tokenHash],
      );
      return result.rows[0]?.auth_redeem_admin_recovery_code === true;
    },

    async recoverParentAccount(
      parentFullName: string,
      phoneNumber: string,
      childFullName: string,
      className: string,
      tokenHash: string,
    ): Promise<boolean> {
      const normalized = await db.query<{auth_recovery_normalize_phone: string}>(
        'select * from api.auth_recovery_normalize_phone($1)', [phoneNumber]);
      const phone = normalized.rows[0]?.auth_recovery_normalize_phone;
      if (!phone) return false;
      const attemptKey = hashSessionToken('recovery-parent-v1\n' + phone);
      const result = await db.query<{ auth_recover_parent_account: boolean }>(
        "select * from api.auth_recover_parent_account($1, $2, $3, $4, $5, $6)",
        [parentFullName, phoneNumber, childFullName, className, tokenHash, attemptKey],
      );
      return result.rows[0]?.auth_recover_parent_account === true;
    },

    async recoverProfileAccount(fullName: string, phoneNumber: string, schoolName: string, roleName: string, tokenHash: string): Promise<boolean> {
      const result = await db.query<{auth_recover_profile_account: boolean}>(
        'select * from api.auth_recover_profile_account($1,$2,$3,$4,$5)',
        [fullName, phoneNumber, schoolName, roleName, tokenHash]);
      return result.rows[0]?.auth_recover_profile_account === true;
    },
  };
};
export type AuthNativeService = ReturnType<typeof createAuthNativeService>;
