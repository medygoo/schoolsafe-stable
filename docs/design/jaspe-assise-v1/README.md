# JASPE assise — référence d'accueil v1

Créée le 16 septembre 2026 avec l'outil intégré `image_gen.imagegen`.

**Référence initiale conservée.** La demande suivante du propriétaire a conduit
aux planches animées `app/assets/jaspe2d/assise-v1/`, désormais raccordées au
tableau de bord. Aperçu : `app/jaspe-assise-preview.html`. Les mentions de statut
ci-dessous décrivent uniquement cette étape statique initiale.

## Intention validée

Remplacer à terme le personnage debout recadré dans le bandeau par une pose
réellement assise derrière un bureau, inspirée de la maquette bureau. Conserver
l'identité JASPE v12 et le personnage entier pour la sortie flottante. Le présent
lot produit la première pose de référence avant les déclinaisons de gestes.

## Livrables

- `jaspe-assise-accueil-clair-v1.png` : PNG 1536 × 1024, fond bleu pâle intégré.
- `jaspe-assise-accueil-sombre-v1.png` : PNG 1536 × 1024, fond bleu nuit intégré.
- `index.html` : comparaison responsive, utilisable directement en local.
- `prompts.json` : prompts exacts et résultats des quatre appels de génération.

Référence d'identité : `app/assets/jaspe2d/v12/preparer-salut.png`.
Référence de posture uniquement :
`docs/design/references/schoolsafe-desktop-2026-09-13.png`.
L'image claire découle de la première génération ; la sombre est une édition
de la claire. Les originaux de sortie sont conservés par l'outil intégré.

## Limites explicites

- Ce sont des **candidats visuels statiques**, pas des sprites animés livrés.
  La ressemblance a été inspectée ; la validation esthétique appartient au propriétaire.
- Les deux essais de transparence ont donné des PNG RGB avec damier dessiné,
  sans alpha. Ils ont été écartés des livrables. Aucune transparence réelle annoncée.
- Les fichiers retenus contiennent le personnage, le bureau et le fond dans une
  seule image. La séparation des éléments reste à produire avant l'animation.
- Le générateur peut introduire de petites différences entre les deux variantes.
  Il ne s'agit pas encore de frames interchangeables pour une animation.
- Aucun remplacement des assets v12, aucune intégration dans `app/index.html`,
  aucun changement du chat, des permissions ou du personnage flottant.

## Suite

Vérifier la pose et la ressemblance avec le propriétaire. Puis produire les
calques propres et les poses parler, lire et réfléchir, avec caméra, échelle de
tête et position du bureau constantes. Intégrer ensuite au bandeau existant en
préservant la sortie entière, la réponse courante sans historique et le mode
mouvements réduits. Ne pas animer rigidement tout le bureau avec le personnage.
