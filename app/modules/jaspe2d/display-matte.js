// Display-only alpha: the original PNG and its RGB values are never rewritten.
// Border-connected background segmentation protects cool-white uniform fabric.
export function displayMatte(asset,width,height,holes=[],face=[515,310],options={}){
 const pixels=asset.pixels, count=width*height,background=new Uint8Array(count),queue=new Int32Array(count);
 const colors=Array.from({length:height},(_,y)=>{
  const c=[0,0,0];for(const x of [12,32,width-33,width-13])for(let k=0;k<3;k++)c[k]+=pixels[(y*width+x)*4+k]/4;return c;
 });
 const candidate=(index)=>{
  const p=index*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2],reference=colors[Math.floor(index/width)];
  const zone=options.shadowZone,x=index%width,y=Math.floor(index/width);
  if(zone&&x>=zone[0]&&x<=zone[2]&&y>=zone[1]&&y<=zone[3])return Math.min(r,g,b)>85&&Math.max(r,g,b)-Math.min(r,g,b)<40&&b-r<5;
  const footBackdrop=index/width>1300;
  return Math.min(r,g,b)>(footBackdrop?158:182)&&Math.max(r,g,b)-Math.min(r,g,b)<(footBackdrop?36:29)&&b-r<(footBackdrop?5:1)&&Math.max(Math.abs(r-reference[0]),Math.abs(g-reference[1]),Math.abs(b-reference[2]))<(footBackdrop?82:38);
 };
 let head=0,tail=0;
 const enqueue=i=>{if(!background[i]&&candidate(i)){background[i]=1;queue[tail++]=i;}};
 for(let x=0;x<width;x++){enqueue(x);enqueue((height-1)*width+x);}for(let y=1;y<height-1;y++){enqueue(y*width);enqueue(y*width+width-1);}
 // Pose-specific background islands enclosed by the bent arms.
 for(const [x,y]of holes)enqueue(y*width+x);
 while(head<tail){const i=queue[head++],x=i%width;if(x)enqueue(i-1);if(x<width-1)enqueue(i+1);if(i>=width)enqueue(i-width);if(i<count-width)enqueue(i+width);}
 // Interior spaces between dark curls have the same backdrop; never key the shirt.
 const fx=Math.round(face[0]-515),fy=Math.round(face[1]-310);
 for(let y=90+fy;y<358+fy;y++)for(let x=280+fx;x<735+fx;x++){const i=y*width+x;if((y<218+fy||x<411+fx||x>615+fx)&&candidate(i))background[i]=1;}
 // White socks may share the backdrop color. Fill only between the detected
 // left and right garment edges, independently for each leg and each row.
 for(let y=1120;y<1340;y++)for(const [start,end] of [[325,486],[544,686]]){
  let first=-1,last=-1;for(let x=start;x<end;x++)if(!background[y*width+x]){if(first<0)first=x;last=x;}
  if(first>=0&&last-first>32&&last-first<142)for(let x=first;x<=last;x++)background[y*width+x]=0;
 }
 const image=document.createElement('canvas');image.width=width;image.height=height;
 const ctx=image.getContext('2d'),data=new ImageData(new Uint8ClampedArray(pixels),width,height);
 for(let i=0;i<count;i++){
  if(background[i])data.data[i*4+3]=0;
  else{
   let neighbours=0;const x=i%width,y=Math.floor(i/width);
   if(x&&background[i-1])neighbours++;if(x<width-1&&background[i+1])neighbours++;if(y&&background[i-width])neighbours++;if(y<height-1&&background[i+width])neighbours++;
   if(neighbours)data.data[i*4+3]=Math.round(255*(1-neighbours*.12));
  }
 }
 ctx.putImageData(data,0,0);return {image,backgroundPixels:tail};
}
