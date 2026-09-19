// Inventory only. No copy, deletion, Git mutation, network or database operation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const out = 'docs/migration/2026-09-19-base-stable';
const git = (...args) => cp.execFileSync('git', args, {encoding:'utf8', maxBuffer:16*1024*1024});
const tracked = git('ls-files','-z').split('\0').filter(Boolean).sort();
const trackedSet = new Set(tracked);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const posix = path.posix;
const text = p => fs.readFileSync(p,'utf8');
const sourceCommit = git('rev-parse','HEAD').trim();
if (sourceCommit !== '841d3efc54e7af62250b2980e450aa20ba5f2d40') throw Error('Source changed: review inventory before regeneration.');
const inventory=[], containers=[], edges=[], missing=[], dynamicReferences=[], checks=[];
const notRead = p => p.startsWith('.claude/') || /(?:^|\/)(?:\.env(?:\.|$)|credentials\.json$|secrets\.json$|settings\.local\.json$)|\.(?:pem|key|p12|pfx|log)$/.test(p) || p.endsWith('/SECRETS_APPLICATION.md');
function collect(dir='') {
  for (const e of fs.readdirSync(dir||'.',{withFileTypes:true})) {
    const p=(dir?dir+'/':'')+e.name;
    if(p===out) continue;
    if(e.isSymbolicLink()) { containers.push({path:p,status:'À REVOIR',action:'NE_PAS_SUIVRE_LE_LIEN'});continue; }
    if(e.isDirectory()) {
      if(['.git','.worktrees','node_modules'].includes(e.name)) {
        containers.push({path:p,status:e.name==='node_modules'?'OBSOLÈTE':e.name==='.git'?'ARCHIVÉ':'À REVOIR',
          action:e.name==='node_modules'?'RECREER_DEPUIS_LOCKFILES':e.name==='.git'?'GARDER_HISTORIQUE_SOURCE_SANS_COPIER_DANS_NOUVEAU_GIT':'REVOIR_SEPAREMENT_SANS_FUSION'});
      } else collect(p);
    } else inventory.push(p);
  }
}
collect();
const special = new Map([
 ['app/vendor/test-write.txt',['OBSOLÈTE','NE_PAS_IMPORTER','Sonde écriture : texte test ; aucune référence source trouvée.']],
 ['app/vendor/write-test.txt',['OBSOLÈTE','NE_PAS_IMPORTER','Sonde écriture : texte test ; aucune référence source trouvée.']],
 ['AGENTS.md',['À REVOIR','COPIER_IDENTIQUE','Conserver les consignes ; contradiction Docker avec DECISIONS à annoter dans un lot séparé.']],
 ['docs/PROJECT_CONTEXT.md',['À REVOIR','COPIER_IDENTIQUE','Document obligatoire ; anciennes prochaines actions remplacées par le handoff courant.']],
 ['Dockerfile',['À REVOIR','COPIER_IDENTIQUE','Recette Docker/Coolify conservée ; chemins app/shared à qualifier avant build stable.']],
 ['.dockerignore',['À REVOIR','COPIER_IDENTIQUE','shared/ exclu alors que le catalogue est nécessaire ; ne pas modifier ici.']],
 ['package.json',['À REVOIR','COPIER_IDENTIQUE','Plusieurs scripts pointent vers des sources absentes de cet arbre ; liste dans README.']],
 ['database/projections/v1/02_student_list.sql',['À REVOIR','COPIER_IDENTIQUE','SQL utile hors manifeste projections ; ne pas perdre ni appliquer arbitrairement.']],
 ['database/setup/v1/01_setup_native.sql',['À REVOIR','COPIER_IDENTIQUE','SQL setup hors des douze ensembles contrôlés ; ordre/installateur à qualifier.']],
 ['app/modules/cards/cards-module.js',['À REVOIR','COPIER_IDENTIQUE','Usine obligatoire ; dépend encore de /school/info legacy pour identité école.']],
 ['app/modules/jaspe2d/jaspe2d.js',['À REVOIR','COPIER_IDENTIQUE','Moteur obligatoire ; chat lit data.reply alors que route renvoie data.data.reply ; dashboard local distinct.']],
 ['server/src/cardsnative/service.ts',['À REVOIR','COPIER_IDENTIQUE','Usine obligatoire ; dépendances R2/Control et comportement sans configuration à qualifier.']],
 ['server/src/cardsnative/batches.ts',['À REVOIR','COPIER_IDENTIQUE','ZIP/manifeste obligatoires ; aucune preuve E2E R2/Control exécutée dans cet inventaire.']],
 ['worker-jaspe/wrangler.toml',['À REVOIR','COPIER_IDENTIQUE','Configuration existante conservée sans modification ; environnement cible à qualifier hors secrets.']],
 ['database/baseline/v1/review/SECRETS_APPLICATION.md',['À REVOIR','REVUE_PRIVEE_AVANT_IMPORT','Nom potentiellement sensible : contenu non lu ; ne pas importer automatiquement.']],
 ['database/devicehub/v1/02_devicehub_rpc.sql',['À REVOIR','COPIER_IDENTIQUE','Deux occurrences de permission non canonique préexistantes, hors mission.']],
]);
for(const p of ['database/cards/v1/03_cards_lifecycle.sql','database/devicehub/v1/03_attendance.sql',
  'database/family/v1/01_pickup_authorizations.sql','database/family/v1/02_primary_transfer.sql',
  'database/family/v1/03_pickup_confirmation.sql','database/family/v1/04_student_import.sql'])
  special.set(p,['À REVOIR','COPIER_IDENTIQUE','Fichier signalé par le contrôle statique inter-écoles préexistant ; conserver code et tests.']);
