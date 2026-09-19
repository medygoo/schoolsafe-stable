import {smooth} from './motion.js';
import {walkRhythm} from './walk-timing.js';

export const CHILD_CYCLE=28;
const events=[
 {start:.45,duration:2.7,side:0,kind:'heel',label:'Petit relevé de talon'},
 {start:4.55,duration:2.2,side:1,kind:'toe',label:'Pointe du pied relevée'},
 {start:9.25,duration:2.9,side:0,kind:'step',label:'Petit replacement du pied'},
 {start:14,duration:2.5,side:1,kind:'heel',label:'Petit relevé de talon'},
 {start:18.45,duration:2.15,side:0,kind:'toe',label:'Pointe du pied relevée'},
 {start:23.25,duration:2.85,side:1,kind:'step',label:'Petit replacement du pied'}
];
const toes=[[351,1411],[680,1411]],heels=[[423,1393],[590,1393]];
const pulse=(time,start,duration)=>{const u=(time-start)/duration;return u>0&&u<1?Math.sin(Math.PI*u)**2:0;};
const still=side=>({angle:0,pivot:toes[side],dx:0,dy:0,knee:0,amount:0,kind:'planted'});
function baseShift(seconds,gain){const t=((seconds%CHILD_CYCLE)+CHILD_CYCLE)%CHILD_CYCLE;let value=3*Math.sin(seconds*Math.PI*2/9.3)*gain;for(const e of events){const u=(t-e.start)/e.duration;if(u>0&&u<1)value+=(e.side===0?1:-1)*14*smooth(u/.38)*(1-smooth((u-.54)/.46))*gain;}return value;}

