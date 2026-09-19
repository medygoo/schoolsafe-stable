import {smooth} from './motion.js';
const eyes=[{cx:473,cy:288,rx:25,ry:13},{cx:550,cy:283,rx:24,ry:13}];

// Colors, lashes and irises come from the approved photo and its generated blink edit.
export function createEyeRenderer(open,closed,width){
 // Retain only the eye region, not two complete 6 MB portraits per expression.
 const cropX=425,cropY=235,cropW=170,cropH=112;
 const crop=data=>{const result=new Uint8ClampedArray(cropW*cropH*4);for(let row=0;row<cropH;row++)result.set(data.subarray(((cropY+row)*width+cropX)*4,((cropY+row)*width+cropX+cropW)*4),row*cropW*4);return result;};
 open=crop(open);closed=crop(closed);
 const x0=436,y0=257,w=146,h=61;
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const context=canvas.getContext('2d'),output=context.createImageData(w,h);
 function sample(data,x,y,c){
  x-=cropX;y-=cropY;
  const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy,index=(iy*cropW+ix)*4+c;
  return (data[index]*(1-dx)+data[index+4]*dx)*(1-dy)+(data[index+cropW*4]*(1-dx)+data[index+cropW*4+4]*dx)*dy;
 }
 return {canvas,x:x0,y:y0,render(eyelids,gaze){
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const px=x0+x,py=y0+y,side=px<510?0:1,eye=eyes[side],blink=Array.isArray(eyelids)?eyelids[side]:eyelids,nx=(px-eye.cx)/eye.rx;
   const radial=Math.hypot((px-eye.cx)/(eye.rx+7),(py-eye.cy)/(eye.ry+10));
   const feather=1-smooth((radial-.78)/.22),i=(y*w+x)*4;
   const gazeWeight=1-smooth((Math.hypot(nx,(py-eye.cy)/eye.ry)-.55)/.45);
   let sx=px-gaze[0]*gazeWeight,sy=py-gaze[1]*gazeWeight,closedY=py,closedWeight=0;
   if(blink>0&&Math.abs(nx)<1.24){
    const curve=Math.sqrt(Math.max(0,1-nx*nx));
    const top=eye.cy-eye.ry*curve,bottom=eye.cy+eye.ry*.85*curve,line=eye.cy+eye.ry*.63*curve;
    const upper=top+(line-top)*blink,lower=bottom+(line-bottom)*blink;
    // Eyelids cover a stationary iris; never squeeze the whole eye vertically.
    const above=smooth((upper-py+.7)/1.4),below=smooth((py-lower+.7)/1.4);
    closedWeight=Math.max(above,below)*smooth(blink/.10);
    // The lower lid uses cheek skin, not a second copy of the upper lash line.
    const offset=py<upper?line-upper:Math.max(0,line+8-lower);
    closedY=py+offset*feather*(1-smooth((blink-.88)/.12));
    if(blink>=.999){closedWeight=1;closedY=py;}
   }
   for(let c=0;c<3;c++)output.data[i+c]=sample(open,sx,sy,c)*(1-closedWeight)+sample(closed,px,closedY,c)*closedWeight;
   output.data[i+3]=Math.round(feather*255);
  }
  context.putImageData(output,0,0);return canvas;
 }};
}