const duplicateRefs = {
 'ChatGPT Image 13 sept. 2026, 08_02_07 (1).png':'docs/design/references/schoolsafe-mobile-2026-09-13.png',
 'ChatGPT Image 13 sept. 2026, 08_03_44.png':'docs/design/references/schoolsafe-desktop-2026-09-13.png'
};
function resolveLocal(from,spec,mode='import') {
  const clean=spec.split(/[?#]/)[0];
  if(/^(?:[a-z]+:|\/\/|#)/i.test(clean)) return null;
  let target=clean.startsWith('/')?'app/'+clean.slice(1):posix.normalize(posix.join(mode==='page'?'app':posix.dirname(from),clean));
  if(clean==='/shared/permissions.json'||target==='app/shared/permissions.json')target='shared/permissions.json';
  const candidates=[target,target.replace(/\.js$/,'.ts'),target+'.ts',target+'.js',target+'/index.ts'];
  return candidates.find(p=>fs.existsSync(p)&&fs.statSync(p).isFile())||target;
}
function addEdge(from,to,kind,line) {
 if(!to)return;
 if(to.includes('${')) { dynamicReferences.push({from,pattern:to,kind,line,resolution:'Patrimoine validé séparément depuis card-data.js ; conserver le test visuel.'});return; }
 if(fs.existsSync(to)&&fs.statSync(to).isDirectory()) { dynamicReferences.push({from,pattern:to,kind,line,resolution:'Lien vers un répertoire existant, non un fichier manquant.'});return; }
 const exists=fs.existsSync(to)&&fs.statSync(to).isFile();
 edges.push({from,to,kind,line,exists});
 if(!exists)missing.push({from,to,kind,line});
}
const sourceFiles=tracked.filter(p=>/\.(?:[cm]?js|ts|html|css)$/.test(p)&&!p.includes('/vendor/')&&!/\.min\.js$/.test(p));
for(const probe of ['test-write.txt','write-test.txt']) {
 const refs=sourceFiles.filter(p=>text(p).includes(probe));
 checks.push({check:'write-probe-source-references',file:'app/vendor/'+probe,references:refs});
 if(refs.length)throw Error('Probe is referenced; review its classification: '+probe);
}
for(const p of sourceFiles) {
 const s=text(p);
 if(/\.(?:[cm]?js|ts)$/.test(p)){
  const sf=ts.createSourceFile(p,s,ts.ScriptTarget.Latest,true);
  function visit(n){
   let spec=null,kind=null;
   if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){
    spec=n.moduleSpecifier.text;kind='import';
   } else if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(n.expression)&&n.expression.text==='require'))&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])){
    spec=n.arguments[0].text;kind='dynamic-import-or-require';
   } else if(ts.isNewExpression(n)&&n.expression.getText(sf)==='URL'&&n.arguments?.length>=2&&ts.isStringLiteral(n.arguments[0])&&n.arguments[1].getText(sf)==='import.meta.url'&&!n.arguments[0].text.endsWith('/')){
    spec=n.arguments[0].text;kind='module-url';
   }
   if(spec&&(spec.startsWith('.')||spec.startsWith('/')))addEdge(p,resolveLocal(p,spec),kind,sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1);
   ts.forEachChild(n,visit);
  } visit(sf);
 }
 if(p.endsWith('.html'))for(const m of s.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)){
  const spec=m[1];if(!spec.startsWith('.')&&!spec.startsWith('/')&&!/^[\w-]+(?:\.|\/)/.test(spec))continue;
  if(/^[a-z]+:|^\/\//i.test(spec))continue;
  addEdge(p,resolveLocal(p,spec),'html-reference',s.slice(0,m.index).split('\n').length);
 }
 if(p.endsWith('.css'))for(const m of s.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)){
  if(/^data:|^https?:|^#/.test(m[1]))continue;
  addEdge(p,resolveLocal(p,m[1]),'css-url',s.slice(0,m.index).split('\n').length);
 }
}
// Dynamic assets: manifests are the authority, not the apparent legacy filenames in pose keys.
for(const p of ['app/assets/jaspe2d/v12/manifest.json','app/assets/jaspe2d/jaspe2d-manifest.json','app/assets/jaspe2d/assise-v1/manifest.json','app/assets/jaspe2d/originals/manifest.json']){
 const m=JSON.parse(text(p));
 const entries=m.packs?Object.values(m.packs).flatMap(Object.values):m.poses?Object.values(m.poses):Array.isArray(m.files)?m.files:Object.values(m.files);
 let passed=0;
 for(const e of entries){
  const target=resolveLocal(p,e.url||e.file);addEdge(p,target,'asset-manifest',null);
  if(fs.existsSync(target)&&(!e.sha256||sha(fs.readFileSync(target))===e.sha256))passed++;
 }
 checks.push({check:'asset-manifest-sha256',file:p,total:entries.length,passed});
}
const dataFile='app/modules/cards/assets/card-data.js';
const patRefs=[...text(dataFile).matchAll(/value:\s*['"]((?:rdc|aqua|min|terre|ois)-[^'"]+)['"]/g)];
for(const m of patRefs)addEdge(dataFile,'app/modules/cards/assets/patrimoine/'+m[1]+'.png','dynamic-patrimoine',text(dataFile).slice(0,m.index).split('\n').length);
checks.push({check:'card-patrimoine',total:patRefs.length,passed:patRefs.filter(m=>fs.existsSync('app/modules/cards/assets/patrimoine/'+m[1]+'.png')).length});
const migrations=[];
for(const p of tracked.filter(p=>p.startsWith('database/')&&p.endsWith('/manifest.json'))){
 const m=JSON.parse(text(p));for(const u of m.units||[]){
  const target=posix.join(posix.dirname(p),u.file);
  addEdge(p,target,'sql-manifest',null);
  migrations.push({manifest:p,order:u.order,file:target,sha256:u.sha256});
 }
}
const bundles={
 cards:tracked.filter(p=>/^(?:app\/modules\/cards\/|server\/src\/(?:cards\/|cardsnative\/|controlprintnative\/|control-app\/|storage\/)|database\/cards\/)/.test(p)||['app/docs/CARDS_IMMUTABILITY.md','server/tests/cards.test.ts','server/tests/cardsnative-access.test.ts','server/tests/control-authority.test.ts','app/modules/school/student-card-preparation-demo.js','app/styles/modules/student-card-preparation.css'].includes(p)),
 jaspe:tracked.filter(p=>/^(?:app\/(?:modules\/jaspe2d\/|assets\/jaspe2d\/|assets\/connexion-controle\/|modules\/safe\/)|server\/src\/jaspenative\/|worker-jaspe\/|docs\/design\/jaspe-)/.test(p)||/jaspe|safe-assistant/.test(p)),
 foundation:tracked.filter(p=>/^(?:shared\/|database\/(?:baseline|auth|access|projections|license|trial)\/|server\/src\/(?:auth|authnative|db|access|accessnative|sessionnative|licensenative|http)\/|app\/modules\/(?:core|authnative|administration)\/)/.test(p))
};
const sharedRuntime=['app/index.html','app/app.js','app/server.mjs','app/sw.js','app/sw-register.js','app/manifest.webmanifest','server/src/index.ts','server/src/native-app.ts','server/src/app.ts','server/src/config/env.ts','package.json','package-lock.json','server/package.json','server/package-lock.json','server/tsconfig.json','shared/permissions.json'];
const globalIntegrations=tracked.filter(p=>/^(?:app\/modules\/(?:document-center|document-engine|communication|parent|pedagogy|security|hr|inventory|reports|accounting|finance|school)\/|app\/styles\/|app\/assets\/fonts\/|server\/src\/(?:studentsnative|pedagogynative|school)\/|database\/)/.test(p));
function close(seeds){const result=new Set(seeds);let n=0;while(n!==result.size){n=result.size;for(const e of edges)if(result.has(e.from)&&e.exists&&trackedSet.has(e.to))result.add(e.to);}return [...result].sort();}
for(const key of ['cards','jaspe'])bundles[key]=close([...bundles[key],...sharedRuntime,...bundles.foundation,...globalIntegrations,...tracked.filter(p=>p.startsWith('app/vendor/')&&!p.endsWith('-write.txt')&&!p.endsWith('write-test.txt')), 'app/schoolsafe-logo.png']);
bundles.foundation=close([...bundles.foundation,...sharedRuntime]);
const rows=inventory.sort().map(p=>{
 const trackedFile=trackedSet.has(p);
 let status='CONSERVÉ',action='COPIER_IDENTIQUE',reason='Source actuelle, dépendance, asset, test ou document : préserver son chemin et son contenu.';
 if(p.startsWith('docs/design/jaspe-assise-v1/')||p.startsWith('docs/design/jaspe-cartable-v1/')||p.startsWith('docs/design/jaspe-sans-table-v1/')){status='ARCHIVÉ';reason='Référence/provenance visuelle : conserver au même chemin, sans intégrer une image non validée au produit.';}
 if(special.has(p))[status,action,reason]=special.get(p);
 if(!trackedFile){status='À REVOIR';action='NE_PAS_IMPORTER_AUTOMATIQUEMENT';reason='Fichier local hors versionnement : propriété/contenu à valider séparément.';}
 if(duplicateRefs[p]){status='ARCHIVÉ';action='DEJA_COUVERT_PAR_COPIE_IDENTIQUE';reason='Doublon SHA-256 de '+duplicateRefs[p]+' ; original local préservé.';}
 if(notRead(p)){status='À REVOIR';action='REVUE_PRIVEE_AVANT_IMPORT';reason='Contenu potentiellement sensible non consulté ; exclu de tout import automatique.';}
 const b=notRead(p)?null:fs.readFileSync(p);
 return {path:p,status,action,destination:action==='COPIER_IDENTIQUE'?p:null,tracked:trackedFile,bytes:fs.statSync(p).size,sha256:b?sha(b):null,contentRead:!notRead(p),components:Object.entries(bundles).filter(([,v])=>v.includes(p)).map(([k])=>k),reason};
});
for(const f of tracked)if(!inventory.includes(f))throw Error('Tracked file absent from inventory: '+f);
const counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;

