# Étape frontend EXETAT

Date de validation technique : 14 août 2026.

## Objectif

Ajouter l'EXETAT au module des épreuves certificatives sans confondre le suivi interne de l'école avec les responsabilités officielles de l'État.

## Parcours couvert

- dossiers et identification des candidats ;
- classe, option ou filière, type de cycle, numéro, centre et jury ;
- statut administratif de participation sans montant ni paiement en ligne ;
- dissertation ;
- épreuves techniques ;
- oraux de français et d'anglais ;
- pratique professionnelle ;
- transmission locale des copies techniques ;
- session ordinaire ;
- scannage et traitement par les services officiels ;
- publication officielle puis enregistrement de la source dans SchoolSafe ;
- simulations internes séparées du résultat national ;
- relevé PDF SchoolSafe explicitement non officiel dans la démonstration.

## Accès par profil

- Administrateur principal, Chef d'établissement et Responsable pédagogique : dossiers, étapes, préparation et résultats.
- Secrétaire scolaire : dossiers et étapes administratives.
- Enseignant : étapes et préparation de ses classes affectées.
- Parent : calendrier général et résultat de son enfant après publication et validation.

## Limites obligatoires

- SchoolSafe ne calcule pas le résultat national.
- SchoolSafe ne remplace pas le scannage, la correction ou la délibération officielle.
- SchoolSafe ne crée ni diplôme d'État ni relevé officiel.
- Les candidats et résultats présents dans le prototype sont fictifs.
- Les dates d'une nouvelle session doivent être confirmées à partir d'une source officielle avant configuration.
- Aucun accès VPS, Supabase, base de données, RLS ou migration n'a été effectué.
- Le moteur de production des cartes élèves n'a pas été modifié.

## Références officielles consultées

- https://edu-nc.gouv.cd/epreuves-certificatives
- https://edu-nc.gouv.cd/actualites/lancement-de-l-exetat-2026-plus-d-un-million-de-candidats-inscrits-au-cycle-long-dont-44-de-filles
- https://edu-nc.gouv.cd/actualites/examen-d-etat-2026-les-premiers-resultats-attendus-des-ce-weekend-annonce-l-inspecteur-general
- https://edu-nc.gouv.cd/actualites/exetat-2026-raissa-malu-salue-l-achevement-de-la-publication-des-resultats-en-seulement-treize-jours

## Vérifications locales

- validation de syntaxe avec `node --check app.js` ;
- ouverture de l'EXETAT depuis la branche Pédagogie ;
- présence des neuf étapes ;
- filtres par classe, option, centre et résultat ;
- export PDF de résultats ;
- contrôle sans débordement à 390 px ;
- captures ordinateur et téléphone.
