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

async function switchDemoRole(page, role) {
  // Le sélecteur de rôle du topbar est masqué en session démo mono-rôle :
  // on repasse par l'écran d'authentification, comme tests/qa/e2e/helpers.
  await page.evaluate(() => window.schoolSafeShow("auth"));
  await page.locator("#demoRole").selectOption(role);
  await domClick(page, "#previewWorkspace");
  await page.waitForTimeout(600);
}

async function downloadFrom(page, selector, filename) {
  const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
  await domClick(page, selector);
  const download = await downloadPromise;
  const target = path.join(outputDir, filename);
  await download.saveAs(target);
  check(fs.statSync(target).size > 1000, `${filename} est vide ou incomplet`);
  return target;
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
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });
  check(await page.locator("#splash.active").count(), "L'écran bleu n'est pas actif");
  check((await page.locator("#particles .particle").count()) >= 12, "Les particules animées ne sont pas créées");

  await domClick(page, "#enterSplash");
  check(await page.locator("#auth.active").count(), "L'écran de connexion ne s'ouvre pas directement");
  await page.locator("#demoRole").selectOption("admin");
  await domClick(page, "#previewWorkspace");
  check(await page.locator("#workspace.active").count(), "Le tableau de bord ne s'ouvre pas");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outputDir, "dashboard-desktop.png"), fullPage: true });

  await page.locator('[data-action="ENAFEP"]').first().evaluate((element) => element.click());
  check(await page.locator(".certification-workspace").count(), "Le module des épreuves nationales ne s'ouvre pas");
  await domClick(page, '[data-cert-view="results"]');
  check(await page.getByText("Résultats officiels enregistrés").count(), "La vue des résultats est absente");
  await downloadFrom(page, '[data-export-cert="all"]', "resultats-enafep.pdf");
  await page.screenshot({ path: path.join(outputDir, "epreuves-nationales.png"), fullPage: true });

  await domClick(page, '[data-cert-exam="EXETAT"]');
  check(await page.getByText("Examen d’État", { exact: true }).count(), "L'EXETAT ne s'ouvre pas");
  await domClick(page, '[data-cert-view="stages"]');
  check((await page.locator(".certification-stage-grid article").count()) === 9, "Le parcours EXETAT est incomplet");
  await page.evaluate(() => document.querySelector("#toast").classList.remove("show"));
  await page.screenshot({ path: path.join(outputDir, "exetat-desktop.png"), fullPage: true });
  await page.locator(".certification-stages").screenshot({ path: path.join(outputDir, "exetat-etapes-desktop.png") });
  await domClick(page, '[data-cert-view="results"]');
  await downloadFrom(page, '[data-export-cert="all"]', "resultats-exetat.pdf");
  await page.setViewportSize({ width: 390, height: 844 });
  await domClick(page, '[data-cert-view="stages"]');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Le module EXETAT déborde horizontalement sur téléphone");
  await page.evaluate(() => document.querySelector("#toast").classList.remove("show"));
  await page.screenshot({ path: path.join(outputDir, "exetat-mobile.png"), fullPage: true });
  await page.locator(".certification-stages").screenshot({ path: path.join(outputDir, "exetat-etapes-mobile.png") });
  // Sur téléphone le défilement se fait sur le document, pas sur .workspace-main : on couvre les deux.
  await page.evaluate(() => {
    const main = document.querySelector(".workspace-main");
    main.scrollTop = main.scrollHeight;
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(300);
  check(await page.locator(".certification-stage-grid article").last().evaluate((element) => { const box = element.getBoundingClientRect(); return box.top < window.innerHeight && box.bottom > 0; }), "La dernière étape EXETAT n'est pas accessible sur téléphone");
  await page.screenshot({ path: path.join(outputDir, "exetat-mobile-bottom.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await domClick(page, "#closePedagogyModule");
  await page.locator('[data-action="Devoirs et corrections"]').first().evaluate((element) => element.click());
  // Runtime actuel : l'onglet Devoirs affiche le détail du devoir sélectionné (panneau de correction).
  // La génération PDF passe par l'AccessGate DocumentEngine : le rôle admin démo n'a pas de scope
  // pedagogy.assignment.read, le téléchargement est donc refusé par conception (Access_Law) —
  // la génération PDF réelle reste couverte par les exports ENAFEP/EXETAT ci-dessus.
  check(await page.locator("#pedagogyContent [data-assignment-id]").count(), "La liste des devoirs ne s'ouvre pas");
  check(await page.locator("#pedagogyContent .assignment-detail").count(), "Le détail du devoir ne s'affiche pas");
  check(await page.locator("#pedagogyContent [data-download-assignment]").count(), "L'action PDF du devoir est absente");

  await domClick(page, "#closePedagogyModule");
  await switchDemoRole(page, "cashier");
  await page.locator('[data-action="Enregistrer un paiement"]').evaluate((element) => element.click());
  check(await page.locator("#financeModule:not([hidden])").count(), "Le module de caisse ne s'ouvre pas");
  check(await page.locator("#paymentForm").count(), "Le formulaire d'encaissement de la Caisse est absent");
  // Runtime actuel : sélection d'un élève réel, confirmation explicite, reçu DÉMO-REC-<horodatage>.
  await page.locator("#financeCashStudent").selectOption("demo-s1");
  await page.locator('#paymentForm input[name="amount"]').fill("50000");
  await page.locator('#paymentForm input[name="reference"]').fill("Troisième tranche de démonstration");
  await domClick(page, '#paymentForm button[type="submit"]');
  await domClick(page, '[data-confirm-demo-payment]');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => /DÉMO-REC-/.test(document.getElementById("financeContent").textContent)), "Le reçu de démonstration n'est pas créé après confirmation locale");
  // Runtime actuel : le registre de reçus sûr et les rapports démo ne proposent volontairement
  // aucun export PDF ni soumission de journée (BACKEND_LATER — cf. qa-finance-receipts.cjs).
  check((await page.locator("#financeContent [data-export-receipt], #financeContent #exportCashReport, #financeContent #submitCashDay").count()) === 0, "La caisse démo ne doit proposer aucune action financière officielle");
  await page.screenshot({ path: path.join(outputDir, "finance-desktop.png"), fullPage: true });

  await domClick(page, "#closeFinanceModule");
  await switchDemoRole(page, "finance");
  await page.locator('[data-action="Tableau financier"]').evaluate((element) => element.click());
  // Runtime actuel : le rôle finance démo couvre dix branches (sans l'encaissement de guichet).
  check((await page.locator('#financeTabs [data-finance-tab]:not([hidden])').count()) === 10, "Le Responsable financier n'a pas les dix branches prévues");
  await domClick(page, '[data-finance-tab="reports"]');
  check(await page.evaluate(() => /BACKEND_LATER/.test(document.getElementById("financeContent").textContent)), "L'onglet Rapports doit rester une projection démo sans export officiel");
  check((await page.locator("#paymentForm").count()) === 0, "Le Responsable financier exécute un encaissement de guichet");

  await domClick(page, "#closeFinanceModule");
  await switchDemoRole(page, "school_head");
  await page.locator('[data-action="Recettes"]').evaluate((element) => element.click());
  check((await page.locator('#financeTabs [data-finance-tab]:not([hidden])').count()) === 2, "La Direction reçoit trop de branches financières");
  check((await page.locator('#financeTabs [data-finance-tab="cash"]:not([hidden]), #financeTabs [data-finance-tab="fees"]:not([hidden])').count()) === 0, "La Direction reçoit des fonctions financières d'exécution");

  await domClick(page, "#closeFinanceModule");
  await switchDemoRole(page, "pedagogy");
  await page.locator('[data-action="Voir les élèves en ordre ou à régulariser"]').evaluate((element) => element.click());
  // Runtime actuel : le rôle pédagogique démo n'a plus finance.status.read — aucune branche Finance,
  // état de refus explicite, aucune donnée ni action financière.
  check((await page.locator('#financeTabs [data-finance-tab]:not([hidden])').count()) === 0, "Le profil pédagogique reçoit une branche Finance interdite");
  const pedagogyFinanceText = await page.locator("#financeContent").innerText();
  check(pedagogyFinanceText.includes("Finance générale non autorisée"), "Le refus Finance du profil pédagogique n'est pas explicite");
  check(!/\bFC\b|Montant|Reçu|Trésorerie|Paiement|Solde/i.test(pedagogyFinanceText), "Le profil pédagogique voit des données financières interdites");
  check((await page.locator("#financeContent [data-export-receipt], #financeContent #paymentForm").count()) === 0, "Le profil pédagogique reçoit une action financière interdite");

  await domClick(page, "#closeFinanceModule");
  await switchDemoRole(page, "parent");
  await page.locator('[data-action="Frais scolaires"]').evaluate((element) => element.click());
  check((await page.locator('#financeTabs [data-finance-tab]:not([hidden])').count()) === 1, "Le Parent reçoit plus que sa situation familiale");
  const familyFinanceText = await page.locator("#financeContent").innerText();
  check(familyFinanceText.includes("Lucas Martin") && !familyFinanceText.includes("Ethan Leroy") && !familyFinanceText.includes("Chloé Bernard"), "Le Parent voit des enfants qui ne lui sont pas rattachés");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Le module financier familial déborde sur téléphone");
  await page.screenshot({ path: path.join(outputDir, "finance-parent-mobile.png"), fullPage: true });

  await domClick(page, "#closeFinanceModule");
  await switchDemoRole(page, "cashier");
  await page.locator('[data-action="Produire un reçu PDF"]').evaluate((element) => element.click());
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "Le registre des reçus déborde sur téléphone");
  await page.screenshot({ path: path.join(outputDir, "finance-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await domClick(page, "#closeFinanceModule");
  await switchDemoRole(page, "teacher");
  await page.locator('[data-action="Préparation aux épreuves certificatives"]').evaluate((element) => element.click());
  check(await page.locator('[data-cert-view="stages"]').count(), "L'enseignant ne voit pas les étapes EXETAT");
  check(await page.locator('[data-cert-view="preparation"]').count(), "L'enseignant ne voit pas la préparation EXETAT");
  check((await page.locator('[data-cert-view="candidates"], [data-cert-view="results"]').count()) === 0, "L'enseignant reçoit un accès EXETAT trop large");

  await domClick(page, "#closePedagogyModule");
  await switchDemoRole(page, "secretary");
  await page.locator('[data-action="Dossiers ENAFEP, TENASOSP et EXETAT"]').evaluate((element) => element.click());
  // Runtime actuel : l'action relève du Centre Administration et le rôle secrétariat démo
  // n'a aucune permission — l'ouverture est refusée (Access_Law), aucune surface ne s'affiche.
  check(await page.locator("#pedagogyModule").evaluate((element) => element.hidden), "Le secrétariat ouvre la surface pédagogique sans permission");

  await domClick(page, "#closePedagogyModule");
  await switchDemoRole(page, "parent");
  await page.locator('[data-action="Épreuves certificatives"]').evaluate((element) => element.click());
  check(await page.locator('[data-cert-view="stages"]').count(), "Le parent ne voit pas le calendrier EXETAT");
  check(await page.locator('[data-cert-view="parent"]').count(), "Le parent ne voit pas son résultat EXETAT");
  check((await page.locator('[data-cert-view="candidates"], [data-cert-view="preparation"], [data-cert-view="results"]').count()) === 0, "Le parent reçoit un accès EXETAT trop large");
  await domClick(page, '[data-cert-view="parent"]');
  check(await page.locator(".certification-parent").count(), "Le relevé EXETAT du parent ne s'affiche pas");

  await page.setViewportSize({ width: 390, height: 844 });
  await domClick(page, "#closePedagogyModule");
  await domClick(page, "#workspaceBack");
  await domClick(page, "#backToSplash");
  await domClick(page, "#enterSplash");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(outputDir, "connexion-mobile.png"), fullPage: true });
  check(await page.locator("#auth.active").count(), "La connexion mobile ne s'ouvre pas directement");

  check(errors.length === 0, `Erreurs navigateur: ${errors.join(" | ")}`);
  await browser.close();
  console.log(JSON.stringify({ ok: true, outputDir, files: fs.readdirSync(outputDir) }, null, 2));
})().catch(async (error) => {
  if (browser) await browser.close().catch(() => {});
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
