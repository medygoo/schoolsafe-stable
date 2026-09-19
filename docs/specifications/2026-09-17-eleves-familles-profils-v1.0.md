# SchoolSafe — Élèves, familles et profils enfants
Spécification fonctionnelle et contrat de données
Version : 1.0 — 17 septembre 2026
Destinataire : agent de données et agents de développement SchoolSafe
Porteur des décisions métier : Loms
Périmètre : inscription, famille, authentification des adultes, sous-profil enfant supervisé, récupération, import collectif, droits et tests.

Instruction centrale : un enfant possède un seul dossier élève dans son école. Le père, la mère et le tuteur peuvent chacun avoir un compte et accéder à ce même enfant. Un seul responsable principal gère jusqu'à trois personnes accréditées externes, sans leur créer de compte.

## Statut du document

Ce document consolide les décisions explicitement validées dans la conversation du 17 septembre 2026. Les règles marquées V sont les validations métier. Les précisions marquées T constituent leur traduction technique proposée : elles doivent être adaptées au dépôt existant sans modifier ces validations.

Ce fichier est une spécification, pas un constat de fonctionnalités déjà développées. Le dépôt, la base et les services en production n'ont pas été audités pour sa rédaction. Les noms de tables, états et API sont des contrats conceptuels à rapprocher de l'existant ; aucune migration n'est fournie à exécuter directement.

Le nom de référence retenu est SchoolSafe, utilisé dans l'historique du projet. Les variantes orales SchoolSoft et SchoolServe ne créent pas de nouveaux produits ni de nouvelles bases.

Lire d'abord les sections 1 à 8 pour les règles métier ; les sections 9 à 15 pour les parcours et le contrat de données ; les sections 16 à 18 pour les tests et la transmission entre agents. Le classeur SchoolSafe_Modele_Import_v1.0.xlsx accompagne cette spécification. Il est un modèle de contrat pour l'importeur à développer, et non la preuve que l'application actuelle sait déjà le lire.

## 1. Registre des décisions validées

- V01 — Unicité de l'enfant. Un seul dossier élève par enfant dans une école, identifié par student_id et rattaché à school_id. Le sous-profil affiché chez chaque adulte est une vue autorisée de ce dossier, jamais une copie.
- V02 — Trois responsables familiaux possibles. Père, mère et tuteur. Chacun peut disposer de son propre compte facultatif. Ce sont des rôles familiaux, pas trois identifiants de connexion obligatoires.
- V03 — Une seule autorité principale. Un seul des responsables est principal pour l'enfant. Il n'existe aucun quatrième compte « supérieur ». Un adulte peut être principal pour un enfant et secondaire pour un autre.
- V04 — Suivi partagé. Les trois responsables disposant d'un compte et d'un lien actif validé peuvent recevoir les devoirs et informations scolaires, suivre la progression et superviser le sous-profil enfant, dans leurs permissions respectives.
- V05 — Gestion des accrédités. Le responsable principal est le seul responsable familial autorisé à ajouter, modifier, suspendre ou retirer les personnes accréditées externes. Les secondaires consultent la liste sans la modifier.
- V06 — Trois accrédités externes au maximum. Jusqu'à trois autorisations externes actives par enfant, en plus des trois responsables familiaux possibles. Le plafond porte sur chaque enfant et non sur toute la famille ou sur toute l'école.
- V07 — Aucun compte pour la récupération externe. Enregistrer une personne accréditée ne lui crée ni compte d'authentification, ni espace parent, ni accès au sous-profil enfant. Sa fiche sert uniquement à son identification et à son autorisation de récupération.
- V08 — Photo obligatoire. Une photo exploitable est requise pour l'enfant et pour toute personne susceptible de le récupérer, y compris père, mère et tuteur. Une simple liste de noms ou une photo sans identité ne suffit pas.
- V09 — Contrôle humain à la sortie. Le gardien affiche la photo, compare physiquement la personne présente et confirme la remise seulement après vérification de l'autorisation. Un QR valide ne remplace pas cette comparaison.
- V10 — Récupération par les responsables. Les responsables familiaux validés sont autorisés par défaut à récupérer l'enfant, sous réserve d'une photo valide et de l'absence de restriction. Avoir un compte n'est ni nécessaire ni suffisant pour une remise.
- V11 — Pas de délégation en cascade. Une personne accréditée ne peut pas accréditer une autre personne.
- V12 — Changements contrôlés. Le changement de responsable principal est validé par l'école, tracé et réalisé sans recréer les comptes ou le dossier enfant. Une restriction ou un doute suspend la remise jusqu'à décision humaine habilitée.
- V13 — Profil enfant supervisé. L'enfant possède un espace personnel adapté, mais pas un compte adulte autonome. L'accès enfant direct reste une fonctionnalité supervisée à activer dans la phase prévue ; la présence du dossier élève ne l'active pas automatiquement.
- V14 — Deux modes d'inscription. Inscription individuelle enchaînée, enfant après enfant, et import collectif CSV/XLSX de l'effectif d'une école.
- V15 — Import vérifié avant écriture. Contrôle des données, rapprochement des personnes, résolution des doublons, aperçu, confirmation et rapport final. Aucun accès familial ne doit être accordé sur une ressemblance de noms ou un téléphone commun.
- V16 — Historique conservé. Les changements de liens, autorisations, classes et années scolaires sont historisés. La fermeture d'un lien ne supprime pas automatiquement la personne, son compte ou ses autres enfants.
- V17 — Isolation par école. Données, fichiers, recherches, exports, autorisations et contexte JASPE sont isolés par school_id. Aucun lien entre écoles n'est créé implicitement.
- V18 — Contexte de l'enfant actif. Lorsqu'un adulte sélectionne un enfant, les menus, notifications détaillées, données et réponses JASPE concernent cet enfant et son école. Le changement d'enfant ne mélange pas les données.

