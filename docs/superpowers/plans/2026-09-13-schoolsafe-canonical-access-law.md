# SchoolSafe Canonical Access Law Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every active VPS business path use one canonical permission catalog and execute inside an authenticated, school-scoped Access Law context.

**Architecture:** PostgreSQL remains the sovereign authorization engine through `api.set_request_context`, `api.check_access`, `iam.can_access` and allowlisted `api.*` functions. The Node server transports the authenticated session into one transaction and never recomputes permissions. SchoolSafe Control machine callbacks remain separate from human sessions and use signed service authority with a dedicated allowlist.

**Tech Stack:** PostgreSQL SQL migrations, Node.js 22, TypeScript 5.8, Fastify 5, Vitest 4, Node test runner, plain JavaScript contract scripts.

**Spec:** `docs/superpowers/specs/2026-09-13-schoolsafe-access-experience-harmonization-design.md`

## Global Constraints

- Preserve HTML/CSS/JavaScript; do not introduce React or Ant Design.
- Do not add Docker or change the VPS during this plan.
- Do not reintroduce 3D; JASPE remains 2D/2.5D.
- Preserve SchoolSafe Control as the protected central authority for schools, licenses, supervision and printing.
- Access is denied by default; applicable explicit `deny` wins.
- Never accept `userId`, `profileId` or `schoolId` from a browser payload.
- Every human business RPC runs in the same transaction as `api.set_request_context`.
- Tests remain targeted, but permission, child, money, inter-school isolation and migration contracts are mandatory.
- Complete and synchronize this plan on `main` before any VPS change.

---

## File responsibility map

- `shared/permissions.json`: canonical permission vocabulary consumed by database, server and browser.
- `scripts/permission-contract.mjs`: repository scanner that extracts permission literals from active guards and SQL authorization calls.
- `scripts/permission-contract.test.mjs`: unit and repository-level contract tests for the scanner.
- `database/baseline/v1/12_seed_permissions.sql`: database seed matching the shared catalog exactly.
- `database/access/v1/01_role_templates.sql`: built-in post templates expressed only with canonical permissions.
- `database/{finance,pedagogy,cards}/v1/*.sql`: business RPCs with canonical permissions and exact targets.
- `server/src/db/context.ts`: transaction-scoped human request executor.
- `server/src/db/access.ts`: optional preflight authorization inside the same transaction.
- `server/src/{studentsnative,financenative,pedagogynative,cardsnative}/service.ts`: human services that receive `RequestContext` and use the contextual client.
- `server/src/controlprintnative/*`: signed SchoolSafe Control machine path, never confused with a human profile.
- `server/tests/native-access-contract.test.ts`: active-path assertion that forbids uncontextualized human business queries.

---

### Task 1: Add an executable canonical-permission contract

**Files:**
- Create: `scripts/permission-contract.mjs`
- Create: `scripts/permission-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `loadPermissionCatalog(rootDir): Promise<Map<string, PermissionEntry>>`
- Produces: `scanAuthorizationLiterals(rootDir): Promise<AuthorizationUse[]>`
- Produces: `assertCanonicalPermissions(rootDir): Promise<void>`
- `PermissionEntry = { code: string; label: string; scope: string; authority?: "school" | "control" }`
- `AuthorizationUse = { code: string; file: string; line: number }`

- [ ] **Step 1: Write the failing scanner unit test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPermissionCatalog,
  scanAuthorizationLiterals,
} from "./permission-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("shared permission codes are unique and structurally valid", async () => {
  const catalog = await loadPermissionCatalog(root);
  assert.ok(catalog.size >= 60);
  for (const [code, entry] of catalog) {
    assert.match(code, /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/);
    assert.ok(entry.label.trim().length > 0);
    assert.match(entry.scope, /^(none|school|own|own_children|assigned_classes|assigned_subjects|assigned_portal|assigned_fee_classes)$/);
  }
});

test("authorization literals include their exact source line", async () => {
  const uses = await scanAuthorizationLiterals(root);
  assert.ok(uses.some(use => use.file.endsWith("database/baseline/v1/09_api_rpc.sql")));
  assert.ok(uses.every(use => Number.isInteger(use.line) && use.line > 0));
});
```

