import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cible métier d'une vérification de scope.
 * Tous les champs sont optionnels : chaque scope type n'utilise que ce dont il a besoin.
 */
export interface ScopeTarget {
  studentId?: string;
  classId?: string;
  subjectId?: string;
  profileId?: string;
}

export interface ScopeResolver {
  checkScope(token: string, scopeType: string, target: ScopeTarget): Promise<boolean>;
  /** Vrai si le profil courant a au moins un lien tuteur (student_guardians). */
  hasGuardianLinks(token: string): Promise<boolean>;
}

export type ScopeResolverDeps = {
  /** Fabrique un client Supabase dans le contexte utilisateur (RLS appliquée). */
  createClient: (token: string) => SupabaseClient;
};

/**
 * Résolveurs de scope métier SchoolSafe.
 * Règle verrouillée : DENY par défaut — toute erreur ou donnée manquante renvoie false.
 */
export function createScopeResolver(deps: ScopeResolverDeps): ScopeResolver {
  async function currentProfileId(client: SupabaseClient): Promise<string | null> {
    const { data, error } = await client.rpc("current_profile_id");
    if (error) {
      console.error("[scope-resolver] current_profile_id error:", error.message);
      return null;
    }
    return typeof data === "string" && data.length > 0 ? data : null;
  }

  async function checkScope(token: string, scopeType: string, target: ScopeTarget): Promise<boolean> {
    try {
      const client = deps.createClient(token);

      switch (scopeType) {
        case "none":
          return true;

        case "school": {
          // Instance mono-école : un profil actif suffit.
          const profileId = await currentProfileId(client);
          if (!profileId) return false;
          const { data, error } = await client
            .from("profiles")
            .select("id")
            .eq("id", profileId)
            .eq("is_active", true)
            .maybeSingle();
          if (error) {
            console.error("[scope-resolver] school scope error:", error.message);
            return false;
          }
          return data !== null;
        }

        case "own": {
          const profileId = await currentProfileId(client);
          if (!profileId || !target.profileId) return false;
          return target.profileId === profileId;
        }

        case "own_children": {
          const profileId = await currentProfileId(client);
          if (!profileId || !target.studentId) return false;
          const { data, error } = await client
            .from("student_guardians")
            .select("id")
            .eq("profile_id", profileId)
            .eq("student_id", target.studentId)
            .limit(1);
          if (error) {
            console.error("[scope-resolver] own_children scope error:", error.message);
            return false;
          }
          return (data ?? []).length > 0;
        }

        case "assigned_classes": {
          const profileId = await currentProfileId(client);
          if (!profileId) return false;

          let classId = target.classId ?? null;
          if (!classId && target.studentId) {
            const { data: student, error: studentError } = await client
              .from("students")
              .select("class_id")
              .eq("id", target.studentId)
              .eq("lifecycle_status", "active")
              .maybeSingle();
            if (studentError) {
              console.error("[scope-resolver] assigned_classes student lookup error:", studentError.message);
              return false;
            }
            classId = (student?.class_id as string | null) ?? null;
          }
          if (!classId) return false;

          const { data: assignments, error: assignmentError } = await client
            .from("teacher_assignments")
            .select("id")
            .eq("teacher_id", profileId)
            .eq("class_id", classId)
            .limit(1);
          if (assignmentError) {
            console.error("[scope-resolver] assigned_classes assignments error:", assignmentError.message);
            return false;
          }
          if ((assignments ?? []).length > 0) return true;

          return await scopeAssignmentFallback(client, profileId, "assigned_classes", classId);
        }

        case "assigned_subjects": {
          const profileId = await currentProfileId(client);
          if (!profileId || !target.subjectId) return false;

          const { data: assignments, error: assignmentError } = await client
            .from("teacher_assignments")
            .select("id")
            .eq("teacher_id", profileId)
            .eq("subject_id", target.subjectId)
            .limit(1);
          if (assignmentError) {
            console.error("[scope-resolver] assigned_subjects assignments error:", assignmentError.message);
            return false;
          }
          if ((assignments ?? []).length > 0) return true;

          return await scopeAssignmentFallback(client, profileId, "assigned_subjects", target.subjectId);
        }

        default: {
          // assigned_portal et scopes inconnus : comportement actuel conservé (RPC has_scope).
          const { data, error } = await client.rpc("has_scope", {
            requested_scope_type: scopeType,
            requested_scope_id:
              target.classId ?? target.subjectId ?? target.studentId ?? target.profileId ?? null,
          });
          if (error) {
            console.error(`[scope-resolver] has_scope fallback error for ${scopeType}:`, error.message);
            return false;
          }
          return data === true;
        }
      }
    } catch (error) {
      console.error(`[scope-resolver] checkScope error for ${scopeType}:`, error);
      return false;
    }
  }

  async function scopeAssignmentFallback(
    client: SupabaseClient,
    profileId: string,
    scopeType: string,
    scopeId: string,
  ): Promise<boolean> {
    const { data, error } = await client
      .from("scope_assignments")
      .select("id")
      .eq("profile_id", profileId)
      .eq("scope_type", scopeType)
      .eq("scope_id", scopeId)
      .limit(1);
    if (error) {
      console.error(`[scope-resolver] ${scopeType} scope_assignments fallback error:`, error.message);
      return false;
    }
    return (data ?? []).length > 0;
  }

  async function hasGuardianLinks(token: string): Promise<boolean> {
    try {
      const client = deps.createClient(token);
      const profileId = await currentProfileId(client);
      if (!profileId) return false;
      const { data, error } = await client
        .from("student_guardians")
        .select("id")
        .eq("profile_id", profileId)
        .limit(1);
      if (error) {
        console.error("[scope-resolver] hasGuardianLinks error:", error.message);
        return false;
      }
      return (data ?? []).length > 0;
    } catch (error) {
      console.error("[scope-resolver] hasGuardianLinks error:", error);
      return false;
    }
  }

  return { checkScope, hasGuardianLinks };
}