// The shared cycle never resets on a gesture change. Only one foot is free.
export function sampleChildMotion(seconds,{enabled=true,liveliness=1,action='idle',elapsed=0,progress=0,footLock=0}={}){
 const gain=enabled?Math.max(0,Math.min(1.3,liveliness)):0;
 const cycle=((seconds%CHILD_CYCLE)+CHILD_CYCLE)%CHILD_CYCLE,steps=[still(0),still(1)];
 let transfer=0,settle=0,label='Deux pieds en appui',movingSide=-1;
 for(const event of events){
  const u=(cycle-event.start)/event.duration;if(u<=0||u>=1||gain===0)continue;
  const amount=smooth(u/.38)*(1-smooth((u-.54)/.46))*gain,side=event.side,sign=side===0?1:-1;
  movingSide=side;transfer=sign*14*amount;settle=amount;label=event.label;
  steps[side]={...still(side),amount,kind:event.kind,knee:sign*3*amount};
  if(event.kind==='heel')steps[side].angle=-sign*.135*amount;
  if(event.kind==='toe'){steps[side].angle=sign*.12*amount;steps[side].pivot=heels[side];}
  if(event.kind==='step'){steps[side].dx=-sign*10*amount;steps[side].dy=-14*amount;steps[side].angle=-sign*.015*amount;}
 }
 // Gesture-specific feet override the idle cycle so the other leg stays planted.
 if(['footTap','deepThink','no','heelPlay','toePlay','sideStep'].includes(action)){
  steps[0]=still(0);steps[1]=still(1);transfer=0;settle=0;movingSide=-1;label='Deux pieds en appui';
  const delay=action==='no'?1250:action==='deepThink'?1950:450;
  const active=smooth((elapsed-delay)/250)*(1-smooth((progress-.82)/.16));
  const alternating=['heelPlay','toePlay'].includes(action),period=alternating?1.25:action==='sideStep'?2.1:.72;
  const t=Math.max(0,(elapsed-delay)/1000),side=alternating?Math.floor(t/period)%2:1;
  const amount=Math.sin(Math.PI*(t%period)/period)**2*active*gain;
  if(amount>.001){const sign=side===0?1:-1;movingSide=side;transfer=sign*12*amount;settle=amount;
   steps[side]={...still(side),amount,kind:'tap',knee:sign*2*amount};
   if(action==='heelPlay'){steps[side].angle=-sign*.15*amount;label='Petit relevé du talon';}
   else if(action==='sideStep'){steps[side].dx=18*amount;steps[side].dy=-13*amount;label='Petit pas de côté';}
   else{steps[side].pivot=heels[side];steps[side].angle=sign*.12*amount;label=action==='toePlay'?'Pointe relevée puis posée':'Un pied tapote · l’autre reste en appui';}
  }
 }
 const phase=seconds*Math.PI*2/9.3,accent=Math.sin(Math.PI*progress)**2;
 let bob=.8*settle,gestureShift=0;
 if(action==='yes')bob+=3.8*gain*accent*(.5+.5*Math.sin(elapsed/1000*Math.PI*2/1.05));
 if(action==='clap')bob+=4.5*gain*(pulse(elapsed,1350,340)+pulse(elapsed,1830,340)+pulse(elapsed,2310,340));
 if(action==='wave')gestureShift=2.4*accent;
 if(action==='think')gestureShift=3*accent;
 const skirt={sway:-(baseShift(seconds,gain)-baseShift(seconds-.22,gain))*.55+.7*Math.sin(seconds*Math.PI*2/4.6)*gain};
 const shoulders=[(Math.sin(seconds*Math.PI*2/5.4)*1.2+Math.sin(phase)*1.8)*gain,(Math.sin(seconds*Math.PI*2/5.4+.15)*1.2-Math.sin(phase)*1.6)*gain];
 if(['fidget','joySway'].includes(action)){const sway=Math.sin(elapsed/1000*2.7)*accent*gain;gestureShift+=(action==='joySway'?12:7)*sway;skirt.sway+=(action==='joySway'?5:2.5)*Math.sin(elapsed/1000*2.7-.35)*accent*gain;shoulders[0]+=1.6*sway;shoulders[1]-=1.6*sway;}
 if(action==='beam'){bob+=1.5*accent*gain;shoulders[0]-=accent*gain;shoulders[1]-=accent*gain;}
 if(action==='laughing'){const laugh=Math.max(0,Math.sin(elapsed/1000*7.4))*accent*gain;bob-=4* laugh;shoulders[0]-=3*laugh;shoulders[1]-=3*laugh;}
 if(action==='confused'){const shrug=Math.sin(Math.PI*progress)**2*gain;shoulders[0]-=6*shrug;shoulders[1]-=6*shrug;}
 if(action==='no'){gestureShift+=2*Math.sin(elapsed/1000*5.7)*accent;}
 if(action==='walk'){const rhythm=walkRhythm(elapsed,progress);gestureShift+=3*rhythm.transfer;skirt.sway+=2.5*rhythm.cloth*gain;}
 const lock=Math.max(0,Math.min(1,footLock)),posture={shift:(3*Math.sin(phase)*gain+transfer+gestureShift*gain)*(1-.8*lock),lean:(.007*Math.sin(phase)*gain+transfer*.00045)*(1-.8*lock),bob:enabled?bob*(1-lock):0};
 if(['hips','balance'].includes(action)){shoulders[0]+=.8*Math.sin(seconds*1.35)*gain;shoulders[1]-=.7*Math.sin(seconds*1.35)*gain;}
 for(const step of steps)for(const key of ['angle','dx','dy','knee','amount'])step[key]*=1-lock;
 if(lock===1){movingSide=-1;label=action==='balance'?'Équilibre sur la jambe porteuse':'Appuis calmes';for(const step of steps)step.kind='planted';}
 return {cycle,label,movingSide,steps,shoulders,skirt,posture,gain,supportFromPose:lock};
}

export function transformFootPoint(point,step){
 const x=point[0]-step.pivot[0],y=point[1]-step.pivot[1],c=Math.cos(step.angle),s=Math.sin(step.angle);
 return [step.pivot[0]+x*c-y*s+step.dx,step.pivot[1]+x*s+y*c+step.dy];
}
