import {BaseController, actions} from './v12/base-controller.js?v=attente-joueuse-11';
import {poses, sampleRig} from './v12/poses.js';
import {createPhotoRenderer} from './v12/photo-renderer.js';
import {createBodyRenderer, deformBodyPoint} from './v12/body-renderer-v9.js';
import {poseRegistration} from './v12/pose-registration.js';
import {createEyeRenderer} from './v12/face-renderer.js';
import {alignPortrait} from './v12/face-alignment.js';
import {smooth} from './v12/motion.js';
import {displayMatte} from './display-matte.js';
import {retainPortrait} from './auth-portrait.js';
import {IdlePlanner} from './idle-planner.js';

const W=1023,H=1537;
const makeCanvas=()=>Object.assign(document.createElement('canvas'),{width:W,height:H});
const assetBase=new URL('../../assets/jaspe2d/v12/',import.meta.url);
const reactionActions={wave:'wave',idle:'joySway',explain:'guide',listening:'attentive',thinking:'deepThink',worried:'worried',congratulate:'thumbsUp'};

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
  const response=await fetch(new URL('manifest.json',assetBase));
  if(!response.ok)throw new Error('V12 library unavailable');
  const library=await response.json(), allowed=new Set(library.actions);
  const controller=new BaseController();
  controller.liveliness=1.2;
  controller.intensity=.9;
  controller.idleBlockedUntil=Infinity; // The entrance schedules its own complete gestures.
  const loaded={},pending=new Map(),faces={},nativeEyes={};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const planner=new IdlePlanner();
  let closed=false,closedEyes,renderer,body,last=0,lastDraw=0,frameId=0,failed=false,requestId=0,pendingAction=false;
  let faceBlend=0,snapshot=null,dirty=true;
  const scene=makeCanvas(),context=scene.getContext('2d');
  const faceLayer=document.createElement('canvas');faceLayer.width=208;faceLayer.height=180;
  const faceContext=faceLayer.getContext('2d');

  async function loadFile(file) {
    const entry=library.files[file];
    if(!entry)throw new Error('Unlisted V12 photo');
    const response=await fetch(new URL(entry.url,assetBase));
    if(!response.ok)throw new Error('V12 photo unavailable');
    const bytes=await response.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==entry.sha256)throw new Error('V12 photo changed');
    const image=new Image(),url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    try {
      image.src=url;await image.decode();
      const canvas=makeCanvas(),ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(image,0,0,W,H);
      return {image:canvas,pixels:ctx.getImageData(0,0,W,H).data};
    } finally {URL.revokeObjectURL(url);}
  }
  function loadPose(key) {
    if(loaded[key])return Promise.resolve();
    if(!pending.has(key))pending.set(key,(async()=>{
      const pose=poses[key],asset=await loadFile(pose.file);
      const matte=displayMatte(asset,W,H,pose.holes,pose.face,pose);
      retainPortrait(matte.image);
      loaded[key]=matte;
      if(pose.nativeEyes&&closedEyes){const aligned=alignPortrait(asset,pose.eyes,W,H);nativeEyes[key]=createEyeRenderer(aligned.pixels,closedEyes.pixels,W);}
    })().catch(error=>{pending.delete(key);throw error;}));
    return pending.get(key);
  }
  function facePatch(image) {
    const c=document.createElement('canvas');c.width=208;c.height=180;
    const x=c.getContext('2d');x.drawImage(image,411,220,208,180,0,0,208,180);
    const p=x.getImageData(0,0,208,180);
    for(let y=0;y<180;y++)for(let px=0;px<208;px++) {
      const i=(y*208+px)*4,r=Math.hypot((px-104)/104,(y-90)/90);
      p.data[i+3]=Math.round(255*(1-smooth((r-.76)/.24)));
      if(y+220>334&&Math.abs(px-104)>32){const rgb=[p.data[i],p.data[i+1],p.data[i+2]];if(Math.min(...rgb)>135)p.data[i+3]*=smooth((Math.max(...rgb)-Math.min(...rgb)-20)/25);}
    }
    x.putImageData(p,0,0);return c;
  }
  async function loadFace(key,file) {
    const asset=await loadFile(file);
    faces[key]={image:facePatch(asset.image),eyes:createEyeRenderer(asset.pixels,closedEyes.pixels,W)};
  }
  async function ensureAction(action) {
    // Limit concurrent photo decodes. Photos for later gestures are requested only when needed.
    for(const key of new Set(['rest','mid1',...actions[action].path.map(item=>item[0])]))await loadPose(key);
  }
  async function play(action,metadata={}) {
    if(closed||!allowed.has(action)||reduced.matches||failed)return false;
    const id=++requestId;pendingAction=true;
    try {
      await ensureAction(action);
      if(closed||failed)return false;
      // A pointer/key activity can supersede an asset load without changing the
      // presentation intent. Cancellation is not an unavailable renderer.
      if(id!==requestId)return true;
      controller.request(action,{...metadata,intensity:metadata.intensity??.9});
      controller.idleBlockedUntil=Infinity;
      dirty=true;
      return true;
    } catch {return false;}
    finally {if(id===requestId)pendingAction=false;}
  }
  function fail() {
    if(closed)return;
    failed=true;cancelAnimationFrame(frameId);
    box.classList.remove('jaspe2d--live');box.dataset.motion='unavailable';
    if(renderer)renderer.canvas.remove();
  }
  function draw(state,dt) {
    const joyful=['joySway','jump','walk','thumbsUp'].includes(state.action);
    faceBlend+=(Number(joyful)-faceBlend)*(1-Math.exp(-dt/180));
    const rig=sampleRig(state);
    renderer.render(state.frame,rig,(source,key)=>{
      const pose=poses[key],face=pose.face||[515,310],scale=pose.faceScale||1;
      context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,W,H);context.drawImage(source,0,0);
      context.save();context.translate(face[0],face[1]);context.rotate(pose.faceAngle||0);context.scale(scale,scale);context.translate(-515,-310);
      context.globalCompositeOperation='source-atop';
      if(!pose.nativeFace&&!pose.nativeExpression) {
        faceContext.clearRect(0,0,208,180);faceContext.globalCompositeOperation='lighter';
        faceContext.globalAlpha=1-faceBlend;faceContext.drawImage(faces.smile.image,0,0);
        faceContext.globalAlpha=faceBlend;faceContext.drawImage(faces.joy.image,0,0);
        faceContext.globalAlpha=1;context.drawImage(faceLayer,411,220);
        context.globalAlpha=1-faceBlend;const first=faces.smile.eyes;context.drawImage(first.render(state.eyelids,state.gaze),first.x,first.y);
        context.globalAlpha=faceBlend;const second=faces.joy.eyes;context.drawImage(second.render(state.eyelids,state.gaze),second.x,second.y);
      } else if(nativeEyes[key]) {
        const eye=nativeEyes[key];context.drawImage(eye.render(state.eyelids,state.gaze),eye.x,eye.y);
      }
      context.restore();context.globalAlpha=1;context.globalCompositeOperation='source-over';
      body.render(scene,{...state,renderPose:pose,registration:poseRegistration(state.frame,key,poses)});
      return body.canvas;
    });
    const pose=poses[state.frame.to],renderState={...state,renderPose:pose,registration:poseRegistration(state.frame,state.frame.to,poses)};
    snapshot={action:state.action,clock:state.clock,frame:state.frame,breath:state.breath,eyelids:state.eyelids,
      shoulders:state.child.shoulders,skirt:state.child.skirt,feet:state.child.steps,head:state.head,
      points:[[473,288],[367,487],[400,960],[423,1393]].map(p=>deformBodyPoint(p,renderState))};
    box.dataset.motion=state.action;
  }
  function tick(now) {
    if(closed||failed)return;
    frameId=requestAnimationFrame(tick);
    const visible=isVisible()&&!document.hidden;
    if(!visible){last=0;return;}
    const interval=1000/24;
    if(now-lastDraw<interval)return;
    const dt=last?Math.min(50,now-last):interval;last=now;lastDraw=now;
    const typing=isTyping();
    if(typing)planner.activity(controller.clock);
    controller.liveliness=typing?.4:1.2;
    if(!reduced.matches)controller.advance(dt);
    if(!review&&!reduced.matches&&!pendingAction) {
      const bust=isBust();
      // In the upper-body dock, use welcoming gestures that remain readable.
      // Walking/jumping belongs to the full-body presentation.
      const next=planner.next({clock:controller.clock,typing,bust,idle:controller.action==='idle',
        ready:id=>allowed.has(id)&&!!actions[id],duration:id=>actions[id]?.duration||0});
      if(next)play(next);
    }
    if(reduced.matches&&!dirty)return;
    try {draw(controller.sample(),dt);dirty=false;}catch{fail();}
  }
  closedEyes=await loadFile('references/paupières-fermées.png');
  await Promise.all([loadPose('rest'),loadFace('smile','images/smileMid.png'),loadFace('joy','images/grand-sourire.png')]);
  renderer=createPhotoRenderer(loaded,poses,W,H);
  body=createBodyRenderer(W,H);
  renderer.canvas.className='jaspe2d__live-canvas';
  renderer.canvas.setAttribute('aria-hidden','true');
  draw(controller.sample(),1000);
  box.insertBefore(renderer.canvas,box.firstChild);
  box.classList.add('jaspe2d--live');
  const activity=()=>{
    planner.activity(controller.clock);
    ++requestId;pendingAction=false;
    if(['walk','joySway'].includes(controller.action)){controller.request('idle');controller.idleBlockedUntil=Infinity;}
  };
  if(!review)for(const event of ['pointerdown','keydown','input'])listen(activityTarget,event,activity,{passive:true});
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
  const handle={play:play,stop:stop,destroy:destroy,react:ref=>{planner.activity(controller.clock);return play(reactionActions[ref.key]||'wave');},
    setPlaybackRate:rate=>{if(review&&[.5,1].includes(rate)){controller.speed=rate;return true;}return false;},
    getState:()=>snapshot?structuredClone(snapshot):null};
  host.jaspePresentation=handle;
  listen(reduced,'change',()=>{dirty=true;last=0;});
  listen(renderer.canvas,'webglcontextlost',fail);
  frameId=requestAnimationFrame(tick);
  return handle;
}
