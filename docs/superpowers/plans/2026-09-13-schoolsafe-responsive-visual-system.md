# SchoolSafe Responsive Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Appliquer la direction visuelle SchoolSafe approuvée à la connexion, l'OTP, la navigation et aux tableaux de bord mobile/bureau sans modifier la logique métier.

**Architecture:** Les tokens `--ss-*` restent la source de vérité. Une couche de design mesurée habille les composants HTML existants, puis les compositions auth et dashboard sont adaptées par largeur. Les identifiants DOM et événements utilisés par `app/app.js` restent stables ; les tests ciblés protègent ce contrat avant chaque changement visuel.

**Tech Stack:** HTML, CSS, JavaScript navigateur sans framework, Node.js `assert` pour les contrats statiques, vérification navigateur ciblée.

**Spec:** `docs/superpowers/specs/2026-09-13-schoolsafe-responsive-visual-system-design.md`

## Contraintes globales

- Ne pas ajouter React, Ant Design, Three.js, WebGL supplémentaire ou dépendance 3D.
- Utiliser `app/schoolsafe-logo.png` ; ne pas recréer le logo.
- Conserver JASPE 2D/2,5D et tous ses sélecteurs/événements actuels.
- Préserver les identifiants DOM, permissions, routes, isolation d'école et actions métier.
- Ne pas toucher à SchoolSafe Control, au backend, à la voix, GLM, Cloudflare, Docker ou au VPS.
- Limiter les tests aux contrats et parcours importants définis dans la spécification.
- Faire un commit vérifié par lot ; pousser sur `main` seulement après validation du chantier demandé.

## Structure des fichiers

- Modify `app/styles/design-tokens.css`: tokens visuels approuvés et alias temporaires documentés.
- Modify `app/styles/design-system.css`: application sobre des tokens, suppression du glassmorphism global et des surcharges excessives.
- Modify `app/styles/components.css`: champs, boutons, cartes, badges et focus partagés.
- Modify `app/styles/screens/auth.css`: connexion et OTP responsive.
- Modify `app/styles/modules/auth-companion.css`: espace réservé à JASPE sans chevauchement.
- Modify `app/styles/modules/auth-models.css`: comportement responsive et mouvements réduits de JASPE.
- Modify `app/styles/dashboard.css`: shell, navigation, dashboard mobile/tablette/bureau.
- Modify `app/index.html`: classes et structure sémantique seulement lorsque le CSS ne suffit pas, sans renommer les identifiants critiques.
- Modify `app/app.js`: uniquement les états d'ouverture/focus nécessaires au menu accessible ; aucune logique métier.
- Create `app/qa-responsive-visual-system.cjs`: contrat ciblé du système visuel.
- Modify `package.json`: commande `test:visual-system`.
- Modify `docs/CURRENT_HANDOFF.md`: preuves et prochaine action exactes après chaque lot.

---

### Task 1: Verrouiller le contrat de non-régression visuelle

**Files:**
- Create: `app/qa-responsive-visual-system.cjs`
- Modify: `package.json`

- [x] **Step 1: Écrire le test statique avant le changement CSS**

Le script doit charger `package.json`, `app/index.html`, `app/app.js` et les feuilles concernées avec `node:fs`, puis vérifier avec `node:assert/strict` :

