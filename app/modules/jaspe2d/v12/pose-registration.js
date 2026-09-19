import {smooth} from './motion.js';
export const defaultFeet=[[374,1380],[655,1380]];
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
export function poseRegistration(frame,key,poses){
 const source=poses[key],a=poses[frame.from],b=poses[frame.to],t=frame.from===frame.to?1:frame.t;
 const face=source.face||[515,310],targetFace=lerp(a.targetFace||a.face||[515,310],b.targetFace||b.face||[515,310],t);
 const af=a.targetFeet||a.feet||defaultFeet,bf=b.targetFeet||b.feet||defaultFeet;
 return {face,targetFace,feet:source.feet||defaultFeet,targetFeet:af.map((p,i)=>lerp(p,bf[i],t))};
}
export function registerPoint(p,r){
 if(!r)return [...p];const [x,y]=p,q=[x,y];
 // The head and upper torso translate together; the deformation fades before the shoes.
 const upper=1-smooth((y-(r.face[1]+350))/360);
 q[0]+=(r.targetFace[0]-r.face[0])*upper;q[1]+=(r.targetFace[1]-r.face[1])*upper;
 const split=(r.feet[0][0]+r.feet[1][0])/2,left=1-smooth((x-split+35)/70);
 for(let side=0;side<2;side++){
  const foot=r.feet[side],target=r.targetFeet[side],share=side===0?left:1-left;
  const influence=smooth((y-(foot[1]-270))/185)*share;
  q[0]+=(target[0]-foot[0])*influence;q[1]+=(target[1]-foot[1])*influence;
 }
 return q;
}
