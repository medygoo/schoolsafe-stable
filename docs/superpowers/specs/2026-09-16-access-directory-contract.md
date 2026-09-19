# A2 — consultation native des accès de l'école

Statut au 16/09/2026 : contrat exécuté, SQL et parcours navigateur/serveur validés
sur PostgreSQL 17.11 temporaire. Aucune mise en production. La modification des
attributions appartient à A3 ; aucun droit nouveau n'est créé ici.

## Contrat livré

Toutes les routes exigent le cookie natif, puis `roles.manage` sans cible
individuelle, vérifié par `withAuthorizedContext` et de nouveau dans la RPC.
Une portée `own` ne permet pas d'ouvrir l'annuaire, même pour son propre profil.
L'école et l'acteur viennent de `request.authSession` ; le profil de l'URL reste
la personne consultée. Aucune usurpation du contexte pour calculer ses droits.

| Route GET | RPC | Sortie |
| --- | --- | --- |
| `/native/access/profiles` | `api.access_profiles_list(text, integer, integer)` | `schoolId`, `rows`, `total`, `limit`, `offset` ; profil = `id`, `display_name`, `is_active`, `account_status` |
| `/native/access/roles` | `api.access_roles_list(text, integer, integer)` | Même page ; rôle = `id`, `code`, `label`, `is_active` |
| `/native/access/profiles/:profileId` | `api.access_profile_read(uuid)` | `schoolId`, `profile`, `roles` avec validité des attributions, `grants`, `exceptions` avec périmètres et conditions |

- Enveloppe HTTP : `{ data, request_id }`, `Cache-Control: no-store`.
- Listes : `query` (100 caractères maximum, recherche littérale insensible à la
  casse), `limit` 1–100 (25 par défaut), `offset` 0–1 000 000 (0 par défaut).
  Tri par nom/libellé en minuscules puis UUID ; total calculé dans la même école.
- Rejet des clés inconnues, y compris `school_id` et un faux acteur. Le détail
  n'accepte aucune query. UUID invalide : 400 ; pas de session : 401 ; droit refusé :
  403 ; personne absente/hors école : même 404 ; panne interne : erreur générique.
- Les attributions inactives, futures et expirées restent visibles avec leur état.
  Il s'agit de données enregistrées, pas d'une simulation d'accès effectif. Les
  conditions restent appliquées par Access Law au moment de l'action.
- Contacts, identifiants d'authentification, secrets, données d'enfant, paiements,
  motifs libres et paramètres JSON des conditions ne sont pas projetés.
- Les tables IAM, l'audit et l'évaluateur existants sont réutilisés. Aucun modèle
  parallèle ni réactivation globale des anciennes routes Supabase.

## Corrections nécessaires prouvées

1. Le rejeu réel échouait dans `12_seed_permissions.sql` : garde de 60 permissions
   malgré les 64 entrées canoniques. Correction de cette garde et de celle de
   `13_verification.sql`, puis régénération du manifeste baseline.
2. Le test SQL de désactivation d'un rôle échouait : `iam.can_access` et
   `iam.has_explicit_deny` ne consultaient pas `iam.roles.is_active`. Les deux
   fonctions prennent maintenant en compte l'activation du rôle. Aucune attribution
   existante supprimée. Les tests d'isolation/classes/enfants restent verts.
3. CORS omettait le frontend local 4176. Les deux origines loopback de ce port
   sont ajoutées à la liste explicite, avec test ; aucun wildcard ajouté.

## Protocole PostgreSQL de test

- PostgreSQL **17.11**, `pg_stat_statements` préchargé, `compute_query_id=auto/on`,
  extensions `pg_stat_statements` et `citext` disponibles.
- Instance temporaire réservée au test, loopback seulement, port distinct du
  serveur applicatif/production. Aucun Docker ni service Windows installé.
