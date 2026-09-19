import {faceGeometry} from './face-alignment.js';
export const emotionalFamilies={
 shy:{label:'Timide',description:'Petit sourire réservé, épaules rapprochées, mains jointes et pieds légèrement tournés vers l’intérieur'},
 proud:{label:'Fière',description:'Sourire assuré, buste redressé, mains sur les hanches et appui stable'},
 sad:{label:'Triste',description:'Sourcils relevés au centre, lèvres tombantes, épaules basses et mains rapprochées'},
 laughing:{label:'Rire aux éclats',description:'Rire du visage, main au ventre, épaules et buste qui ponctuent le rire'},
 grateful:{label:'Reconnaissante',description:'Sourire chaleureux, main au cœur puis main ouverte vers l’utilisateur'},
 relieved:{label:'Soulagée',description:'Relâchement des sourcils et des épaules, main au cœur et expiration'},
 embarrassed:{label:'Gênée',description:'Sourire embarrassé, regard de côté, main derrière la tête et genou détendu'},
 confused:{label:'Perplexe · je ne sais pas',description:'Sourcils interrogatifs, paumes ouvertes et haussement des épaules'},
 worried:{label:'Inquiète',description:'Sourcils resserrés, bouche tendue, mains rassemblées contre le buste'},
 tired:{label:'Fatiguée',description:'Paupières lourdes, épaules relâchées, bâillement couvert par la main'}
};
// Measured eye landmarks keep each portrait aligned while preserving its source.
export const eyeLandmarks={
 shy1:[[474,313],[551,310]],shy2:[[464,324],[544,315]],shy3:[[462,309],[541,306]],
 proud1:[[469,281],[547,277]],proud2:[[482,289],[561,282]],proud3:[[473,285],[550,281]],
 sad1:[[462,299],[541,291]],sad2:[[483,326],[560,320]],sad3:[[472,313],[550,304]],
 laughing1:[[469,289],[547,282]],laughing2:[[468,265],[545,262]],laughing3:[[474,282],[553,287]],
 grateful1:[[462,283],[538,277]],grateful2:[[459,292],[535,285]],grateful3:[[461,320],[537,307]],
 relieved1:[[470,289],[548,283]],relieved2:[[470,294],[549,288]],relieved3:[[467,287],[545,282]]
};
export const extraPoseKeys=['noseTouch','noseScratch','introSelf','introOpen','surprisePrep','surpriseBody','thumb1','thumb2','thumb3','chin1','chin2','chin3','pointerRight','attentiveBody','yesDown','yesUp','noIndex','noIndexLeft','noIndexRight'];
export const allEmotionPoseKeys=Object.keys(emotionalFamilies).flatMap(id=>[1,2,3].map(i=>id+i));
Object.assign(eyeLandmarks,{noseTouch:[[465,287],[539,278]],noseScratch:[[465,290],[540,281]],
 shy3:[[462,309],[541,306]],sad2:[[463,296],[539,291]],laughing3:[[465,282],[543,264]],grateful1:[[458,291],[535,283]],embarrassed3:[[480,329],[551,305]],
 embarrassed1:[[478,310],[552,299]],embarrassed2:[[478,306],[553,297]],confused1:[[475,286],[554,282]],confused2:[[470,293],[547,287]],confused3:[[464,294],[539,282]],
 worried1:[[470,293],[546,287]],worried2:[[467,293],[546,288]],worried3:[[462,315],[538,308]],
 tired1:[[455,295],[532,291]],tired2:[[453,295],[530,291]],tired3:[[462,295],[540,295]],
 introSelf:[[467,284],[545,280]],introOpen:[[467,284],[545,280]],surprisePrep:[[474,287],[551,283]],surpriseBody:[[477,305],[553,301]],
 thumb1:[[467,284],[545,280]],thumb2:[[467,284],[545,280]],thumb3:[[467,280],[546,276]],chin1:[[467,285],[543,276]],chin2:[[467,285],[543,276]],chin3:[[473,280],[550,281]],
 pointerRight:[[442,287],[518,282]],attentiveBody:[[467,294],[544,287]],yesDown:[[467,323],[547,317]],yesUp:[[467,269],[541,265]],
 noIndex:[[467,283],[547,280]],noIndexLeft:[[418,283],[488,283]],noIndexRight:[[514,287],[585,279]]
});
export function additionalPoses(arms){return Object.fromEntries([...allEmotionPoseKeys,...extraPoseKeys].map(key=>{
 const family=key.replace(/[123]$/,''),native=['noseTouch','noseScratch','tired2','tired3','chin1','chin2','chin3','yesDown','yesUp','noIndex','noIndexLeft','noIndexRight'].includes(key);
 return [key,{file:'images/'+key+'.png',arms:structuredClone(arms),...faceGeometry(eyeLandmarks[key]),eyes:eyeLandmarks[key],
 ...(emotionalFamilies[family]?{nativeExpression:family,nativeEyes:true,targetFace:[515,310]}:{}),
 ...(native?{nativeFace:true,nativeEyes:true}:{}),...(family==='proud'?{holes:[[350,600],[680,600]]}:{})}];
 }));}
export function emotionPath(id){return [[id+'1',650],[id+'2',700],[id+'3',700],[id+'3',2200],[id+'2',700],[id+'1',650],['rest',650]];}
export function selectEmotionFrame(frame,intensity){
 const result={...frame},max=intensity<=1/3+1e-8?1:intensity<=2/3+1e-8?2:3;
 for(const side of ['from','to']){const match=result[side].match(/^([a-z]+)([123])$/);if(match&&emotionalFamilies[match[1]])result[side]=match[1]+Math.min(Number(match[2]),max);}
 result.hold=result.from===result.to;return result;
}
