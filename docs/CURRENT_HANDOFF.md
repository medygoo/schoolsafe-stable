# Handoff courant SchoolSafe

## 19 septembre 2026 — base de développement validée, publication autorisée

- Propriétaire : préparation locale validée comme **base de développement**.
  Codex publie les **772 fichiers**, uniquement vers `medygoo/schoolsafe-stable`,
  branche **`develop/codex-base`**. Cette instruction remplace l'ancien arrêt
  avant push et le choix préparatoire de `main` ; leur historique reste ci-dessous.
- Base source : `841d3efc54e7af62250b2980e450aa20ba5f2d40` ; nouveau dépôt sans
  reprise de son historique Git. JASPE complète, usine de cartes complète,
  ACCESS_LAW, auth, `school_id`, migrations, contrats et tests conservés.
  Les 14 exclusions restent appliquées ; aucun secret, journal ou donnée d'école
  n'est à ajouter. Scan et empreintes à vérifier avant indexation/publication.
- **Défauts SQL ouverts :** `02_student_list.sql` échoue avec 42P13 ; le setup
  échoue avec 42501/RLS profiles et requiert encore la qualification des rôles,
  du `school_id` et du provisioning. `03_auth_reset.sql` reste hors manifeste
  auth, enregistré comme non qualifié. Aucun historique SQL réécrit ni RLS affaibli.
- **Docker réel non validé :** compilation locale et simulation npm réussies,
  mais aucun build Linux ni démarrage de conteneur, moteur Docker indisponible.
  Les deux alertes statiques préexistantes (DeviceHub : 2 permissions ; isolation :
  20 détections Cards/DeviceHub/Family) restent ouvertes. Ni A5 complet, ni toute
  l'application, ni la production ne sont déclarés validés.
- **Limite du mandat :** aucun push sur `main`, déploiement, changement VPS,
  migration de production, correction métier ou opération Control. Avant push,
  respecter l'absence de déploiement automatique ; ne pas la déduire du seul
  nom de branche. Aucun contournement d'accès ni modification des protections.
- **Preuve de sélection avant commit :** 772 chemins indexés, aucune différence
  d'octets avec la copie validée ; 14 exclusions maintenues. Le contrôle de
  mise en forme relève 33 alertes préexistantes, comparées aux mêmes lignes
  du commit source ; elles ne sont ni corrigées ni masquées dans ce mandat.
- **Clôture :** vérifier `refs/heads/develop/codex-base` avec `git ls-remote`,
  comparer son SHA à HEAD, confirmer son existence au propriétaire, puis arrêter.
  Un commit local ne constitue pas une preuve de push ; le SHA de publication
  se lit dans Git. Pour Bolt ensuite, attendre un lot distinct pour les défauts
  SQL/Docker documentés ; Control doit provenir de sa source existante.

## Historique — préparation locale validée par le propriétaire

## 19 septembre 2026 — préparation finale Stable, copie locale pour revue

- Codex, `main`, HEAD source conservé `841d3efc54e7af62250b2980e450aa20ba5f2d40`.
  Distant source relu `62df2b16ceca2e609c1789eba44afbe6fe278e19`. Aucun commit,
  push, déploiement, VPS ou base réelle. Modifications locales antérieures préservées.
- Livrable : [sélection finale, commandes et limites](migration/2026-09-19-stable-preparation/README.md).
  Cible locale `.migration-staging/schoolsafe-stable/`, branche neuve `main`,
  origine `medygoo/schoolsafe-stable`, aucun historique Git source copié.
  **772 chemins sélectionnés** : 747 sources/archives et 25 livrables de
  migration/tests ; 14 exclusions, dont six portraits sans preuve d'usage.
- JASPE et usine de cartes conservés intégralement. Adaptations de copie seules :
  références décoratives des portraits dans app.js/index, exclusions gitignore.
  Source applicative, SQL historiques, permissions et fournisseurs inchangés.
- Corrections source : AGENTS (Docker + Coolify actif, historique conservé),
  Dockerfile (layout et verrou workspace), dockerignore/shared, gitignore du
  staging ; registre d'installation exhaustif + vérification/tests et documents.
- Preuves : 7 tests conditionnement/manifestes/scanner ; 39 + 13 assertions A5.1,
  5 tests JASPE + contrat, 5 contrats cartes PASS. Compilation structure Docker et
  simulation npm ci PASS ; **pas de build Linux**, moteur Docker indisponible.
  Navigateur 1440/390 sur les octets sélectionnés PASS pour connexion/JASPE/assets,
  `/config` substitué ; pas de session métier réelle dans cette recette.
- PostgreSQL 17.11 synthétique local `schoolsafe_access_test_919`, port 55432 :
  27 unités du socle installées, 08 dernière. Deux blocages historiques reproduits
  (42P13 student_list ; 42501 RLS profiles au setup), puis ROLLBACK ; zéro école/
  identité, aucune fonction setup persistée. Base conservée ; rien en production.
- Registre : 43 unités manifestées + deux SQL bloqués + `auth/03_auth_reset.sql`
  non qualifié = 46. Pas d'installation globale déclarée. Préflight installable
  volontairement en échec ; migrations additives et preuves nécessaires dans
  des lots distincts, sans affaiblir RLS ni modifier l'historique.
- Scan local de la sélection et revue des candidats, valeurs non affichées ;
  empreintes et exclusions dans le manifeste final. Ce n'est pas un certificat
  exhaustif ni Gitleaks. Images/provenance et erreurs exactes documentées.
- **Deux alertes préexistantes maintenues** : deux permissions DeviceHub non
  canoniques et 20 détections inter-écoles Cards/DeviceHub/Family. Aucun masquage.
  A5 complet, R2/Control, JASPE distant et application complète restent non validés.
- **Prochaine tâche pour Bolt :** relire ce livrable, vérifier la copie avec
  `verify-stable.mjs`, faire arbitrer les lots additifs École/setup/auth et exécuter
  le build Docker quand le moteur sera disponible. **Aucun push sans nouvelle
  autorisation et preuve d'absence d'autodéploiement.** Pour Control, obtenir la
  source exacte puis suivre le plan séparé ; ne pas le recréer depuis cet arbre.

## Historique — prise de la préparation finale, remplacée par le bilan ci-dessus

## 19 septembre 2026 — préparation finale Stable en cours

- Codex, `main`, base locale `841d3efc54e7af62250b2980e450aa20ba5f2d40` ;
  distant lu sans fetch : `62df2b16ceca2e609c1789eba44afbe6fe278e19`.
- Le propriétaire valide le manifeste et autorise la préparation locale de
  SchoolSafe Stable, les seules corrections de conditionnement/installation,
  la revue des six images de connexion et le scan final. Aucun push/déploiement.
- Périmètre réservé : AGENTS, Dockerfile/.dockerignore/.gitignore, mécanisme
  d'installation, tests ciblés, documents de migration/continuité et copie
  isolée `.migration-staging/schoolsafe-stable/`. Aucun historique SQL réécrit,
  aucun correctif Device Hub/famille/cartes hors migration. JASPE/cartes conservés.
- Control : plan séparé de récupération de sa source existante ; ne pas
  reconstruire Control depuis les adaptateurs de cet arbre.
- Les modifications documentaires précédentes sont conservées. L'attente de
  validation du manifeste ci-dessous est remplacée par ce mandat ; les réserves
  sur les images restent à résoudre ou conduiront à leur exclusion de la copie.

## Historique — arbitrage du manifeste validé par le propriétaire

## 19 septembre 2026 — arbitrage préparé, arrêt pour validation

- Codex, `main`, HEAD `841d3efc54e7af62250b2980e450aa20ba5f2d40` inchangé.
  Aucune copie vers un nouveau dépôt, suppression, fusion, migration, commit,
  push ou déploiement. Modifications documentaires uniquement.
- Les 23 lignes À REVOIR ont chacune rôle, motif, destination proposée et
  risques dans le [manifeste](migration/2026-09-19-base-stable/README.md).
  CSV/JSON portent désormais une destination exclusive : **737 SCHOOLSAFE,
  0 CONTROL, 16 ARCHIVE, 8 EXCLURE = 761** ; **six documents séparés**.
  Les 761 comprennent 756 fichiers suivis et cinq locaux. Les adaptateurs
  Control restent dans SchoolSafe ; aucun code Control autonome n'est présent.
- Conservation revérifiée : JASPE complète, usine cartes, IAM/ACCESS_LAW,
  auth, school_id, 43 unités SQL, contrats et tests. 75 entrées JASPE aux
  hashes conformes ; dépendances statiques retenues. Aucun test fonctionnel
  ou PostgreSQL nouveau et aucune validation globale de l'application.
- Confidentialité : quatre contenus privés exclus sans lecture ; aucun motif
  de secret trouvé dans 566 fichiers texte candidats. Gitleaks indisponible.
  Ce contrôle ne certifie pas les images ni tous les formats de secrets.
  La provenance des six illustrations `app/login-kid-*.jpg` reste à vérifier
  avant copie ; aucune donnée sensible supposée ou publiée.
- **Prochaine action : attendre la validation du propriétaire sur l'arbitrage
  et lever la réserve de confidentialité avant toute mission de copie.**
  Les deux alertes statiques restent actives. Aucune reprise automatique du
  push A5.1 ni fusion du worktree distinct.

## Historique — préparation du manifeste

## 19 septembre 2026 — mission courante : manifeste de la base stable

- Codex, `main`, base locale `841d3efc54e7af62250b2980e450aa20ba5f2d40`.
  Ce commit contient A5.1 ; distant relu sans modification :
  `62df2b16ceca2e609c1789eba44afbe6fe278e19`. Aucun changement local au départ.
- Nouveau mandat : inventorier les fichiers et dépendances pour un nouveau
  dépôt stable ; aucune suppression, migration, fusion, publication ou opération
  de déploiement. L'ancienne prochaine action de publication est suspendue.
- Périmètre documentaire réservé : `docs/migration/2026-09-19-base-stable/`,
  ce handoff et le plan actif. Aucun code, asset, permission, SQL ou manifeste
  de migration SQL à modifier. Les cartes et JASPE sont à conserver intégralement.
- Source principale : arbre actuel de `main`. Le worktree distinct
  `work/canonical-access-law` et son plan local sont signalés en annexe pour
  revue séparée ; aucun remplacement de la base actuelle par cet arbre.
- Livrable et reprise : consulter
  [le manifeste de base stable](migration/2026-09-19-base-stable/README.md).
  **MANIFESTE PRÉPARÉ** : 761 fichiers, dont 756 suivis ; 753 proposés à copie
  identique + six livrables documentaires. Classement : 718 conservés,
  18 archivés, 23 à revoir, deux sondes obsolètes. Rien supprimé ni copié
  vers un autre dépôt. Les quatre fichiers réservés à une revue privée ne
  sont pas consultés ; les deux doublons PNG sont couverts par les références.
- Vérifications documentaires : exhaustivité des fichiers suivis, 757 empreintes,
  75 entrées de manifestes JASPE et 60 PNG de patrimoine ; 984 références
  statiques résolues ; intégrité des migrations **12 ensembles / 43 unités PASS**.
  Aucun nouveau test PostgreSQL, HTTP/UI, audio, R2 ou Control dans cette mission.
  Aucun code applicatif, asset, SQL ou manifeste SQL modifié.
- Prochaine tâche exacte : relire les 23 lignes À REVOIR et l'annexe du worktree,
  arbitrer les candidats distincts sans remplacer `main`, puis figer la sélection
  avant toute nouvelle autorisation de migration. Le worktree ne remplace pas
  les composants JASPE/A5.1 récents. Aucune migration n'est autorisée ici.
  L'inventaire est une préparation, pas une validation fonctionnelle globale.
  Les deux alertes statiques préexistantes A5.1 restent actives et hors mission.

## Historique — livraison locale A5.1, remplacée par le mandat d'inventaire

## 19 septembre 2026 — revue finale A5.1 achevée, publication suspendue

- Codex, branche `main`, commit de départ
  `62df2b16ceca2e609c1789eba44afbe6fe278e19`. Revue limitée au lot A5.1 et
  à son complément : aucun défaut bloquant restant identifié. Le propriétaire
  autorise désormais le commit local du lot et un push seulement si l'absence
  de déploiement automatique est garantie. Les interdictions antérieures de
  commit ci-dessous sont historiques, remplacées par ce mandat.
- Corrections terminées : conservation et validation prudente de `deniedRules`
  à la connexion/actualisation, sept contrôles locaux raccordés, projection
  additive 08 et manifestes ; DENY `school`/`none` général même avec cible
  renseignée. Conditions, dates, isolation école et conjonction classe/matière
  préservées. Moteur SQL et migrations historiques intacts ; serveur et
  ACCESS_LAW restent l'autorité.
- Preuves du complément : **39/39 frontend, 36/36 SQL A5.1, 47/47 SQL A5.0,
  huit combinaisons HTTP/session/interface et révocations PASS** sur la seule
  base synthétique locale 519. Dernière revue : frontend 39/39, manifestes 2/2
  et contrôle du diff rejoués avec succès ; SQL/navigateur non rejoués pendant
  cette dernière revue. [Preuve et limites](superpowers/specs/2026-09-19-a51-denial-contract.md).
- Distant effectivement lu par `git ls-remote --heads origin main` :
  **`refs/heads/main` = `62df2b16ceca2e609c1789eba44afbe6fe278e19`**, identique
  au départ local ; aucun changement distant à intégrer. Le SHA du commit
  local A5.1 se lit dans Git, pas dans son propre contenu.
- **Push suspendu, aucun déploiement :** le dépôt décrit Coolify sans donner
  son réglage effectif de déploiement automatique. L'absence de `.github`
  ne garantit pas l'absence de webhook/application GitHub. Les lectures des
  workflows et hooks par `gh api` échouent faute d'authentification CLI.
  Aucun accès VPS, changement de configuration, migration de production,
  désactivation de hook ou contournement par marqueur de commit.
