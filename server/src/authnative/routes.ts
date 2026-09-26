// SchoolSafe Auth v1 — routes HTTP de session.
// Session opaque côté navigateur (cookie HttpOnly) ; haché seul côté serveur/DB.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SchoolSafeError } from "../http/errors.js";
import { newRequestId } from "../http/request-id.js";
import { clearSessionCookie, readSessionCookie, setSessionCookie, readOnboardingCookie, clearOnboardingCookie, setOnboardingCookie } from "./cookie.js";
import { generateSessionToken, hashSessionToken } from "./tokens.js";
import type { AuthNativeService } from "./service.js";
import { generateAdminRecoveryCode } from './admin-recovery.js';
import { isAcceptableRecoveryPassword } from './passwords.js';

const loginSchema = z.object({
  login: z.string().min(1).max(320),
  password: z.string().min(1).max(512),
  profileId: z.string().uuid().optional(),
  remember: z.boolean().optional(),
});

export type AuthNativeRouteDependencies = {
  service: AuthNativeService;
  cookieSecure: boolean;
};

export function registerAuthNativeRoutes(
  app: FastifyInstance,
  dependencies: AuthNativeRouteDependencies,
): void {
  const { service, cookieSecure } = dependencies;

  app.post("/auth/native/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const remember = body.remember === true;
    const result = await service.loginWithPassword(
      body.login,
      body.password,
      body.profileId,
      request.ip,
      request.headers["user-agent"],
      remember,
    );

    if (result.ok === false && result.reason === "profile_choice_required") {
      return reply.code(200).send({
        code: "PROFILE_CHOICE_REQUIRED" as const,
        profiles: result.profiles,
        request_id: newRequestId(),
      });
    }
    if (!result.ok) {
      // Réponse identique pour identité inconnue / mot de passe faux /
      // désactivé / verrouillé : aucune énumération possible.
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Identifiants invalides", false);
    }

    if (result.onboarding) {
      if (readSessionCookie(request)) clearSessionCookie(reply, {secure: cookieSecure});
      setOnboardingCookie(reply, result.token, {secure: cookieSecure});
      return reply.code(200).send({code: "ONBOARDING_REQUIRED"});
    }
    if (readOnboardingCookie(request)) clearOnboardingCookie(reply, {secure: cookieSecure});
    const maxAge = remember ? 604800 : 43200;
    setSessionCookie(reply, result.token, {
      secure: cookieSecure,
      maxAgeSeconds: maxAge,
    });
    return reply.code(200).send({
      profile_id: result.session.profileId,
      must_change: result.session.mustChange,
      expires_at: result.session.expiresAt,
      request_id: newRequestId(),
    });
  });

  app.post("/auth/native/logout", async (request, reply) => {
    const token = readSessionCookie(request);
    if (token) {
      await service.logout(token);
    }
    clearSessionCookie(reply, { secure: cookieSecure });
    return reply.code(200).send({ status: "logged_out", request_id: newRequestId() });
  });

  app.get("/auth/native/me", async (request, reply) => {
    const token = readSessionCookie(request);
    if (!token) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
    }
    const session = await service.resolveSession(token);
    if (!session) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session invalide ou expirée", false);
    }

    // Expiration glissante : passée la mi-vie, la session est prolongée
    // et le cookie renouvelé avec la nouvelle échéance.
    const renewed = await service.touchSession(token);
    if (renewed) {
      setSessionCookie(reply, token, { secure: cookieSecure, maxAgeSeconds: 43200 });
    }

    return reply.code(200).send({
      user_id: session.userId,
      profile_id: session.profileId,
      school_id: session.schoolId,
      must_change: session.mustChange,
      request_id: newRequestId(),
    });
  });

  // INC-7 : liste des profils actifs de l'utilisateur connecté (choix explicite).
  app.get("/auth/native/profiles", async (request, reply) => {
    const token = readSessionCookie(request);
    if (!token) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
    }
    const session = await service.resolveSession(token);
    if (!session) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session invalide ou expirée", false);
    }
    const profiles = await service.listProfiles(session.identityId);
    return reply.code(200).send({ profiles, request_id: newRequestId() });
  });

  // INC-7 : changement de profil/école = nouvelle session, ancienne révoquée.
  // Le backend reste l'autorité du contexte : le frontend n'envoie QUE l'id
  // du profil choisi ; l'école est résolue en base, jamais acceptée du client.
  app.post("/auth/native/switch-profile", async (request, reply) => {
    const token = readSessionCookie(request);
    if (!token) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session requise", false);
    }
    const body = z.object({ profileId: z.string().uuid() }).parse(request.body);
    const result = await service.switchProfile(
      token,
      body.profileId,
      request.ip,
      request.headers["user-agent"],
    );
    if (!result.ok) {
      // Session expirée, profil d'un autre utilisateur, profil inactif :
      // une seule réponse, aucune énumération.
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Changement de profil refusé", false);
    }
    setSessionCookie(reply, result.token, { secure: cookieSecure, maxAgeSeconds: 43200 });
    return reply.code(200).send({
      profile_id: result.session.profileId,
      request_id: newRequestId(),
    });
  });

  // Récupération du mot de passe : crée une demande, envoie un lien par email au format.
  // Le login (email) est accepté même si inconnu (pas d'énumération).
  app.post("/auth/native/forgot", async (request, reply) => {
    const { login } = z.object({ login: z.string().min(1).max(320) }).parse(request.body);
    await service.forgotPassword(login);
    // Toujours un message générique (pas d'énumération)
    return reply.code(200).send({
      message: "Si ce compte existe, un lien de récupération a été envoyé.",
      request_id: newRequestId(),
    });
  });

  // Réinitialisation du mot de passe avec le token reçu par email.
  // Le corps contient { token, password } — le hash est fait côté serveur.
  app.post("/auth/native/reset", async (request, reply) => {
    const body = z.object({
      token: z.string().min(32).max(256),
      password: z.string().min(8).max(512),
    }).parse(request.body);
    if (!isAcceptableRecoveryPassword(body.password)) {
      throw new SchoolSafeError(400, 'VALIDATION_INVALID', 'Choisissez un mot de passe non trivial de huit caractères minimum.', false);
    }
    const hashResult = await import("./passwords.js").then(m => m.hashPassword(body.password));
    const succeeded = await service.resetPassword(body.token, hashResult, body.password);
    if (!succeeded) {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Lien de récupération invalide ou expiré.", false);
    }
    return reply.code(200).send({
      message: "Mot de passe réinitialisé avec succès.",
      request_id: newRequestId(),
    });
  });

  // HOTFIX RECOVERY V1-R1 — Méthode 1 : Récupération parentale
  // Vérifie : Nom Parent + Téléphone + Nom Enfant + Classe
  app.post("/auth/recover/parent", async (request, reply) => {
    const parsed = z.object({
      parentFullName: z.string().trim().min(2).max(100),
      phoneNumber: z.string().trim().min(5).max(20),
      childFullName: z.string().trim().min(2).max(100),
      className: z.string().trim().min(2).max(50),
    }).strict().safeParse(request.body);
    if (!parsed.success) throw new SchoolSafeError(400, 'VALIDATION_INVALID', 'Les informations saisies ne permettent pas de confirmer votre identité.', false);
    const body = parsed.data;
    try {
      // Générer un token opaque côté Node
      const rawToken = generateSessionToken();
      const tokenHash = hashSessionToken(rawToken);
      
      const success = await service.recoverParentAccount(
        body.parentFullName,
        body.phoneNumber,
        body.childFullName,
        body.className,
        tokenHash
      );
      
      if (!success) {
        throw new SchoolSafeError(400, "VALIDATION_INVALID", "Les informations saisies ne permettent pas de confirmer votre identité.", false);
      }
      
      return reply.code(200).send({
        reset_token: rawToken, // Le token clair est renvoyé au frontend pour le reset final
        message: "Identité confirmée. Veuillez choisir un nouveau mot de passe.",
        request_id: newRequestId(),
      });
    } catch (e) {
      if (e instanceof SchoolSafeError) throw e;
      throw new SchoolSafeError(500, "INTERNAL_ERROR", "Erreur lors de la vérification.", true);
    }
  });

  // HOTFIX RECOVERY V1-R1 — Méthode 2 : Assistance Administrateur
  app.post('/auth/recover/profile', async (request, reply) => {
    const body = z.object({
      fullName: z.string().trim().min(2).max(100),
      phoneNumber: z.string().trim().min(5).max(20),
      schoolName: z.string().trim().min(2).max(200),
      roleName: z.string().trim().min(2).max(100),
    }).strict().safeParse(request.body);
    const refusal = 'Les informations saisies ne permettent pas de confirmer votre identité.';
    if (!body.success) throw new SchoolSafeError(400, 'VALIDATION_INVALID', refusal, false);
    const rawToken = generateSessionToken();
    const data = body.data;
    const success = await service.recoverProfileAccount(data.fullName, data.phoneNumber, data.schoolName, data.roleName, hashSessionToken(rawToken));
    if (!success) throw new SchoolSafeError(400, 'VALIDATION_INVALID', refusal, false);
    return reply.send({reset_token: rawToken, request_id: newRequestId()});
  });

  // Génère un code temporaire pour un utilisateur cible (Admin authentifié requis)
  app.post("/auth/recovery/admin/generate", async (request, reply) => {
    // Cette route devrait être protégée par une session admin active
    const token = readSessionCookie(request);
    if (!token) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session administrateur requise", false);
    }
    const session = await service.resolveSession(token);
    if (!session) {
      throw new SchoolSafeError(401, "AUTH_REQUIRED", "Session invalide", false);
    }
    
    const body = z.object({
      targetProfileId: z.string().uuid(),
    }).strict().parse(request.body);

    try {
      const targetIdentityId = await service.resolveAdminRecoveryTarget(session.profileId, body.targetProfileId);
      if (!targetIdentityId) {
        throw new SchoolSafeError(403, "AUTH_REQUIRED", "Génération de code refusée", false);
      }

      // Générer le code 10 chiffres
      const code = generateAdminRecoveryCode();
      const codeHash = hashSessionToken(code);

      const success = await service.adminGenerateRecoveryCode(
        session.profileId,
        targetIdentityId,
        codeHash
      );

      if (!success) {
        throw new SchoolSafeError(403, "AUTH_REQUIRED", "Génération de code refusée", false);
      }

      return reply.code(200).send({
        code: code,
        expiresInMinutes: 60,
        request_id: newRequestId(),
      });
    } catch (e) {
      if (e instanceof SchoolSafeError) throw e;
      throw new SchoolSafeError(500, "INTERNAL_ERROR", "Erreur serveur", true);
    }
  });

  // HOTFIX RECOVERY V1-R1 — Consommation du code Admin
  // Route publique : Login + Code -> Token de reset
  app.post("/auth/recovery/admin/redeem", async (request, reply) => {
    const body = z.object({
      login: z.string().min(1).max(320),
      code: z.string().regex(/^\d{10}$/),
    }).strict().parse(request.body);

    try {
      const codeHash = hashSessionToken(body.code);
      const rawToken = generateSessionToken();
      const success = await service.redeemAdminRecoveryCode(body.login, codeHash, hashSessionToken(rawToken));
      
      if (!success) {
        throw new SchoolSafeError(400, "VALIDATION_INVALID", "Le code de récupération est invalide ou expiré.", false);
      }

      return reply.code(200).send({
        reset_token: rawToken,
        message: "Code valide. Veuillez choisir un nouveau mot de passe.",
        request_id: newRequestId(),
      });
    } catch (e) {
      if (e instanceof SchoolSafeError) throw e;
      throw new SchoolSafeError(500, "INTERNAL_ERROR", "Erreur lors de la vérification.", true);
    }
  });
}

