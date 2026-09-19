// Browser ES module. Angles in radians; time in milliseconds, independent of frame rate.
export const GREETING_DURATION=5300;
export const SOURCE_ARM=[[367,586],[337,690],[331,801],[329,867]];
const lengths=SOURCE_ARM.slice(1).map((p,i)=>Math.hypot(p[0]-SOURCE_ARM[i][0],p[1]-SOURCE_ARM[i][1]));
const sourceUpper=Math.atan2(104,-30),sourceFore=Math.atan2(111,-6);
const rest=[sourceUpper,sourceFore-sourceUpper,.118,0],raised=[2.53,4.49-2.53,.118,1];
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*x*(10+x*(-15+6*x));};
const blend=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*ease(t));
const derivative=(fn,t)=>fn(t+.01).map((v,i)=>(v-fn(t-.01)[i])/.02);
function channelsAt(time){
  if(time<=180||time>=GREETING_DURATION)return [...rest];
  const anticipation=[sourceUpper+.055,rest[1]+.06,.118,.15];
  if(time<520)return blend(rest,anticipation,(time-180)/340);
  if(time<1710)return blend(anticipation,raised,(time-520)/1190);
  if(time<3650){
    const t=time-1710,envelope=ease(t/240)*ease((1940-t)/300),pulse=Math.sin(t/1940*Math.PI*6)*envelope;
    return [raised[0]+.012*pulse,raised[1]+.025*pulse,raised[2]+.18*pulse,1];
  }
  const lowered=[1.94,.22,.118,.2];
  if(time<4790)return blend(raised,lowered,(time-3650)/1140);
  return blend(lowered,rest,(time-4790)/510);
}
export function greetingAt(time){
  const phase=time<180?'START':time<520?'ANTICIPATION':time<1710?'GESTURE':time<3650?'HOLD':time<4790?'RECOVERY':time<GREETING_DURATION?'RETURN_TO_IDLE':'IDLE';
  return {phase,channels:channelsAt(time),velocity:derivative(channelsAt,time)};
}
export function greetingRig(channels){
  const [upper,elbow,wrist]=channels,angles=[upper,upper+elbow,upper+elbow+wrist],points=[[...SOURCE_ARM[0]]];
  for(let i=0;i<3;i++)points.push([points[i][0]+lengths[i]*Math.cos(angles[i]),points[i][1]+lengths[i]*Math.sin(angles[i])]);
  return points;
}

// Quintic recovery matches the displayed position AND velocity. It reaches rest
// with zero velocity/acceleration instead of restarting from a reference pose.
function recoveryAt(recovery,time){
  const u=clamp(time/recovery.duration),u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;
  return recovery.start.map((x,i)=>{
    const d=rest[i]-x,v=recovery.velocity[i]*recovery.duration;
    return x+v*u+(10*d-6*v)*u3+(-15*d+8*v)*u4+(6*d-3*v)*u5;
  });
}
export class GreetingMotion{
  constructor(){this.clock=0;this.elapsed=0;this.action='idle';this.recovery=null;this.next='idle';}
  request(action){
    if(!['wave','idle','listening'].includes(action))return false;
    if(this.recovery){this.next=action;return true;}
    if(action===this.action)return true;
    if(this.action==='wave'){
      const state=this.sample(),travel=Math.abs(state.channels[1]-rest[1]);
      this.recovery={start:state.channels,velocity:state.velocity,duration:Math.max(650,650+travel*270)};
      this.elapsed=0;this.next=action;return true;
    }
    this.action=action;this.elapsed=0;return true;
  }
  advance(dt){
    if(!Number.isFinite(dt)||dt<0)return;
    this.clock+=dt;this.elapsed+=dt;
    if(this.recovery&&this.elapsed>=this.recovery.duration){
      this.elapsed-=this.recovery.duration;this.action=this.next;this.recovery=null;
    }
    if(this.action==='wave'&&!this.recovery&&this.elapsed>=GREETING_DURATION){this.elapsed-=GREETING_DURATION;this.action='idle';}
  }
  sample(){
    if(this.recovery){const fn=t=>recoveryAt(this.recovery,t);return{clock:this.clock,action:'recovering',phase:'RECOVERY',elapsed:this.elapsed,channels:fn(this.elapsed),velocity:this.elapsed===0?[...this.recovery.velocity]:derivative(fn,this.elapsed)};}
    return {clock:this.clock,action:this.action,elapsed:this.elapsed,...(this.action==='wave'?greetingAt(this.elapsed):{phase:'IDLE',channels:[...rest],velocity:[0,0,0,0]})};
  }
}