- **Deux alertes préexistantes, actives et hors lot :** contrôle de permissions
  (`school.settings.manage`, deux occurrences dans DeviceHub) et contrôle
  statique inter-écoles (20 détections Cards/DeviceHub/Family). Leur antériorité
  est établie contre le commit de départ ; aucun contrôle désactivé ou masqué.
- **Prochaine tâche exacte pour Bolt :** reprendre ce commit A5.1 local,
  vérifier en lecture autorisée la configuration effective GitHub/Coolify
  susceptible de déclencher un déploiement au push. Si cette absence est
  prouvée, recontrôler le SHA distant et publier le seul commit A5.1 sans force
  push ; sinon maintenir la suspension. Ne pas modifier les intégrations pour
  contourner cette condition. Ensuite, réserver séparément le traitement des
  deux alertes statiques : vérifier la permission DeviceHub contre le catalogue
  canonique puis les 20 requêtes et leurs gardes `school_id`, sans suppression
  des contrôles. Aucun éditeur complet d'exceptions ni nouvel audit général.
- Le lot ciblé a ses preuves locales ; **ni A5 complet, ni toute l'application,
  ni la production ne sont déclarés validés**. Historique conservé ci-dessous.

## Historique — bilan résiduel avant autorisation du commit local

## 19 septembre 2026 — défaut résiduel A5.1 corrigé et vérifié localement

- Codex, `main`, HEAD `62df2b16ceca2e609c1789eba44afbe6fe278e19` conservé.
  Toutes les modifications locales antérieures sont préservées. Aucun commit,
  push, déploiement, VPS ou accès à une base réelle.
- Défaut revu : `target` renseigné transformait à tort les DENY `school`/`none`
  en refus ciblés. Correction limitée à `app/modules/core/access.js` et à
  l'unité locale `08_session_denial_contract.sql`, alignées sur le moteur SQL
  existant. Conditions, dates, école active et conjonction classe/matière
  conservées ; moteur SQL et unités historiques 05/07 inchangés.
- Régressions écrites **avant correction** : huit combinaisons
  rôle/exception × school/none × cible nulle/renseignée. Quatre échecs frontend
  et quatre échecs SQL constatés exclusivement pour les cibles renseignées.
  Après correction : **39/39 frontend**, **36/36 SQL A5.1**, **47/47 SQL A5.0**,
  **huit parcours HTTP/session/interface et leurs révocations PASS**.
- Base exclusivement synthétique `schoolsafe_access_test_519`,
  `127.0.0.1:55432`. 08 appliquée après contrôle de l'absence de fixtures ;
  aucun rejeu de 05. Manifestes régénérés : **2 tests PASS, 12 ensembles/43 unités**.
  Treize assertions de helpers et vérifications syntaxiques PASS.
- Nettoyage vérifié : **zéro école, zéro identité**, projection 08 corrigée
  toujours installée. API, Chrome et aperçu de recette fermés. PostgreSQL
  préexistant laissé intact ; `git diff --check` PASS et HEAD inchangé.
- Preuve détaillée, fichiers et commandes :
  [complément après revue finale](superpowers/specs/2026-09-19-a51-denial-contract.md).
  Le bilan initial ci-dessous reste historique ; sa clôture sans réserve avait
  été remplacée par le constat du défaut résiduel, maintenant traité.
- **Non rejoués ici :** A2/A3, suites serveur/TypeScript, QA mobile substituée,
  recette complète de chaque écran métier, production et mise à jour PWA
  déployée. Les validations historiques ne deviennent pas de nouvelles preuves.
- Les deux contrôles statiques préexistants restent hors lot, actifs et non
  masqués. Tests, catalogue et fichiers concernés comparés au commit initial :
  inchangés. Pas de déclaration de CI globale verte ni d'A5 complet.
- **Prochaine action exacte :** revue finale du complément résiduel et de ses
  preuves ; arrêter ici sans publication. L'éditeur complet d'exceptions et
  conditions, l'édition des cibles multiples et la recette exhaustive A5 sont
  des travaux distincts restant à planifier. Aucun audit général à recommencer.

## Historique — prise de la reprise résiduelle A5.1 (remplacée par le bilan ci-dessus)

- Codex, `main`, HEAD `62df2b16ceca2e609c1789eba44afbe6fe278e19` inchangé.
  Toutes les modifications locales du lot précédent sont conservées.
- Autorisation : corriger seulement la classification de DENY `school`/`none`
  avec `target` renseigné, après régressions rôles/exceptions, puis refaire
  les preuves sur la seule base synthétique locale `schoolsafe_access_test_519`.
- Fichiers réservés : helper central, unité 08 encore locale, leurs tests,
  manifestes générés et documents de preuve/suivi. Moteur SQL et unités
  historiques intacts. Aucun commit, push, déploiement ou base réelle.
- Le bilan précédent est conservé comme historique : la revue finale a montré
  ce cas non couvert. Les deux contrôles statiques préexistants restent hors lot.

## 19 septembre 2026 — A5.1 ciblé terminé localement, sans publication

- Codex ; `main` ; départ et HEAD conservé :
  `62df2b16ceca2e609c1789eba44afbe6fe278e19`. Écriture effectivement vérifiée,
  correctif et tests persistés. Aucun commit, push, déploiement, VPS ou base
  réelle d'école. Les restrictions Git du poste n'ont pas été contournées.
- **Preuve et liste complète des fichiers :**
  [A5.1 — contrat, régressions, PostgreSQL/HTTP/UI et limites](superpowers/specs/2026-09-19-a51-denial-contract.md).
  Le service et les helpers existaient : raccordement de `applyBootstrap`,
  validation prudente du champ, portées/dates canoniques, sept contrôles locaux
  alignés ; migration additive **08**, manifestes régénérés et cache actualisé.
  ALLOW conservé hors refus ciblé/conditionnel ; refus général prioritaire dans
  l'école active. ACCESS_LAW et les contrôles serveur restent l'autorité.
- **Rouge → vert :** frontend 22 échecs/31 → **31/31 PASS** ; SQL 07 en échec
  (`es.profile_id` inexistant), puis 4 défauts/13 après réparation d'alias →
  **28/28 PASS** sur 08 ; console restée visible après projection invalide →
  fermeture effective vérifiée dans Chrome.
- **Preuves réalisées :** A2/A3 SQL historique PASS ; **47/47 A5.0 SQL PASS** ;
  **SQL → HTTP natif → connexion/actualisation → compte → navigation/console
  PASS**, PostgreSQL 17.11 local, base synthétique isolée
  `schoolsafe_access_test_519` sur `127.0.0.1:55432`. Refus HTTP 403 malgré
  contournement de l'interface, autre école 404, conditions vraie/fausse,
  révocation/restauration et anciennes réponses/invalides vérifiés. Seuls les
  deux derniers cas substituent la réponse bootstrap. Réapplication 08 : dix
  tables de fixtures inchangées. Fixtures et API de recette nettoyées/fermées.
- **Autres contrôles :** 11 tests serveur ciblés, typecheck, 13 assertions des
  helpers, 2 tests de manifeste (12 ensembles/43 unités), QA console navigateur
  avec API substituée (dont mobile/réponses tardives), contrats JASPE et cache
  PASS. Les sept contrôles locaux ont des tests de fonctions ; tous leurs écrans
  métier n'ont pas été rejoués individuellement dans le navigateur.
- **Limites :** deux contrôles statiques larges échouent déjà sur les fichiers
  inchangés de DeviceHub/Family/Cards (permission `school.settings.manage` et
  20 détections sans `school_id`). Détails dans la preuve. Aucune déclaration
  de CI complète verte, d'A5 complet ou de validation de production. L'éditeur
  complet d'exceptions et les refontes restent hors de ce lot.
- **Ordre impératif de preuve :** le runner A2 historique réapplique 05 après
  le manifeste ; appliquer 08 après lui. Le parcours dédié A5.1 exige le marqueur
  de 08 et ne réapplique jamais 05. Historique A2/A5.0 et migrations 05/07 conservés.
- **Prochaine action exacte :** relire le diff local et la preuve ; réserver
  séparément le traitement des deux contrôles statiques préexistants avant une
  recette globale ou livraison. Arrêt après ce lot. Publication seulement sur
  nouvelle instruction ; pas de reprise automatique des anciens ordres Git.
- **Consignes devenues obsolètes pour cette reprise :** « consommer deniedRules »
  comme nouvelle implémentation, « A5.1 suit le lot visuel », et « A5.1 à réserver ».
  Elles restent ci-dessous comme historique. Les décisions Docker + Coolify,
  l'isolation `school_id` et SchoolSafe / Control sont inchangées.

## Historique — prise du lot le 19 septembre 2026 (remplacée par le bilan ci-dessus)

- Responsable : Codex ; branche `main` ; départ `62df2b16ceca2e609c1789eba44afbe6fe278e19`.
- Écriture locale vérifiée. Périmètre réservé : bootstrap/contrôles frontend,
  projection additive, tests ciblés SQL/HTTP/interface, manifestes et suivi.
- Mandat courant : conserver les ALLOW hors DENY ciblés/conditionnels, maintenir
  les refus généraux applicables et l'autorité serveur. Pas d'éditeur complet
  d'exceptions, de refonte visuelle, de fournisseur, de VPS ou de base d'école.
- Aucun commit, push ou déploiement autorisé pour ce lot. Cette consigne remplace
  les ordres historiques de livraison Git pour la présente mission seulement.
- Les anciennes reprises visuelles et la demande « consommer deniedRules »
  ci-dessous sont historiques : les helpers existent déjà ; leur raccordement,
  le contrat des portées et la projection positive doivent être corrigés.
- Prochaine action : enregistrer et exécuter les régressions avant correction,
  puis prouver chaque couche séparément. Aucun résultat PostgreSQL/UI nouveau
  n'est encore annoncé dans ce bloc de prise de lot.

## Lot en cours — disposition de référence sans table

Codex, `main`, départ synchronisé `9881c2762eee26eb27b06aea63fd241c441c21e6`.
Nouvelle instruction : reproduire la disposition mobile, JASPE à gauche jusqu’aux
hanches, texte à droite, sans table. Réutiliser directement le personnage v12
existant et ses gestes, sans intégrer les images non validées. Fichiers réservés :
contrôleur dashboard JASPE, HTML/CSS du bandeau, QA concernés, cache et continuité.
Le logo et le cartable restent dans le plan de reprise ; ne pas déclarer leurs
raccordements ou nouvelles images terminés sans preuve. A5.1 suit le lot visuel.

### Correction du 16/09 (après vérification navigateur) — canvas live du bandeau

- Vérification navigateur réelle (DevTools, parcours auth → admin → workspace) :
  le moteur live se montait bien (`.jaspe2d--live`, 8 frames animées distinctes
  en 3,2 s = respiration/clignement actifs), MAIS le canvas rendait à 0×0.
- Cause exacte : `.jaspe-hero__character` avec `container-type: size` mais
  hauteur indéfinie (`min-height: 300px` + `align-self: stretch`) → `cqh`
  se résolvait à 0 → `width: min(166cqw, 125cqh)` donnait un canvas vide.
- Correction : `app/styles/modules/jaspe-dashboard.css` (~ligne 32),
  `min-height: 300px` → `height: 300px` (hauteur définie, cqh exploitable
  pour le cadrage hanches).
- Cache service worker bumpé : `jaspe-hip-canvas-live-2026-09-16` dans `sw.js` ;
  assertion QA mise à jour dans `qa-responsive-visual-system.cjs`.
- Preuves : canvas live 375×563 visible, fallback masqué, 8/8 frames animées ;
  `qa-jaspe-dashboard` PASS, `qa-jaspe-hip-layout` PASS (10 paires
  viewport/thème), `qa-jaspe-voice` PASS (1440/390), `qa-responsive-visual-system`
  PASS. Pas de commit (pas de demande explicite).
- Prochaine action : faire valider visuellement le bandeau par le propriétaire
  sur 4176, puis committer le lot sans table ; logo et cartable restent à reprendre.

### Lot en cours — 16/09 : logo de l’école dans le bandeau (première partie du lot logo/cartable)

- Lot sans table commité `f006a12` (validé par le propriétaire, « VALIDE G »).
- `app/index.html` : zone `.jaspe-hero__school` (img `[data-school-logo]` + `#jaspeHeroSchoolName`)
  ajoutée dans le bloc identité du bandeau JASPE.
- `app/app.js` : `renderSchoolBranding` étendu — `closest` accepte `.jaspe-hero__identity`
  (garde-fou null), `#jaspeHeroSchoolName` rempli depuis `currentSession.school.name`.
- `app/styles/modules/jaspe-dashboard.css` : styles `.jaspe-hero__school` (flex, logo 24×24,
  nom discret).
- Migration additive `database/projections/v1/06_school_logo.sql` : même contrat A5.0 que 05
  + champ `logo_path` sur l’objet école du bootstrap ; type `SessionBootstrap.school` étendu
  (`logo_path?: string | null`) ; générateur/manifeste régénérés (6 unités), compteur
  migration 32→33, `check-migration-versions` 2/2 PASS.
- Cache SW bumpé `jaspe-school-logo-2026-09-16` ; assertion QA visuelle mise à jour.
- Preuves : typecheck serveur PASS ; `qa-responsive-visual-system`, `qa-jaspe-dashboard`,
  `qa-jaspe-hip-layout` PASS ; navigateur réel (DevTools, workspace admin) : logo 24×24
  visible + nom + `has-school-logo`, canvas live intact (data-URL simulée).
- **Non couvert :** rejeu PostgreSQL réel de l’unité 06 (cluster arrêté) — obligatoire avant
  livraison ; poses cartable NON produites ; fidélité visage v12 à reprendre (REPRISE.md §1).
- Prochaine action : rejeu 06 sur PostgreSQL (`_10`), puis poses cartable depuis l’identité v12.