- [ ] **Step 2: Run the unit test and verify the missing module failure**

Run: `node --test scripts/permission-contract.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/permission-contract.mjs`.

- [ ] **Step 3: Implement the scanner**

```js
import { readFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "node:fs/promises";

const ALLOWED_SCOPES = new Set([
  "none", "school", "own", "own_children", "assigned_classes",
  "assigned_subjects", "assigned_portal", "assigned_fee_classes",
]);

export async function loadPermissionCatalog(rootDir) {
  const entries = JSON.parse(await readFile(path.join(rootDir, "shared/permissions.json"), "utf8"));
  const catalog = new Map();
  for (const entry of entries) {
    if (!entry?.code || !entry?.label || !ALLOWED_SCOPES.has(entry.scope)) {
      throw new Error(`Invalid permission entry: ${JSON.stringify(entry)}`);
    }
    if (entry.authority && !["school", "control"].includes(entry.authority)) {
      throw new Error(`Invalid permission authority: ${entry.code}`);
    }
    if (catalog.has(entry.code)) throw new Error(`Duplicate permission code: ${entry.code}`);
    catalog.set(entry.code, entry);
  }
  return catalog;
}

export async function scanAuthorizationLiterals(rootDir) {
  const uses = [];
  const patterns = ["database/**/*.sql", "server/src/**/*.ts"];
  const matcher = /(?:require_access|can_access|requirePermission)\(\s*["']([^"']+)["']/g;
  for (const pattern of patterns) {
    for await (const relative of glob(pattern, { cwd: rootDir })) {
      const source = await readFile(path.join(rootDir, relative), "utf8");
      for (const match of source.matchAll(matcher)) {
        uses.push({
          code: match[1],
          file: relative.replaceAll("\\", "/"),
          line: source.slice(0, match.index).split(/\r?\n/).length,
        });
      }
    }
  }
  return uses;
}

export async function assertCanonicalPermissions(rootDir) {
  const catalog = await loadPermissionCatalog(rootDir);
  const unknown = (await scanAuthorizationLiterals(rootDir))
    .filter(use => !catalog.has(use.code) && !use.code.startsWith("test."));
  if (unknown.length) {
    throw new Error(unknown.map(use => `${use.file}:${use.line} ${use.code}`).join("\n"));
  }
}
```

- [ ] **Step 4: Run the scanner unit tests**

Run: `node --test scripts/permission-contract.test.mjs`

Expected: PASS for structure and source-line extraction.

- [ ] **Step 5: Add the repository gate**

Append this test to `scripts/permission-contract.test.mjs`:

```js
import { assertCanonicalPermissions } from "./permission-contract.mjs";

test("every authorization literal belongs to the shared catalog", async () => {
  await assertCanonicalPermissions(root);
});
```

Add this root script to `package.json`:

```json
"check:permissions": "node --test scripts/permission-contract.test.mjs"
```

Insert `npm run check:permissions` before typecheck in `ci`.

- [ ] **Step 6: Run the repository gate and capture the expected legacy failures**

Run: `npm run check:permissions`

Expected: FAIL listing the legacy plural Finance, Pedagogy and Cards codes. This failure is resolved in Task 2; do not weaken the scanner.

- [ ] **Step 7: Commit the contract harness**

```bash
git add scripts/permission-contract.mjs scripts/permission-contract.test.mjs package.json
git commit -m "test(access): enforce canonical permission vocabulary"
```

---

### Task 2: Replace legacy permission names with canonical capabilities

**Files:**
- Modify: `shared/permissions.json`
- Modify: `database/baseline/v1/12_seed_permissions.sql`
- Modify: `database/access/v1/01_role_templates.sql`
- Modify: `database/finance/v1/01_finance_native.sql`
- Modify: `database/finance/v1/02_finance_full.sql`
- Modify: `database/pedagogy/v1/01_pedagogy_native.sql`
- Modify: `database/cards/v1/01_cards_native.sql`
- Modify: `database/cards/v1/02_cards_classes.sql`
- Modify: `database/access/v1/tests/access-static.test.mjs`

