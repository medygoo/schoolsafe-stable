# Relecture 3.2 — correctifs après db8d180

Validation du 5 septembre 2026. Périmètre limité aux trois points de relecture ; 3.3 non commencé.

## Provisioning autoritatif

`api.school_provision_roles` garde `roles.manage` et le contrôle de l’école active. Le corps interne sérialise les rejeux sur l’école et synchronise les grants des rôles standards : effet de la matrice, raison canonique, activation et validité, remplacement intégral des portées et conditions. Les grants absents et ceux des templates désactivés sont supprimés avec leurs enfants. Les rôles personnalisés et exceptions individuelles restent sous le contrôle de l’administrateur.

Les triggers existants auditent chaque modification avec son acteur et les états avant/après dans `audit.events`, journal de la baseline VPS. La suppression d’un ALLOW émet désormais `role.permission.revoked`.

`school-replay.test.sql` provisionne l’ancienne matrice, injecte des portées/conditions résiduelles et des grants désactivés/futurs, change la matrice (effet, portée, condition, suppression, template désactivé), puis rejoue sous `schoolsafe_api`. Deux `EXCEPT ALL` comparent exactement les grants, raisons, portées et conditions attendus/réels. Un second rejeu vérifie l’idempotence sémantique. Résultat : 7 grants supprimés au premier rejeu, 0 au suivant.

## Bootstrap interne

`ops.bootstrap_school` est réservé à une session `schoolsafe_migrator`, avec EXECUTE retiré à PUBLIC/API/Worker. Aucune permission de session frontend ne permet l’amorçage. Les anciennes fonctions API de bootstrap du brouillon sont supprimées.

Une transaction crée l’école inactive et l’identité du futur administrateur sans aucun rôle. Cette identité précède les grants pour fournir un `actor_profile_id` valide à chaque événement d’audit. Le provisioning initial intervient ensuite, puis l’attribution du rôle admin, la vérification normale `roles.manage` et l’activation de l’école. L’opérateur SQL est enregistré dans les événements de bootstrap. Le contexte appelant est restauré. Une erreur annule l’ensemble ; le code unique de l’école empêche le réamorçage d’une école existante.

Preuves : session de migration non superuser, refus API et Worker, premier admin autorisé à rejouer par l’API normale, audit et restauration du contexte, refus du doublon et des paramètres invalides, rollback d’une erreur tardive sans école/utilisateur résiduel.

## Contrôle des frais

Le template `fee_control` utilise `assigned_fee_classes`. Cette portée consulte `app.fee_control_assignees`, la campagne demandée et sa liste de classes. Elle exige une campagne publiée dans sa période de validité, une affectation du profil et une classe de la même école. `p_runtime_context.campaign_id` est obligatoire ; les signatures API restent inchangées. Le contexte est transmis aux portées des grants et des exceptions, pour préserver la priorité DENY. Les portées enseignants conservent leur moteur et la paire classe/matière existants.

Preuves : agent non enseignant affecté PASS ; agent non affecté FAIL ; vraie classe d’une autre école, même mentionnée dans la campagne, FAIL ; campagne absente/autre/expirée FAIL ; affectation aux frais sans affectation enseignante FAIL en pédagogie ; exception individuelle DENY prioritaire.

## Validation et isolation

- 61 tests locaux baseline/AUTH/ACCESS : PASS.
- Baseline complète, preuve Access_Law existante, AUTH et double application ACCESS : PASS sur PostgreSQL **17.11** (`170011`).
- Trois suites SQL ci-dessus : PASS, avec assertions bloquantes et rollback des fixtures.
- Harnais reproductible : `scripts/run-ephemeral.sh`, image PostgreSQL épinglée, nouveau conteneur, `--network none`, aucun port, stockage tmpfs et suppression automatique.
- Aucun secret ni volume TEST/TRIAL/PROD utilisé ; seuls SQL, manifestes et tests autorisés ont été transférés.
- Manifestes et empreintes du wrapper local synchronisés. Le wrapper ciblant TEST n’a pas été exécuté ni transféré.

Aucun déploiement. Arrêt après le commit pour relecture.
