# SchoolSafe — Contrat G0 : architecture cible + License Contract V2

Date : 14 septembre 2026
Statut : **validé par le propriétaire le 14/09/2026** — à commiter avec le lot « Étape 0 — cohérence documentaire ». Aucune implémentation ; signature et vérification de licence en production inchangées.

## 0. Règle de conduite

**VISION LARGE, LIVRAISON ÉTROITE.** La vision complète (écosystème, JASPE, Watch, Lab, StaffID, Control avancé) est conservée en roadmap V2/V3, jamais supprimée. Mais aucune nouvelle grande fonctionnalité tant que le parcours quotidien de la première école (Le Sage) n'est pas stable, sécurisé, sauvegardable et restaurable. Le cœur V1 = authentification, isolation par école, élèves/classes, Pass QR, entrées/présences/sorties avec photo de la personne autorisée et validation humaine, caisse/reçus, Access Law, audit, sauvegarde/restauration. La gestion de base des personnes autorisées fait partie du cœur ; Guardian complet peut attendre V2.

## 1. Architecture cible verrouillée

```text
                     INTERNET
                         │
                CLOUDFLARE / HTTPS
                         │
                  ┌──────┴───────┐
                  ▼              ▼
          SCHOOLSAFE CONTROL   SCHOOLSAFE
          (Control minimal     Application métier
           au départ)          multi-écoles
                  │              │
                  └──────┬───────┘
                         ▼
              VPS CENTRAL (Hostinger)
              Docker + Coolify ← exploitation officielle
                         │
        ┌────────────────┼─────────────────┐
        ▼                ▼                 ▼
   control_db      schoolsafe_db      R2 externe
   (gouvernance)   (ACCESS_LAW +      (schools/<code>/
                   données par           documents,
                   school_id)            archives…)
```

Règles :

