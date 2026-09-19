# SchoolSafe Complete Delivery Roadmap

> **STATUT AU 2026-09-14** — Ce plan reste la référence des lots de finition, avec
> deux points remplacés par les décisions du 14/09 (voir `docs/DECISIONS.md` et la
> spec G0) : **(1)** « déploiement sans Docker » → Docker + Coolify organisent les
> services techniques du VPS central (pas de conteneur par école ; isolation par
> `school_id` + PostgreSQL + ACCESS_LAW) ; **(2)** le modèle « 1 école = 1 VPS » →
> un VPS central héberge plusieurs écoles isolées (Control co-hébergé, séparation
> par privilèges). Le lot 12 garde sa logique de release, à traduire en
> exploitation Docker/Coolify lors de son exécution. Règle de conduite ajoutée le
> 14/09 : **VISION LARGE, LIVRAISON ÉTROITE** — le cœur quotidien de la première
> école (Le Sage) prime sur toute extension.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terminer SchoolSafe par lots utilisables, du socle local/GitHub jusqu'au déploiement direct sur VPS, tout en remplaçant les surfaces de démonstration par des données réelles sans affaiblir les permissions ni la protection des enfants.

**Architecture:** Le navigateur HTML/CSS/JavaScript consomme le serveur Fastify/TypeScript, qui applique l'authentification, les permissions et l'isolation par école avant d'accéder à PostgreSQL/Supabase. SchoolSafe Control reste le service central protégé des écoles, licences et impressions. JASPE demeure une assistance 2D/2,5D gouvernée par SchoolSafe ; son Worker Cloudflare est séparé de l'autorité métier.

**Tech Stack:** HTML, CSS, JavaScript navigateur, Fastify 5, TypeScript 5, PostgreSQL/Supabase, tests Node/Vitest/Playwright ciblés, Cloudflare Worker pour JASPE, déploiement Linux direct avec Node.js et service système — sans Docker.

**Spec:** `docs/PROJECT_CONTEXT.md`, `docs/DECISIONS.md`, `docs/superpowers/specs/2026-09-13-schoolsafe-responsive-visual-system-design.md`, `docs/superpowers/specs/2026-09-13-jaspe-physical-controller-design.md`

## Global Constraints

- GitHub `main` et le dépôt local doivent être identiques après chaque lot validé.
- SchoolSafe reste **APP FIRST — JASPE ASSISTED**.
- SchoolSafe Control reste la couche centrale protégée des écoles, licences, supervision et impressions.
- Ne jamais réintroduire de 3D ; JASPE reste 2D/2,5D.
- Ne pas ajouter React, Ant Design ou une seconde application frontale parallèle.
- Ne pas utiliser Docker pour l'exécution locale cible ni pour le VPS.
- Préserver l'isolation par `school_id`, les permissions, les portées de rôle et l'audit serveur.
- Une donnée de démonstration ne doit jamais être présentée comme officielle ni envoyée vers une API réelle.
- Tester obligatoirement les permissions, les enfants, l'argent, l'isolation inter-écoles, les migrations et les contrats critiques ; éviter les suites décoratives répétitives.
- Le VPS ne reçoit aucun changement avant la stabilisation, le commit, le push et la vérification de `origin/main`.
- Chaque lot se termine par un handoff exact, un commit séparé et un contrôle du miroir.

## Définition de « terminé »

SchoolSafe est prêt pour production lorsque les parcours réels d'une école fonctionnent sans mode démonstration : activation, connexion/OTP, création des comptes autorisés, élèves/tuteurs, cartes QR, présence/sécurité, finance, pédagogie, communication/documents, supervision Control et assistance JASPE. Les permissions serveur, l'isolation entre écoles, les sauvegardes, la restauration, la santé du service et le retour arrière VPS doivent avoir des preuves fraîches.

## Ordre obligatoire des lots

```text
0 Baseline
  -> 0A Réparations baseline
  -> 1 Fondations visuelles
  -> 2 Connexion / OTP
  -> 3 Shell / dashboards
  -> 4 École / comptes / rôles
  -> 5 Élèves / familles / cartes QR
  -> 6 Présences / sécurité / sorties
  -> 7 Finance / comptabilité
  -> 8 Pédagogie
  -> 9 Communication / documents / hors-ligne
  -> 10 JASPE espace de travail / Cloudflare
  -> 11 SchoolSafe Control / licences / impression
  -> 12 Release / VPS direct
```