Précisions qui évitent une mauvaise interprétation : les interprétations « trois tuteurs identiques », « seul le tuteur principal voit l'enfant » et « créer un compte pour chaque accrédité » sont exclues par V02, V04 et V07. Le terme « tuteur principal » désigne ici le responsable principal, qui peut être le père, la mère ou le tuteur.

## 2. Objets à ne jamais confondre

- Personne : identité d'un adulte : nom, photo, contacts autorisés. Elle peut exister sans compte.
- Compte adulte : moyen personnel de connexion, rattaché à une identité vérifiée, pas à une famille entière.
- Relation familiale : lien entre une personne et un enfant : PERE, MERE ou TUTEUR, principal ou secondaire.
- Dossier élève : identité scolaire stable de l'enfant dans l'école.
- Inscription annuelle : classe et parcours de l'enfant pour une année scolaire ; séparés de son identité stable.
- Sous-profil côté adulte : présentation du même dossier élève dans « Mes enfants ».
- Espace enfant : interface restreinte utilisée par l'enfant sous supervision.
- Accréditation : autorisation de récupération d'un enfant par une personne externe, avec dates, photo et statut.
- Authentification : vérification de la personne connectée. Elle ne vaut pas autorisation de voir un enfant ou de le récupérer.

T01 — Séparation structurelle : ne pas utiliser eleve.parent1/parent2/parent3 comme unique modèle de famille ; des emplacements de formulaire sont possibles, mais doivent alimenter des relations normalisées.
T02 — Cas familial incomplet : trois responsables est un maximum, pas une obligation ; ne pas inventer d'adulte ; un dossier sans principal reste incomplet.
T03 — Même adulte, plusieurs enfants : réutiliser son identité locale et son compte vérifié ; créer une relation par enfant.

## 3. Organisation familiale

Chaque relation possède un rôle familial (PERE, MERE, TUTEUR) et un niveau d'autorité (PRINCIPAL ou SECONDAIRE). L'autorité principale est attachée à l'enfant. L'école valide les relations et les décisions sensibles ; elle peut suspendre une remise pour sécurité.

Exemple de référence (fictif) : Patrick père secondaire, Sarah mère principale, David tuteur secondaire pour Junior ; Jeanne, Ruth et Alain accrédités externes sans compte. Junior apparaît sous le même student_id chez Patrick, Sarah et David. Sarah peut aussi voir Grace si elle y est reliée ; David ne voit pas Grace sans relation propre.

T04 — Transfert du rôle principal : transaction unique vérifiée par l'école (retrait de l'ancienne autorité, attribution de la nouvelle, journalisation, recalcul immédiat des droits) ; jamais deux principaux ni zéro principal opérationnel ; les accréditations sont présentées au nouveau principal pour revue, pas effacées automatiquement.

