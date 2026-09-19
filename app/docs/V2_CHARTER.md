# Charte SchoolSafe V2

## Modèle de déploiement

SchoolSafe est une plateforme centralisée : un VPS central (Docker + Coolify)
héberge SchoolSafe Control et SchoolSafe pour plusieurs écoles. Les écoles sont
isolées strictement par `school_id` (PostgreSQL, RLS, ACCESS_LAW, audit) —
l'isolation est une barrière de données, non de déploiement. Chaque école
possède un `school_id` UUID canonique et un `school_code` public lisible de type
`SCH-000001`.

Docker organise proprement la plateforme et ses services (Web, API, Control,
PostgreSQL et services techniques) ; il n'existe pas de conteneur par école.
L'isolation multi-écoles repose sur `school_id` + PostgreSQL + ACCESS_LAW.

L'identité d'authentification est globale à la plateforme et l'accès aux écoles
se fait par memberships/rattachements. Si un compte ne possède qu'un seul
membership actif, le contexte école peut être résolu automatiquement. S'il
possède plusieurs memberships, il peut sélectionner le contexte école autorisé
ou y accéder par une entrée tenant-aware prévue par l'application.

Dans tous les cas, le client ne peut jamais imposer arbitrairement un
`school_id`. Le serveur résout et valide systématiquement le contexte école
actif à partir de l'identité authentifiée, des memberships autorisés et du
contexte de session.

> Historique : jusqu'au 2026-09-13, cette section affirmait « 1 école = 1 VPS ».
> Cette formulation est obsolète depuis le 2026-09-14 (voir `docs/DECISIONS.md`).

## Cycles

- Maternelle
- Primaire
- Secondaire et Humanités

L'école active un ou plusieurs cycles. Les modules communs restent disponibles; les
fonctions pédagogiques spécialisées dépendent des cycles sélectionnés.

## Profils de référence

Administrateur principal, Chef d'établissement, Responsable pédagogique,
Responsable administratif et admissions, Secrétaire scolaire, Responsable
financier, Agent de caisse, Comptable, Responsable RH, Enseignant, Agent de
contrôle d'accès, Infirmier, Responsable cantine, Responsable communication et
site, Parent ou responsable légal.

L'Administrateur principal attribue les modules, les actions et le périmètre de
données. L'interface n'est jamais l'autorité de sécurité définitive.

## Frontières de sécurité

Aucune modification du VPS, de PostgreSQL, de ses rôles, des RLS, des migrations,
de la sécurité ou des sauvegardes ne peut être réalisée sans analyse d'impact et
autorisation explicite.