Les lots 5 à 9 peuvent être préparés séparément, mais leur intégration sur `main` reste séquentielle pour éviter que deux comptes modifient simultanément `app/app.js` ou `app/index.html`.

---

### Lot 0: Baseline reproductible et inventaire des écarts

**Files:**
- Create: `docs/BASELINE_REPORT.md`
- Modify: `docs/CURRENT_HANDOFF.md`
- Verify: `package-lock.json`, `server/package-lock.json`, `database/**/manifest.json`

**Produces:** une preuve datée de l'état local, des dépendances, des contrôles exécutables et des surfaces encore en démonstration.

- [ ] Vérifier `git status --short`, `git branch --show-current`, `git rev-parse HEAD` et `git rev-parse origin/main`; arrêter le lot si les commits diffèrent ou si des changements non attribués existent.
- [ ] Installer les dépendances verrouillées avec `npm ci` à la racine et `npm ci --workspace server`; ne pas utiliser Docker ou modifier les versions pendant cette étape.
- [ ] Exécuter `npm run check:migration-versions`, `npm run typecheck`, `npm test`, `npm run test:jaspe-physical` et `npm run test:no-guardian-screen`.
- [ ] Exécuter `rg -n "demo|placeholder|BACKEND_LATER" app server/src --glob "!**/*.min.js" --glob "!app/assets/**"` et classer chaque occurrence dans `docs/BASELINE_REPORT.md` : démonstration autorisée, interface à raccorder, abstraction normale ou blocage réel.
- [ ] Vérifier les manifestes et empreintes des ensembles `baseline`, `auth`, `access`, `license`, `trial` et `projections` avec leurs scripts `generate-manifest.mjs`, sans appliquer de migration.
- [ ] Noter dans le rapport les commandes réussies, échouées ou impossibles ; ne jamais transformer une absence de dépendance en résultat PASS.
- [ ] Committer avec `git commit -m "docs(baseline): record production readiness gaps"` puis pousser et vérifier le miroir.

**Gate:** inventaire complet, aucun changement métier, état Git propre et causes des échecs connues.

---

### Lot 0A: Réparer la baseline avant le design

**Files:**
- Create: `shared/permissions.json`
- Create: `scripts/check-migration-versions.mjs`
- Create: `.gitattributes` only if LF normalization is required after the cross-platform test
- Modify: `database/**/scripts/generate-manifest.mjs`
- Modify: `server/src/native-app.ts`
- Modify: `server/tests/native-app.test.ts`
- Modify: `server/tests/permission-catalog.test.ts`
- Modify: `server/src/school/routes.ts`
- Modify: `server/tests/school.test.ts`
- Modify: `server/package.json`
- Modify: `package-lock.json`
- Modify: `server/package-lock.json`
- Test: `database/baseline/v1/tests/static-contract.test.mjs`

**Produces:** suite serveur et contrats statiques exécutables, manifestes identiques sur Windows/Linux et dépendances critiques corrigées sans changement fonctionnel caché.

- [x] Écrire ou restaurer `shared/permissions.json` à partir des 60 permissions canoniques vérifiées par `12_seed_permissions.sql`, avec `code`, `label` et l'une des sept portées autorisées.
- [x] Faire passer `server/tests/permission-catalog.test.ts` et le test baseline « canonical 60 permissions » sans modifier le seed pour masquer un écart.
- [x] Écrire `scripts/check-migration-versions.mjs` comme contrôle en lecture seule des ordres, versions requises et SHA-256 ; la commande ne doit réécrire aucun manifeste.
- [x] Normaliser explicitement les octets SQL en LF dans les générateurs ou imposer LF aux SQL avec `.gitattributes`, puis prouver que les six ensembles conservent des hashes identiques après régénération.
- [x] Décider dans le code natif que `/config.setup_available` dépend de la présence réelle du token setup et supprimer l'enregistrement des deux anciennes routes `/session/bootstrap` et `/auth/lookup-phone` dans l'application VPS native.
- [x] Faire écrire les tests d'upload dans un répertoire temporaire créé par le test et supprimé dans `finally`.
- [x] Mettre Fastify à une version `>=5.12.4` compatible, mettre à jour la résolution `fast-uri`, puis exécuter l'audit ; ne pas appliquer `npm audit fix --force`.
- [x] Évaluer Vitest 5 par installation verrouillée et suite complète ; conserver une version corrigée compatible si la migration casse le harnais, en documentant le choix sans exposer le risque en production.
- [x] Exécuter `npm run check:migration-versions`, `npm run typecheck`, `npm test`, les six tests statiques SQL, `npm run test:jaspe-physical` et `npm run test:no-guardian-screen`.
- [x] Committer avec `git commit -m "fix(baseline): restore reproducible critical contracts"` puis pousser et vérifier le miroir.

