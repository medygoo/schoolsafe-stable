import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function source(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("Supabase principal seven-step onboarding UI", () => {
  it("opens the existing setup screen and keeps the Supabase token memory-only", () => {
    const app = source("app/app.js");
    const start = app.indexOf("async function finishSupabaseExchange");
    const end = app.indexOf('var profileChoiceMode = "login"');
    const exchange = app.slice(start, end);

    expect(exchange).toContain('result.status === "onboarding_required"');
    expect(exchange).toContain("pendingSupabaseAccessToken = accessToken");
    expect(exchange).toContain('status: "onboarding"');
    expect(exchange).toContain("stepIndex = 0");
    expect(exchange).toContain("renderStep();");
    expect(exchange).toContain('showScreen("setup")');
    expect(exchange).toContain("Configurez votre établissement pour continuer.");
    expect(exchange).not.toContain("/auth/onboarding/me");

    expect(app).not.toMatch(/localStorage\.(?:setItem|getItem)\([^\n]*pendingSupabaseAccessToken/);
    expect(app).not.toMatch(/sessionStorage\.(?:setItem|getItem)\([^\n]*pendingSupabaseAccessToken/);
    expect(app).not.toMatch(/storageSet\([^\n]*pendingSupabaseAccessToken/);
    expect(app).not.toMatch(/indexedDB[^\n]*pendingSupabaseAccessToken/);
    expect(app).not.toMatch(/console\.log\([^\n]*pendingSupabaseAccessToken/);
  });

  it("submits the seven steps through the Supabase principal route without client authority fields", () => {
    const auth = source("app/modules/authnative/auth-native.js");
    const routeStart = auth.indexOf("async function createSupabasePrincipalSchool");
    const routeEnd = auth.indexOf("async function changeSupabasePassword");
    const route = auth.slice(routeStart, routeEnd);
    expect(route).toContain('"/auth/native/supabase/school"');
    expect(route).toContain('Authorization: "Bearer " + accessToken');
    expect(route).toContain("body: payload");

    const app = source("app/app.js");
    const setupStart = app.indexOf("async function submitSetup()");
    const setupEnd = app.indexOf("function renderStep()", setupStart);
    const setup = app.slice(setupStart, setupEnd);
    expect(setup).toContain("createSupabasePrincipalSchool");
    expect(setup).toContain("createOnboardingSchool");
    expect(setup).not.toContain("school_id");
    expect(setup).not.toContain("user_id");
    expect(setup).not.toContain("profile_id");
    expect(setup).not.toContain("external_subject");
    expect(setup).not.toMatch(/\brole\b/);

    expect(auth).toContain('createOnboardingSchool: function (payload) { return request("/auth/onboarding/school"');
  });

  it("requires password replacement after activation, supports cancellation, and preserves legacy onboarding", () => {
    const app = source("app/app.js");

    const nextStart = app.indexOf('document.getElementById("nextStep").addEventListener');
    const nextEnd = app.indexOf("restoreSession();", nextStart);
    const completion = app.slice(nextStart, nextEnd);
    expect(completion).toContain("setupResult.must_change === true");
    expect(completion).toContain('setAttribute("data-supabase-password-change", "true")');
    expect(completion).toContain('showScreen("auth")');
    expect(completion).toContain("Votre école est activée. Choisissez maintenant votre nouveau mot de passe.");
    expect(completion).toContain("await finishSupabaseExchange(");

    const loginStart = app.indexOf('document.getElementById("loginForm").addEventListener');
    const loginEnd = app.indexOf('document.getElementById("forgotPassword")', loginStart);
    const login = app.slice(loginStart, loginEnd);
    expect(login).toContain("changeSupabasePassword(pendingSupabaseAccessToken, password)");
    expect(login).toContain("pendingSupabaseAccessToken = null");
    expect(login).toContain("pendingSupabaseIdentifier = null");
    expect(login).toContain("pendingSupabaseRemember = false");
    expect(login).toContain("Reconnectez-vous avec le nouveau mot de passe");

    const leaveStart = app.indexOf("async function leaveOnboarding()");
    const leaveEnd = app.indexOf('document.getElementById("setupHome")', leaveStart);
    const leave = app.slice(leaveStart, leaveEnd);
    expect(leave).toContain("var supabaseOnboarding = Boolean(pendingSupabaseAccessToken)");
    expect(leave).toContain("if (!supabaseOnboarding)");
    expect(leave).toContain("logoutOnboarding()");
    expect(leave).toContain("pendingSupabaseAccessToken = null");
    expect(leave).toContain("pendingSupabaseIdentifier = null");
    expect(leave).toContain("pendingSupabaseRemember = false");

    const auth = source("app/modules/authnative/auth-native.js");
    expect(auth).toContain('onboardingMe: function () { return request("/auth/onboarding/me"');
    expect(auth).toContain('createOnboardingSchool: function (payload) { return request("/auth/onboarding/school"');
    expect(auth).toContain('logoutOnboarding: function () { return request("/auth/onboarding/logout"');
  });
});