const reviewArbitrations = [
  {
    "path": ".claude/launch.json",
    "role": "Lancement local de l’assistant, d’après son nom ; contenu non lu.",
    "why": "Réglage du poste, non nécessaire au produit et non inspecté.",
    "proposedDestination": "EXCLURE",
    "riskKeep": "Importer des chemins, commandes ou paramètres locaux inadaptés.",
    "riskDiscard": "Perdre une commodité de lancement local ; aucun code produit perdu."
  },
  {
    "path": ".claude/settings.local.json",
    "role": "Réglages personnels de l’assistant ; contenu non lu.",
    "why": "Configuration locale potentiellement sensible ou permissive.",
    "proposedDestination": "EXCLURE",
    "riskKeep": "Transférer des autorisations ou paramètres privés du poste.",
    "riskDiscard": "Devoir reconfigurer l’assistant sur le nouveau poste."
  },
  {
    "path": ".dockerignore",
    "role": "Filtre du contexte de construction Docker.",
    "why": "Exclut shared/ alors que le catalogue de permissions est nécessaire.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Conserver un conditionnement incomplet tant que le filtre n’est pas corrigé.",
    "riskDiscard": "Élargir involontairement le contexte envoyé au build et perdre ses exclusions."
  },
  {
    "path": "AGENTS.md",
    "role": "Consignes communes de travail et de continuité.",
    "why": "Ancienne interdiction Docker contradictoire avec les décisions plus récentes.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Un agent pourrait suivre une consigne historique devenue obsolète.",
    "riskDiscard": "Perdre les règles de continuité, de sécurité et de coordination."
  },
  {
    "path": "Dockerfile",
    "role": "Construction et démarrage du serveur avec le frontend.",
    "why": "Chemins app/shared à aligner avec le serveur avant exploitation.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Image potentiellement non fonctionnelle ; aucun build validé ici.",
    "riskDiscard": "Perdre la recette existante Docker/Coolify et sa reproductibilité."
  },
  {
    "path": "app/modules/cards/cards-module.js",
    "role": "Studio de génération et de soumission des cartes.",
    "why": "Lit encore /school/info, dépendance legacy non assemblée dans le serveur natif.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Identité/logo de l’école incomplets dans certains parcours.",
    "riskDiscard": "Casser l’usine de cartes, ses aperçus et ses commandes."
  },
  {
    "path": "app/modules/jaspe2d/jaspe2d.js",
    "role": "Moteur JASPE, images de repli et helper de chat.",
    "why": "Le helper lit reply à la racine ; la route native renvoie data.reply.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Réponse du relais distant mal interprétée ; dashboard local distinct.",
    "riskDiscard": "Perdre le moteur et ses replis, affectant auth et dashboard."
  },
  {
    "path": "database/baseline/v1/review/SECRETS_APPLICATION.md",
    "role": "Document relatif à l’application des secrets, d’après son titre ; contenu non lu.",
    "why": "Contenu non inspecté : aucune inclusion automatique dans un dépôt.",
    "proposedDestination": "EXCLURE",
    "riskKeep": "Publier une procédure privée ou des valeurs sensibles éventuelles.",
    "riskDiscard": "Omettre une procédure utile ; prévoir une version assainie après revue privée."
  },
  {
    "path": "database/cards/v1/03_cards_lifecycle.sql",
    "role": "Perte, remplacement, réimpression et distribution des cartes.",
    "why": "Trois détections du contrôle statique inter-écoles préexistant.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Conserver des points d’isolation à qualifier avant exploitation.",
    "riskDiscard": "Supprimer une partie obligatoire du cycle de vie des cartes."
  },
  {
    "path": "database/devicehub/v1/02_devicehub_rpc.sql",
    "role": "RPC d’administration et d’utilisation des terminaux.",
    "why": "Deux usages de school.settings.manage absents du catalogue canonique.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Échecs d’autorisation possibles ; contrôle statique toujours en échec.",
    "riskDiscard": "Casser les routes Device Hub et les dépendances SQL existantes."
  },
  {
    "path": "database/devicehub/v1/03_attendance.sql",
    "role": "Enregistrement et application des présences.",
    "why": "Deux détections du contrôle statique inter-écoles préexistant.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Conserver des points d’isolation à qualifier.",
    "riskDiscard": "Perdre le schéma/RPC de présence et rompre les dépendances."
  },
  {
    "path": "database/family/v1/01_pickup_authorizations.sql",
    "role": "Demande, validation, révocation et liste des autorisations de remise.",
    "why": "Quatre détections du contrôle statique inter-écoles préexistant.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Conserver des points sensibles de remise d’enfant à qualifier.",
    "riskDiscard": "Perdre les autorisations de remise et leurs contrôles."
  },
  {
    "path": "database/family/v1/02_primary_transfer.sql",
    "role": "Transfert du responsable principal de l’enfant.",
    "why": "Deux détections du contrôle statique inter-écoles préexistant.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Conserver des points d’isolation à qualifier.",
    "riskDiscard": "Perdre le transfert contrôlé et sa traçabilité."
  },
  {
    "path": "database/family/v1/03_pickup_confirmation.sql",
    "role": "Confirmation de remise physique de l’enfant.",
    "why": "Une détection du contrôle statique inter-écoles préexistant.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Conserver un point critique de remise à qualifier.",
    "riskDiscard": "Perdre la confirmation serveur et les contrôles associés."
  },
  {
    "path": "database/family/v1/04_student_import.sql",
    "role": "Préparation, aperçu et validation des imports d’élèves.",
    "why": "Huit détections du contrôle statique inter-écoles préexistant.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Conserver des points d’isolation des imports à qualifier.",
    "riskDiscard": "Perdre le parcours d’import existant et son schéma."
  },
  {
    "path": "database/projections/v1/02_student_list.sql",
    "role": "Liste d’élèves et création de brouillons.",
    "why": "Fichier SQL absent du manifeste des projections.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Omission possible lors d’une installation ; ordre à qualifier.",
    "riskDiscard": "Perdre les RPC utiles aux parcours élèves et cartes."
  },
  {
    "path": "database/setup/v1/01_setup_native.sql",
    "role": "Création initiale de l’école et de son administrateur.",
    "why": "Unité hors des douze ensembles contrôlés par les manifestes.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Installation initiale incomplète ou mal ordonnée.",
    "riskDiscard": "Perdre le parcours natif d’initialisation."
  },
  {
    "path": "debug.log",
    "role": "Journal local ; contenu non lu.",
    "why": "Peut contenir traces, chemins, jetons ou données privées.",
    "proposedDestination": "EXCLURE",
    "riskKeep": "Divulguer des informations du poste ou des requêtes.",
    "riskDiscard": "Perdre une trace locale de diagnostic, pas une dépendance produit."
  },
  {
    "path": "docs/PROJECT_CONTEXT.md",
    "role": "Contexte durable obligatoire du projet.",
    "why": "Contient d’anciennes prochaines actions remplacées par le handoff.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Mauvaise priorité de reprise si l’historique est lu comme actif.",
    "riskDiscard": "Perdre le contexte, les invariants et un document obligatoire."
  },
  {
    "path": "package.json",
    "role": "Workspaces, dépendances et commandes du projet.",
    "why": "Certaines commandes pointent vers des fichiers/répertoires absents.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Ces commandes restent inexécutables jusqu’à clarification.",
    "riskDiscard": "Perdre les dépendances, commandes de contrôle et la structure du workspace."
  },
  {
    "path": "server/src/cardsnative/batches.ts",
    "role": "Production des ZIP, manifestes et notification de Control.",
    "why": "Aucune recette complète R2 → ZIP → Control dans cet inventaire.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Parcours externe encore à qualifier ; ne pas le déclarer validé.",
    "riskDiscard": "Supprimer les ZIP et manifestes exigés de l’usine."
  },
  {
    "path": "server/src/cardsnative/service.ts",
    "role": "Demandes, images R2, transmission et cycle de vie des cartes.",
    "why": "Comportement sans R2/Control à qualifier ; submitted peut être trompeur.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Afficher une soumission réussie sans transmission effective.",
    "riskDiscard": "Supprimer l’API métier nécessaire à l’usine de cartes."
  },
  {
    "path": "worker-jaspe/wrangler.toml",
    "role": "Configuration du Worker JASPE existant.",
    "why": "Paramètres liés à l’environnement ; reproductibilité à qualifier.",
    "proposedDestination": "SCHOOLSAFE",
    "riskKeep": "Réutiliser des réglages d’une autre instance sans vérification.",
    "riskDiscard": "Perdre la configuration du relais JASPE ; aucune modification fournisseur demandée."
  }
];

