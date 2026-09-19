import {emotionalFamilies,emotionPath,selectEmotionFrame} from './emotion-performances.js';
import {smooth,clamp,blinkAmount,photoMix} from './motion.js';
import {sampleChildMotion} from './child-motion.js?v=attente-joueuse-11';
import {gesturePerformance} from './gesture-profiles.js';
import {walkCycle} from './walk-timing.js';

const hold=(pose,ms)=>[pose,ms];
const march=walkCycle;
const explanation=[hold('mid1',500),hold('explain',700),hold('explain',2200),hold('present',650),hold('present',1400),hold('guide',650),hold('guide',2200),hold('present',650),hold('pointer',650),hold('pointer',2200),hold('mid1',600),hold('rest',550)];
const rise=[hold('mid1',380),hold('mid2',380),hold('prepare',440)];
const lower=[hold('prepare',460),hold('mid2',420),hold('mid1',380),hold('rest',440)];
export const actions={
 noseScratch:{label:'Se gratter doucement le nez',path:[hold('chin2',650),hold('noseTouch',550),hold('noseScratch',400),hold('noseTouch',400),hold('noseScratch',400),hold('noseTouch',400),hold('chin2',550),hold('rest',700)]},
 intro:{label:'Jaspe se présente',speech:true,path:[...rise,hold('wave',500),hold('wave',1100),...lower.slice(0,2),hold('introSelf',650),hold('introSelf',2200),hold('introOpen',700),hold('introOpen',2600),hold('present',650),hold('rest',650)]},
 thumbsUp:{label:'Très bien · pouce levé',path:[hold('thumb1',600),hold('thumb2',600),hold('thumb3',600),hold('thumb3',2100),hold('thumb2',550),hold('thumb1',550),hold('rest',600)]},
 deepThink:{label:'Réfléchir · doigts au menton',path:[hold('chin1',650),hold('chin2',650),hold('chin3',650),hold('chin3',4500),hold('chin2',650),hold('chin1',650),hold('rest',650)]},
 pointLeft:{label:'Pointer à gauche',path:[hold('present',600),hold('pointer',650),hold('pointer',2500),hold('present',650),hold('rest',600)]},
 pointRight:{label:'Pointer à droite',path:[hold('present',600),hold('guide',650),hold('pointerRight',650),hold('pointerRight',2500),hold('guide',650),hold('present',600),hold('rest',550)]},
 attentive:{label:'Écouter attentivement',path:[hold('attentiveBody',900),hold('attentiveBody',3000),hold('rest',900)]},
 surpriseGesture:{label:'Étonnée · mains ouvertes',path:[hold('present',550),hold('surprisePrep',650),hold('surpriseBody',650),hold('surpriseBody',2100),hold('surprisePrep',650),hold('present',550),hold('rest',550)]},
 footTap:{label:'Tapoter un pied',path:[hold('rest',5200)]},
 heelPlay:{label:'Alterner les talons',path:[hold('rest',5600)]},
 toePlay:{label:'Jouer avec les pointes',path:[hold('rest',5600)]},
 sideStep:{label:'Petit pas de côté',path:[hold('rest',4800)]},
 angry:{label:'Fâchée · bras croisés et recul',path:[hold('rest',500),hold('crossPrep',650),hold('crossArms',650),hold('crossArms',450),hold('crossBack',500),hold('crossBack',1900),hold('crossArms',650),hold('crossPrep',650),hold('rest',650)]},
 compliment:{label:'Complimenter et féliciter',path:[hold('rest',650),hold('present',650),hold('clapOpen',550),hold('clapClosed',220),hold('clapOpen',280),hold('clapClosed',220),hold('clapOpen',350),hold('present',650),hold('present',800),hold('rest',650)]},
 guide:{label:'Guider vers un élément',path:[hold('present',650),hold('guide',700),hold('guide',2200),hold('present',600),hold('pointer',700),hold('pointer',1700),hold('present',600),hold('rest',650)]},
 reassure:{label:'Rassurer doucement',path:[hold('present',900),hold('present',2300),hold('rest',950)]},
 jump:{label:'Petit saut de joie',path:[hold('jumpPrep',550),hold('jumpPrep',250),hold('jumpLift',230),hold('jumpAir',220),hold('jumpAir',130),hold('jumpLift',220),hold('jumpPrep',280),hold('jumpPrep',220),hold('rest',550)]},
 walk:{label:'Marcher sur place',path:[...march,...march,...march,hold('rest',450)]},
 joySway:{label:'Se balancer de joie',path:[hold('skirtBoth',600),hold('skirtBoth',4300),hold('rest',650)]},
 curtsy:{label:'Saluer avec respect',path:[hold('skirtBoth',450),hold('bowPrep',650),hold('bow',650),hold('bow',1000),hold('bowPrep',650),hold('skirtBoth',650),hold('rest',450)]},
 talkContinuous:{label:'Explication en continu',path:explanation,speech:true,loop:true},
 idle:{label:'En attente',path:[],duration:0},
 settle:{label:'Retour au repos',path:[hold('rest',480)],internal:true},
 fidget:{label:'Deux mains sur la jupe',path:[hold('skirtBoth',650),hold('skirtBoth',3100),hold('rest',650)]},
 hips:{label:'Mains sur les hanches',path:[hold('handsMid',400),hold('hips',480),hold('hips',2100),hold('handsMid',380),hold('rest',450)]},
 balance:{label:'Petit jeu sur un pied',path:[hold('handsMid',380),hold('hips',450),hold('hips',300),hold('balancePrep',500),hold('balance',500),hold('balance',1800),hold('balancePrep',500),hold('hips',500),hold('handsMid',380),hold('rest',450)]},
 yes:{label:'Dire oui · hochement',path:[hold('yesDown',500),hold('yesUp',550),hold('yesDown',500),hold('yesUp',550),hold('rest',550)]},
 no:{label:'Non · index, tête et pied',path:[hold('noIndex',700),hold('noIndex',400),hold('noIndexLeft',550),hold('noIndex',300),hold('noIndexRight',550),hold('noIndex',300),hold('noIndexLeft',550),hold('noIndex',500),hold('rest',700)]},
 beam:{label:'Grand sourire',path:[hold('rest',3000)]},
 insight:{label:'Réfléchir puis trouver',path:[...rise,hold('wave',500),hold('think',600),hold('think',1500),hold('wave',500),hold('pointer',550),hold('pointer',1900),...lower]},
 sendStanding:{label:'Émojis · debout',path:[hold('present',450),hold('cupsHalf',400),hold('cups',450),hold('cups',2800),hold('present',550),hold('rest',500)]},
 sendKneeling:{label:'Émojis · un genou au sol',path:[hold('present',400),hold('cupsHalf',350),hold('cups',450),hold('kneelStart',650),hold('kneelPrep',650),hold('kneel',750),hold('kneel',3000),hold('kneelPrep',650),hold('kneelStart',650),hold('cups',650),hold('present',500),hold('rest',450)]},
 blink:{label:'Cligner des yeux',path:[hold('rest',600)],eyes:'blink'},
 wink:{label:'Faire un clin d’œil',path:[hold('rest',1250)],eyes:'wink'},
 wave:{label:'Saluer',path:[...rise,hold('wave',500),hold('wave',1850),...lower]},
 clap:{label:'Applaudir',path:[hold('present',600),hold('clapOpen',550),hold('clapOpen',250),hold('clapClosed',200),hold('clapOpen',280),hold('clapClosed',200),hold('clapOpen',280),hold('clapClosed',200),hold('clapOpen',420),hold('present',550),hold('rest',650)]},
 think:{label:'Se gratter la tête',path:[...rise,hold('wave',500),hold('think',600),hold('think',1800),hold('wave',500),...lower]},
 explain:{label:'Expliquer · quatre gestes',path:explanation,speech:true}
};
for(const [id,def]of Object.entries(emotionalFamilies))actions[id]={label:def.label,path:emotionPath(id)};
for(const definition of Object.values(actions))definition.duration=definition.path.reduce((sum,key)=>sum+key[1],0);

