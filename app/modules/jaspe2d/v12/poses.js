import {additionalPoses} from './emotion-performances.js';
const shoulders=[[412,427],[616,427]];
const restRight=[[673,600],[689,717],[684,833],[675,876]];
const restLeft=[[349,600],[329,717],[324,837],[334,878]];
const shape=(left,right=restRight)=>[left,right].map((arm,side)=>[shoulders[side],...arm]);
export const poses={
 walkRest:{file:'images/walkHalfL.png',motionGroup:'walk',feet:[[402,1390],[585,1390]],targetFeet:[[425,1380],[590,1380]],arms:shape([[350,583],[315,679],[302,808],[302,856]],[[680,583],[687,681],[657,762],[628,792]])},
 guide:{file:'references/guider.png',arms:shape([[349,600],[329,717],[324,837],[334,878]],[[677,597],[707,636],[759,620],[803,595]])},
 jumpPrep:{file:'images/jumpPrep.png',face:[506,393],lowered:true,feet:[[374,1380],[655,1380]],arms:[[[403,510],[342,674],[324,770],[324,884],[329,930]],[[614,510],[676,674],[683,770],[675,884],[671,930]]]},
 jumpLift:{file:'images/jumpLift.png',face:[510,291],lowered:true,feet:[[385,1400],[649,1400]],targetFeet:[[374,1380],[655,1380]],arms:shape([[351,578],[330,646],[360,704],[387,744]],[[676,578],[696,646],[660,704],[640,744]])},
 jumpAir:{file:'images/jumpAir.png',face:[519,300],targetFace:[515,275],lowered:true,feet:[[408,1290],[665,1290]],targetFeet:[[374,1290],[655,1290]],arms:shape([[350,553],[338,604],[376,655],[403,687]],[[677,553],[690,604],[636,655],[603,687]])},
 walkL:{file:'images/walkL.png',motionGroup:'walk',feet:[[401,1215],[582,1380]],targetFeet:[[425,1225],[590,1380]],arms:shape([[350,580],[312,668],[295,802],[302,852]],[[680,580],[697,652],[661,744],[628,790]])},
 walkR:{file:'images/walkR.png',face:[502,300],targetFace:[515,310],motionGroup:'walk',feet:[[425,1380],[591,1135]],targetFeet:[[425,1380],[590,1225]],arms:shape([[340,566],[343,625],[373,669],[389,680]],[[660,570],[695,666],[706,759],[711,797]])},
 walkHalfL:{file:'images/walkHalfL.png',motionGroup:'walk',feet:[[402,1390],[585,1390]],targetFeet:[[425,1345],[590,1380]],arms:shape([[350,583],[315,679],[302,808],[302,856]],[[680,583],[687,681],[657,762],[628,792]])},
 walkHalfR:{file:'images/walkHalfR.png',face:[507,303],targetFace:[515,310],motionGroup:'walk',feet:[[443,1380],[604,1330]],targetFeet:[[425,1380],[590,1345]],arms:shape([[350,583],[328,658],[344,766],[367,810]],[[680,583],[700,686],[717,800],[724,849]])},
 bowPrep:{file:'images/bowPrep.png',face:[509,450],targetFace:[515,355],nativeFace:true,lowered:true,feet:[[458,1380],[548,1380]],arms:[[[407,536],[349,685],[317,784],[301,899],[296,941]],[[612,536],[674,685],[697,784],[711,899],[719,941]]]},
 bow:{file:'images/bow.png',face:[522,406],nativeFace:true,lowered:true,feet:[[462,1335],[531,1380]],arms:[[[404,525],[349,671],[341,758],[354,839],[360,886]],[[623,525],[675,671],[689,758],[675,839],[665,886]]]},
 cupsHalf:{file:'images/cupsHalf.png',arms:shape([[349,590],[372,650],[442,725],[472,765]],[[673,590],[651,650],[575,725],[550,765]]),emit:[511,765]},
 kneelStart:{file:'images/kneelStart.png',face:[506,411],lowered:true,emit:[510,838],arms:[[[409,529],[345,678],[369,750],[449,805],[478,838]],[[614,529],[674,678],[648,750],[571,805],[539,838]]]},
 crossPrep:{file:'images/crossPrep.png',arms:shape([[349,580],[365,653],[477,668],[531,674]],[[673,580],[657,653],[562,726],[511,764]])},
 crossArms:{file:'images/crossArms.png',arms:shape([[355,555],[386,614],[540,575],[589,576]],[[675,555],[643,623],[448,618],[408,547]])},
 crossBack:{file:'images/crossBack.png',feet:[[374,1380],[646,1335]],arms:shape([[355,555],[386,614],[540,575],[589,576]],[[675,555],[643,623],[448,618],[408,547]])},
 kneelPrep:{file:'images/preparer-genou.png',face:[515,504],lowered:true,emit:[511,912],arms:[[[412,626],[365,790],[364,850],[441,881],[477,911]],[[616,626],[660,790],[655,850],[575,881],[542,911]]]},
 skirtBoth:{file:'images/jupe-deux-mains.png',arms:shape([[349,600],[330,716],[335,810],[349,865]],[[673,600],[689,716],[675,810],[667,865]])},
 cups:{file:'images/mains-reunies.png',arms:shape([[349,590],[371,653],[440,690],[480,720]],[[673,590],[648,653],[575,690],[540,720]]),emit:[511,718]},
 refuse:{file:'images/non-main.png',arms:shape([[348,586],[326,648],[286,559],[281,504]])},
 pointer:{file:'references/pointer.png',arms:shape([[349,600],[329,647],[284,552],[255,511]])},
 kneel:{file:'images/un-genou-sol.png',face:[506,593],faceScale:.97,lowered:true,emit:[502,983],shadowZone:[330,1300,535,1440],arms:[[[406,715],[369,857],[372,923],[439,959],[476,987]],[[606,715],[643,857],[631,923],[564,959],[532,987]]]},
 handsMid:{file:'images/preparer-hanches.png',arms:shape([[348,594],[317,684],[289,793],[274,844]],[[676,594],[708,684],[735,793],[749,844]])},
 hips:{file:'images/mains-hanches.png',arms:shape([[338,577],[296,630],[357,703],[392,717]],[[690,577],[726,630],[672,703],[623,717]]),holes:[[371,651],[651,651]]},
 balancePrep:{file:'images/preparer-equilibre.png',arms:shape([[338,577],[296,630],[357,703],[392,717]],[[690,577],[726,630],[672,703],[623,717]]),holes:[[371,651],[651,651]]},
 balance:{file:'images/equilibre-un-pied.png',arms:shape([[338,577],[296,630],[357,703],[392,717]],[[690,577],[726,630],[672,703],[623,717]]),holes:[[371,651],[651,651]]},
 skirt:{file:'images/attente-main-jupe.png',arms:shape([[349,600],[354,713],[363,800],[383,846]])},
 rest:{file:'references/repos.png',arms:shape(restLeft)},
 mid1:{file:'images/intermediaire-bas.png',arms:shape([[349,595],[346,680],[342,758],[348,796]])},
 mid2:{file:'images/intermediaire-exterieur.png',arms:shape([[349,595],[333,653],[290,734],[290,770]])},
 prepare:{file:'images/preparer-salut.png',arms:shape([[350,598],[359,668],[333,695],[317,647]])},
 wave:{file:'images/salut.png',arms:shape([[347,579],[305,621],[282,484],[280,440]])},
 think:{file:'images/reflechir.png',holes:[[350,396]],arms:shape([[309,451],[252,443],[309,291],[324,250]])},
 clapOpen:{file:'images/applaudir-ouvert.png',arms:shape([[362,585],[359,649],[420,624],[439,574]],[[659,585],[661,649],[596,624],[571,574]])},
 clapClosed:{file:'images/applaudir-contact.png',arms:shape([[362,585],[359,649],[484,620],[499,574]],[[659,585],[661,649],[541,620],[524,574]])},
 present:{file:'references/presenter.png',arms:shape([[349,600],[332,645],[337,672],[347,693]],[[677,600],[695,644],[690,671],[701,693]])},
 explain:{file:'references/expliquer.png',arms:shape([[350,601],[331,650],[368,675],[397,702]],[[677,600],[690,722],[685,838],[676,880]])}
};

