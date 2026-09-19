# Manifeste préparatoire — nouvelle base stable SchoolSafe

## Arbitrage final proposé le 19 septembre — validation attendue

Cette section complète l'inventaire initial sans le supprimer. **Aucune copie,
migration, fusion, suppression, publication ou modification produit effectuée.**
Les destinations sont des propositions à valider, pas des opérations exécutées.

| Chemin | Rôle | Pourquoi à revoir | Destination proposée | Risque si conservé | Risque si écarté |
| --- | --- | --- | --- | --- | --- |
| `.claude/launch.json` | Lancement local de l’assistant, d’après son nom ; contenu non lu. | Réglage du poste, non nécessaire au produit et non inspecté. | **EXCLURE** | Importer des chemins, commandes ou paramètres locaux inadaptés. | Perdre une commodité de lancement local ; aucun code produit perdu. |
| `.claude/settings.local.json` | Réglages personnels de l’assistant ; contenu non lu. | Configuration locale potentiellement sensible ou permissive. | **EXCLURE** | Transférer des autorisations ou paramètres privés du poste. | Devoir reconfigurer l’assistant sur le nouveau poste. |
| `.dockerignore` | Filtre du contexte de construction Docker. | Exclut shared/ alors que le catalogue de permissions est nécessaire. | **SCHOOLSAFE** | Conserver un conditionnement incomplet tant que le filtre n’est pas corrigé. | Élargir involontairement le contexte envoyé au build et perdre ses exclusions. |
| `AGENTS.md` | Consignes communes de travail et de continuité. | Ancienne interdiction Docker contradictoire avec les décisions plus récentes. | **SCHOOLSAFE** | Un agent pourrait suivre une consigne historique devenue obsolète. | Perdre les règles de continuité, de sécurité et de coordination. |
| `Dockerfile` | Construction et démarrage du serveur avec le frontend. | Chemins app/shared à aligner avec le serveur avant exploitation. | **SCHOOLSAFE** | Image potentiellement non fonctionnelle ; aucun build validé ici. | Perdre la recette existante Docker/Coolify et sa reproductibilité. |
| `app/modules/cards/cards-module.js` | Studio de génération et de soumission des cartes. | Lit encore /school/info, dépendance legacy non assemblée dans le serveur natif. | **SCHOOLSAFE** | Identité/logo de l’école incomplets dans certains parcours. | Casser l’usine de cartes, ses aperçus et ses commandes. |
| `app/modules/jaspe2d/jaspe2d.js` | Moteur JASPE, images de repli et helper de chat. | Le helper lit reply à la racine ; la route native renvoie data.reply. | **SCHOOLSAFE** | Réponse du relais distant mal interprétée ; dashboard local distinct. | Perdre le moteur et ses replis, affectant auth et dashboard. |
| `database/baseline/v1/review/SECRETS_APPLICATION.md` | Document relatif à l’application des secrets, d’après son titre ; contenu non lu. | Contenu non inspecté : aucune inclusion automatique dans un dépôt. | **EXCLURE** | Publier une procédure privée ou des valeurs sensibles éventuelles. | Omettre une procédure utile ; prévoir une version assainie après revue privée. |
| `database/cards/v1/03_cards_lifecycle.sql` | Perte, remplacement, réimpression et distribution des cartes. | Trois détections du contrôle statique inter-écoles préexistant. | **SCHOOLSAFE** | Conserver des points d’isolation à qualifier avant exploitation. | Supprimer une partie obligatoire du cycle de vie des cartes. |
| `database/devicehub/v1/02_devicehub_rpc.sql` | RPC d’administration et d’utilisation des terminaux. | Deux usages de school.settings.manage absents du catalogue canonique. | **SCHOOLSAFE** | Échecs d’autorisation possibles ; contrôle statique toujours en échec. | Casser les routes Device Hub et les dépendances SQL existantes. |
| `database/devicehub/v1/03_attendance.sql` | Enregistrement et application des présences. | Deux détections du contrôle statique inter-écoles préexistant. | **SCHOOLSAFE** | Conserver des points d’isolation à qualifier. | Perdre le schéma/RPC de présence et rompre les dépendances. |
| `database/family/v1/01_pickup_authorizations.sql` | Demande, validation, révocation et liste des autorisations de remise. | Quatre détections du contrôle statique inter-écoles préexistant. | **SCHOOLSAFE** | Conserver des points sensibles de remise d’enfant à qualifier. | Perdre les autorisations de remise et leurs contrôles. |
| `database/family/v1/02_primary_transfer.sql` | Transfert du responsable principal de l’enfant. | Deux détections du contrôle statique inter-écoles préexistant. | **SCHOOLSAFE** | Conserver des points d’isolation à qualifier. | Perdre le transfert contrôlé et sa traçabilité. |
| `database/family/v1/03_pickup_confirmation.sql` | Confirmation de remise physique de l’enfant. | Une détection du contrôle statique inter-écoles préexistant. | **SCHOOLSAFE** | Conserver un point critique de remise à qualifier. | Perdre la confirmation serveur et les contrôles associés. |
| `database/family/v1/04_student_import.sql` | Préparation, aperçu et validation des imports d’élèves. | Huit détections du contrôle statique inter-écoles préexistant. | **SCHOOLSAFE** | Conserver des points d’isolation des imports à qualifier. | Perdre le parcours d’import existant et son schéma. |
| `database/projections/v1/02_student_list.sql` | Liste d’élèves et création de brouillons. | Fichier SQL absent du manifeste des projections. | **SCHOOLSAFE** | Omission possible lors d’une installation ; ordre à qualifier. | Perdre les RPC utiles aux parcours élèves et cartes. |
| `database/setup/v1/01_setup_native.sql` | Création initiale de l’école et de son administrateur. | Unité hors des douze ensembles contrôlés par les manifestes. | **SCHOOLSAFE** | Installation initiale incomplète ou mal ordonnée. | Perdre le parcours natif d’initialisation. |
| `debug.log` | Journal local ; contenu non lu. | Peut contenir traces, chemins, jetons ou données privées. | **EXCLURE** | Divulguer des informations du poste ou des requêtes. | Perdre une trace locale de diagnostic, pas une dépendance produit. |
| `docs/PROJECT_CONTEXT.md` | Contexte durable obligatoire du projet. | Contient d’anciennes prochaines actions remplacées par le handoff. | **SCHOOLSAFE** | Mauvaise priorité de reprise si l’historique est lu comme actif. | Perdre le contexte, les invariants et un document obligatoire. |
| `package.json` | Workspaces, dépendances et commandes du projet. | Certaines commandes pointent vers des fichiers/répertoires absents. | **SCHOOLSAFE** | Ces commandes restent inexécutables jusqu’à clarification. | Perdre les dépendances, commandes de contrôle et la structure du workspace. |
| `server/src/cardsnative/batches.ts` | Production des ZIP, manifestes et notification de Control. | Aucune recette complète R2 → ZIP → Control dans cet inventaire. | **SCHOOLSAFE** | Parcours externe encore à qualifier ; ne pas le déclarer validé. | Supprimer les ZIP et manifestes exigés de l’usine. |
| `server/src/cardsnative/service.ts` | Demandes, images R2, transmission et cycle de vie des cartes. | Comportement sans R2/Control à qualifier ; submitted peut être trompeur. | **SCHOOLSAFE** | Afficher une soumission réussie sans transmission effective. | Supprimer l’API métier nécessaire à l’usine de cartes. |
| `worker-jaspe/wrangler.toml` | Configuration du Worker JASPE existant. | Paramètres liés à l’environnement ; reproductibilité à qualifier. | **SCHOOLSAFE** | Réutiliser des réglages d’une autre instance sans vérification. | Perdre la configuration du relais JASPE ; aucune modification fournisseur demandée. |

