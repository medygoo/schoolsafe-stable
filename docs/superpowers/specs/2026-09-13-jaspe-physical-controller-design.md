# Contrôleur physique JASPE 2,5D — Spécification d'architecture

Date : 13 septembre 2026
Statut : approuvée par le propriétaire le 13 septembre 2026
Décision : approche 1, contrôleur unique progressif

## 1. Capacité livrée

SchoolSafe dispose d'un seul contrat de présentation pour commander la présence physique de JASPE sur l'écran de connexion et préparer son emploi dans l'espace de travail. Les événements fiables de l'application deviennent des intentions visuelles fermées, arbitrées par priorité, puis rendues par le moteur v12. Si v12 est indisponible, le moteur WebP léger préserve une présence utilisable sans bloquer l'application.

## 2. Périmètre du premier lot

Le premier lot doit :

- créer un contrôleur de présentation indépendant des écrans ;
- accepter uniquement les intentions physiques documentées dans cette spécification ;
- traduire ces intentions vers les actions v12 déjà vérifiées ;
- arbitrer les intentions concurrentes avec une priorité déterministe ;
- conserver le moteur WebP comme repli ;
- rendre `live-companion.js` indépendant de `.auth-screen` ;
- fournir un cycle de vie explicite `mount`, `dispatch`, `stop`, `destroy`, `getState` ;
- raccorder l'écran de connexion au nouveau contrat sans modifier son fonctionnement métier ;
- conserver l'identité v12, le chargement progressif, les empreintes d'assets et l'accessibilité ;
- couvrir les contrats, priorités et destructions par quelques tests ciblés.

## 3. Hors périmètre

Ce lot ne doit pas :

- ajouter ou réintroduire de 3D ;
- générer une nouvelle identité graphique pour JASPE ;
- activer la voix, une synthèse vocale ou la synchronisation labiale ;
- connecter GLM ou modifier le Worker Cloudflare ;
- activer l'assistant flottant dans l'espace de travail ;
- modifier les permissions, la gouvernance JASPE ou les modules métier ;
- déployer sur le VPS ;
- supprimer les images originales ou les poses non utilisées ;
- autoriser un modèle IA à choisir librement un nom d'animation.

## 4. État actuel à préserver

- `jaspe2d.js` fournit les états simples et les images WebP de secours.
- `live-companion.js` monte le rendu animé v12 de la connexion.
- `v12/base-controller.js` fournit la machine de poses, les transitions, le regard, les paupières, la respiration et les intensités.
- Le manifeste v12 autorise une liste fermée d'actions et vérifie les fichiers par SHA-256.
- Le rendu est limité à 24 images par seconde et se suspend lorsque la surface n'est pas visible.
- `prefers-reduced-motion` doit continuer à désactiver les mouvements non essentiels.

## 5. Approches examinées

### Approche retenue : contrôleur unique progressif

Un contrôleur commun orchestre v12 et le repli WebP. Cette solution corrige la divergence sans supprimer un moteur qui protège les appareils modestes et le fonctionnement dégradé.

### Approche rejetée : remplacement total par v12

Elle réduirait temporairement le nombre de chemins, mais supprimerait le repli léger et augmenterait le risque mémoire, mobile et hors ligne.

### Approche rejetée : corrections indépendantes par écran

Elle serait plus petite à court terme, mais maintiendrait plusieurs vocabulaires d'animation et reproduirait les incohérences lors de chaque nouvel écran.

## 6. Architecture

Le flux unique est :

```text
événement SchoolSafe fiable
  -> intention JASPE validée
  -> arbitre de priorité
  -> adaptateur v12
  -> adaptateur WebP si v12 est indisponible
  -> état observable du contrôleur
```

### 6.1 Contrôleur de présentation

Un nouveau module `app/modules/jaspe2d/presentation-controller.js` possède l'état d'orchestration. Il ne dessine rien lui-même et ne connaît ni les permissions ni les domaines métier.

Interface publique :

