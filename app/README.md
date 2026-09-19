# SchoolSafe V2 - Prévisualisation locale

Première étape visible de la nouvelle application SchoolSafe.

- espace totalement séparé de l'application actuellement publiée;
- aucune connexion au VPS, à Supabase ou à une base de données;
- accueil bleu et médias SchoolSafe existants conservés;
- connexion par e-mail ou téléphone;
- assistant de configuration mono-école;
- activation des fonctions selon les cycles;
- production de cartes déclarée comme patrimoine intangible.
- PWA installable avec cache hors connexion et file locale priorisée;
- panneau de synchronisation visible sur ordinateur et téléphone;
- confirmation locale de démonstration, sans connecteur serveur.
- interface français/anglais avec choix persistant;
- PDF français, anglais ou bilingues avec signalement des traductions absentes.

Ouvrir `index.html` dans un navigateur. Les données du formulaire restent uniquement
dans le stockage local du navigateur.

Tests:

- `qa-smoke.cjs` vérifie les parcours fonctionnels existants;
- `qa-pwa.cjs` vérifie le cache hors connexion, les priorités, la reprise, le reçu
  après confirmation et l'affichage mobile.
- `qa-i18n.cjs` vérifie la traduction dynamique, la persistance, le retour au
  français, le PDF anglais et l'affichage mobile.

## Démarrage permanent

Depuis PowerShell, dans ce dossier `app` :

```powershell
powershell -ExecutionPolicy Bypass -File .\start-schoolsafe.ps1
```

Ouvrir ensuite <http://127.0.0.1:4175/>. Le lanceur utilise uniquement l'adresse
locale, empêche une seconde instance et enregistre son PID ainsi que ses journaux
dans le dossier temporaire Windows `SchoolSafeV2`, hors du chemin OneDrive.

Contrôler l'état du serveur :

```powershell
powershell -ExecutionPolicy Bypass -File .\check-schoolsafe.ps1
```

Arrêter uniquement le serveur lancé par ce dossier :

```powershell
$schoolSafePid = Get-Content (Join-Path ([System.IO.Path]::GetTempPath()) "SchoolSafeV2\server-4175.pid")
Stop-Process -Id $schoolSafePid
```

Le lanceur n'arrête jamais automatiquement un processus qui occupe déjà le port
4175. Il signale le conflit afin d'éviter d'interrompre une autre application.