const destinationCounts={SCHOOLSAFE:0,CONTROL:0,ARCHIVE:0,EXCLURE:0};
for(const row of rows){
 row.proposedDestination=row.action!=='COPIER_IDENTIQUE'?'EXCLURE':row.status==='ARCHIVÉ'?'ARCHIVE':'SCHOOLSAFE';
 destinationCounts[row.proposedDestination]++;
 row.arbitration=reviewArbitrations.find(item=>item.path===row.path)||null;
 if(row.arbitration&&row.arbitration.proposedDestination!==row.proposedDestination)throw Error('Arbitration mismatch: '+row.path);
}
if(reviewArbitrations.length!==rows.filter(row=>row.status==='À REVOIR').length)throw Error('Review coverage mismatch');
const branch='work/canonical-access-law',branchSha=git('rev-parse',branch).trim();
const branchChanges=git('diff','--name-status','--no-renames','-z',sourceCommit,branch).split('\0').filter(Boolean);
const worktreeRows=[];
for(let i=0;i<branchChanges.length;i+=2){
 const status=branchChanges[i],p=branchChanges[i+1];
 worktreeRows.push({path:p,comparison:status,classification:'À REVOIR',mainExists:status!=='A',worktreeExists:status!=='D',action:status==='D'?'CONSERVER_VERSION_MAIN':'COMPARER_SANS_ECRASER_MAIN',branchSha});
}
worktreeRows.push({path:'docs/superpowers/plans/2026-09-13-canonical-final-review-fixes.md',comparison:'LOCAL_NON_SUIVI',classification:'À REVOIR',mainExists:false,worktreeExists:true,action:'PRESERVER_LOCAL_ET_EXAMINER_SEPAREMENT',branchSha});
const artifacts=['README.md','files.json','files.csv','dependencies.json','worktree-review.csv','generate-manifest.mjs'].map(f=>out+'/'+f);
const dependencies={method:'Imports TypeScript/JavaScript analysés avec TypeScript local, références HTML/CSS, manifestes assets/SQL et ensembles globaux conservateurs. Les dépendances dynamiques métier sont explicitées dans README ; ceci ne prouve pas leur exécution.',bundles,edges,dynamicReferences,unresolvedStaticReferences:missing,assetChecks:checks,sqlUnits:migrations,
 packages:Object.fromEntries(['package.json','server/package.json','worker-jaspe/package.json'].map(p=>{const m=JSON.parse(text(p));return [p,{dependencies:m.dependencies||{},devDependencies:m.devDependencies||{},engines:m.engines||{},workspaces:m.workspaces||[]}];})),
 externalServices:['PostgreSQL et rôles schoolsafe_auth/schoolsafe_api/schoolsafe_owner','R2/S3 privé : PNG et ZIP hors Git','SchoolSafe Control externe : endpoints et signatures existants','Cloudflare Worker JASPE et fournisseur déjà configuré ; aucun appel ici','Web Speech du navigateur : microphone autorisé explicitement et synthèse vocale']};
