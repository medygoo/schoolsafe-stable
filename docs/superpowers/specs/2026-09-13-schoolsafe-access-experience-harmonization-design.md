# SchoolSafe — Harmonisation des profils, accès, tableaux de bord, écosystème et JASPE

Date : 13 septembre 2026
Statut : conception validée en conversation, en attente de relecture du document par le propriétaire

## 1. Objectif

SchoolSafe doit présenter une expérience cohérente à chaque utilisateur sans multiplier les applications ni confondre profil, poste et permission. Une seule loi d'accès doit gouverner la base, le serveur, l'interface, les services de l'écosystème et JASPE.

L'administrateur d'une école peut créer les postes dont son établissement a besoin, leur attribuer des fonctionnalités et limiter leur portée. Cette liberté reste enfermée dans les protections souveraines de SchoolSafe Control et de l'Access Law.

## 2. Décisions verrouillées

- L'harmonisation conserve et corrige l'existant ; elle ne réécrit pas l'application depuis zéro.
- Les quatre expériences adultes visibles sont `Direction`, `Enseignant`, `Gardien` et `Parent`.
- Les métiers tels que direction générale, secrétariat, admission, caisse, comptabilité, ressources humaines, infirmerie ou communication sont des postes ou rôles internes combinables, pas des applications séparées.
- L'administrateur principal d'une école peut créer un poste, choisir ses permissions, ses portées et ses limites, puis l'attribuer à un ou plusieurs utilisateurs.
- L'administrateur est souverain dans le périmètre de son école, mais ne peut ni traverser la frontière d'une autre école, ni neutraliser l'audit, l'Access Law, les protections des enfants ou SchoolSafe Control.
- L'élève est un sous-profil supervisé, distinct du dossier administratif de l'élève et distinct d'un compte adulte autonome.
- JASPE ne possède aucun droit propre et ne peut jamais élargir ceux du contexte actif.
- Les actions ordinaires autorisées peuvent être exécutées par JASPE. Les actions sensibles sont préparées puis confirmées par un humain autorisé.
- Les couleurs métier existantes sont conservées et harmonisées dans une composition commune.
- SchoolSafe reste en HTML, CSS et JavaScript, sans React, Ant Design, 3D ou Docker. JASPE reste en 2D/2,5D.

## 3. Vocabulaire canonique

### 3.1 Expérience

L'expérience détermine l'organisation générale de l'interface. Elle ne donne aucun droit à elle seule.

- `Direction` : administration et fonctions internes de l'école.
- `Enseignant` : classes, matières et activités pédagogiques affectées.
- `Gardien` : portail, passages, scans, remises et alertes de sécurité affectés.
- `Parent` : enfants liés, communication familiale et services autorisés.

### 3.2 Poste

Un poste est un ensemble réutilisable de permissions et de limites défini dans une école. Il peut correspondre à un métier courant ou à une organisation locale, par exemple `Responsable bibliothèque`, `Préfet des études` ou `Surveillant portail nord`.

Un utilisateur peut cumuler plusieurs postes dans la même expérience. Il conserve un seul compte et reçoit l'union des autorisations, sous réserve des refus explicites et des protections souveraines.

### 3.3 Permission

Une permission décrit une capacité atomique et stable, par exemple lire un dossier élève, créer un devoir, enregistrer un paiement ou gérer un portail. Les écrans et JASPE consomment les mêmes codes canoniques que le serveur et la base.

### 3.4 Portée et condition

La portée limite les ressources couvertes par une permission : école, profil personnel, enfants liés, classes affectées, matières affectées ou portail affecté. Une condition peut limiter la date, l'horaire, l'état d'une campagne, l'ouverture d'une caisse ou une autre situation métier explicitement reconnue par l'Access Law.

### 3.5 Sous-profil élève

Le dossier élève contient les données officielles gérées par les adultes autorisés. Le sous-profil élève est le contexte restreint utilisé par l'enfant. L'ouverture du mode enfant ne transmet jamais les droits du parent.

## 4. Access Law souveraine

La décision d'accès suit cette chaîne :

`identité authentifiée → école active → profil actif → postes actifs → permission → portée → conditions → exceptions → décision → audit`

Les invariants sont :

1. absence d'autorisation signifie refus ;
2. un refus explicite applicable est prioritaire sur une autorisation ;
3. toute ressource doit appartenir à l'école active ;
4. une portée doit correspondre à la ressource demandée ;
5. classe et matière doivent former une affectation enseignante active lorsqu'une opération pédagogique l'exige ;
6. une condition inconnue ou impossible à vérifier provoque un refus ;
7. une opération sensible est refusée si la décision ou l'audit indispensable ne peut pas être obtenu ;
8. l'interface ne constitue jamais la barrière de sécurité finale.

La matrice SQL récente, le catalogue partagé des permissions et les fonctions `api.*` contextualisées deviennent l'unique chemin de décision. Les anciennes nomenclatures, projections ou gardes qui contredisent ce contrat sont migrées puis retirées lorsqu'aucun consommateur ne les utilise plus.

