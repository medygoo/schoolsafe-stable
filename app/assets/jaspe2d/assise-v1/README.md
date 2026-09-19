# JASPE au bureau — séquences 2D v1

14 planches générées avec `image_gen.imagegen`, 4 images chacune :

| Action | Fichiers (clair / sombre) | Mouvement |
|---|---|---|
| Parole, une main | `parole-clair.png`, `parole-sombre.png` | Lèvres et main gauche qui accompagne la réponse |
| Parole, deux mains | `parole-deux-mains-*.png` | Les deux mains s'ouvrent, accompagnent l'explication puis reviennent au centre |
| Réflexion | `reflexion-*.png` | Main de la joue à la tempe et aux cheveux |
| Sourire | `sourire-*.png` | Sourire progressif et clignement |
| Lecture | `lecture-*.png` | Regard au livre, page tournée, sourire pendant la lecture |
| Se lever / se rasseoir | `se-lever-*.png` | Appui des mains, montée derrière le bureau ; ordre inversé pour se rasseoir |
| Expliquer debout | `debout-parole-*.png` | Parole avec les deux mains, le bas du corps reste masqué par le bureau |

Chaque PNG mesure 1536×1024, grille 2×2 sans gouttière, images 768×512.
Ordre : haut gauche, haut droite, bas gauche, bas droite. Images opaques avec
fond intégré ; aucune alpha ni séparation personnage/bureau annoncée.
Les originaux v12 restent intacts. Les prompts et les hashes sont dans
`prompts.json`, `prompts-deux-mains.json`, `prompts-debout.json` et `manifest.json`. Les premières versions de lecture sont
remplacées par les éditions souriantes à la demande du propriétaire ; l'historique
de génération est conservé dans les prompts.

Le lecteur `app/modules/jaspe2d/seated-companion.js` affiche ces cadres par CSS,
sans modifier les PNG. Les séquences ont des durées par image, une transition
de 65 ms (120 ms pendant la montée et la descente) et une façade avant du bureau fixe. Les ressources sont chargées au
besoin ; une erreur de chargement conserve la pose précédente sans boucle réseau.
Les animations s'arrêtent hors écran, en onglet caché, à la perte de permission,
pendant la sortie entière et en mode mouvements réduits.

Le lecteur de poses n'a aucun accès métier. `dashboard-companion.js` traduit
les états autorisés de SafeAssistant en actions fermées. Les événements de
synthèse vocale commandent la séquence de parole, sans synchronisation phonétique.
Les explications `TalkHandsOpen` et `TalkPassionately` déclenchent la montée,
puis la parole debout ; la fin ou l'arrêt de la voix déclenche le retour assis.
Les salutations restent assises. Le passage à une autre action attend la descente ;
une perte d'accès ou la sortie entière arrête immédiatement le lecteur.
La montée et la parole debout sont préchargées ensemble ; si elles échouent,
la parole assise à deux mains prend le relais. En mouvements réduits, une pose
debout fixe remplace la séquence. La version flottante entière n'est pas modifiée.
La lecture décorative apparaît occasionnellement au repos ; elle ne signifie pas
que JASPE accède à un livre ou à des données de l'utilisateur.

Aperçu interactif local : `/jaspe-assise-preview.html` sur le serveur de `app/`.
Accès direct à la nouvelle séquence : `/jaspe-assise-preview.html#debout`.
Contrôles : `node app/qa-jaspe-seated.cjs`, `node app/qa-jaspe-standing.cjs`,
`node app/qa-jaspe-dashboard.cjs` et `node app/qa-jaspe-voice.cjs`.
Les tests de voix utilisent un adaptateur simulé, pas le microphone réel.
