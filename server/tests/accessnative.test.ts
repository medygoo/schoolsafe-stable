import { afterEach, describe, expect, it } from "vitest";
import { buildNativeApp } from "../src/native-app.js";
import { parseEnv } from "../src/config/env.js";
import type { VerifiedPools } from "../src/db/startpools.js";

const school = "33333333-0000-4000-8000-000000000001";
const actor = "66666666-0000-4000-8000-000000000001";
const target = "66666666-0000-4000-8000-000000000002";
const user = "55555555-0000-4000-8000-000000000001";
const apps: ReturnType<typeof buildNativeApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

function fixture(options: { allowed?: boolean; invalidSession?: boolean; data?: unknown; error?: string } = {}) {
  const log: { sql: string; params?: unknown[] }[] = [];
  let released = false;
  const client = {
    async query(sql: string, params?: unknown[]) {
      log.push({ sql, params });
      if (sql.includes("api.check_access")) return { rows: [{ allowed: options.allowed !== false }] };
      if (sql.includes("api.access_")) {
        if (options.error) throw Object.assign(new Error("private SQL details"), { code: options.error });
        return { rows: [{ data: options.data === undefined ? { schoolId: school, rows: [], total: 0, limit: 25, offset: 0 } : options.data }] };
      }
      return { rows: [] };
    },
    release() { released = true; },
  };
  const authPool = {
    async query(sql: string) {
      return { rows: sql.includes("auth_resolve_session") && !options.invalidSession ? [{
        session_id: "44444444-0000-4000-8000-000000000001", identity_id: user,
        user_id: user, profile_id: actor, school_id: school, must_change: false,
      }] : [] };
    },
    async end() {},
  };
  const businessPool = { async connect() { return client; }, async end() {} };
  const app = buildNativeApp(parseEnv({ NODE_ENV: "test" }), { authPool, businessPool } as unknown as VerifiedPools);
  apps.push(app);
  return { app, log, isReleased: () => released };
}
const headers = { cookie: "schoolsafe_session=synthetic-test-token" };
const urls = ["/native/access/profiles", "/native/access/roles", `/native/access/profiles/${target}`];

