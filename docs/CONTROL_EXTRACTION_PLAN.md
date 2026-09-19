# Plan séparé — ancien Control vers medygoo/schoolsafe-control-2

**Plan uniquement. Aucun code Control construit, récupéré ou publié ici.**
La source exacte de l'ancien Control n'est pas identifiée dans les documents
examinés. Demande adressée au propriétaire : URL du dépôt ou chemin de l'archive
source, branche et référence connue. Ne pas deviner cette source ni utiliser
SchoolSafe comme substitut. La destination demandée est
`https://github.com/medygoo/schoolsafe-control-2.git`.

1. Identifier la source avec le propriétaire ; vérifier en lecture branche,
   SHA, fichiers locaux et provenance. Si archive : empreinte et date. Conserver
   la source intégrale localement sans écrasement ; inventorier son historique
   avant de décider s'il peut être transféré sans secrets.
2. Lire sa continuité puis inventorier **son application existante** : console,
   registre écoles `school_id`/code public, licences et révocation, services,
   impression, demandes/lots/ZIP, audit, auth/rôles, serveur, schéma et tests.
   Reprendre ses implémentations ; aucun développement d'un nouveau Control.
3. Définir un manifeste Control indépendant avec hashes, dépendances, archives
   et exclusions. Exclure clés de signature, credentials, dumps, données réelles,
   exports d'élèves, journaux, fichiers environnementaux et binaires générés.
   Les secrets restent dans leur gestion d'environnement autorisée.
4. Vérifier la compatibilité avec les adaptateurs **conservés dans SchoolSafe** :
   `server/src/control-app/client.ts`, `cardsnative/batches.ts`,
   `controlprintnative/routes.ts`, `db/control-authority.ts`, licence native.
   Contrats existants : `/card-print-requests`, `/card-print-batches`, callback
   `/native/control/print/status`, signature HMAC/timestamp/instance et licences.
   Ne copier ces clients vers Control que si sa source en a une dépendance prouvée.
5. Prouver sur données synthétiques seulement les signatures/refus, rejeux,
   révocations de licence, permissions Control et isolation entre deux écoles.
   Contrôler la chaîne PNG recto/verso → ZIP/manifeste → demande → statut avec
   les deux applications existantes. Documenter R2/fournisseurs substitués.
6. Préparer une copie locale Control séparée, sans credential partagé avec
   SchoolSafe, migrations et rôles DB distincts, Docker/Coolify séparés.
   Diff limité, hash de conservation, scan final et plan de retour à la source.
7. Avant une publication nouvellement autorisée : vérifier la destination,
   l'absence de déclencheur de déploiement GitHub/Coolify et les références
   distantes. Pas de force push, pas de migration de production, pas de copie VPS.

**Prochaine action exacte : identifier et lire la source existante de Control.**
Les commandes de clone/extraction ne sont pas fixées tant que cette source est
inconnue. Aucun fichier de l'arbre SchoolSafe n'est classé application Control.