### Lot abandonné puis reprise A5.1 — 16/09

- Le lot logo/cartable a été **abandonné sur demande du propriétaire** : tous les
  changements ont été revertés (retour à l’état du commit `f006a12`, bandeau et
  bouton JASPE du bas inchangés). Aucun changement logo ne subsiste.
- **A5.1 en cours** : unité de projection additive
  `database/projections/v1/07_targeted_denies.sql` créée — même contrat A5.0
  que 05 + clé `deniedRules` (provenance role/exception, originId, scopeType,
  target, conditionCode/Params, startsAt/endsAt) pour projeter exactement les
  DENY ciblés/conditionnels au lieu de les aplatir globalement.
- `deniedPermissions` conservé pour compatibilité ; type `SessionBootstrap`
  étendu avec `deniedRules` (typecheck serveur PASS) ; manifeste régénéré
  (6 unités), compteur 32→33, `check-migration-versions` 2/2 PASS.
- **Reste à faire A5.1** : consommer `deniedRules` côté frontend
  (`app/modules/core/access.js` : ne plus bloquer globalement une permission
  quand le DENY est ciblé), console de restrictions individuelles avec
  délégation bornée, recette parent/enseignant/gardien, rejeu PostgreSQL réel
  de l’unité 07 (cluster arrêté, base `_10`), tests SQL A5.0 à repasser.

### Lot abandonné puis reprise A5.1 — 16/09

- Le lot logo/cartable a été **abandonné sur demande du propriétaire** : tous les
  changements ont été revertés (retour à l’état du commit `f006a12`, bandeau et
  bouton JASPE du bas inchangés). Aucun changement logo ne subsiste.
- **A5.1 en cours** : unité de projection additive
  `database/projections/v1/07_targeted_denies.sql` créée — même contrat A5.0
  que 05 + clé `deniedRules` (provenance role/exception, originId, scopeType,
  target, conditionCode/Params, startsAt/endsAt) pour projeter exactement les
  DENY ciblés/conditionnels au lieu de les aplatir globalement.
- `deniedPermissions` conservé pour compatibilité ; type `SessionBootstrap`
  étendu avec `deniedRules` (typecheck serveur PASS) ; manifeste régénéré
  (6 unités), compteur 32→33, `check-migration-versions` 2/2 PASS.
- **Reste à faire A5.1** : consommer `deniedRules` côté frontend
  (`app/modules/core/access.js` : ne plus bloquer globalement une permission
  quand le DENY est ciblé), console de restrictions individuelles avec
  délégation bornée, recette parent/enseignant/gardien, rejeu PostgreSQL réel
  de l’unité 07 (cluster arrêté, base `_10`), tests SQL A5.0 à repasser.

- Vérification navigateur réelle (DevTools, parcours auth → admin → workspace) :
  le moteur live se montait bien (`.jaspe2d--live`, 8 frames animées distinctes
  en 3,2 s = respiration/clignement actifs), MAIS le canvas rendait à 0×0.
- Cause exacte : `.jaspe-hero__character` avec `container-type: size` mais
  hauteur indéfinie (`min-height: 300px` + `align-self: stretch`) → `cqh`
  se résolvait à 0 → `width: min(166cqw, 125cqh)` donnait un canvas vide.
- Correction : `app/styles/modules/jaspe-dashboard.css` (~ligne 32),
  `min-height: 300px` → `height: 300px` (hauteur définie, cqh exploitable
  pour le cadrage hanches).
- Cache service worker bumpé : `jaspe-hip-canvas-live-2026-09-16` dans `sw.js` ;
  assertion QA mise à jour dans `qa-responsive-visual-system.cjs`.
- Preuves : canvas live 375×563 visible, fallback masqué, 8/8 frames animées ;
  `qa-jaspe-dashboard` PASS, `qa-jaspe-hip-layout` PASS (10 paires
  viewport/thème), `qa-jaspe-voice` PASS (1440/390), `qa-responsive-visual-system`
  PASS. Pas de commit (pas de demande explicite).
- Prochaine action : faire valider visuellement le bandeau par le propriétaire
  sur 4176, puis committer le lot sans table ; logo et cartable restent à reprendre.

---

## Reprise immédiate — JASPE latérale, visage fidèle et logo de l’école

Codex, `main`, base applicative `9d8654246e4622cf4485de551effa93c5a0fa03a`.
**Transmission demandée par le propriétaire avant épuisement du quota.**
Ce lot ne contient que documentation et images de préparation ; **aucun code
applicatif, SQL, droit ou déploiement modifié. Nouveau bandeau NON LIVRÉ.**

- Demande validée : bureau occasionnel, JASPE compacte sur le côté, cartable,
  logo réel de l’école à côté, saisie en bas ; animations/voix/accès conservés.
- **Cadrage final : jusqu’aux hanches, bras et mains visibles pour expliquer.**
  Garder le personnage flottant en pied ; ce cadrage concerne le bandeau.
- Dernière correction : le propriétaire signale un visage déformé. La maquette
  mobile sert à montrer le **placement** ; garder notre JASPE existante. Aucune
  nouvelle planche n’est validée. Ne pas remplacer les assets utilisés actuellement.
- Reprise technique détaillée : [JASPE/cartable](design/jaspe-cartable-v1/REPRISE.md).
  Ce document localise le moteur, la grille mobile, le rendu du logo et le champ
  manquant dans le bootstrap natif, puis précise les preuves à exécuter.
- Images : `docs/design/jaspe-cartable-v1/reference-placement-mobile.png` (copie
  de la référence utilisateur) et `cartable-clair-non-valide.png` (candidat écarté
  de l’intégration). Prompts exacts/mode intégré dans `prompts.json`. La première
  tentative au faux damier est rejetée et n’est pas copiée dans le dépôt.
- **Prochaine action exacte :** corriger la fidélité des poses cartable depuis
  l’identité originale v12, puis intégrer la scène latérale et le bureau ponctuel,
  connecter le logo de l’école et sa projection native additive, tester et livrer.
  **Ensuite revenir à A5.1**, et non recommencer les lots accès déjà validés.
- Contrôles de ce lot documentaire : `git diff --check` PASS, prompts JSON valides,
  dimensions PNG vérifiées, référence copiée à l’identique et SHA256 consignés
  dans `REPRISE.md` ; aucun fichier de code applicatif modifié.
  Aucun test fonctionnel nouveau n’a été exécuté ; les preuves A5.0 ci-dessous
  portent sur le commit applicatif précédent et ne valident pas ce nouveau bandeau.
- `.claude/` et les deux PNG utilisateur à la racine restent non suivis. Bases de
  test conservées ; cluster temporaire toujours arrêté. Aucun travail en arrière-plan
  à attendre. Prévisualisation existante sur 4176 inchangée.

---

## Lot terminé — A5.0, validité temporelle du paquet de session

Codex, `main`, base/mirror `a5037ce8b9aa8333c4b6101a490d6baba632b817`.
**CORRECTION TEMPORELLE VALIDÉE. A5 complet reste en cours ; prochaine tâche A5.1.**

- Défaut reproduit sur vraie base : Access Law refusait un rôle/grant/portée
  expiré mais le bootstrap pouvait encore l'afficher. Même défaut pour DENY
  futurs/expirés, rôles désactivés et exceptions sans portée courante.
- Projection additive `database/projections/v1/05_session_validity.sql` : filtre
  commun des dates/états, périmètres et exceptions actifs ; rôle et permission
  actifs exigés ; attributions enseignantes datées ; enfants opérationnels ;
  portails actifs depuis grants ou exceptions ALLOW courants. Aucune table modifiée.
  Le snapshot reste descriptif ; l'autorisation métier demeure `api.check_access`.
- Unité historique 02 inchangée. Générateur/manifestes, runner d'installation,
  `scripts/test-session-validity-postgres.mjs`, contrat statique et continuité modifiés.
- **47/47 scénarios PostgreSQL réels PASS**, dont comparaison bootstrap/Access Law
  pour dates et états ; **44/44 contrôles statiques PASS**, 9 ensembles / 32 unités.
  Base fraîche `_9` : 25 unités, rejeu de projection, SQL A2/A3 PASS. Mise à niveau
  base A4 `_7` : neuf tables IAM/école/audit intégralement inchangées.
- Régression navigateur réel A3/A4 PASS sur cette nouvelle projection :
  attributions/postes persistants, concurrence, conflit, mobile sombre et
  révocation JASPE sur une session déjà ouverte. Aucun nouvel appel fournisseur.
- Les contrôles ne couvrent pas encore les DENY conditionnels/ciblés : leur
  projection historique reste trop globale. Ce lot ne prétend pas régler A5.1.

### Prochaine action exacte — A5.1

1. Définir une projection des règles qui conserve provenance, cible, condition
   et dates ; ne plus aplatir un DENY d'une cible en refus global. Réutiliser
   `iam.can_access`, `iam.grant_scopes_match`, `iam.exception_scopes_match` et
   `iam.condition_matches`, sans deuxième moteur serveur ou contournement client.
2. Adapter bootstrap/normalisation/Mon compte et gates de navigation/JASPE sans
   confondre permission attribuée et autorisation d'une action sur une cible.
   Les contrôles effectifs restent obligatoires à chaque requête métier.
3. Composer les restrictions de grants et exceptions individuelles depuis la
   console existante, avec délégation A3, dates/conditions/cibles bornées,
   confirmation et audit. Ne pas modifier un poste partagé pour une seule personne.
4. Recette parent/enfant non rattaché, enseignant hors classe/matière, gardien hors
   portail, plusieurs portées, refus conditionnel et exception expirée. Ensuite A6/A7.

La suite des fonctions B–K, Device Hub et production reste à traiter selon le plan.
Les seules bases touchées sont synthétiques et locales. Fichiers utilisateur
`.claude/` et deux PNG conservés hors Git. Le SHA du lot est dans l'historique.
Cluster temporaire arrêté après recette ; données conservées dans
`%TEMP%/schoolsafe-access-a2-pg/data`, PostgreSQL 17.11 sur port 55432 lors du
redémarrage avec son `pgsql/bin/pg_ctl.exe`. Aucun service Windows installé.

---

## Lot terminé — A4, postes personnalisés

Codex, `main`, départ `e62529b6808b85d5ce430501bbdffc86f903142c`.
**PARCOURS VALIDÉ SUR BASE DE TEST RÉELLE. Prochaine tâche : A5.**

- Création vide ou modèle, nom, composition ALLOW/DENY, état actif/inactif,
  membres concernés, motif et confirmation. Copies personnalisables, modèles
  canoniques protégés, références conservées. Attribution via le parcours A3.
- Même autorité serveur, verrou/révision, dernier administrateur et audit
  atomique. Conditions/dates/portées existantes conservées ; nouvelles portées
  simples explicites. Control reste exclu. JASPE ne reçoit aucun droit supplémentaire.
- Fichiers : `database/access/v1/05_custom_roles.sql`, générateur/manifestes,
  `server/src/accessnative/{routes,service}.ts`, tests ; nouvel éditeur
  `app/modules/administration/access-role-editor.js`, console/client/CSS/index,
  cache `native-custom-roles-2026-09-16`, QA, runners et documents de continuité.
- Contrat exact, protocole et limites :
  `docs/superpowers/specs/2026-09-16-custom-roles-contract.md`.

### Preuves A4

- **90/90** tests serveur, typecheck, **38/38** contrats statiques, manifestes
  **9 ensembles / 31 unités**, JASPE Access Law, contrat visuel PASS.
- PostgreSQL 17.11 : 24 unités sur base vide `_7`, rejeu A3/04 puis A4/05,
  tests SQL A2/A3/A4 et Access Law trois écoles PASS. Upgrade ancienne base A3
  `_5` : toutes les lignes de neuf tables IAM/école/audit inchangées.
- SQL A4 : délégation, cross-school, Control, dernier admin, deux postes avec
  DENY prioritaire, champs forgés, conditions conservées, panne d'audit annulant
  création/composition/révision PASS.
- Vrai navigateur/cookie/API/PG : création/composition/attribution, persistance,
  impact sur membres, refus effectif, mobile sombre PASS. Concurrence A3 et
  révocation JASPE même cookie PASS. Captures finales bureau/mobile inspectées.
- QA A1/A2 et éditeur A4 : réponses tardives, filtre ne perdant pas les droits
  masqués, soumission unique, conflit conservé, changement d'école PASS.
  Deux erreurs de fixtures/outillage corrigées (nom trop court, tri sans `id`),
  tests concernés rejoués avec succès. Aucun test en échec restant dans ce lot.

### Prochaine action exacte

Réserver **A5** après vérification du miroir Git. Lire la fiche A5 et auditer
`iam.grant_scopes`, `iam.permission_conditions`, les exceptions individuelles et
`database/projections/v1/02_session_bootstrap.sql`. Ce bootstrap ignore encore
plusieurs dates/états et projette trop largement certains DENY conditionnels ;
le corriger par migration additive en réutilisant l'évaluateur Access Law.
Implémenter ensuite les cibles/dates/conditions/exceptions dans l'éditeur existant,
avec délégation bornée et scénarios parent/enfant, classe/matière/portail.
A6 journal et A7 recette complète restent nécessaires. Pas de production validée.
Les bases locales `_5` (upgrade), `_6`/`_7` (UI) ne portent que des fixtures ; le
cluster de test reste disponible pour la suite. Les fichiers `.claude/` et les
deux PNG utilisateur sont toujours exclus. Commit du lot dans l'historique Git.

---

## Lot terminé — A3.0–A3.1, rôles persistants et autorité JASPE

Codex, `main`, base applicative `0f23979` ; reprise après décisions `db4e882`.
**PARCOURS VALIDÉ SUR BASE DE TEST RÉELLE. Prochaine tâche : A4.**

- Attribution, réactivation et retrait natifs depuis la fiche d'un profil ;
  aperçu du rôle, motif, confirmation, relecture, absence de rejeu offline.
  Un conflit conserve le formulaire consultable et exige une nouvelle lecture.