**Gate:** aucun test serveur en échec, catalogue de permissions présent, manifestes reproductibles, aucun upload de test résiduel et vulnérabilité élevée supprimée.

---

### Lot 1: Fondations du design SchoolSafe validé

**Detailed plan:** `docs/superpowers/plans/2026-09-13-schoolsafe-responsive-visual-system.md`, Tasks 1–2.

**Files:**
- Create: `app/qa-responsive-visual-system.cjs`
- Modify: `package.json`
- Modify: `app/styles/design-tokens.css`
- Modify: `app/styles/design-system.css`
- Modify: `app/styles/components.css`

**Produces:** tokens `--ss-*`, contrôles accessibles et surfaces sobres réutilisables par tous les lots suivants.

- [ ] Écrire le contrat statique du design avant les modifications.
- [ ] Ajouter `test:visual-system` au `package.json`.
- [ ] Consolider palette, focus, tailles tactiles, rayons, ombres et espacements dans `design-tokens.css`.
- [ ] Retirer le glassmorphism global, les halos fixes et les `!important` génériques de `design-system.css`.
- [ ] Harmoniser boutons, champs, cartes, badges et contrôles icône dans `components.css`.
- [ ] Exécuter `npm run test:visual-system`, `npm run test:no-guardian-screen` et `git diff --check`.
- [ ] Vérifier visuellement le socle sur 390 × 844, 768 × 1024 et 1440 × 900.
- [ ] Committer avec `git commit -m "style(ui): consolidate SchoolSafe visual foundations"` puis pousser et vérifier le miroir.

**Gate:** composants partagés lisibles, aucun framework/3D ajouté, aucun écran métier refondu prématurément.

---

### Lot 2: Connexion, OTP et récupération de compte

**Detailed plan:** `docs/superpowers/plans/2026-09-13-schoolsafe-responsive-visual-system.md`, Task 3.

**Files:**
- Modify: `app/index.html`
- Modify: `app/app.js`
- Modify: `app/modules/authnative/auth-native.js`
- Modify: `app/styles/screens/auth.css`
- Modify: `app/styles/modules/auth-companion.css`
- Modify: `app/styles/modules/auth-models.css`
- Modify: `server/src/authnative/routes.ts`
- Modify: `server/src/authnative/service.ts`
- Test: `server/tests/authnative-routes.test.ts`
- Test: `server/tests/authnative.test.ts`
- Modify: `app/qa-responsive-visual-system.cjs`

**Consumes:** tokens et composants du lot 1.
**Produces:** parcours connexion/OTP/récupération responsive avec session réelle et erreurs non révélatrices.

- [ ] Écrire les tests serveur pour OTP valide, expiré, réutilisé, limitation de tentatives et absence de fuite « compte existant/inexistant ».
- [ ] Exécuter uniquement les fichiers auth Vitest et constater les échecs attendus avant correction.
- [ ] Corriger les routes/services auth natifs sans modifier les portées de rôle.
- [ ] Raccorder `auth-native.js` et le formulaire existant ; conserver `#loginForm`, `#otpIdentity` et `#otpIdentifier`.
- [ ] Appliquer la composition visuelle validée et maintenir JASPE hors des champs à toutes les largeurs.
- [ ] Vérifier connexion, erreur, OTP, renvoi, retour et récupération sur 390 × 844 et 1440 × 900.
- [ ] Exécuter les tests auth ciblés, `npm run test:visual-system` et `npm run test:jaspe-physical`.
- [ ] Committer avec `git commit -m "feat(auth): finish responsive OTP login flow"` puis pousser et vérifier le miroir.

