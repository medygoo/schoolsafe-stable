# SchoolSafe Stable — préparation finale locale, 19 septembre 2026

**Mise à jour autorisée le 19/09 : cette copie est validée comme base de
développement et peut être publiée sur `develop/codex-base` uniquement.**
Aucun push sur main, déploiement ni VPS. Les 772 chemins et 14 exclusions restent
inchangés ; seuls les documents de reprise/publication et leurs empreintes sont
actualisés. SQL ouvert et Docker réel non validé restent des limites explicites.
Le protocole actif est en tête de [PUSH.md](PUSH.md) ; la préparation initiale
ci-dessous est conservée comme historique, sans autoriser d'autres opérations.

Base validée : `main`, `841d3efc54e7af62250b2980e450aa20ba5f2d40` et les
documents locaux d'inventaire. Source distante relue : `62df2b16ceca2e609c1789eba44afbe6fe278e19`.
Destination : `medygoo/schoolsafe-stable`. **Sources préparées pour revue avant
publication ; aucune application complète, installation globale ou production validée.**
Mandat : aucune suppression dans la source, aucun push, aucun déploiement.

## Sélection finale

La liste exacte est [final-files.txt](final-files.txt), avec hashes, adaptations,
exclusions et résultats du scan dans [final-files.json](final-files.json).
Le manifeste précédent reste un historique de l'arbitrage, pas le hash de cet état.

| Origine / destination | Fichiers |
| --- | ---: |
| Sources SCHOOLSAFE du manifeste validé | 731 |
| Archives visuelles conservées à leurs chemins d'origine | 16 |
| Application CONTROL extraite de cet arbre | 0 |
| Anciens livrables du manifeste de migration | 6 |
| Nouveaux fichiers d'inventaire installation et tests | 7 |
| Livrables de cette préparation, dont les deux listes finales | 12 |
| **Total dans la copie préparée** | **772** |
| **Fichiers de l'inventaire source exclus** | **14** |

Les 761 sources initiales deviennent 747 conservées + 14 exclues. Les 25 ajouts
de migration/tests sont séparés ; aucune ligne n'est comptée deux fois.
Tous les modules et dépendances des cartes et de JASPE restent conservés,
y compris recto/verso, QR, PNG HD existant, ZIP/manifeste, R2, contrat Control,
voix navigateur, gestes, assets, gouvernance, permissions, tests et historiques.
ACCESS_LAW, auth, école `school_id`, contrôles serveur et migrations restent intacts.

Exclusions : les huit du manifeste validé (deux configurations `.claude`,
`debug.log`, `SECRETS_APPLICATION.md`, deux doublons PNG racine et deux sondes
`app/vendor/*write*.txt`) ; plus les six portraits `app/login-kid-1.jpg` à `-6.jpg`.
Voir [la preuve images](IMAGES.md). Aucun `.git`, node_modules, cache, journal,
base, capture de test, fichier environnemental ou secret local n'est transféré.
Les fixtures synthétiques écrites dans les tests restent des sources de tests ;
aucune base ou donnée opérationnelle n'est copiée.

## Corrections limitées au conditionnement

- `AGENTS.md` : Docker + Coolify actif ; ancienne interdiction explicitement
  remplacée et conservée. Publication suspendue pendant cette mission.
- `.dockerignore` : `shared/` conservé ; worktrees, `.claude` et préparation exclus.
- `Dockerfile` : structure `/app/server`, `/app/app`, `/app/shared`, conforme à
  `server/src/index.ts` ; verrou npm racine cohérent avec le workspace. Le verrou
  historique serveur reste conservé, mais n'est plus utilisé par cette recette.
- `database/installation/` et contrôleur existant : 46 SQL comptabilisés,
  43 déjà déclarés, deux bloqués et un auth à qualifier. Aucun SQL historique
  réécrit, aucun droit élargi. [Préflight et blocages](../../../database/installation/README.md).
- Source applicative inchangée. Dans la copie seulement : tableaux décoratifs
  des portraits vidés dans `app/app.js`, source photo retirée dans `app/index.html`,
  exclusions supplémentaires dans `.gitignore`. Ces trois adaptations sont hashées.

