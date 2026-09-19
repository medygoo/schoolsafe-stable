# DB-04B-R1 — revue/correction avant apply

Statut : **READY FOR FINAL REVIEW — RIEN N'A ÉTÉ APPLIQUÉ**.

## Périmètre réellement exécuté

- Analyse et correction de fichiers locaux uniquement.
- Aucun accès ni changement PostgreSQL TEST.
- Aucune commande Docker/VPS.
- Aucun accès ni changement Supabase Cloud.
- Aucun PROD, import Cloud, migration Auth, table trial, frontend ou JASPE.
- Aucun commit et aucun push.

## 1. Garde `pg_stat_statements`

Le futur apply est désormais fail-closed :

- `scripts/run-from-zero-test.sh` vérifie avant l'unité 01 que
  `shared_preload_libraries` contient `pg_stat_statements`, que
  `compute_query_id` vaut `auto` ou `on`, et que les fichiers d'extension sont
  disponibles ;
- `03_extensions.sql` répète ces contrôles, installe l'extension dans `ops`
  uniquement après préchargement, puis retire immédiatement les privilèges
  runtime implicites ;
- `13_verification.sql` confirme le préchargement, le calcul des query IDs et
  l'installation dans `ops` ;
- aucune de ces unités n'a été exécutée sur TEST.

La recréation contrôlée du conteneur, volume conservé, image locale verrouillée,
aucun port publié, paramètres DB-03 et procédure de retour arrière sont décrits
dans `CONTAINER_TEST_RECREATION.md`. Ces commandes ne sont pas une autorisation
d'exécution.

## 2. Test multi-écoles préparé

`tests/from-zero-access-law.test.sql` contient désormais des données strictement
synthétiques pour School A, School B et School C et se termine par `ROLLBACK`.
Il vérifie explicitement :

- A ne lit jamais B/C, B ne lit jamais A/C, C ne lit jamais A/B ;
- `own_children` est borné à l'école active et refuse aussi un enfant non lié ;
- la pédagogie exige une affectation exacte classe **ET** matière active ;
- les couples classe/matière inter-écoles sont refusés ;
- un `DENY` explicite de School A prime sur son `ALLOW` sans affecter School B ;
- une RPC P0 refuse une ressource d'une autre école ;
- un contexte injectant utilisateur/profil A avec `school_id` B est refusé ;
- aucune table/token d'essai de 14 jours n'est introduit.

Le test SQL n'a pas été exécuté pendant DB-04B-R1.

## 3. Revue SQL critique

Le bundle humain et le bundle machine contiennent, pour chacun des neuf
fichiers demandés : SHA-256, lignes, objets, fonctions `SECURITY DEFINER`,
`GRANT`, `REVOKE`, RLS, dépendances et risques :

- `DB-04B-R1-REVIEW-BUNDLE.md` ;
- `DB-04B-R1-REVIEW-BUNDLE.json`.

Résumé des empreintes :

| Fichier | Lignes | SHA-256 |
|---|---:|---|
| `01_roles.sql` | 48 | `10448f25fb7925391c66d872a11d13d2876667dddeaaa39e8ec785868c72e5fe` |
| `05_iam.sql` | 148 | `6f8494dd9706cb43763ea40456792207268cb692e18324ed06867ed50a1678c9` |
| `08_internal_functions.sql` | 624 | `bd2e5b61ab89e3bc0d583fd439fe04bf622649434a17768a8ff477ffa04fde32` |
| `09_api_rpc.sql` | 809 | `97bf44e8a68c3961ffe4ca12488a797c9e883a5e7a8bdabc9f04c17f1112212b` |
| `11_rls_acl.sql` | 264 | `3be5ec1f3a4fbef4f5b4f890ccb1bd81a8065a7230c08a06de9453dc90c07c96` |
| `12_seed_permissions.sql` | 108 | `8a347abde67b8efb91625346f0177be36445dd331f3c5450b40c945c252c79d2` |
| `13_verification.sql` | 260 | `022b932832f9bd161d267f1f2d0d84064d50b8db86e5c86d973134ad94600cde` |
| `tests/from-zero-access-law.test.sql` | 300 | `016bd76fee5f49940e514947e62f2b2187ce325142cbab1344706de578b310a5` |
| `scripts/run-from-zero-test.sh` | 173 | `5b65735c23edd1e5bc44de577d9c3fc6173a7cc2a170e881880d5776c9f07dfb` |

## 4. Contrôles statiques

Résultat local : **16/16 PASS**.

- aucune référence à `auth.uid()` ;
- aucun rôle applicatif `BYPASSRLS` ou `SUPERUSER` ;
- aucun `GRANT ... TO PUBLIC` ;
- aucune création SchoolSafe dans `public` ;
- 22 fonctions `SECURITY DEFINER`, toutes avec `search_path=pg_catalog` ;
- les huit RPC P0 ne reçoivent aucun `actor_profile_id`/`school_id` comme
  autorité ; elles dérivent ces valeurs du contexte validé ;
- exactement 60 permissions et sept scopes ;
- affectation enseignant exacte classe **ET** matière, aucun OR ;
- `DENY` explicite évalué avant les chemins `ALLOW` ;
- aucune dépendance Supabase et aucun accès navigateur direct aux tables ;
- `schoolsafe_api` reçoit l'exécution des fonctions `api`, pas les tables.

La syntaxe du runner a aussi été contrôlée avec le Bash local de Git for
Windows : `bash -n` = **PASS**. Son comportement effectif restera à vérifier
sur le VPS avant toute application, après autorisation. Aucune commande
Docker/VPS n'a été exécutée pendant cette revue.

## 5. Rôles et secrets

La baseline ne contient aucun mot de passe. Une correction de revue verrouille
désormais seulement ces trois rôles en `LOGIN` :

- `schoolsafe_migrator` ;
- `schoolsafe_api` ;
- `schoolsafe_worker`.

`schoolsafe_owner` et `schoolsafe_auditor` sont `NOLOGIN`. La génération,
l'injection SCRAM et la rotation futures, par fichiers `0600` hors Git et sans
exposition au navigateur, sont définies dans `SECRETS_APPLICATION.md`. Rien n'a
été généré ni injecté.

## Verdict

**DB-04B-R1 READY FOR FINAL REVIEW**