Object.assign(poses,additionalPoses(poses.rest.arms));
const lerp=(a,b,t)=>a+(b-a)*t;
export function interpolateRig(from,to,t){
 return from.map((arm,side)=>{
  const result=[[lerp(arm[0][0],to[side][0][0],t),lerp(arm[0][1],to[side][0][1],t)]];
  for(let j=0;j<arm.length-1;j++){
   const a=[arm[j+1][0]-arm[j][0],arm[j+1][1]-arm[j][1]],b=[to[side][j+1][0]-to[side][j][0],to[side][j+1][1]-to[side][j][1]];
   const aa=Math.atan2(a[1],a[0]),ba=Math.atan2(b[1],b[0]),delta=Math.atan2(Math.sin(ba-aa),Math.cos(ba-aa));
   const angle=aa+delta*t,length=lerp(Math.hypot(...a),Math.hypot(...b),t);
   result.push([result[j][0]+Math.cos(angle)*length,result[j][1]+Math.sin(angle)*length]);
  }return result;
 });
}

export function sampleRig(state){
 const {from,to,t,hold,segmentTime}=state.frame;
 const rig=interpolateRig(poses[from].arms,poses[to].arms,t);
 if(!hold)return rig;
 const seconds=segmentTime/1000;
 const angle=to==='wave'?.11*Math.sin(seconds*8)*Math.sin(Math.PI*Math.min(seconds/1.85,1))**2:to==='think'?.018*Math.sin(seconds*15):0;
 if(angle){const wrist=rig[0][3],palm=rig[0][4],x=palm[0]-wrist[0],y=palm[1]-wrist[1];rig[0][4]=[wrist[0]+x*Math.cos(angle)-y*Math.sin(angle),wrist[1]+x*Math.sin(angle)+y*Math.cos(angle)];}
 return rig;
}