**Interfaces:**
- Consumes: the scanner from Task 1.
- Produces: one literal vocabulary shared by all `iam.require_access`, `iam.can_access` and Node guards.
- Adds exactly three missing atomic permissions: `finance.cash_register.open`, `cards.print.read`, `cards.print.manage`.

- [ ] **Step 1: Write failing mapping assertions**

Add to `database/access/v1/tests/access-static.test.mjs`:

```js
test("native SQL uses only canonical finance, pedagogy and cards codes", async () => {
  const files = [
    "../../../finance/v1/01_finance_native.sql",
    "../../../finance/v1/02_finance_full.sql",
    "../../../pedagogy/v1/01_pedagogy_native.sql",
    "../../../cards/v1/01_cards_native.sql",
    "../../../cards/v1/02_cards_classes.sql",
  ];
  const legacy = /'(finance\.(?:fees|payments|reports|cashier|fee_control)|pedagogy\.(?:classes|subjects|assignments|grades|lessons|rankings)|cards\.print\.request)(?:\.[a-z_]+)?'/;
  for (const relative of files) {
    const sql = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(sql, legacy, relative);
  }
});
```

- [ ] **Step 2: Verify the mapping test fails**

Run: `node --test database/access/v1/tests/access-static.test.mjs`

Expected: FAIL on `finance.fees.read`, `pedagogy.classes.read` and `cards.print.request`.

- [ ] **Step 3: Apply the exact vocabulary mapping**

Replace authorization literals using this complete mapping:

| Legacy code | Canonical code |
|---|---|
| `finance.fees.read` | `finance.fee.read` |
| `finance.fees.create` | `finance.fee.manage` |
| `finance.payments.read` | `finance.receipt.read` |
| `finance.payments.create` | `finance.payment.record` |
| `finance.payments.cancel` | `finance.payment.cancel` |
| `finance.reports.read` | `finance.report.read` |
| `finance.cashier.manage` on open | `finance.cash_register.open` |
| `finance.cashier.manage` on close | `finance.cash_register.close` |
| `finance.fee_control.read` | `finance.control.read` |
| `finance.fee_control.create` | `finance.control.manage` |
| `finance.fee_control.scan` | `finance.control.scan` |
| `pedagogy.classes.read` | `school.class.read` |
| `pedagogy.subjects.read` | `pedagogy.subject.read` |
| `pedagogy.subjects.create` | `pedagogy.subject.manage` |
| `pedagogy.assignments.read` | `school.structure.manage` for teacher-assignment administration |
| `pedagogy.assignments.create` | `school.structure.manage` |
| `pedagogy.assignments.delete` | `school.structure.manage` |
| `pedagogy.grades.read` used for devoirs | `pedagogy.assignment.read` |
| `pedagogy.grades.create/update/publish` used for devoirs | `pedagogy.assignment.manage` |
| `pedagogy.grades.read` used for notes | `pedagogy.grade.read` |
| `pedagogy.grades.create/update/publish` used for notes | `pedagogy.grade.manage` |
| `pedagogy.lessons.read` | `pedagogy.lesson-plan.read` |
| `pedagogy.lessons.create/update/delete` | `pedagogy.lesson-plan.manage` |
| `pedagogy.rankings.read` | `palmarques.read` |
| `pedagogy.rankings.compute/publish/edit` | `palmarques.manage` |
| `cards.print.request` | `cards.request.print` |
| `cards.print.read` | `cards.print.read` |
| `cards.print.manage` | `cards.print.manage` |

Add `school.structure.manage` to `shared/permissions.json` and the baseline seed if it is still absent; it is already consumed by the built-in administration role. Add the three declared missing permissions with these defaults:

```json
{ "code": "finance.cash_register.open", "label": "Ouvrir une caisse", "scope": "school" },
{ "code": "cards.print.read", "label": "Consulter les travaux d’impression", "scope": "school" },
{ "code": "cards.print.manage", "label": "Gérer les travaux d’impression", "scope": "school", "authority": "control" }
```

Grant `finance.cash_register.open` to the built-in `admin` and `cashier` templates. Grant `cards.print.read` to the built-in `admin` template so the school can follow its own print jobs. Do not add `cards.print.manage` to any school role template: the code remains unassigned to humans and is accepted only through the signed machine authority introduced in Task 5. School roles retain `cards.request.print`.