- `roles.manage` contrôlé dans la transaction et après verrou de l'école ;
  enveloppe de délégation conservatrice, Control exclu, dernier administrateur
  permanent protégé, révision commune et audit atomique avant/après/motif.
- Provisionnement des modèles retiré du runtime scolaire pour empêcher un
  gestionnaire limité de rétablir ses privilèges ; bootstrap/migration conservés.
- Route JASPE protégée par `safe.assistant.use` sur le profil réel ; mode sans
  auth fermé. Ce relais ne dispose toujours pas d'outils métier ; la loi générale
  devra être appliquée à chaque outil futur. Pas de promesse d'exécuteur déjà livré.
- Deux migrations additives : `access/v1/04_role_assignments.sql` et
  `projections/v1/04_access_assignment_views.sql`. Unité A2/03 conservée intacte.
  Console/client/CSS/cache, service/routes/tests accès, route JASPE/tests, runners
  et manifestes concernés ; fichiers utilisateur non suivis toujours exclus.

### Preuves

- PostgreSQL 17.11 : installation fraîche de **23 unités**, rejeu des unités A3,
  SQL A2/A3 et Access Law trois écoles PASS. Mise à niveau sur ancienne base A2
  synthétique PASS, nombres de rôles/attributions/grants/audit inchangés.
- SQL : Control/cross-school/DENY/droits temporaires/manager limité/refus directs,
  administrateur futur/temporaire/suspendu/utilisateur inactif non compté comme
  secours, double requête périmée, audit en panne = rollback.
- `qa-access-mutations-live.mjs` PASS : deux connexions API concurrentes,
  révocation d'autorité pendant attente du verrou ; vrai navigateur/cookie/API/PG,
  attribution puis rechargement/retrait, audit, conflit conservant le formulaire,
  mobile sombre, révocation JASPE sur cookie déjà ouvert. Captures inspectées.
- **76/76** tests serveur ciblés PASS ; **38/38** contrats statiques PASS ;
  typecheck, QA A1 et annuaire A2, JASPE Access Law, contrat visuel, diff PASS.
  Manifestes globaux : **9 ensembles / 30 unités**.

### Limites et reprise

**A4** : créer un poste vide ou depuis un modèle, composer ses permissions,
montrer les personnes affectées avant édition partagée et protéger l'enveloppe
de délégation. Reprendre la fiche A4 du plan et réutiliser les helpers/transactions
A3. A5 reste nécessaire pour dates, conditions, exceptions et exactitude du
bootstrap temporel ; A6 pour journal consultable ; A7 pour recette complète.
Pas de modification de production, appareil, VPS ou validation complète des
autres modules. Les bases locales `_3` (upgrade), `_5` (UI), `_6` (SQL) ne portent
que des fixtures de test. Git : commit du lot dans l'historique, miroir à vérifier.

---

## Précision produit courante — QR, empreinte enfant et remplaçant habilité

Le propriétaire confirme : QR de la carte enfant scanné par le gardien, contrôle
physique/photo parmi les trois personnes autorisées. En l'absence du gardien,
**empreinte de l'enfant**, puis **remplaçant habilité** qui vérifie l'adulte et
confirme la remise via son propre profil. Aucun départ automatique sur biométrie
ou seule reconnaissance de l'adulte par l'enfant. Même autorisation et même audit
que le parcours QR. Décision inscrite dans `DECISIONS.md` et la section présences/
remise de la proposition Device Hub. Aucun code ou appareil modifié dans ce lot.

Reprise applicative inchangée : clôture A3 détaillée ci-dessous. Ses fichiers
locaux sont conservés. PostgreSQL temporaire A3 a été arrêté après les tests ;
les fixtures restent dans la base dédiée. Contrôle documentaire : diff relu,
`git diff --check` ; aucun nouveau test applicatif nécessaire pour cette précision.

---

## Point courant — validation de la loi JASPE et résumé Device Hub

Le propriétaire valide explicitement la loi générale : JASPE agit avec les droits
effectifs du profil connecté, jamais davantage, pour toute consultation/action et
tout module/connecteur. Décision durable inscrite dans `DECISIONS.md` et le contexte.
Il demande également un résumé de la proposition Device Hub ; son architecture
reste **À VALIDER**, sans nouveau codage Device Hub dans ce lot documentaire.

Code A3 du bloc suivant conservé localement, non committé à ce stade. Ne pas
l'écraser. Base applicative `0f23979`, propriétaire Codex. Preuves terminées :
suite SQL `role-assignments.test.sql` PASS (isolation, délégation, Control, dernier
admin, audit/rollback) ; `qa-access-mutations-live.mjs` PASS avec deux connexions
API réelles (concurrence/réautorisation), puis navigateur/cookie/API/PostgreSQL
(confirmation, attribution, persistance, retrait, audit, conflit, mobile sombre,
révocation immédiate du droit JASPE). 39 tests serveur antérieurs PASS ; nouveaux
cas API ajoutés ensuite encore à exécuter. Typecheck précédemment PASS.

**Prochaine action applicative exacte :** reprendre la clôture A3 : revoir le diff,
exécuter les nouveaux cas API/contrats et les régressions A1/A2, inspecter les deux
captures A3 dans `%TEMP%`, mettre à jour cache/plan/preuves, puis committer/pousser
le code validé. Ne pas annoncer A4–A7 ou les autres modules terminés. La base
temporaire `schoolsafe_access_test_4` contient uniquement les fixtures synthétiques
de ce parcours. Aucun appareil, VPS ni base de production modifié.

---

## Lot en cours — 16 septembre 2026 : A3.0–A3.1

Responsable : Codex, `main`, base/fetch `0f23979efbcc3f3151ec5a60b70f65b05957a051`.
Mandat renouvelé : terminer le plan fonctionnel, par lots vérifiables. A3 réservé :
contrat de délégation, attribution/retrait natifs, concurrence, dernier administrateur,
confirmation et audit. Fichiers réservés : access SQL/manifeste/tests, projections
IAM, service/routes/tests accessnative, console/client/CSS accès, QA et continuité.
Les fichiers `.claude/` et les deux images utilisateur restent exclus du lot.
Précision du propriétaire : JASPE suit les droits attribués par l'administrateur ;
l'accès Finance d'un parent n'autorise jamais la consultation des salaires du personnel.
Cette séparation doit être vérifiée par permission, cible et école côté serveur.

---

## Lot courant — 16 septembre 2026 : A2, consultation des accès de l'école

**A2.0–A2.2 LIVRÉS ET VALIDÉS SUR BASE DE TEST RÉELLE. PROCHAINE TÂCHE : A3.0.**
Responsable du lot terminé : Codex ; branche `main` ; départ/fetch
`146ad3e761dd0ba5e544726e9f12736185b29049`, identique à `origin/main`.
Aucun fichier suivi modifié au départ ; `.claude/` et les deux PNG restent hors lot.

### Réalisations et corrections

- Annuaire natif des utilisateurs/rôles de l'école : recherche, pagination et
  détail des attributions (rôles, grants, exceptions, périmètres, conditions,
  validité). Mon compte conservé, aucun brouillon démo utilisé comme source réelle.
- Trois GET `/native/access/profiles`, `/native/access/roles`,
  `/native/access/profiles/:profileId` → session résolue → `roles.manage` →
  transaction contextualisée → trois RPC SQL. Aucun acteur/tenant imposé par client.
- Profil hors école = absent (404), sortie minimale, `no-store`, absence de
  droits = 403, CORS local 4176 corrigé. UI : erreurs/réessai, pas de réponse
  périmée lors d'un changement de cible, recherche, fermeture ou session.
- Deux défauts reproduits **sur PostgreSQL réel**, puis corrigés : installation
  bloquée par gardes « 60 permissions » malgré 64 codes ; rôle désactivé encore
  autorisant via `iam.can_access`. Activation du rôle vérifiée pour ALLOW et DENY.
- Contrat/preuves/protocole :
  `docs/superpowers/specs/2026-09-16-access-directory-contract.md`.

### Fichiers concernés

- `server/src/accessnative/{routes,service}.ts`, assemblage `app.ts`/`native-app.ts`,
  `server/tests/accessnative.test.ts`.
- `database/projections/v1/03_access_read.sql`, test SQL et manifeste/générateur ;
  baseline `08_internal_functions.sql`, `12_seed_permissions.sql`,
  `13_verification.sql` et manifeste ; compteur des unités dans le test de manifestes.
- Console `app/modules/administration/access-console.js`, client `access-native.js`,
  `app/app.js`, `app/index.html`, CSS accès, version PWA/contrat, nouveau QA annuaire.
- `scripts/test-access-postgres.mjs`, `scripts/qa-access-live.mjs`, contrat et
  documents de continuité/plan. Aucun compte ni droit de production modifié.

### Vérifications réelles

- **PASS** installation fraîche PostgreSQL 17.11, 21 unités baseline/auth/access/
  projections ; rejeu de la nouvelle RPC ; test SQL A2 sous `schoolsafe_api`,
  deux écoles, aucune identité usurpée, dates/retrait/DENY/rôle inactif/suspension,
  absence de lecture directe des tables. Fixtures SQL annulées par ROLLBACK.
- **PASS** suite SQL existante `from-zero-access-law.test.sql` : classes/matières,
  parents/enfants et isolation de trois écoles, sans régression du moteur.
- **PASS** `qa-access-live.mjs` : vrais cookies, pools auth/métier, API native et
  PostgreSQL ; annuaire/détail/recherche/rôles, 404 étranger, bureau/mobile sombre,
  révocation refusée immédiatement depuis une session ouverte. Captures inspectées.
- **PASS** QA annuaire avec API substituée : pagination, recherches concurrentes,
  sélection A→B, fermeture tardive, panne/réessai, XSS, école incohérente, zéro écriture.
  Régression QA A1, contrats JASPE et visuel : PASS.
- **51/51 PASS** sur 7 fichiers serveur ciblés ; **38/38 PASS** contrats statiques
  permissions/isolation/baseline/access/manifestes. Typecheck, syntaxe, diff : PASS.
- Instance de test portable `%TEMP%/schoolsafe-access-a2-pg`, loopback 55432,
  aucune installation de service/Docker. API de preuve fermée ; arrêt PostgreSQL
  vérifié avant clôture. Les fixtures navigateur restent seulement dans la base
  temporaire dédiée. Aucun déploiement ni validation d'une base existante.

### Limites et prochaine action exacte

**A3.0 : contrat des mutations et limites de délégation**, puis A3.1 attribution/
révocation transactionnelle. Reprendre `05_iam.sql`, `02_provision_bridge.sql`,
l'évaluateur et la fiche A3.0 du plan ; fixer rôle/permission délégable, protection
du dernier administrateur, concurrence, confirmation dans l'UI et audit atomique.
Ces fonctions ne sont pas encore livrées. Aucun lot applicatif suivant réservé.

Restent : A4 postes, A5 exceptions et fidélité temporelle/conditionnelle du
bootstrap existant, A6 journal, A7 recette complète. Le rejeu ci-dessus ne valide
pas les autres ensembles métier, la licence distante ou P5/restauration.
`02_student_list.sql` hors manifeste et anomalies d'admission toujours ouverts.
L'application des modifications baseline à une installation exploitée reste un
lot d'exploitation ; aucune migration de production n'a été lancée.

Lot Git : `feat(access): consulter les utilisateurs et leurs droits en natif`.
SHA dans Git ; annoncer le miroir après comparaison avec la branche GitHub réelle.

---

## Historique — 16 septembre 2026 : plan commun aux agents

**PLAN LIVRÉ — PROCHAINE TÂCHE APPLICATIVE A2.0.** Le propriétaire a demandé
« GO » avec un plan de travail que tout agent puisse suivre. Le plan existant
est détaillé ; aucun nouveau développement fonctionnel n'est annoncé par ce lot.

### Travail et état vérifiés

- Départ/fetch : `main` = `origin/main` =
  `7b2896ad5e6ea03377ee5ca3cf858939e7a45278`. A1 est conservé. Aucun changement
  suivi préexistant ; `.claude/` et les deux PNG de référence restent hors lot.
- Plan actif : `docs/superpowers/plans/2026-09-16-schoolsafe-functional-integration.md`.
  Tableau de suivi, reprise, fiches A2.0–A7, ordre B–K pour les 16 rubriques,
  fichiers existants/proposés, critères de fin, tests et modèle de passation.
- Points vérifiés dans le code : IAM et audit réutilisables ; garde/contextes natifs
  existants ; anciens runners SQL dépendants de Docker ; `02_student_list.sql`
  absent du manifeste des projections. Le plan distingue les preuves statiques
  d'un rejeu réel et interdit de considérer une API substituée comme une base validée.
- `AGENTS.md` pointe explicitement vers le plan. Le contexte, les décisions et
  le présent handoff décrivent la même reprise. L'ancienne répartition par nom
  d'assistant est historique ; la propriété d'un lot reste exclusive et explicite.
- Fichiers du lot : `AGENTS.md`, `docs/PROJECT_CONTEXT.md`, `docs/DECISIONS.md`,
  ce handoff et le plan actif. Aucun code applicatif, SQL, compte ou droit modifié.
- Vérifications de ce lot documentaire : cohérence des tâches et des liens,
  présence des sources citées, `git diff --check`. Aucune suite applicative
  relancée ; les tests d'A1 ci-dessous sont des résultats antérieurs, pas nouveaux.

### Prochaine action exacte

**A2.0 — contrat de lecture IAM et préparation SQL.** Aucun agent applicatif
n'a réservé cette tâche pendant la rédaction du plan. À la prise : inscrire
responsable/branche/SHA/fichiers, relire `database/baseline/v1/05_iam.sql` et
`server/src/db/access.ts`, puis suivre la fiche A2.0. Livrable : contrat exact des
listes/détails de profils/rôles et protocole de test PostgreSQL isolé ; ensuite A2.1
projections/API et A2.2 interface. Ne pas réimplémenter A1 ou démarrer les appareils.

