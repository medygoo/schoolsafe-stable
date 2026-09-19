# Décisions validées SchoolSafe

Ce journal conserve les décisions durables. Il ne doit contenir ni secrets ni transcriptions brutes de conversations.

| Date | Décision | Statut |
|---|---|---|
| 2026-09-12 | Supprimer définitivement les traces et dépendances 3D du projet, tout en conservant JASPE 2,5D. | Validée et appliquée au commit `43982cb` |
| 2026-09-12 | Conserver SchoolSafe Control comme couche centrale protégée pour gérer les écoles inscrites, les licences, la supervision et l'impression. | Validée |
| 2026-09-12 | Travailler localement et sur GitHub en miroir, puis intervenir sur le VPS seulement lorsque les lots GitHub sont terminés. | Validée |
| 2026-09-12 | Ne pas utiliser Docker pour la cible finale ; prévoir un déploiement direct sur VPS. | **OBSOLÈTE — remplacée le 2026-09-14** par Docker + Coolify (voir décision du 14/09 ci-dessous). Conservée pour l'historique : elle reflétait l'architecture « 1 école = 1 VPS » alors en vigueur. |
| 2026-09-12 | Limiter les tests, tout en maintenant des tests obligatoires pour les points critiques : sécurité, permissions, argent, enfants, isolation entre écoles et migrations. | Validée |
| 2026-09-13 | Améliorer JASPE en consolidant le moteur 2,5D existant plutôt qu'en reconstruisant le personnage. | Validée |
| 2026-09-13 | Le moteur physique JASPE doit couvrir le visage et le corps ; la voix et la synchronisation labiale sont reportées au raccordement Cloudflare. | Validée |
| 2026-09-13 | GitHub et les documents versionnés du dépôt deviennent la mémoire commune entre les deux comptes ChatGPT. | Validée |
| 2026-09-13 | Retenir l'approche 1 pour le physique JASPE : contrôleur unique progressif, v12 principal et WebP de secours. | Validée |
| 2026-09-13 | Supprimer définitivement l'ancien écran visuel `guardian`, ouvrir directement la connexion depuis le splash et conserver les références métier `school.guardian` des tuteurs d'élèves. | Validée |
| 2026-09-13 | Adopter les références SchoolSafe mobile et bureau comme direction visuelle officielle, corrigée pour la lisibilité, l'accessibilité et la performance ; conserver HTML/CSS/JavaScript, le logo existant et JASPE 2,5D, sans React, Ant Design ni 3D. | Validée |
| 2026-09-13 | Retenir quatre expériences adultes visibles — Direction, Enseignant, Gardien et Parent — et conserver les métiers internes comme postes combinables plutôt que comme profils applicatifs séparés. | Validée |
| 2026-09-13 | Autoriser l'administrateur principal d'une école à créer librement des postes et à composer leurs permissions, portées et limites dans l'enveloppe souveraine imposée par SchoolSafe Control et l'Access Law. | Validée |
| 2026-09-13 | Construire menus, tableaux de bord, services d'écosystème et capacités JASPE depuis un même contrat de session calculé par l'Access Law. | Validée |
| 2026-09-13 | JASPE peut exécuter les actions ordinaires autorisées ; les notes, paiements, permissions, suppressions, opérations sensibles de sécurité et données protégées d'enfant exigent une confirmation humaine. | Validée |
| 2026-09-13 | Afficher aux utilisateurs uniquement les services d'écosystème activés et autorisés ; montrer à la Direction les services activables et réserver le catalogue complet à SchoolSafe Control. | Validée |
| 2026-09-14 | Adopter **Docker + Coolify** comme architecture d'exploitation du VPS central. Docker organise les services techniques (Web, API, Control, PostgreSQL, workers) ; **il n'existe pas de conteneur par école** — l'isolation multi-écoles repose sur `school_id` + PostgreSQL + ACCESS_LAW. La formulation « sans Docker » du 12/09 est obsolète (voir statut historique ci-dessus). | Validée |
| 2026-09-14 | **Déploiement final = Git → Coolify → Docker → VPS.** Règles : jamais de copie manuelle sur le VPS ; tout part du dépôt Git ; image reproductible ; staging et production séparés ; secrets dans Coolify/environnement (jamais dans Git) ; `/health` exposé pour les healthchecks ; volumes persistants pour PostgreSQL et les données ; sauvegarde avant migration ; tag/SHA précis par release pour le retour en arrière ; gros fichiers des écoles dans R2 par `school_id`. Source opérationnelle : `ops/deployment/README.md`. | Validée |
| 2026-09-14 | **Un VPS central héberge SchoolSafe Control et SchoolSafe pour plusieurs écoles**, systèmes logiquement séparés. « 1 école = 1 VPS » est incorrect. Formulation officielle : **1 plateforme SchoolSafe = plusieurs écoles isolées, chacune avec un `school_id` unique et stable**. La séparation Control/SchoolSafe porte sur les privilèges (credentials, rôles, droits, migrations distincts ; impossibilité pour SchoolSafe de modifier les données souveraines de Control) ; elle ne dépend pas d'un nom physique de base. | Validée |
| 2026-09-14 | Deux identifiants d'école : **`school_id` UUID** = identité technique canonique immuable (FK, RLS, ACCESS_LAW, API, licences signées) ; **`school_code`** type `SCH-000001` = identifiant public lisible (Control, écrans, contrats, support, documents). Ne jamais remplacer les UUID existants par des codes publics. | Validée |
| 2026-09-14 | L'**identité d'authentification est globale à la plateforme** ; l'accès aux écoles se fait par memberships/rattachements. Un seul membership actif → contexte résolu automatiquement ; plusieurs memberships → sélection d'un contexte tenant-aware par l'application. **Le navigateur n'impose jamais de `school_id`** : le serveur résout et valide le tenant actif à partir de l'identité authentifiée + memberships valides + contexte de session + ACCESS_LAW. Téléphone normalisé unique quand il sert d'identifiant de connexion. Une fiche contact n'est pas automatiquement une identité de connexion. | Validée |
| 2026-09-14 | L'**OTP ne doit pas bloquer le cœur** : abstraction `OTP_PROVIDER` à créer plus tard (Africell ou autre SMS), aucun fournisseur verrouillé, aucun fournisseur codé en dur. | Validée |
| 2026-09-14 | **PostgreSQL du VPS = base de production souveraine.** Supabase : inventorier → classifier → migrer → tester → retirer uniquement ce qui est devenu réellement inutile ; jamais de suppression massive. | Validée |
| 2026-09-14 | Construire d'abord un **Control minimal** (registre écoles, school_id/school_code, statut essai/actif/suspendu, services autorisés, émission/révocation de licence signée, audit minimum). Console SaaS complète, facturation automatisée et provisioning avancé attendent plusieurs écoles clientes. | Validée |
| 2026-09-14 | **VISION LARGE, LIVRAISON ÉTROITE** : aucune nouvelle grande fonctionnalité tant que le parcours quotidien de la première école (Le Sage) n'est pas stable, sécurisé, sauvegardable et restaurable. Les éléments non prioritaires sont classés en roadmap V2/V3, jamais supprimés de la vision. | Validée |
| 2026-09-14 | **Priorités validées** : P1 Phase A ACCESS_LAW · P2 toute fuite inter-écoles = bloquante · P3 enforcement backend de la licence · P4 cœur quotidien Le Sage **+ personnes autorisées + photo obligatoire à la sortie + validation humaine du gardien** · P5 sauvegarde/restauration testées avant la première école dépendante · P6 Control avancé, JASPE, Watch, **Guardian avancé** (délégations avancées, politiques), Lab, StaffID avancé. La gestion de base des personnes autorisées n'est PAS reportée ; le produit Guardian complet peut l'être. | Validée |
| 2026-09-14 | **Sauvegarde automatique + rétention définie + restauration documentée et réellement exécutée** (preuve/journal du test) avant la première école réelle. Une sauvegarde jamais restaurée n'est pas une garantie. | Validée |
| 2026-09-14 | Le **dépôt versionné constitue la source de vérité opérationnelle** : procédures, configurations non secrètes, scripts d'exploitation et runbooks y sont conservés (dossier `ops/`) ; aucun secret ne doit être commité. | Validée |
| 2026-09-14 | **License Contract V2** validé (spec G0) : CORE `id` non licenciable ; services `pass/watch/staffid/guardian/lab` + catalogue extensible par Control ; grâce globale ; quotas reportés ; héritage V1 = `["pass"]` (car `id` est fourni par le CORE) ; sunset déclenché par critères de readiness puis fenêtre de compatibilité, jamais par une date arbitraire. Implémentation d'enforcement après la Phase A. | Validée |
| 2026-09-14 | **Règle permanente de continuité** : toutes les instructions, ordres, décisions, plans et handoffs se conservent. Une nouvelle instruction s'ajoute à l'historique avec statut (`VALIDÉE`, `ACTIVE`, `REMPLACÉE`, `OBSOLÈTE`, `REPORTÉE`, `ABANDONNÉE`, `À VALIDER`), date et raison. Ne jamais supprimer l'historique ; ne jamais laisser deux règles contradictoires actives. Chaque lot laisse une trace complète (prévu/fait/modifié/tests/résultats/décisions/fichiers/SHA/reste à faire/risques) permettant la reprise immédiate par tout agent. | Validée |