- [ ] **Step 4: Run catalog and role-template tests**

Run: `npm run check:permissions`

Expected: PASS with no authorization literal outside `shared/permissions.json`.

Run: `node --test database/access/v1/tests/access-static.test.mjs`

Expected: PASS, including the legacy-name prohibition.

- [ ] **Step 5: Commit the canonical vocabulary**

```bash
git add shared/permissions.json database/baseline/v1/12_seed_permissions.sql database/access/v1/01_role_templates.sql database/finance/v1 database/pedagogy/v1 database/cards/v1 database/access/v1/tests/access-static.test.mjs
git commit -m "fix(access): canonicalize business permission codes"
```

---

### Task 3: Pass exact business targets to PostgreSQL authorization

**Files:**
- Modify: `database/finance/v1/01_finance_native.sql`
- Modify: `database/finance/v1/02_finance_full.sql`
- Modify: `database/pedagogy/v1/01_pedagogy_native.sql`
- Modify: `database/cards/v1/01_cards_native.sql`
- Create: `database/access/v1/tests/native-rpc-targets-static.test.mjs`

**Interfaces:**
- Consumes: canonical codes from Task 2.
- Produces: every resource operation supplies `student_id`, `class_id`, `subject_id`, `portal_id` or runtime campaign context required by `iam.can_access`.

- [ ] **Step 1: Write failing target-contract tests**

Create a static test that asserts these exact properties:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const finance1 = await readFile(new URL("../../../finance/v1/01_finance_native.sql", import.meta.url), "utf8");
const finance2 = await readFile(new URL("../../../finance/v1/02_finance_full.sql", import.meta.url), "utf8");
const pedagogy = await readFile(new URL("../../../pedagogy/v1/01_pedagogy_native.sql", import.meta.url), "utf8");

test("finance student operations authorize student and resolved class", () => {
  assert.match(finance1, /iam\.require_access\('finance\.fee\.read',\s*null,\s*p_student_id,\s*v_class_id\)/);
  assert.match(finance1, /iam\.require_access\('finance\.payment\.record',\s*null,\s*v_student_id,\s*v_class_id\)/);
});

test("fee control scan supplies campaign and assigned class", () => {
  assert.match(finance2, /'campaign_id',\s*p_campaign_id::text/);
  assert.match(finance2, /iam\.require_access\('finance\.control\.scan',[\s\S]*v_class_id[\s\S]*v_runtime_context\)/);
});

test("pedagogy writes authorize the exact class-subject pair", () => {
  assert.match(pedagogy, /iam\.require_access\('pedagogy\.assignment\.manage',\s*null,\s*null,\s*p_class_id,\s*p_subject_id\)/);
  assert.match(pedagogy, /iam\.require_access\('pedagogy\.grade\.manage',[\s\S]*v_class_id,\s*v_subject_id\)/);
  assert.match(pedagogy, /iam\.require_access\('pedagogy\.lesson-plan\.manage',\s*null,\s*null,\s*p_class_id,\s*p_subject_id\)/);
});
```

- [ ] **Step 2: Run the target tests and verify failure**

Run: `node --test database/access/v1/tests/native-rpc-targets-static.test.mjs`

Expected: FAIL because current RPCs omit class/subject targets and campaign runtime context.

- [ ] **Step 3: Correct Finance targets before authorization**

For student fee and payment operations, resolve the student and class inside the same function before `iam.require_access`:

```sql
select s.class_id
into v_class_id
from app.students s
where s.school_id = iam.current_school_id()
  and s.id = p_student_id;

if not found then
  raise foreign_key_violation using message = 'Student not found in school';
end if;