```js
assert.equal(pkg.dependencies?.react, undefined);
assert.equal(pkg.dependencies?.antd, undefined);
for (const id of ['loginForm', 'otpIdentity', 'workspaceSidebar', 'workspaceTopbar', 'dashboardDesktop', 'dashboardMobile', 'workspaceBottomNav']) {
  assert.match(html, new RegExp(`id=["']${id}["']`));
}
assert.match(html, /schoolsafe-logo\.png/);
assert.match(tokens, /--ss-focus-ring:/);
assert.match(components, /:focus-visible/);
assert.match(combinedCss, /prefers-reduced-motion/);
assert.doesNotMatch(combinedCss, /\.guardian(?:\W|$)/);
```

Le test doit aussi vérifier l'ordre `design-tokens.css`, `design-system.css`, `components.css`, `dashboard.css`, puis `screens/auth.css` dans `app/index.html`.

- [x] **Step 2: Exécuter le test et constater les contrats manquants**

Run: `node app/qa-responsive-visual-system.cjs`

Expected: FAIL sur le nouveau token de focus ou le contrat d'accessibilité, tout en confirmant les identifiants existants.

- [x] **Step 3: Ajouter la commande ciblée**

Dans `package.json` :

```json
"test:visual-system": "node app/qa-responsive-visual-system.cjs && node app/qa-no-guardian-screen.cjs"
```

- [x] **Step 4: Vérifier la syntaxe du script et du manifeste**

Run: `node --check app/qa-responsive-visual-system.cjs`

Expected: code 0.

Run: `node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8')); console.log('package.json: PASS')"`

Expected: `package.json: PASS`.

- [x] **Step 5: Intégrer le contrat avec les fondations dans un commit vert**

Le contrat a bien été observé rouge sur `--ss-focus-ring`. Comme le propriétaire a demandé un miroir direct de `main`, le test et son implémentation sont publiés ensemble afin de ne pas introduire un commit cassé dans la branche partagée.

```bash
git add app/qa-responsive-visual-system.cjs package.json
git commit -m "test(ui): define responsive visual system contract"
```

---

### Task 2: Consolider les tokens et les composants partagés

**Files:**
- Modify: `app/styles/design-tokens.css`
- Modify: `app/styles/design-system.css`
- Modify: `app/styles/components.css`

- [x] **Step 1: Ajouter les tokens manquants**

Ajouter aux tokens `--ss-*` : anneau de focus, largeurs de contenu, hauteurs de contrôle, opacités de surface et ombres corrigées. Garder les valeurs approuvées : contrôle 48 px, cible tactile 44 px, focus bleu avec décalage blanc, ombre légère et rayons 12/16/20 px.

- [x] **Step 2: Migrer les alias `--ds-*` utiles**

Dans `design-system.css`, remplacer les valeurs indépendantes par les tokens `--ss-*`. Si un alias `--ds-*` doit survivre pendant la transition, le définir une seule fois comme `var(--ss-...)` et marquer son retrait après harmonisation des modules.

- [x] **Step 3: Retirer les effets globaux excessifs**

Supprimer ou restreindre :

- `backdrop-filter: blur(20px)` appliqué à toutes les cartes ;
- l'arrière-plan forcé avec `!important` sur tous les écrans ;
- les deux grands halos fixes sur `body` ;
- les ombres lumineuses sur chaque bouton/carte ;
- l'ajout automatique d'une flèche `::after` sur toutes les actions primaires.

Conserver un dégradé maîtrisé uniquement sur les actions principales et la navigation active.

- [x] **Step 4: Harmoniser les composants partagés**

Dans `components.css`, appliquer aux boutons, champs, cartes, badges et contrôles icône les tailles, focus, contraste, états désactivés et zones tactiles de la spécification. Ne pas cibler globalement tous les `input` ou `button` quand une classe SchoolSafe existe.

- [x] **Step 5: Faire passer le contrat**

Run: `npm run test:visual-system`

Expected: contrat visuel PASS et ancien écran `guardian` absent.

Run: `git diff --check`

Expected: aucune sortie, code 0.

- [x] **Step 6: Vérifier visuellement trois surfaces sans chercher la finition**

Sur `http://127.0.0.1:4176/`, vérifier connexion, tableau de bord mobile et bureau : aucune carte transparente illisible, aucun halo fixe, focus visible et aucune régression de clic.

- [x] **Step 7: Committer les fondations**

```bash
git add app/styles/design-tokens.css app/styles/design-system.css app/styles/components.css
git commit -m "style(ui): consolidate SchoolSafe visual foundations"
```

---

### Task 3: Recomposer la connexion et l'OTP

**Files:**
- Modify: `app/styles/screens/auth.css`
- Modify: `app/styles/modules/auth-companion.css`
- Modify: `app/styles/modules/auth-models.css`
- Modify: `app/index.html` only if semantic wrappers/classes are required
- Modify: `app/qa-responsive-visual-system.cjs`