### Comptage réconcilié et destination unique

Les catégories initiales portent sur **761 fichiers recensés**, pas uniquement
sur Git : **756 suivis + 5 locaux**. Ces cinq fichiers sont
`.claude/launch.json`, `.claude/settings.local.json`, `debug.log`,
`ChatGPT Image 13 sept. 2026, 08_02_07 (1).png` et
`ChatGPT Image 13 sept. 2026, 08_03_44.png`.
Les six livrables de migration sont ajoutés séparément. Il ne manque pas cinq
fichiers à Git ; le périmètre de comptage différait et aurait dû être annoncé
plus explicitement.

| Destination exclusive | Total de fichiers sources | Détail |
| --- | ---: | --- |
| SCHOOLSAFE | **737** | 718 conservés + 19 des 23 lignes à revoir |
| CONTROL | **0** | Aucun code de l'application Control autonome présent dans cette source |
| ARCHIVE | **16** | Références/provenances visuelles versionnées ; chemins conservés, sans activation produit |
| EXCLURE | **8** | 4 contenus locaux/documentaires non inspectés + 2 sondes + 2 PNG locaux doublons |
| **Total source** | **761** | 737 + 0 + 16 + 8 |
| Documents de migration, séparés | **6** | Les six fichiers de ce dossier, aucun déjà compté dans les 761 |

