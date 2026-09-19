# Système visuel responsive SchoolSafe — Spécification approuvée

Date : 13 septembre 2026
Statut : approuvée par le propriétaire le 13 septembre 2026

## 1. Décision

Les maquettes SchoolSafe mobile et bureau fournies par le propriétaire deviennent la direction visuelle officielle de l'application. Elles sont une référence de composition et d'identité, pas une consigne de reproduction pixel par pixel.

La mise en œuvre conserve l'architecture HTML, CSS et JavaScript existante. Elle n'introduit ni React, ni Ant Design, ni 3D. Le fichier `app/schoolsafe-logo.png` reste la source de vérité du logo ; le logo en relief fourni sert uniquement de référence de marque et ne doit pas être reconstruit en 3D.

## 2. Résultat recherché

SchoolSafe doit présenter une seule identité cohérente sur téléphone, tablette et ordinateur : claire, rassurante, colorée avec maîtrise et immédiatement compréhensible par une école ou un parent.

La connexion, l'OTP, la navigation et le tableau de bord doivent partager les mêmes composants, tokens et états. Le responsive change la composition, pas les règles métier ni le vocabulaire visuel.

## 3. Principes verrouillés

- Fond clair bleu très pâle, surfaces blanches et texte bleu nuit.
- Bleu/cyan pour l'action principale ; or SchoolSafe comme accent de marque, jamais comme couleur de texte long.
- Couleurs fonctionnelles limitées aux icônes, états et cartes de modules.
- Ombres légères, bordures visibles et relief discret.
- Dégradé réservé au bouton principal, à l'élément de navigation actif ou à un accent de marque ; les grandes surfaces et les cartes restent sobres.
- Effets de verre, flous et lueurs réduits : aucun `backdrop-filter` généralisé sur toutes les cartes.
- Coins cohérents : 12 px pour les contrôles, 16 px pour les petites cartes, 20 px pour les grandes cartes et forme pilule seulement pour les actions prévues.
- Poppins peut rester la police de marque lorsque disponible, avec une pile système immédiate en repli et sans blocage du rendu.
- Une seule hiérarchie de titres, textes, métadonnées et chiffres clés sur toutes les surfaces.

## 4. Architecture à préserver

- `app/index.html` conserve les identifiants et les zones fonctionnelles utilisés par `app/app.js`.
- `app/styles/design-tokens.css` reste la source unique des tokens durables.
- `app/styles/design-system.css` devient une couche d'application mesurée des tokens, sans règles globales destructrices ni multiplication de `!important`.
- `app/styles/components.css` conserve les composants partagés.
- `app/styles/screens/auth.css` porte la composition connexion/OTP.
- `app/styles/dashboard.css` porte la composition du shell et des tableaux de bord.
- Les modules métier continuent d'utiliser leurs feuilles propres et les couleurs de domaine existantes.
- Aucune route, permission, isolation d'école, donnée, sélecteur critique ou action métier ne change dans ce lot visuel.
- SchoolSafe Control reste inchangé.
- JASPE reste 2D/2,5D, non bloquante et séparée des décisions métier.

## 5. Marque et logo

- Utiliser uniquement `app/schoolsafe-logo.png` dans l'interface courante.
- Conserver les proportions du logo, sans étirement, recoloration automatique ni ombre 3D.
- Taille minimale recommandée : 120 px de large pour le mot-symbole complet et 32 px pour l'écusson seul lorsque l'espace est contraint.
- Préserver autour du logo un espace libre au moins égal à la hauteur du « S » du mot-symbole.
- Sur fond très clair, utiliser la version existante telle quelle ; ne pas ajouter de plaque sombre derrière le logo.

## 6. Fondations et composants

### Tokens

Les tokens doivent couvrir : palette de marque, couleurs sémantiques, surfaces, bordures, typographie, espacement, rayons, ombres, focus, durées et largeurs de mise en page. Les anciens alias `--ds-*` doivent être migrés vers les tokens `--ss-*` ou conservés temporairement comme alias documentés, sans créer une troisième famille de variables.

### Contrôles

- Champ : hauteur minimale 48 px, libellé persistant, aide/erreur distincte et focus visible.
- Bouton principal : hauteur minimale 48 px, contraste AA, flèche seulement si elle apporte une indication de progression.
- Bouton secondaire : surface blanche, bordure visible, sans lueur.
- Zone interactive tactile : minimum 44 × 44 px.
- Carte : surface opaque ou quasi opaque, bordure claire et ombre discrète.
- Badge : couleur + texte ou icône ; la couleur seule ne transmet jamais l'état.
- OTP : quatre cellules lisibles mais un seul flux de saisie logique, avec libellé, erreur, délai et renvoi accessibles.

## 7. Écran de connexion et OTP

La connexion reprend la clarté de la référence mobile : marque en tête, message court, formulaire central, action principale évidente et accès secondaire au rôle parent seulement si la logique actuelle l'autorise.

JASPE peut accompagner la connexion sur le côté en bureau et dans un espace réservé en mobile. Elle ne doit jamais masquer un champ, déplacer le bouton pendant la saisie ni réduire la largeur utile du formulaire sous 320 px.

