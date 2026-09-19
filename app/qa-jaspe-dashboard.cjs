/* Browser regression: same character, no chat archive, scoped answers and audio. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const baseUrl = process.env.SCHOOLSAFE_URL || "http://127.0.0.1:4176/";
const output = process.env.JASPE_QA_OUTPUT;

async function preview(page, role = "admin") {
  await page.evaluate(() => window.schoolSafeShow("auth"));
  await page.locator("#demoRole").selectOption(role);
  await page.locator("#previewWorkspace").evaluate(element => element.click());
}
async function capture(page, name) {
  if (output) {
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, name + ".png") });
  }
}
async function bounds(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no horizontal page overflow");
  const box = await page.locator("#jaspePanelOverlay").boundingBox();
  const size = page.viewportSize();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1, "floating chat stays in viewport");
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => { errors.push(error.message); console.error("Browser:", error.message); });
    await page.goto(baseUrl);
    await page.evaluate(() => {
      const mount = SchoolSafeJaspe2d.mountShowcase;
      SchoolSafeJaspe2d.mountShowcase = (...args) => (window.qaShowcase = mount(...args));
    });
    await preview(page);
    await page.waitForFunction(() => document.querySelector('#jaspeDashboardCharacter .jaspe2d--live'));
    await capture(page, "jaspe-desktop");
    await page.evaluate(() => { window.qaCharacter = document.getElementById("jaspeDashboardCharacter"); });

    // The dashboard remains docked when submitting text; only latest response exists.
    await page.locator("[data-jaspe-chat-input]").fill("bonjour");
    await page.locator("[data-jaspe-chat-send]").click();
    assert.equal(await page.locator("#jaspePanelOverlay").evaluate(el => el.open), false);
    await page.waitForFunction(() => qaShowcase.getState()?.current.kind === 'explain');
    await page.locator("[data-jaspe-chat-input]").fill("merci");
    await page.locator("[data-jaspe-chat-input]").press("Enter");
    assert.match(await page.locator("[data-jaspe-chat-log]").innerText(), /^Jaspe\s+Avec plaisir !$/i);
    assert.equal(await page.evaluate(() => SafeAssistant.getHistory().length), 1);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => /history|conversation/i.test(key))), false);

    // Hold opens before pointer release, and moves the very same renderer.
    const target = await page.locator("#jaspeHeroLauncher").boundingBox();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await page.mouse.down();
    await page.waitForFunction(() => document.getElementById("jaspePanelOverlay").open);
    await page.waitForFunction(() => document.querySelector("#jaspeFullStage .jaspe2d--live"));
    assert.equal(await page.locator("#jaspeHeroLauncher .jaspe2d").count(), 0);
    assert.equal(await page.evaluate(() => document.querySelector("#jaspeFullStage #jaspeDashboardCharacter") === window.qaCharacter), true);
    await page.mouse.up();
    await bounds(page);
    await capture(page, "jaspe-desktop-floating");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("#jaspeHeroLauncher #jaspeDashboardCharacter"));

    // Re-rendering workspace must not duplicate engines or conversation listeners.
    await preview(page);
    await preview(page);
    assert.equal(await page.locator("#jaspeDashboardCharacter .jaspe2d").count(), 1);
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 640 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await capture(page, "jaspe-" + size.width);
      await page.locator("#jaspeHeroLauncher").click();
      await bounds(page);
      assert.equal(await page.locator("#jaspePanelBody .jaspe-message").count(), 1);
      await capture(page, "jaspe-" + size.width + "-floating");
      await page.locator("#jaspePanelClose").click();
      await page.waitForFunction(() => document.querySelector("#jaspeHeroLauncher #jaspeDashboardCharacter"));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    // Mobile JASPE button supports holding, too.
    await page.locator("[data-bottom-nav='jaspe']").dispatchEvent("pointerdown", { button: 0 });
    await page.waitForFunction(() => document.getElementById("jaspePanelOverlay").open);
    await page.locator("[data-bottom-nav='jaspe']").dispatchEvent("pointerup");
    await page.locator("#jaspePanelClose").click();
    await page.waitForFunction(() => document.querySelector("#jaspeHeroLauncher #jaspeDashboardCharacter"));

    // Deterministic Web Speech adapter test; no real microphone or personal audio.
    await page.evaluate(() => {
      window.qaSpoken = [];
      window.SpeechRecognition = class {
        start() { window.qaRecognition = this; }
        abort() {}
      };
      speechSynthesis.speak = utterance => { window.qaSpoken.push(utterance.text); window.qaUtterance = utterance; utterance.onstart?.(); };
      speechSynthesis.cancel = () => {};
    });
    await page.locator("#jaspeHeroMic").click();
    assert.equal(await page.locator("#jaspePanelOverlay").evaluate(el => el.open), false);
    assert.equal(await page.locator("#jaspeHeroMic").getAttribute("aria-pressed"), "true");
    await page.evaluate(() => window.qaRecognition.onresult({ results: [[{ transcript: "merci" }]] }));
    assert.deepEqual(await page.evaluate(() => window.qaSpoken), ["Avec plaisir !"]);
    await page.waitForFunction(() => qaShowcase.getState()?.current.kind === 'speak');
    await page.evaluate(() => window.qaUtterance.onend());
    await page.waitForFunction(() => qaShowcase.getState()?.current.kind === 'idle');
    assert.match(await page.locator("[data-jaspe-chat-log]").innerText(), /^Jaspe\s+Avec plaisir !$/i);

    // Explicit permission denial closes the chat and clears response and inputs.
    await page.locator("#jaspeHeroLauncher").click();
    await page.evaluate(() => {
      window.qaSessionDescriptor = Object.getOwnPropertyDescriptor(window, "currentSession");
      Object.defineProperty(window, "currentSession", { configurable: true, value: { token: "qa-not-a-real-token", userId: "qa-denied", schoolId: "qa-school-b", profileId: "qa-profile-b", role: "admin", permissions: [], scopes: [] } });
      SafeAssistant.refreshAccess();
    });
    assert.equal(await page.locator("#jaspePanelOverlay").evaluate(el => el.open), false);
    assert.equal(await page.locator("[data-jaspe-chat-log]").innerText(), "");
    assert.equal(await page.locator("#jaspeHeroMic").isDisabled(), true);
    assert.deepEqual(await page.evaluate(() => SafeAssistant.getHistory()), []);
    assert.equal(await page.evaluate(() => qaShowcase.getState().current.kind), "idle");
    await page.evaluate(() => Object.defineProperty(window, "currentSession", window.qaSessionDescriptor));
    await preview(page, "parent");
    assert.deepEqual(errors, [], "account switch must not throw");
    await page.locator("#jaspeDashboardWelcome").waitFor({ state: "visible", timeout: 10000 });
    assert.equal(await page.locator("#jaspeDashboardWelcome").isVisible(), true);
    assert.equal(await page.locator("[data-jaspe-chat-log]").innerText().then(text => text.includes("Avec plaisir")), false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.locator("#jaspeHeroLauncher").click();
    await bounds(page);
    await capture(page, "jaspe-mobile-dark");
    await page.locator("#jaspePanelClose").click();
    await page.waitForFunction(() => document.querySelector("#jaspeHeroLauncher #jaspeDashboardCharacter"));
    await page.evaluate(() => window.schoolSafeShow("auth"));
    assert.equal(await page.locator("#jaspePanelOverlay").evaluate(el => el.open), false);
    assert.deepEqual(errors, [], "no JavaScript errors");
    console.log("PASS: desktop/mobile/landscape, long press, single renderer, current response only, docked text/audio adapter, permission denial, account switch, dark/reduced motion.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