Donc **753 fichiers sources retenus** (737 + 16), **759 fichiers proposés au
total avec les six documents**, et **767 éléments classés** en comptant les
huit exclus. Chaque chemin ne compte qu'une fois. Les ensembles de dépendances
cartes/JASPE/socle se chevauchent et ne doivent jamais être additionnés.
Le classement historique ARCHIVÉ de deux PNG locaux devient une destination
EXCLURE parce que leur contenu est déjà conservé par les références versionnées.
Les éventuels alias de fichiers identiques mais nécessaires à des chemins
runtime ne sont pas supprimés par une déduplication binaire.

**CONTROL = 0 ne signifie pas abandonner Control.** Les fichiers
`server/src/control-app/client.ts`, `controlprintnative/`,
`db/control-authority.ts`, `licensenative/control-client.ts`, les contrats et
leurs tests sont des adaptateurs de SchoolSafe et restent **SCHOOLSAFE**.
Les déplacer dans Control casserait leurs imports et le protocole appelant.
Le code souverain de Control doit provenir de son propre dépôt, hors de cet
inventaire. Les migrations IAM côté SchoolSafe ne deviennent pas des migrations
souveraines Control parce qu'elles contrôlent ses callbacks.

### Dernière vérification et limite sur les données sensibles

- **JASPE conservée dans la sélection** : 27 fichiers du moteur, 88 assets et
  manifestes, quatre fichiers SafeAssistant, quatre fichiers Worker, voix,
  gouvernance, intégrations et tests. **75/75 entrées de manifestes recontrôlées
  par SHA-256**. Les références graphiques archivées restent préservées.
- **Usine de cartes conservée dans la sélection** : 66 fichiers frontend dont
  60 patrimoines ; trois fichiers cardsnative, R2, ZIP/manifeste, routes et
  adaptateurs Control, SQL, permissions, contrats et tests. Aucun remplacement.
- **ACCESS_LAW et school_id conservés** : catalogue, core/access, IAM, moteur
  SQL, RLS, contexte/autorisation serveur, auth, projections dont 08, tests
  inter-écoles et documents obligatoires. **43 unités SQL déclarées retenues**.
  Les 984 références statiques de l'inventaire ont encore une cible retenue.
  Ces vérifications de conservation ne sont pas un nouveau test d'isolation.
- **Séparation d'autorité conservée** : `cards.print.manage` reste marqué
  `authority: control` ; signature vérifiée avant le callback machine,
  contexte machine distinct du contexte humain. Aucun privilège déplacé ou élargi.
- **Secrets connus exclus** : aucun chemin .env, clé privée, credentials,
  log, dump ou base locale dans les candidats ; les quatre contenus privés
  restent non consultés et exclus. Les objets R2 et les données PostgreSQL
  ne sont pas des sources à copier. `server/uploads/logos/` ne contient
  dans l'inventaire que son .gitkeep.
- **Scan local réellement exécuté : 566 fichiers texte candidats**, recherche
  de PEM privés, jetons GitHub/AWS/API, JWT et URL de base avec mot de passe :
  **zéro correspondance**, sans afficher de valeurs. Les noms de variables
  d'environnement dans le code ne sont pas des secrets.
- **Limite explicite : absence absolue de données sensibles non certifiée.**
  Ce scan ne vérifie ni les secrets de formats inconnus ni le contenu et la
  provenance des images. Les six `app/login-kid-1.jpg` à `login-kid-6.jpg`
  servent l'illustration de connexion ; leur provenance/autorisation n'est pas
  établie par les sources consultées. Ils ne sont pas affirmés sensibles, mais
  aucune garantie contraire n'est inventée. La sélection reste conditionnée à
  cette vérification de confidentialité avant toute copie. Cela ne demande
  pas d'afficher des images ou des données privées dans les documents.

Outil spécialisé indisponible : la commande
`Get-Command gitleaks -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source`
a retourné **code 1, sortie vide, aucun message d'erreur**. Aucune installation
ni modification de configuration. Le scan décrit ci-dessus est un contrôle
local de motifs, pas une exécution de Gitleaks.

**Arrêt pour validation du propriétaire.** La destination SCHOOLSAFE des fichiers
à revoir signifie conserver les implémentations et traiter leurs réserves ;
elle ne vaut pas autorisation d'exploiter les parcours non qualifiés.
Aucun transfert ne doit commencer tant que le périmètre et la réserve de
confidentialité ne sont pas résolus.

## Historique — manifeste préparatoire initial


