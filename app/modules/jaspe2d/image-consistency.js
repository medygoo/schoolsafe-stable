const identity=()=>[1,0,0,1,0,0];
export const transformPoint=([x,y],[a,b,c,d,tx,ty])=>[a*x+c*y+tx,b*x+d*y+ty];

// Only one scale and one translation for the entire photo. No local warping,
// non-uniform scaling, pose correction, face replacement, or recolouring.
export function fitUniformAlignment(matches,{maxResidual=3,maxScaleChange=.035,maxShift=40}={}){
 if(matches.length<3||matches.some(m=>!m.source||!m.target||[...m.source,...m.target].some(v=>!Number.isFinite(v))))throw new Error('At least three finite landmarks are required');
 const mean=key=>[0,1].map(axis=>matches.reduce((sum,m)=>sum+m[key][axis],0)/matches.length);
 const source=mean('source'),target=mean('target');let numerator=0,denominator=0;
 for(const m of matches)for(let axis=0;axis<2;axis++){const s=m.source[axis]-source[axis];numerator+=s*(m.target[axis]-target[axis]);denominator+=s*s;}
 if(denominator<1)throw new Error('Landmarks do not span the character');
 const scale=numerator/denominator,tx=target[0]-scale*source[0],ty=target[1]-scale*source[1];
 const matrix=[scale,0,0,scale,tx,ty],residuals=matches.map(m=>Math.hypot(...transformPoint(m.source,matrix).map((v,i)=>v-m.target[i])));
 const rms=Math.sqrt(residuals.reduce((sum,v)=>sum+v*v,0)/residuals.length),max=Math.max(...residuals);
 const accepted=scale>0&&Math.abs(scale-1)<=maxScaleChange&&Math.hypot(tx,ty)<=maxShift&&max<=maxResidual;
 const negligible=matches.every(m=>Math.hypot(...m.source.map((v,i)=>v-m.target[i]))<=1.5)&&Math.abs(scale-1)<.001;
 return {matrix,appliedMatrix:accepted&&!negligible?matrix:identity(),scale,translation:[tx,ty],rms,maxResidual:max,residuals,accepted,negligible};
}

// Match only explicitly stable areas (frontal face, central tie, planted shoes).
// A moved foot/head must be classified as intentional motion before using another profile.
export function findStablePatch(reference,candidate,region,{search=18,stride=4}={}){
 const {x,y,width,height}=region,samples=[],sum=[0,0,0];let squares=0;
 for(let py=y;py<y+height;py+=stride)for(let px=x;px<x+width;px+=stride){
  const i=(py*reference.width+px)*4,rgb=[...reference.data.slice(i,i+3)];
  samples.push({x:px,y:py,rgb});rgb.forEach((v,c)=>{sum[c]+=v;squares+=v*v;});
 }
 const count=samples.length,mean=sum.map(v=>v/count),variance=squares/(count*3)-mean.reduce((s,v)=>s+v*v,0)/3;
 let best={score:Infinity,dx:0,dy:0,bias:[0,0,0],error:Infinity};
 for(let dy=-search;dy<=search;dy++)for(let dx=-search;dx<=search;dx++){
  if(x+dx<0||y+dy<0||x+width+dx>candidate.width||y+height+dy>candidate.height)continue;
  let sq=0,error=0;const differences=[0,0,0];
  for(const sample of samples){const i=((sample.y+dy)*candidate.width+sample.x+dx)*4;
   for(let c=0;c<3;c++){const d=candidate.data[i+c]-sample.rgb[c];sq+=d*d;error+=Math.abs(d);differences[c]+=d;}
  }
  const bias=differences.map(d=>d/count),score=Math.max(0,sq/(count*3)-bias.reduce((s,v)=>s+v*v,0)/3);
  if(score<best.score-1e-8||(Math.abs(score-best.score)<1e-8&&Math.hypot(dx,dy)<Math.hypot(best.dx,best.dy)))best={score,dx,dy,bias,error:error/(count*3)};
 }
 const candidateMean=mean.map((v,c)=>v+best.bias[c]);let covariance=0,candidateVariance=0;
 for(const sample of samples){const i=((sample.y+best.dy)*candidate.width+sample.x+best.dx)*4;
  for(let c=0;c<3;c++){const d=candidate.data[i+c]-candidateMean[c];covariance+=(sample.rgb[c]-mean[c])*d;candidateVariance+=d*d;}
 }
 const correlation=variance>0&&candidateVariance>0?covariance/(count*3)/Math.sqrt(variance*candidateVariance/(count*3)):0;
 return {id:region.id,source:[x+width/2+best.dx,y+height/2+best.dy],target:[x+width/2,y+height/2],
  error:best.error,structuralRms:Math.sqrt(best.score),colourShift:best.bias,textureVariance:variance,
  correlation,reliable:variance>50&&Number.isFinite(best.score)&&correlation>.94&&Math.abs(best.dx)<search&&Math.abs(best.dy)<search};
}

// This is a conservative preparation check, never an aesthetic approval.
export function assessTransition(from,to,{maxFrameDisplacement=12}={}){
 const keys=Object.keys(from.landmarks||{}).filter(key=>to.landmarks?.[key]);
 const moves=keys.map(key=>({key,distance:Math.hypot(...from.landmarks[key].map((v,i)=>v-to.landmarks[key][i]))}));
 const maxDisplacement=Math.max(0,...moves.map(m=>m.distance));
 const compatible=keys.length>=2&&from.alignment.accepted&&to.alignment.accepted;
 return {from:from.id,to:to.id,maxDisplacement,moves,geometryCompatible:compatible&&maxDisplacement<=maxFrameDisplacement,
  playable:false,requiresVisualReview:true,
  suggestedIntermediateCount:Math.max(0,Math.ceil(maxDisplacement/maxFrameDisplacement)-1),
  reason:!compatible?'alignment-needs-review':maxDisplacement>maxFrameDisplacement?'missing-motion-frames':'close-poses-still-need-visual-review'};
}
