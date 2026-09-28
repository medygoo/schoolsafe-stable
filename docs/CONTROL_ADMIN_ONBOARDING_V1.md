# Control → SchoolSafe : administrateur principal

Mission locale du 28 septembre 2026. Base SchoolSafe : 575ddb115af99a5bb1d133af667ad44ea61a8de7.
Control : branche feat/control-school-admin-access-v1, contrat ajouté à 2a53a5acc693397d5bf9f82a48218f32b0d3236d, PR https://github.com/medygoo/schoolsafe-control-/pull/9.

## Contrat serveur

SchoolSafe utilise CONTROL_APP_URL et SCHOOLSAFE_BOOTSTRAP_SECRET exclusivement côté serveur. HTTPS est requis sauf pour les tests en boucle locale. Le secret passe dans x-schoolsafe-bootstrap-secret, jamais dans le navigateur, les réponses ou SQL. Les requêtes refusent les redirections et expirent après cinq secondes. Aucun exemple de valeur de secret n'est conservé ici.

POST /internal/school-admin-access/verify reçoit login/password. ACTIVE retourne access_id, status, school_id, onboarding_required, email et phone. AUTH_INVALID autorise uniquement le repli vers les identités locales existantes. SUSPENDED/REVOKED refusent la connexion. Une erreur réseau ou une réponse invalide échoue en 503 ; aucun compte n'est créé pour un login inconnu.

GET /internal/school-admin-access/:id/status protège chaque résolution de session d'un principal Control, y compris l'onboarding. SUSPENDED/REVOKED révoquent ses sessions locales et refusent l'accès. Une panne du contrôle de statut refuse temporairement la session. Les sessions des autres comptes locaux n'appellent pas ce contrôle.

## Identité et transaction

La migration additive auth/v7 ajoute auth.control_admin_links. L'access_id résout une seule identité locale sans ligne auth.credentials. Une adresse déjà appartenant à une autre identité locale n'est jamais reprise automatiquement. Les mots de passe Control et leurs hashes ne sont jamais envoyés à PostgreSQL SchoolSafe.

Les sept étapes restent Identité, Cycles, Année scolaire, Coordonnées, Identité visuelle, Administrateur et Vérification. Le code maître, son champ et sa variable d'environnement sont retirés du runtime. Les migrations historiques v1–v6 restent intactes.

La transaction SQL existante de création est conservée derrière une fonction privée propriétaire. Le wrapper v7 vérifie le lien Control et enregistre school_id/bound_at dans la même transaction que l'école, l'année, les cycles, contacts, paramètres, profil, rôle principal, audit, révocation onboarding et session normale. Les runtimes ne peuvent appeler la fonction privée ni accéder directement à la table des liens. L'ancienne RPC d'admission libre perd son droit d'exécution.

Après commit SQL, SchoolSafe appelle POST /internal/school-admin-access/:id/bind-school. Une panne temporaire 503 conserve le lien local et permet le workspace si le statut est encore vérifiable. À la connexion suivante, un lien local déjà rempli entraîne une nouvelle tentative de bind et une session normale : jamais une seconde création. Un conflit de school_id ou un refus 403 reste bloquant.

## Qualification

Tests RED observés avant raccordement, puis tests unitaires, permissions, installateur, navigateur desktop/mobile, build et qualification native PostgreSQL 17.11 sur bases locales jetables. La qualification PostgreSQL contient 139 scénarios avec installation neuve, RLS, mises à niveau 48/63/64 → 65, rollback tardif, résolution concurrente et activation concurrente unique. Les parcours HTTP SchoolSafe emploient PostgreSQL réel et un serveur Control de contrat local ; les adapters Control sont qualifiés séparément par sa CI PostgreSQL 17.11.

La CI GitHub SchoolSafe conserve PostgreSQL postgres:17.11-bookworm, les régressions navigateur et les builds Docker existants. Les résultats sont associés au SHA de la PR. Aucun VPS, merge, migration de production ou déploiement n'est inclus. Une future mise en service doit configurer le même secret bootstrap sur les deux services et appliquer v7 avec la chaîne de migration autorisée.