describe("native custom posts", () => {
  const writeHeaders = { ...headers, "x-schoolsafe-action": "access-write" };
  const create = { label: "Consultation RH", templateId: null, revision: "12", reason: "Mission validée", confirmed: true };
  const save = { label: "Consultation RH", isActive: true, grants: [{ permission: "staff.read", effect: "allow", scope: "school" }], revision: "12", reason: "Mission validée", confirmed: true };
  const writes = [
    { url: "/native/access/roles", payload: create, rpc: "api.access_role_create", params: [create.label, null, "12", create.reason, true] },
    { url: `/native/access/roles/${target}`, payload: save, rpc: "api.access_role_save", params: [target, save.label, true, JSON.stringify(save.grants), "12", save.reason, true] },
  ];
  it.each(writes)("authorizes and commits $rpc with server-resolved context", async ({ url, payload, rpc, params }) => {
    const { app, log, isReleased } = fixture();
    const response = await app.inject({ method: "POST", url, headers: writeHeaders, payload });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(log[1].params?.slice(0, 3)).toEqual([user, actor, school]);
    expect(log[2].params?.[0]).toBe("roles.manage");
    expect(log[3].sql).toContain(rpc); expect(log[3].params).toEqual(params);
    expect(log.at(-1)?.sql).toBe("COMMIT"); expect(isReleased()).toBe(true);
  });
  it.each(writes)("requires session, write intent and current authority for $rpc", async ({ url, payload }) => {
    for (const [requestHeaders, allowed, status] of [
      [{}, true, 401], [headers, true, 403], [{ ...writeHeaders, "sec-fetch-site": "cross-site" }, true, 403], [writeHeaders, false, 403],
    ] as const) {
      const { app, log } = fixture({ allowed });
      expect((await app.inject({ method: "POST", url, headers: requestHeaders, payload })).statusCode).toBe(status);
      expect(log.some(q => q.sql.includes("api.access_"))).toBe(false);
    }
  });
  it.each(writes)("rejects actor injection and missing confirmation for $rpc", async ({ url, payload }) => {
    for (const forged of [{ schoolId: school }, { profileId: actor }, { confirmed: false }, { revision: 12 }, { reason: " " }, { label: "x\nY" }]) {
      const { app, log } = fixture();
      expect((await app.inject({ method: "POST", url, headers: writeHeaders, payload: { ...payload, ...forged } })).statusCode).toBe(400);
      expect(log).toEqual([]);
    }
  });
  it.each([
    [{ permission: "staff.read", effect: "allow", scope: "assigned_classes", target: target }],
    [{ permission: "staff.read", effect: "allow", conditions: [] }],
    [{ permission: "staff.read", effect: "invented" }],
    Array.from({ length: 65 }, () => ({ permission: "staff.read", effect: "allow" })),
  ].map(grants => ({ grants })))("refuses unsupported composition fields and unbounded grants", async ({ grants }) => {
    const { app, log } = fixture();
    expect((await app.inject({ method: "POST", url: writes[1].url, headers: writeHeaders, payload: { ...save, grants } })).statusCode).toBe(400);
    expect(log).toEqual([]);
  });
  it.each(writes)("rolls back $rpc when the SQL mutation refuses", async ({ url, payload }) => {
    for (const [error, status] of [["40001", 409], ["42501", 403], ["P0002", 404], ["XX000", 500]] as const) {
      const { app, log, isReleased } = fixture({ error });
      const response = await app.inject({ method: "POST", url, headers: writeHeaders, payload });
      expect(response.statusCode).toBe(status); expect(response.body).not.toContain("private SQL");
      expect(log.at(-1)?.sql).toBe("ROLLBACK"); expect(isReleased()).toBe(true);
    }
  });
  it("returns a protected editor from the real session, not a client tenant", async () => {
    const { app, log } = fixture();
    expect((await app.inject({ method: "GET", url: `/native/access/role-editor?roleId=${target}`, headers })).statusCode).toBe(200);
    expect(log[1].params?.slice(0, 3)).toEqual([user, actor, school]);
    expect(log[2].params?.[0]).toBe("roles.manage"); expect(log[3].params).toEqual([target]);
    expect(log[3].sql).toContain("api.access_role_editor");
    expect((await app.inject({ method: "GET", url: "/native/access/role-editor?schoolId=other", headers })).statusCode).toBe(400);
  });
  it("closes the editor for a revoked manager or a foreign role", async () => {
    for (const [options, status] of [[{ allowed: false }, 403], [{ data: null }, 404]] as const) {
      const { app } = fixture(options);
      expect((await app.inject({ method: "GET", url: `/native/access/role-editor?roleId=${target}`, headers })).statusCode).toBe(status);
    }
  });
});

describe("native role changes", () => {
  const url = `/native/access/profiles/${target}/roles`;
  const payload = { roleId: "77777777-0000-4000-8000-000000000001", action: "assign", revision: "12", reason: "Responsabilité confirmée", confirmed: true };
  const writeHeaders = { ...headers, "x-schoolsafe-action": "access-write" };
  it("uses the session actor and one authorized transaction", async () => {
    const { app, log } = fixture();
    const response = await app.inject({ method: "POST", url, headers: writeHeaders, payload });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(log[1].params?.slice(0, 3)).toEqual([user, actor, school]);
    expect(log[2].params?.[0]).toBe("roles.manage");
    expect(log[3].params).toEqual([target, payload.roleId, "assign", "12", payload.reason, true]);
    expect(log.at(-1)?.sql).toBe("COMMIT");
  });
  it.each([{}, { ...writeHeaders, cookie: "" }])("requires session before write", async requestHeaders => {
    const { app, log } = fixture();
    expect((await app.inject({ method: "POST", url, headers: requestHeaders, payload })).statusCode).toBe(401);
    expect(log).toEqual([]);
  });
  it.each([headers, { ...writeHeaders, "sec-fetch-site": "cross-site" }])("refuses form/cross-site writes before SQL", async requestHeaders => {
    const { app, log } = fixture();
    expect((await app.inject({ method: "POST", url, headers: requestHeaders, payload })).statusCode).toBe(403);
    expect(log).toEqual([]);
  });
  it.each([{ schoolId: school }, { actor }, { confirmed: false }, { revision: "12.5" }, { revision: "-1" }, { reason: " " }, { roleId: "bad" }, { action: "delete" }])("rejects forged or incomplete mutation %j", async override => {
    const { app, log } = fixture();
    expect((await app.inject({ method: "POST", url, headers: writeHeaders, payload: { ...payload, ...override } })).statusCode).toBe(400);
    expect(log).toEqual([]);
  });
  it.each([["40001", 409], ["P0002", 404], ["42501", 403], ["22023", 400], ["XX000", 500]])("rolls back and sanitizes %s", async (error, status) => {
    const { app, log, isReleased } = fixture({ error: String(error) });
    const response = await app.inject({ method: "POST", url, headers: writeHeaders, payload });
    expect(response.statusCode).toBe(status);
    expect(response.body).not.toContain("private SQL");
    expect(log.at(-1)?.sql).toBe("ROLLBACK");
    expect(isReleased()).toBe(true);
  });
  it("a revoked manager cannot reach the mutation", async () => {
    const { app, log } = fixture({ allowed: false });
    expect((await app.inject({ method: "POST", url, headers: writeHeaders, payload })).statusCode).toBe(403);
    expect(log.some(x => x.sql.includes("api.access_role_assign"))).toBe(false);
  });
});