Établi le **19 septembre 2026**, par Codex. **Aucune migration effectuée.**
Base de référence : branche **main**, commit **841d3efc54e7af62250b2980e450aa20ba5f2d40**,
incluant le correctif A5.1. Distant effectivement relu avec
`git ls-remote --heads origin main` :
**62df2b16ceca2e609c1789eba44afbe6fe278e19**. A5.1 reste local.
Le nouveau mandat interdit tout push, indépendamment de la condition Coolify
du mandat précédent. Aucun commit dans cette mission.

## 1. Liste exacte et règles de lecture

- [files.csv](files.csv) : **une ligne par fichier**, chemin exact, classement,
  action proposée, destination, présence Git, taille, SHA-256 et justification.
- [files.json](files.json) : même inventaire, provenance, règles, exclusions
  de répertoires et liste des six livrables documentaires à emporter.
- [dependencies.json](dependencies.json) : dépendances locales résolues, lignes
  sources, ensembles cartes/JASPE/socle, packages déclarés et unités SQL.
- [worktree-review.csv](worktree-review.csv) : comparaison du worktree distinct
  avec la base principale, conservée séparément, sans proposition de fusion.
- [generate-manifest.mjs](generate-manifest.mjs) : générateur **d'inventaire
  seulement**, lisant les sources locales et écrivant les quatre index ci-dessus.
  Il ne copie aucun code vers un dépôt, ne lance ni Git modificatif ni SQL.

Les **761 fichiers recensés** comprennent **756 suivis** et **5 locaux/ignorés**.
Les six livrables de ce dossier sont listés séparément pour éviter un manifeste
qui inclurait sa propre empreinte. Les deux documents de suivi existants sont
inventoriés après leur actualisation documentaire ; tous les autres fichiers
du commit de base sont inchangés.

| Classement | Fichiers | Traitement proposé pour le futur dépôt |
| --- | ---: | --- |
| CONSERVÉ | 718 | Copier à chemin et contenu identiques |
| ARCHIVÉ | 18 | 16 références visuelles à copier au chemin existant, comme historique ; 2 doublons locaux déjà couverts par les références versionnées |
| À REVOIR | 23 | 19 fichiers utiles à conserver avec réserves ; 4 documents/configurations/logs non inspectés à exclure de l'import automatique |
| OBSOLÈTE | 2 | Deux sondes d'écriture proposées hors import ; elles restent intactes ici |

**Liste d'entrée proposée : les 753 lignes dont l'action est COPIER_IDENTIQUE,
plus les six livrables de ce dossier.** Les chemins sont conservés. Le statut
ARCHIVÉ n'est pas un déplacement de fichier et ne change aucun chargement.
Le statut À REVOIR d'un code nécessaire n'autorise pas sa suppression.

Ce périmètre privilégie la préservation : tous les modules applicatifs, les
tests présents, les migrations historiques et les adaptateurs legacy utiles
restent inclus. Une absence d'import direct ne suffit pas à déclarer un module
inutile, notamment avec les globaux navigateur et les appels HTTP/SQL.
Aucun code n'est réécrit et aucune fonctionnalité n'est retirée.

Les quatre fichiers soumis à revue privée avant import sont :
`.claude/launch.json`, `.claude/settings.local.json`, `debug.log` et
`database/baseline/v1/review/SECRETS_APPLICATION.md`.
Leurs contenus n'ont pas été consultés pour ce manifeste ; les fichiers
potentiellement sensibles n'ont pas d'empreinte. Le nom du dernier document
ne prouve pas qu'il contient un secret : il motive une réserve explicite,
pas une suppression.

## 2. Usine de cartes : ensemble indivisible