Reste ouvert : preuve PostgreSQL réelle, attribution/révocation persistante,
composition de postes, exceptions et audit consultable. La validation Device Hub
et le désaccord d'exploitation restent hors de ce lot et ne bloquent pas A2.0.

Lot Git : `docs(plan): parcours commun des agents pour roles et acces` ; SHA dans
Git. Annoncer le miroir uniquement après comparaison HEAD et branche GitHub réelle.

---

## Historique — 16 septembre 2026 : Rôles et accès, A1

**A1 LIVRÉ — CONTEXTE NATIF ET CONSULTATION.** Le propriétaire demande de traiter
les 16 rubriques frontend/backend/écosystème, puis impose Rôles et accès en premier,
sans supprimer l'existant, étape par étape. Le lot Device Hub ci-dessous reste en
attente de sa validation propre ; il n'est pas le prochain codage à lancer.

### Travail terminé

- Fetch effectué ; départ `main` = `origin/main` = `3ca73fa5946e3498d1b9244e8fbdb9d9a4ad9961`.
  Aucun changement suivi préexistant ; `.claude/` et les deux PNG racine préservés.
- Défaut reproduit : session native sans bearer → `getCurrentUser()` renvoyait
  `demo-school-1`. Contexte réel restauré dans la navigation, documents, identité,
  modules concernés et JASPE ; reconnaissance native conservée sans lire le cookie.
- Console native relue par `/native/session/bootstrap` à chaque ouverture/refresh :
  compte, école, rôles, permissions, toutes les portées, DENY, recherche et filtre.
  Garde `roles.manage` + `school`, aucune autorité implicite liée au nom du rôle.
- Rejet d'un changement d'école/profil inattendu, expiration/refus → connexion,
  réponse tardive ignorée, échec → message et nouvelle tentative sans anciens droits.
- Éditeur de brouillons démo conservé, inaccessible comme mutation réelle.
  Réutilisation du backend existant ; aucune nouvelle route/table/permission.
- Plan unique des 16 rubriques et étapes A1/A2/A3 :
  `docs/superpowers/plans/2026-09-16-schoolsafe-functional-integration.md`.

### Fichiers et vérifications

- `app/app.js`, `app/index.html`, nouveau module `administration/access-console.js`,
  nouveau style `native-access.css`, reprise du chargement du catalogue dans `core/access.js`.
- Reconnaissance native corrigée dans Finance/contrôle financier, Comptabilité,
  RH, Stock, Communication, Parent, Pédagogie/Palmarès/portail enseignant, Gardien,
  et `safe-assistant.js` (identité du profil dans le changement de conversation).
- Nouveau `app/qa-native-access-console.cjs` ; complément du contrôle accès assistant,
  cache PWA et contrat associé ; plan, décisions et ce handoff.
- **PASS** navigateur : défaut initial reproduit puis corrigé, permissions exactes,
  pas de finance par simple rôle admin, refus JASPE, RH indisponible sans fixtures,
  cibles multiples, filtres, 390 px, panne/reprise, fermeture pendant requête,
  révocation, expiration, autre école refusée, démo préservée, aucune mutation HTTP.
- **23/23 PASS**, 5 fichiers serveur : sessionnative, auth-session,
  authnative-profiles, db-context, native-access-contract. **4/4 PASS** contrats
  permissions et isolation statique. Access/JASPE, contrat visuel, soumission paiement,
  campagnes de contrôle financier, dashboard JASPE navigateur : **PASS**.
- Syntaxe JS et `git diff --check` : PASS. Captures bureau/mobile clair/sombre
  inspectées, contraste des boutons natifs corrigé. Aucun SQL/migration modifié.

### Limites et prochaine action exacte

Les tests navigateur substituent l'API ; les tests serveur substituent PostgreSQL.
Pas de preuve de base réelle, de données de production ou de déploiement.
La nouvelle console consulte **le compte connecté uniquement**. La liste réelle
des autres profils et les attributions/révocations persistantes ne sont pas livrées.
Les autres modules ont toujours les écarts de raccordement détaillés dans le plan.

**Reprendre A2 du plan** : auditer puis raccorder une projection native des profils,
rôles et grants de l'école à la liste existante ; réutiliser IAM et Access Law.
Ensuite A3 : mutations transactionnelles/auditées et révocation effective. Ne pas
transformer les brouillons offline en commandes de droits. Rejeu sur base isolée
obligatoire pour les nouveaux parcours SQL ; conserver le périmètre école/Control.

Lot Git : `fix(access): contexte natif et consultation des droits` ; SHA dans Git.
Synchronisation annoncée après comparaison directe du commit local et de GitHub.

---

## Historique — 16 septembre 2026 : audit Device Hub avant codage

**PHASE 0 LIVRÉE — VALIDATION DU PROPRIÉTAIRE ATTENDUE.** La nouvelle mission
Device Hub/identités/biométrie/QR/présences demande au §56 un premier livrable
en 24 points puis un arrêt avant toute modification structurelle.

### Livré et vérifié

- Dossier unique :
  `docs/superpowers/specs/2026-09-16-schoolsafe-device-hub-audit-design.md`.
  Il couvre état Git, existant, preuves, écarts, architecture, données, matériel,
  QR/PIN/empreinte, personnes, événements/présences, offline, tests, risques,
  fichiers, migrations et les phases 0–19. Architecture marquée **À VALIDER**.
- Départ `main` = `origin/main` = `464996ed5e70957b199de5120b30f4cd6058aad8`,
  fetch effectué. Aucune modification suivie préexistante ; fichiers utilisateur
  non suivis préservés (`.claude/` et deux PNG de référence à la racine).
- Schémas versionnés inspectés : écoles, élèves, tuteurs, cartes, événements et
  audit réutilisables. `iam.devices` concerne les appareils des comptes, pas les
  terminaux. RH/biométrie/présences encore démonstratifs ; pas de tables métier
  staff/attendance ni Device Hub natif trouvés.
- Ancien QR lisible et payload journalisé ; ancien scan Supabase non câblé par
  `buildNativeApp`, contexte scolaire à refaire avant réutilisation. Guardian
  avec photo/confirmation réelle encore à raccorder. Caméra interdite par la
  politique du serveur de prévisualisation.
- Incohérence vérifiée : `api.student_create_draft` dans la projection écrit
  `student_enrollments.status='planned'`, absent du CHECK canonique. Sa signature
  comporte aussi des paramètres avec défaut avant d'autres requis. Revue et
  rejeu SQL requis avant de réutiliser ce flux ; **aucun correctif codé** ici.
- Documentation officielle indexée du DS-K1T808MFWX : empreinte/carte/PIN,
  ISAPI/ISUP 5.0. Sources et limites d'accès dans le dossier. Aucun endpoint
  supposé, aucune interrogation du matériel, aucune capacité distante déclarée
  validée. Le firmware réel et le poste Bridge restent à qualifier.

### Tests réellement exécutés

- Permissions + sweep SQL inter-écoles : **4/4 PASS**.
- Manifestes migrations : **9 ensembles / 27 unités PASS** (hashes, pas rejeu SQL).
- Sept fichiers serveur (`db-context`, `native-access-contract`, `studentsnative`,
  `security`, `security-service`, `control-authority`, `licensenative-gate`) :
  **41/41 PASS**. Dépendances substituées ; aucune preuve de base/terminal réels.
- Relecture documentaire et `git diff --check`. Pas de changement applicatif,
  SQL, appareil, données, secrets ni déploiement.

### Prochaine action exacte

Présenter le dossier et **attendre l'accord demandé par le §56 de la mission**.
Après validation : phase 1 (contrats et architecture), puis fondations phase 2
par petits lots. Ne pas lancer les phases structurelles sur la seule base du
présent handoff. P5/restauration, Guardian réel et qualification matériel restent
des prérequis au pilote. Le désaccord historique Docker/AGENTS reste signalé,
sans modification d'exploitation dans ce lot.

Fichiers du lot : dossier d'audit, `docs/DECISIONS.md`, ce handoff.
Lot Git : `docs(device-hub): audit et architecture avant validation` ; SHA dans
l'historique, synchronisation annoncée après comparaison local/distant.

---

## Historique — 16 septembre 2026 : se lever, expliquer, se rasseoir

**TERMINÉ.** Le propriétaire a autorisé la suite du plan assise/debout. Le lot
vocal précédent et ses réserves restent dans l'historique ci-dessous.

### Livré

- Quatre planches nouvelles : `se-lever-clair.png`, `se-lever-sombre.png`,
  `debout-parole-clair.png`, `debout-parole-sombre.png`. Même identité et tenue,
  haut du corps visible, bureau masquant le bas ; aucune nouvelle 3D.
- Séquence finie assise → appui des mains → montée → explication debout avec
  les deux mains. La descente réutilise les quatre étapes de montée à l'envers.
- Les explications `TalkHandsOpen` / `TalkPassionately` déclenchent cette séquence
  dans le bandeau. La salutation reste assise. La fin ou l'arrêt de la voix
  ramène JASPE au repos ; une autre action interrompt le geste et la fait asseoir.
- Préchargement des deux planches nécessaires, repli sur parole assise si elles
  manquent, annulation des chargements devenus obsolètes, pose fixe en mouvements
  réduits. La version flottante entière conserve son moteur et ses gestes.
- Aperçu enrichi : **Se lever et expliquer** / **Se rasseoir · repos**,
  lien `http://127.0.0.1:4176/jaspe-assise-preview.html#debout`.

### Fichiers et contrôles

- Assets, `manifest.json`, `prompts-debout.json`, README ;
  `seated-companion.js`, raccord dans `dashboard-companion.js`,
  `jaspe-seated.css`, aperçu, nouveau `qa-jaspe-standing.cjs`, complément du
  test vocal, version du cache et contrat associé, décisions et ce handoff.
- **14 planches / 56 vignettes, 22,68 Mio** : dimensions 1536×1024 / grille 2×2
  vérifiées ; SHA-256 des dix planches précédentes inchangés. Un brouillon de
  montée a été écarté ; les prompts décrivent la correction de cadrage/échelle.
- **PASS** `qa-jaspe-standing` : ordre montée/descente, gestes, interruption en
  montée, durée, thème, mouvements réduits, désactivation, asset manquant sans
  boucle réseau et absence de débordement à 390/320 pixels.
- **PASS** `qa-jaspe-voice` : 1440 clair / 390 sombre, explication debout jusqu'à
  la fin de la voix simulée et retour assis ; arrêts, micro, changement de compte
  et dialogue avec clavier restent couverts. `qa-jaspe-dashboard`,
  `qa-jaspe-seated`, accès assistant, contrat visuel et permissions (3/3) : PASS.
- Syntaxe JavaScript et `git diff --check` : PASS. Pas de changement métier,
  permissions, base, argent ou migrations ; aucun test SQL nécessaire pour ce lot.
- Capture comparative clair/sombre inspectée et nouvelle animation vérifiée dans
  le navigateur intégré. Son ancien cache gardait d'abord le lecteur précédent ;
  rechargement de l'application puis de l'aperçu effectué, nouvelle pose confirmée.
  Question « Qui es-tu ? » essayée dans le tableau de bord de démonstration sombre.

### Limites et prochaine action

Animation par poses avec fondu court, fonds intégrés : ce n'est pas une animation
continue ni une synchronisation phonétique. Les planches conservent de légères
variations de dessin entre les poses. Micro humain, qualité sonore et téléphone
physique restent à valider comme au lot vocal précédent.

Prochaine action : faire essayer au propriétaire une explication écrite puis
audio sur son appareil et recueillir son retour sur le rythme montée/retour et
la voix. Les développements du plan assise/debout sont livrés ; ne pas élargir
ce lot à un raccordement IA/Cloudflare. Réserves métier Le Sage/P5/base réelle
inchangées. `.claude/` et les deux PNG utilisateur à la racine restent hors lot.

Lot Git : `feat(jaspe): se lever et expliquer au tableau de bord` ; SHA dans Git.
Synchronisation annoncée uniquement après comparaison HEAD/branche distante.

---

## Historique — 16 septembre 2026 : parcours vocal et interruption

Le propriétaire a repris le chantier par « GO » après les conseils sur le naturel
des gestes et la validation du parcours vocal. La clôture précédente est historique.

### Livré

- Boutons **Écouter la réponse / Couper la voix** dans le bandeau et la boîte
  flottante : relecture de la réponse courante, sans historique ni enregistrement.
- Une nouvelle question écrite interrompt le micro et la voix précédents ; une
  réponse identique à la précédente peut être prononcée de nouveau.
- Statuts du micro corrigés à la fin de l'écoute, erreurs distinctes (silence,
  refus, connexion, capture) et retour écrit conservé. Les événements tardifs
  d'une écoute ou d'une voix remplacée sont ignorés.
- Gestes de parole jusqu'à la fin réelle de l'énoncé, interruption immédiate pour
  écouter, également en corps entier. Le moteur entier ne reçoit plus les gestes
  du bandeau lorsqu'il est caché. Les refus/alertes gardent leur priorité.
- Compteur de changement de contexte, sans identifiant exposé : il arrête audio et
  micro même entre deux comptes autorisés ; sortie/onglet caché arrêtent aussi l'audio.
- Dialogue ajusté à `visualViewport` : commandes accessibles quand le clavier réduit
  la hauteur visible. Contrôles en clair/sombre ; cache applicatif renouvelé.

### Fichiers et contrôles

- `dashboard-companion.js`, compteur dans `safe-assistant.js`, boutons dans
  `index.html`, `jaspe-dashboard.css`, `sw.js`, contrat de cache, nouveau
  `qa-jaspe-voice.cjs`, décisions et ce handoff. Aucun asset graphique modifié.