## Preuves réellement obtenues

- Rouge → vert : trois régressions de conditionnement, puis verrou npm ; suite
  finale **7/7 PASS**, intégrité **12 ensembles/43 unités** et registre **46 SQL**.
  `--require-installable` retourne volontairement **1** ; installation non qualifiée.
- PostgreSQL 17.11 réel, base neuve locale synthétique `schoolsafe_access_test_919`,
  127.0.0.1:55432 : **27 unités du socle installées**, 08 dernière projection.
  Défaut student_list **42P13**, refus setup **42501 RLS profiles** reproduits.
  Sondes annulées, zéro école/identité, pas de setup installé. Base de test conservée.
- Compilation `tsc` dans la structure Docker : **PASS**, dépendances locales
  existantes ; `npm ci --workspace server --include-workspace-root=false --include=dev
  --ignore-scripts --dry-run --offline --no-audit --no-fund --cache ../npm-cache` :
  **PASS**, simulation seulement, aucune dépendance installée par cette commande.
- Navigateur réel sur les octets sélectionnés : **1440 et 390 px PASS**,
  formulaire et canvas JASPE visibles, aucune requête portrait exclu, asset manquant,
  erreur JS ou débordement horizontal. Captures inspectées, hors sélection.
  API `/config` substituée ; ni authentification réelle ni validation visuelle globale.
- Régressions conservées : A5.1 **39 + 13 assertions PASS**, JASPE physique
  **5 tests + contrat PASS**, cartes **5 contrats statiques PASS**.
  Elles ne remplacent pas la recette métier SQL/HTTP/UI historique d'A5.1.
- Scan final : motifs forts sur textes/binaries, chemins privés et marqueurs
  de métadonnées images ; aucun candidat non résolu. 18 littéraux de tests/docs
  revus précisément, aucune valeur publiée. Nombre exact dans le manifeste et
  le résultat de `verify-stable.mjs` ; aucune garantie exhaustive de confidentialité.

Erreurs et relances exactes : [ERRORS.md](ERRORS.md). Docker indisponible :
**aucun build Linux ni démarrage du conteneur effectué**. Les tests R2, fournisseur
JASPE distant, son/microphone humain, Control complet et production ne sont pas rejoués.

## Préparation et reprise

`prepare-stable.mjs` crée seulement un dossier neuf
`.migration-staging/schoolsafe-stable/`, vérifie chaque hash et refuse d'écraser
une destination existante. Il ne fait ni Git, ni réseau, ni SQL. Le reçu local
`.migration-staging/preparation-receipt.json` couvre aussi les deux manifestes
eux-mêmes et n'est pas destiné à publication. Le nouveau Git est initialisé
sur `main`, sans commit ni indexation, avec la seule origine Stable. L'ancien
dépôt, son index, son HEAD et son historique sont préservés.

```powershell
node docs/migration/2026-09-19-stable-preparation/verify-stable.mjs .migration-staging/schoolsafe-stable
```

Risques conservés : deux contrôles statiques préexistants (deux occurrences
DeviceHub `school.settings.manage`, 20 détections inter-écoles Cards/DeviceHub/Family),
recettes R2/Control et dépendance legacy `/school/info`, réponse distante JASPE,
anciens scripts package aux cibles absentes, worktree distinct non fusionné.
Aucun de ces points n'est corrigé, désactivé ou déclaré résolu par cette migration.
L'inventaire SQL complet révèle aussi l'unité auth hors manifeste : source conservée,
qualification séparée obligatoire. Les blocages ne doivent pas être contournés.

**Prochaine action : revue propriétaire de cette copie et de ses réserves.**
Pour rendre l'installation exploitable : lots additifs École/setup/auth séparés,
puis véritable build Docker et recette avec données synthétiques. Pour publier
les seules sources : nouvelle autorisation et preuve d'absence de déploiement
automatique, puis [les commandes prévues](PUSH.md), sans force push.
Control : [plan séparé de récupération de sa source existante](CONTROL_EXTRACTION_PLAN.md).