**66 fichiers dans app/modules/cards/**, dont **60 PNG de patrimoine** :
tous sont dans la liste de conservation. Les noms exacts figurent dans le CSV.
Le contrat d'intangibilité de [CARDS_IMMUTABILITY.md](../../../app/docs/CARDS_IMMUTABILITY.md)
reste conservé : dimensions, identité visuelle, QR, numérotation, émission,
réimpression, remplacement et traçabilité ne sont pas à reconstruire.

| Couche | Fichiers et dépendances à conserver | Preuve lue |
| --- | --- | --- |
| Studio | app/modules/cards/cards-module.js, cards-native-api.js ; app/index.html, app/app.js ; helpers core/ui-helpers.js ; préparation élève et son CSS | cards-module.js:2, 63, 104, 142, 253, 328, 426 ; app/app.js:2730 ; index.html:841 |
| Recto/verso, QR, PNG | card-renderer.js ; assets/card-data.js ; assets/cards.css ; tout assets/patrimoine/ ; schoolsafe-logo.png | card-renderer.js:4, 71, 84, 116, 151, 201, 226, 255, 280 |
| Dépendances visuelles locales | app/vendor/qrcode.min.js, html2canvas.min.js ; app/assets/fonts/ au complet (CSS + 5 WOFF2) ; licences MIT/OFL et THIRD_PARTY_NOTICES.md | index.html:69–70 ; fonts/fonts.css:6,14,22,30,38 |
| API native | server/src/cardsnative/routes.ts, service.ts, batches.ts ; assemblage app.ts/native-app.ts/index.ts ; validation zod et erreurs HTTP | routes.ts:37, 117 ; service.ts:91, 122, 215 ; native-app.ts:66 |
| ZIP + manifeste | batches.ts : ZIP interne avec node:zlib et node:crypto ; noms recto/verso, SHA-256 des PNG et ZIP, métadonnées et version de lot | batches.ts:33, 188, 214, 225, 237 |
| R2 et Control | server/src/storage/r2.ts ; server/src/control-app/client.ts ; server/src/controlprintnative/ ; db/control-authority.ts | batches.ts:9–12,227–258 ; client.ts:115–157 ; controlprintnative/routes.ts:112 |
| Données et SQL | baseline (écoles, années, classes, élèves, tuteurs, cartes, demandes), auth/access/RLS/audit, database/cards/v1/01–03, projections élèves/session, pédagogie/classes | baseline/04_app_tables.sql:181 ; cards/01_cards_native.sql:48,104,155 |
| Tests existants | app/modules/cards/test-card.html ; server/tests/cards.test.ts, cardsnative-access.test.ts, control-authority.test.ts, native-access-contract.test.ts ; database/cards/v1/tests/cards-static.test.mjs ; contrats inter-écoles/permissions | cards.test.ts:44 ; cardsnative-access.test.ts:33 ; cards-static.test.mjs:6 |
| Compatibilité | server/src/cards/ au complet ; services school/students/security, tests et SDK Supabase encore référencés | cards.test.ts:3 ; cards-module.js:52 ; server/src/app.ts:188–189,233 |

Le PNG existant est produit par html2canvas avec **scale: 2**
(card-renderer.js:280–283). Le manifeste conserve exactement ce comportement ;
il n'invente pas une nouvelle garantie de résolution d'imprimerie.
Le QR visuel existant encode `schoolsafe://student/` + matricule
(card-renderer.js:177,252). Préserver aussi le cycle de vie serveur et sa
signature ; ne pas remplacer un format par l'autre durant la copie.

**Frontière Control conservée :** le serveur SchoolSafe notifie
`/card-print-requests` et `/card-print-batches`,
avec les en-têtes d'instance, timestamp et signature HMAC.
Le callback machine `/native/control/print/status` reste distinct de
l'autorité humaine ; `cards.print.manage` est une permission Control
dans shared/permissions.json:65. Les clés, URLs signées, PNG/ZIP produits
pour des élèves, données R2 et données de base ne font pas partie du dépôt.
Le code de l'application **SchoolSafe Control complète n'est pas dans cet arbre** :
conserver ce contrat client/serveur ne crée pas une copie de Control.

Les classes viennent de /native/pedagogy/classes, les élèves de /native/students,
les designs de /native/cards/class-card-config. L'identité de l'école est encore
lue par /school/info (cards-module.js:142–160), tandis que l'assemblage natif
ne fournit pas cette dépendance legacy. Cela doit être qualifié avant de
déclarer le parcours carte prêt ; les deux côtés sont conservés.

## 3. JASPE : ensemble indivisible

Conserver **27 fichiers moteur dans app/modules/jaspe2d/** et **88 fichiers
dans app/assets/jaspe2d/**, soit environ **83,51 Mio d'assets et métadonnées**.
Conserver également les six images de connexion dans assets/connexion-controle/,
les fichiers SafeAssistant, styles, QA, aperçus et documents de provenance.
Aucune pose, animation, identité ou version de repli n'est supprimée.

| Fonction | Sources indispensables et liens |
| --- | --- |
| Entrées auth/dashboard | app/index.html:120–125 ; app/app.js ; auth-layouts.js, auth-presence.js ; dashboard-companion.js ; styles/modules/jaspe-dashboard.css, jaspe2d.css, auth-companion.css, auth-models.css |
| Moteur v12 | live-companion.js:1–15 importe contrôleur, poses, rendus photo/corps/visage, alignement, mouvement, portrait et planificateur ; préserver tout v12/ et les modules auxiliaires |
| Manifestes et originaux | live-companion.js:30–51 charge le manifeste et vérifie les SHA-256 ; des URL v12 pointent vers ../originals/ : ce dossier est une dépendance active, pas une archive à retirer |
| Repli WebP et poses | jaspe2d.js:18–30,48–57,91 ; packs 1–4 et jaspe2d-manifest.json ; attente-v13, attente-v11, assise-v1 et tous leurs manifestes/prompts/provenances sont conservés |
| Assise/debout et gestes | seated-companion.js:4–17 construit les noms clair/sombre ; conserver les 14 planches et les QA assise/debout, même si le bandeau courant privilégie le moteur v12 |
| Voix déjà raccordée | dashboard-companion.js:41,87,113,171–197 : reconnaissance Web Speech, SpeechSynthesisUtterance, arrêt/reprise ; boutons HTML, états, gestion de changement de compte et QA voix conservés |
| Gouvernance | modules/safe/jaspe-governance.js:53–58, jaspe-capability-router.js ; core/access.js et shared/permissions.json:52 ; aucune autorité issue d'un prompt ou d'un nom de rôle |
| Assistant métier | safe-assistant.js:837–1042 appelle les modules documents, communication, parent, enseignant, gardien, RH, stock, rapports, comptabilité et finance ; conserver leurs fichiers, clients et styles, même nommés demo |
| Relais serveur existant | server/src/jaspenative/routes.ts:30–44 ; service.ts ; authnative/db/access ; native-app.ts:48 ; worker-jaspe/ au complet |
| Tests/maintenance | tous app/qa-jaspe-*, qa-safe-assistant-access.cjs ; server/tests/jaspenative.test.ts ; previews/laboratoires/worker de cohérence ; plans/specs physiques et références graphiques |

La voix navigateur existe ; **aucune preuve acoustique nouvelle**, aucun modèle,
fournisseur ou réglage voix n'a été changé. Le relais Cloudflare existe, mais
cela ne prouve pas qu'il est utilisé par le dialogue métier du dashboard.
Le helper chat du moteur lit la propriété reply à la racine de la réponse,
alors que la route native renvoie data.reply (jaspe2d.js:154–156 ;
jaspenative/routes.ts:44). Garder les deux implémentations et signaler ce
raccordement à revoir ; ne pas déclarer le parcours distant validé.
Aucune synchronisation phonétique nouvelle ni moteur 3D n'est ajouté.

Les brouillons cartable **non validés** et références assises/sans table restent
ARCHIVÉS dans leurs chemins docs/design/. Ils documentent l'identité et les
décisions ; ils ne remplacent aucun asset actif.

## 4. Socle, dépendances transversales et fichiers faciles à oublier

- **ACCESS_LAW** : conserver shared/permissions.json, core/access.js, tout
  database/baseline/v1 et database/access/v1, middleware authnative, contexte
  DB, withAuthorizedContext, rôles PostgreSQL, RLS, triggers et audit.
  Ce contrat est distribué ; il ne se résume pas à un hypothétique fichier
  ACCESS_LAW unique.
- **Auth/session A5.1** : app/modules/authnative/, administration/, app/app.js ;
  server/src/authnative/, accessnative/, sessionnative/, db/ ; auth, projections
  et leurs tests. Conserver 05, 07 et **08**, dans l'ordre existant du manifeste.
  Ne pas réappliquer 05 après 08 pour une recette A5.1.
- **Tous les 120 fichiers database/** sont recensés. 119 sont proposés à copie
  identique ; le document SECRETS_APPLICATION.md reste en revue privée.
  Les **12 manifestes / 43 unités déclarées**, générateurs et tests restent
  conservés. Les SQL hors manifeste ne sont pas à jeter :
  projections/v1/02_student_list.sql et setup/v1/01_setup_native.sql.
  Leur installation doit être explicitement qualifiée ; ne pas fusionner
  ou renuméroter les migrations historiques.
- **Tous les 183 fichiers server/**, **les 12 scripts racine** et tous les QA
  présents sont conservés. Les sources et tests legacy continuent d'être
  importés/typecheckés : retirer Supabase à partir d'un nom de dossier casserait
  des contrats et n'est pas autorisé.
- **Deux lockfiles nécessaires** : package-lock.json à la racine pour le workspace,
  server/package-lock.json utilisé par le Dockerfile. Garder package.json,
  server/package.json, server/tsconfig.json et vitest.config.ts.
  worker-jaspe a son package.json distinct et aucun lockfile présent : réserve
  de reproductibilité, sans installation ici.
- **Packages exacts déclarés** listés dans dependencies.json : Fastify et plugins,
  pg, Argon2, zod, AWS S3/presigner, Supabase, web-push ; TypeScript/tsx/Vitest,
  Playwright/esbuild ; Wrangler du Worker. Conserver les contraintes/lockfiles,
  aucune mise à niveau. Node >=22 est déclaré côté serveur.
- **Ressources partagées** : polices locales et leurs licences, logo/icônes,
  QRCode.js/html2canvas, jsPDF/lucide, CSS global, i18n, offline-sync,
  service worker et son enregistrement, manifest.webmanifest, .keep/.gitkeep.
  app/server.mjs:58 et server/src/index.ts:23 servent
  /shared/permissions.json depuis le répertoire shared/ **frère** de app/.
- **Documents obligatoires** : PROJECT_CONTEXT.md, DECISIONS.md,
  CURRENT_HANDOFF.md et le plan actif, intégralement avec historique.
  Conserver AGENTS.md, contrats cartes/JASPE/accès/licence, baseline et runbooks.
  Les contradictions historiques ne sont pas des autorisations d'exploitation.
- **Exploitation** : Dockerfile, .dockerignore et ops/deployment/README.md restent
  inclus ; décisions Docker + Coolify et séparation SchoolSafe/Control préservées.
  Aucun lien distant, webhook, secret ou ressource Coolify n'est transféré.

Les variables d'environnement nécessaires se définissent ultérieurement hors Git :
connexion PostgreSQL/rôles, paramètres R2, paramètres Control/signature/licence,
CARD_HMAC_SECRET, CARDS_AUTO_BATCH, paramètres du relais JASPE et secrets du Worker.
Le manifeste ne contient **aucune valeur** de ces paramètres et ne modifie aucune
configuration du fournisseur.

## 5. Réserves à traiter avant de qualifier la nouvelle base de stable

| Réserve | Conservation et prochaine vérification |
| --- | --- |
| Alertes statiques préexistantes | Deux occurrences school.settings.manage et 20 détections inter-écoles dans les sept SQL déjà documentés. Garder contrôles et code ; traitement séparé, aucun masquage. |
| Conditionnement Docker | Dockerfile copie le frontend sous dist/public ; index.ts cherche app/ relativement au module, et .dockerignore exclut shared/. Conserver les fichiers mais qualifier l'image et le catalogue avant toute exploitation. Aucun build ni déploiement ici. |
| Scripts non reproductibles dans cet arbre | package.json référence frontend/vendor/supabase-entry.js, scripts/check-auth-bundle.mjs, scripts/run-rls-tests.mjs et tests/qa/{unit,rls,integration,e2e}, absents. Garder les scripts et noter leur état ; aucune recherche de masse ni reconstruction. |
| Cartes R2/Control | service.ts:134–142 saute l'upload sans R2 ; la branche finale peut retourner submitted sans Control configuré. Conserver l'usine, qualifier les dépendances et refus ; aucune certification d'impression/ZIP réel dans cette mission. |
| Tests cartes | cards-static.test.mjs:6 couvre 01 et 02 explicitement, pas 03 ; les tests de contexte et legacy ne prouvent pas à eux seuls PNG→R2→ZIP→Control. Tous les tests présents sont conservés ; recette de référence à planifier sans réécriture. |
| JASPE distant et audio réel | Relais existant, dialogue local et voix navigateur distingués ; raccordement de réponse, microphone réel et qualité vocale restent à qualifier. |
| Historique/documentation | AGENTS.md contient l'ancienne interdiction Docker ; PROJECT_CONTEXT a d'anciennes prochaines actions. Préserver et annoter séparément avant une reprise d'exploitation. |
| Données et services externes | Control complet, R2, PostgreSQL, appareils et configurations d'hébergement ne sont pas des fichiers présents dans ce dépôt. Leur migration éventuelle demande un mandat séparé. |

**CONSERVÉ signifie “à emporter”, pas “testé en production”.** Cet inventaire
ne corrige aucun de ces points et ne certifie ni toute l'application ni la
sécurité de chaque parcours.

## 6. Worktree distinct et fichiers locaux

Le worktree **.worktrees/canonical-access-law** est sur
**work/canonical-access-law**, SHA **8b44fd9c10a22dd216c59f1f5864c6cc28b36459**.
Il comporte 33 commits non ancêtres de main ; ce nombre ne prouve pas 33
corrections fonctionnelles absentes (reprises et histoires divergentes possibles).
Son statut suivi est propre ; un plan local non suivi existe :
docs/superpowers/plans/2026-09-13-canonical-final-review-fixes.md.

L'annexe donne **234 différences de chemins suivis + ce plan local**.
**Sens de lecture : D = présent dans main, absent du worktree**, et non fichier
supprimé ici. Cet arbre manque notamment des composants récents JASPE et A5.1 :
il ne doit pas remplacer main. Les A/M sont des candidats à revue séparée,
jamais des autorisations de rétablir l'autre version.

Des candidats utiles propres à cet arbre sont explicitement repérés :
permission_authority, helpers/contrats SQL, control-transport,
postgres-errors-http et le plan d'alignement natif. Le plan local évoque
notamment la véracité des statuts de soumission cartes sans R2/Control.
Aucun de ces changements n'a été fusionné ou déclaré validé dans main.
Avant toute migration, examiner ces candidats sans perdre les correctifs récents.

Les deux PNG racine non suivis sont des doublons exacts, SHA-256 comparés, des
références desktop/mobile de docs/design/references/. Le futur dépôt peut
emporter les versions déjà suivies ; **les originaux restent intacts ici**.

.git/ est l'historique du dépôt source : le préserver, sans copier son identité
dans un nouveau dépôt par ce manifeste. node_modules/ et server/node_modules/
sont des dépendances installées à recréer ultérieurement depuis les lockfiles ;
elles ne sont ni inventoriées fichier par fichier ni supprimées. .worktrees/
n'est pas recopié en bloc. Les réglages locaux d'assistant et logs restent exclus
de l'import automatique. Aucune base, dump, donnée école, token, cookie ou export
de cartes n'est proposé à inclusion.

## 7. Vérifications réellement réalisées et suite

- Lecture des consignes, documents de continuité et plan ; état Git et SHA
  distant vérifiés en lecture seule. Aucun commit, fetch, reset ou push.
- Inventaire des fichiers suivis et des fichiers locaux non générés ; aucun
  fichier suivi omis du CSV. Classification des deux sondes : leur contenu
  est simplement “test”, sans référence dans les sources analysées.
- Analyse des imports JS/TS (TypeScript installé), références HTML/CSS,
  manifestes et dépendances métier lues ; ensembles conservateurs et chemins
  exacts dans dependencies.json. Les URL calculées sont couvertes par les
  manifestes/ensembles correspondants, sans prétendre analyser tout flux runtime.
- **75/75 entrées JASPE** : 33 v12 + 21 WebP + 14 planches + 7 originaux,
  fichiers présents et SHA-256 conformes (certaines entrées désignent les
  mêmes images). **60/60 PNG de patrimoine cartes présents.**
- Inventaire des **12 ensembles / 43 unités SQL** ; contrôle d'intégrité des
  manifestes **PASS** par `node scripts/check-migration-versions.mjs`, séparé
  de tout rejeu PostgreSQL. Exhaustivité des 756 fichiers suivis et **757 SHA-256**
  vérifiés ; les quatre contenus réservés à revue privée ne sont pas lus.
  **984 références statiques résolues**, sans dépendance relevée vers un fichier
  exclu de la copie proposée. Deux motifs HTML dynamiques/répertoire sont
  explicitement distingués des imports ; le patrimoine calculé est vérifié
  par ses 60 fichiers. Aucun test SQL, HTTP/UI, R2,
  Control ou audio réel exécuté pour cette mission documentaire.
- Les réussites historiques A5.1 ne deviennent pas des tests nouveaux des cartes
  ou de JASPE. Pas de déclaration de CI globale verte.

Restriction d'outillage conservée, sans contournement :
`git status --short` et le statut du worktree affichent
`warning: unable to access 'C:\Users\PC/.config/git/ignore': Permission denied`.
Aucune configuration Git globale modifiée.
Commande de recherche sur un chemin supposé :
`rg -n 'shared|permissions.json' app/server.mjs server/src/app.ts server/src/index.ts server/src/config/permissions.ts`
a retourné
`rg: server/src/config/permissions.ts: The system cannot find the file specified. (os error 2)`.
Le catalogue réel et les routes qui le servent sont identifiés ci-dessus.

**Prochaine étape exacte :** relire les lignes À REVOIR et l'annexe du worktree,
arbitrer leurs réserves (et la revue privée du document sensible) avant de figer
la sélection définitive. L'import, la fusion de candidats, la création du nouveau
dépôt, les tests d'exploitation et toute publication nécessitent une mission
ultérieure. **Ne lancer aucune migration à partir de ce seul manifeste.**