```js
mount({ host, surface, isVisible })
dispatch({ kind, intensity, holdMs, source })
stop(reason)
destroy()
getState()
```

Contraintes :

- `host` est un élément DOM requis ;
- `surface` vaut uniquement `auth`, `workspace-bust` ou `workspace-avatar` ;
- `isVisible` est une fonction fournie par la surface, sans sélecteur d'écran codé dans le moteur ;
- `kind` appartient à la liste fermée du paragraphe 7 ;
- `intensity` est bornée entre 0 et 1, avec la valeur par défaut définie par l'intention ;
- `holdMs` doit être un nombre fini, borné entre 0 et 15 000 ms ;
- `source` sert au diagnostic local et ne donne aucune autorité supplémentaire ;
- les objets d'entrée sont copiés et normalisés avant utilisation ;
- une entrée invalide retourne `false` et ne modifie pas l'état courant.

### 6.2 Adaptateur v12

`live-companion.js` reste propriétaire du chargement, de la vérification et du dessin v12. Il reçoit désormais `isVisible` et ne recherche plus directement `.auth-screen`.

Son handle doit fournir :

```js
play(action, metadata)
stop()
destroy()
getState()
```

`destroy()` annule la frame d'animation, invalide les chargements en attente, détache tous les écouteurs ajoutés par l'instance, supprime le canvas et rend les appels ultérieurs inoffensifs.

### 6.3 Adaptateur WebP

Le rendu WebP existant reste le repli. Il reçoit les mêmes intentions, mais les réduit aux états et images disponibles. L'échec du manifeste, de WebGL, du canvas ou d'une pose v12 déclenche ce repli sans retirer le formulaire de connexion.

## 7. Contrat des intentions

| Intention | Action v12 vérifiée | Repli WebP | Intensité par défaut | Priorité |
|---|---|---|---:|---:|
| `idle` | `idle` | `IDLE` | 0.35 | 0 |
| `listen` | `attentive` | `LISTENING` | 0.55 | 20 |
| `think` | `deepThink` | `THINKING` | 0.65 | 30 |
| `speak` | `guide` | `SPEAKING` | 0.60 | 40 |
| `explain` | `guide` | `SPEAKING` | 0.75 | 40 |
| `reassure` | `attentive` | `IDLE` | 0.45 | 70 |
| `success` | `thumbsUp` | image `congratulate` | 0.80 | 70 |
| `refuse` | `worried` | `ERROR` | 0.65 | 100 |
| `error` | `worried` | `ERROR` | 0.75 | 100 |

Le premier lot emploie seulement les actions présentes dans le manifeste v12 actif. Les actions définies dans le code mais absentes du manifeste ne deviennent pas implicitement utilisables.

`speak` signifie seulement « accompagner visuellement un texte affiché ». Il ne produit aucun son et n'anime pas les lèvres.

## 8. Arbitrage et transitions

- Une intention de priorité supérieure interrompt l'intention courante par le chemin de retour sûr fourni par v12.
- Une intention de même priorité remplace la précédente uniquement si elle vient d'un événement plus récent.
- Une intention de priorité inférieure ne coupe pas l'intention courante ; elle peut être conservée comme prochaine intention si elle est toujours pertinente.
- `idle` n'est jamais mis en file d'attente et sert d'état final.
- `stop()` annule l'intention en attente et demande un retour sûr vers `idle`.
- `destroy()` annule tout sans lancer une nouvelle animation.
- Après `holdMs` ou la durée native de l'action, le contrôleur revient à `idle`, sauf si une intention prioritaire attend.
- Les animations automatiques d'attente restent subordonnées à toute intention explicite.

## 9. Surfaces

### Connexion

La connexion reste la seule surface activée par ce premier lot. Elle conserve les événements actuels : accueil, focus, vérification, erreur et réussite. Ces événements utilisent désormais `dispatch()` au lieu de références directes aux packs.

### Espace de travail

