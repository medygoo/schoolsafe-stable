# SchoolSafe — Déploiement (source de vérité opérationnelle)

Statut : **décision officielle du 2026-09-14, validée** — voir `docs/DECISIONS.md`.

## Chaîne de déploiement officielle

```text
Git / dépôt SchoolSafe
        ↓
version validée / tag
        ↓
Coolify
        ↓
Docker construit l'image
        ↓
tests + healthcheck
        ↓
déploiement sur le VPS
        ↓
SchoolSafe en production
```

**Déploiement final SchoolSafe = Git → Coolify → Docker → VPS.** Docker ne sert
pas seulement à faire tourner SchoolSafe : il garantit le même environnement à
chaque déploiement, des services séparés, des redémarrages propres et une
procédure reproductible.

## Organisation cible du VPS

```text
VPS HOSTINGER
├── Docker + Coolify
├── SchoolSafe Web
├── SchoolSafe API
├── SchoolSafe Control
├── PostgreSQL
└── services techniques
```

**Pas un Docker par école.** Toutes les écoles utilisent les mêmes services ;
l'isolation des écoles est assurée par **PostgreSQL + `school_id` + RLS +
ACCESS_LAW**, pas simplement par les conteneurs.

## Les 10 règles opérationnelles

1. **Jamais** copier manuellement des fichiers de production sur le VPS.
2. Tout changement part du **dépôt Git**.
3. Créer une **image Docker reproductible**.
4. Garder **production et test/staging séparés**.
5. Les secrets (`DATABASE_URL`, clés, mots de passe…) restent dans
   **Coolify/environnement, jamais dans Git**.
6. Exposer `/health` (+ readiness) pour que Docker/Coolify sache si la nouvelle
   version fonctionne avant de la considérer opérationnelle.
7. PostgreSQL et tout stockage persistant dans des **volumes persistants ou
   services dédiés** — les données ne dépendent jamais du système de fichiers
   éphémère d'un conteneur.
8. Sauvegarder la base **avant toute migration importante**.
9. Chaque version de production porte un **tag/commit SHA précis** pour le
   retour en arrière.
10. Les gros fichiers et archives des écoles restent dans **R2**, séparés par
    `school_id` (voir la spec G0).

## Méthodes remplacées (conservées pour l'historique — ne pas réutiliser)

- **REMPLACÉE (2026-09-12 → 14)** : « déploiement direct sur VPS sans Docker,
  service système » — remplacée par la chaîne Git → Coolify → Docker → VPS.
- **REMPLACÉE (2026-09-12 → 14)** : « 1 école = 1 VPS » — remplacée par
  l'architecture multi-écoles isolées par `school_id` sur un VPS central.

## Contenu de ce dossier

Les configurations, scripts et procédures d'exploitation produits côté VPS
(docker-compose, coolify, sauvegarde, restauration, runbooks) doivent être
consignés ici par lots validés, sans aucun secret. Zone de propriété :
ChatGPT (exploitation VPS) ; relecture croisée avant fusion sur `main`.