perform iam.require_access('finance.fee.read', null, p_student_id, v_class_id);
```

For `payment_create`, derive `v_student_id` and `v_class_id` through `app.student_fees` and `app.students`, then authorize `finance.payment.record` before inserting. For control scans, derive the student's class, build `jsonb_build_object('campaign_id', p_campaign_id::text)`, and supply that context to `iam.require_access` so `assigned_fee_classes` can match.

- [ ] **Step 4: Correct Pedagogy read and write targets**

For list functions, filter each row with `iam.can_access` rather than authorizing a targetless global list. The class predicate must be:

```sql
and iam.can_access('school.class.read', null, null, c.id, null)
```

The subject predicate must be:

```sql
and iam.can_access('pedagogy.subject.read', null, null, null, s.id)
```

For assignments, grades and lesson plans, resolve or accept the exact `class_id` and `subject_id`, then call `iam.require_access` with both. For parent projections, call `iam.require_access('pedagogy.grade.read', null, p_student_id, v_class_id)` and return only published official grades.

- [ ] **Step 5: Correct Cards targets**

School-side card requests must use:

```sql
perform iam.require_access('cards.request.print', null, p_student_id, v_class_id);
```

Control-side list and status functions use `cards.print.read` or `cards.print.manage` and must still constrain every row by `school_id` supplied by the signed Control request.

- [ ] **Step 6: Run target and baseline Access Law tests**

Run: `node --test database/access/v1/tests/native-rpc-targets-static.test.mjs database/access/v1/tests/access-static.test.mjs database/baseline/v1/tests/static-contract.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit target enforcement**

```bash
git add database/finance/v1 database/pedagogy/v1 database/cards/v1 database/access/v1/tests/native-rpc-targets-static.test.mjs
git commit -m "fix(access): enforce exact native RPC scopes"
```

---

### Task 4: Contextualize every human native service call

**Files:**
- Modify: `server/src/db/context.ts`
- Modify: `server/src/studentsnative/service.ts`
- Modify: `server/src/financenative/service.ts`
- Modify: `server/src/financenative/routes.ts`
- Modify: `server/src/pedagogynative/service.ts`
- Modify: `server/src/pedagogynative/routes.ts`
- Modify: `server/src/cardsnative/service.ts`
- Modify: `server/src/cardsnative/routes.ts`
- Modify: `server/tests/studentsnative.test.ts`
- Create: `server/tests/financenative-access.test.ts`
- Create: `server/tests/pedagogynative-access.test.ts`
- Create: `server/tests/cardsnative-access.test.ts`

**Interfaces:**
- Consumes: `RequestContext` from authenticated `request.authSession`.
- Produces: `withRequestContext(pool, context, client => ...)` for every human business query.
- Every service method that serves a human route receives `context: RequestContext` as its first parameter.

- [ ] **Step 1: Extend the student test to cover list and draft transaction order**

Add assertions for both routes:

```ts
expect(statements.slice(0, 3)).toEqual([
  "BEGIN",
  expect.stringContaining("api.set_request_context"),
  expect.stringContaining("api.student_list"),
]);
expect(statements.at(-1)).toBe("COMMIT");
```

Also assert a rejected RPC produces `ROLLBACK` and never `COMMIT`.

- [ ] **Step 2: Run the student native test and verify failure**

Run: `npm test --workspace server -- studentsnative.test.ts`

Expected: FAIL because `listStudents` and `createStudentDraft` currently use `businessPool.query` outside the request transaction.

- [ ] **Step 3: Move student list and draft into the context transaction**

Use this exact pattern for both methods:

```ts
return withRequestContext(businessPool, context, async (client: PoolClient) => {
  const result = await client.query<{ student_list: StudentListResult }>(
    "select api.student_list($1, $2, $3, $4, $5) as student_list",
    [status, query, classId, limit, offset],
  );
  return result.rows[0]?.student_list ?? { total: 0, rows: [], limit, offset };
});
```

- [ ] **Step 4: Write Finance, Pedagogy and Cards context tests**

For one read and one write per module, assert this exact order:

```ts
expect(log.map(call => call.sql)).toEqual([
  "BEGIN",
  expect.stringContaining("api.set_request_context"),
  expect.stringContaining("api."),
  "COMMIT",
]);
expect(log[1].params.slice(0, 3)).toEqual([
  SESSION.userId,
  SESSION.profileId,
  SESSION.schoolId,
]);
```

The selected pairs are `fee_structure_list`/`payment_create`, `assignment_list`/`grades_save`, and `card_print_request_list`/`card_print_request_create`.

- [ ] **Step 5: Verify the new tests fail on direct pool queries**