## Décision produit du 16 septembre 2026 — JASPE au tableau de bord

- **VALIDÉE, instruction directe du propriétaire le 16/09** : reprendre les références
  bureau/mobile avec le personnage JASPE déjà conçu et son moteur v12 2D/2,5D.
  JASPE peut discuter par écrit ou audio sur place. Le cadrage en buste initial
  est **REMPLACÉ** par la décision de pose assise ci-dessous.
- **VALIDÉE** : un appui prolongé sur le bouton JASPE fait sortir le personnage
  en corps entier, animé et adapté à l'écran, avec une boîte de dialogue flottante
  aux couleurs pâles. L'application reste utilisable autour. Clic et clavier
  permettent également l'ouverture ; fermeture par bouton ou Échap.
- **REMPLACE l'historique de chat du lot du 15/09** : aucun journal de conversation
  accumulé ou persisté ; seule la réponse courante est affichée, partagée entre
  bandeau et boîte flottante, et effacée au changement de contexte utilisateur.
- Les réponses et les actions restent soumises à Access Law et au routeur existant.
  L'audio navigateur ne constitue pas un raccordement GLM/Cloudflare ni une
  synchronisation labiale ; ces capacités ne sont pas livrées par ce lot.

## Complément validé le 16 septembre — poses assises par action