function pathFrame(path,elapsed,initial='rest'){
 let start=0,from=initial;
 for(const [to,duration] of path){
  if(elapsed<start+duration){const progress=clamp((elapsed-start)/duration);return {from,to,t:smooth(progress),raw:progress,segmentTime:elapsed-start,hold:from===to};}
  start+=duration;from=to;
 }
 return {from:'rest',to:'rest',t:1,raw:1,segmentTime:0,hold:true};
}
export function frameAt(id,elapsed){return pathFrame(actions[id].path,elapsed,id==='settle'?'skirt':'rest');}

function waitingMoment(clock,allowed,mode){
 const rest={id:'idle',elapsed:0,frame:frameAt('idle',0)};
 if(!allowed||mode==='attentive')return rest;
 const phase=clock/1000%(mode==='playful'?72:28);
 const moments=mode==='playful'?[[6,'fidget'],[21,'hips'],[43,'balance'],[63,'fidget']]:[[6.9,'fidget']];
 for(const [start,id]of moments){const elapsed=(phase-start)*1000;if(elapsed>=0&&elapsed<actions[id].duration)return{id,elapsed,frame:frameAt(id,elapsed)};}
 return rest;
}
const returnPaths={noseTouch:[hold('chin2',550),hold('rest',600)],noseScratch:[hold('noseTouch',400),hold('chin2',550),hold('rest',600)],walkRest:[hold('rest',450)],crossBack:[hold('crossArms',650),hold('crossPrep',650),hold('rest',650)],crossArms:[hold('crossPrep',650),hold('rest',650)],crossPrep:[hold('rest',650)],
 bow:[hold('bowPrep',650),hold('skirtBoth',650),hold('rest',450)],bowPrep:[hold('skirtBoth',650),hold('rest',450)],
 walkL:[hold('walkHalfL',300),hold('rest',350)],walkR:[hold('walkHalfR',300),hold('rest',350)],walkHalfL:[hold('rest',350)],walkHalfR:[hold('rest',350)],
 guide:[hold('present',600),hold('mid1',500),hold('rest',450)],pointer:[hold('present',600),hold('mid1',500),hold('rest',450)],explain:[hold('mid1',500),hold('rest',450)],present:[hold('mid1',500),hold('rest',450)],
 cupsHalf:[hold('present',350),hold('rest',450)],kneelStart:[hold('cups',650),hold('cupsHalf',350),hold('present',350),hold('rest',450)],skirtBoth:[hold('rest',500)],cups:[hold('present',450),hold('rest',450)],kneelPrep:[hold('kneelStart',650),hold('cups',650),hold('present',450),hold('rest',450)],kneel:[hold('kneelPrep',800),hold('kneelStart',650),hold('cups',650),hold('present',450),hold('rest',450)],skirt:[hold('rest',480)],handsMid:[hold('rest',450)],hips:[hold('handsMid',380),hold('rest',450)],balancePrep:[hold('hips',500),hold('handsMid',380),hold('rest',450)],balance:[hold('balancePrep',500),hold('hips',500),hold('handsMid',380),hold('rest',450)]};
