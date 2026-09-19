const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const pkg = JSON.parse(read("package.json"));
const html = read("app/index.html");
read("app/app.js");
const serviceWorker = read("app/sw.js");
const tokens = read("app/styles/design-tokens.css");
const designSystem = read("app/styles/design-system.css");
const components = read("app/styles/components.css");
const dashboard = read("app/styles/dashboard.css");
const auth = read("app/styles/screens/auth.css");
const authCompanion = read("app/styles/modules/auth-companion.css");
const authModels = read("app/styles/modules/auth-models.css");
const combinedCss = [tokens, designSystem, components, dashboard, auth, authCompanion, authModels].join("\n");

assert.equal(pkg.dependencies?.react, undefined, "React doit rester absent des dépendances");
assert.equal(pkg.dependencies?.antd, undefined, "Ant Design doit rester absent des dépendances");

for (const id of [
  "loginForm",
  "otpIdentity",
  "workspaceSidebar",
  "workspaceTopbar",
  "dashboardDesktop",
  "dashboardMobile",
  "workspaceBottomNav",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Identifiant critique manquant : #${id}`);
}

assert.match(html, /schoolsafe-logo\.png/, "Le logo SchoolSafe officiel doit rester utilisé");
assert.match(
  html,
  /id=["']workspaceDemoBanner["'][^>]*role=["']status["'][^>]*>.*Mode aperçu\s*—\s*données fictives\./,
  "Le mode aperçu doit rester identifié sans message promotionnel"
);
assert.doesNotMatch(html, /Mode démonstration\s*·\s*connectez-vous pour accéder aux données réelles\./, "L'ancien bandeau démonstration ne doit pas revenir");
assert.match(serviceWorker, /CACHE_NAME\s*=\s*CACHE_PREFIX\s*\+\s*["']a51-session-denials-2026-09-19["']/, "La version du cache doit publier le contrat A5.1 de session");
assert.match(tokens, /--ss-focus-ring\s*:/, "Le token d'anneau de focus SchoolSafe est requis");
assert.match(components, /:focus-visible/, "Les composants partagés doivent exposer un focus clavier visible");
assert.match(combinedCss, /prefers-reduced-motion/, "Le système visuel doit respecter les mouvements réduits");
assert.doesNotMatch(combinedCss, /\.guardian(?:\W|$)/, "L'ancien écran guardian ne doit pas revenir");
assert.doesNotMatch(designSystem, /backdrop-filter:\s*blur\(20px\)/, "Le flou global de 20 px doit rester supprimé");
assert.doesNotMatch(designSystem, /body::(?:before|after)/, "Les halos fixes du body doivent rester supprimés");
assert.doesNotMatch(designSystem, /\.ss-button--(?:primary|secondary)::after/, "Les flèches automatiques ne doivent pas revenir");
assert.doesNotMatch(designSystem, /\[class\*=["']screen-/, "Les écrans ne doivent pas recevoir une surcharge globale");
assert.doesNotMatch(designSystem, /@import\s+url\(["']https:/i, "La CSP SchoolSafe interdit les feuilles CSS externes");
// Task 3 — connexion/OTP responsive : identifiants et labels OTP conservés
assert.match(html, /id=[""']otpIdentifier[""']/, "Le champ OTP #otpIdentifier doit rester présent");
assert.match(html, /for=[""']otpIdentifier[""']/, "Le label du champ OTP doit rester associé");

// Task 3 — JASPE ne chevauche pas le panneau actif à largeur mobile
assert.match(
  authModels,
  /\.auth-jaspe-withdrawn\s+\.auth-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  "À l'état withdrawn, JASPE doit libérer l'espace du formulaire sans chevauchement"
);
assert.ok(
  authModels.includes('.auth-jaspe-withdrawn .auth-jaspe') && authModels.includes('display:none'),
  "À l'état withdrawn, la zone JASPE doit être masquée (display:none)"
);
// Task 4 — shell/navigation responsive : identifiants critiques conservés
assert.match(html, /id=[""']workspaceSidebar[""']/, "Le sidebar #workspaceSidebar doit rester présent");
assert.match(html, /id=[""']workspaceTopbar[""']/, "La topbar #workspaceTopbar doit rester présente");
assert.match(html, /id=[""']workspaceBottomNav[""']/, "La bottom nav #workspaceBottomNav doit rester présente");
// Task 4 — bouton menu expose aria-expanded
assert.match(html, /aria-expanded=[""'](true|false)[""']/, "Le bouton menu doit exposer aria-expanded");
// Task 4 — navigation active identifiable autrement que par couleur seule
assert.match(dashboard, /\.ss-bottom-nav__item\.active\s*\{[^}]*font-weight|border|background/, "La navigation active doit être identifiable par font-weight, border ou background");
// Task 5 — tableaux de bord mobile/bureau : compositions exclusives
assert.match(html, /id=[""']dashboardDesktop[""']/, "La composition #dashboardDesktop doit rester présente");
assert.match(html, /id=[""']dashboardMobile[""']/, "La composition #dashboardMobile doit rester présente");
assert.match(dashboard, /\.ss-dashboard-desktop\[hidden\][^}]*display:\s*none/, "Le dashboard desktop masqué doit utiliser display:none");
assert.match(dashboard, /\.ss-dashboard-mobile\[hidden\][^}]*display:\s*none/, "Le dashboard mobile masqué doit utiliser display:none");

const demoBannerRule = dashboard.match(/\.workspace-demo-banner\s*\{([\s\S]*?)\}/)?.[1] || "";
assert.match(demoBannerRule, /background:\s*var\(--ss-surface-muted\)/, "Le mode aperçu doit utiliser une surface neutre");
assert.match(demoBannerRule, /color:\s*var\(--ss-text-secondary\)/, "Le mode aperçu doit garder un texte secondaire lisible");
assert.doesNotMatch(demoBannerRule, /--ss-warning-/, "Le mode aperçu ne doit pas ressembler à une alerte");

const stylesheetOrder = [
  "styles/design-tokens.css",
  "styles/design-system.css",
  "styles/components.css",
  "styles/dashboard.css",
  "styles/screens/auth.css",
];
let previousIndex = -1;
for (const stylesheet of stylesheetOrder) {
  const currentIndex = html.indexOf(stylesheet);
  assert.ok(currentIndex > previousIndex, `Ordre de feuille invalide ou feuille absente : ${stylesheet}`);
  previousIndex = currentIndex;
}

console.log("SchoolSafe responsive visual system contract: PASS");
