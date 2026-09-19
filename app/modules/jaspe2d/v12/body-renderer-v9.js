import {smooth,clamp} from './motion.js';
import {registerPoint} from './pose-registration.js';
import {transformFootPoint} from './child-motion.js';

// This map is shared by the renderer and its geometric checks. Shoes move
// rigidly; the shin blends into the movement while the other foot stays planted.
export function deformBodyPoint(p,state){
 const [x,y]=p,q=registerPoint(p,state.registration),child=state.child,posture=child.posture;
 const face=state.renderPose?.face||[515,310],offsetX=face[0]-515,offsetY=face[1]-310;
 if(state.renderPose?.lowered){
  const upperWeight=1-smooth((y-(face[1]+310))/270);
  q[0]+=posture.shift*.35*upperWeight;
  q[1]-=state.breath*.7*Math.exp(-(((y-(face[1]+230))/170)**2));
  const hx=x-face[0],hy=y-(face[1]+77),mask=(1-smooth((y-(face[1]+48))/47))*(1-smooth((Math.abs(hx)-160)/53));
  const head=state.head||{},c=Math.cos(head.roll||0),s=Math.sin(head.roll||0);
  q[0]+=(hx*c-hy*s-hx)*mask;q[1]+=(hx*s+hy*c-hy)*mask;
  const hem=smooth((y-(face[1]+340))/270)*(1-smooth((y-(face[1]+720))/55));
  q[0]+=child.skirt.sway*hem*.7;q[1]+=Math.sin((x-face[0])/50)*child.skirt.sway*hem*.16;
  return q;
 }
 const anchored=1-smooth((y-980)/330),upper=1-smooth((y-900)/160);
 const leanCos=Math.cos(posture.lean),leanSin=Math.sin(posture.lean),dx=x-515,dy=y-900;
 q[0]+=posture.shift*anchored+(dx*leanCos-dy*leanSin-dx)*upper;
 q[1]+=posture.bob*anchored+(dx*leanSin+dy*leanCos-dy)*upper;
 const chest=Math.exp(-(((y-545)/130)**2)),central=1-smooth((Math.abs(x-515)-170)/100);
 q[0]+=(x-515)*.0035*state.breath*chest*central;
 q[1]-=state.breath*.9*Math.exp(-(((y-520)/185)**2))*central;
 for(let side=0;side<2;side++)q[1]+=child.shoulders[side]*Math.exp(-(((x-(side===0?367:660))/91)**2)-(((y-487)/112)**2));
 const hem=smooth((y-650)/325)*(1-smooth((y-1035)/55));
 q[0]+=child.skirt.sway*hem;
 const fold=(Math.sin((x-515)/38)*.18+Math.sin((x-515)/73)*.1)*child.skirt.sway*hem;q[1]+=fold;q[1]+=(x-515)/240*child.skirt.sway*.27*hem;
 const left=1-smooth((x-452)/112),leg=smooth((y-1080)/215);
 for(let side=0;side<2;side++){
  const step=child.steps[side],share=side===0?left:1-left;
  if(leg>0&&share>0){const moved=transformFootPoint(p,step);q[0]+=(moved[0]-x)*leg*share;q[1]+=(moved[1]-y)*leg*share;}
  q[0]+=step.knee*Math.sin(Math.PI*clamp((y-960)/350))*share;
 }
 const head=state.head||{},headMask=(1-smooth((y-(face[1]+48))/47))*(1-smooth((Math.abs(x-face[0])-165)/53));
 if(headMask>0){
  const hx=x-face[0],hy=y-(face[1]+77),depth=62*Math.sqrt(Math.max(0,1-((x-face[0])/122)**2-((y-(face[1]-18))/139)**2));
  const tx=hx*Math.cos(head.yaw||0)+depth*Math.sin(head.yaw||0),ty=hy*Math.cos(head.pitch||0)-depth*Math.sin(head.pitch||0),c=Math.cos(head.roll||0),s=Math.sin(head.roll||0);
  q[0]+=(tx*c-ty*s-hx)*headMask;q[1]+=(tx*s+ty*c-hy)*headMask;
 }
 return q;
}

export function createBodyRenderer(width,height){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
 if(!gl)throw new Error('Animation du corps indisponible dans ce navigateur.');
 const vertex='attribute vec2 p;attribute vec2 sourceUV;uniform vec2 size;varying vec2 uv;void main(){uv=sourceUV;gl_Position=vec4(p.x/size.x*2.-1.,1.-p.y/size.y*2.,0.,1.);}';
 const fragment='precision mediump float;uniform sampler2D photo;varying vec2 uv;void main(){vec4 c=texture2D(photo,uv);gl_FragColor=vec4(c.rgb*c.a,c.a);}';
 function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;}
 const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const cols=Math.ceil(width/16)+1,rows=Math.ceil(height/16)+1,source=[],indices=[],vertices=new Float32Array(cols*rows*4);
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const x=Math.min(col*16,width),y=Math.min(row*16,height),i=row*cols+col;source.push([x,y]);vertices.set([x,y,x/width,y/height],i*4);
  if(col<cols-1&&row<rows-1)indices.push(i,i+1,i+cols,i+cols,i+1,i+cols+1);
 }
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);
 const element=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,element);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
 for(const [name,offset]of [['p',0],['sourceUV',8]]){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,16,offset);}
 gl.uniform2f(gl.getUniformLocation(program,'size'),width,height);
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.viewport(0,0,width,height);
 return {canvas,render(scene,state){
  for(let i=0;i<source.length;i++){const q=deformBodyPoint(source[i],state);vertices[i*4]=q[0];vertices[i*4+1]=q[1];}
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices);
  gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,scene);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
 }};
}