**Gate:** une session réelle est créée, les protections OTP passent et l'authentification reste utilisable si JASPE échoue.

---

### Lot 3: Shell, navigation et tableaux de bord par rôle

**Detailed plan:** `docs/superpowers/plans/2026-09-13-schoolsafe-responsive-visual-system.md`, Tasks 4–5.

**Files:**
- Modify: `app/index.html`
- Modify: `app/app.js`
- Modify: `app/styles/dashboard.css`
- Modify: `app/modules/pilotage/pilotage-api.js`
- Modify: `app/modules/pilotage/pilotage-module.js`
- Modify: `server/src/pilotage/dashboard/routes.ts`
- Modify: `server/src/pilotage/dashboard/service.ts`
- Test: `server/tests/pilotage.test.ts`
- Modify: `app/qa-dashboard.cjs`
- Modify: `app/qa-responsive-visual-system.cjs`

**Produces:** shell accessible, dashboard mobile/bureau alimenté par les données autorisées du rôle et de l'école.

- [ ] Écrire les tests de projection du dashboard pour direction, enseignant, parent, finance et gardien, y compris refus d'une autre école.
- [ ] Corriger la projection serveur pour ne retourner que les KPI et actions autorisés.
- [ ] Raccorder `pilotage-api.js` au dashboard réel ; afficher explicitement vide/indisponible au lieu d'inventer un KPI.
- [ ] Finaliser sidebar, topbar, menu mobile, navigation basse, focus restitué et fermeture avec Échap.
- [ ] Finaliser les compositions `#dashboardDesktop` et `#dashboardMobile` selon la référence validée.
- [ ] Exécuter le test pilotage ciblé, `node app/qa-dashboard.cjs`, `npm run test:visual-system` et `node app/qa-safe-assistant-access.cjs`.
- [ ] Vérifier cinq rôles aux trois largeurs sans débordement horizontal.
- [ ] Committer avec `git commit -m "feat(dashboard): deliver role-scoped responsive workspace"` puis pousser et vérifier le miroir.

**Gate:** aucun rôle ne voit un module ou KPI non autorisé et aucun chiffre fictif n'apparaît en session réelle.

---

### Lot 4: Création d'école, comptes, rôles et année scolaire

**Files:**
- Modify: `app/app.js`
- Modify: `app/modules/school/academic-structure-demo.js`
- Modify: `app/modules/administration/administration-demo.js`
- Modify: `app/styles/screens/setup.css`
- Modify: `server/src/setup/routes.ts`
- Modify: `server/src/setup/service.ts`
- Modify: `server/src/bootstrap/routes.ts`
- Modify: `server/src/bootstrap/service.ts`
- Modify: `server/src/access/service.ts`
- Test: `server/tests/setup.test.ts`
- Test: `server/tests/bootstrap.test.ts`
- Test: `server/tests/access-guard.test.ts`
- Test: `database/access/v1/tests/isolation-inter-schools.test.sql`

**Produces:** école activée, identité/configuration enregistrée, structure académique, administrateur initial et rôles bornés à l'école.

- [ ] Écrire les cas setup idempotent, token invalide, école déjà activée, admin hors école et rejeu de provisioning.
- [ ] Exécuter les tests setup/bootstrap/access ciblés et constater les cas manquants.
- [ ] Corriger le service de bootstrap avec transaction, audit et clés d'idempotence existantes.
- [ ] Raccorder les écrans setup et structure académique aux routes réelles ; le suffixe `-demo.js` peut rester temporairement dans le nom de fichier mais aucun enregistrement réel ne doit utiliser l'adaptateur démo.
- [ ] Vérifier création d'année, cycles, niveaux, classes, matières, compte initial et réouverture de session.
- [ ] Exécuter les tests serveur ciblés et le test SQL d'isolation inter-écoles dans l'environnement de base prévu.
- [ ] Committer avec `git commit -m "feat(setup): finish school provisioning and role setup"` puis pousser et vérifier le miroir.

**Gate:** une école peut démarrer sans intervention SQL manuelle et ne peut jamais voir/configurer une autre école.