Run: `npm test --workspace server -- financenative-access.test.ts pedagogynative-access.test.ts cardsnative-access.test.ts`

Expected: FAIL because the current services call `businessPool.query` directly.

- [ ] **Step 6: Update route-to-service contracts**

In every authenticated native route, build the context only from the resolved session:

```ts
const session = request.authSession!;
const context: RequestContext = {
  userId: session.userId,
  profileId: session.profileId,
  schoolId: session.schoolId,
  requestId: newRequestId(),
};
```

Pass `context` as the first service argument. Do not add identity or school fields to request schemas.

- [ ] **Step 7: Update human service implementations**

Import `PoolClient`, `RequestContext` and `withRequestContext`. Replace every human `businessPool.query` with a `client.query` inside `withRequestContext`. Preserve the existing return types and SQL RPC names.

The complete method groups to change are:

- Students: `listStudents`, `createStudentDraft`.
- Finance: fee structures, student fees, payments, receipts, cash register, reports, campaigns and scans.
- Pedagogy: classes, subjects, teacher assignments, assignments, grades, lesson plans, parent projections, averages, rankings and stars.
- School-side Cards: create request, read request/list, configuration and counts.

- [ ] **Step 8: Run native context tests**

Run: `npm test --workspace server -- studentsnative.test.ts sessionnative.test.ts financenative-access.test.ts pedagogynative-access.test.ts cardsnative-access.test.ts`

Expected: PASS with `BEGIN → api.set_request_context → api.* → COMMIT`, and `ROLLBACK` on failure.

- [ ] **Step 9: Commit human context enforcement**

```bash
git add server/src/db/context.ts server/src/studentsnative server/src/financenative server/src/pedagogynative server/src/cardsnative server/tests/studentsnative.test.ts server/tests/financenative-access.test.ts server/tests/pedagogynative-access.test.ts server/tests/cardsnative-access.test.ts
git commit -m "fix(server): contextualize native business RPCs"
```

---

### Task 5: Separate SchoolSafe Control machine authority from human access

**Files:**
- Modify: `server/src/controlprintnative/routes.ts`
- Modify: `server/src/controlprintnative/service.ts`
- Modify: `server/src/cardsnative/service.ts`
- Create: `server/src/db/control-authority.ts`
- Create: `server/tests/control-authority.test.ts`
- Modify: `server/tests/native-app.test.ts`

**Interfaces:**
- Produces: `ControlAuthority = { instanceId: string; requestId: string; schoolId: string }`
- Produces: `withControlAuthority<T>(pool, authority, fn): Promise<T>`
- Consumes: HMAC-verified Control request metadata; never fabricates a human `profileId`.

- [ ] **Step 1: Write failing machine-authority tests**

```ts
it("rejects an unsigned Control callback before SQL", async () => {
  const response = await app.inject({ method: "POST", url: "/native/control/print/status", payload: {} });
  expect(response.statusCode).toBe(401);
  expect(businessPool.query).not.toHaveBeenCalled();
});

it("passes only instance, request and school identifiers after HMAC verification", async () => {
  expect(log[1].params).toEqual([CONTROL.instanceId, CONTROL.requestId, CONTROL.schoolId]);
  expect(log.flatMap(call => call.params)).not.toContainEqual(expect.stringMatching(/profile/i));
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test --workspace server -- control-authority.test.ts`

Expected: FAIL because no explicit machine authority executor exists.

- [ ] **Step 3: Implement the dedicated executor**

`withControlAuthority` must open a transaction, call one allowlisted context RPC for the signed Control identity, run only Control-specific `api.*` RPCs, commit on success and roll back on failure. It must reject empty `instanceId`, `requestId` or `schoolId` before acquiring a client.

```ts
export type ControlAuthority = {
  instanceId: string;
  requestId: string;
  schoolId: string;
};
```

Do not call `api.set_request_context` with a fake user or profile. Add a dedicated SQL context RPC only if the current Control HMAC path has no equivalent, and grant it only to the server role used for Control callbacks.

- [ ] **Step 4: Move Control database queries behind the executor**

All direct queries in `controlprintnative/routes.ts` move into `controlprintnative/service.ts`. Signed callbacks use `withControlAuthority`; school-user card requests continue using the human `RequestContext` from Task 4.

