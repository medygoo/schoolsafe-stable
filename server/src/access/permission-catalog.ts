import { readFileSync } from "node:fs";

const catalogUrl = new URL("../../../shared/permissions.json", import.meta.url);

export interface PermissionEntry {
  code: string;
  label: string;
  scope: string;
}

const VALID_SCOPES = new Set([
  "own",
  "own_children",
  "assigned_classes",
  "assigned_subjects",
  "assigned_portal",
  "school",
  "none",
]);

function isPermissionEntry(value: unknown): value is PermissionEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.code === "string" &&
    entry.code.length > 0 &&
    typeof entry.label === "string" &&
    typeof entry.scope === "string" &&
    VALID_SCOPES.has(entry.scope)
  );
}

function loadCatalog(): ReadonlyArray<PermissionEntry> {
  const parsed: unknown = JSON.parse(readFileSync(catalogUrl, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid permission catalog: expected an array");
  }
  if (parsed.length === 0) {
    throw new Error("Invalid permission catalog: empty array");
  }
  if (!parsed.every(isPermissionEntry)) {
    throw new Error(
      "Invalid permission catalog: entries must have code, label and a valid scope (own, own_children, assigned_classes, assigned_subjects, assigned_portal, school, none)"
    );
  }

  const codes = parsed.map((entry) => entry.code);
  const uniqueCodes = new Set(codes);
  if (uniqueCodes.size !== codes.length) {
    throw new Error("Invalid permission catalog: duplicate permission codes found");
  }

  return Object.freeze(parsed);
}

const catalog = loadCatalog();

/**
 * Retourne l'ensemble des codes de permissions du catalogue.
 * Gardé pour la compatibilité avec le code existant.
 */
export function loadPermissionCatalog(): ReadonlySet<string> {
  return new Set(catalog.map((entry) => entry.code));
}

/**
 * Retourne le catalogue complet avec labels et scopes.
 */
export function getPermissionCatalog(): ReadonlyArray<PermissionEntry> {
  return catalog;
}

/**
 * Retourne l'entrée d'une permission donnée, ou undefined si inconnue.
 */
export function getPermissionEntry(code: string): PermissionEntry | undefined {
  return catalog.find((entry) => entry.code === code);
}

/**
 * Retourne le scope officiel d'une permission donnée.
 */
export function getPermissionScope(code: string): string | undefined {
  return getPermissionEntry(code)?.scope;
}
