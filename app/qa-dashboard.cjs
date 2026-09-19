const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const baseUrl = process.env.SCHOOLSAFE_URL || "http://127.0.0.1:4175/";
const outputDir = path.join(__dirname, "qa-output");
let browser;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

// Le serveur local ne sert pas /shared : on injecte le catalogue canonique (même approche que qa-pwa.cjs).
// Le SW (cacheFirst) court-circuiterait le mock : il est bloqué ici, son offline est couvert par qa-pwa.cjs.
const canonicalPermissions = fs.readFileSync(path.join(__dirname, "..", "shared", "permissions.json"), "utf8");
async function mockCanonicalPermissions(page) {
  await page.route("**/shared/permissions.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: canonicalPermissions,
  }));
}

async function domClick(page, selector) {
  await page.locator(selector).evaluate((element) => element.click());
}

async function openWorkspace(page, role) {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
  await domClick(page, "#enterSplash");
  check(await page.locator("#auth.active").count(), "L'écran de connexion ne s'ouvre pas directement");
  await page.locator("#demoRole").selectOption(role);
  await domClick(page, "#previewWorkspace");
  await page.waitForFunction(() => {
    const workspace = document.querySelector("#workspace.active");
    const kpis = document.querySelector("#dashboardKpi");
    return Boolean(workspace && kpis && kpis.textContent.includes("DÉMONSTRATION"));
  }, null, { timeout: 10000 });
}

async function captureDashboard(page, name) {
  await page.screenshot({ path: path.join(outputDir, `dashboard-${name}.png`), fullPage: true });
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const errors = [];
  const results = [];

  for (const role of ["admin", "parent", "teacher", "cashier", "guard"]) {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await mockCanonicalPermissions(page);
    page.on("pageerror", (error) => errors.push(`${role}-desktop: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("ERR_NETWORK_ACCESS_DENIED")) errors.push(`${role}-desktop: ${message.text()}`);
    });

    await openWorkspace(page, role);
    check(await page.locator("#workspace.active").count(), `Le tableau de bord ne s'ouvre pas pour ${role}`);

    // Bandeau mode démo visible (pas de token)
    check(await page.locator("#workspaceDemoBanner:not([hidden])").count(), `Bandeau démo manquant pour ${role}`);

    // Aucun faux chiffre codé en dur ne doit apparaître
    const bodyText = await page.locator("body").innerText();
    const forbiddenNumbers = ["1 245", "648", "597", "72", "48", "38", "94 %", "2,4 M FC", "REC-2026-0588"];
    const found = forbiddenNumbers.filter((n) => bodyText.includes(n));
    check(found.length === 0, `Données codées en dur détectées pour ${role}: ${found.join(", ")}`);

    // Les cartes KPI démo sont des cartes executive calculées depuis les fixtures,
    // explicitement marquées DÉMONSTRATION ; le live reste sans chiffres fictifs.
    const overviewText = await page.locator("#dashboardKpi").innerText();
    check(
      /DÉMONSTRATION/.test(overviewText) && /Élèves inscrits/i.test(overviewText),
      `Les KPI démo ne sont pas explicitement marqués DÉMONSTRATION pour ${role}: ${overviewText}`
    );

    await captureDashboard(page, `${role}-desktop`);
    results.push(`${role}-desktop OK`);
    await context.close();

    // Mobile
    const mobileContext = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    const mobilePage = await mobileContext.newPage();
    await mockCanonicalPermissions(mobilePage);
    mobilePage.on("pageerror", (error) => errors.push(`${role}-mobile: ${error.message}`));
    mobilePage.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("ERR_NETWORK_ACCESS_DENIED")) errors.push(`${role}-mobile: ${message.text()}`);
    });

    await openWorkspace(mobilePage, role);
    check(await mobilePage.locator("#workspace.active").count(), `Le tableau de bord ne s'ouvre pas sur mobile pour ${role}`);
    check(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Le dashboard déborde horizontalement sur mobile pour ${role}`);
    await captureDashboard(mobilePage, `${role}-mobile`);
    results.push(`${role}-mobile OK`);
    await mobileContext.close();
  }

  check(errors.length === 0, `Erreurs navigateur: ${errors.join(" | ")}`);
  await browser.close();
  console.log(JSON.stringify({ ok: true, outputDir, results, files: fs.readdirSync(outputDir) }, null, 2));
})().catch(async (error) => {
  if (browser) await browser.close().catch(() => {});
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
