import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createScopeResolver } from "../src/access/scope-resolvers.js";

type QueryResult = { data: unknown; error: { message: string } | null };

type MockConfig = {
  rpc?: (name: string, params: Record<string, unknown>) => QueryResult;
  query?: (table: string, filters: Record<string, unknown>) => QueryResult;
};

/**
 * Client Supabase simulé : enregistre les filtres eq/in et délègue la réponse
 * aux handlers de config. Supporte select/eq/in/limit/maybeSingle et l'await direct.
 */
function createMockClient(config: MockConfig): SupabaseClient {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const runQuery = (): QueryResult =>
      config.query ? config.query(table, filters) : { data: null, error: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters[column] = values;
        return builder;
      },
      limit: () => builder,
      maybeSingle: async () => {
        const result = runQuery();
        const rows = Array.isArray(result.data) ? result.data : [];
        return { data: rows[0] ?? null, error: result.error };
      },
      then: (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(runQuery()).then(resolve, reject),
    };
    return builder;
  };

  return {
    from,
    rpc: async (name: string, params: Record<string, unknown>) =>
      config.rpc ? config.rpc(name, params) : { data: null, error: null },
  } as unknown as SupabaseClient;
}

function resolverFor(config: MockConfig) {
  return createScopeResolver({ createClient: () => createMockClient(config) });
}

const profileRpc = (profileId: string | null) => (name: string): QueryResult => {
  if (name === "current_profile_id") return { data: profileId, error: null };
  return { data: null, error: null };
};

describe("ScopeResolver", () => {
  it("none est toujours autorisé", async () => {
    const resolver = resolverFor({});
    await expect(resolver.checkScope("token", "none", {})).resolves.toBe(true);
  });

  it("school est autorisé avec un profil actif, refusé sinon", async () => {
    const active = resolverFor({
      rpc: profileRpc("profile-1"),
      query: (table) =>
        table === "profiles" ? { data: [{ id: "profile-1" }], error: null } : { data: [], error: null },
    });
    await expect(active.checkScope("token", "school", {})).resolves.toBe(true);

    const noProfile = resolverFor({ rpc: profileRpc(null) });
    await expect(noProfile.checkScope("token", "school", {})).resolves.toBe(false);
  });

  it("own compare la cible au profil courant", async () => {
    const resolver = resolverFor({ rpc: profileRpc("profile-1") });
    await expect(resolver.checkScope("token", "own", { profileId: "profile-1" })).resolves.toBe(true);
    await expect(resolver.checkScope("token", "own", { profileId: "profile-2" })).resolves.toBe(false);
    await expect(resolver.checkScope("token", "own", {})).resolves.toBe(false);
  });

  it("own_children est vrai quand un lien student_guardians existe", async () => {
    const resolver = resolverFor({
      rpc: profileRpc("parent-1"),
      query: (table, filters) => {
        if (table === "student_guardians") {
          const match = filters.profile_id === "parent-1" && filters.student_id === "student-1";
          return { data: match ? [{ id: "link-1" }] : [], error: null };
        }
        return { data: [], error: null };
      },
    });
    await expect(resolver.checkScope("token", "own_children", { studentId: "student-1" })).resolves.toBe(true);
    await expect(resolver.checkScope("token", "own_children", { studentId: "student-2" })).resolves.toBe(false);
  });

  it("own_children sans studentId est refusé", async () => {
    const resolver = resolverFor({ rpc: profileRpc("parent-1") });
    await expect(resolver.checkScope("token", "own_children", {})).resolves.toBe(false);
  });

  it("assigned_classes est vrai via teacher_assignments sur la classe de l'élève", async () => {
    const resolver = resolverFor({
      rpc: profileRpc("teacher-1"),
      query: (table, filters) => {
        if (table === "students") return { data: [{ class_id: "class-1" }], error: null };
        if (table === "teacher_assignments") {
          const match = filters.teacher_id === "teacher-1" && filters.class_id === "class-1";
          return { data: match ? [{ id: "ta-1" }] : [], error: null };
        }
        return { data: [], error: null };
      },
    });
    await expect(
      resolver.checkScope("token", "assigned_classes", { studentId: "student-1" }),
    ).resolves.toBe(true);
  });

  it("assigned_classes retombe sur scope_assignments sans affectation enseignant", async () => {
    const resolver = resolverFor({
      rpc: profileRpc("teacher-1"),
      query: (table, filters) => {
        if (table === "teacher_assignments") return { data: [], error: null };
        if (table === "scope_assignments") {
          const match =
            filters.profile_id === "teacher-1" &&
            filters.scope_type === "assigned_classes" &&
            filters.scope_id === "class-1";
          return { data: match ? [{ id: "sa-1" }] : [], error: null };
        }
        return { data: [], error: null };
      },
    });
    await expect(resolver.checkScope("token", "assigned_classes", { classId: "class-1" })).resolves.toBe(true);
    await expect(resolver.checkScope("token", "assigned_classes", { classId: "class-2" })).resolves.toBe(false);
  });

  it("assigned_subjects est vrai via teacher_assignments sur la matière", async () => {
    const resolver = resolverFor({
      rpc: profileRpc("teacher-1"),
      query: (table, filters) => {
        if (table === "teacher_assignments") {
          const match = filters.teacher_id === "teacher-1" && filters.subject_id === "subject-1";
          return { data: match ? [{ id: "ta-1" }] : [], error: null };
        }
        return { data: [], error: null };
      },
    });
    await expect(resolver.checkScope("token", "assigned_subjects", { subjectId: "subject-1" })).resolves.toBe(true);
    await expect(resolver.checkScope("token", "assigned_subjects", { subjectId: "subject-2" })).resolves.toBe(false);
  });

  it("les scopes inconnus retombent sur la RPC has_scope", async () => {
    const resolver = resolverFor({
      rpc: (name, params) => {
        if (name === "has_scope") {
          return {
            data: params.requested_scope_type === "assigned_portal" && params.requested_scope_id === "portal-1",
            error: null,
          };
        }
        return { data: null, error: null };
      },
    });
    await expect(resolver.checkScope("token", "assigned_portal", { profileId: "portal-1" })).resolves.toBe(true);
    await expect(resolver.checkScope("token", "assigned_portal", { profileId: "portal-2" })).resolves.toBe(false);
  });

  it("toute erreur est fail-closed (false) et loguée", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const resolver = resolverFor({
      rpc: () => ({ data: null, error: { message: "boom" } }),
    });
    await expect(resolver.checkScope("token", "own_children", { studentId: "student-1" })).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("hasGuardianLinks reflète l'existence d'un lien tuteur", async () => {
    const parent = resolverFor({
      rpc: profileRpc("parent-1"),
      query: (table) =>
        table === "student_guardians" ? { data: [{ id: "link-1" }], error: null } : { data: [], error: null },
    });
    await expect(parent.hasGuardianLinks("token")).resolves.toBe(true);

    const staff = resolverFor({
      rpc: profileRpc("staff-1"),
      query: () => ({ data: [], error: null }),
    });
    await expect(staff.hasGuardianLinks("token")).resolves.toBe(false);
  });
});
