const TAU=Math.PI*2;
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const radians=degrees=>degrees*Math.PI/180;
const pulse=(time,start,length)=>{const p=(time-start)/length;return p>0&&p<1?Math.sin(Math.PI*p)**2:0;};

// Rotate from the source pose. Never interpolate projected bone lengths between photos.
export function poseRig(source,key,seconds){
 const phase=seconds%8.7;
 const emphasis=pulse(phase,.55,2.5)+.55*pulse(phase,4.25,2.1);
 const movement={explain:[[1.3,-5.5,-5.0],[0,0,0]],guide:[[0,0,0],[-1.2,-4.5,-4.1]],point:[[-.7,-3.2,-3.0],[0,0,0]],present:[[.7,-3.7,-3.3],[-.5,3.1,2.8]],rest:[[0,0,0],[0,0,0]]}[key];
 return source.map((arm,side)=>{
  const result=[[...arm[0]]];
  for(let j=0;j<3;j++){
   const vx=arm[j+1][0]-arm[j][0],vy=arm[j+1][1]-arm[j][1];
   const angle=radians(movement[side][j]*emphasis);
   result.push([result[j][0]+vx*Math.cos(angle)-vy*Math.sin(angle),result[j][1]+vx*Math.sin(angle)+vy*Math.cos(angle)]);
  }
  return result;
 });
}

// Irregular spacing and faster closure than reopening, shared by both eyes.
const blinkStarts=[1.65,5.9,9.3,9.7,15.0,19.8,24.5];
export function blinkAmount(seconds){
 const t=seconds%29.3;
 let result=0;
 for(const start of blinkStarts){const elapsed=t-start;
  const value=elapsed<0?0:elapsed<.085?smooth(elapsed/.085):elapsed<.125?1:elapsed<.27?1-smooth((elapsed-.125)/.145):0;
  result=Math.max(result,value);
 }
 return result;
}
export function gazeAt(seconds,key){
 const t=seconds%8.7,side=key==='guide'?1:key==='point'?-1:0;
 const directed=pulse(t,.25,3.1)*side;
 const aside=pulse(t,5.7,1.5)*(key==='rest'?-.75:.3);
 return [directed*2.3+aside+Math.sin(seconds*.79)*.24,Math.sin(seconds*.53)*.17];
}
export function localBreath(seconds){return Math.sin(seconds*TAU/5.3)*.65;}

export const photoMix=frame=>frame.from===frame.to?1:smooth((frame.t-.15)/.7);