- Défauts reproduits avant correction : statut « Je vous écoute » après fin du
  micro ; champ de saisie inaccessible dans la boîte à 390×360. Corrigés.
- Contrôles navigateur **PASS** : `qa-jaspe-voice` (1440/390, clair/sombre, arrêt/relecture,
  question répétée, événements tardifs, changement de compte autorisé, erreurs,
  commandes à 390×360) et `qa-jaspe-dashboard` (bureau/mobile/paysage, permissions,
  compte, réponse unique, sombre/mouvements réduits). Adaptateurs audio simulés.
  La parole reste active au-delà des anciennes 4,5 secondes ; captures du dialogue
  mobile et à hauteur réduite inspectées.
- Accès assistant, contrat visuel, permissions 3/3, physique 5 tests + contrat,
  syntaxe JS et `git diff --check` : PASS. Aucun test SQL/migration/argent relancé,
  ces couches ne sont pas modifiées.
- Essai dans le navigateur intégré, sans adaptateur : préparation puis fin de
  lecture observées, seconde lecture interrompue par le bouton, démarrage du
  micro observé, micro arrêté à la reprise/arrêt de la lecture. Pas de phrase
  humaine transcrite validée ; qualité acoustique et téléphone réel non vérifiés.
- Aucune modification du backend, des permissions métier, des données ou du SQL.
  GLM/Cloudflare et synchronisation phonétique restent hors de ce lot.

### Suite demandée pendant le lot

Le propriétaire souhaite que JASPE puisse aussi se lever dans le bandeau, visible
par le haut du corps, avec images adaptées à l'arrière-plan. Proposition expliquée :
bureau fixe masquant le bas, étapes assise → appui sur les mains → debout/explique →
retour assis, même identité et deux thèmes. **Idée discutée, images non produites et
transition non implémentée dans ce lot vocal.** À concrétiser à la prochaine demande.

Prochaine action : recueillir le retour sonore du propriétaire et essayer une phrase
au micro sur son appareil ; puis reprendre sa demande de transition assise/debout.
Les réserves métier Le Sage/P5/base réelle restent valides. Les fichiers utilisateur
non suivis (`.claude/` et deux PNG racine) sont préservés hors du lot.

Lot Git : `fix(jaspe): fiabiliser le parcours vocal`. SHA dans l'historique Git ;
annoncer la synchronisation uniquement après comparaison HEAD/branche distante.

---

## Historique — clôture du 16 septembre 2026 : parole avec les deux mains

Le propriétaire a demandé le mouvement de parole avec les deux mains, puis la
clôture du chantier courant. Aucun nouveau développement à lancer sans sa reprise.

- Deux nouvelles planches `parole-deux-mains-clair.png` / `-sombre.png` : quatre
  étapes chacune. Total **10 planches / 40 vignettes**, 16,28 Mio. Les huit planches
  précédentes sont inchangées (SHA-256 comparés au manifeste antérieur).
- Action fermée `speakBoth`, rythme propre, bouton « Parler · deux mains » dans
  l'aperçu ; la lecture vocale conserve le geste sélectionné. Les états métier
  `TalkHandsOpen` / `TalkPassionately` et l'accueil utilisent l'intention existante
  `explain`, traduite en deux mains pour la pose assise. Corps entier inchangé.
- Fichiers : deux PNG, manifeste et prompts dédiés, README des assets,
  `seated-companion.js`, `dashboard-companion.js`, aperçu, contrôles navigateur,
  version du cache et contrat associé, décisions et ce handoff.
- Contrôles : dimensions 1536×1024/grille 2×2/hashes PASS ; syntaxe JS PASS ;
  `qa-jaspe-seated` PASS (5 actions/deux thèmes, voix simulée avec deux mains,
  pause, mouvements réduits, 390/320) ; contrats visuels et accès assistant PASS.
- `qa-jaspe-dashboard` PASS : réponse avec deux mains, sortie entière, retour,
  texte/audio simulé, refus de permission, changement de compte, sombre et
  mouvements réduits. Aucune modification des permissions, données métier ou SQL.
- Limites inchangées : fonds intégrés, animation par poses, pas de synchronisation
  phonétique ; microphone réel/voix réelle non validés par ces tests simulés.
- Aperçu : `http://127.0.0.1:4176/jaspe-assise-preview.html#deux-mains`.
- Lot : `feat(jaspe): parole avec les deux mains`. SHA dans Git, miroir à
  confirmer après push. Fichiers utilisateur non suivis préservés.

**À la reprise :** demander le prochain objectif au propriétaire. Les réserves
métier et de voix du lot précédent restent documentées ci-dessous.

---

## Lot précédent — 16 septembre 2026 : JASPE assise, planches animées

### Demande et livraison

- Le propriétaire a demandé de remplacer la coupure du buste par une JASPE
  réellement assise à son bureau, puis des images regroupées par mouvement.
- **8 planches / 32 vignettes** : parole avec geste de main, réflexion/main dans
  les cheveux, sourire/clignement, lecture souriante ; chaque action en clair et
  sombre. La dernière correction ajoute le sourire pendant la lecture.
- Sources générées avec l'outil intégré, à partir de JASPE v12 ; les deux poses
  statiques initiales sont conservées dans `docs/design/jaspe-assise-v1/`.
- `app/assets/jaspe2d/assise-v1/` : PNG 1536×1024, grille 2×2, cadres 768×512,
  13,01 Mio pour les 8 planches, prompts et manifeste SHA-256.
- `seated-companion.js` : séquences temporisées, chargement à la demande,
  transitions courtes, façade avant du bureau fixe, thèmes, repos/clignement et
  lecture occasionnelle. Pause hors écran/onglet caché, mouvements réduits,
  conservation de la pose précédente si une planche ne charge pas.
- `dashboard-companion.js` raccorde les intentions fiables et les événements
  début/fin de synthèse vocale. Le moteur v12 existant sert toujours la sortie
  entière ; sa surface enregistrée reste `workspace-bust`, avec `isBust=false`.
- Mise en page assise bureau/mobile, scripts/styles chargés et cache renouvelé.
- Aperçu rejouable : **http://127.0.0.1:4176/jaspe-assise-preview.html**.
  Ancien aperçu statique sur 4180, application principale sur 4176.

### Contrôles et limites

- Contrôles de géométrie : 8 PNG, grille/dimensions conformes, hashes sauvegardés.
- `qa-jaspe-seated.cjs` : PASS pour les quatre actions/deux thèmes, changement
  d'images, audio simulé début/fin, pause, pause hors écran, mouvements réduits,
  largeurs 390/320, aucune erreur JavaScript.
- `test:jaspe-physical` (5 tests + contrat), `qa-responsive-visual-system`,
  `qa-safe-assistant-access`, permissions (3 tests) : PASS.
- `qa-jaspe-dashboard.cjs` : PASS bureau/mobile/paysage, appui prolongé,
  moteur entier conservé, fermeture/retour, réponse unique, audio simulé pilotant
  les poses, refus de permission, changement de compte, sombre/mouvements réduits.
  Le test attend maintenant la visibilité après la transition de compte.
- Aucun test SQL/argent/migration relancé : aucune modification de ces couches.
- Les essais de transparence ont produit un damier opaque et ont été écartés.
  Les planches retenues ont un **fond intégré**, pas d'alpha. Petites variations
  génératives possibles entre cadres ; animation de poses, pas vidéo interpolée.
- La voix navigateur est testée par adaptateur simulé ; microphone réel et
  synchronisation phonétique non validés. GLM/Cloudflare reste non raccordé ici.
- Aucun nouveau stockage de conversation, aucune extension de permissions,
  aucune modification du moteur v12 ou de ses assets verrouillés.

### Prochaine action exacte

1. Rejouer les actions dans l'aperçu animé avec le propriétaire et vérifier la
   voix réelle du navigateur. Tester ensuite le bandeau clair/sombre et la sortie
   entière dans l'application principale.
2. Affiner uniquement les gestes ou transitions signalés ; une animation plus
   fine demandera davantage d'intermédiaires ou des calques réellement séparés.
3. Les réserves métier du lot précédent (Le Sage, P5, base réelle) restent valides.
4. `.claude/` et les deux références originales non suivies restent hors du lot.

Lot à identifier par `feat(jaspe): poses assises animees par action` dans Git.
Synchronisation à annoncer après comparaison directe HEAD/GitHub.

---

## Historique — 16 septembre 2026 : buste initial et sortie entière

Cette section conserve le premier lot du 16 septembre. Son cadrage en buste et
sa prochaine action visuelle sont remplacés par l'état actif ci-dessus. La demande
directe du propriétaire autorise la reprise du chantier frontend dans ce compte.

### Demande et résultat

- Reprendre les références bureau/mobile avec **la JASPE existante**.
- Bandeau commun aux tableaux de bord (y compris Parent/Enseignant/Gardien), buste
  v12 animé, accueil lié au profil courant, texte + bouton d'envoi + micro sur place.
- Appui prolongé **450 ms** sur JASPE (personnage ou bouton mobile) : sortie en corps
  entier, même instance déplacée dans une boîte flottante non modale. Clic/clavier
  possibles. Fermeture par croix/Échap, retour au bandeau.
- Corrections du propriétaire intégrées : discussion **sans quitter le bandeau**,
  audio entrant/réponse vocale via Web Speech lorsque disponible, **aucun historique
  de chat**. Seule la réponse courante est gardée en mémoire.
- Interface pâle/discrète, sombre/mouvements réduits ; fonctionnalités avant services
  sur bureau, services existants également accessibles dans la vue mobile.

### Corrections techniques et fichiers

- `app/modules/jaspe2d/dashboard-companion.js` (nouveau) : montage unique, appui
  prolongé, dialogue flottant, écoute explicite, lecture des réponses, contrôle accès.
- `app/styles/modules/jaspe-dashboard.css` (nouveau) : buste/corps entier,
  responsive, chat discret, bouton JASPE mobile et ajustements du tableau de bord.
- `app/index.html`, `app/app.js` : chargement réel de SafeAssistant, raccordement
  des surfaces, bandeau commun ; ancien bloc de panneau extrait/consolidé (retrait
  du polling et des multiples montages à chaque rendu du tableau de bord).
- `app/modules/jaspe2d/jaspe2d.js` : visibilité/cadrage injectables,
  paramètres de connexion conservés par défaut. Aucun nouvel asset ni identité.
- `app/modules/safe/safe-assistant.js` : présentation intégrée, réponse courante
  seule, retrait du journal de 30 entrées, correction de la capture du bouton
  d'envoi, nettoyage sur changement de contexte/refus de permission.
- `app/server.mjs` : microphone limité à `self` (autorisation utilisateur toujours
  requise), caméra et géolocalisation toujours interdites.
- `app/sw.js` et contrats de cache : nouvelle version pour publier les scripts.
- `app/qa-jaspe-dashboard.cjs` (nouveau), contrats JASPE/visuel adaptés à la version.
- `docs/DECISIONS.md`, ce handoff : décisions et résultats du lot.
- Les changements JASPE non committés du 15/09 sont intégrés/consolidés ici.
  Les quatre commits locaux préexistants de `9298c85` à `e26ecef` sont conservés.
  Aucun serveur métier ni SQL modifié.

### Vérifications réellement exécutées

- Playwright `node app/qa-jaspe-dashboard.cjs` : PASS sur 1440×1000, 390×844,
  320×640 et 844×390 ; appui prolongé avant relâchement, même moteur, aucun
  débordement, saisie dans le bandeau, réponse unique, fermeture/retour, absence de
  stockage de conversation, audio simulé dans le bandeau, refus même admin,
  nettoyage entre contextes, Parent, mode sombre et mouvements réduits.
- Captures inspectées : bureau, mobile, sortie entière, petit écran, paysage, sombre.
- `qa-safe-assistant-access`, `qa-responsive-visual-system`,
  `qa-no-guardian-screen` : PASS. `test:jaspe-physical` : 5 tests + contrat PASS.
- Permissions : 3/3 PASS ; manifestes migrations : 9 sets / 27 unités PASS.
- Syntaxe JS contrôlée. En-tête local vérifié : microphone=(self).
- Audio testé avec adaptateur Web Speech simulé, **pas avec un microphone réel**.
  Aucune affirmation de validation vocale réelle ou de connexion Cloudflare.

### Limites et prochaine action exacte

1. Faire valider visuellement le résultat au propriétaire sur le port **4176** et
   essayer le microphone réel dans son navigateur (support/autorisation requis).
2. Les réponses utilisent l'assistant métier/local existant. Le modèle distant
   GLM/Cloudflare et la synchronisation labiale ne sont pas raccordés ici.
3. Ne pas confondre les anciens lots visuels « P4 terminé » avec la preuve du cœur
   métier : le retrait des enfants comporte encore des parcours démo BACKEND_LATER.
   Vérifier ces parcours avant de déclarer Le Sage opérationnel.
4. Puis P5 : sauvegarde/restauration exécutée et SQL sur base réelle. Le désaccord
   documentaire Docker/AGENTS.md est antérieur et non arbitré dans ce lot.
5. `.claude/` et les deux images originales non suivies à la racine appartiennent à
   l'environnement/références de l'utilisateur : préservés hors du commit.

### Livraison Git

Lot à identifier par `feat(jaspe): compagnon flottant et reponse sans historique`.
SHA exact dans `git log`. Synchronisation annoncée seulement après push et comparaison
directe de HEAD avec GitHub ; ce document ne contient pas son propre SHA.

---

## Historique conservé — rapports du 15 septembre (remplacés par l'état actif ci-dessus)

Dernière mise à jour : 15 septembre 2026 — Lot JASPE hero vivant + log intégré.

### Rapport — Lot JASPE hero (2.5D vivant + log de conversation intégré)