---

### Lot 5: Élèves, tuteurs et cartes QR SchoolSafe Pass

**Files:**
- Modify: `app/modules/school/school-api.js`
- Modify: `app/modules/school/school-native-api.js`
- Modify: `app/modules/school/student-lifecycle-demo.js`
- Modify: `app/modules/school/student-family-demo.js`
- Modify: `app/modules/school/student-dossier-demo.js`
- Modify: `app/modules/school/student-card-preparation-demo.js`
- Modify: `app/modules/cards/cards-module.js`
- Modify: `app/modules/cards/cards-native-api.js`
- Modify: `server/src/students/routes.ts`
- Modify: `server/src/students/service.ts`
- Modify: `server/src/cards/routes.ts`
- Modify: `server/src/cards/service.ts`
- Test: `server/tests/students.test.ts`
- Test: `server/tests/students-service.test.ts`
- Test: `server/tests/cards.test.ts`
- Test: `database/access/v1/tests/isolation-inter-schools.test.sql`

**Produces:** dossier élève réel, lien tuteur `school.guardian`, inscription/classe et carte QR révocable sans données sensibles dans le QR.

- [ ] Écrire les tests enfant/tuteur : création, doublon, transfert, archivage, accès parent uniquement à ses enfants et refus inter-écoles.
- [ ] Écrire les tests carte : préparation, émission, immutabilité, révocation, réémission et résolution d'un identifiant opaque.
- [ ] Corriger services/routes étudiants et cartes avec audit, transaction et contrôle de portée côté serveur.
- [ ] Raccorder les écrans existants aux API natives ; conserver une bannière explicite si le mode démonstration est choisi volontairement.
- [ ] Vérifier qu'aucun nom, date de naissance ou contact n'est encodé directement dans le QR.
- [ ] Exécuter les tests étudiants/cartes ciblés, le test SQL d'isolation et les contrôles front des cartes.
- [ ] Committer avec `git commit -m "feat(students): finish guardian records and QR cards"` puis pousser et vérifier le miroir.

**Gate:** SchoolSafe Pass produit une carte traçable/révocable et un parent ne consulte que ses propres enfants.

---

### Lot 6: Présences, sécurité et sortie sécurisée

**Files:**
- Modify: `app/modules/security/security-api.js`
- Modify: `app/modules/security/security-module.js`
- Modify: `app/modules/security/guard-security-demo.js`
- Modify: `app/modules/school/student-verification-demo.js`
- Modify: `app/modules/school/student-pickup-demo.js`
- Modify: `server/src/security/routes.ts`
- Modify: `server/src/security/service.ts`
- Modify: `server/src/events/service.ts`
- Test: `server/tests/security.test.ts`
- Test: `server/tests/security-service.test.ts`
- Test: `server/tests/events/service.test.ts`
- Test: `server/tests/access-guard.test.ts`

**Produces:** scan entrée/sortie, présence, anomalie, autorisation de récupération et historique audité.

- [ ] Écrire les cas QR actif/révoqué/inconnu, double scan, mauvais portail, utilisateur non assigné et enfant d'une autre école.
- [ ] Écrire les cas sortie autorisée, refusée, expirée et validation humaine obligatoire.
- [ ] Corriger le service pour rendre les événements idempotents et conserver heure, portail, acteur et décision.
- [ ] Raccorder scanner, présence et pickup aux API réelles ; la panne réseau doit afficher « à synchroniser » sans fabriquer une autorisation.
- [ ] Vérifier le parcours complet carte → arrivée → présence → personne autorisée → sortie.
- [ ] Exécuter uniquement les tests sécurité/events/access concernés.
- [ ] Committer avec `git commit -m "feat(security): finish attendance and secure pickup"` puis pousser et vérifier le miroir.

**Gate:** aucune sortie n'est approuvée par JASPE ou par un cache local seul ; la décision humaine et l'audit restent obligatoires.

---

### Lot 7: Finance, caisse, reçus et comptabilité

