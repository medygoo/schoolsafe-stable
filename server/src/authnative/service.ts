// SchoolSafe Auth v1 — service d'authentification.
// La base de données est injectée via une interface minimale (testable sans serveur),
// en attendant le pool pg réel du lot DB-LAYER (3.1).
// Règles : la session porte le profil EXACT choisi (jamais de LIMIT 1 ambigu),
// le login est normalisé par la base, l'expiration est glissante réelle.
import { verifyPassword, DUMMY_ARGON2ID_HASH_PROMISE } from "./passwords.js";
import { generateSessionToken, hashSessionToken } from "./tokens.js";

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
  | { ok: true; token: string; session: AuthSessionInfo }
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
export function createAuthNativeService(db: AuthDatabase, deliverRecovery?: RecoveryDelivery) {
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
      const identity = resolved.rows[0];

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
      if (!deliverRecovery) return;
      const token = generateSessionToken();
      const result = await db.query<{recovery_id: string; email: string}>(
        "select * from api.auth_create_recovery_request($1,$2)", [login, hashSessionToken(token)]);
      const row = result.rows[0];
      if (row?.email) {
        // The public response never reveals account existence or a provider failure.
        try { await deliverRecovery({email: row.email, token}); } catch { /* no secret logging */ }
      }
    },
    async resetPassword(token: string, newPasswordHash: string): Promise<boolean> {
      const result = await db.query<{auth_reset_password: boolean}>(
        "select * from api.auth_reset_password($1,$2)", [hashSessionToken(token), newPasswordHash]);
      return result.rows[0]?.auth_reset_password === true;
    },
}
  };
export type AuthNativeService = ReturnType<typeof createAuthNativeService>;
