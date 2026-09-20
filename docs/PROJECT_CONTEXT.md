# Contexte durable du projet SchoolSafe

Dernière mise à jour de la continuité : 16 septembre 2026.

## Point d'entrée pour la reprise

- **ACTIVE — 19/09/2026 : base de développement validée ; publication autorisée
  uniquement sur `medygoo/schoolsafe-stable`, branche `develop/codex-base`.**
  Aucun push sur main, déploiement ou VPS. Défauts SQL ouverts et absence de
  validation Docker réelle maintenus ; lire le premier bloc du handoff.
  Les consignes de préparation seule qui suivent sont remplacées pour ce mandat.

- **ACTIVE — 19/09/2026 : préparation finale de SchoolSafe Stable**, manifeste
  validé par le propriétaire. Reprendre le premier bloc du handoff et
  `docs/migration/2026-09-19-stable-preparation/README.md`. Aucun push/déploiement.
  Docker + Coolify confirmé ; contradiction d'AGENTS annotée comme remplacée.
  Les anciennes priorités et la divergence ci-dessous sont historiques.

- **Priorité immédiate demandée ensuite par le propriétaire : bandeau JASPE**
  compact, bureau occasionnel, cartable et logo de l’école à côté. Ce changement
  n’est pas encore intégré. Reprise précise dans le premier bloc du handoff et
  `docs/design/jaspe-cartable-v1/REPRISE.md`. Reprendre A5.1 après ce lot visuel.

- Plan actif pour tous les agents :
  [fonctionnalités et Rôles et accès](superpowers/plans/2026-09-16-schoolsafe-functional-integration.md).
- Priorité : terminer Rôles et accès progressivement, puis raccorder les autres
  rubriques. A1 (contexte natif et consultation du compte connecté) est livré au
  commit `7b2896a`, avec API/base substituées dans les tests. A2 (annuaire et
  attributions en lecture) est validé le 16/09 sur PostgreSQL 17.11 réel de test
  et dans le navigateur. **A3.0–A3.1 livrés sur base de test réelle** : attribution,
  retrait, délégation, dernier administrateur, concurrence, audit et révocation
  JASPE. **A4 livré sur base de test réelle** : postes personnalisés, copies de
  modèles, composition, impact partagé, audit et refus effectifs.
  A5.0 corrige maintenant les dates/états du bootstrap sur base réelle : les
  droits expirés/futurs et rattachements inactifs ne sont plus présentés comme
  courants. **Prochaine tâche : A5.1, règles ciblées/conditionnelles et restrictions
  individuelles dans la console.** La projection des DENY ciblés reste à préciser.
  Le module complet A5–A7 et la production ne sont pas encore validés.
- Consulter le haut de `CURRENT_HANDOFF.md` pour la tâche courante et les preuves.
  Les observations techniques datées du 13/09 ci-dessous sont historiques : les
  lots JASPE et accès du 16/09 les complètent, sans constituer une preuve de production.
- Divergence d'exploitation conservée à signaler au lot VPS : `AGENTS.md` interdit
  l'ajout de Docker, les décisions du 14/09 décrivent Docker/Coolify. Aucun ajout
  Docker ni changement de déploiement ne fait partie du chantier Rôles et accès.

## Mission

SchoolSafe est un écosystème scolaire centré sur la gestion des écoles, des élèves, des cartes QR, de la pédagogie, de la sécurité, des finances et de l'administration. L'application doit rester exploitable sur ordinateur et mobile, avec une attention particulière aux permissions, à l'isolation entre écoles et à la protection des enfants.

## Architecture produit verrouillée

- L'application reste prioritaire : **APP FIRST — JASPE ASSISTED**.
- JASPE assiste l'utilisateur sans remplacer l'application ni l'autorité humaine.
- SchoolSafe Control est conservé comme couche centrale protégée de gestion des écoles inscrites, licences, supervision et impression contrôlée.
- Le dépôt local et GitHub doivent être identiques après chaque lot terminé.
- ~~Le déploiement final se fera directement sur VPS, sans Docker.~~ **OBSOLÈTE le 2026-09-14** : Docker + Coolify sont l'architecture d'exploitation du VPS central multi-écoles (voir `docs/DECISIONS.md` du 14/09 et la spec G0).
- Le VPS ne doit être modifié qu'après stabilisation et synchronisation du travail sur GitHub.

