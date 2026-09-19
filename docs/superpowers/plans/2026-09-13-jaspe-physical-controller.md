# JASPE Physical Presentation Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unifier les réactions physiques de JASPE derrière un contrat d'intentions déterministe, avec v12 comme moteur principal et les images WebP comme repli sûr.

**Architecture:** Un module pur arbitre neuf intentions et commande deux adaptateurs injectés. `jaspe2d.js` fournit les adaptateurs navigateur et conserve le rendu WebP ; `live-companion.js` devient indépendant d'un écran particulier et possède un cycle de vie destructible. `app.js` envoie uniquement des intentions et ne connaît plus les références de packs pour déclencher une réaction.

**Tech Stack:** JavaScript navigateur sans dépendance, modules ES, Canvas/WebGL existants, API Node.js `node:test` et `node:assert` pour les tests ciblés.

**Spec:** `docs/superpowers/specs/2026-09-13-jaspe-physical-controller-design.md`

## Global Constraints

- JASPE conserve son identité visuelle verrouillée v12.
- La représentation reste 2D/2,5D ; aucune 3D ne doit être ajoutée.
- Le lot couvre seulement le visage, le regard, la tête, la respiration, les postures et les gestes du corps.
- La voix, GLM, la synchronisation labiale, le Worker Cloudflare et le VPS sont hors périmètre.
- L'assistant flottant de l'espace de travail ne doit pas être activé dans ce lot.
- Le moteur WebP existant reste le repli et les originaux graphiques ne sont ni supprimés ni convertis.
- Une défaillance visuelle ne doit jamais bloquer la connexion ou une fonction métier.
- Les tests restent ciblés sur le contrat, les priorités, le cycle de vie et le raccordement de la connexion.
- GitHub et le dépôt local doivent être identiques à la fin du lot validé.

## File Structure

- Create `app/modules/jaspe2d/presentation-controller.js`: définitions immuables des intentions, normalisation, arbitrage, minuterie et orchestration des adaptateurs.
- Create `app/qa-jaspe-presentation-controller.test.mjs`: tests Node purs du contrat et des priorités, sans DOM ni réseau.
- Modify `app/modules/jaspe2d/live-companion.js`: prédicats de surface injectés et cycle `play/stop/destroy/getState`.
- Create `app/qa-jaspe-physical-contract.cjs`: contrôle statique ciblé du cycle v12, du raccordement par intentions et de l'absence de voix/3D.
- Modify `app/modules/jaspe2d/jaspe2d.js`: adaptateur WebP, création du contrôleur, chargement v12 et handle `dispatch/destroy`.
- Modify `app/app.js`: remplacement des réactions par références de packs par des intentions.
- Modify `package.json`: commande unique `test:jaspe-physical` avec les deux contrôles ciblés.
- Modify `docs/CURRENT_HANDOFF.md`: preuves réellement exécutées, fichiers touchés, risques et prochaine action.

---

### Task 1: Contrat pur des intentions et arbitrage

**Files:**
- Create: `app/modules/jaspe2d/presentation-controller.js`
- Create: `app/qa-jaspe-presentation-controller.test.mjs`

**Interfaces:**
- Consumes: deux fabriques injectées `createPrimary(context)` et `createFallback(context)` ; chaque adaptateur produit `play(command)`, `stop()`, `destroy()` et `getState()`.
- Produces: `INTENT_DEFINITIONS`, `normalizeIntent(input)` et `createPresentationController(dependencies)` avec `mount`, `dispatch`, `stop`, `destroy`, `getState`.

- [ ] **Step 1: Écrire le test qui verrouille les neuf traductions**

Créer le début de `app/qa-jaspe-presentation-controller.test.mjs` :

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTENT_DEFINITIONS,
  normalizeIntent,
  createPresentationController,
} from './modules/jaspe2d/presentation-controller.js';

const expected = {
  idle: ['idle', 'IDLE', 0.35, 0],
  listen: ['attentive', 'LISTENING', 0.55, 20],
  think: ['deepThink', 'THINKING', 0.65, 30],
  speak: ['guide', 'SPEAKING', 0.60, 40],
  explain: ['guide', 'SPEAKING', 0.75, 40],
  reassure: ['attentive', 'IDLE', 0.45, 70],
  success: ['thumbsUp', 'CONGRATULATE', 0.80, 70],
  refuse: ['worried', 'ERROR', 0.65, 100],
  error: ['worried', 'ERROR', 0.75, 100],
};

