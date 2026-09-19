# SchoolSafe pour Bolt — proposition locale du 19 septembre 2026

## Statut courant — validation expérimentale reçue

Le propriétaire valide `bolt/workspace` comme **branche expérimentale Bolt** et
autorise sa publication seule. Les 54 retraits ont été revérifiés ; le push reste
suspendu car la CLI GitHub n'est pas authentifiée et aucun navigateur disponible
ne permet de vérifier les automatismes distants. Aucun déploiement autorisé.
`develop/codex-base` et `main` ne doivent pas être modifiés.

**Première tâche Bolt : bug PNG `CanvasGradient`**, conservé sans correction.
Reproduire avec `node scripts/qa-bolt-runtime.mjs app/qa-bolt-cards.cjs`, corriger
la cause de `addColorStop` non fini dans un lot séparé, puis valider les quatre
faces PNG HD, dimensions, QR et permissions. Voir le handoff pour la reprise.

## Historique — proposition avant validation

Branche : `bolt/workspace`. Base locale et distante vérifiée :
`develop/codex-base`, `7d5cc89924319eb9c46d8a5a9cd0f3f729743834`.
**Aucun push avant validation. Aucun commit, déploiement ou accès VPS dans ce lot.**

La base stable comprend 772 fichiers, 117 400 243 octets (111,96 Mio).
54 chemins sont retirés de la copie Bolt : 26 725 477 octets (25,49 Mio).
L'arbre proposé comprend **734 fichiers**, environ **86,6 Mio**, preuves et documents compris, soit
environ **22,7 % de moins**. La liste exacte est [files.txt](files.txt) ; sommer
la taille des fichiers de cette liste permet de reproduire la mesure sans inclure
`.git`, dépendances installées, caches ou captures de test. Ce gain ne réduit pas
l'historique Git : aucun historique réécrit, aucun engagement sur le temps d'import
Bolt, qui n'a pas été mesuré.

- [54 retraits, tailles, raisons et récupération](removed-files.md).
- [Manifeste des retraits avec SHA-256](removed-files.json).
- [Preuves avant/après et limites](PROOFS.md).
- [Reprise active](../CURRENT_HANDOFF.md).
- [Plan Control séparé](../CONTROL_EXTRACTION_PLAN.md) et [usage des images](../IMAGE_USAGE.md).

## Conservation

JASPE conserve ses 33 clés de pose v12, sept portraits originaux, 21 WebP de
secours, 14 planches assises, son fallback adossé, moteur, gestes, interface,
gouvernance, permissions, intégrations et voix existantes. Deux PNG identiques
sont dédupliqués : la clé logique `images/chin2.png` pointe maintenant sur le
même contenu sous `../originals/chin1.png` ; la clé accentuée des paupières reste
résolue par `eyelids-closed.png`. Le changement de cache évite de réutiliser
un ancien manifeste qui appellerait le fichier retiré.

L'usine de cartes reste intégrale : 60 illustrations, rendu recto/verso badge
et PVC, QR local, bibliothèque et code PNG HD, ZIP/manifestes, API, base,
permissions, contrat Control et tests. **Le code conservé ne signifie pas que
tout fonctionne : l'export PNG échoue déjà sur la base**, voir les preuves.

Auth, ACCESS_LAW, `school_id`, tout `server/src`, SQL et migrations sont inchangés.
Les 126 fichiers de tests/QA existants restent présents. Aucun test actif retiré.
Les quatre ressources utiles sorties de l'archive sont relogées : scanner et
revues des littéraux dans `scripts/`, notes Control/images dans `docs/`.

## Limites et exclusion des fichiers locaux

Les 14 exclusions de la base restent hors sélection (liste dans `removed-files.json`),
dont les six portraits sans provenance établie, réglages privés, journal et notes
sensibles. Aucun secret ni fichier de données d'école n'est ajouté. Les preuves
graphiques locales et la jonction temporaire de dépendances ne sont pas sélectionnées.
Un `debug.log` local apparu pendant les QA reste ignoré, non lu et hors manifeste.
Le scan final des 734 fichiers (595 textuels, 139 binaires) ne détecte aucun
motif sensible ni candidat non examiné ; 18 littéraux de test déjà revus restent
identifiés par empreinte. C'est un contrôle par motifs, pas une certification exhaustive.

Restent ouverts : export PNG, deux alertes statiques DeviceHub/isolation,
défauts SQL d'installation, qualification Docker réelle et intégrations externes.
Ni toute l'application ni la production ne sont validées. Les anciennes références
documentaires aux fichiers retirés servent à la provenance ; leur contenu reste
consultable au commit stable par les liens du manifeste. Ne pas les recréer pour
faire disparaître un lien historique.

Prochaine étape : revue et validation du propriétaire avant toute publication
de cette branche. Ensuite seulement, vérifier le distant et l'absence de
déploiement automatique avant un éventuel push explicitement autorisé.