## 4. Dossier élève et parcours scolaire

Données d'identité : nom complet (nom, postnom, prénom séparés si possible), date et lieu de naissance, sexe selon le formulaire scolaire, photo, école, classe, année scolaire, responsable principal identifié, contacts familiaux, adresse, pièces et statut de complétude. Matricule selon la règle de l'école, unique dans l'école ; jamais remplacé par un téléphone de parent.

Inscription annuelle distincte : une réinscription crée une nouvelle inscription annuelle, pas un nouvel enfant ; historique conservé ; un transfert vers une autre école crée ou rapproche un dossier dans l'école de destination sans déplacer le school_id des lignes historiques.

T05 — États distincts : Dossier : BROUILLON, A_VERIFIER, VALIDE, ARCHIVE. Inscription annuelle : EN_PREPARATION, ACTIVE, TERMINEE, TRANSFEREE. Relation familiale : EN_ATTENTE, ACTIVE, SUSPENDUE, CLOTUREE.

## 5. Comptes des adultes et rattachement sécurisé

Le compte est facultatif, l'identité obligatoire. Pas d'identifiant partagé « famille Junior », pas de mot de passe partagé, pas de secrets dans les fiches élèves. Un principal sans compte reste principal ; l'administration peut saisir une instruction documentée.

T06 — Séquence d'invitation : identifier la personne, valider son lien, préparer une invitation, vérifier le canal, rattacher le compte existant ou nouvellement activé, afficher seulement les enfants autorisés. Un numéro ou courriel partagé est un indice, pas une preuve d'identité ; ne pas fusionner deux personnes sur cette seule base.

T07 — Un accrédité peut avoir un compte pour un autre rôle/enfant : cette accréditation ne lui confère aucun accès supplémentaire à l'enfant concerné.

## 6. Sous-profils enfants

Espace adulte « Mes enfants » : une carte par enfant autorisé (photo, nom, école, classe, présence du jour, devoir à venir, alerte utile) ; une carte ouvre le contexte (school_id, student_id). Le sous-profil n'est pas une copie ; les permissions, préférences et états de lecture restent propres à chaque compte.

Volets : Accueil, Pédagogie, Présences, Sécurité, Communication, Documents, Identité, Frais scolaires, Watch (futur), JASPE.

T08 — Réglages sensibles : tous les responsables actifs peuvent accompagner une séance enfant et demander son arrêt ; les réglages durables sont gérés par le principal dans les limites fixées par l'école. Aucun adulte ne lève une restriction scolaire.

Espace enfant : Mes devoirs, Mes exercices, Mes leçons, Ma progression, Mon emploi du temps, Demander à JASPE. Accès direct enfant désactivé tant que sa phase n'est pas ouverte ; session enfant supervisée, limitée à un enfant, une école et des permissions précises.

T09 — Entrée/sortie du mode enfant : l'adulte lance la session ; le serveur émet un contexte restreint ; le retour à l'espace adulte exige une vérification adulte. Révoquer les sessions enfant lorsqu'une relation de supervision ou une restriction change. États recommandés : DESACTIVE et SUPERVISE.

JASPE et notifications : JASPE reçoit le contexte autorisé de l'acteur, de l'école, de l'enfant et du mode adulte/enfant ; elle appelle des outils/API soumis à ACCESS_LAW ; ne choisit pas arbitrairement un autre enfant. Chaque adulte a ses états de lecture. À tout changement d'enfant, annuler/ignorer les requêtes en vol.

## 7. Accréditations et récupération physique

Deux listes séparées à l'écran : « Responsables familiaux » et « Personnes accréditées à la récupération » (jusqu'à six personnes distinctes au total). Les trois places d'accréditation ne sont pas consommées par les responsables familiaux ; pas de doublon de fonction.

Fiche d'un accrédité : nom complet, photo obligatoire, lien déclaré avec l'enfant, téléphone, dates de validité, statut, auteur de la demande, validation scolaire et historique. Pas de données systématiquement obligatoires au-delà.

T10 — Circuit : le principal crée la demande avec photo ; l'école vérifie puis active. EN_ATTENTE n'autorise aucune récupération. Le retrait/suspension demandé par le principal prend effet immédiat. Une modification de photo/identité/étendue doit être revue avant de produire un droit élargi.

