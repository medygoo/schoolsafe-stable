import {smooth,clamp,photoMix} from './motion.js';

function distance(point,a,b){const x=b[0]-a[0],y=b[1]-a[1],t=clamp(((point[0]-a[0])*x+(point[1]-a[1])*y)/(x*x+y*y));return Math.hypot(point[0]-a[0]-x*t,point[1]-a[1]-y*t);}
export function photoWeights(point,arms){
 const distances=arms.flatMap(arm=>arm.slice(0,-1).map((p,i)=>{const end=i===3?[p[0]+(arm[4][0]-p[0])*2.8,p[1]+(arm[4][1]-p[1])*2.8]:arm[i+1];return distance(point,p,end);}));
 const nearest=distances.indexOf(Math.min(...distances)),side=Math.floor(nearest/4),segment=nearest%4;
 const radius=[58,40,33,55][segment];
 let influence=1-smooth((distances[nearest]-radius)/65);
 // Head and feet remain fixed within each image transition; the shared base owns them.
 influence*=smooth((point[1]-170)/45)*(1-smooth((point[1]-965)/100));
 if(point[1]<400&&point[0]>400&&point[0]<633)influence=0;
 const weights=Array(9).fill(0);weights[8]=1-influence;
 const raw=Array(4).fill(0);
 for(let j=0;j<4;j++){if(Math.abs(j-segment)<=1)raw[j]=Math.exp(-Math.max(0,distances[side*4+j]-distances[nearest])/15);}
 const total=raw.reduce((a,b)=>a+b,0);for(let j=0;j<4;j++)weights[side*4+j]=raw[j]/total*influence;
 return weights;
}
function matrix(a,b,c,d){
 const sx=b[0]-a[0],sy=b[1]-a[1],tx=d[0]-c[0],ty=d[1]-c[1],sl=Math.hypot(sx,sy),tl=Math.hypot(tx,ty),ux=sx/sl,uy=sy/sl,vx=tx/tl,vy=ty/tl,k=tl/sl;
 const m0=k*vx*ux+vy*uy,m1=k*vy*ux-vx*uy,m3=k*vx*uy-vy*ux,m4=k*vy*uy+vx*ux;
 return new Float32Array([m0,m1,0,m3,m4,0,c[0]-m0*a[0]-m3*a[1],c[1]-m1*a[0]-m4*a[1],1]);
}
export function createPhotoRenderer(loaded,poses,width,height){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});if(!gl)throw new Error('Rendu 2.5D indisponible.');
 const vertex=`attribute vec2 p;attribute vec4 wa;attribute vec4 wb;attribute float anchorWeight;uniform float maxWarp;uniform mat3 bones[8];uniform vec2 size;varying vec2 uv;void main(){uv=p/size;vec3 v=vec3(p,1.);vec2 q=p*anchorWeight;
 q+=(bones[0]*v).xy*wa.x+(bones[1]*v).xy*wa.y+(bones[2]*v).xy*wa.z+(bones[3]*v).xy*wa.w;
 q+=(bones[4]*v).xy*wb.x+(bones[5]*v).xy*wb.y+(bones[6]*v).xy*wb.z+(bones[7]*v).xy*wb.w;
 // Photo differences must not stretch hands into unverified shapes.
 vec2 delta=q-p;float len=length(delta);q=p+delta*min(1.,maxWarp/max(len,.001));
 gl_Position=vec4(q.x/size.x*2.-1.,1.-q.y/size.y*2.,0.,1.);}`;
 const fragment='precision mediump float;uniform sampler2D photo;uniform float opacity;varying vec2 uv;void main(){vec4 c=texture2D(photo,uv);gl_FragColor=vec4(c.rgb*c.a,c.a);}';
 function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
 const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const locations=Object.fromEntries(['p','wa','wb','anchorWeight'].map(k=>[k,gl.getAttribLocation(program,k)]));
 const bones=Array.from({length:8},(_,i)=>gl.getUniformLocation(program,'bones['+i+']')),opacity=gl.getUniformLocation(program,'opacity');
 gl.uniform2f(gl.getUniformLocation(program,'size'),width,height);gl.viewport(0,0,width,height);gl.disable(gl.BLEND);
 // Bound GPU residency; original photos remain available without uploading all
 // eighty-plus full-resolution textures at startup.
 const models=new Map();
 function getModel(key){
  if(models.has(key)){const m=models.get(key);models.delete(key);models.set(key,m);return m;}
  const pose=poses[key];
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,loaded[key].image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const vertices=[],step=10;const push=(x,y)=>vertices.push(x,y,...photoWeights([x,y],pose.arms));
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){const r=Math.min(width,x+step),b=Math.min(height,y+step);push(x,y);push(r,y);push(x,b);push(x,b);push(r,y);push(r,b);}
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);const model={texture,buffer,count:vertices.length/11};models.set(key,model);
  if(models.size>6){const oldest=models.keys().next().value,old=models.get(oldest);gl.deleteTexture(old.texture);gl.deleteBuffer(old.buffer);models.delete(oldest);}
  return model;
 }
 function draw(key,rig,alpha){
  const model=getModel(key);gl.bindBuffer(gl.ARRAY_BUFFER,model.buffer);
  for(const [name,size,offset] of [['p',2,0],['wa',4,8],['wb',4,24],['anchorWeight',1,40]]){gl.enableVertexAttribArray(locations[name]);gl.vertexAttribPointer(locations[name],size,gl.FLOAT,false,44,offset);}
  for(let side=0;side<2;side++)for(let j=0;j<4;j++)gl.uniformMatrix3fv(bones[side*4+j],false,matrix(poses[key].arms[side][j],poses[key].arms[side][j+1],rig[side][j],rig[side][j+1]));
  gl.bindTexture(gl.TEXTURE_2D,model.texture);gl.uniform1f(opacity,alpha);gl.drawArrays(gl.TRIANGLES,0,model.count);
 }
 const output=document.createElement('canvas');output.width=width;output.height=height;const ctx=output.getContext('2d');
 let finishPose=null;
 function paint(key,rig,opacity){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.uniform1f(gl.getUniformLocation(program,'maxWarp'),poses[key].motionGroup==='walk'?44:10);draw(key,rig,1);ctx.globalAlpha=opacity;ctx.drawImage(finishPose?finishPose(canvas,key):canvas,0,0);}
 // Keyframes remain geometrically intact during transitions. Large interpolated
 // limb warps are deliberately excluded until sufficient matching frames exist.
 return {canvas:output,render(frame,rig,postprocess){finishPose=postprocess;ctx.clearRect(0,0,width,height);ctx.globalCompositeOperation='lighter';if(frame.from===frame.to)paint(frame.to,rig,1);else{const mix=photoMix(frame);if(mix<1)paint(frame.from,poses[frame.from].motionGroup==='walk'&&poses[frame.to].motionGroup==='walk'?rig:poses[frame.from].arms,1-mix);if(mix>0)paint(frame.to,poses[frame.from].motionGroup==='walk'&&poses[frame.to].motionGroup==='walk'?rig:poses[frame.to].arms,mix);}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}};
}