Le contrôleur accepte dès ce lot les noms de surfaces `workspace-bust` et `workspace-avatar`, mais l'assistant flottant n'est pas chargé ni activé. Le lot suivant raccordera cette surface sans réécrire le contrôleur.

Le cadrage corps entier, buste ou avatar appartient au conteneur et au CSS. Il ne crée pas plusieurs personnages ni plusieurs machines d'animation.

## 10. Gestion des erreurs

- Manifeste v12 indisponible : utiliser le WebP.
- Empreinte incorrecte : refuser l'asset et utiliser le WebP.
- WebGL ou canvas perdu : arrêter v12, marquer le moteur indisponible et utiliser le WebP.
- Action inconnue : retourner `false`, conserver l'état courant et ne charger aucun fichier.
- Erreur pendant une action : revenir au repli correspondant à l'intention courante.
- Surface cachée : geler le temps visible ; ne pas accumuler de durée à rattraper.
- Mode mouvements réduits : afficher une pose statique correspondant à l'intention, sans animation répétitive.

Les erreurs visuelles ne doivent jamais bloquer la saisie, la soumission du formulaire ou les événements métier.

## 11. Performance et accessibilité

- Conserver le chargement à la demande et la vérification des assets.
- Ne pas précharger les 42,8 Mo de v12.
- Conserver la cadence maximale de 24 images par seconde.
- Ne pas créer plusieurs boucles `requestAnimationFrame` pour un même montage.
- Ne pas conserver de canvas, écouteur ou timer après `destroy()`.
- Conserver un libellé accessible sur le conteneur ; le canvas décoratif reste masqué aux lecteurs d'écran.
- Respecter le statut de visibilité de la surface et `prefers-reduced-motion`.

La conversion générale des PNG v12 en formats optimisés appartient à un lot ultérieur. Ce premier lot ne modifie pas les originaux.

## 12. Sécurité et autorité

- Le contrôleur de présentation ne reçoit aucune permission et ne prend aucune décision métier.
- Seuls les événements déjà autorisés par SchoolSafe peuvent produire une intention.
- `source` est informatif et ne sert jamais de preuve d'autorisation.
- Un texte ou une réponse de modèle ne peut pas fournir directement `kind`, `action` ou une méthode à exécuter.
- Les refus et erreurs peuvent interrompre toutes les animations moins prioritaires.
- Aucun secret, identifiant utilisateur ou donnée d'enfant n'est envoyé au moteur visuel.

## 13. Vérifications ciblées

Le lot doit couvrir au minimum :

1. rejet d'une intention inconnue sans changement d'état ;
2. normalisation et bornage de `intensity` et `holdMs` ;
3. priorité de `refuse` et `error` sur toutes les autres intentions ;
4. impossibilité pour `idle` d'interrompre une alerte ;
5. traduction exacte des neuf intentions vers v12 et WebP ;
6. repli WebP lors d'un échec v12 ;
7. idempotence de `destroy()` et absence d'appel actif après destruction ;
8. conservation du comportement de connexion : accueil, écoute, réflexion, erreur et réussite ;
9. fonctionnement statique avec mouvements réduits.

Les tests ne doivent pas exiger le Worker, GLM, une voix, une base de données ni le VPS.

## 14. Critères d'acceptation

Le premier lot est accepté lorsque :

- l'écran de connexion n'utilise plus directement les références de packs pour commander une réaction ;
- une seule API publique reçoit les intentions physiques ;
- les neuf intentions ont une traduction déterministe ;
- le moteur v12 ne dépend plus de `.auth-screen` ;
- v12 peut être arrêté et détruit sans boucle ni écouteur résiduel ;
- le repli WebP conserve une JASPE visible en cas d'échec v12 ;
- les tests ciblés réussissent ;
- le formulaire de connexion reste utilisable avec v12 actif, indisponible et en mouvements réduits ;
- aucun fichier 3D, aucune voix et aucune modification VPS ne sont introduits ;
- `docs/CURRENT_HANDOFF.md` reflète les preuves et la prochaine action ;
- le commit local et `origin/main` sont identiques après validation du lot.