**Files:**
- Modify: `app/modules/finance/finance-api.js`
- Modify: `app/modules/finance/finance-module.js`
- Modify: `app/modules/finance/fee-control-module.js`
- Modify: `app/modules/accounting/accounting-treasury-demo.js`
- Modify: `server/src/finance/payments/routes.ts`
- Modify: `server/src/finance/payments/service.ts`
- Modify: `server/src/finance/reports/routes.ts`
- Modify: `server/src/finance/reports/service.ts`
- Modify: `server/src/finance/control/routes.ts`
- Modify: `server/src/finance/control/service.ts`
- Test: `server/tests/finance-payments.test.ts`
- Test: `server/tests/finance-reports.test.ts`
- Test: `server/tests/finance-control.test.ts`
- Test: `database/access/v1/tests/fee-control.test.sql`

**Produces:** frais, paiements, caisse, reçus et rapports réels, séparés par devise et protégés par permissions.

- [ ] Écrire les cas idempotence paiement, annulation avec motif, reçu unique, fermeture de caisse, exonération, CDF/USD séparés et refus inter-écoles.
- [ ] Corriger les services finance avec montants entiers/minor units, transactions et audit ; ne jamais additionner CDF et USD.
- [ ] Raccorder les surfaces finance et contrôle aux API réelles ; conserver les actions sensibles côté serveur.
- [ ] Produire les reçus via le moteur documentaire avec identité de l'école, numéro stable et statut officiel/non officiel explicite.
- [ ] Exécuter les trois fichiers Vitest finance, le test SQL fee-control et les scripts `app/qa-finance-*.cjs` concernés par les fichiers modifiés.
- [ ] Committer avec `git commit -m "feat(finance): finish payments receipts and controls"` puis pousser et vérifier le miroir.

**Gate:** aucun double paiement, aucun mélange de devises, aucune annulation silencieuse et aucune lecture finance sans permission.

---

### Lot 8: Pédagogie, notes, moyennes et palmarès

**Files:**
- Modify: `app/modules/pedagogy/pedagogy-api.js`
- Modify: `app/modules/pedagogy/pedagogy-module.js`
- Modify: `app/modules/pedagogy/teacher-pedagogy-demo.js`
- Modify: `app/modules/pedagogy/palmares-api.js`
- Modify: `app/modules/pedagogy/palmares-module.js`
- Modify: `server/src/pedagogy/routes.ts`
- Modify: `server/src/pedagogy/service.ts`
- Modify: `server/src/pedagogy/averages.ts`
- Modify: `server/src/pedagogy/rankings/service.ts`
- Test: `server/tests/pedagogy-averages.test.ts`
- Test: `server/tests/rankings-service.test.ts`
- Test: `server/tests/pedagogy.test.ts`

**Produces:** matières, devoirs, notes, publication, moyennes et classement avec règles explicites et accès borné.

- [ ] Verrouiller par tests les barèmes, coefficients, absences, arrondis, publication et correction après publication avec motif.
- [ ] Tester enseignant limité à ses classes/matières, parent limité à ses enfants et refus inter-écoles.
- [ ] Corriger calculs et routes avant de raccorder les écrans démonstration aux données réelles.
- [ ] Étiqueter tout palmarès non publié comme aperçu ; empêcher JASPE de modifier une note ou de publier un classement.
- [ ] Vérifier le parcours devoir → saisie → publication → vue parent → moyenne → palmarès.
- [ ] Exécuter les tests pédagogie/moyennes/rankings ciblés.
- [ ] Committer avec `git commit -m "feat(pedagogy): finish grades averages and rankings"` puis pousser et vérifier le miroir.

**Gate:** les calculs sont déterministes, testés et visibles seulement par les bonnes portées.

---

### Lot 9: Communication, notifications, documents et hors-ligne

**Files:**
- Modify: `app/modules/communication/communication-demo.js`
- Modify: `app/modules/document-center/document-center.js`
- Modify: `app/modules/document-center/document-actions-runtime.js`
- Modify: `app/modules/document-engine/frontend-renderer.js`
- Modify: `app/offline-sync.js`
- Modify: `app/sw.js`
- Modify: `server/src/notifications/service.ts`
- Modify: `server/src/notifications/dispatcher.ts`
- Modify: `server/src/email/service.ts`
- Modify: `server/src/storage/r2.ts`
- Test: `server/tests/notifications/service.test.ts`
- Test: `server/tests/notifications/dispatcher.test.ts`
- Test: `server/tests/email.test.ts`
- Modify: `app/qa-pwa.cjs`