test('les neuf intentions gardent leur contrat v12/WebP', () => {
  assert.deepEqual(Object.keys(INTENT_DEFINITIONS), Object.keys(expected));
  for (const [kind, values] of Object.entries(expected)) {
    const definition = INTENT_DEFINITIONS[kind];
    assert.deepEqual(
      [definition.action, definition.fallback, definition.intensity, definition.priority],
      values,
    );
  }
});

test('normalizeIntent rejette les entrées inconnues et borne les nombres', () => {
  assert.equal(normalizeIntent({ kind: 'dance' }), null);
  assert.equal(normalizeIntent(null), null);
  assert.deepEqual(normalizeIntent({ kind: 'think', intensity: 4, holdMs: 20_000, source: 42 }), {
    kind: 'think', action: 'deepThink', fallback: 'THINKING',
    intensity: 1, holdMs: 15_000, priority: 30, source: '42',
  });
});
```

- [ ] **Step 2: Exécuter le test pour constater l'absence du module**

Run: `node --test app/qa-jaspe-presentation-controller.test.mjs`

Expected: FAIL avec `ERR_MODULE_NOT_FOUND` pour `presentation-controller.js`.

- [ ] **Step 3: Implémenter les définitions et la normalisation**

Créer `app/modules/jaspe2d/presentation-controller.js` avec cette structure exacte :

```js
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const define=(action,fallback,intensity,priority,holdMs)=>Object.freeze({action,fallback,intensity,priority,holdMs});

export const INTENT_DEFINITIONS=Object.freeze({
  idle:define('idle','IDLE',.35,0,0),
  listen:define('attentive','LISTENING',.55,20,4000),
  think:define('deepThink','THINKING',.65,30,6000),
  speak:define('guide','SPEAKING',.60,40,4500),
  explain:define('guide','SPEAKING',.75,40,4500),
  reassure:define('attentive','IDLE',.45,70,4200),
  success:define('thumbsUp','CONGRATULATE',.80,70,3600),
  refuse:define('worried','ERROR',.65,100,4200),
  error:define('worried','ERROR',.75,100,4200),
});

export function normalizeIntent(input){
  if(!input||typeof input!=='object'||!Object.hasOwn(INTENT_DEFINITIONS,input.kind))return null;
  const definition=INTENT_DEFINITIONS[input.kind];
  const intensity=Number.isFinite(input.intensity)?clamp(input.intensity,0,1):definition.intensity;
  const holdMs=Number.isFinite(input.holdMs)?clamp(input.holdMs,0,15000):definition.holdMs;
  return {kind:input.kind,action:definition.action,fallback:definition.fallback,intensity,holdMs,
    priority:definition.priority,source:String(input.source||'application')};
}
```

- [ ] **Step 4: Ajouter les tests de priorité et de destruction avec des adaptateurs factices**

Ajouter au test :

```js
function harness(){
  const calls=[];
  const timers=[];
  const adapter=name=>({
    play(command){calls.push([name,'play',command]);return true;},
    stop(){calls.push([name,'stop']);return true;},
    destroy(){calls.push([name,'destroy']);},
    getState(){return {name};},
  });
  const controller=createPresentationController({
    createPrimary:async()=>adapter('primary'),
    createFallback:()=>adapter('fallback'),
    setTimer(fn){timers.push(fn);return timers.length;},
    clearTimer(){},
  });
  return {controller,calls,timers};
}

test('une alerte refuse idle et les intentions moins prioritaires', async()=>{
  const {controller,calls}=harness();
  await controller.mount({host:{},surface:'auth',isVisible:()=>true});
  assert.equal(controller.dispatch({kind:'refuse'}),true);
  assert.equal(controller.dispatch({kind:'idle'}),false);
  assert.equal(controller.dispatch({kind:'listen'}),false);
  assert.equal(controller.getState().current.kind,'refuse');
  assert.equal(calls.some(call=>call[1]==='play'&&call[2].action==='worried'),true);
});

