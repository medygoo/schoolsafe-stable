import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const defaultBaselineDir = path.resolve(scriptsDir, "..");

const reviewFiles = [
  "01_roles.sql",
  "05_iam.sql",
  "07_constraints_indexes.sql",
  "08_internal_functions.sql",
  "09_api_rpc.sql",
  "10_triggers.sql",
  "11_rls_acl.sql",
  "12_seed_permissions.sql",
  "13_verification.sql",
  "tests/from-zero-access-law.test.sql",
  "scripts/run-from-zero-test.sh",
];

const allUnits = [
  "01_roles.sql",
  "02_schemas.sql",
  "03_extensions.sql",
  "04_app_tables.sql",
  "05_iam.sql",
  "06_audit_ops.sql",
  "07_constraints_indexes.sql",
  "08_internal_functions.sql",
  "09_api_rpc.sql",
  "10_triggers.sql",
  "11_rls_acl.sql",
  "12_seed_permissions.sql",
  "13_verification.sql",
];

const metadata = {
  "01_roles.sql": {
    dependencies: ["bootstrap session with CREATEROLE", "PostgreSQL 17.11"],
    risks: ["LOGIN roles remain unusable until out-of-Git SCRAM secrets are injected"],
    objects: [
      "role schoolsafe_owner (NOLOGIN)",
      "role schoolsafe_migrator (LOGIN)",
      "role schoolsafe_api (LOGIN)",
      "role schoolsafe_worker (LOGIN)",
      "role schoolsafe_auditor (NOLOGIN)",
    ],
  },
  "05_iam.sql": {
    dependencies: ["01_roles.sql", "02_schemas.sql", "04_app_tables.sql for app.schools"],
    risks: ["every scope must remain attached to its exact grant or exception"],
  },
  "07_constraints_indexes.sql": {
    dependencies: ["all table definitions from units 04-06"],
    risks: ["a missing composite school_id foreign key could make a cross-school relation representable"],
  },
  "08_internal_functions.sql": {
    dependencies: ["04_app_tables.sql", "05_iam.sql", "06_audit_ops.sql", "07_constraints_indexes.sql"],
    risks: ["authorization correctness depends on complete transaction-local backend context"],
  },
  "09_api_rpc.sql": {
    dependencies: ["08_internal_functions.sql", "canonical permissions later seeded by unit 12"],
    risks: ["eight mutating P0 RPCs require semantic execution tests before any production use"],
  },
  "10_triggers.sql": {
    dependencies: ["tenant composite constraints from unit 07", "audit.write_event from unit 08"],
    risks: ["access configuration changes must remain fully audited"],
  },
  "11_rls_acl.sql": {
    dependencies: ["all tables from units 04-06", "functions from units 08-10", "03_extensions.sql ACL lockdown"],
    risks: ["a missed tenant-aware table or runtime grant would create a data-isolation failure"],
    rls: [
      "ENABLE + FORCE RLS on every tenant-aware app table",
      "ENABLE + FORCE RLS on tenant-aware iam tables",
      "ENABLE + FORCE RLS on audit.events",
      "ENABLE + FORCE RLS on tenant-aware ops tables",
      "operation-specific SELECT/INSERT/UPDATE/DELETE policies",
      "no UPDATE/DELETE policies for append-only ledgers",
    ],
  },
  "12_seed_permissions.sql": {
    dependencies: ["05_iam.sql", "07_constraints_indexes.sql"],
    risks: ["catalog drift is fatal: the unit asserts exactly 60 permissions and seven scopes"],
    objects: ["60 canonical permission rows", "7 canonical scope rows"],
  },
  "13_verification.sql": {
    dependencies: ["units 01-12", "pg_stat_statements preloaded and installed by unit 03"],
    risks: ["structural verification does not replace the rollback-only semantic Access_Law test"],
  },
  "tests/from-zero-access-law.test.sql": {
    dependencies: ["fully applied disposable TEST baseline", "synthetic School A/B/C fixtures"],
    risks: ["SQL is intentionally executable only later and must end in ROLLBACK"],
    objects: [
      "temporary pg_temp.assert_true function",
      "rollback-only School A/B/C identities, roles, grants, classes, subjects and children",
    ],
  },
  "scripts/run-from-zero-test.sh": {
    dependencies: ["root-authorized Docker CLI", "empty schoolsafe_test", "reviewed manifest.sha256"],
    risks: ["future apply mutates TEST; explicit confirmation and empty-target gates are mandatory"],
    objects: ["none directly; orchestrates the 13 reviewed SQL units"],
  },
};

