# Installation SchoolSafe Stable — préflight du 19 septembre 2026

**Inventaire complet, installation globale bloquée.** Les 12 manifestes existants
déclarent 43 unités. Le registre adjacent comptabilise les **46 SQL versionnés de
premier niveau** : 43 déclarés, deux historiques bloqués et une unité auth à
qualifier. Aucun SQL historique, hash historique ou ordre interne n'est modifié.
Les tests SQL et les scripts de diagnostic ne sont pas des unités d'installation.

```powershell
node database/installation/generate-manifest.mjs
node scripts/check-migration-versions.mjs
node scripts/check-migration-versions.mjs --require-installable
```

Les deux premières commandes prouvent l'inventaire et son intégrité. La dernière
doit sortir avec le code 1 tant que les blocages subsistent. Aucune de ces commandes
n'exécute du SQL. Ne pas appliquer un glob de tous les SQL ; ne pas prendre
l'ordre des ensembles de ce registre pour un ordre de production qualifié.

| Fichier conservé | Dépendances | État et reprise nécessaire |
| --- | --- | --- |
| `../projections/v1/02_student_list.sql` | baseline, auth, access | BLOCKED : paramètres requis après paramètres avec défaut ; inscription `planned` incompatible avec le CHECK ; vérifier les cibles et le `school_id` avant activation. Préparer un remplacement additif au lot École, sans réécrire ce fichier. |
| `../setup/v1/01_setup_native.sql` | baseline, auth, access et contrat de provisioning | BLOCKED : appel refusé par RLS sur `profiles` ; attribution sans `school_id` et recherche `super_admin` incompatibles avec le contrat canonique. Qualifier provisioning et ACL par migration additive ; ne pas contourner RLS ni accorder des droits directs au rôle API. |
| `../auth/v1/03_auth_reset.sql` | baseline, auth | Hors manifeste auth découvert par le contrôle d'exhaustivité. Conservé, non exécuté ; qualification récupération/jetons/session dans un lot auth séparé. |

Preuve réelle : `scripts/test-stable-installation-postgres.mjs`, avec
`SCHOOLSAFE_STABLE_TEST_DATABASE=schoolsafe_access_test_919`, PostgreSQL 17.11
local sur 127.0.0.1:55432. 27 unités baseline/auth/access/projections installées,
08 en dernier ; échec historique 42P13 reproduit pour student_list. Setup défini
temporairement et appelé sur fixtures synthétiques : 42501 RLS `profiles`.
ROLLBACK des sondes, zéro école/identité, aucune fonction setup persistée.
Les défauts suivants du setup sont des constats de code, pas des échecs SQL
atteints après ce premier refus. Aucun test SQL métier complet ni production.

L'installation fraîche complète nécessite donc encore des lots distincts.
Le contrôle CI d'intégrité reste utile et ne doit pas être présenté comme une
certification d'installation. Les alertes Device Hub/famille/cartes restent actives.