describe("native IAM reads on the production assembly", () => {
  it.each(urls)("%s requires a cookie, no business SQL", async url => {
    const { app, log } = fixture();
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    expect(log).toEqual([]);
  });
  it("rejects an expired session", async () => {
    const { app, log } = fixture({ invalidSession: true });
    expect((await app.inject({ method: "GET", url: urls[0], headers })).statusCode).toBe(401);
    expect(log).toEqual([]);
  });
  it.each(urls)("%s refuses missing permission before projection", async url => {
    const { app, log, isReleased } = fixture({ allowed: false });
    expect((await app.inject({ method: "GET", url, headers })).statusCode).toBe(403);
    expect(log.map(x => x.sql).join(" ")).not.toContain("api.access_");
    expect(log.at(-1)?.sql).toBe("ROLLBACK");
    expect(isReleased()).toBe(true);
  });
  it("lists using only the resolved actor; bounded filters remain query parameters", async () => {
    const { app, log } = fixture();
    const res = await app.inject({ method: "GET", url: "/native/access/profiles?query=%27OR%201%3D1&limit=10&offset=20", headers });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(log[1].params?.slice(0, 3)).toEqual([user, actor, school]);
    expect(log[2].params).toEqual(["roles.manage", null, null, null, null, null, "{}"]);
    expect(log[3].params).toEqual(["'OR 1=1", 10, 20]);
    expect(log.at(-1)?.sql).toBe("COMMIT");
  });
  it("does not impersonate the profile being inspected", async () => {
    const { app, log } = fixture({ data: { schoolId: school, profile: { id: target } } });
    const res = await app.inject({ method: "GET", url: urls[2], headers });
    expect(res.statusCode).toBe(200);
    expect(log[1].params?.[1]).toBe(actor);
    expect(log[2].params?.[1]).toBeNull();
    expect(log[3].params).toEqual([target]);
  });
  it("treats a missing or out-of-school profile as not found", async () => {
    const { app } = fixture({ data: null });
    expect((await app.inject({ method: "GET", url: urls[2], headers })).statusCode).toBe(404);
  });
  it.each(["?school_id=other", "?profileId=other", "?limit=101", "?limit=0", "?limit=1.5", "?offset=-1", "?offset=1000001", "?query=" + "x".repeat(101)])("rejects forged or unbounded query %s", async query => {
    const { app, log } = fixture();
    expect((await app.inject({ method: "GET", url: urls[0] + query, headers })).statusCode).toBe(400);
    expect(log).toEqual([]);
  });
  it("rejects malformed targets before business SQL", async () => {
    const { app, log } = fixture();
    expect((await app.inject({ method: "GET", url: "/native/access/profiles/bad-id", headers })).statusCode).toBe(400);
    expect(log).toEqual([]);
  });
  it.each([["42501", 403], ["08006", 500]])("handles DB error %s without leaking SQL", async (error, status) => {
    const { app, log, isReleased } = fixture({ error: String(error) });
    const res = await app.inject({ method: "GET", url: urls[0], headers });
    expect(res.statusCode).toBe(status);
    expect(res.body).not.toContain("private SQL");
    expect(log.at(-1)?.sql).toBe("ROLLBACK");
    expect(isReleased()).toBe(true);
  });
  it("accepts the actual local frontend origin with credentials", async () => {
    const { app } = fixture();
    const res = await app.inject({ method: "OPTIONS", url: urls[0], headers: {
      origin: "http://127.0.0.1:4176", "access-control-request-method": "GET",
    } });
    expect(res.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:4176");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });
});
