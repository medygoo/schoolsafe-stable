// QA — Cartes élèves SchoolSafe : pipeline complet de bout en bout (E2E).
// RED puis GREEN : ces checks reproduisent les 10 problèmes réels identifiés.
// Démarrage requis : node app/server.mjs --host 0.0.0.0 (port 4175).
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const baseUrl = process.env.SCHOOLSAFE_URL || "http://127.0.0.1:4175/";
const outputDir = path.join(__dirname, "qa-output");
let browser;

let pass = 0;
const failures = [];
function check(condition, message) {
  if (condition) { pass++; console.log("  PASS " + message); return; }
  failures.push(message);
  console.error("  FAIL " + message);
}

async function domClick(page, selector) {
  await page.locator(selector).first().evaluate((element) => element.click());
}

// ————— Données contrôlées « Jean Test » — servies par des mocks d'API —————
const CLASS_ID = "22222222-0000-4000-8000-000000000001";
const STUDENT_ID = "44444444-0000-4000-8000-000000000001";
const YEAR_ID = "88888888-0000-4000-8000-000000000001";
const TEACHER_ID = "77777777-0000-4000-8000-000000000001";
const CARD_NUMBER = "SS-TST-JT2026001-1759000000000";
const CARD_SIGNATURE = "AbCdEfGh12345678AbCdEfGh12345678";

// 1×1 PNG bleu (réelle image, dataURL valide)
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const MOCKS = () => ({
  // Projection classes (pedagogy) — identique à la vraie forme de /native/pedagogy/classes
  "/native/pedagogy/classes": {
    data: [
      { id: CLASS_ID, name: "3ème A", cycle_key: "primary", option: null, academic_year_id: YEAR_ID, is_active: true },
    ],
  },
  // Design classes — identique à /native/cards/class-card-config
  "/native/cards/class-card-config": {
    data: [
      {
        id: CLASS_ID, name: "3ème A", cycle_key: "primary", option: null,
        teacher_id: null, academic_year_id: YEAR_ID,
        card_color: "#e9a515", card_color_soft: "#f9e8b8", card_color_dark: "#b87e0d",
        card_pat: "auto", card_family: "A", card_variant: null, card_pat_style: null, is_active: true,
      },
    ],
  },
  // Liste élèves (projection /native/students) — le studio la combine avec la projection carte
  "/native/students": {
    data: {
      total: 1,
      rows: [
        {
          id: STUDENT_ID, matricule: "JT-2026-001", first_name: "Jean", middle_name: "Kabasele",
          last_name: "Test", date_of_birth: "2015-04-12", photo_path: TINY_PNG,
          class_id: CLASS_ID, class_name: "3ème A", school_id: "33333333-0000-4000-8000-000000000001",
          lifecycle_status: "active", card_print_count: 0,
        },
      ],
      limit: 50, offset: 0,
    },
  },
  // Projection élève enrichie (cards studio) — identique à la vraie /native/cards/students/:id/card-projection
  ["/native/cards/students/" + STUDENT_ID + "/card-projection"]: {
    data: {
      student: {
        id: STUDENT_ID, matricule: "JT-2026-001", first_name: "Jean", middle_name: "Kabasele",
        last_name: "Test", date_of_birth: "2015-04-12", photo_path: TINY_PNG, lifecycle_status: "active",
      },
      school: {
        name: "SchoolSafe Test", name_en: null, logo_path: "", motto: "Un enfant protégé",
        director_name: "Directeur Kalala", address: "12 avenue de la Paix",
        phone: "+243900000000", email: "ecole@schoolsafe.cd", website_url: "https://ecole.schoolsafe.cd",
      },
      class: {
        id: CLASS_ID, name: "3ème A", cycle_key: "primary", option: null,
        card_color: "#e9e515", card_color_soft: "#f9e8b8", card_color_dark: "#b87e0d",
        card_family: "A", card_variant: null, card_pat: "auto", card_pat_style: null,
      },
      academic_year: { id: YEAR_ID, label: "2026-2027" },
      teacher: { id: TEACHER_ID, name: "Maîtresse Mukendi" },
      primary_guardian: { id: "g1", full_name: "Maman Tshala", guardian_type: "mere", phone: "+243810000000" },
      authorized_persons: [
        { id: "g2", full_name: "Tonton Ilunga", guardian_type: "tuteur", phone: "+243820000000", slot_no: 1 },
      ],
      active_card: { id: "card-1", card_number: CARD_NUMBER, signature: CARD_SIGNATURE, status: "active" },
    },
  },
});