T11 — Plafond sous concurrence : refuser une quatrième autorisation active, contrôle côté serveur dans une transaction avec verrouillage sur l'enfant.

Parcours du gardien : identifier l'enfant (QR ou secours autorisé) ; afficher sa photo et sa présence ; présenter les personnes autorisées ; sélectionner la personne présente ; afficher sa photo ; vérifier restriction et validité ; comparaison visuelle ; confirmer la remise ; enregistrer et notifier. Le serveur revérifie les droits au moment de confirmer. En cas de doute : ne pas confirmer, orienter vers un responsable scolaire habilité ; l'IA n'effectue pas de reconnaissance faciale autonome.

Hors connexion : ne pas présenter une autorisation périmée comme vérifiée en temps réel ; sans vérification suffisamment récente, le flux standard bloque la confirmation et appelle une décision humaine habilitée.

## 8. Matrice des permissions

Les « oui » supposent toujours une identité authentifiée, une relation active, la bonne école et l'absence de restriction.

- Voir devoirs et résultats publiés : Principal oui, Secondaires oui, Enfant vue adaptée, Accrédité non, École selon rôle pédagogique.
- Superviser la séance enfant : Principal et Secondaires oui, autres non.
- Modifier les notes officielles : uniquement enseignant/validation prévue.
- Voir les accrédités : Principal et Secondaires oui ; École gardien/administration habilités.
- Demander un nouvel accrédité : Principal uniquement (École : saisie pour principal documentée).
- Valider une accréditation : administration habilitée uniquement.
- Suspendre/retirer un accrédité : Principal (immédiat) ; École sécurité/administration habilitées.
- Transférer l'autorité principale : demande des responsables, validation par l'école.
- Confirmer une remise : gardien habilité uniquement.
- Importer l'effectif : permission explicite d'import.
- Accéder à une autre famille : uniquement périmètre professionnel.

## 9. Inscription individuelle

Huit étapes : contexte scolaire (année/classe, school_id serveur) → vérification de l'enfant (recherche par matricule, indices pas fusion) → identité et photo (brouillon ≠ validation) → responsables (rechercher/créer, relations, principal, comptes facultatifs) → accrédités (0 à 3, accord du principal) → récapitulatif (manquants et droits ouverts) → enregistrement transactionnel → suite (« ajouter un autre élève », « ajouter un frère/une sœur », « ouvrir le dossier »).

Idempotence : double pression ou reprise réseau ne crée pas deux élèves ; clé d'idempotence ; numéro d'inscription = résultat serveur.

## 10. Import collectif

Format de référence XLSX multi-feuilles (Eleves, Personnes, Liens_Familiaux, Accreditations, Pieces ; LIRE_MOI et EXEMPLE non importés). Équivalent CSV = lot de fichiers. Un lot concerne une seule école choisie par un opérateur autorisé. L'import enregistre élèves/personnes/relations, pas des comptes automatiques.

Huit étapes de l'importeur : télécharger le modèle → charger → contrôler → rapprocher (références import connues, correspondances probables sans fusion automatique) → prévisualiser → confirmer (toute modification invalide l'aperçu) → appliquer (transaction, revalidation) → restituer (rapport téléchargeable, erreurs détaillées feuille/ligne/champ).

T12 — Erreur bloquante empêche la confirmation du lot par défaut ; import partiel uniquement en choix explicite.
T13 — Réimportation idempotente via school_id + identifiant de source + références externes stables ; une cellule vide ne supprime pas une valeur ; une absence de ligne ne retire personne.
T14 — Fichiers préparés dans un stockage privé, vérifiés puis référencés ; base et stockage ne forment pas une transaction unique : prévoir suivi, reprise et nettoyage.

Doublons : matricule déjà présent → proposer le dossier et contrôler les contradictions ; même adulte plusieurs enfants → une personne, plusieurs relations ; téléphone commun → conflit à vérifier, pas fusion ; homonymes/jumeaux → deux enfants distincts sauf preuve ; correspondance dans une autre école → jamais visible ni fusionnée.

## 11. Contrat du modèle Excel / CSV

