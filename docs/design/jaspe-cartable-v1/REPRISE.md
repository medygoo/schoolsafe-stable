# Reprise — JASPE sans bureau permanent et logo de l’école

Demande validée le 16 septembre 2026. Le propriétaire demande une transmission
car son quota est presque épuisé. **Aucun code applicatif ni SQL modifié dans
ce lot préparatoire. Le navigateur montre encore l’ancienne présentation.**

## Résultat demandé

- JASPE existante v12, visage/coiffure/uniforme conservés, plus petite et latérale.
- **Dernière précision : cadrer jusqu’aux hanches, avec les bras et les mains
  visibles pour expliquer.** Ne pas cadrer aux cuisses ni couper les gestes.
  La sortie flottante reste en pied ; ce cadrage concerne le bandeau.
- Logo réel de l’école visible à côté, alimenté par le logo enregistré lors de
  sa création. Conserver aussi l’identité SchoolSafe. Sans logo : nom de l’école.
- Bureau occasionnel seulement : lire/penser/expliquer, puis revenir debout avec
  cartable. Réutiliser les gestes de mains, sourire et parole existants ; ajouter
  les poses cohérentes sans bureau nécessaires. Ne pas empiler des moteurs.
- Saisie sous le bandeau, réponse courante sans archive, voix, sortie en pied,
  autorisations et révocations conservées. Réduction de mouvement respectée.
- La première image générée a un faux damier et des cellules mal alignées :
  **rejetée**, ne pas l’intégrer. Les prompts sont dans `prompts.json`.
- **Dernière correction utilisateur :** le visage lui paraît déformé. La maquette
  renvoyée précise le **placement**, elle n’autorise pas à changer notre JASPE.
  `cartable-clair-non-valide.png` est la seconde tentative, conservée uniquement
  pour la reprise, **non validée, non intégrée**. Ne pas la promouvoir telle quelle.
  La référence de disposition est copiée dans `reference-placement-mobile.png`.

## Vérification du lot de transmission

- Aucun fichier sous `app/`, `server/` ou `database/` changé ; pas de nouvelle
  migration ni test fonctionnel exécuté pendant cette préparation.
- `git diff --check` PASS ; JSON des deux prompts valide ; référence de placement
  copiée à l’identique (comparaison binaire) ; identité v12 bien présente.
- Candidat clair : PNG RGB opaque 1536×1024, 1 611 130 octets,
  SHA256 `01041c591950fd71be1a1ae85aff6e0df18db65ffc04a8d79a4edd5aa74e5886`.
- Référence mobile : PNG RGB 941×1672, 1 531 467 octets,
  SHA256 `20ff28062e53905df260ced70cc490adf5b54853480c7bec1bef3d282327620c`.
- Aucun fichier de ces candidats n’est référencé par le code applicatif. Leur
  présence dans Git sauvegarde le travail sans valider leur utilisation.

## Points d’entrée vérifiés dans le dépôt

1. `app/modules/jaspe2d/seated-companion.js` : moteur actuel, deux calques,
   sprites 2×2, images par thème, `mount(host, options)`, actions fiables et durée.
   `paint` affiche toujours un bandeau de bureau en bas ; il faudra le masquer
   pour les scènes cartable. `step` déclenche actuellement la lecture après
   trois cycles idle puis revient à idle. L’arrêt hors écran, onglet caché,
   désactivation et `prefers-reduced-motion` existent déjà. Un asset absent
   est mémorisé comme échec pour éviter les boucles réseau.
2. `app/modules/jaspe2d/dashboard-companion.js` : init monte ce moteur sans
   options sur `jaspeSeatedCharacter`. `intent` traduit les états texte/audio ;
   les explications peuvent demander `standExplain`. Le compagnon flottant
   réutilise `SchoolSafeJaspe2d.mountShowcase` et reste distinct du bandeau.
   Ne pas casser l’écoute, l’arrêt audio, l’autorisation ni le nettoyage de session.
3. `app/index.html` autour de `jaspeDashboardWelcome` : bouton personnage,
   `jaspe-hero__speech`, aside `jaspe-hero__about`, puis `jaspe-hero__chat`.
   Réserver une zone logo stable hors du bouton personnage. Garder les ID et
   attributs `data-jaspe-chat-*` utilisés par la conversation existante.
4. `app/styles/modules/jaspe-seated.css` surcharge `jaspe-dashboard.css` : sous
   768px, le personnage occupe aujourd’hui toute une ligne. C’est cette grille
   qu’il faut harmoniser (petit personnage / logo côte à côte, chat dessous).
5. `app/app.js`, `schoolLogoUrl` et `renderSchoolBranding` : rendu déjà protégé
   par révision/annulation, logo de la session courante uniquement, gestion des
   images data PNG/JPEG/WebP et fetch distant en blob. Les images sont repérées
   par `[data-school-logo]`. **Étendre les deux `closest`** actuellement limités
   à `.workspace-brand, .mobile-brand` pour le nouveau conteneur, sinon null.
   Ajouter le nom via `textContent`, effacer logo/nom à la déconnexion ou au
   changement d’école ; vérifier image invalide et réponse réseau tardive.