```text
PRÉVU :    JASPE 2.5D VIVANTE (moteur jaspe2d.js, pas d'image statique)
           dans le hero desktop + mobile, en BUSTE (membre supérieur,
           corps coupé par le bas) ; LOG DE CONVERSATION COMPLET intégré
           au hero (teinte pâle discrète) ; suppression du bouton séparé
           « Écrire » (remplacé par le champ intégré) ; bouton Audio
           conservé ; clic sur Jaspe → sortie flottante (panneau) ;
           suppression des anciennes sections chat fixes redondantes.
FAIT :     index.html : hôtes vides #jaspeHeroCharacterDesktop/Mobile
           montés par le moteur 2.5D ; log data-jaspe-chat + champ +
           bouton send intégrés sous les 3 badges (desktop + mobile) ;
           anciennes sections chat fixes (desktop + mobile) supprimées.
           app.js : mountJaspeHero2d() monte SchoolSafeJaspe2d.mountShowcase()
           (variants explain/idle/wave en rotation + réactions
           listening/thinking/speaking/congratulate/worried) ; clic sur
           le buste → openJaspePanel(). dashboard-liquid-glass.css :
           recadrage buste (object-fit cover, top center) ; styles
           .jaspe-hero__chat pâles + contre-poids mode sombre.
           safe-assistant.js : câblage du bouton data-jaspe-chat-send
           (même mécanisme que Enter → openWithQuery).
TESTS :    node --check app/app.js OK · node --check safe-assistant.js OK ·
           git grep confirme hôtes + montage + boutons send (desktop 427,
           mobile 572).
NON TOUCHÉ: jaspe-governance, endpoint /native/jaspe/chat, serveur, SQL.
RISQUES :  validation visuelle navigateur (4176) à refaire : buste coupé,
           log pâle lisible clair/sombre, clic → panneau flottant.
COMMIT :   en attente — sandbox bloque .git/index.lock ; commit + push
           avec élévation au prochain tour.
```

Dernière mise à jour : 15 septembre 2026 — Lot JASPE Étape A (buste hero + badges + sortie plein écran).

### Rapport — Lot JASPE Étape A (JASPE en buste dans le hero)

```text
PRÉVU :    JASPE en BUSTE uniquement dans le hero du dashboard (desktop +
           mobile), corps coupé par le bas (overflow hidden, ancrage bas) ;
           bulle de dialogue au-dessus ; 3 badges « Plus simple / Plus sûr /
           Plus serein » ; boutons Écrire + Audio ; au clic sur le bouton
           JASPE ou sur son avatar, elle sort EN TOTALITÉ (panneau plein
           écran existant #jaspePanel), responsive et lisible en mode sombre.
FAIT :     index.html : badges ajoutés sous la bulle desktop + hero mobile
           converti au traitement JASPE (avatar, bulle, badges, boutons
           data-jaspe-hero-action text/audio). dashboard-liquid-glass.css :
           recadrage buste (object-fit: cover, object-position: top center,
           avatar cliquable), styles badges Liquid Glass + contre-poids mode
           sombre, variante mobile. app.js : câblage des boutons du hero vers
           openJaspePanel() avec bascule du mode Écrit/Audio, clic sur
           l'avatar ouvre aussi la conversation plein écran.
TESTS :    node --check app/app.js OK · git grep confirme badges (desktop
           ligne 420, mobile ligne 568) + boutons data-jaspe-hero-action
           câblés (app.js ligne 2842) + styles CSS ligne 1082.
NON TOUCHÉ: moteur SafeAssistant, jaspe-governance, panneau plein écran
           (existant e26ecef), serveur, SQL, permissions.
RISQUES :  validation visuelle navigateur (port 4176) à refaire : vérifier
           que le buste est bien coupé par le bas du hero et que le recadrage
           « top center » ne coupe pas la tête sur petits écrans ; ajuster
           object-position si nécessaire.
SUIVANT :  étape B — poses dynamiques dans le hero (idle/listening/speaking)
           via le manifeste existant, puis docs + commit + push de ce lot.
```

Dernière mise à jour : 15 septembre 2026 — Lot JASPE P4-ter (chat fixe + 2.5D).

## ÉTAT ACTUEL

Architecture verrouillée le 14/09 : **1 plateforme SchoolSafe = plusieurs écoles isolées** sur un VPS central (Hostinger, Docker + Coolify), SchoolSafe Control co-hébergé mais logiquement séparé (séparation par privilèges, pas de conteneur par école ; isolation multi-écoles = `school_id` + PostgreSQL + ACCESS_LAW). License Contract V2 validé (spec G0). Déploiement officiel : **Git → Coolify → Docker → VPS**. Références visuelles officielles versionnées dans `docs/design/references/`. Règle de conduite : **VISION LARGE, LIVRAISON ÉTROITE**. Références design validées et versionnées (`a6d6b8f`).

```
ÉTAT ACTUEL            Phase A + P2 + P3 + P4 complétés + P4-ter JASPE clôturé
DERNIÈRE ÉTAPE         P4-ter JASPE (commit b809149) : bulle de dialogue
                       AU-DESSUS de la tête, historique borné 30 entrées,
                       sections chat fixes dashboard desktop+mobile, JASPE
                       2.5D réel (attente-v13), sortie totale Échap. QA verts.
                       Commit séparé 5de51f9 : rangée Écosystème + Liquid Glass.
ÉTAPE EN COURS         P4-ter clôturé — prêt pour P5 backup + rejeu base réelle
ORDRE À SUIVRE         P5 backup + rejeu base réelle · P6 extensions
```

### Rapport — Lot P4-ter (JASPE : chat fixe dashboard + bulle + 2.5D)

```text
PRÉVU :    bulle de dialogue AU-DESSUS de la tête de Jaspe quand elle flotte ;
           section chat FIXE du dashboard « comme un ChatGPT » (desktop +
           mobile) ; personnage JASPE 2.5D réel ; sortie dans sa totalité.
FAIT :     safe-assistant.js : placement bulle prioritaire "top" (repli
           latéral si espace insuffisant) ; historique de conversation borné
           30 entrées (Vous/Jaspe) rendu dans la bulle ; mirrorDashboardChats()
           synchronise les sections [data-jaspe-chat] (desktop + mobile) avec
           saisie Enter câblée sur openWithQuery() ; fermeture totale par
           Échap en plus du ✕ et du toggle compagnon ; mountJaspe2D() charge
           le personnage réel attente-v13/adossee-detouree.png (repli libellé
           si image manquante). index.html : section chat Jaspe en tête de la
           colonne droite dashboard + section mobile après les alertes.
           dashboard-liquid-glass.css : styles Liquid Glass modérés (log,
           lignes historique, champ pilule) + contre-poids mode sombre +
           prefers-reduced-motion. Commit séparé préalable 5de51f9 : rangée
           Écosystème SchoolSafe + extension Liquid Glass (travail en attente
           isolé pour ne pas mélanger les lots).
TESTS :    node --check safe-assistant.js OK · qa-safe-assistant-access PASS
           (FE-SEC-A3A4) · qa-no-guardian-screen PASS · test:visual-system
           PASS (contrat responsive + suppression guardian).
COMMIT :   5de51f9 (écosystème + liquid glass) · b809149 (JASPE P4-ter).
NON TOUCHÉ: serveur, SQL, permissions.json, spec G0, DECISIONS.md, modules
           métier — lot frontend pur, API SafeAssistant publique inchangée.
RISQUES :  la bulle au-dessus peut recouvrir du contenu si Jaspe est placée
           tout en haut (le clamp existant préserve la lisibilité) ;
           validation visuelle navigateur sur 4176 à refaire avant push.
```

### Rapport — Lot P3 (enforcement backend licence)

```text
PRÉVU :    hook d'application backend bloquant les routes /native/* quand
           la licence n'est pas active ou en grâce ; error code dédié ;
           tests d'enforcement (blocage, exception CORE, grâce, isolation).
FAIT :     server/src/licensenative/gate.ts (nouveau) : hook Fastify
           onRequest avec cache TTL 60s par schoolId, exclusion explicite
           /native/license et /native/trial (CORE non licenciable), lecture
           état via licenseService.readState. server/src/http/errors.ts :
           ajout ApiErrorCode LICENSE_INACTIVE. server/src/native-app.ts :
           création licenseService conditionnelle + registerLicenseGate
           après buildApp. Tests : server/tests/licensenative-gate.test.ts
           (5 scénarios : blocage inactive, exception license, exception
           trial, autorisation grâce, isolation inter-écoles).
TESTS :    licensenative 15/15 PASS · licensenative-gate 5/5 PASS ·
           typecheck PASS · total 20/20 tests licence verts.
MODIFIÉ :  server/src/http/errors.ts (+1 error code) ·
           server/src/native-app.ts (câblage gate + service) ·
           server/src/licensenative/gate.ts (nouveau) ·
           server/tests/licensenative-gate.test.ts (nouveau).
NON TOUCHÉ: frontend, SQL, permissions.json, spec G0, DECISIONS.md.
RISQUES :  cache TTL 60s = révocation prend effet au plus tard après 60s
           (acceptable V1, documenté) ; HMAC octet-exact reste à durcir
           avant exposition publique (même chantier que upload logo).
```

### Rapport — Lot P2 (isolation inter-écoles)

```text
PRÉVU :    balayage complet anti-fuites, corrections, verrou statique.
FAIT :     sweep de TOUS les database/**/*.sql + requêtes serveur :
           138 requêtes métier analysées, 4 candidats — 2 faux positifs
           justifiés (provision_bridge : le prédicat id = v_school EST
           la frontière), 2 corrigés : sommes de solde (record_payment/
           cancel_payment) désormais filtrées p.school_id = v_school_id
           (manifeste baseline régénéré) ; setup.createAdmin rattaché à
           l'école du flux (closure setupSchoolId) au lieu de « la
           dernière école globale ». Verrou nouveau : sweep dépôt avec
           liste blanche documentée. Surfaces saines confirmées :
           auth-adapter/pool/readiness (hors métier), services natifs
           (gate active-path Phase A).
TESTS :    sweep 1/1 · permissions 3/3 · migrations 9 sets/27 ·
           statiques 52/52 · typecheck · 56/292 tests PASS.
COMMIT :   7a7f9e8.
```

### Rapport — Lot 1, Tâche 7 (gate active-path + clôture Phase A)

```text
PRÉVU :    gate de régression statique + suite critique ciblée + clôture
           documentaire (plan, étapes 1-6).
FAIT :     native-access-contract.test.ts (code exact du plan) — les 5
           services humains ne contiennent aucun businessPool.query< et
           contiennent withRequestContext ; suite critique ciblée 9
           fichiers/37 tests ; batterie complète : permissions 3/3,
           migrations 9 sets/27 units, statiques 52/52 (access, cibles,
           baseline, finance, pedagogy, cards, versions), typecheck,
           56 fichiers/292 tests serveur. BASELINE_REPORT : section
           « Phase A » ajoutée (résumé, bugs trouvés, preuves, limites).
           DECISIONS.md non modifié (aucune décision architecturale
           nouvelle dans ce lot).
TESTS :    tous exécutés, tous verts — voir ci-dessus.
COMMIT :   ce lot (code + docs).
RISQUES :  inchangés et documentés — rejeu base réelle (P5), iam machine,
           HMAC octet-exact, allowScripts Esbuild.
```

### Rapport — Lot 1, Tâche 6 (manifestes + contrats statiques modules)

```text
PRÉVU :    enregistrer finance/pedagogy/cards dans l'intégrité des
           migrations + contrats statiques par module (plan, étapes 1-6).
FAIT :     attente étendue 9 sets (échec constaté) ; 3 générateurs + 3
           manifestes (finance 2, pedagogy 1, cards 2 unités) ; contrôleur
           étendu après access ; compteur 27 (26 plan + unité access 03 de
           la tâche 5 — écart documenté) ; 15 tests de contrats nouveaux ;
           BUG RÉEL trouvé par le contrat school_id et corrigé :
           parent_children_list/parent_student_grades utilisaient
           guardian_profile_id/relationship (colonnes inexistantes —
           profile_id/guardian_type), ce qui aurait planté à l'exécution ;
           contraintes school_id ajoutées ; manifeste pedagogy régénéré.
TESTS :    statiques modules 15/15 · access+cibles+baseline 35/35 ·
           migrations 9 sets/27 units PASS (×2 contrôles) · gate
           permissions 3/3 · typecheck PASS · 55 fichiers/287 tests PASS.
MODIFIÉ :  15 fichiers (3 SQL manifestes + 3 générateurs + 3 tests statiques
           + contrôleur + compteur + 1 SQL pedagogy corrigé).
COMMIT :   b5d24b6.
```

### Rapport — Lot 1, Tâche 5 (autorité machine Control)

```text
PRÉVU :    séparer l'autorité machine Control de l'accès humain (plan,
           étapes 1-6) : callbacks signés HMAC, zéro SQL si non signé,
           jamais de profileId humain fabriqué.
FAIT :     SQL api.set_control_context (unité access 03, manifeste
           régénéré 3 unités, compteur 22) ; db/control-authority.ts
           (vérification HMAC fenêtre 300 s + exécuteur machine) ;
           controlprintnative réorganisé (requêtes des routes déplacées
           dans le service ; liste d'impression ENFIN filtrée par école —
           fuite P2 corrigée au passage) ; nouveau callback machine
           POST /native/control/print/status (401 + zéro SQL si non
           signé) ; controlConfig câblé dans les dépendances de routes ;
           code erreur ACCESS_DENIED (union ApiErrorCode existante).
TESTS :    typecheck PASS · 55 fichiers / 287 tests PASS (+3) · gate
           permissions 3/3 · migrations 6 sets/22 units PASS.
MODIFIÉ :  1 SQL + manifeste, 2 fichiers src controlprintnative, 1 nouveau
           db/control-authority.ts, native-app.ts (câblage), 1 test
           nouveau, compteur de migration.
NON TOUCHÉ: cardsnative (callbacks carte restent côté Control minimal),
           frontend, G0-B (enforcement licence = P3).
COMMIT :   07f0508.
RISQUES :  1) sémantique du contexte machine dans iam.* (les RPC Control
           appellent require_access qui exige un profil) — à valider sur
           base réelle en P5 ; 2) signature HMAC porte sur JSON.stringify
           (re-sérialisation) — vérification octet exact à durcir avant
           exposition publique (même chantier que l'upload logo).
```