En-têtes techniques ligne 1, données ligne 2 ; références et téléphones en texte ; dates ISO AAAA-MM-JJ ; références uniques et stables ; aucun mot de passe, secret, auth_user_id imposé, URL publique de photo ou formule. CSV UTF-8, séparateur point-virgule confirmé à la lecture.

- Eleves : eleve_ref (obligatoire), matricule, nom (obligatoire), postnom, prenom, sexe (F/M/NON_RENSEIGNE), date_naissance (ISO), lieu_naissance, classe_code, annee_scolaire, photo_ref, adresse.
- Personnes : personne_ref (obligatoire), nom (obligatoire), postnom, prenom, telephone, email, photo_ref (obligatoire avant récupération), adresse, inviter_compte (OUI/NON, NON par défaut ; OUI seulement pour un responsable familial du lot).
- Liens_Familiaux : eleve_ref, personne_ref, role_familial (PERE/MERE/TUTEUR), autorite (PRINCIPAL/SECONDAIRE) ; exactement un principal pour un dossier activé ; au plus un père, une mère, un tuteur actifs ; une même personne n'occupe pas deux places familiales actives pour le même enfant.
- Accreditations : accreditation_ref, eleve_ref, personne_ref (distincte des responsables), lien_enfant, date_debut, date_fin (facultative), principal_ref, preuve_accord_ref. Les lignes importées préparent des demandes, pas des autorisations actives.
- Pieces : piece_ref, proprietaire_type (ELEVE/PERSONNE), proprietaire_ref, type_piece (PHOTO, ACTE_NAISSANCE, JUSTIFICATIF, ACCORD_ACCREDITATION, AUTRE), nom_fichier (relatif dans le lot).

## 12. Modèle de données logique proposé

T15 — Adapter plutôt que dupliquer : produire d'abord une table de correspondance concept/table existante/évolution nécessaire.

Concepts : students, student_enrollments, persons, person_auth_links, student_guardians (rôle familial, autorité, statut, récupération), pickup_authorizations, child_profile_settings, child_sessions, media_assets/documents, pickup_events, authority_change_history, import_jobs/import_rows, external_references, audit_log, notification_outbox/receipts.

T16 — Clés comprenant school_id ; unicité du matricule dans son école et des références externes dans leur source.
T17 — Famille : au plus un lien actif par couple enfant/personne et par rôle ; au plus un principal actif par enfant ; contrôler « au moins un principal » lors des transactions.
T18 — Autorisations externes : au plus une active par couple enfant/personne ; maximum trois actives par enfant ; toutes les voies d'écriture (UI, import, validation) passent par le même service de contrôle.
T19 — Verrou commun aux modifications de principal/restrictions/accréditations et à la confirmation de remise ; recontrôler les permissions après acquisition du verrou ; version de dossier pour refuser proprement les formulaires périmés.

## 13. Sécurité, fichiers et confidentialité

T20 — Autorisation sur chaque opération : ACCESS_LAW, refus par défaut, contrôles serveur ; un student_id connu, un menu caché ou un QR possédé ne vaut pas permission.
T21 — RLS et rôles de service : tester le cloisonnement avec les véritables rôles applicatifs, pas un administrateur de base.
T22 — Fichiers non fiables : contrôler extension, contenu réel, taille, quotas, noms ; renommer côté serveur ; refuser macros et formules actives ; limiter archives (nombre, taille décompressée, traversée de chemins).

Stockage objet central privé séparé par école (convention schools/{school_id}/students/{student_id}/... en R2) ; en base uniquement références et métadonnées ; URLs temporaires après contrôle d'accès. Minimisation : parents = suivi, gardien = remise ; pas de mots de passe/jetons/photos brutes dans les journaux. Horodatage serveur, fuseau configuré de l'école (Africa/Kinshasa). Auteur réel conservé ; modification exécutée par l'école conserve auteur technique et demandeur métier.

## 14. Contrat applicatif / API

Opérations : rechercher un élève, préparer/créer une inscription, réinscrire, rechercher/rattacher un adulte, inviter un responsable, lister Mes enfants, ouvrir un sous-profil, lancer une session enfant, gérer les accréditations, valider une accréditation, transférer le principal, confirmer la remise, préparer un import, confirmer/suivre un import.