for(const id of Object.keys(emotionalFamilies))for(const level of [1,2,3])returnPaths[id+level]=[...Array.from({length:level-1},(_,i)=>hold(id+(level-i-1),650)),hold('rest',650)];
for(const [prefix,count]of [['chin',3],['thumb',3]])for(let level=1;level<=count;level++)returnPaths[prefix+level]=[...Array.from({length:level-1},(_,i)=>hold(prefix+(level-i-1),600)),hold('rest',600)];
Object.assign(returnPaths,{introSelf:[hold('present',650),hold('rest',600)],introOpen:[hold('introSelf',650),hold('present',650),hold('rest',600)],attentiveBody:[hold('rest',750)],pointerRight:[hold('guide',600),hold('present',600),hold('rest',550)]});
const stablePose=pose=>['crossPrep','crossArms','crossBack','balancePrep','balance','kneelStart','kneelPrep','kneel','jumpPrep','jumpLift','jumpAir','walkHalfL','walkHalfR','walkL','walkR','bowPrep','bow'].includes(pose)?1:0;
function eyelidPulse(time,start,close,hold,open){const t=time-start;if(t<0)return 0;if(t<close)return smooth(t/close);if(t<close+hold)return 1;if(t<close+hold+open)return 1-smooth((t-close-hold)/open);return 0;}

