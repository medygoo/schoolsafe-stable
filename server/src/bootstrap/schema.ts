// Contrat canonique transitoire (INC-1/INC-2) : la table legacy
// scope_assignments n'a pas de lien permission → permission est explicitement
// null et le frontend écarte ces portées (fail-closed).
export type BootstrapScope = {
  permission: string | null;
  type: string;
  target: string | null;
  label: string | null;
};

export type BootstrapResponse = {
  contract_version: "1";
  profile: { id: string; display_name: string };
  roles: string[];
  permissions: string[];
  scopes: BootstrapScope[];
  school: { id: string; name: string; logo_path?: string | null };
  academic_year: null | { id: string; label: string };
  features: string[];
  offline_policy: { max_offline_hours: number };
};