- [ ] **Step 5: Verify Control and native application boundaries**

Run: `npm test --workspace server -- control-authority.test.ts native-app.test.ts cardsnative-access.test.ts`

Expected: PASS; unsigned callbacks execute zero SQL, human card requests carry a human context, and signed Control callbacks carry only machine authority.

- [ ] **Step 6: Commit authority separation**

```bash
git add server/src/db/control-authority.ts server/src/controlprintnative server/src/cardsnative/service.ts server/tests/control-authority.test.ts server/tests/native-app.test.ts
git commit -m "fix(control): separate signed machine authority"
```

---

### Task 6: Register every active SQL module in migration integrity checks

**Files:**
- Create: `database/finance/v1/manifest.json`
- Create: `database/finance/v1/manifest.sha256`
- Create: `database/finance/v1/scripts/generate-manifest.mjs`
- Create: `database/finance/v1/tests/finance-static.test.mjs`
- Create: `database/pedagogy/v1/manifest.json`
- Create: `database/pedagogy/v1/manifest.sha256`
- Create: `database/pedagogy/v1/scripts/generate-manifest.mjs`
- Create: `database/pedagogy/v1/tests/pedagogy-static.test.mjs`
- Create: `database/cards/v1/manifest.json`
- Create: `database/cards/v1/manifest.sha256`
- Create: `database/cards/v1/scripts/generate-manifest.mjs`
- Create: `database/cards/v1/tests/cards-static.test.mjs`
- Modify: `scripts/check-migration-versions.mjs`
- Modify: `scripts/check-migration-versions.test.mjs`

**Interfaces:**
- Consumes: normalized `sha256Sql(bytes)` from `scripts/migration-manifest.mjs`.
- Produces versions `schoolsafe-finance-v1`, `schoolsafe-pedagogy-v1`, `schoolsafe-cards-v1`, each requiring `schoolsafe-vps-v1`.

- [ ] **Step 1: Extend the migration-set expectation and verify failure**

Update the expected migration set count from six to nine and assert the three new version keys. Run:

`node --test scripts/check-migration-versions.test.mjs`

Expected: FAIL because Finance, Pedagogy and Cards do not yet have manifests.

- [ ] **Step 2: Add deterministic manifest generators**

Each generator must read only `/^\d{2}_[a-z0-9_]+\.sql$/`, sort by filename, assign sequential `order`, compute `sha256Sql`, and write both manifest files with LF endings. Finance registers two units; Pedagogy one; Cards two.

The Finance generator must construct the manifest with this exact code so hashes always come from file bytes rather than hand-edited values:

```js
const files = ["01_finance_native.sql", "02_finance_full.sql"];
const units = await Promise.all(files.map(async (file, index) => {
  const bytes = await readFile(path.join(financeDir, file));
  return {
    order: index + 1,
    name: path.basename(file, ".sql").slice(3),
    file,
    sha256: sha256Sql(bytes),
  };
}));
const manifest = {
  finance_version: "schoolsafe-finance-v1",
  requires_baseline: "schoolsafe-vps-v1",
  units,
};
```

The Pedagogy generator uses `pedagogy_version: "schoolsafe-pedagogy-v1"` with `01_pedagogy_native.sql`. The Cards generator uses `cards_version: "schoolsafe-cards-v1"` with `01_cards_native.sql` and `02_cards_classes.sql`. Both use the same byte hashing and sequential order algorithm shown above.

- [ ] **Step 3: Generate manifests**

Run:

```bash
node database/finance/v1/scripts/generate-manifest.mjs
node database/pedagogy/v1/scripts/generate-manifest.mjs
node database/cards/v1/scripts/generate-manifest.mjs
```

Expected: each directory contains `manifest.json` and `manifest.sha256` with normalized hashes.

- [ ] **Step 4: Add the three sets to the root checker**

Append Finance, Pedagogy and Cards to `sets` in dependency order after Access and before Projections. Each uses `requiresBaseline: true` and its exact version key.

- [ ] **Step 5: Add static module contracts**

