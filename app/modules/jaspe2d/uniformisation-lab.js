import {poses} from './v12/poses.js';
import {displayMatte} from './display-matte.js';
import {retainPortrait} from './auth-portrait.js';
import {assessTransition,transformPoint} from './image-consistency.js?v=uniformisation-01';

const W=1023,H=1537,$=id=>document.getElementById(id);
const definitions=[['rest','Repos'],['mid1','Main ouverte'],['mid2','Bras écarté'],['prepare','Préparation'],['wave','Salut']];
const frames=new Map(),base=new URL('../../assets/jaspe2d/v12/',import.meta.url);
let selected='rest',report=null,showGuides=false;
const worker=new Worker(new URL('./consistency-worker.js?v=uniformisation-01',import.meta.url),{type:'module'});
const pending=new Map();let sequence=0;
worker.onmessage=({data})=>{const item=pending.get(data.id);if(!item)return;pending.delete(data.id);data.error?item.reject(new Error(data.error)):item.resolve(data.result);};
worker.onerror=()=>{for(const item of pending.values())item.reject(new Error('Analyse des images indisponible'));pending.clear();};
function analyse(type,image){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,type,image});});}
const number=(value,digits=1)=>Number(value).toLocaleString('fr-FR',{maximumFractionDigits:digits});
const canvas=()=>Object.assign(document.createElement('canvas'),{width:W,height:H});
const matricesEqual=(a,b)=>a.every((value,i)=>Math.abs(value-b[i])<1e-10);

async function loadFrame(id,label,library){
 const pose=poses[id],entry=library.files[pose.file];
 if(!entry)throw new Error(`Photo manquante : ${label}`);
 const response=await fetch(new URL(entry.url,base));if(!response.ok)throw new Error(`Chargement impossible : ${label}`);
 const bytes=await response.arrayBuffer(),sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(sha!==entry.sha256)throw new Error(`L’empreinte de ${label} ne correspond pas à l’original`);
 const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'})),image=new Image();
 try{
  image.src=url;await image.decode();if(image.naturalWidth!==W||image.naturalHeight!==H)throw new Error(`Dimensions inattendues : ${label}`);
  const original=canvas(),ctx=original.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,W,H);
  const cutout=displayMatte({pixels:pixels.data},W,H,pose.holes,pose.face,pose).image;retainPortrait(cutout);
  if(id==='rest')await analyse('reference',pixels);
  const analysis=await analyse('candidate',pixels),normalised=canvas(),out=normalised.getContext('2d');
  out.imageSmoothingQuality='high';out.setTransform(...analysis.alignment.appliedMatrix);out.drawImage(cutout,0,0);out.resetTransform();
  const landmarks=Object.fromEntries(['shoulder','elbow','wrist','palm'].map((name,i)=>[name,transformPoint(pose.arms[0][[0,2,3,4][i]],analysis.alignment.appliedMatrix)]));
  const metadata={id,label,file:pose.file,sha256:sha,width:W,height:H,...analysis,landmarks,
   changedFraming:!matricesEqual(analysis.alignment.appliedMatrix,[1,0,0,1,0,0]),reviewStatus:'awaiting-user',originalPreserved:true};
  return {original,cutout,normalised,metadata};
 }finally{URL.revokeObjectURL(url);}
}