const result={schema:1,generatedAt:new Date().toISOString(),sourceBranch:'main',sourceCommit,
 remoteObserved:{branch:'main',sha:'62df2b16ceca2e609c1789eba44afbe6fe278e19',date:'2026-09-19',method:'git ls-remote --heads origin main',pushed:false},
 scope:'Arbre courant hors .git/node_modules/worktree distinct ; fichiers ignorés non générés inventoriés sans lire les fichiers sensibles.',
 workingTreeChanges:git('diff','--name-only').trim().split('\n').filter(Boolean),
 counts:{tracked:tracked.length,untrackedOrIgnored:rows.filter(r=>!r.tracked).length,total:rows.length,statuses:counts,copyIdentical:rows.filter(r=>r.action==='COPIER_IDENTIQUE').length,proposedDestinations:destinationCounts,migrationDocumentsSeparate:artifacts.length},
 arbitrationStatus:'PROPOSITION EN ATTENTE DE VALIDATION ; aucune copie autorisée par ce manifeste ; revue de confidentialité encore à confirmer pour les contenus non couverts par le scan textuel.',
 policy:{noDeletion:true,noMigration:true,noPush:true,noDeployment:true,archives:'Copier au chemin existant si action COPIER_IDENTIQUE ; statut documentaire, aucune réactivation runtime.',review:'COPIER_IDENTIQUE préserve un code utile avec réserve ; REVUE_PRIVEE_AVANT_IMPORT reste exclu.',obsolete:'Exclusion proposée du futur import uniquement, aucun fichier local supprimé.',hashes:'SHA-256 des octets du fichier courant ; aucun hash/contenu de fichier potentiellement secret.'},
 mandatoryDocuments:['docs/PROJECT_CONTEXT.md','docs/DECISIONS.md','docs/CURRENT_HANDOFF.md','docs/superpowers/plans/2026-09-16-schoolsafe-functional-integration.md'],
 deliverablesToInclude:artifacts,excludedContainers:containers,files:rows};