- [ ] **Step 1: Étendre le contrat auth avant le CSS**

Vérifier la présence et la conservation de `#loginForm`, `#otpIdentity`, `#otpIdentifier`, des libellés associés, de la zone JASPE et d'une règle mobile `max-width: 768px`. Ajouter un contrôle interdisant toute position de JASPE qui recouvre le panneau actif à la largeur mobile de référence.

- [ ] **Step 2: Construire le panneau commun connexion/OTP**

Utiliser une largeur bornée, des champs de 48 px, une action principale claire, des messages d'erreur proches du champ et une hiérarchie marque/titre/aide cohérente. Réutiliser le DOM actuel ; ne pas dupliquer un second formulaire pour l'OTP.

- [ ] **Step 3: Adapter JASPE aux trois largeurs**

- bureau : zone dédiée à côté du panneau ;
- tablette : zone réduite sans diminuer la lisibilité du formulaire ;
- mobile : espace réservé au-dessus ou en retrait, jamais superposé aux champs.

Respecter `prefers-reduced-motion` et conserver le contrôleur d'intentions existant.

- [ ] **Step 4: Vérifier les parcours essentiels**

Sur 390 × 844 puis 1440 × 900 : saisir l'identifiant et le mot de passe, provoquer une erreur locale, afficher l'étape OTP et revenir en arrière. Expected: aucun déplacement bloquant, aucun débordement horizontal, focus visible, JASPE non bloquante.

- [ ] **Step 5: Lancer les contrôles ciblés**

Run: `npm run test:visual-system`

Run: `npm run test:jaspe-physical`

Expected: PASS pour les deux commandes.

- [ ] **Step 6: Committer connexion/OTP**

```bash
git add app/styles/screens/auth.css app/styles/modules/auth-companion.css app/styles/modules/auth-models.css app/index.html app/qa-responsive-visual-system.cjs
git commit -m "style(auth): apply responsive SchoolSafe login and OTP"
```

Ne pas ajouter `app/index.html` au commit s'il n'a pas changé.

---

### Task 4: Harmoniser le shell et la navigation responsive

**Files:**
- Modify: `app/styles/dashboard.css`
- Modify: `app/index.html` only if ARIA/classes are missing
- Modify: `app/app.js` only for focus/open state
- Modify: `app/qa-responsive-visual-system.cjs`

- [ ] **Step 1: Étendre le contrat de navigation**

Protéger `#workspaceSidebar`, `#workspaceTopbar` et `#workspaceBottomNav`. Vérifier que le bouton du menu expose un état `aria-expanded`, que le panneau est fermable avec Échap et que la navigation active reste identifiable autrement que par la couleur.

- [ ] **Step 2: Corriger le shell bureau**

Mettre en place la barre latérale, la barre supérieure et la zone de contenu avec des largeurs stables. Retirer le flou permanent de la barre latérale/topbar. Le rail droit ne doit réserver de place que lorsqu'il contient du contenu visible.

- [ ] **Step 3: Corriger le shell tablette et mobile**

À 769–1023 px, rendre la barre latérale compacte/repliable. À 768 px et moins, utiliser un panneau mobile accessible et la navigation basse existante. À l'ouverture, placer le focus dans le panneau ; à la fermeture, le rendre au déclencheur.

- [ ] **Step 4: Vérifier clavier et responsive**

Aux largeurs 390, 768 et 1440 px : ouvrir/fermer le menu, parcourir les destinations au clavier, changer de destination et fermer avec Échap. Expected: aucun contenu masqué, destination active lisible, aucun défilement horizontal.

- [ ] **Step 5: Lancer les contrôles et committer**

Run: `npm run test:visual-system`

Run: `node app/qa-safe-assistant-access.cjs`

Expected: PASS.

```bash
git add app/styles/dashboard.css app/index.html app/app.js app/qa-responsive-visual-system.cjs
git commit -m "style(shell): harmonize responsive navigation"
```