### Rapport — Lot 1, Tâche 4 (contextualisation des services natifs)

```text
PRÉVU :    toute requête humaine s'exécute dans withRequestContext
           (plan, étapes 1-8) : students (2 méthodes), finance (14),
           pedagogy (30), cards (méthodes DB) ; routes construisant le
           contexte uniquement depuis la session.
FAIT :     test élève étendu d'abord (ordre exact liste + ROLLBACK
           brouillon refusé) ; 3 fichiers de test nouveaux (paires
           lecture/écriture du plan) ; services réécrits méthode par
           méthode (aucune requête pool directe restante côté humain,
           vérifié par les tests d'ordre transactionnel) ; routes avec
           helper contextFrom(request) — aucun identifiant accepté du
           navigateur ; type de vérification : import manquant
           withRequestContext corrigé.
TESTS :    typecheck PASS · 54 fichiers / 284 tests PASS (était 51/276,
           +8 nouveaux, zéro régression) · gate permissions 3/3 ·
           migrations PASS · native-app + integration PASS.
MODIFIÉ :  7 fichiers src (students/finance/pedagogy/cards services+routes)
           + 4 fichiers de test.
NON TOUCHÉ: controlprintnative (tâche 5), licensenative/sessionnative/
           trialnative (déjà contextualisés), SQL, frontend.
COMMIT :   0ae7ef6.
RISQUES :  getStudentFee lit encore app.student_fees en direct DANS la
           transaction contextualisée (même rôle, comportement conservé —
           à reprendre en RPC dédié dans un lot futur si souhaité).
```

### Rapport — Lot 1, Tâche 3 (cibles exactes des RPC)

```text
PRÉVU :    chaque opération métier fournit student_id/class_id/subject_id/
           contexte campagne à iam.require_access (plan, étapes 3-5).
FAIT :     test statique des cibles écrit d'abord → 3/3 échecs constatés →
           finance (frais/paiements/reçu : résolution élève+classe avant
           autorisation ; scan de contrôle : classe + contexte campagne
           jsonb pour assigned_fee_classes) ; pédagogie (listes filtrées
           par ligne iam.can_access ; écritures avec paire classe+matière
           exacte ; update/publish/delete résolvent la cible depuis la ligne) ;
           projections parent (grade.read + classe résolue, notes publiées
           uniquement) ; student_averages qui n'avait AUCUNE vérification
           est désormais autorisé ; cartes (classe résolue avant
           cards.request.print ; fonctions Control déjà contraintes
           school_id — vérifié, inchangées).
TESTS :    cibles 3/3 · access+baseline 32/32 · gate permissions 3/3 ·
           migrations PASS · typecheck PASS · 276/276 tests serveur.
MODIFIÉ :  4 SQL natifs + 1 test statique nouveau.
NON TOUCHÉ: services TypeScript (tâche 4), frontend, manifestes (ensembles
           non encore enregistrés — tâche 6).
COMMIT :   05e75e9.
RISQUES :  RPC prouvés par contrats statiques ; rejeu sur base réelle
           planifié avant VPS (P5) — inchangé.
```

### Rapport — Lot 1, Tâche 2 (vocabulaire canonique)

```text
PRÉVU :    mapping exact des codes legacy SQL vers le catalogue canonique
           (table du plan) + 4 permissions ajoutées + grants rôles.
FAIT :     test échouant écrit d'abord (doesNotMatch legacy) → échec constaté ;
           33 littéraux remplacés ligne par ligne selon le contexte fonction
           (devoirs→pedagogy.assignment.*, notes→pedagogy.grade.*, affectations
           enseignants→school.structure.manage, palmarès→palmarques.*,
           caisse ouverte/fermée séparées) ; +4 codes au catalogue et au seed
           (64 total) ; admin 60→63, cashier +caisse.open ; cards.print.manage
           à autorité control, non attribuée aux rôles école ; manifestes
           baseline/access régénérés ; compteurs figés mis à jour.
TESTS :    access-static + baseline static 32 pass/0 fail · gate
           check:permissions 3/3 VERT (était 41 littéraux) · migrations
           6 sets/21 PASS · typecheck PASS · 276/276 tests serveur.
MODIFIÉ :  5 SQL natifs, permissions.json, seed, role_templates, 2 tests
           statiques, 2 manifestes.
NON TOUCHÉ: services TypeScript, frontend, seed des données (ordre SQL préservé).
COMMIT :   eace2e2.
RISQUES :  RPC SQL modifiés non rejoués contre une base réelle dans ce lot
           (contrats statiques uniquement) — rejeu prévu avant VPS, lot P5.
```

## CE QUI ÉTAIT PRÉVU

Étape 0 : corriger `DECISIONS.md`, `V2_CHARTER.md`, finaliser la spec G0, mettre à jour le handoff, vérifier l'absence de décisions obsolètes présentées comme actives, vérifier le diff, committer, donner le SHA — avec les 11 corrections du propriétaire et la règle permanente de continuité (ajout, jamais suppression d'historique).

## CE QUI A ÉTÉ FAIT

- `docs/DECISIONS.md` : décision Docker 12/09 marquée **OBSOLÈTE — remplacée** (conservée) ; 15 décisions du 14/09 ajoutées avec statuts (Docker/Coolify + chaîne Git→Coolify→Docker→VPS et ses 10 règles, VPS central multi-écoles, school_id UUID + school_code, identité globale + memberships avec résolution de contexte corrigée, OTP abstrait, PostgreSQL souverain + retrait progressif Supabase, Control minimal, VISION LARGE/LIVRAISON ÉTROITE, priorités P1-P6 avec distinction cœur/Guardian avancé, sauvegarde/restauration testée, dépôt = vérité opérationnelle, License Contract V2, règle de continuité permanente). La répartition Claude/ChatGPT **n'y figure pas** (règle opérationnelle, voir plus bas).
- `app/docs/V2_CHARTER.md` : § Modèle de déploiement remplacé par la formulation validée (VPS central multi-écoles, school_id/school_code, memberships avec résolution automatique ou sélection tenant-aware, serveur seul arbitre du contexte école) ; § Frontières de sécurité : « Supabase » → « PostgreSQL, ses rôles » ; note d'historique ajoutée (rien de supprimé).
- `docs/PROJECT_CONTEXT.md` : puce « sans Docker » marquée OBSOLÈTE (historique conservé).
- Roadmap 13/09 : bannière de statut ajoutée (points Docker et VPS remplacés, lot 12 à traduire en exploitation Git→Coolify→Docker→VPS ; aucune tâche modifiée).
- Spec G0 (`docs/superpowers/specs/2026-09-14-schoolsafe-license-service-entitlements-design.md`) : finalisée et validée — architecture cible, identités (school_id/school_code, memberships), License Contract V2, migration V1, cycle de vie école, stockage R2 par `school_id`, ordre d'exécution Étape 0→6.
- `ops/deployment/README.md` : créé — chaîne de déploiement officielle et les 10 règles opérationnelles (anciennes méthodes marquées REMPLACÉES, pas supprimées).
- `docs/CURRENT_HANDOFF.md` : ce document, historique des lots précédents conservé ci-dessous.

## CE QUI A ÉTÉ MODIFIÉ vs NON MODIFIÉ

Modifié : uniquement des documents (décisions, charte, contexte, roadmap, spec G0, handoff, ops/deployment/README.md). **Aucun code modifié** — signature et vérification de licence en production inchangées, conformément à la consigne.

## TESTS / VÉRIFICATIONS EXÉCUTÉES

- Recherche des contradictions actives : occurrences de « sans Docker », « propre VPS », « 1 école = 1 VPS » toutes traitées (statut obsolète ou bannière).
- `git diff` relu avant commit (documents uniquement, diff sémantique lisible).
- Fins de ligne des deux fichiers serveur pré-existants isolées dans un commit séparé.

## PROBLÈMES RENCONTRÉS

- Aucun bloquant. Deux fichiers serveur (`server/src/financenative/routes.ts`, `server/src/studentsnative/routes.ts`) portaient des changements de fin de ligne antérieurs à l'Étape 0 : isolés dans un commit séparé pour ne pas polluer le diff documentaire.

## DÉCISIONS PRISES DANS CE LOT

Voir les 15 lignes du 14/09 dans `docs/DECISIONS.md` (toutes « Validées »), la spec G0 validée et `ops/deployment/README.md`.

## COMMIT(S)

- COMMIT A (documentation / Étape 0) : `docs(architecture): etape 0 coherence documentaire et contrat g0` — SHA inscrit dans `git log` (résumé en fin de message agent).
- COMMIT B (fins de ligne) : `chore: normalize line endings` — SHA inscrit dans `git log`.

## CE QUI RESTE À FAIRE / PROCHAINE ÉTAPE EXACTE

**Phase A — Tâche 1 : scanner du contrat de permissions** (`scripts/permission-contract.mjs` + tests + gate `check:permissions`), selon le plan canonique `docs/superpowers/plans/2026-09-13-schoolsafe-canonical-access-law.md`. Compatibilité vérifiée : le plan est compatible avec le modèle multi-écoles et le `school_id` UUID — la tâche 1 est un scanner statique de littéraux de permissions (sans rapport avec le tenant) ; les tâches 2-3 ciblent déjà des RPC scopés par école via `iam.require_access`. **Exécuter le plan tel quel, sans le réécrire.**

Ne commencer **aucune** fonctionnalité Écosystème, JASPE, Watch ou Control avancé entre les deux.

## RISQUES / POINTS À SURVEILLER

- Les trois failles prioritaires restent ouvertes : contexte de requête contourné dans 5 services natifs (Phase A), liste d'impression sans filtre `school_id` (P2), licence non appliquée par hook backend (P3).
- Supabase encore présent dans le dépôt (SDK, scripts, tests) : retrait uniquement via inventaire → migration → tests.
- Points résiduels G0 §11 : canal de provisionnement, supervision de l'activation, catalogue permission→service, fournisseur OTP.

## Historique — répartition des agents du 14/09

**REMPLACÉE le 16/09 pour le chantier fonctionnel par le plan commun à tous les
agents.** La répartition ci-dessous reste conservée comme historique. La règle
de vérification préalable et l'exclusivité des fichiers par lot restent applicables.

**Règle de vérification avant travail (ordre permanent, 14/09)** : avant toute
action sur un point, **vérifier d'abord ce qui est déjà fait sur ce point**
(preuve fraîche dans le code/tests, pas une supposition ni un document),
**corriger si nécessaire**, et **travailler ensuite**. Chaque lot/tâche
commence par ce point de vérification, dans l'ordre verrouillé.

```text
Claude :
- frontend ;
- serveur applicatif ;
- backend ;
- corrections du dépôt.

ChatGPT :
- architecture/exploitation VPS ;
- Docker/Coolify ;
- procédures ops ;
- cohérence infrastructure.

Toute modification d'exploitation produisant une configuration, un script
ou une procédure durable doit être répercutée dans le dépôt (dossier ops/).

Les zones de propriété doivent être explicites afin d'éviter que deux
agents modifient simultanément les mêmes fichiers critiques
(app/app.js, app/index.html : propriété exclusive Claude par lot).
```

## TRAÇABILITÉ

> Artifact Server indisponible dans l'environnement d'exécution de ce lot ; traçabilité assurée par les artefacts versionnés du dépôt (Git, DECISIONS.md, spec G0, handoff, historique des commits).

## Source de vérité

- Dépôt : `https://github.com/medygoo/schoolsafe-v` — branche `main`. Vérifier `git status`, `HEAD` vs `origin/main` avant reprise.
- Le serveur local correct sert le dépôt courant sur `http://127.0.0.1:4176/` ; le port `4175` sert une ancienne copie distincte.

---

# Historique — lots précédents (avant le 2026-09-14, conservé)

## Lots 2026-09-13 — fondations visuelles, baseline, JASPE

- **Lot 0A** : catalogue 60 permissions restauré, contrôle de migrations (6 sets/21 unités), hashes SQL LF/CRLF normalisés, `/config.setup_available` token-réel, CI verte (51 fichiers, 276 tests serveur), audit NPM 0 vulnérabilité. Rapport : `docs/BASELINE_REPORT.md`.
- **Lot 1** : contrat `test:visual-system`, tokens `--ss-*`, retrait glassmorphism/halos/`!important`, bandeau démo neutre, dashboards vérifiés 1440/390 px. Plan : `2026-09-13-schoolsafe-responsive-visual-system.md` (tâches 1-2).
- **Contrôleur physique JASPE** : neuf intentions fermées, traduction déterministe v12/WebP, arbitrage priorité, cycle de vie indépendant `.auth-screen`, raccordement connexion par intentions, repli `SPEAKING`.
- **Suppression écran `guardian`** : splash → connexion directe, styles retirés, permissions métier `school.guardian` conservées.
- Vérifications d'alors : `npm run ci` PASS, 57 tests statiques SQL PASS, `test:jaspe-physical` PASS, `qa-safe-assistant-access` PASS, `test:no-guardian-screen` PASS, navigateur 4176 (JASPE v12 visible, intentions observées), 5 profils sans débordement.
- Limites d'alors (toujours valides sauf mention contraire) : postinstall Esbuild à autoriser avant release ; upload logo à durcir (octets/signatures) ; assistant flottant non activé ; voix/GLM non implémentés ; `qa-pwa.cjs` s'arrête sur son ancien scénario hors session.
- Ancienne « Prochaine action » du 13/09 (remplacée par l'ordre P1-P6 du 14/09) : faire valider puis exécuter le plan canonique Access Law, puis la tâche 3 du plan visuel — cette séquence est maintenant intégrée aux étapes du 14/09.