## JASPE

### Direction validée

- JASPE conserve son identité visuelle verrouillée v12.
- La représentation est 2D/2,5D. La 3D a été supprimée et ne doit pas revenir.
- Le même personnage doit pouvoir apparaître en corps entier, en buste ou en avatar par cadrage et adaptation du rendu, sans recréer plusieurs identités.
- Le lot physique couvre les expressions du visage, le regard, les clignements, la tête, la respiration, les postures et les gestes du corps.
- La voix et la synchronisation labiale ne font pas partie du lot physique actuel.
- Le texte pourra être produit ultérieurement par GLM sur Cloudflare. Une synthèse vocale Cloudflare distincte sera nécessaire pour produire une voix ; GLM seul ne génère pas automatiquement l'audio.

### Invariants de comportement

- Une réponse IA ne commande jamais directement du code, du HTML ou un nom d'animation arbitraire.
- Une couche SchoolSafe traduit les événements fiables en intentions visuelles autorisées.
- Les refus, alertes de sécurité et erreurs ont priorité sur les gestes décoratifs.
- JASPE ne révèle et ne manipule que ce que les permissions et portées de l'utilisateur autorisent.
- **Loi générale explicitement validée le 16/09** : JASPE agit au nom du profil
  connecté, sans droits supplémentaires. Le même contrôle serveur s'impose à
  chaque lecture/action dans toute l'application, aux API et aux outils/connecteurs.
  Droits retirés = refus dès la demande suivante et nouvelle vérification lors de
  l'exécution différée. La conversation ou les contenus externes ne donnent aucun droit.
- Une défaillance de JASPE ne doit jamais bloquer l'authentification ni une fonction métier.
- Le mode mouvements réduits, la pause en onglet caché et un rendu statique de secours doivent être conservés.

### État technique observé le 13 septembre — historique

- `app/modules/jaspe2d/jaspe2d.js` fournit un moteur léger par états et images WebP.
- `app/modules/jaspe2d/live-companion.js` monte le moteur v12 enrichi sur l'écran de connexion.
- `app/modules/jaspe2d/v12/base-controller.js` gère les poses, transitions, intensités, regard, respiration et gestes.
- `app/modules/safe/safe-assistant.js` contient un assistant de tableau de bord, mais son branchement visuel et son chargement dans `index.html` ne sont pas terminés.
- Le serveur expose `POST /native/jaspe/chat` et relaie les demandes vers un Worker Cloudflare.
- Les ressources JASPE représentent environ 63,8 Mo, dont environ 42,8 Mo pour v12. L'optimisation mobile reste nécessaire.

## Méthode de livraison

- Corriger et compléter l'existant avant de créer un système parallèle.
- Conserver les originaux graphiques ; produire des dérivés optimisés pour l'exécution si nécessaire.
- Travailler par lots avec validation humaine entre les changements d'architecture.
- Ne lancer que les tests utiles au risque du lot, sans prétendre qu'un test non exécuté a réussi.
- Documenter précisément les limites, erreurs connues et prochaines actions dans `docs/CURRENT_HANDOFF.md`.


## Mission directe VPS ? 20 septembre 2026

La mission utilisateur courante remplace les anciens mandats Coolify/Easypanel :
Docker Compose + Caddy, deux bases/reseaux, source GitHub production. Corrections
locales additives sur codex/schoolsafe-installation-v2, jamais dans le checkout
VPS ; ni merge ni deploiement SchoolSafe autorise. Voir docs/INSTALLATION_V2.md
et SCHOOLSAFE_DIRECT_VPS_REPORT.md. Les sections anterieures restent historiques.