function paint(destination,source,matches){
 const ctx=destination.getContext('2d');ctx.clearRect(0,0,W,H);ctx.drawImage(source,0,0);
 if(!showGuides)return;
 ctx.save();ctx.strokeStyle='#e6a400';ctx.lineWidth=2;ctx.setLineDash([10,8]);
 for(const y of [304,1365]){ctx.beginPath();ctx.moveTo(100,y);ctx.lineTo(900,y);ctx.stroke();}
 ctx.setLineDash([]);ctx.strokeStyle='#087aff';
 for(const match of matches){ctx.beginPath();ctx.arc(...match.target,8,0,Math.PI*2);ctx.stroke();}
 ctx.restore();
}
function render(){
 const frame=frames.get(selected);if(!frame)return;
 const {metadata:m}=frame;
 paint($('source'),frame.original,m.matches);paint($('result'),frame.normalised,m.matches);
 $('poseName').textContent=m.label;
 $('alignmentStatus').textContent=m.alignment.accepted?'Repères cohérents':'Cadrage à revoir';
 $('alignmentStatus').dataset.state=m.alignment.accepted?'ok':'review';
 $('framing').textContent=m.changedFraming?`${number(m.alignment.scale*100,2)} % · déplacement ${number(m.alignment.translation[0])} / ${number(m.alignment.translation[1])} px`:'Cadrage déjà cohérent · aucune correction forcée';
 $('residual').textContent=`${number(m.alignment.maxResidual,2)} px d’écart maximal entre les repères`;
 $('light').textContent=m.lightingReview?'Écart de couleur à vérifier':'Aucun écart de couleur important détecté dans les zones comparées';
 $('identity').textContent='Visage et tenue conservés dans l’image complète. La ressemblance reste à vérifier visuellement.';
 for(const button of document.querySelectorAll('[data-pose]'))button.setAttribute('aria-pressed',String(button.dataset.pose===selected));
 $('matchList').replaceChildren(...m.matches.map(match=>{
  const li=document.createElement('li');li.textContent=`${match.id.replaceAll('-',' ')} : décalage ${number(match.source[0]-match.target[0])} / ${number(match.source[1]-match.target[1])} px${match.reliable?'':' · à vérifier'}`;return li;
 }));
}
function renderTransitions(){
 $('transitions').replaceChildren(...report.transitions.map(t=>{
  const item=document.createElement('li'),title=document.createElement('strong'),text=document.createElement('span');
  title.textContent=`${frames.get(t.from).metadata.label} → ${frames.get(t.to).metadata.label}`;
  text.textContent=t.geometryCompatible?'Poses proches · contrôle visuel nécessaire':`Étapes manquantes · déplacement estimé de la main jusqu’à ${number(t.maxDisplacement)} px`;
  item.append(title,text);return item;
 }));
}

$('guides').onchange=()=>{showGuides=$('guides').checked;render();};
$('background').onchange=()=>{$('after').dataset.background=$('background').value;};
$('export').onclick=()=>{
 const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');
 a.href=url;a.download='jaspe-uniformisation-lot1.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

try{
 const response=await fetch(new URL('manifest.json',base));if(!response.ok)throw new Error('Bibliothèque de photos indisponible');const library=await response.json();
 for(const [id,label]of definitions){
  $('loading').textContent=`Vérification des originaux : ${frames.size+1} / ${definitions.length}…`;
  const frame=await loadFrame(id,label,library);frames.set(id,frame);
  const button=document.createElement('button');button.type='button';button.dataset.pose=id;button.setAttribute('aria-pressed',String(selected===id));
  const preview=document.createElement('canvas');preview.width=88;preview.height=132;preview.getContext('2d').drawImage(frame.normalised,0,0,88,132);
  const name=document.createElement('span');name.textContent=label;button.append(preview,name);button.onclick=()=>{selected=id;render();};$('poses').append(button);
  render();await new Promise(resolve=>requestAnimationFrame(resolve));
 }
 const list=[...frames.values()].map(frame=>frame.metadata);
 report={schema:1,status:'images-awaiting-visual-review',method:'uniform-full-frame-only',source:'V12 originaux verrouillés',width:W,height:H,
  profile:'frontal-feet-planted',frames:list,transitions:list.slice(1).map((frame,i)=>assessTransition(list[i],frame)),
  caveat:'Les repères sont des estimations locales. Ils ne prouvent ni identité faciale ni continuité d’un mouvement. Aucun étirement, recoloriage ou fondu animé appliqué.'};
 $('loading').textContent='5 originaux vérifiés · aucune image réécrite';$('export').disabled=false;renderTransitions();
 $('sequenceStatus').textContent=report.transitions.some(t=>!t.geometryCompatible)?'Ces cinq poses ne constituent pas encore un salut fluide. Des images intermédiaires cohérentes sont nécessaires.':'Les poses sont proches. La séquence reste à vérifier visuellement avant animation.';
 window.uniformisation={getReport:()=>structuredClone(report),select:id=>{if(!frames.has(id))return false;selected=id;render();return true;}};
}catch(error){$('loading').textContent=error.message;$('loading').setAttribute('role','alert');console.error(error);}
finally{worker.terminate();}