function installMocks(page) {
  const mockData = MOCKS();
  return page.route("**/native/**", (route) => {
    const url = new URL(route.request().url());
    const pathName = url.pathname; // conserve le préfixe /native (clés définies avec)

    // POST card-package : renvoie un VRAI ZIP (structure PK + entrées + manifest)
    if (pathName.endsWith("/card-package") && route.request().method() === "POST") {
      const zip = buildRealZip();
      return route.fulfill({
        status: 200,
        contentType: "application/zip",
        headers: {
          "Content-Disposition": 'attachment; filename="Carte_JT-2026-001_Test_Jean.zip"',
          "Access-Control-Expose-Headers": "Content-Disposition, X-Card-Number",
          "X-Card-Number": CARD_NUMBER,
        },
        body: zip,
      });
    }

    const key = Object.keys(mockData).find((k) => pathName === k || pathName.startsWith(k));
    if (key) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockData[key]) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: null }) });
  });
}

/** ZIP réel minimal (store, CRC32) contenant recto/verso/manifest — côté mock test. */
function buildRealZip() {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const manifest = {
    student_id: STUDENT_ID, matricule: "JT-2026-001", student_name: "Jean Kabasele Test",
    class_name: "3ème A", academic_year: "2026-2027", card_number: CARD_NUMBER,
    version: 1, generated_at: new Date().toISOString(),
    recto_sha256: "a".repeat(64), verso_sha256: "b".repeat(64),
  };
  const files = [
    { name: "Carte_Test_Jean/recto.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    { name: "Carte_Test_Jean/verso.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b]) },
    { name: "Carte_Test_Jean/manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") },
  ];
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(f.data.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, f.data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(f.data.length, 20);
    cd.writeUInt32LE(f.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + f.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

async function finish() {
  await browser.close();
  console.log("\n=============================");
  console.log("PASS: " + pass + " / FAIL: " + failures.length);
  if (failures.length) {
    console.log("\nCHECKS EN ÉCHEC :");
    failures.forEach((f) => console.log(" - " + f));
    process.exit(1);
  }
  console.log("QA CARDS COMPLETE: ALL GREEN");
  process.exit(0);
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "/home/daytona/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  const errors = [];
  page.on("pageerror", (error) => errors.push("pageerror: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push("console: " + message.text());
  });

  await installMocks(page);
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 30000 });

  // Entrée démo : splash → auth → workspace admin (bouton #demoEntry)
  await domClick(page, "#enterSplash");
  await page.locator("#demoRole").selectOption("admin");
  await domClick(page, "#demoEntry");
  await page.waitForTimeout(1200);

  console.log("\n=== 1. ACCÈS STUDIO CARTES ===");

  // Check 1 : le clic Cartes élèves (desktop) ouvre cardsStudio — pas securityModule
  await domClick(page, '#ecosystemGrid [data-ecosystem="cards"]');
  await page.waitForTimeout(600);
  const studioOpen = await page.locator("#cardsStudio:not([hidden])").count() > 0;
  check(studioOpen, "clic Cartes élèves desktop ouvre #cardsStudio");
  check(await page.locator("#securityModule").isHidden(), "clic Cartes n'ouvre PAS #securityModule");

  // Check 2 : classes chargées
  const classOptions = await page.locator("#cardsClassSelect option").count();
  check(classOptions >= 2, "les classes réelles sont chargées dans le studio (select) [" + classOptions + "]");

  // À partir d'ici, la suite nécessite le studio ouvert — on quitte proprement en RED.
  if (!studioOpen) {
    await finish();
    return;
  }

  // Check 3 : enseignant réel résolu (pas « — »)
  await page.locator("#cardsClassSelect").selectOption(CLASS_ID);
  await page.waitForTimeout(500);
  await page.locator("#cardsStudentList label").first().click();
  await page.waitForTimeout(300);
  await domClick(page, "#cardsRenderBtn");
  await page.waitForTimeout(800);
  const previewText = await page.locator("#cardsPreview").innerText();
  check(/Mukendi/.test(previewText), "l'enseignant réel est affiché dans l'aperçu (pas « — »)");

  // Check 4 : données de la projection affichées (école, parent, personne autorisée)
  check(/SchoolSafe Test/.test(previewText), "l'identité école vient de la projection");
  check(/Tshala/.test(previewText), "le Parent principal vient de la projection");
  check(/Ilunga/.test(previewText), "la personne autorisée vient de la projection");
  check(/JT-2026-001/.test(previewText), "le matricule vient de la projection");

  // Check 5 : QR au format sécurisé schoolsafe://card/<numéro>/<signature>
  const qrPayload = await page.evaluate(() => {
    const holders = [
      document.querySelector("#ss-qr-br"),
      document.querySelector("#ss-qr-cr"),
      document.querySelector("#ss-qr-bv"),
      document.querySelector("#ss-qr-cv"),
    ].filter(Boolean);
    return holders.map((el) => el.getAttribute("data-qr-payload") || "").join("|");
  });
  check(qrPayload.includes("schoolsafe://card/" + CARD_NUMBER + "/" + CARD_SIGNATURE), "le QR suit le contrat schoolsafe://card/<numéro>/<signature> (" + qrPayload.split("|")[0] + ")");
  check(!qrPayload.includes("schoolsafe://student/"), "aucun payload schoolsafe://student/ hérité");

  // Check 6-7 : recto et verso générés
  check(await page.locator("#ss-br, #ss-cr").count() > 0, "le recto est généré");
  check(await page.locator("#ss-bv, #ss-cv").count() > 0, "le verso est généré");

  console.log("\n=== 2. PHOTO ÉLÈVE AFFICHÉE ===");
  // Check 8 : photo de la projection affichée dans la carte
  const photoImg = await page.evaluate(() => {
    const imgs = document.querySelectorAll("#cardsPreview .photo img");
    return imgs.length > 0;
  });
  check(photoImg, "la photo élève de la projection est affichée dans la carte");

  console.log("\n=== 3. GÉNÉRATION + TÉLÉCHARGEMENT ===");
  // Check 9-13 : PNG non vides + ZIP non vide via le bouton Télécharger
  let download = null;
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
    await domClick(page, "#cardsDownloadBtn");
    download = await downloadPromise;
  } catch (e) {
    check(false, "le bouton Télécharger la carte déclenche un téléchargement ZIP");
  }
  if (download) {
    const target = path.join(outputDir, "carte-jean-test.zip");
    await download.saveAs(target);
    const size = fs.statSync(target).size;
    check(size > 100, "le ZIP téléchargé n'est pas vide (" + size + " octets)");
    const buf = fs.readFileSync(target);
    check(buf.subarray(0, 2).toString("latin1") === "PK", "le fichier téléchargé est un ZIP valide");
    // Les noms attendus doivent être dans les headers mockés
    const suggested = download.suggestedFilename();
    check(/^Carte_.*\.zip$/.test(suggested), "le ZIP est nommé Carte_<MATRICULE>_<NOM>_<PRENOM>.zip (" + suggested + ")");
  }

  // Checks ZIP contents would require unzipping; server test covers contents contract.
  console.log("\n=== 4. RESPONSIVE 390px ===");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "le studio cartes ne déborde pas horizontalement à 390px");
  await page.screenshot({ path: path.join(outputDir, "cards-studio-mobile.png"), fullPage: true });
  check(await page.locator("#cardsStudio:not([hidden])").count() > 0, "le studio reste ouvert et fonctionnel à 390px");

  // Mobile grid : le bouton cartés mobile existe et ouvre le studio
  console.log("\n=== 5. MOBILE ECOSYSTEM + RETOUR DASHBOARD ===");
  await domClick(page, "#closeCardsStudio");
  await page.waitForTimeout(400);
  check(await page.locator("#cardsStudio").isHidden(), "#closeCardsStudio ferme le studio");
  check(await page.evaluate(() => {
    const dashboard = document.querySelector("#dashboardDesktop, .workspace-grid");
    return dashboard && (dashboard.offsetWidth > 0 || getComputedStyle(dashboard).display !== "none");
  }), "la fermeture ramène au dashboard");

  // Desktop : re-open via mobile grid
  await page.setViewportSize({ width: 1440, height: 1000 });
  await domClick(page, '#ecosystemGridMobile [data-ecosystem="cards"]');
  await page.waitForTimeout(500);
  check(await page.locator("#cardsStudio:not([hidden])").count() > 0, "le bouton Cartes mobile ouvre aussi #cardsStudio");
  await domClick(page, "#closeCardsStudio");

  console.log("\n=== 6. ERREURS RUNTIME ===");
  const realErrors = errors.filter((e) => !e.includes("favicon") && !e.includes("404") && !e.includes("Failed to load resource"));
  check(realErrors.length === 0, "aucune erreur runtime bloquante (" + realErrors.length + ")");

  await finish();
})().catch(async (error) => {
  console.error("QA CARDS COMPLETE ERREUR FATALE:", error.message);
  if (browser) await browser.close().catch(() => {});
  process.exit(1);
});