test('destroy est idempotent et interdit les commandes suivantes', async()=>{
  const {controller,calls}=harness();
  await controller.mount({host:{},surface:'auth',isVisible:()=>true});
  controller.destroy();controller.destroy();
  assert.equal(controller.dispatch({kind:'success'}),false);
  assert.equal(calls.filter(call=>call[1]==='destroy').length,2);
});

test('un refus du moteur principal conserve le repli WebP', async()=>{
  const fallback={play(){return true;},stop(){return true;},destroy(){},getState(){return{};}};
  const primary={play(){return false;},stop(){return true;},destroy(){},getState(){return{};}};
  const controller=createPresentationController({createPrimary:async()=>primary,createFallback:()=>fallback});
  await controller.mount({host:{},surface:'auth',isVisible:()=>true});
  assert.equal(controller.getState().engine,'webp');
});
```

- [ ] **Step 5: Implémenter le contrôleur minimal**

Ajouter dans le module :

```js
const SURFACES=new Set(['auth','workspace-bust','workspace-avatar']);

export function createPresentationController({createPrimary,createFallback,setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let mounted=false,destroyed=false,primary=null,fallback=null,timer=0,sequence=0;
  let current=normalizeIntent({kind:'idle'}),queued=null;
  const snapshot=()=>({mounted,destroyed,current:{...current},queued:queued?{...queued}:null,
    engine:primary?'v12':fallback?'webp':'none'});
  const cancelTimer=()=>{if(timer){clearTimer(timer);timer=0;}};
  const scheduleIdle=intent=>{
    cancelTimer();
    if(!intent.holdMs||intent.kind==='idle')return;
    timer=setTimer(()=>{timer=0;finish(intent.sequence);},intent.holdMs);
  };
  const render=intent=>{
    const command={action:intent.action,fallback:intent.fallback,intensity:intent.intensity,source:intent.source};
    fallback?.play(command);
    const result=primary?.play(command);
    const abandonPrimary=()=>{
      if(destroyed||current.sequence!==intent.sequence)return;
      primary?.destroy?.();primary=null;fallback?.play(command);
    };
    if(result===false)abandonPrimary();
    else if(result&&typeof result.then==='function')result.then(ok=>{if(ok===false)abandonPrimary();}).catch(abandonPrimary);
    scheduleIdle(intent);
  };
  const finish=id=>{
    if(destroyed||current.sequence!==id)return;
    const next=queued;queued=null;
    current=next||{...normalizeIntent({kind:'idle'}),sequence:++sequence};
    render(current);
  };
  return {
    async mount({host,surface,isVisible=()=>true}={}){
      if(destroyed||mounted||!host||!SURFACES.has(surface)||typeof isVisible!=='function')return false;
      mounted=true;
      fallback=createFallback?.({host,surface,isVisible})||null;
      current={...current,sequence:++sequence};render(current);
      try{primary=await createPrimary?.({host,surface,isVisible})||null;}catch{primary=null;}
      if(destroyed){primary?.destroy?.();primary=null;return false;}
      if(primary)render(current);
      return true;
    },
    dispatch(input){
      if(!mounted||destroyed)return false;
      const normalized=normalizeIntent(input);if(!normalized)return false;
      const next={...normalized,sequence:++sequence};
      if(current.kind!=='idle'&&next.priority<current.priority){
        if(next.kind!=='idle'&&(!queued||next.priority>=queued.priority))queued=next;
        return false;
      }
      current=next;render(current);return true;
    },
    stop(reason='stop'){
      if(!mounted||destroyed)return false;
      cancelTimer();queued=null;primary?.stop?.(reason);fallback?.stop?.(reason);
      current={...normalizeIntent({kind:'idle',source:reason}),sequence:++sequence};render(current);return true;
    },
    destroy(){
      if(destroyed)return false;
      destroyed=true;mounted=false;cancelTimer();queued=null;
      primary?.destroy?.();fallback?.destroy?.();primary=null;fallback=null;return true;
    },
    getState:snapshot,
  };
}
```

- [ ] **Step 6: Exécuter les tests du contrôleur**

Run: `node --test app/qa-jaspe-presentation-controller.test.mjs`

Expected: PASS, cinq tests réussis et zéro échec.

- [ ] **Step 7: Committer le contrat pur**

```bash
git add app/modules/jaspe2d/presentation-controller.js app/qa-jaspe-presentation-controller.test.mjs
git commit -m "feat(jaspe): add physical intent controller"
```

---

### Task 2: Cycle de vie générique du moteur v12

**Files:**
- Modify: `app/modules/jaspe2d/live-companion.js:18-177`
- Create: `app/qa-jaspe-physical-contract.cjs`

**Interfaces:**
- Consumes: options `isVisible()`, `isTyping()`, `isBust()` et `activityTarget` fournies par la surface.
- Produces: handle v12 `{play(action, metadata), stop(), destroy(), getState()}` ; tous les appels deviennent inoffensifs après destruction.

- [ ] **Step 1: Écrire le contrôle de contrat v12 avant modification**

Créer `app/qa-jaspe-physical-contract.cjs` :

```js
const fs=require('node:fs');
const assert=require('node:assert/strict');
const live=fs.readFileSync('app/modules/jaspe2d/live-companion.js','utf8');
assert.ok(/isVisible/.test(live),'v12 doit recevoir isVisible');
assert.ok(/isTyping/.test(live),'v12 doit recevoir isTyping');
assert.ok(/isBust/.test(live),'v12 doit recevoir isBust');
assert.ok(/destroy\s*[:(]/.test(live),'le handle v12 doit exposer destroy');
assert.ok(/stop\s*[:(]/.test(live),'le handle v12 doit exposer stop');
assert.ok(!/closest\(['"]\.auth-screen/.test(live),'v12 ne doit plus dépendre de .auth-screen');
console.log('JASPE physical v12 contract: PASS');
```

- [ ] **Step 2: Exécuter le contrôle pour constater le contrat manquant**

Run: `node app/qa-jaspe-physical-contract.cjs`

Expected: FAIL sur `v12 doit recevoir isVisible`.

- [ ] **Step 3: Injecter les prédicats de surface et suivre les écouteurs**

Remplacer la signature et initialiser les dépendances dans `live-companion.js` :

```js
export async function mountLiveCompanion(box,host,{
  review=false,
  isVisible=()=>!document.hidden,
  isTyping=()=>false,
  isBust=()=>false,
  activityTarget=host,
}={}) {
  const bindings=[];
  const listen=(target,type,handler,options)=>{
    if(!target?.addEventListener)return;
    target.addEventListener(type,handler,options);
    bindings.push(()=>target.removeEventListener(type,handler,options));
  };
  let closed=false,closedEyes,renderer,body,last=0,lastDraw=0,frameId=0,failed=false,requestId=0,pendingAction=false;
```

Dans `tick`, remplacer le calcul lié à `auth` par :

```js
const visible=isVisible()&&!document.hidden;
if(!visible){last=0;return;}
const typing=isTyping();
const bust=isBust();
```

Remplacer les ajouts d'écouteurs directs par `listen(activityTarget, ...)`, `listen(reduced, 'change', ...)` et `listen(renderer.canvas, 'webglcontextlost', fail)`.

- [ ] **Step 4: Propager les métadonnées et ajouter stop/destroy**

Modifier `play` pour accepter `metadata={}` et appeler :

```js
controller.request(action,{...metadata,intensity:metadata.intensity??.9});
```

Construire le handle ainsi :

```js
const stop=()=>{
  if(closed)return false;
  ++requestId;pendingAction=false;
  controller.request('idle');controller.idleBlockedUntil=Infinity;dirty=true;
  return true;
};
const destroy=()=>{
  if(closed)return false;
  closed=true;++requestId;pendingAction=false;
  cancelAnimationFrame(frameId);bindings.splice(0).forEach(remove=>remove());
  renderer?.canvas.remove();box.classList.remove('jaspe2d--live');
  if(host.jaspePresentation===handle)delete host.jaspePresentation;
  return true;
};
const handle={play,stop,destroy,
  setPlaybackRate:rate=>{if(review&&[.5,1].includes(rate)){controller.speed=rate;return true;}return false;},
  getState:()=>snapshot?structuredClone(snapshot):null};
```

Remplacer les trois usages de l'ancien asset `closed` par `closedEyes` :

```js
nativeEyes[key]=createEyeRenderer(aligned.pixels,closedEyes.pixels,W);
faces[key]={image:facePatch(asset.image),eyes:createEyeRenderer(asset.pixels,closedEyes.pixels,W)};
closedEyes=await loadFile('references/paupières-fermées.png');
```

Supprimer l'ancienne déclaration `let closed,renderer,...`. Le booléen `closed=false` indique désormais exclusivement la destruction de l'instance.

- [ ] **Step 5: Exécuter le contrôle v12 et le test du contrôleur**

Run: `node app/qa-jaspe-physical-contract.cjs`

Expected: PASS.

Run: `node --test app/qa-jaspe-presentation-controller.test.mjs`

Expected: PASS, cinq tests et zéro échec.

- [ ] **Step 6: Committer le cycle de vie v12**

```bash
git add app/modules/jaspe2d/live-companion.js app/qa-jaspe-physical-contract.cjs
git commit -m "refactor(jaspe): make v12 lifecycle surface-independent"
```

---

### Task 3: Adaptateurs WebP/v12 et connexion par intentions

**Files:**
- Modify: `app/modules/jaspe2d/jaspe2d.js:236-335`
- Modify: `app/app.js:3146-3232`
- Modify: `app/qa-jaspe-physical-contract.cjs`
- Modify: `package.json:5-18`

**Interfaces:**
- Consumes: `createPresentationController()` et le handle v12 de Task 2.
- Produces: le handle de `mountShowcase()` expose `dispatch(intent, bubbleText)`, `stop()`, `destroy()` et `getState()` ; `app.js` envoie uniquement les intentions physiques.

- [ ] **Step 1: Étendre le contrôle pour interdire les réactions par packs dans app.js**

Ajouter dans `app/qa-jaspe-physical-contract.cjs` :

```js
const app=fs.readFileSync('app/app.js','utf8');
const facade=fs.readFileSync('app/modules/jaspe2d/jaspe2d.js','utf8');
assert.ok(/presentation-controller\.js/.test(facade),'la façade doit charger le contrôleur');
assert.ok(/sc\.dispatch\s*=/.test(facade),'mountShowcase doit exposer dispatch');
assert.ok(/sc\.destroy\s*=/.test(facade),'mountShowcase doit exposer destroy');
assert.ok(!/showcase\.react\s*\(\s*\{\s*pack:/.test(app),'app.js ne doit plus commander un pack');
for(const kind of ['listen','think','explain','error','success']){
  assert.ok(app.includes(`kind: "${kind}"`),`intention ${kind} absente de la connexion`);
}
for(const forbidden of ['speechSynthesis','AudioContext','viseme','phoneme']){
  assert.ok(!facade.includes(forbidden)&&!live.includes(forbidden),`${forbidden} est hors périmètre`);
}
```

- [ ] **Step 2: Exécuter le contrôle pour constater l'ancien raccordement**

Run: `node app/qa-jaspe-physical-contract.cjs`

Expected: FAIL sur le chargement du contrôleur ou sur `app.js ne doit plus commander un pack`.

- [ ] **Step 3: Construire les adaptateurs dans mountShowcase**

Dans `jaspe2d.js`, ajouter une table locale de repli :

```js
var FALLBACK_REF={
  IDLE:{pack:'pack1',key:'idle'},LISTENING:{pack:'pack2',key:'listening'},
  THINKING:{pack:'pack2',key:'thinking'},SPEAKING:{pack:'pack2',key:'speaking'},
  ERROR:{pack:'pack4',key:'worried'},CONGRATULATE:{pack:'pack3',key:'congratulate'}
};
```

Après la création de `sc`, remplacer entièrement l'ancien bloc qui importe directement `live-companion.js` et renseigne `sc.engine`. Il ne doit rester qu'un seul montage v12, créé par le contrôleur ci-dessous :

```js
sc.presentationReady=import('./presentation-controller.js').then(function(module){
  sc.presentation=module.createPresentationController({
    createFallback:function(){return{
      play:function(command){
        var ref=FALLBACK_REF[command.fallback]||FALLBACK_REF.IDLE;
        var idx=sc.variants.findIndex(function(v){return v.pack===ref.pack&&v.key===ref.key;});
        if(idx>=0)showVariant(sc,idx,sc.pendingBubble);
        sc.pendingBubble=undefined;return true;
      },
      stop:function(){return true;},destroy:function(){},getState:function(){return{engine:'webp'};}
    };},
    createPrimary:function(context){
      if(!sc.transparent||sc.photoOnly)return null;
      return import('./live-companion.js?v=physical-controller-01').then(function(live){
        return live.mountLiveCompanion(box,el,{
          isVisible:context.isVisible,
          isTyping:function(){var auth=el.closest&&el.closest('.auth-screen');return !!auth&&auth.classList.contains('auth-is-typing');},
          isBust:function(){var auth=el.closest&&el.closest('.auth-screen');return !!auth&&auth.dataset.loginLayout==='welcome'&&matchMedia('(max-width: 760px)').matches;},
          activityTarget:el.closest&&el.closest('.auth-screen')||el,
        });
      }).then(function(engine){
        if(!engine)return null;
        return {
          play:function(command){
            if(command.action==='idle')return engine.stop('intent-idle');
            return engine.play(command.action,{intensity:command.intensity,source:command.source});
          },
          stop:function(reason){return engine.stop(reason);},
          destroy:function(){return engine.destroy();},
          getState:function(){return engine.getState();}
        };
      });
    }
  });
  return sc.presentation.mount({host:box,surface:opts.surface||'auth',isVisible:function(){
    var screen=el.closest&&el.closest('.auth-screen');
    return !document.hidden&&(!screen||screen.classList.contains('active'))&&(!screen||!screen.classList.contains('auth-jaspe-withdrawn'));
  }}).then(function(mounted){
    if(mounted&&sc.queuedIntent){
      var intent=sc.queuedIntent,bubble=sc.queuedBubble;
      sc.queuedIntent=null;sc.queuedBubble=undefined;
      sc.dispatch(intent,bubble);
    }
    return mounted;
  });
});
```

Le handle public devient :

```js
sc.dispatch=function(intent,bubbleText){
  sc.pendingBubble=bubbleText;
  if(!sc.presentation){sc.queuedIntent=intent;sc.queuedBubble=bubbleText;return true;}
  return sc.presentation.dispatch(intent);
};
sc.stop=function(){return sc.presentation?sc.presentation.stop('showcase'):false;};
sc.destroy=function(){
  clearInterval(sc.rotationTimer);clearTimeout(sc.holdTimer);
  sc.presentation?.destroy();
  showcases=showcases.filter(function(item){return item!==sc;});
  box.remove();return true;
};
sc.getState=function(){return sc.presentation?sc.presentation.getState():null;};
```

Conserver `react()` uniquement comme compatibilité interne temporaire pour les pages de revue existantes ; `app.js` ne doit plus l'utiliser. Stocker le retour de `setInterval` dans `sc.rotationTimer` afin que `destroy()` l'annule.

- [ ] **Step 4: Remplacer les commandes de connexion par les intentions**

Dans `app/app.js`, utiliser exactement :

```js
showcase.dispatch({kind:"listen",holdMs:4000,source:"auth-focus"});
showcase.dispatch({kind:"explain",holdMs:4500,source:"auth-control"},message);
showcase.dispatch({kind:"think",holdMs:6000,source:"auth-submit"});
showcase.dispatch({kind:"error",holdMs:4200,source:"auth-result"});
showcase.dispatch({kind:"success",holdMs:3600,source:"auth-result"});
```

Ne pas changer les événements d'authentification, leurs sélecteurs ou leur logique métier.

- [ ] **Step 5: Ajouter la commande de test ciblée**

Ajouter dans `package.json` :

```json
"test:jaspe-physical": "node --test app/qa-jaspe-presentation-controller.test.mjs && node app/qa-jaspe-physical-contract.cjs"
```

- [ ] **Step 6: Exécuter la suite ciblée**

Run: `npm run test:jaspe-physical`

Expected: les tests du contrôleur et le contrat physique affichent PASS, zéro échec.

- [ ] **Step 7: Exécuter le contrôle d'accès JASPE existant**

Run: `node app/qa-safe-assistant-access.cjs`

Expected: `FE-SEC-A3A4 access law + safe assistant gate: PASS`.

- [ ] **Step 8: Committer le raccordement de la connexion**

```bash
git add app/modules/jaspe2d/jaspe2d.js app/app.js app/qa-jaspe-physical-contract.cjs package.json
git commit -m "feat(jaspe): route auth reactions through physical intents"
```

---

### Task 4: Vérification navigateur, documentation et miroir GitHub

**Files:**
- Modify: `docs/CURRENT_HANDOFF.md`
- Modify: `docs/DECISIONS.md` only if implementation reveals and the owner validates a new durable decision.

**Interfaces:**
- Consumes: contrôleur et raccordement terminés dans Tasks 1 à 3.
- Produces: preuves de fonctionnement, handoff à jour et dépôt local identique à `origin/main`.

- [ ] **Step 1: Lancer ou confirmer le serveur local existant**

Run: `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4176/ | Select-Object StatusCode`

Expected: `StatusCode` égal à `200`. Si le serveur n'est plus actif, utiliser la commande de démarrage déjà documentée par le projet et ne pas installer de nouvelle infrastructure.

- [ ] **Step 2: Vérifier les cinq réactions essentielles dans le navigateur**

Sur `http://127.0.0.1:4176/`, vérifier successivement :

1. arrivée sur la connexion : JASPE reste visible et animée ;
2. focus dans un identifiant : posture `listen` ;
3. soumission : posture `think` ;
4. événement `action:error` : posture `error`, prioritaire sur l'écoute ;
5. événement `action:big_success` : posture `success` lorsque aucune erreur prioritaire n'est active.

Contrôler aussi que le formulaire reste saisissable et que la console ne présente aucune erreur JavaScript nouvelle.

- [ ] **Step 3: Vérifier le mode mouvements réduits et le repli**

Émuler `prefers-reduced-motion: reduce` : JASPE doit afficher une pose stable et le formulaire doit rester utilisable. Bloquer ensuite le chargement de `assets/jaspe2d/v12/manifest.json` : une image WebP doit rester visible, sans erreur bloquante.

- [ ] **Step 4: Relancer les contrôles automatisés frais**

Run: `npm run test:jaspe-physical`

Expected: PASS.

Run: `node app/qa-safe-assistant-access.cjs`

Expected: PASS.

Run: `git diff --check`

Expected: aucune sortie et code 0.

- [ ] **Step 5: Mettre à jour le handoff avec les preuves exactes**

Dans `docs/CURRENT_HANDOFF.md`, remplacer l'objectif et le dernier lot par :

```markdown
## Dernier lot terminé

Contrôleur physique JASPE : intentions fermées, arbitrage prioritaire, v12 indépendant de la surface, cycle de destruction et repli WebP raccordés à la connexion.

### Vérifications exécutées

- `npm run test:jaspe-physical` : recopier la ligne de synthèse réellement produite par la commande.
- `node app/qa-safe-assistant-access.cjs` : recopier la ligne finale réellement produite par la commande.
- Navigateur : énumérer uniquement les scénarios effectivement vérifiés et les limites effectivement observées.

## Prochaine action exacte

Préparer le lot séparé qui monte le même contrôleur dans l'espace de travail, sans activer encore la voix ni GLM.
```

Ne noter PASS que pour une commande effectivement exécutée avec succès.

- [ ] **Step 6: Committer le handoff final**

```bash
git add docs/CURRENT_HANDOFF.md docs/DECISIONS.md
git commit -m "docs(jaspe): record physical controller verification"
```

Si `docs/DECISIONS.md` n'a pas changé, ne pas l'ajouter au commit.

- [ ] **Step 7: Pousser et vérifier le miroir**

Run: `git push origin main`

Expected: push réussi.

Run: `git fetch origin`

Expected: fetch réussi.

Run: `git status --porcelain`

Expected: aucune sortie.

Run: `git rev-parse HEAD`

Run: `git rev-parse origin/main`

Expected: les deux identifiants sont strictement identiques.
