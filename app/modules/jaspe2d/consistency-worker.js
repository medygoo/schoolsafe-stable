import {findStablePatch,fitUniformAlignment} from './image-consistency.js?v=uniformisation-01';
let reference;
const regions=[
 {id:'visage',x:425,y:245,width:168,height:118},
 {id:'cravate',x:456,y:466,width:106,height:140},
 {id:'chaussure-gauche',x:335,y:1325,width:84,height:80},
 {id:'chaussure-droite',x:608,y:1325,width:84,height:80}
];
self.onmessage=({data})=>{
 try{
  if(data.type==='reference'){reference=data.image;self.postMessage({id:data.id,result:{ready:true}});return;}
  if(!reference)throw new Error('Reference not loaded');
  const matches=regions.map(region=>findStablePatch(reference,data.image,region));
  const alignment=fitUniformAlignment(matches);
  const lightingReview=matches.some(match=>Math.max(...match.colourShift.map(Math.abs))>12);
  if(matches.some(match=>!match.reliable)){alignment.accepted=false;alignment.appliedMatrix=[1,0,0,1,0,0];}
  self.postMessage({id:data.id,result:{matches,alignment,lightingReview,profile:'frontal-feet-planted'}});
 }catch(error){self.postMessage({id:data.id,error:error.message});}
};
