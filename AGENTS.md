# Consignes de continuité SchoolSafe

## Mandat prioritaire — 19 septembre 2026, BOLT-1

**ACTIF — validation reçue :** `bolt/workspace` est validée comme branche
expérimentale Bolt. Commit et push autorisés uniquement sur cette branche vers
`medygoo/schoolsafe-stable`, après vérification des retraits et du non-déploiement.
Ne modifier ni `develop/codex-base` ni `main`. Aucun déploiement ou VPS.
La première tâche Bolt est le bug PNG `CanvasGradient` ; ne pas le corriger pendant
la publication. Voir le handoff pour l'état de la vérification GitHub.

**HISTORIQUE — préparation avant validation, remplacée par le mandat ci-dessus :**

La branche locale `bolt/workspace` prépare un import allégé. **Aucun push avant
validation du propriétaire**, aucun déploiement, Coolify ou VPS. Cette instruction
suspend les ordres génériques de publication ci-dessous pour ce lot. La base
`develop/codex-base` et son historique restent intacts. Lire `docs/bolt/README.md`
et le premier bloc du handoff ; ne pas reprendre les anciens mandats de publication.

Ce dépôt est la source de vérité commune pour tous les comptes ChatGPT/Codex et tous les assistants qui travaillent sur SchoolSafe.

## Avant toute intervention

1. Lire entièrement `docs/PROJECT_CONTEXT.md`, `docs/DECISIONS.md` et `docs/CURRENT_HANDOFF.md`.
2. Vérifier la branche, le commit local, le commit distant et l'état du dépôt.
3. Si le dépôt contient des changements non documentés, ne pas les écraser et déterminer à qui ils appartiennent.
4. Vérifier les affirmations importantes dans le code ou les tests. Les documents de continuité donnent le contexte, mais ne remplacent pas le dépôt.
5. Ne jamais copier une conversation complète dans le dépôt. Ne conserver que les décisions et informations nécessaires à la reprise.
6. Lire le plan de travail actif : [`docs/superpowers/plans/2026-09-16-schoolsafe-functional-integration.md`](docs/superpowers/plans/2026-09-16-schoolsafe-functional-integration.md). Commencer par son tableau de suivi et la prochaine tâche indiquée en tête du handoff, sans reprendre une ancienne « prochaine action » de l'historique.

## Plan commun à tous les agents — actif depuis le 16 septembre 2026

- Priorité du propriétaire : **Rôles et accès**, puis les autres fonctionnalités ; corriger et compléter sans supprimer l'existant.
- Tout agent peut reprendre le travail selon le même plan. La responsabilité porte sur un lot et ses fichiers, pas sur le nom du fournisseur d'IA.
- Inscrire dans le handoff la tâche prise, l'agent, la branche, le commit de départ et les fichiers concernés. Un seul agent modifie un même lot à la fois ; ne pas lancer de travail concurrent sans coordination explicite.
- En clôture, actualiser le statut de la tâche dans le plan et la prochaine action du handoff. Distinguer code testé avec substituts, parcours vérifié sur PostgreSQL réel et validation de production.
- Les résumés historiques sont conservés, mais leurs ordres et anciennes répartitions entre agents ne remplacent pas le plan actif ni une instruction récente du propriétaire.

## Règles permanentes

- GitHub et le dépôt local doivent rester en miroir à la fin de chaque lot validé.
- Travailler par lots petits, cohérents et vérifiables.
- Ne pas supprimer un module, des données ou une infrastructure existante sans demande explicite du propriétaire.
- Ne pas réintroduire de 3D. JASPE reste en 2D/2,5D.
- **ACTIVE — Docker + Coolify** : chaîne Git → Coolify → Docker → VPS, selon les décisions du 14/09, confirmées le 19/09/2026. SchoolSafe et Control restent séparés ; aucune opération de déploiement n'est implicite.
- **HISTORIQUE — REMPLACÉE le 14/09, annotation du 19/09/2026** : « Ne pas ajouter Docker. Le déploiement final visé est direct sur VPS. » Cette ancienne règle est conservée pour mémoire et ne s'applique plus.
- SchoolSafe Control reste la couche centrale protégée d'administration, supervision, licence et impression.
- JASPE n'élargit jamais les permissions de l'utilisateur et ne remplace jamais une autorité humaine.
- Aucun mot de passe, token, cookie, clé API, clé privée ou donnée personnelle sensible ne doit entrer dans ces documents.
- Limiter les tests aux contrôles importants, mais tester obligatoirement les permissions, les données d'enfants, l'argent, l'isolation entre écoles, les migrations et les contrats critiques.

## Fin d'un lot

**ACTIVE — autorisation du propriétaire du 19/09/2026 : publier les 772 fichiers
préparés comme base de développement dans `medygoo/schoolsafe-stable`, uniquement
sur `develop/codex-base`. Ne pas pousser sur `main`, ne pas déployer, ne pas toucher
au VPS. Vérifier le SHA distant et l'existence de la branche, puis arrêter.**
La suspension de publication ci-dessous appartient désormais à l'historique.

**Mandat courant du 19/09/2026 : préparation locale de SchoolSafe Stable seulement. Aucun push ni déploiement.** Cette instruction suspend les étapes de publication ci-dessous jusqu'à une nouvelle autorisation explicite du propriétaire.

1. Exécuter les vérifications proportionnées au risque et noter leurs résultats réels.
2. Mettre à jour `docs/CURRENT_HANDOFF.md` avec le travail terminé, les fichiers touchés, les tests, les risques et la prochaine action exacte.
3. Ajouter dans `docs/DECISIONS.md` toute nouvelle décision validée qui modifie l'architecture ou le produit.
4. Committer puis pousser le lot validé sur GitHub.
5. Vérifier que le commit local et le commit distant sont identiques avant d'annoncer la synchronisation.

## Passage entre deux comptes

- Le compte qui quitte le projet doit pousser son dernier lot et mettre à jour le handoff.
- Le compte qui reprend doit récupérer GitHub avant de modifier le code, puis commencer par la section « Prochaine action » du handoff.
- Pour un travail séquentiel, utiliser une seule branche active. Pour un travail réellement simultané, utiliser des branches distinctes et fusionner après revue afin d'éviter les écrasements.