L'étape OTP réutilise le même panneau et les mêmes dimensions. Le changement d'étape ne doit ni reconstruire la page complète ni modifier les événements métier actuels.

## 8. Shell et tableau de bord

### Ordinateur — 1024 px et plus

- Barre latérale fixe ou collante : logo, navigation par rôle, aide et déconnexion.
- Barre supérieure : salutation, recherche lorsque disponible, notifications et profil.
- Zone centrale : accueil, indicateurs, modules et activité.
- Rail droit seulement lorsqu'il contient des informations réellement disponibles, par exemple OTP, événements ou rappel mobile ; sinon la zone centrale s'élargit.
- Les cartes de modules emploient une couleur dominante par fonction, sans fond fluorescent ni arc-en-ciel décoratif.

### Tablette — 769 à 1023 px

- Barre latérale compacte ou panneau repliable.
- Deux colonnes au maximum pour les cartes principales.
- Aucun rail droit permanent ; son contenu rejoint le flux principal.

### Mobile — 768 px et moins

- En-tête compact avec marque, notification et profil/menu.
- Grille de modules sur deux colonnes, puis une colonne sous 360 px si nécessaire.
- Navigation inférieure limitée aux destinations les plus fréquentes ; le reste est dans le menu latéral.
- Le menu mobile s'ouvre comme un panneau accessible, ferme au clavier et restitue le focus.
- Les données essentielles précèdent les éléments promotionnels ou décoratifs.

## 9. JASPE et mouvement

- JASPE conserve son moteur physique 2D/2,5D existant ; aucun fichier, moteur ou effet 3D n'est ajouté.
- Sa présence est secondaire par rapport au formulaire, aux alertes et aux tâches scolaires.
- Les mouvements respectent `prefers-reduced-motion` et deviennent des poses stables lorsque nécessaire.
- Le raccordement de JASPE au tableau de bord, la voix, GLM et la synchronisation labiale restent des lots séparés.

## 10. Accessibilité et performance

- Contraste WCAG AA pour le texte et les contrôles essentiels.
- Focus clavier toujours visible, ordre de tabulation logique et fermeture des panneaux avec Échap.
- Textes fonctionnels à 14 px minimum ; corps principal à 16 px recommandé.
- Les icônes décoratives sont masquées aux technologies d'assistance ; les boutons icône ont un nom accessible.
- Aucun mouvement essentiel ne dépend d'une animation.
- Aucun nouveau framework, pack d'icônes lourd ou grande image décorative n'est requis.
- Éviter les flous permanents et les multiples ombres sur mobile ; garder les cartes opaques pour limiter le coût graphique.
- Le chargement de la police distante ne doit pas bloquer l'affichage utilisable.

## 11. Lots de livraison

1. Fondations : tokens, composants, suppression des excès de verre/lueur et contrat QA visuel.
2. Connexion et OTP responsive, sans modification de l'authentification.
3. Shell de navigation partagé, y compris menu et navigation mobile.
4. Tableau de bord mobile.
5. Tableau de bord bureau et tablette.
6. Vérification ciblée, documentation et miroir GitHub/local.

Chaque lot doit être utilisable, vérifié et committé avant le suivant. Les modules métier détaillés seront harmonisés progressivement après le shell ; ils ne doivent pas tous être refondus en une seule opération.

## 12. Vérifications ciblées

- Contrat statique : dépendances interdites absentes, feuilles chargées dans le bon ordre, sélecteurs critiques préservés et règles d'accessibilité présentes.
- Connexion : identifiant, mot de passe, OTP, erreurs et actions accessibles.
- Responsive : 390 × 844, 768 × 1024 et 1440 × 900.
- Navigation : clavier, panneau mobile, destination active et déconnexion.
- Tableau de bord : contenu réel, absence de débordement horizontal et hiérarchie lisible.
- Régressions critiques existantes : accès JASPE sûr et absence de l'ancien écran `guardian`.

## 13. Critères d'acceptation

Le système visuel est accepté lorsque :

- les écrans connexion, OTP et tableau de bord suivent la même identité ;
- mobile, tablette et bureau n'ont aucun débordement horizontal aux largeurs de référence ;
- les sélecteurs et comportements métier existants fonctionnent encore ;
- les contrastes, focus et tailles tactiles essentiels respectent les règles ci-dessus ;
- les lueurs, flous et ombres restent discrets ;
- le logo existant est utilisé sans reconstruction 3D ;
- aucune dépendance React, Ant Design ou 3D n'est introduite ;
- les contrôles ciblés passent et les limites non vérifiées sont notées honnêtement ;
- le dépôt local et `origin/main` sont identiques après validation finale.

## 14. Hors périmètre

- Migration React ou Ant Design.
- Création d'un nouveau logo ou d'un modèle 3D.
- Voix, GLM, synchronisation labiale et Worker Cloudflare.
- Déploiement VPS ou Docker.
- Modification de SchoolSafe Control, du backend, des permissions ou du modèle de données.
- Refonte simultanée de toutes les pages métier.