Each module test must assert: transaction wrapper present, `set local role schoolsafe_owner`, every function is `security definer` with `search_path = pg_catalog`, grants target `schoolsafe_api` rather than `public`, canonical permission literals only, and no direct cross-school predicate omission in business-table queries.

- [ ] **Step 6: Run migration and static checks**

Run: `npm run check:migration-versions`

Expected: `Migration manifests: PASS (9 sets, 26 units)`.

Run: `node --test database/finance/v1/tests/finance-static.test.mjs database/pedagogy/v1/tests/pedagogy-static.test.mjs database/cards/v1/tests/cards-static.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit migration integrity**

```bash
git add database/finance/v1 database/pedagogy/v1 database/cards/v1 scripts/check-migration-versions.mjs scripts/check-migration-versions.test.mjs
git commit -m "test(migrations): register active business SQL"
```

---

### Task 7: Add an active-path regression gate and close the lot

**Files:**
- Create: `server/tests/native-access-contract.test.ts`
- Modify: `docs/BASELINE_REPORT.md`
- Modify: `docs/CURRENT_HANDOFF.md`
- Modify: `docs/DECISIONS.md` only if implementation discovers a new owner-approved architectural decision.

**Interfaces:**
- Consumes: canonical scanner, contextual services, Control authority boundary and nine migration manifests.
- Produces: CI proof that no active human native service bypasses request context.

- [ ] **Step 1: Write the active-path static test**

```ts
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const humanServices = [
  "studentsnative/service.ts",
  "financenative/service.ts",
  "pedagogynative/service.ts",
  "cardsnative/service.ts",
  "sessionnative/service.ts",
];

describe("native Access Law contract", () => {
  for (const relative of humanServices) {
    it(`${relative} does not execute human RPCs through the pool`, async () => {
      const source = await readFile(new URL(`../src/${relative}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/businessPool\.query\s*</);
      expect(source).toContain("withRequestContext");
    });
  }
});
```

- [ ] **Step 2: Run the active-path test**

Run: `npm test --workspace server -- native-access-contract.test.ts`

Expected: PASS after Tasks 4 and 5.

- [ ] **Step 3: Run the targeted critical suite**

Run:

```bash
npm run check:permissions
npm run check:migration-versions
npm run typecheck
npm test --workspace server -- db-context.test.ts studentsnative.test.ts sessionnative.test.ts financenative-access.test.ts pedagogynative-access.test.ts cardsnative-access.test.ts control-authority.test.ts native-access-contract.test.ts native-app.test.ts
node --test database/access/v1/tests/access-static.test.mjs database/access/v1/tests/native-rpc-targets-static.test.mjs database/baseline/v1/tests/static-contract.test.mjs database/finance/v1/tests/finance-static.test.mjs database/pedagogy/v1/tests/pedagogy-static.test.mjs database/cards/v1/tests/cards-static.test.mjs
```

Expected: every command exits with code 0. Record actual counts rather than estimating them.

- [ ] **Step 4: Update continuity documents**

In `docs/BASELINE_REPORT.md`, record the canonical catalog, contextual native paths, Control authority separation and nine checked migration sets. In `docs/CURRENT_HANDOFF.md`, list exact commits, files, commands, real results, remaining risks and the next plan: customizable school posts and their permission editor.

- [ ] **Step 5: Verify the final diff and commit documentation**

```bash
git diff --check
git status --short
git add docs/BASELINE_REPORT.md docs/CURRENT_HANDOFF.md docs/DECISIONS.md
git commit -m "docs(access): close canonical law lot"
```

- [ ] **Step 6: Synchronize the completed lot**

```bash
git push origin main
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
git status --short
```

Expected: local `HEAD` equals `origin/main` and the worktree is clean. Do not touch the VPS.

---

## Deferred plans with fixed order

This plan intentionally completes only the Access Law foundation. The validated architecture then continues as separate, reviewable implementation plans in this order:

1. customizable school posts, assignments, permission editor and audit history;
2. enriched session contract and common dynamic navigation model;
3. responsive Direction, Enseignant, Gardien, Parent dashboards and Écosystème section;
4. JASPE capability levels, confirmations and refusal explanations;
5. supervised Student sub-profile and Parent-to-Student context switch;
6. final consolidation, compatibility removal and direct VPS deployment preparation.