function normalizeStatement(statement) {
  return statement.replace(/\s+/g, " ").trim();
}

function extractStatements(source, keyword) {
  const expression = new RegExp(`(?:^|\\n)\\s*(${keyword}\\b[\\s\\S]*?;)`, "gi");
  return [...source.matchAll(expression)].map((match) => normalizeStatement(match[1]));
}

function extractFunctions(source) {
  return [...source.matchAll(
    /create or replace function\s+([a-z_][a-z0-9_.]*)\s*\([\s\S]*?\$schoolsafe\$;/gi,
  )].map((match) => ({ name: match[1], block: match[0] }));
}

function extractObjects(source, explicitObjects = []) {
  const objects = new Set(explicitObjects);
  for (const match of source.matchAll(/create table if not exists\s+([a-z_][a-z0-9_.]*)/gi)) {
    objects.add(`table ${match[1]}`);
  }
  for (const { name } of extractFunctions(source)) {
    objects.add(`function ${name}`);
  }
  for (const match of source.matchAll(/create policy\s+([a-z_][a-z0-9_]*)/gi)) {
    objects.add(`policy ${match[1]}`);
  }
  return [...objects];
}

function extractSecurityDefiners(source) {
  return extractFunctions(source)
    .filter(({ block }) => /security definer/i.test(block))
    .map(({ name, block }) => ({
      function: name,
      safe_search_path: /set search_path\s*=\s*pg_catalog/i.test(block),
    }));
}

function countSeedRows(source, marker) {
  const start = source.indexOf(marker);
  const tail = start === -1 ? "" : source.slice(start + marker.length);
  const end = tail.indexOf("-- END CANONICAL SEED");
  if (start === -1 || end === -1) return 0;
  return [...tail.slice(0, end).matchAll(/\('([^']+)'\s*,/g)].length;
}

function staticControl(name, passed, evidence) {
  return { name, status: passed ? "PASS" : "FAIL", evidence };
}

function extractTenantTables(source) {
  const tables = new Set();
  for (const match of source.matchAll(
    /create table if not exists\s+([a-z_]+\.[a-z_]+)\s*\(([\s\S]*?)\n\);/gi,
  )) {
    if (/^\s*school_id\s+uuid\b/im.test(match[2])) tables.add(match[1].toLowerCase());
  }
  return tables;
}

function tenantForeignKeysAreComposite(tableSql, constraintsSql) {
  const tenants = extractTenantTables(tableSql);
  const foreignKeys = [...constraintsSql.matchAll(
    /\('([a-z_]+\.[a-z_]+)',\s*'[^']+',\s*'foreign key \(([^)]+)\) references ([a-z_]+\.[a-z_]+)\(([^)]+)\)/gi,
  )];
  return foreignKeys.length > 0 && foreignKeys.every(([, child, childColumns, parent, parentColumns]) => {
    if (!tenants.has(child.toLowerCase()) || !tenants.has(parent.toLowerCase())) return true;
    return childColumns.split(",")[0].trim().toLowerCase() === "school_id"
      && parentColumns.split(",")[0].trim().toLowerCase() === "school_id";
  });
}

