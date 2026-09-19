import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBootstrapService } from "../src/bootstrap/service.js";
import { createUserContextClient } from "../src/auth/supabase.js";

vi.mock("../src/auth/supabase.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/auth/supabase.js")>();
  return { ...original, createUserContextClient: vi.fn() };
});

type Row = Record<string, unknown>;

function applyFilters(rows: Row[], filters: Record<string, unknown>): Row[] {
  return rows.filter((row) =>
    Object.entries(filters).every(([key, value]) =>
      Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
    ),
  );
}

function bootstrapMockClient(tables: Record<string, Row[]>): SupabaseClient {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    const rows = () => applyFilters(tables[table] ?? [], filters);
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
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

function baseTables(exceptions: Row[]): Record<string, Row[]> {
  return {
    profiles: [{ id: "p1", display_name: "Teacher Test", school_id: "s1" }],
    profile_roles: [{ role_id: "r1" }],
    roles: [{ id: "r1", code: "teacher" }],
    role_permission_grants: [{ role_id: "r1", permission_id: "perm-a", allowed: true }],
    permissions: [
      { id: "perm-a", code: "finance.receipt.read" },
      { id: "perm-b", code: "pedagogy.grade.read" },
    ],
    profile_permission_exceptions: exceptions,
    scope_assignments: [],
    school: [{ id: "s1", name: "Test school" }],
    school_settings: [{ school_id: "s1", max_offline_hours: 24 }],
  };
}

describe("createBootstrapService — exceptions individuelles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function loadPermissions(tables: Record<string, Row[]>): Promise<string[]> {
    (createUserContextClient as Mock).mockReturnValue(bootstrapMockClient(tables));
    const service = createBootstrapService("http://localhost", "anon-key");
    const result = await service.load("user-token");
    expect(result).not.toBeNull();
    return result!.permissions;
  }

  it("une exception ALLOW active ajoute la permission", async () => {
    const permissions = await loadPermissions(
      baseTables([{ permission_code: "pedagogy.grade.read", allowed: true, expires_at: null }]),
    );
    expect(permissions).toContain("finance.receipt.read");
    expect(permissions).toContain("pedagogy.grade.read");
  });

  it("une exception DENY active retire la permission", async () => {
    const permissions = await loadPermissions(
      baseTables([{ permission_code: "finance.receipt.read", allowed: false, expires_at: null }]),
    );
    expect(permissions).not.toContain("finance.receipt.read");
  });

  it("un DENY de rôle l'emporte sur une exception ALLOW", async () => {
    const tables = baseTables([
      { permission_code: "pedagogy.grade.read", allowed: true, expires_at: null },
    ]);
    tables.role_permission_grants = [
      { role_id: "r1", permission_id: "perm-a", allowed: true },
      { role_id: "r1", permission_id: "perm-b", allowed: false },
    ];
    const permissions = await loadPermissions(tables);
    expect(permissions).toContain("finance.receipt.read");
    expect(permissions).not.toContain("pedagogy.grade.read");
  });

  it("les exceptions expirées sont ignorées", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const permissions = await loadPermissions(
      baseTables([
        { permission_code: "pedagogy.grade.read", allowed: true, expires_at: past },
        { permission_code: "finance.receipt.read", allowed: false, expires_at: past },
      ]),
    );
    expect(permissions).toEqual(["finance.receipt.read"]);
  });
});