N'ajouter que les fichiers réellement modifiés.

---

### Task 5: Harmoniser les tableaux de bord mobile et bureau

**Files:**
- Modify: `app/styles/dashboard.css`
- Modify: `app/index.html` only for non-functional wrappers/classes
- Modify: `app/qa-responsive-visual-system.cjs`

- [ ] **Step 1: Protéger les deux compositions existantes**

Vérifier `#dashboardDesktop` et `#dashboardMobile`, leurs règles d'affichage exclusif et les zones de modules/KPI. Le test doit échouer si les deux compositions deviennent visibles simultanément à la même largeur.

- [ ] **Step 2: Finir le dashboard mobile**

Appliquer l'ordre : salutation/alerte utile, indicateurs essentiels, grille de modules, activité. Deux colonnes jusqu'à 360 px, puis une colonne si le contenu ne tient pas. Ne pas inventer de données absentes.

- [ ] **Step 3: Finir le dashboard bureau/tablette**

Appliquer la composition validée : hero utile, KPI, modules, activité/statistiques et rail droit conditionnel. Réduire la saturation des cartes ; une couleur forte maximum par module.

- [ ] **Step 4: Vérifier contenu réel et débordements**

Sur 390 × 844, 768 × 1024 et 1440 × 900, vérifier textes longs, nombres, badges de notification, états vides et changement de rôle disponible dans les données de démonstration. Expected: pas de texte tronqué essentiel, pas de recouvrement, pas de faux composant non fonctionnel.

- [ ] **Step 5: Lancer les contrôles ciblés**

Run: `npm run test:visual-system`

Run: `npm run test:no-guardian-screen`

Expected: PASS.

Run: `git diff --check`

Expected: aucune sortie.

- [ ] **Step 6: Committer les tableaux de bord**

```bash
git add app/styles/dashboard.css app/index.html app/qa-responsive-visual-system.cjs
git commit -m "style(dashboard): apply approved mobile and desktop direction"
```

---

### Task 6: Vérification finale, documentation et miroir GitHub/local

**Files:**
- Modify: `docs/CURRENT_HANDOFF.md`
- Modify: `docs/DECISIONS.md` only if a new owner-approved durable decision appears

- [ ] **Step 1: Relancer les vérifications fraîches**

Run: `npm run test:visual-system`

Run: `npm run test:jaspe-physical`

Run: `node app/qa-safe-assistant-access.cjs`

Run: `git diff --check`

Expected: toutes les commandes terminent avec code 0 et les scripts affichent PASS.

- [ ] **Step 2: Faire la revue navigateur finale**

Sur `http://127.0.0.1:4176/`, vérifier connexion, OTP, menu, dashboard et navigation aux trois dimensions de référence. Contrôler la console et noter honnêtement tout scénario non vérifié. Ne jamais utiliser le port `4175` comme preuve.

- [ ] **Step 3: Vérifier les dépendances interdites**

Run: `rg -n "react|antd|three(?:\\.js)?|@react-three" package.json package-lock.json app`

Expected: aucune nouvelle dépendance ; les occurrences documentaires éventuelles doivent être expliquées.

- [ ] **Step 4: Mettre à jour le handoff**

Dans `docs/CURRENT_HANDOFF.md`, recopier uniquement les résultats réellement observés, le dernier commit et la prochaine action. Ne pas déclarer la suite complète `npm test` réussie si ses dépendances locales ne sont pas disponibles.

- [ ] **Step 5: Committer la clôture**

```bash
git add docs/CURRENT_HANDOFF.md docs/DECISIONS.md
git commit -m "docs(ui): record responsive visual system verification"
```

N'ajouter `docs/DECISIONS.md` que s'il a réellement changé.

- [ ] **Step 6: Pousser et contrôler le miroir**

Run: `git push origin main`

Run: `git fetch origin`

Run: `git status --porcelain`

Expected: aucune sortie.

Run: `git rev-parse HEAD`

Run: `git rev-parse origin/main`

Expected: les deux identifiants sont strictement identiques.