export async function buildReviewBundle(baselineDir = defaultBaselineDir) {
  const sources = new Map();
  for (const file of new Set([...allUnits, ...reviewFiles])) {
    sources.set(file, await readFile(path.join(baselineDir, file), "utf8"));
  }

  const files = [];
  for (const file of reviewFiles) {
    const source = sources.get(file);
    const bytes = Buffer.from(source, "utf8");
    const securityDefiner = extractSecurityDefiners(source);
    files.push({
      file,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      lines: source === "" ? 0 : source.split(/\r?\n/).length - Number(source.endsWith("\n")),
      objects_created: extractObjects(source, metadata[file].objects),
      security_definer: securityDefiner,
      grants: extractStatements(source, "grant"),
      revokes: extractStatements(source, "revoke"),
      rls: metadata[file].rls ?? [
        ...source.matchAll(/alter table[\s\S]{0,160}?(?:enable|force) row level security/gi),
      ].map((match) => normalizeStatement(match[0])),
      dependencies: metadata[file].dependencies,
      risks: metadata[file].risks,
    });
  }

  const allSql = allUnits.map((file) => sources.get(file)).join("\n");
  const rolesSql = sources.get("01_roles.sql");
  const internalSql = sources.get("08_internal_functions.sql");
  const iamSql = sources.get("05_iam.sql");
  const constraintsSql = sources.get("07_constraints_indexes.sql");
  const rpcSql = sources.get("09_api_rpc.sql");
  const rlsSql = sources.get("11_rls_acl.sql");
  const seedSql = sources.get("12_seed_permissions.sql");
  const permissions = countSeedRows(seedSql, "-- BEGIN CANONICAL PERMISSIONS");
  const scopes = countSeedRows(seedSql, "-- BEGIN CANONICAL SCOPES");
  const definers = allUnits.flatMap((file) => extractSecurityDefiners(sources.get(file)));

  const staticControls = [
    staticControl("no auth.uid()", !/auth\.uid\s*\(/i.test(allSql), "PostgreSQL transaction context only"),
    staticControl("no BYPASSRLS", !/\bBYPASSRLS\b/i.test(allSql), "all five SchoolSafe roles use NOBYPASSRLS"),
    staticControl("no application SUPERUSER", !/\bSUPERUSER\b/i.test(rolesSql), "all application roles use NOSUPERUSER"),
    staticControl("no GRANT to PUBLIC", !/\bgrant\b[^;]*\bto\s+public\b/i.test(allSql), "PUBLIC is revoked, never granted"),
    staticControl("no CREATE in public", !/\bcreate\s+(?:table|function|view|sequence)\s+(?:if\s+not\s+exists\s+)?public\./i.test(allSql), "SchoolSafe objects use protected schemas"),
    staticControl("SECURITY DEFINER search_path", definers.length > 0 && definers.every(({ safe_search_path }) => safe_search_path), `${definers.length} definers pin pg_catalog`),
    staticControl("P0 actor/school authority", !/\bp_(?:actor_profile_id|school_id)\b/i.test(rpcSql), "P0 RPCs derive actor and school from iam.current_* context"),
    staticControl("canonical permissions", permissions === 60, `${permissions} permissions in unit 12`),
    staticControl("canonical scopes", scopes === 7, `${scopes} scopes in unit 12`),
    staticControl("permission-bound scopes", /create table if not exists iam\.grant_scopes/i.test(iamSql) && /create table if not exists iam\.exception_scopes/i.test(iamSql) && !/create table if not exists iam\.scope_assignments/i.test(iamSql), "grant_scopes and exception_scopes replace global profile scopes"),
    staticControl("tenant composite foreign keys", tenantForeignKeysAreComposite([sources.get("04_app_tables.sql"), iamSql, sources.get("06_audit_ops.sql")].join("\n"), constraintsSql), "every declared tenant-to-tenant FK includes school_id on both sides"),
    staticControl("assigned_classes AND assigned_subjects", /ta\.class_id\s*=\s*p_class_id/i.test(internalSql) && /ta\.subject_id\s*=\s*p_subject_id/i.test(internalSql), "one active exact class-subject assignment"),
    staticControl("no pedagogical class/subject OR", !/ta\.class_id\s*=\s*p_class_id\s+or\s+ta\.subject_id/i.test(internalSql), "no OR in exact teacher assignment"),
    staticControl("explicit DENY priority", internalSql.indexOf("not iam.has_explicit_deny") < internalSql.indexOf("e.effect = 'allow'"), "DENY guard precedes both ALLOW paths"),
    staticControl("no Supabase dependency", !/\bservice_role\b|\bsupabase_[a-z][a-z0-9_]*\b/i.test(allSql), "pure PostgreSQL baseline"),
    staticControl("operation-specific RLS", !/create policy[\s\S]{0,240}\bfor all\b/i.test(rlsSql), "no business FOR ALL policy is created"),
    staticControl("non-recursive IAM RLS", /context_is_valid\(\) reads iam\.profiles/i.test(rlsSql), "IAM policies use the school setting while API entry points validate the full context"),
    staticControl("explicit API execute allowlist", !/grant execute on all functions in schema api to schoolsafe_api/i.test(rlsSql) && /grant execute on function api\.check_access\s*\(/i.test(rlsSql), "every API function grant is signature-specific"),
    staticControl("no browser direct table access", /revoke all on all tables in schema app from schoolsafe_api/i.test(rlsSql) && !/grant\s+(?:select|insert|update|delete|all)[^;]+to\s+schoolsafe_api/i.test(rlsSql), "schoolsafe_api executes allowlisted API functions only"),
  ];

  return {
    review: "DB-04B-R2",
    status: staticControls.every(({ status }) => status === "PASS") ? "READY FOR FINAL REVIEW" : "STATIC CONTROL FAILURE",
    generated_from: "repository files only; no database, Docker, Cloud or VPS access",
    catalog: { permissions, scopes },
    static_controls: staticControls,
    files,
  };
}

function markdownList(values, render = (value) => `\`${value}\``) {
  if (values.length === 0) return "- Aucun.";
  return values.map((value) => `- ${render(value)}`).join("\n");
}

function renderMarkdown(bundle) {
  const sections = bundle.files.map((entry) => {
    const definers = entry.security_definer.map(({ function: name, safe_search_path }) =>
      `${name} — search_path pg_catalog: ${safe_search_path ? "PASS" : "FAIL"}`,
    );
    return [
      `## ${entry.file}`,
      "",
      `- SHA-256 : \`${entry.sha256}\``,
      `- Lignes : ${entry.lines}`,
      "",
      "### Objets créés",
      "",
      markdownList(entry.objects_created),
      "",
      "### SECURITY DEFINER",
      "",
      markdownList(definers),
      "",
      "### GRANT",
      "",
      markdownList(entry.grants),
      "",
      "### REVOKE",
      "",
      markdownList(entry.revokes),
      "",
      "### ENABLE/FORCE RLS",
      "",
      markdownList(entry.rls),
      "",
      "### Dépendances",
      "",
      markdownList(entry.dependencies, (value) => value),
      "",
      "### Risques",
      "",
      markdownList(entry.risks, (value) => value),
    ].join("\n");
  });

  return [
    "# DB-04B-R2 — Review bundle SQL critique",
    "",
    `Statut : **${bundle.status}**`,
    "",
    "Ce bundle est généré exclusivement depuis les fichiers du dépôt. Il ne prouve aucune application SQL et n'accède ni à PostgreSQL TEST, ni à Docker, ni au VPS, ni au Cloud.",
    "",
    "## Contrôles statiques obligatoires",
    "",
    "| Contrôle | Statut | Preuve |",
    "|---|---|---|",
    ...bundle.static_controls.map(({ name, status, evidence }) => `| ${name} | ${status} | ${evidence} |`),
    "",
    `Catalogue : **${bundle.catalog.permissions} permissions / ${bundle.catalog.scopes} scopes**.`,
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n");
}

async function main() {
  const bundle = await buildReviewBundle();
  const reviewDir = path.join(defaultBaselineDir, "review");
  await mkdir(reviewDir, { recursive: true });
  await writeFile(
    path.join(reviewDir, "DB-04B-R2-REVIEW-BUNDLE.json"),
    `${JSON.stringify(bundle, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(reviewDir, "DB-04B-R2-REVIEW-BUNDLE.md"),
    renderMarkdown(bundle).replace(/\n*$/, "\n"),
    "utf8",
  );
  if (bundle.status !== "READY FOR FINAL REVIEW") process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
