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
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  let intentionallyOffline = false;
  const coreAssets = [
    "shared/permissions.json",
    "vendor/qrcode.min.js",
    "vendor/html2canvas.min.js",
    "assets/fonts/fonts.css",
    "assets/fonts/Baloo2-700.woff2",
    "assets/fonts/Baloo2-800.woff2",
    "assets/fonts/NunitoSans-700.woff2",
    "assets/fonts/NunitoSans-800.woff2",
    "assets/fonts/NunitoSans-900.woff2",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-512-maskable.png",
  ];
  const unexpectedResponses = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // ERR_INTERNET_DISCONNECTED : coupures réseau intentionnelles du scénario.
    // 404 "Failed to load resource" : couvert précisément avec URL par le listener response ci-dessous.
    if (text.includes("ERR_INTERNET_DISCONNECTED") || text.includes("ERR_NETWORK_ACCESS_DENIED")) return;
    if (intentionallyOffline && text.includes("net::ERR_FAILED")) return;
    if (text.includes("Failed to load resource") && text.includes("404")) return;
    errors.push(text);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      unexpectedResponses.push(response.status() + " " + response.url());
    }
  });

  await page.goto(baseUrl + "?pwa=1", { waitUntil: "networkidle", timeout: 30000 });
  check(await page.locator('link[rel="manifest"]').count(), "Le manifeste PWA est absent");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  check(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), "Le Service Worker ne contrôle pas la page");
  const onlineAssets = await page.evaluate(async (paths) => Promise.all(paths.map(async (asset) => ({
    asset,
    ok: (await fetch(new URL(asset, location.href))).ok,
  }))), coreAssets);
  check(onlineAssets.every((item) => item.ok), `Assets locaux indisponibles: ${onlineAssets.filter((item) => !item.ok).map((item) => item.asset).join(", ")}`);

  await domClick(page, "#enterSplash");
  await domClick(page, "#previewWorkspace");
  check(await page.evaluate(() => Boolean(window.SchoolSafeSync && window.SchoolSafeSync.state)), "Le moteur de synchronisation est absent");

  intentionallyOffline = true;
  await context.setOffline(true);
  await page.waitForTimeout(250);
  check(!(await page.evaluate(async () => (await window.SchoolSafeSync.state()).online)), "Le moteur ne détecte pas l'état hors connexion");
  const offlineAssets = await page.evaluate(async (paths) => Promise.all(paths.map(async (asset) => {
    try {
      return { asset, ok: (await fetch(new URL(asset, location.href))).ok };
    } catch (_error) {
      return { asset, ok: false };
    }
  })), coreAssets);
  check(offlineAssets.every((item) => item.ok), `Assets absents du cache: ${offlineAssets.filter((item) => !item.ok).map((item) => item.asset).join(", ")}`);

  await page.evaluate(async () => {
    await window.SchoolSafeSync.enqueue({ type: "administration", label: "Configuration locale de test", role: "admin", payload: { test: true } });
    await window.SchoolSafeSync.enqueue({ type: "scan", label: "Scan prioritaire de test", role: "guard", payload: { test: true } });
  });
  const offlineState = await page.evaluate(() => window.SchoolSafeSync.state());
  check(offlineState.pending >= 2, "Les opérations hors connexion non financières ne restent pas en attente");
  const pendingTypes = offlineState.operations.filter((item) => item.status === "pending").map((item) => item.type);
  check(pendingTypes.indexOf("scan") < pendingTypes.indexOf("administration"), "Le scan n'est pas prioritaire dans la file");

  await page.screenshot({ path: path.join(outputDir, "pwa-offline-desktop.png"), fullPage: true });

  await context.setOffline(false);
  intentionallyOffline = false;
  // SchoolSafeSync.state() est asynchrone : waitForFunction traiterait la promesse
  // retournée comme une valeur truthy immédiate — on sonde donc l'état côté Node.
  let onlineState = null;
  const syncDeadline = Date.now() + 15000;
  do {
    onlineState = await page.evaluate(() => window.SchoolSafeSync.state());
    if (onlineState.online && onlineState.pending === 0) break;
    await page.waitForTimeout(250);
  } while (Date.now() < syncDeadline);
  check(onlineState.online && onlineState.pending === 0, "La reprise automatique ne vide pas la file locale");
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  intentionallyOffline = true;
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  check(await page.locator("#splash.active").count(), "L'application ne redémarre pas depuis le cache hors ligne");
  await context.setOffline(false);
  intentionallyOffline = false;

  await page.setViewportSize({ width: 390, height: 844 });
  await domClick(page, "#enterSplash");
  await domClick(page, "#previewWorkspace");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Le panneau PWA déborde sur téléphone");
  await page.screenshot({ path: path.join(outputDir, "pwa-sync-mobile.png"), fullPage: true });

  check(errors.length === 0, `Erreurs navigateur: ${errors.join(" | ")}`);
  check(unexpectedResponses.length === 0, `Réponses en erreur: ${unexpectedResponses.join(" | ")}`);
  await browser.close();
  console.log(JSON.stringify({ ok: true, screenshots: ["pwa-offline-desktop.png", "pwa-sync-mobile.png"] }, null, 2));
})().catch(async (error) => {
  if (browser) await browser.close().catch(() => {});
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