1. **Un seul VPS central** héberge Control ET SchoolSafe pour plusieurs écoles. « 1 école = 1 VPS » est incorrect ; la formulation officielle : **1 plateforme SchoolSafe = plusieurs écoles isolées ; chaque école possède un `school_id` unique et stable.**
2. **Docker + Coolify est l'architecture d'exploitation** (décision du 14/09, abroge le « sans Docker » du 12/09). La documentation obsolète doit être corrigée (charte, PROJECT_CONTEXT).
3. **Docker + Coolify est l'architecture d'exploitation** (décision du 14/09, abroge le « sans Docker » du 12/09). Docker organise les **services techniques** (Web, API, Control, PostgreSQL, workers) ; **il n'existe pas de conteneur par école** — l'isolation multi-écoles repose sur `school_id` + PostgreSQL + ACCESS_LAW. La documentation obsolète doit être corrigée (charte, PROJECT_CONTEXT — fait dans l'Étape 0).
4. **Même VPS ne signifie PAS même application.** Le principe souverain est la **séparation logique et des privilèges** : credentials séparés, rôles PostgreSQL séparés, droits séparés, migrations séparées, impossibilité pour SchoolSafe de modifier directement les données souveraines de Control. Deux bases (`control_db` / `schoolsafe_db`) sont conformes, mais l'architecture ne dépend pas d'un nom physique de base. La cohabitation est une optimisation d'infrastructure, pas une fusion ; la confiance repose sur la signature : Control signe, SchoolSafe vérifie.
5. **PostgreSQL du VPS = base de production souveraine.** Supabase appartient à l'architecture précédente : inventorier → classifier → migrer → tester → retirer uniquement ce qui est devenu réellement inutile. Jamais de suppression massive.

## 2. Identités de la plateforme

### 2.1 Deux identifiants d'école, deux rôles

```text
school_id   = 550e8400-e29b-41d4-a716-446655440000   (UUID, canonique)
school_code = SCH-000001                             (public lisible)
```

- `school_id` (UUID) : clés étrangères, PostgreSQL, ACCESS_LAW, RLS, API, isolation, **licences signées**. Immuable.
- `school_code` : Control, écrans, contrats, support, références administratives, documents humains. Unique et stable.

### 2.2 Identité de connexion globale + memberships

L'identité d'authentification est **globale à la plateforme** ; l'accès aux écoles se fait par rattachements :

```text
Compte utilisateur (global)
     ├── membership école A → parent
     └── membership école B → enseignant
```

- Téléphone normalisé : unique lorsqu'il sert d'identifiant de connexion ; e-mail vérifié possible aussi.
- **Une fiche contact (parent/personne autorisée) n'est pas automatiquement une identité de connexion.**
- **Résolution du contexte école** : un seul membership actif → contexte résolu automatiquement ; plusieurs memberships → l'utilisateur sélectionne un contexte école autorisé via une entrée tenant-aware prévue par l'application. **Le navigateur n'impose jamais de `school_id`** : le serveur résout et valide systématiquement le tenant actif à partir de l'identité authentifiée + memberships valides + contexte de session. `school_id` transmis par le client ≠ autorité.

### 2.3 OTP

L'OTP ne doit pas bloquer le cœur. Connexion normale d'abord ; OTP pour activation, récupération et actions sensibles. Abstraction `OTP_PROVIDER` à créer plus tard (Africell ou autre SMS) — **aucun fournisseur verrouillé aujourd'hui**, aucun fournisseur codé en dur dans l'auth.

## 3. Rôles Control ↔ SchoolSafe

### 3.1 SchoolSafe Control — centre de commandement (minimal au départ)

Connaît : écoles (`school_id` + `school_code`), statut essai/actif/suspendu/archivé, licences et dates, services souscrits, catalogue, supervision, audit administratif. **Control minimal** doit savoir : enregistrer une école, générer/associer les identifiants, gérer le statut, définir les services autorisés, émettre/révoquer/remplacer une licence signée, garder un audit minimum. **Pas besoin maintenant de** : grand dashboard SaaS, facturation automatisée, provisioning sophistiqué, analytics, CRM. Une interface/opérations sécurisées minimales suffisent ; l'automatisation complète vient avec plusieurs écoles clientes.

### 3.2 SchoolSafe — application métier multi-écoles

Direction, enseignants, gardien, caisse, personnel, parents. Le `school_id` est une **frontière de sécurité vérifiée côté serveur sur chaque requête métier** (contexte + RLS), jamais un simple filtre d'interface. Une école ne consulte jamais les données d'une autre.

### 3.3 Flux d'autorité

```text
CONTROL crée/valide une école → school_id (+ school_code)
   → émet la licence (License Contract V2 signé)
   → SCHOOLSAFE vérifie la signature → applique les services autorisés
```

SchoolSafe ne peut jamais ajouter localement un service que Control n'a pas autorisé.

## 4. Chaîne d'accès effectif

```text
CONTROL     service souscrit pour l'école ?      (jeton signé)
   ↓
LICENCE     licence encore valide ?              (statut, dates, grâce)
   ↓
ACTIVATION  Direction a activé le service ?      (PostgreSQL école, non signé)
   ↓
ACCESS_LAW  utilisateur a la permission ?        (iam.require_access)
   ↓
SCHOOL_ID   accès à cette école et ces données ? (contexte transaction + RLS)
   ↓
ACTION AUTORISÉE (même transaction, auditée)
```

Les quatre premiers étages sont indépendants et tous obligatoires ; aucun ne se déduit d'un autre.

## 5. Socle vs services

```text
CORE (non licenciable)   → id
SERVICES (licenciables)  → pass, watch, staffid, guardian, lab, + futurs codes publiés par Control
```

- **SchoolSafe ID = socle permanent** (identités, comptes, rôles, sessions, fondation des permissions) — jamais désactivable commercialement.
- **Guardian** = personnes autorisées et délégations familiales ; sa gestion de base (personnes autorisées + photo à la sortie + validation humaine) est dans le cœur V1.
- **Catalogue extensible** : Control peut publier de nouveaux codes sans casser les anciennes applications. Code inconnu → ignoré proprement, jamais autorisé, jamais bloquant. L'app n'invente pas une UI pour un service qu'elle ne connaît pas.

## 6. License Contract V2 — payload

```json
{
  "contract_version": 2,
  "license_id": "lic_…",
  "school_id": "uuid",
  "status": "active | suspended | revoked",
  "issued_at": "…",
  "expires_at": "…",
  "grace_days": 15,
  "services": [
    { "code": "pass",  "state": "granted" },
    { "code": "watch", "state": "suspended" }
  ]
}
```

Hors V2 (reporté) : quotas (`max_students`, `max_gb`…) — évolution séparée `entitlements/limits` quand le modèle commercial sera stabilisé.

### Règles de lecture — toutes fail-closed

1. `contract_version` absent → jeton **v1** (§7). Version supérieure au vérificateur → **refusé**, jamais dégradé.
2. Service **absent du tableau** → non habilité. L'absence ne signifie jamais « tous les services ».
3. `granted` → habilité (statut global + activation école requis) ; `suspended` = distinction UX « suspendu par Control » ≠ « non inclus dans votre licence ».
4. Statut global `revoked`/`suspended`/`expired` → ferme tout le métier, sans toucher à l'identité de connexion.
5. Habilitations dérivées **uniquement du jeton à signature vérifiée** ; la base stocke le jeton brut, l'affichage se recalcule à la lecture.
6. **Grâce globale uniquement** en V2 ; grâce par service seulement si le renouvellement par produit devient réel.

## 7. Cycle de vie d'une école et migration V1 → V2

```text
Provisionnement :  école → Control génère school_id + school_code → tenant
                   → administrateur initial → licence d'essai → école utilisable
                   (aucun nouveau VPS : l'école rejoint la plateforme)
Essai → abonnement : TRIAL → ACTIVE — mêmes identifiants, mêmes données,
                   mêmes fichiers. Control met à jour statut et licence.
Cycle contractuel : ACTIVE → EXPIRED → GRACE → SUSPENDED → ARCHIVED → DELETE ELIGIBLE
```

- `ARCHIVED`/`DELETE ELIGIBLE` vivent côté Control ; le jeton ne porte que ce que SchoolSafe applique. Suppression de données = opération backend journalisée, strictement ciblée par `school_id`, jamais déclenchée par un écran « expiré ».
- **Migration V1** : `LEGACY_DEFAULT_SERVICES = ["pass"]` ; `id` reste socle. Vérificateur v2 (accepte v1+v2) déployé **avant** toute émission v2. Control re-émet par école (`issued_at` supérieur, anti-rejeu existant). Aucune migration SQL obligatoire (jeton brut déjà stocké). **Sunset V1 conditionnel** : critères (Control opérationnel, v2 émis, migrations, tests révocation/hors-ligne, ≥ 1 production stable) → 6 mois de compatibilité → retrait. Une école non re-émise est fermée, pas ouverte.

## 8. Rattachement service ↔ permission et stockage

**Par permissions canoniques, jamais par URL.** Le catalogue connaît le service de chaque permission (`pass.card.read`, `watch.geofence.manage`, `guardian.authorized_person.manage`, `lab.device.read`…). Proposition d'implémentation (à valider au lot catalogue) : champ optionnel `service` dans `shared/permissions.json`, versionné avec le catalogue.

**Stockage** : le disque du VPS ne porte que les services, la base active et des fichiers techniques temporaires. Les **documents lourds de chaque école** vivent dans le stockage externe R2 central (`schoolsafe-schools`), organisés par `school_id` :

```text
R2 central : schoolsafe-schools
├── schools/<school_id UUID A>/   documents/ photos/ rapports/ archives/ exports/
├── schools/<school_id UUID B>/   documents/ photos/ archives/
└── schools/<school_id UUID C>/
```

Chaque école ne voit que son propre espace, via `school_id` + authentification + ACCESS_LAW. Control peut connaître quotas/états/statistiques ; l'accès réel passe par SchoolSafe.

## 9. Application côté école (cible, non branchée)

```
service_accessible(code) = statut licence OK (actif ou grâce)
                           AND services[code].state == granted
                           AND activation_locale(code) == true
accès effectif           = service_accessible(code) AND iam.require_access(permission, portées)
```

Point d'application serveur unique (jamais navigateur). Aucune permission dérivée d'une habilitation : licence et ACCESS_LAW restent orthogonaux. Control injoignable → dernier jeton signé dans sa validité.

## 10. Ordre d'exécution verrouillé

```text
Étape 0  Cohérence documentaire (décisions, charte, G0) — CE LOT
Étape 1  Phase A — ACCESS_LAW et contexte de requête (plan canonique, 7 tâches)
Étape 2  Isolation critique — toute fuite inter-écoles est bloquante
Étape 3  Enforcement de la licence côté backend (hook, pas seulement un indicateur)
Étape 4  Cœur quotidien Le Sage (élèves, Pass, présences/sorties photo+validation,
         caisse/reçus) + tests
Étape 5  Sauvegarde/restauration testées (journal de preuve) + préparation production
Étape 6  Ensuite seulement : Control avancé, JASPE, Watch, Guardian avancé
          (délégations avancées, politiques), Lab, StaffID avancé, extensions
```

Vérifications obligatoires du futur lot G0-B (après Phase A) : jeton falsifié · version future refusée · v1 mappé sur `["pass"]` · code inconnu sans effet · suspension par service · révocation globale · activation sans habilitation refusée · habilitation sans permission ACCESS_LAW refusée · isolation inter-écoles · dégradation Control injoignable · audit des écritures.

## 11. Points résiduels ouverts (non bloquants)

1. Canal de provisionnement Control → SchoolSafe (création de tenant, admin initial) — candidat : autorité machine signée du plan Access Law (tâche 5).
2. Canal de supervision de l'activation locale vers Control (push signé ou lecture).
3. Emplacement du catalogue permission → service (champ `service` dans `shared/permissions.json`, proposé).
4. Fournisseur OTP — délibérément non verrouillé (abstraction `OTP_PROVIDER`).
