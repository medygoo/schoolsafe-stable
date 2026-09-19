const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const baseUrl = process.env.SCHOOLSAFE_URL || "http://127.0.0.1:4175/";
const outputDir = path.join(__dirname, "qa-output");
let browser;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function domClick(page, selector) {
  await page.locator(selector).evaluate((element) => element.click());
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
    // Le SW (cacheFirst) court-circuiterait le mock permissions.json ; son offline est couvert par qa-pwa.cjs.
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  // Le serveur local ne sert pas /shared : on injecte le catalogue canonique (même approche que qa-pwa.cjs).
  const canonicalPermissions = fs.readFileSync(path.join(__dirname, "..", "shared", "permissions.json"), "utf8");
  await page.route("**/shared/permissions.json", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: canonicalPermissions,
  }));
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await page.goto(baseUrl + "?i18n=1", { waitUntil: "networkidle", timeout: 30000 });
  await domClick(page, "#enterSplash");
  await domClick(page, '.auth-topbar [data-language="en"]');
  await page.waitForTimeout(100);
  check(await page.getByText("Welcome to your secure workspace.", { exact: true }).count(), "La connexion ne passe pas en anglais");
  check((await page.locator("html").getAttribute("lang")) === "en", "La langue du document n'est pas EN");

  await page.locator("#demoRole").selectOption("teacher");
  await domClick(page, "#previewWorkspace");
  await page.waitForTimeout(150);
  check(await page.getByText("Teacher", { exact: true }).count(), "Le profil Enseignant n'est pas traduit");
  check(await page.getByText("Dashboard", { exact: true }).count(), "Le tableau de bord n'est pas traduit");
  check(await page.getByText("Assignments and grading", { exact: true }).count(), "Une action pédagogique dynamique reste en français");

  await page.locator('[data-action="Devoirs et corrections"]').first().evaluate((element) => element.click());
  await page.waitForTimeout(100);
  // Runtime actuel : l'action ouvre la vue Phase D des devoirs (contenu démo borné FR, BACKEND_LATER) ;
  // le titre de module et le chrome sont traduits. L'ancien compositeur (#pdfLanguageMode,
  // #previewAssignmentPdf) n'existe plus — la génération PDF est couverte par qa-smoke.cjs.
  check(await page.getByText("Assignments and grades", { exact: true }).count(), "Le titre du module Devoirs n'est pas traduit");
  check(await page.locator("[data-assignment-list]").count(), "La vue des devoirs de l'enseignant ne s'affiche pas");
  await page.screenshot({ path: path.join(outputDir, "interface-english-desktop.png"), fullPage: true });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(100);
  check(await page.getByText("Tap to continue", { exact: true }).count(), "La préférence anglaise ne persiste pas");

  await domClick(page, "#enterSplash");
  await page.locator("#demoRole").selectOption("teacher");
  await domClick(page, "#previewWorkspace");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  // Runtime actuel : le menu « cube » et le réglage PDF n'existent plus ; on vérifie
  // simplement que le workspace anglais tient sur téléphone.
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "L'interface anglaise déborde sur téléphone");
  await page.screenshot({ path: path.join(outputDir, "interface-english-mobile.png"), fullPage: true });

  // Runtime actuel : le sélecteur de langue vit dans la topbar d'authentification.
  await page.evaluate(() => window.schoolSafeShow("auth"));
  await domClick(page, '.language-switch [data-language="fr"]');
  await page.waitForTimeout(100);
  check(await page.getByText("Bienvenue dans votre espace sécurisé.", { exact: true }).count(), "Le retour au français ne fonctionne pas");
  check((await page.locator("html").getAttribute("lang")) === "fr", "La langue du document ne revient pas à FR");

  check(errors.length === 0, `Erreurs navigateur: ${errors.join(" | ")}`);
  await browser.close();
  console.log(JSON.stringify({ ok: true, screenshots: ["interface-english-desktop.png", "interface-english-mobile.png"] }, null, 2));
})().catch(async (error) => {
  if (browser) await browser.close().catch(() => {});
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
