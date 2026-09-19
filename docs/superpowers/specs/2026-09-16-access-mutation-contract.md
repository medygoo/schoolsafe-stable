# A3 — attribution et retrait de rôles natifs

Le propriétaire confirme que les humains attribuent les droits et que JASPE
respecte ces attributions. Un accès à Finance ne donne pas accès à toutes les
données financières : frais des enfants et rémunération du personnel sont des
capacités différentes. Aucun nom de rôle ou message adressé à JASPE ne confère
d'autorisation. L'administration scolaire reste distincte de SchoolSafe Control.

Précision du propriétaire pendant A3 : JASPE pourra exécuter des tâches, y compris
préparer/créer un devoir ou consulter un site pédagogique relié. Chaque outil
utilisera l'identité humaine courante, sa permission d'action, sa classe/matière,
son école et le statut de publication de la ressource. Un parent consulte seulement
les devoirs rendus accessibles à ses enfants ; aucun accès transversal aux brouillons,
cahiers internes, programme privé ou à tous les devoirs d'un enseignant. Un connecteur
ou un contenu importé ne donne aucun droit supplémentaire. Les données provenant
des sites sont du contenu, jamais des instructions d'autorisation. Les outils de
création pédagogique et ces filtres de publication doivent être réalisés et testés
dans F ; le simple relais de conversation actuel n'est pas présenté comme cet exécuteur.

## Contrat choisi pour A3

- Acteur et école viennent exclusivement du cookie résolu. `roles.manage` sans
  cible est obligatoire au serveur et dans la RPC, de nouveau après verrouillage.
- L'administrateur disposant des permissions complètes de l'école peut attribuer
  ses rôles à toute personne de cette école. Un gestionnaire limité ne peut pas
  distribuer des droits qui dépassent son autorité. Pas de privilège implicite
  pour une chaîne `admin`, ni d'attribution de permission Control.
- Enveloppe conservatrice : pour chaque permission d'un rôle modifié, un ALLOW
  actif et permanent de l'acteur, sans condition, doit couvrir toute l'école.
  Les permissions personnelles canoniques `own` et `none` peuvent être déléguées
  avec leur même portée. Tout DENY actif ou futur non expiré de cette permission
  chez l'acteur interdit sa délégation. Les exceptions et droits temporaires ne
  permettent pas de créer une attribution permanente. Cette règle vaut aussi
  pour retirer un rôle : retirer un DENY peut augmenter les droits de la cible.
- Attribution permanente immédiate seulement dans A3 ; dates/conditions A5.
  Réactivation d'une attribution existante, sans effacer son historique d'audit.
  Retrait par désactivation, aucune suppression de personne/rôle/grant.
- Un profil actif lié à un utilisateur actif doit conserver une autorité de
  gestion permanente, non conditionnelle, sans DENY. L'auto-retrait est possible
  si un autre profil répond à cette condition. Ni rôle dormant, ni compte sans
  utilisateur, ni administrateur temporaire ne constitue cette garantie.
- Toutes les mutations IAM prennent le verrou de l'école et incrémentent une
  révision commune. La modification requiert la révision affichée ; une requête
  périmée reçoit 409 et doit être relue/confirmée. L'autorisation est toujours
  recalculée, même si la révision paraît actuelle. Pas de rejeu hors ligne.
- Confirmation explicite dans l'interface : personne, rôle, attribution/retrait,
  permissions du rôle, motif obligatoire. Corps JSON strict et en-tête non simple
  requis pour les écritures cookie ; une origine non autorisée ne peut franchir
  le preflight CORS. Aucun tenant/acteur fourni dans le corps.
- Transaction unique pour changement, vérification du dernier administrateur,
  audit et révision. Échec de l'audit = annulation. Audit lié à acteur, école,
  cible, rôle, opération, motif et request_id. Les erreurs n'exposent pas le SQL.
- Le provisionnement des modèles reste une opération de migration/bootstrap :
  le runtime scolaire ne peut pas le détourner pour rétablir tous ses privilèges.

## Preuves requises

PostgreSQL réel sous schoolsafe_api : succès persistant, retrait/réactivation,
absence de session/droit, cross-school, rôle désactivé, Control, DENY, gestionnaire
limité, droits temporaires, perte du dernier administrateur et concurrence réelle
de deux connexions ; cohérence des événements et rollback. API stricte et
parcours navigateur avec cookie réel, confirmation, rafraîchissement, conflit et
révocation effective. Les fixtures restent dans une base locale de test dédiée.

A4–A7 et les modules suivants ne sont pas déclarés terminés par ce contrat.

## Résultats A3 — 16 septembre

- PostgreSQL réel : 23 unités sur base vide, A2/A3 et scénario Access Law trois
  écoles PASS ; mise à niveau additive d'une base A2 synthétique sans modifier
  ses rôles/attributions/grants/journal. Ancienne projection A2 inchangée.
- Deux connexions concurrentes : conflit de version et dernier administrateur
  protégés ; permission de l'acteur recalculée après attente du verrou.
- Navigateur réel : aperçu/confirmation, attribution, rechargement, retrait,
  audit, conflit conservant le motif, bureau/mobile sombre ; JASPE refuse un
  droit retiré dans une session déjà ouverte. Aucun appel fournisseur nécessaire.
- 76 tests serveur, 38 contrôles statiques, typecheck, QA A1/A2 et contrats JASPE/
  visuel PASS. Protocole : `scripts/test-access-postgres.mjs`, puis
  `node --import tsx scripts/qa-access-mutations-live.mjs`, avec URL locale de test
  explicite ; nouvelle base vide exigée par le runner. Aucune production validée.