export class BaseController{
 constructor(){this.clock=0;this.intensity=.8;this.elapsed=0;this.action='idle';this.queued=null;this.playing=true;this.speed=1;this.reducedMotion=false;this.baseEnabled=true;this.liveliness=1;this.idleBlockedUntil=0;this.reactionSequence=0;this.metadata={};this.queuedMetadata={};this.presenceMode='calm';this.returnFrame=null;this.returnPath=[];this.returnLead=0;this.returnDuration=0;}
 idleMoment(){const calmFace=!this.metadata.expression||['neutral','smile','beaming'].includes(this.metadata.expression);return waitingMoment(this.clock,this.baseEnabled&&this.liveliness>0&&calmFace&&this.clock>=this.idleBlockedUntil,this.presenceMode);}
 get duration(){return this.action==='settle'?this.returnDuration:actions[this.action].duration;}
 currentFrame(){
  if(this.action==='idle')return this.idleMoment().frame;
  if(this.action!=='settle'){
   const level=this.metadata.intensity??this.intensity,frame=selectEmotionFrame(frameAt(this.action,this.elapsed),level);
   if(level===0&&!actions[this.action].speech)return {...frame,from:'rest',to:'rest',hold:true};
   if(['thumbsUp','deepThink'].includes(this.action)){const prefix=this.action==='thumbsUp'?'thumb':'chin',max=level<=1/3+1e-8?1:level<=2/3+1e-8?2:3;for(const side of ['from','to'])if(frame[side].startsWith(prefix))frame[side]=prefix+Math.min(max,Number(frame[side].slice(prefix.length)));frame.hold=frame.from===frame.to;}
   if(this.action==='surpriseGesture'&&level<=.34){for(const side of ['from','to'])if(frame[side]==='surpriseBody')frame[side]='surprisePrep';frame.hold=frame.from===frame.to;}
   if(this.action==='walk'&&level<=.34){for(const side of ['from','to'])frame[side]=({walkL:'walkHalfL',walkR:'walkHalfR'})[frame[side]]||frame[side];frame.hold=frame.from===frame.to;}
   if(this.action==='angry'&&level<=.34){for(const side of ['from','to'])if(frame[side]==='crossBack')frame[side]='crossArms';frame.hold=frame.from===frame.to;}
   if(this.action==='jump'&&level<=.34){for(const side of ['from','to'])if(frame[side]==='jumpAir')frame[side]='jumpLift';frame.hold=frame.from===frame.to;}
   return frame;
  }
  if(this.elapsed<this.returnLead){const t=smooth(this.elapsed/this.returnLead);return {...this.returnFrame,t:this.returnFrame.t+(1-this.returnFrame.t)*t,hold:false};}
  return pathFrame(this.returnPath,this.elapsed-this.returnLead,this.returnFrame.to);
 }
 beginReturn(frame,id,metadata){
  if(frame.from!==frame.to&&(photoMix(frame)===0||photoMix(frame)===1)){const shown=photoMix(frame)===0?frame.from:frame.to;frame={from:shown,to:shown,t:1,raw:1,segmentTime:0,hold:true};}
  this.returnFrame={...frame};this.returnLead=frame.from===frame.to?0:240;this.returnPath=returnPaths[frame.to]||[hold('rest',480)];
  this.returnDuration=this.returnLead+this.returnPath.reduce((sum,item)=>sum+item[1],0);this.action='settle';this.elapsed=0;this.queued=id;this.queuedMetadata={...metadata};
  this.metadata={expression:this.metadata.expression||'neutral',intensity:this.metadata.intensity};
 }
 setPresence(mode){
  if(!['calm','playful','attentive'].includes(mode))return false;if(mode===this.presenceMode)return true;
  const frame=this.currentFrame();this.presenceMode=mode;this.idleBlockedUntil=this.clock+5000;
  if(this.action==='idle'&&(frame.from!=='rest'||frame.to!=='rest'))this.beginReturn(frame,'idle',{});
  return true;
 }
 request(id,metadata={}){
  if(!Object.hasOwn(actions,id)||actions[id].internal)return false;
  metadata={...(['sendStanding','sendKneeling'].includes(id)?{mood:'happy',emojis:5}:{}),...metadata,reactionId:++this.reactionSequence};
  const frame=this.currentFrame();this.idleBlockedUntil=this.clock+9000;
  if(this.action==='idle'&&(frame.from!=='rest'||frame.to!=='rest')){this.beginReturn(frame,id,metadata);return true;}
  if(emotionalFamilies[this.action]||['noseScratch','intro','deepThink','thumbsUp','attentive','pointLeft','pointRight'].includes(this.action)){this.beginReturn(frame,id,metadata);return true;}
  if(['hips','balance','fidget','sendStanding','sendKneeling','walk','joySway','talkContinuous','explain','guide','reassure','angry'].includes(this.action)){this.beginReturn(frame,id,metadata);return true;}
  if(this.action==='idle'){this.action=id;this.elapsed=0;this.queued=null;this.metadata={...metadata};}
  else{this.queued=id;this.queuedMetadata={...metadata};}
  return true;
 }
 advance(realMilliseconds){
  if(!this.playing)return;
  const step=clamp(realMilliseconds,0,50)*this.speed;this.clock+=step;
  if(this.action!=='idle'){
   this.elapsed+=step;
   if(this.elapsed>=this.duration&&(actions[this.action].loop||(this.action==='guide'&&this.metadata.continuous===true))&&!this.queued){this.elapsed%=this.duration;}
   if(this.elapsed>=this.duration){this.action=this.queued||'idle';this.metadata=this.queued?this.queuedMetadata:{};this.queued=null;this.queuedMetadata={};this.elapsed=0;}
  }
 }
 setIntensity(value){if(!Number.isFinite(value))return false;this.intensity=clamp(value);this.metadata.intensity=this.intensity;if(this.queued)this.queuedMetadata.intensity=this.intensity;}
 stopSpeech(){if(actions[this.action].speech)return this.request('idle');return false;}
 restart(){this.elapsed=0;this.queued=null;this.queuedMetadata={};this.metadata.reactionId=++this.reactionSequence;}
 sample(){
  const seconds=this.clock/1000,local=this.elapsed/1000,action=actions[this.action];
  const duration=this.duration,progress=duration?clamp(this.elapsed/duration):0;
  const moment=this.action==='idle'?this.idleMoment():{id:this.action,elapsed:this.elapsed};
  const requestedIntensity=this.metadata.intensity??this.intensity;
  const frame=this.currentFrame(),blend=photoMix(frame),footLock=['walk','jump','curtsy','angry','sad','shy','worried','tired','attentive'].includes(this.action)?1:stablePose(frame.from)*(1-blend)+stablePose(frame.to)*blend;
  const envelope=Math.sin(Math.PI*progress)**2;
  const breath=this.baseEnabled?(Math.sin(seconds*Math.PI*2/5.4)*.86+Math.sin(seconds*Math.PI*2/11.7)*.14):0;
  const attentive=this.action==='idle'&&this.presenceMode==='attentive';
  const child=sampleChildMotion(seconds,{enabled:this.baseEnabled,liveliness:this.liveliness*(attentive?.45:1)*(.35+.65*requestedIntensity),action:requestedIntensity===0?'idle':moment.id,elapsed:moment.elapsed,progress:actions[moment.id].duration?moment.elapsed/actions[moment.id].duration:0,footLock:attentive?1:footLock});
  const weight=child.posture.shift,feet=child.steps.map(step=>-step.dy);
  let blink=blinkAmount(seconds),eyelids=[blink,blink];
  if(action.eyes==='blink')eyelids=Array(2).fill(eyelidPulse(local,.08,.085,.045,.145));
  if(action.eyes==='wink')eyelids=[eyelidPulse(local,.15,.13,.24,.24),0];
  const performance=gesturePerformance(moment.id,moment.elapsed,frame,actions[moment.id].duration);
  const head={pitch:0,yaw:0,roll:0};
  if(action.head==='yes')head.pitch=.115*Math.sin(local*Math.PI*2/1.05)*envelope;
  if(action.head==='no')head.yaw=.18*Math.sin(local*Math.PI*2/1.1)*performance.active;
  if(action.eyes==='wink')head.roll=-.012*envelope;
  if(moment.id==='balance')head.roll=.006*Math.sin(seconds*1.4)*footLock;
  head.roll+=performance.head.roll;head.pitch+=performance.head.pitch;
  if(['yes','no'].includes(this.action)){head.roll=0;head.pitch=0;head.yaw=0;}
  const toward=this.action==='wave'?-1:0;
  const gaze=[toward*1.4*envelope+.22*Math.sin(seconds*.71)+performance.gaze[0],.18*Math.sin(seconds*.43)+performance.gaze[1]];
  const automatic={wave:'smile',yes:'smile',no:'thoughtful',think:'thoughtful',clap:'smile',wink:'smile',hips:'smile',balance:'smile'};
  const expression=this.metadata.expression||performance.expression||automatic[moment.id]||'neutral';
  for(const key of ['pitch','yaw','roll'])head[key]*=requestedIntensity;
  const intensity=requestedIntensity*(this.metadata.expression?1:performance.strength);
  const mood=this.metadata.mood||'neutral',reaction=this.metadata.emojis?{id:this.metadata.reactionId,mood,count:this.metadata.emojis}:null;
  return {clock:this.clock,elapsed:this.elapsed,duration,action:this.action,queued:this.queued,playing:this.playing,progress,frame,breath,weight,feet,child,eyelids,gaze,head,speech:!!action.speech,speechLoop:!!action.loop,requestedIntensity,baseEnabled:this.baseEnabled,expression,intensity,mood,reaction,presenceMode:this.presenceMode,presenceMoment:moment.id,footLock,performance};
 }
}