Erreurs métier à normaliser : SCHOOL_SCOPE_MISMATCH, STUDENT_DUPLICATE_CANDIDATE, PERSON_MATCH_AMBIGUOUS, PRIMARY_REQUIRED, MULTIPLE_PRIMARY, FAMILY_ROLE_OCCUPIED, NOT_PRIMARY_GUARDIAN, PICKUP_LIMIT_REACHED, PHOTO_REQUIRED, AUTHORIZATION_PENDING, AUTHORIZATION_EXPIRED, PICKUP_RESTRICTED, STALE_VERSION, REFERENCE_NOT_FOUND, INVALID_IMPORT_FORMAT, IMPORT_PREVIEW_STALE, EXTERNAL_PICKUP_ACCOUNT_FORBIDDEN, CHILD_MODE_FORBIDDEN.

## 15. États, invariants et observabilité

États des accréditations : BROUILLON, EN_ATTENTE, ACTIVE, SUSPENDUE, REVOQUEE, EXPIREE. Une ligne ACTIVE avec date expirée est refusée même sans clôture automatique. Une réactivation repasse par les contrôles applicables.

Indicateurs : dossiers créés/incomplets, doublons, liens validés, invitations en attente, accréditations en attente/actives, photos manquantes, imports, remises refusées — dans le périmètre école/rôle.

## 16. Scénarios d'acceptation obligatoires (A01–A36)

A01 un enfant trois responsables : un seul student_id visible chez les trois. A02 principal sans compte. A03 adulte lié à deux enfants. A04 deux principaux refusés. A05 famille à un seul responsable. A06 réinscription annuelle. A07 secondaire appelle l'API accrédité : refus serveur. A08 trois responsables + trois accrédités. A09 quatrième accréditation refusée. A10 concurrence : une seule réussit. A11 accrédité sans compte. A12 doublon de fonction refusé. A13 photo manquante : pas de remise. A14 QR valide personne non autorisée. A15 accréditation expirée/suspendue. A16 retrait pendant l'écran du gardien. A17 accrédité tente de déléguer. A18 transfert du principal. A19 lien suspendu. A20 parent sans lien. A21 autre école. A22 retour espace adulte. A23 états de lecture indépendants. A24 changement d'enfant pendant réponse JASPE. A25 double clic inscription. A26 frère/sœur. A27 import avec adultes partagés. A28 téléphone partagé/homonymes. A29 réimport identique. A30 ligne erronée. A31 photo absente. A32 cellule vide. A33 échec transactionnel. A34 compte d'accrédité demandé. A35 tests avec rôle applicatif réel. A36 perte de connexion lors d'une remise.

## 17. Ordre de réalisation

Lot 0 audit et correspondance ; Lot 1 contrats et frontend ; Lot 2 données et accès ; Lot 3 inscription et comptes ; Lot 4 récupération ; Lot 5 import collectif ; Lot 6 supervision enfant et intégrations. Frontend validé avant raccordement backend. Ne pas reconstruire ce qui est déjà correct ; adaptations minimales ; pas de changement d'infrastructure/authentification/séparation Control.

## 18. Instruction prête à transmettre

Traiter V01–V18 comme décisions validées ; rapprocher les noms techniques du dépôt existant ; commencer par un audit ciblé ; produire mapping, écarts et plan d'adaptation ; ne jamais fusionner des personnes sur un nom/téléphone/courriel seul ; ne pas créer de comptes enfants autonomes ni de comptes d'accrédités ; vérifier les droits côté serveur ; tester isolation, restrictions, concurrence, transferts, quota, sous-profils et reprise d'import ; conserver l'historique et un compte rendu exploitable.

## Annexe A. Cas d'import fictif de référence

Junior (E001) et Grace (E002) ; Sarah (P001) principale de Junior et secondaire de Grace ; Patrick (P002) secondaire de Junior et principal de Grace ; David (P003) tuteur secondaire de Junior. Accrédités externes de Junior : Jeanne (P004), Ruth (P005), Alain (P006), inviter_compte=NON, principal_ref=P001, photos référencées, autorisations en attente. L'onglet EXEMPLE n'est pas lu par l'importeur.

## Annexe B. Sources et traçabilité

Source métier : décisions de Loms validées le 17 septembre 2026. Contexte : historique du projet (school_id, ACCESS_LAW, stockage privé R2, ordre frontend/backend, activation différée de l'espace enfant, conservation cumulative des consignes).