export const canonicalEyes=[[473,288],[550,283]];
export function faceGeometry(eyes=canonicalEyes){
 const [a,b]=eyes,dx=b[0]-a[0],dy=b[1]-a[1],angle=Math.atan2(dy,dx)-Math.atan2(-5,77),scale=Math.hypot(dx,dy)/Math.hypot(77,5);
 const c=Math.cos(angle),s=Math.sin(angle),offset=[42,22];
 return {face:[a[0]+scale*(offset[0]*c-offset[1]*s),a[1]+scale*(offset[0]*s+offset[1]*c)],faceScale:scale,faceAngle:angle};
}
export function alignPortrait(asset,eyes,width,height){
 if(!eyes)return asset;
 const geo=faceGeometry(eyes),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.translate(515,310);ctx.rotate(-geo.faceAngle);ctx.scale(1/geo.faceScale,1/geo.faceScale);ctx.translate(-geo.face[0],-geo.face[1]);ctx.drawImage(asset.image,0,0);
 return {image:canvas,pixels:ctx.getImageData(0,0,width,height).data};
}