6. Le setup enregistre déjà `brand.logo_path` (`app/app.js`, `server/src/setup`,
   `database/setup/v1/01_setup_native.sql`) dans `app.schools.logo_path`.
   Le bootstrap natif **omet** ce champ : la définition courante est
   `database/projections/v1/05_session_validity.sql`, type dans
   `server/src/sessionnative/service.ts`. Prévoir une migration **additive 06**
   gardant strictement l’autorisation et tous les filtres A5.0, ajoutant le logo
   uniquement à l’objet école du contexte courant. Ne pas modifier 02/05 déjà
   versionnées. Mettre à jour générateur et manifestes de projections, compte
   de `scripts/check-migration-versions.test.mjs` et rejeu du runner SQL.

## Assets et méthode

- Identité source : `app/assets/jaspe2d/v12/grand-sourire.png`.
- Planches bureau existantes : `app/assets/jaspe2d/assise-v1/`, 14 PNG, 56 poses,
  grille 1536×1024 / cellules 768×512, **fonds opaques clair et sombre**.
  Actions : sourire, parole, parole-deux-mains, réflexion, lecture, se-lever,
  debout-parole. Garder leurs originaux.
- Utiliser le skill imagegen et l’outil intégré, consulter les références avant
  génération. Vérifier alpha réel (pas de damier peint), taille, alignement des
  cellules, visage, mains et coupe. En cas d’opacité, générer les deux fonds
  #eaf4fc et #19334f ; ne pas promettre une transparence inexistante.
- Les images de maquette fournies par l’utilisateur servent à la disposition,
  **pas à remplacer le visage v12 par celui de la maquette**.
- Conserver prompts/manifeste/hachages des assets retenus. Les candidats de ce
  dossier ne sont pas référencés par l’application et restent à contrôler.

## Prochaine action exacte

1. Reprendre le dépôt selon AGENTS, puis lire/inspecter les candidats sauvegardés.
   Résoudre d’abord la fidélité du visage à notre JASPE originale. Ne pas repartir
   d’une tentative rejetée comme référence d’identité. Corriger les planches
   nécessaires et produire leur variante sombre cohérente.
2. Étendre le moteur existant avec scène latérale par défaut pour le bandeau,
   épisodes de bureau limités, retour garanti sans bureau. Préserver le mode
   historique de la page de prévisualisation. En voix, ne pas faire apparaître
   du bureau au milieu d’un mot ni boucler les transitions de posture.
3. Adapter la grille mobile/bureau, connecter le logo et sa projection native.
4. Exécuter les preuves ci-dessous ; actualiser handoff, commit, push, comparer
   HEAD au distant réel. Ensuite reprendre A5.1 du plan fonctionnel.

## Preuves à exécuter, non effectuées sur ce nouveau comportement

- Navigateur 320/390px et bureau, clair/sombre : taille, aucune coupe gênante ni
  débordement, logo visible/stable, chat utilisable, apparition/disparition bureau.
- Réduction de mouvement, sortie/retour flottant, asset manquant, interruption
  d’un geste par texte/audio, onglet caché et révocation JASPE.
- Réutiliser `app/qa-jaspe-dashboard.cjs`, `qa-jaspe-standing.cjs`,
  `qa-jaspe-seated.cjs`, `qa-jaspe-voice.cjs`, `qa-safe-assistant-access.cjs`.
  Ajouter les assertions nécessaires aux scènes et au logo, pas de tests miroirs.
- Logo : session native école A/B, aucune fuite après changement/déconnexion,
  sans logo, mauvais URL/type, image illisible et chargement tardif.
- PostgreSQL réel pour migration/rejeu/isolation : valeur stockée au setup
  présente dans bootstrap, contexte invalide refusé, autre école exclue ;
  conservation des tables/droits existants. Repasser A5.0 temporalité après 06.
- PWA : incrémenter `app/sw.js` et contrat QA correspondant lors de l’intégration.

## Environnement à conserver

- Branche `main`, dernier lot applicatif avant cette préparation :
  `9d8654246e4622cf4485de551effa93c5a0fa03a` (A5.0). Aucun serveur/VPS modifié.
- Prévisualisation locale correcte : `http://127.0.0.1:4176/`.
- PostgreSQL synthétique portable 17.11 **arrêté**, `%TEMP%/schoolsafe-access-a2-pg`,
  binaires `pgsql/bin`, données `data`, port 55432. Ne pas effacer les bases `_5`,
  `_7`, `_8`, `_9`. Le runner `scripts/test-access-postgres.mjs` exige une base
  dédiée vide ; `_10` est le prochain nom proposé, à vérifier avant création.
- Aucun service Windows, Docker ou nouvelle 3D. Aucune clé/identité sensible ici.
- `.claude/` et les deux PNG de maquette à la racine appartiennent à l’utilisateur,
  restent non suivis ; ne pas ajouter, supprimer ni écraser.
- Git final : push de lots validés autorisé ; vérifier HEAD = `git ls-remote
  origin refs/heads/main`. Un échec réseau ne constitue pas une synchronisation.