- **VALIDÉE, demande directe du propriétaire** : dans le bandeau, JASPE est
  réellement assise derrière un bureau pour éviter la coupure du personnage
  debout. Conserver son identité v12, sa tenue et le corps entier flottant existant.
- **VALIDÉE** : créer des planches regroupées par action pour maintenir le cadrage
  et la cohérence des gestes : parole avec la main, réflexion/main aux cheveux,
  sourire/clignement, lecture. Ajouter un sourire pendant la lecture.
- Décliner chaque action en clair et sombre. Le lot initial utilise quatre images
  par planche, affichées en séquence 2D. Les fonds sont intégrés aux images :
  aucun détourage alpha ni calques séparés n'est annoncé comme livré.
- La lecture vocale pilote le début/la fin de la séquence de parole ; il ne s'agit
  pas d'une synchronisation phonétique. Permissions et réponse courante sans
  historique restent régies par le contrat du lot précédent.
- **VALIDÉE, complément du propriétaire le 16/09** : ajouter une séquence de
  parole avec les deux mains, en clair et sombre, en conservant celle à une main.
  Les explications (`TalkHandsOpen` / `TalkPassionately`) utilisent cette nouvelle
  séquence. Le propriétaire demande ensuite la clôture du chantier courant.

## Complément du 16 septembre — reprise du parcours vocal

- **VALIDÉE, reprise « GO » du propriétaire** : vérifier et corriger écouter,
  répondre, interrompre et reprendre, dans le bandeau et en corps entier. Ajouter
  un contrôle direct de lecture/arrêt de la réponse courante ; aucun historique.