## 5. Autorité de l'administrateur scolaire

L'administrateur principal peut :

- créer, renommer, désactiver et dupliquer un poste dans son école ;
- sélectionner des permissions parmi le catalogue autorisé pour l'école ;
- attribuer des portées concrètes à chaque permission ;
- ajouter des dates de début et de fin lorsque le type de poste le permet ;
- attribuer plusieurs postes à un utilisateur ;
- retirer immédiatement une permission ou un poste ;
- consulter l'historique des changements qu'il est autorisé à administrer.

Il ne peut pas :

- consulter ou administrer une autre école ;
- créer un nouveau code de permission arbitraire ;
- s'accorder une capacité réservée à SchoolSafe Control ;
- désactiver l'audit ou la loi d'accès ;
- supprimer les confirmations imposées aux opérations sensibles ;
- transformer un sous-profil élève en compte adulte ;
- demander à JASPE de contourner une décision d'accès.

SchoolSafe Control publie le catalogue de capacités disponibles selon la licence et les protections globales. L'administrateur compose librement ses postes à l'intérieur de cette enveloppe.

## 6. Contrat de session unique

Après authentification, le serveur construit un contrat de session à partir de la base souveraine. Ce contrat contient au minimum :

- l'identité et l'école actives ;
- l'expérience principale ;
- les postes actifs ;
- les permissions effectives ;
- les refus et exceptions utiles à l'explication ;
- les classes, matières, portails ou enfants accessibles ;
- les services d'écosystème activés pour l'école et autorisés pour l'utilisateur ;
- le niveau d'action disponible pour JASPE ;
- la politique de fonctionnement hors ligne.

Le navigateur ne recalcule pas une loi différente. Il utilise ce contrat pour composer l'expérience et demande au serveur une nouvelle décision pour toute action métier. Une révocation sensible invalide l'accès serveur immédiatement ; le client se resynchronise et retire ensuite l'élément concerné.

## 7. Tableaux de bord

Les tableaux de bord partagent une structure visuelle commune mais sont composés avec les éléments autorisés.

### 7.1 Ordinateur

1. navigation principale dans la colonne gauche ;
2. identité, recherche et notifications dans la barre supérieure ;
3. zone JASPE en tête du contenu ;
4. fonctionnalités métier autorisées ;
5. écosystème SchoolSafe ;
6. activités, indicateurs et alertes accessibles ;
7. SchoolSafe Control dans la navigation latérale uniquement pour les administrateurs autorisés.

### 7.2 Mobile

1. identité compacte en haut ;
2. carte JASPE principale ;
3. fonctionnalités autorisées ;
4. écosystème en grille de deux colonnes ;
5. navigation fixe `Accueil`, `Voir tout`, `JASPE`, `Profil`.

`Voir tout` signifie toujours voir toutes les fonctions autorisées, jamais toutes les données de l'école.

### 7.3 Expériences

- Direction met en avant les fonctions accordées aux postes attribués et réserve l'atelier des postes aux administrateurs autorisés.
- Enseignant met en avant les classes, matières, devoirs, notes, plans de cours et communications affectés.
- Gardien met en avant le portail, les scans, les passages, les remises et les alertes applicables.
- Parent met en avant les enfants liés, les présences, la pédagogie publiée, les messages et les services familiaux autorisés.
- Élève utilise une composition simplifiée dans son propre contexte supervisé.

## 8. Écosystème SchoolSafe

La section Écosystème est distincte des fonctionnalités métier. Elle regroupe les services, identités et équipements, notamment :

- SchoolSafe ID ;
- SchoolSafe Pass ;
- SchoolSafe Watch ;
- SchoolSafe StaffID ;
- SchoolSafe Famille ;
- SchoolSafe Lab.

La visibilité suit trois niveaux :

- un utilisateur ordinaire voit uniquement les services activés et autorisés ;
- la Direction autorisée voit aussi les services disponibles mais non activés, avec l'état `Non activé` ;
- SchoolSafe Control voit le catalogue complet pour administrer licences, activation et supervision.

Un service activé par licence n'est pas automatiquement utilisable : la permission et la portée de l'utilisateur restent nécessaires.

## 9. JASPE

JASPE est une couche d'accompagnement et d'orchestration, pas une autorité. Elle reçoit un contexte dérivé de la session, demande une décision d'accès pour chaque capacité et ne reçoit que les données nécessaires à la demande autorisée.

Trois niveaux d'action sont définis :

1. `informer` : expliquer ou restituer des données autorisées ;
2. `préparer` : produire un brouillon ou remplir une opération sans la valider ;
3. `exécuter` : réaliser une action ordinaire explicitement autorisée.

Une confirmation humaine est obligatoire pour :

