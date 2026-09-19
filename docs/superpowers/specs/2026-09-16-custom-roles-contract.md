# A4 — postes personnalisés et composition des permissions

Implémentation du plan validé et de la décision du 13/09 : un administrateur
compose des postes dans son autorité réelle, sans modifier les modèles souverains.
Lot fondé sur A3 `e62529b`. Aucun nouveau rôle implicite ou moteur d'accès parallèle.

## Parcours et contrat

- Rôles de l'école → Créer un poste : nom, poste vide ou copie d'un modèle,
  motif et confirmation. Le code généré et l'UUID restent stables au renommage.
  Créer ne donne aucune permission à une personne ; l'attribution passe par A3.
- Ouvrir un poste → permissions par rubrique, ALLOW/DENY, état actif/inactif,
  motif et confirmation. Le nombre d'attributions actives et les 100 premiers
  profils concernés sont affichés avant l'édition d'un poste partagé. Le filtre
  visuel ne retire jamais les permissions cochées mais masquées.
- Les postes canoniques sont consultables et protégés. Leurs copies sont
  personnalisables. Une permission Control ou hors enveloppe est refusée, y
  compris en appelant directement la RPC SQL sous le rôle runtime.
- Les permissions affichées viennent du catalogue serveur filtré par délégation.
  Les libellés de rubriques sont informatifs. Un encart explique identité ID,
  services, permissions et activation commerciale ; aucune activation n'est
  effectuée depuis l'éditeur de postes.

API native, acteur/école résolus depuis le cookie :

| Opération | Route | RPC |
| --- | --- | --- |
| Catalogue et détail | `GET /native/access/role-editor?roleId=...` | `api.access_role_editor` |
| Création vide ou modèle | `POST /native/access/roles` | `api.access_role_create` |
| Nom, état, composition | `POST /native/access/roles/:roleId` | `api.access_role_save` |

Les corps JSON sont stricts. Écriture : en-tête `X-SchoolSafe-Action: access-write`,
révision de l'école, motif de 5–500 caractères et confirmation vraie. Maximum
64 permissions, aucun code libre exécuté. L'acteur ne peut pas être fourni par
le navigateur. `no-store`, erreurs assainies, conflit 409 exigeant une relecture.

## Garanties serveur

- Migration additive `database/access/v1/05_custom_roles.sql`, après A3/04.
  Pas de table parallèle, de suppression ou de réécriture d'une ancienne unité.
- `roles.manage`, verrou d'école, puis nouvelle vérification d'autorité et de
  révision. Le contenu entier est validé **avant** de modifier un rôle du demandeur.
  L'auto-modification ne permet pas d'acquérir des droits puis de les déléguer
  dans la suite de la même requête.
- Enveloppe conservatrice A3 conservée. Pour un poste inactif, examiner ses grants
  sans l'activer provisoirement. Les grants actifs même expirés sont examinés,
  et tout grant Control protège le poste. Les grants historiques inactifs doivent
  encore être couverts pour être réactivés.
- Nouvelles permissions : portée explicite `school`, ou portée personnelle
  canonique `own`/`none`, ou `own_children` lorsqu'un modèle canonique la prévoit
  et que l'acteur peut déléguer toute l'école. Portées ciblées avancées : A5.
- Grants existants : portée, dates et conditions conservées ; un champ `scope`
  tenté sur un grant existant est rejeté. Copier un modèle reprend ses conditions
  et portées, dont la paire classe/matière des grants pédagogiques concernés.
- Retirer une permission désactive le grant ; pas de destruction de référence.
  Un DENY d'un autre poste continue de l'emporter. Le dernier administrateur
  actif, permanent et sans condition reste protégé.
- Changement et audit explicite `access.role.created`/`access.role.composed`
  atomiques, avec acteur/école/requête/motif et état avant/après. Les noms des
  membres ne sont pas copiés dans cet événement. Une panne de l'audit annule
  également les changements déjà effectués et l'incrément de révision.
- Après modification de son propre poste, l'interface recharge la session.
  Les réponses tardives après navigation/changement de contexte sont ignorées.

## Preuves du 16 septembre

- **90/90 tests serveur ciblés**, typecheck PASS ; **38/38 contrats statiques**,
  manifestes **9 ensembles / 31 unités**, JASPE Access Law et contrat visuel PASS.
- Installation réelle de **24 unités** sur PostgreSQL 17.11 vide, rejeu ordonné
  A3/04 puis A4/05, tests A2/A3, Access Law trois écoles PASS.
- `scripts/test-custom-roles-postgres.mjs` : création/copie/composition, renommage,
  désactivation/réactivation, scopes/conditions conservés, accès effectifs,
  priorité DENY, cross-school, gestionnaire limité, Control, dernier admin,
  audit et rollback sur panne explicite PASS. Fixtures annulées en fin de test.
- `scripts/qa-access-mutations-live.mjs` : vrai navigateur/cookie/API/PostgreSQL,
  créer → composer → attribuer → relire les membres → DENY effectif, mobile
  sombre, concurrence/révocation A3 et JASPE PASS. Captures bureau/mobile inspectées.
- `app/qa-native-custom-roles.cjs` : réponses obsolètes, noms échappés, permissions
  masquées conservées, soumission unique, formulaire conservé après conflit,
  changement d'école refusé PASS. Une fixture initiale au nom d'un caractère a
  été corrigée pour satisfaire le minimum de deux caractères. QA A1/A2 PASS.
- Upgrade sur ancienne base A3 synthétique `_5` : comparaison complète des lignes
  avant/après dans neuf tables IAM/école/audit PASS, révision inchangée. Le premier
  snapshot a été corrigé pour les tables sans colonne `id`, avant toute migration.

Pour rejouer : base locale **vide** `schoolsafe_access_test_N`, identité
`schoolsafe_bootstrap`, port loopback et variable `SCHOOLSAFE_ACCESS_TEST_URL`.
Exécuter `scripts/test-access-postgres.mjs` avec `SCHOOLSAFE_PSQL`, puis le runner
A4 ci-dessus. Exécuter ensuite `node --import tsx scripts/qa-access-mutations-live.mjs`
avec frontend local sur 4176 ; ce dernier conserve ses fixtures synthétiques.
Ces runners refusent une base publique ou un nom hors namespace de test.

## Limites / prochaine tâche

A5 : modification des dates, périmètres ciblés, conditions et exceptions
individuelles ; corriger aussi la projection bootstrap temporelle/conditionnelle
existante. A6 : journal consultable et révocation sur les autres parcours.
A7 : recette du module complet. Aucun accès de production ni appareil validé ici.
JASPE conserve uniquement son relais protégé ; les futurs outils métier doivent
encore contrôler leur permission et leur cible à chaque exécution.