- Ce lot a utilisé les [binaires EDB officiels](https://www.enterprisedb.com/download-postgresql-binaries),
  proposés depuis la [page PostgreSQL Windows](https://www.postgresql.org/download/windows/),
  extraits dans `%TEMP%/schoolsafe-access-a2-pg`. Version vérifiée par l'exécutable.
  Les binaires, bases et captures ne sont pas versionnés.
- Créer une base **vide** `schoolsafe_access_test` ou `schoolsafe_access_test_<nombre>`
  dans cette instance avec l'utilisateur de bootstrap de test. Le runner refuse
  toute autre destination, tout hôte distant et toute base contenant déjà les
  schémas SchoolSafe. Il ne crée, ne supprime et ne réinitialise aucune base.

Exemple PowerShell, après préparation de cette instance isolée et de la base :

```powershell
$env:SCHOOLSAFE_ACCESS_TEST_URL = 'postgresql://schoolsafe_bootstrap@127.0.0.1:55432/schoolsafe_access_test'
$env:SCHOOLSAFE_PSQL = Join-Path $env:TEMP 'schoolsafe-access-a2-pg/pgsql/bin/psql.exe'
node scripts/test-access-postgres.mjs
# Prévisualisation du dépôt sur 4176 ; port 8787 libre, réservé au test.
node --import tsx scripts/qa-access-live.mjs
```

Le runner vérifie les hashes et applique les manifestes **baseline → auth →
access → projections** (21 unités), enregistre les 13 unités baseline, rejoue
`03_access_read.sql`, puis teste deux écoles sous `schoolsafe_api`. Le test SQL
termine par ROLLBACK. Les autres ensembles métier ne sont pas validés par ce rejeu.

Le test navigateur suivant crée uniquement des fixtures synthétiques dans cette
base réservée, utilise les vrais pools `schoolsafe_auth` / `schoolsafe_api`, un
cookie aléatoire gardé en mémoire, et démarre l'API sur 8787. Il ferme l'API et le
navigateur à la fin. Les fixtures restent dans la base jetable ; une prochaine
exécution exige une nouvelle base vide. Arrêter l'instance temporaire à la clôture.

## Preuves du lot et limites

- Installation fraîche et SQL A2 : PASS ; aucun contexte, autre école, total/recherche,
  pagination, lectures minimales, conditions/périmètres multiples, dates futures/
  expirées, retrait, DENY, rôle inactif, compte suspendu, table directe interdite.
- Test SQL existant `from-zero-access-law.test.sql` : PASS sur PostgreSQL réel,
  notamment isolation de trois écoles et périmètres enseignants/parents.
- Navigateur → cookie → serveur natif → PostgreSQL : PASS pour annuaire/détail,
  recherche, école étrangère, rôles, bureau/mobile sombre et révocation en session.
- Courses réseau et erreurs avec API substituée : PASS dans
  `app/qa-native-access-directory.cjs`. Régression A1 : PASS dans
  `app/qa-native-access-console.cjs`. Captures du parcours réel inspectées.
- 51 tests serveur ciblés, 38 contrats statiques, typecheck, contrats JASPE/visuel,
  syntaxe et diff : PASS. Ces nombres décrivent les suites exécutées dans ce lot.

**Restant :** A3 attribution/révocation via l'application, délégation, dernier
administrateur et concurrence ; A4 composition ; A5 exceptions et cohérence fine
du bootstrap (ses projections omettent encore plusieurs fenêtres de dates et
conditions) ; A6 journal consultable ; A7 recette du module complet.
`02_student_list.sql` reste hors manifeste et contient les anomalies déjà signalées
pour le lot École. Pas d'activation implicite de ce fichier.

Les fichiers baseline modifiés ne mettent à jour aucune installation existante
automatiquement. Leur procédure d'application sur une base déjà exploitée et le
rejeu global/restauration P5 restent à traiter avant déploiement. A2 ne valide
ni les autres modules, ni la licence distante, ni Device Hub.