- publier ou modifier une note officielle ;
- enregistrer, annuler ou clôturer une opération financière ;
- créer, modifier ou retirer un poste ou une permission ;
- déclencher une opération sensible de sécurité ;
- supprimer ou archiver une donnée ;
- modifier une donnée protégée d'un enfant ;
- envoyer une communication officielle lorsque la politique métier l'exige.

Une réponse générée par le modèle ne déclenche jamais directement du code libre. Un routeur SchoolSafe traduit une intention fermée vers une capacité connue, vérifie l'accès, prépare la confirmation éventuelle, exécute par une API métier et journalise le résultat.

Le refus de JASPE explique la limite sans révéler l'existence ou le contenu d'une ressource interdite. Une panne de JASPE ne bloque ni la connexion ni les fonctionnalités métier.

## 10. Sous-profil élève

Le sous-profil élève est relié à un seul dossier élève et reste supervisé. Son activation nécessite la validation de l'école et du tuteur principal. Les adultes conservent la gestion du dossier officiel.

Le contexte enfant peut être ouvert depuis le mode Parent, SchoolSafe Watch ou un équipement SchoolSafe Lab autorisé. Il est impossible de revenir aux fonctions adultes sans une réauthentification appropriée du parent.

Le sous-profil peut recevoir des capacités limitées de pédagogie, présence publiée, sécurité personnelle, communication autorisée et JASPE pédagogique. Il ne peut pas modifier ses notes officielles, confirmer sa propre présence, choisir ses responsables, accéder aux finances adultes, ouvrir le dossier d'un autre élève ou s'accorder une permission.

La définition détaillée des permissions enfant fera l'objet d'un lot dédié avant son implémentation. Ce lot devra réutiliser les codes canoniques lorsqu'ils expriment correctement la capacité et ajouter uniquement les capacités atomiques réellement manquantes.

## 11. Gestion des erreurs et audit

- Une décision impossible à calculer produit un refus contrôlé.
- Une action sensible dont l'audit obligatoire échoue n'est pas exécutée.
- Le serveur renvoie des erreurs stables sans données confidentielles.
- L'interface distingue absence de permission, service non activé, contexte expiré et indisponibilité temporaire.
- Une révocation invalide le serveur immédiatement et provoque une actualisation de l'expérience cliente.
- Les changements de poste, permission, portée et condition enregistrent l'acteur, l'école, la cible, l'ancienne valeur, la nouvelle valeur, la date et l'identifiant de requête.

## 12. Stratégie de migration

L'ensemble est trop large pour un changement atomique. L'exécution est décomposée en lots indépendamment vérifiables :

1. inventaire et contrat canonique des permissions ;
2. consolidation du chemin serveur contextualisé et retrait des nomenclatures incompatibles ;
3. postes personnalisables et administration dans l'école ;
4. contrat de session et composition dynamique commune ;
5. tableaux de bord et section Écosystème responsive ;
6. capacités JASPE gouvernées et confirmations ;
7. sous-profil élève supervisé ;
8. consolidation, migrations finales, documentation et préparation du VPS.

Chaque lot corrige l'existant avant de retirer une ancienne couche. Une compatibilité transitoire peut être utilisée uniquement si elle est fail-closed, testée et supprimée dans un lot explicitement identifié.

## 13. Vérifications obligatoires

Les tests restent ciblés. Les risques suivants exigent néanmoins une preuve automatisée ou une vérification reproductible :

- isolation entre écoles ;
- permissions, refus, portées, conditions et expiration ;
- création et attribution des postes personnalisés ;
- révocation immédiate des droits sensibles ;
- données des enfants et séparation Parent/Élève ;
- notes et affectations classe-matière ;
- paiements, caisse et annulations ;
- portails, scans et actions de sécurité ;
- niveaux d'action et confirmations JASPE ;
- migrations, catalogue de permissions et contrat de session ;
- correspondance entre éléments affichés et décisions du serveur ;
- affichage responsive ordinateur et mobile sans débordement.

## 14. Critères de réussite

L'harmonisation est terminée lorsque :

1. un seul catalogue de permissions et une seule Access Law gouvernent tous les chemins actifs ;
2. l'administrateur peut créer un poste et en définir les droits dans son école sans créer de nouveau profil applicatif ;
3. le même contrat produit le menu, le tableau de bord, l'écosystème et les capacités JASPE ;
4. aucune opération interdite ne devient possible par URL directe, appel serveur ou demande à JASPE ;
5. le mode Élève ne peut jamais hériter des droits du Parent ;
6. les quatre expériences sont cohérentes sur ordinateur et mobile ;
7. les tests critiques réussissent ;
8. les documents de continuité, le dépôt local et GitHub sont synchronisés avant toute intervention sur le VPS.

## 15. Hors périmètre

- déploiement VPS pendant les lots d'harmonisation ;
- Docker ;
- retour de la 3D ;
- migration vers React ou Ant Design ;
- synthèse vocale et synchronisation labiale de JASPE ;
- remplacement de SchoolSafe Control ;
- création libre de nouveaux codes de permission par un administrateur scolaire.