fs.mkdirSync(out,{recursive:true});
const write=(name,data)=>fs.writeFileSync(out+'/'+name,data,'utf8');
const csv=(head,data)=>[head,...data].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
write('files.json',JSON.stringify(result,null,2)+'\n');
write('files.csv',csv(['path','status','action','destination','proposedDestination','tracked','bytes','sha256','components','reason','role','whyReview','riskKeep','riskDiscard'],rows.map(r=>[r.path,r.status,r.action,r.destination,r.proposedDestination,r.tracked,r.bytes,r.sha256,r.components.join('|'),r.reason,r.arbitration?.role,r.arbitration?.why,r.arbitration?.riskKeep,r.arbitration?.riskDiscard])));
write('dependencies.json',JSON.stringify(dependencies,null,2)+'\n');
write('worktree-review.csv',csv(['path','comparison','classification','mainExists','worktreeExists','action','branchSha'],worktreeRows.map(r=>[r.path,r.comparison,r.classification,r.mainExists,r.worktreeExists,r.action,r.branchSha])));
console.log(JSON.stringify({counts:result.counts,assetChecks:checks,sqlManifests:new Set(migrations.map(x=>x.manifest)).size,sqlUnits:migrations.length,dependencyEdges:edges.length,unresolved:missing,worktreeComparisons:worktreeRows.length,bundleSizes:Object.fromEntries(Object.entries(bundles).map(([k,v])=>[k,v.length]))},null,2));