**Produces:** messages et documents réels, notifications contrôlées, fichiers stockés et synchronisation hors-ligne sûre.

- [ ] Tester destinataires autorisés, préférence de canal, échec fournisseur, nouvelle tentative bornée et absence de données sensibles dans les journaux.
- [ ] Remplacer le faux export XLSX de `frontend-renderer.js` par un export explicitement CSV si aucun moteur XLSX réel n'est ajouté ; ne jamais livrer un fichier CSV portant l'extension `.xlsx`.
- [ ] Raccorder communication, documents, e-mail et stockage aux services réels avec taille/type de fichier validés côté serveur.
- [ ] Tester la file hors-ligne : école courante obligatoire, démo séparée, rejeu idempotent, conflit visible et aucune autorisation de sortie mise en cache.
- [ ] Vérifier message direction-parent, document élève, reçu, notification in-app et reprise après coupure.
- [ ] Exécuter les tests notifications/e-mail et `node app/qa-pwa.cjs`.
- [ ] Committer avec `git commit -m "feat(communication): finish documents notifications and safe sync"` puis pousser et vérifier le miroir.

**Gate:** aucun message inter-écoles, aucun fichier mal étiqueté, aucun rejeu double et aucune décision de sécurité hors-ligne.

---

### Lot 10: JASPE dans l'espace de travail et Cloudflare

**Files:**
- Modify: `app/modules/safe/safe-assistant.js`
- Modify: `app/modules/safe/jaspe-capability-router.js`
- Modify: `app/modules/safe/jaspe-governance.js`
- Modify: `app/modules/jaspe2d/jaspe2d.js`
- Modify: `app/modules/jaspe2d/presentation-controller.js`
- Modify: `app/index.html`
- Modify: `worker-jaspe/src/index.ts`
- Modify: `server/src/jaspenative/routes.ts`
- Modify: `server/src/jaspenative/service.ts`
- Test: `server/tests/jaspenative.test.ts`
- Modify: `app/qa-safe-assistant-access.cjs`
- Modify: `app/qa-jaspe-physical-contract.cjs`

**Produces:** assistant texte borné par capacités dans l'espace de travail, avec physique 2D/2,5D réutilisé et aucune autorité supplémentaire.

- [ ] Écrire les cas autorisé/refusé par rôle, données d'un autre enfant/école, action inconnue, Worker indisponible et réponse non conforme.
- [ ] Charger l'assistant seulement dans l'espace authentifié et lui transmettre une projection minimale déjà autorisée par le serveur.
- [ ] Faire passer toute action par `jaspe-capability-router.js`; une sortie du modèle ne doit jamais exécuter directement code, HTML, SQL ou nom d'animation.
- [ ] Monter le contrôleur physique existant en buste/avatar sans dupliquer le moteur ni charger les 42,8 Mo v12 sur un appareil qui utilise le repli WebP.
- [ ] Conserver la voix et la synchronisation labiale désactivées tant que le fournisseur, le coût, la confidentialité et le consentement ne sont pas validés séparément.
- [ ] Exécuter `npm run test:jaspe-physical`, `node app/qa-safe-assistant-access.cjs` et le test serveur JASPE.
- [ ] Committer avec `git commit -m "feat(jaspe): add governed workspace assistant"` puis pousser et vérifier le miroir.

**Gate:** JASPE répond utilement mais ne peut ni élargir une permission, ni valider un paiement, une sortie, une note ou une licence.

---

### Lot 11: SchoolSafe Control, licences et impression contrôlée

**Files:**
- Modify: `server/src/control-app/client.ts`
- Modify: `server/src/licensenative/control-client.ts`
- Modify: `server/src/licensenative/license.ts`
- Modify: `server/src/licensenative/service.ts`
- Modify: `server/src/controlprintnative/routes.ts`
- Modify: `server/src/controlprintnative/service.ts`
- Test: `server/tests/licensenative.test.ts`
- Test: `server/tests/integration.test.ts`
- Test: `database/license/v1/tests/license-static.test.mjs`

**Produces:** activation et statut des écoles, licence dégradée de manière sûre, supervision et demandes d'impression auditées.