- Le changement de compte/contexte doit couper la voix et le micro, même si le
  compte suivant a lui aussi accès à JASPE. Aucun démarrage automatique du micro.
- **CONCRÉTISÉE par le lot suivant, initialement à faire pendant ce lot** : JASPE peut se lever dans le
  bandeau, cadrée sur le haut du corps et adaptée au fond. Proposition présentée :
  bureau masquant le bas du corps, séquence assise/appui/debout/retour et déclinaisons
  clair/sombre. Aucune nouvelle image ni transition livrée par le lot vocal.

## Complément du 16 septembre — transition assise/debout

- **VALIDÉE ET APPLIQUÉE**, suite du plan autorisée par le propriétaire : dans le
  bandeau, JASPE se lève derrière son bureau pour expliquer avec les deux mains,
  puis se rassoit. Le bureau masque le bas du corps ; garder l'identité et la tenue.
- Deux familles de planches clair/sombre complètent les actions assises : montée
  en quatre étapes (lues à l'envers pour la descente) et parole debout en quatre
  poses. Le thème choisit les images. Le corps entier flottant reste distinct.
- Les explications `TalkHandsOpen` / `TalkPassionately` passent de la parole assise
  à la séquence debout dans le bandeau ; salutations, écoute et lecture restent
  assises. Cette règle complète et remplace le seul choix de pose des explications
  du lot « deux mains ». Les contraintes de permissions et de réponse sans
  historique ne changent pas.
- Fin/arrêt de voix ou nouvelle action : retour assis. Perte d'accès : arrêt
  immédiat. Mouvements réduits : pose fixe. Assets indisponibles : repli sur
  la parole assise. Pas de synchronisation phonétique ajoutée dans ce lot.

## Mission du 16 septembre — Device Hub, identité et présences

- **VALIDÉE, instruction directe du propriétaire** : préparer l'intégration
  native des terminaux autour de SchoolSafe comme source de vérité. Une identité
  de personne, plusieurs moyens d'identification et plusieurs appareils possibles.
- **VALIDÉE** : Device Hub indépendant des règles de présence, adaptateurs par
  marque, première cible Hikvision DS-K1T808MFWX ; ne pas inventer ses commandes
  ni supposer la lecture QR. QR téléphone indépendant du terminal.
- **VALIDÉE** : personnel et élèves créés dans SchoolSafe ; mappings techniques,
  isolation par école, credentials révocables, événements idempotents, corrections
  auditées, reprise après panne ; gabarits biométriques conservés sur équipement.
- **VALIDÉE** : biométrie élèves configurable, enfant lié aux droits parent/tuteur,
  remise physique soumise à la photo de la personne autorisée et au gardien.
  Watch reste hors de ce lot. Les UUID scolaires existants sont conservés ; les
  codes lisibles des exemples ne remplacent pas les clés techniques.
- **ACTIVE — ARRÊT AVANT CODAGE STRUCTUREL** : le §56 exige un audit/projet en
  24 points puis validation. Le dossier
  `docs/superpowers/specs/2026-09-16-schoolsafe-device-hub-audit-design.md`
  est livré comme **PROPOSITION À VALIDER**, pas comme architecture déjà acceptée.
- Ce cadrage reprend la priorité demandée par le propriétaire ; il ne déclare
  pas les parcours Le Sage/P5 terminés et ne retire aucune condition de sécurité
  ou de sauvegarde avant exploitation réelle.

## Priorité du 16 septembre — fonctionnalités et Rôles et accès

- **VALIDÉE, instruction directe du propriétaire** : traiter les 16 rubriques du
  menu avec leurs interfaces, backends et liens écosystème, en réutilisant l'existant.
- **VALIDÉE, priorité explicite** : commencer par **Rôles et accès**, corriger et
  rendre fonctionnel sans supprimer, puis progresser étape par étape. Maintenir
  le miroir local/GitHub après chaque lot vérifié.
- A1 livré : contexte natif corrigé et consultation des droits du compte connecté
  par le bootstrap serveur existant. L'ancien éditeur reste démonstratif ; aucune
  attribution persistante n'est annoncée. A2/A3 restent à réaliser dans
  `docs/superpowers/plans/2026-09-16-schoolsafe-functional-integration.md`.
- Cette priorité ne valide pas implicitement l'architecture Device Hub en attente.

## Continuité du 16 septembre — plan exécutable par tout agent

- **VALIDÉE, demande directe du propriétaire** : formaliser un plan de travail
  que tout agent peut suivre pour poursuivre les fonctionnalités, Rôles et accès
  en premier. Le document existant
  `docs/superpowers/plans/2026-09-16-schoolsafe-functional-integration.md`
  devient le plan actif détaillé, référencé dans `AGENTS.md` et le contexte.
- Le plan comporte des identifiants de tâches stables, prérequis, fichiers,
  résultats attendus, contrôles, états et format de passation. Le handoff conserve
  le responsable, la branche et la prochaine action concrète.
- **REMPLACÉE pour ce chantier fonctionnel** : l'ancienne répartition par nom
  d'assistant conservée dans l'historique. Tout agent peut reprendre un lot ;
  un seul rédacteur possède les fichiers du lot à un instant donné. Aucun travail
  concurrent implicite, aucun effacement de l'historique.
- Le niveau de preuve est explicite : tests avec substituts, parcours SQL/UI
  réel de test, puis production. La rédaction du plan ne valide ni les tâches
  futures, ni leurs choix produit encore ouverts, ni l'architecture Device Hub.

## Réalisation du 16 septembre — A2, annuaire des accès

- **APPLIQUÉE dans le mandat existant** : consultation de profils/rôles/attributions
  de l'école par trois projections `api.access_*` et routes natives protégées par
  `roles.manage`. Tables IAM et moteur Access Law réutilisés, sans doublon ni
  mutation d'accès depuis les brouillons de démonstration.
- Une consultation d'un tiers conserve l'acteur connecté ; les attributions
  stockées et leur validité ne sont pas présentées comme une simulation complète
  des permissions effectives. Frontend, serveur et PostgreSQL testés ensemble.
- Le rôle inactif ne participe plus aux ALLOW/DENY du moteur canonique. Les
  gardes d'installation sont alignées sur les 64 permissions déjà validées.
- Preuve de test uniquement, pas de déploiement ni nouvelle décision produit.
  Contrat : `docs/superpowers/specs/2026-09-16-access-directory-contract.md`.

## Loi générale validée le 16 septembre — JASPE et autorité du profil

- **VALIDÉE EXPLICITEMENT PAR LE PROPRIÉTAIRE** : JASPE agit au nom du profil
  connecté et ne possède jamais plus de droits que lui. Cette loi s'applique à
  toute l'application et à tout outil/connecteur, pas seulement à la pédagogie.
- L'administrateur humain attribue les permissions et limites. Le serveur commun
  contrôle chaque lecture/action de l'interface, des API et de JASPE : acteur,
  école, permission, ressource, portée, conditions et refus explicites. Aucun rôle
  implicite, prompt, voix, site ou connecteur ne remplace cette autorisation.
- Une révocation s'applique à la demande suivante, même dans une session ou un
  dialogue déjà ouvert. Les tâches différées doivent revérifier les droits à leur
  exécution ; elles ne conservent pas une délégation devenue invalide.
- JASPE peut exécuter les tâches autorisées dans cette enveloppe. Les confirmations
  humaines des opérations sensibles, déjà validées, restent obligatoires.
- Exemples non exhaustifs : un parent peut consulter les frais/devoirs accessibles
  à ses enfants, pas les salaires des enseignants, leurs brouillons ou cahiers
  internes ; un enseignant reste limité à ses attributions et ressources autorisées.
- Cette validation porte sur une loi à faire respecter et tester transversalement.
  Elle ne signifie pas que tous les outils JASPE ou modules sont déjà raccordés.
  L'accord Device Hub reste distinct : le propriétaire demande ici son résumé,
  sans valider encore son architecture structurelle.

## Règle de remise d'enfant précisée et validée le 16 septembre

- **VALIDÉE, confirmation explicite du propriétaire** : conserver le parcours QR
  scanné par le gardien. La fiche de l'enfant présente les trois personnes
  autorisées ; l'adulte présent est vérifié parmi celles-ci, avec comparaison
  physique à la photo enregistrée et confirmation humaine avant remise.
- **VALIDÉE pour le secours en l'absence du gardien** : c'est l'empreinte de
  **l'enfant** qui sert à l'identifier. Un **remplaçant habilité** contrôle l'adulte
  parmi les trois personnes autorisées et confirme la remise. Il utilise son
  propre profil autorisé et le périmètre du portail ; aucun compte gardien partagé.
- Le secours rejoint le même contrôle de remise que le QR. Il ne contourne ni
  l'autorisation active de l'adulte, ni la photo, ni la confirmation, ni l'audit.
  La reconnaissance de l'adulte par l'enfant peut aider la vérification mais
  n'accorde pas à elle seule une autorisation de sortie. Sans adulte autorisé
  vérifié et validateur habilité, aucune remise n'est validée par le système.
- Conserver la trace de l'enfant, de la personne récupérante, du validateur,
  de la méthode d'identification, du portail et de l'heure. L'empreinte reste sur
  l'appareil ; activation biométrique facultative et autorisations prévues maintenues.
- Décision produit à implémenter dans Guardian/Device Hub ; aucun raccordement
  matériel ou parcours natif de remise n'est déclaré livré par cette validation.

## Présentation JASPE et logo de l’école — validée le 16 septembre

- Le bureau devient occasionnel : scènes de lecture/explication, puis retour à
  JASPE debout avec son cartable. Conserver son visage, sa coiffure et son uniforme
  v12 ; animation 2D/2,5D, aucune nouvelle 3D.
- Sur téléphone, réduire sa place et réserver à côté un espace stable au logo
  de l’école courante, chargé depuis l’identité enregistrée à la création.
  Sans logo, afficher le nom de l’école ; ne pas inventer de logo partenaire.
- La saisie reste sous le bandeau, sans historique. Voix, sortie complète et
  permissions existantes sont conservées. Le logo reste fixe pendant les gestes.
- Précision ultérieure du propriétaire : les nouvelles images déforment le
  visage ; ne pas les intégrer. La maquette mobile réenvoyée montre le placement.
  Conserver l’identité de notre JASPE existante et corriger la fidélité des poses.
- Cadrage final précisé : **vue jusqu’aux hanches, bras et mains visibles pour
  expliquer**, placée sur le côté. Ce cadrage concerne le bandeau ; la sortie
  flottante complète reste disponible.

## Décisions restant à préciser — inchangées

### 19 septembre 2026 — préparation de dépôts séparés

- **VALIDÉE, instruction du propriétaire** : le manifeste arbitré devient la
  base de `medygoo/schoolsafe-stable`. Préparer une copie locale sans push ni
  déploiement ; préserver JASPE, cartes, ACCESS_LAW, auth, tests et historiques.
- **CONFIRMÉE** : Docker + Coolify remplace la règle VPS direct d'AGENTS ; garder
  cette règle antérieure comme historique. Ne pas modifier les fournisseurs IA.
- **VALIDÉE** : exclure les fichiers privés déjà classés et n'inclure les six
  portraits qu'avec usage légitime et approprié établi. Faute de preuve à ce stade,
  les laisser dans la source et les omettre de la copie ; aucune suppression locale.
- **VALIDÉE** : récupérer l'ancien Control depuis sa source existante vers
  `medygoo/schoolsafe-control-2` dans une mission distincte. Ne pas le reconstruire
  depuis SchoolSafe ; les adaptateurs/contrats restent dans SchoolSafe.
- Les défauts métier DeviceHub/famille/cartes sont conservés hors de ce mandat.
  L'inventaire d'installation peut signaler un blocage sans autoriser son
  contournement ni une réécriture historique.

### Historique des décisions encore ouvertes avant cette mission

- Technologie exacte de synthèse vocale Cloudflare lorsque le lot voix commencera.
- Procédure finale de service VPS, de proxy inverse et de sauvegarde avant le déploiement de production.