- [ ] Tester licence active, expirée, suspendue, serveur Control indisponible, cache signé expiré et tentative d'une autre école.
- [ ] Tester impression demandée, approuvée, refusée, rejouée et auditée ; aucune approbation ne vient du navigateur ou de JASPE.
- [ ] Corriger les clients/services avec timeouts, idempotence et politique de repli définie par l'état de licence.
- [ ] Vérifier que la panne de Control n'efface aucune école et n'accorde aucune nouvelle autorité.
- [ ] Exécuter les tests licence/intégration et le contrat statique de licence.
- [ ] Committer avec `git commit -m "feat(control): harden licensing and controlled printing"` puis pousser et vérifier le miroir.

**Gate:** les écoles inscrites restent gérées centralement et aucune licence/impression ne peut être falsifiée côté client.

---

### Lot 12: Release candidate et déploiement VPS direct sans Docker

**Files:**
- Create: `ops/systemd/schoolsafe.service`
- Create: `ops/nginx/schoolsafe.conf`
- Create: `ops/deploy/release.ps1`
- Create: `ops/deploy/rollback.md`
- Create: `ops/runbooks/backup-restore.md`
- Create: `docs/RELEASE_CHECKLIST.md`
- Modify: `server/src/health/readiness.ts`
- Modify: `docs/CURRENT_HANDOFF.md`

**Produces:** release reproductible, service direct Node.js, proxy TLS, sauvegarde/restauration et retour arrière documenté.

- [ ] Geler un commit candidat sur GitHub et vérifier localement `npm ci`, typecheck, build, tests critiques, contrats SQL et revue navigateur des parcours essentiels.
- [ ] Auditer le VPS en lecture seule : distribution, Node.js, utilisateur de service, ports, proxy existant, chemins, espace disque, PostgreSQL, certificats et services actifs. Enregistrer les valeurs réelles dans `docs/RELEASE_CHECKLIST.md` avant toute écriture.
- [ ] Générer `schoolsafe.service` avec l'utilisateur non-root et le chemin réel observés ; charger les secrets depuis un fichier d'environnement hors dépôt.
- [ ] Générer la configuration Nginx avec le domaine et le port réels observés, limite d'upload cohérente avec Fastify et en-têtes proxy requis.
- [ ] Préparer la release dans un nouveau répertoire versionné, exécuter `npm ci --omit=dev`, construire le serveur, puis basculer un lien `current` uniquement après `/health` et `/ready` réussis.
- [ ] Sauvegarder la base et les fichiers avant migration ; exécuter les migrations dans l'ordre des manifestes vérifiés ; tester une restauration sur une cible non-production avant la bascule.
- [ ] Conserver la release précédente et documenter le retour arrière : arrêter le service, repointer `current`, restaurer seulement si la migration l'exige, redémarrer, vérifier santé et journaux.
- [ ] Ne pas lancer `docker build`, `docker compose` ou le `Dockerfile` existant. Le supprimer du dépôt uniquement après une validation explicite séparée du propriétaire ; sinon le laisser inactif.
- [ ] Après bascule, vérifier connexion/OTP, école, élève/carte, présence/sortie, paiement/reçu, note parent, notification, Control et JASPE avec des comptes de validation dédiés.
- [ ] Mettre à jour `docs/CURRENT_HANDOFF.md`, taguer la release, pousser le tag et confirmer que GitHub/local/VPS utilisent le même commit.

**Gate:** santé et readiness vertes, sauvegarde/restauration prouvées, secrets hors Git, service non-root, HTTPS actif et rollback exécutable.

## Contrôles finaux obligatoires

- `git status --short` ne produit aucune ligne.
- `git rev-parse HEAD` est identique à `git rev-parse origin/main`.
- Le commit VPS est identique au commit GitHub tagué.
- Les parcours critiques réels sont vérifiés sans données de démonstration.
- Les tests permissions/enfants/argent/isolation/migrations passent avec résultats consignés.
- Aucun React, Ant Design, moteur 3D ou déploiement Docker n'a été ajouté.
- Toute limite non vérifiée est écrite dans `docs/CURRENT_HANDOFF.md` avant l'annonce de fin.
