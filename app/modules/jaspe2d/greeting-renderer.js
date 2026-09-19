import {SOURCE_ARM,greetingRig} from './greeting-motion.js?v=salut-01';
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const angle=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0]);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function rotate(p,source,target,rotation){const x=p[0]-source[0],y=p[1]-source[1],c=Math.cos(rotation),s=Math.sin(rotation);return[target[0]+c*x-s*y,target[1]+s*x+c*y];}
function jointBlend(p,previous,joint,next,radius){
  const a=angle(previous,joint),b=angle(joint,next),tx=Math.cos(a)+Math.cos(b),ty=Math.sin(a)+Math.sin(b),length=Math.hypot(tx,ty);
  return smooth(.5+((p[0]-joint[0])*tx+(p[1]-joint[1])*ty)/(length*radius*2));
}
// A single texture per limb. The hand is rotated as a rigid part; the transition
// is confined to the wrist. Rotation interpolation avoids collapsing the elbow.
export function deformGreetingArm(p,rig){
  const source=SOURCE_ARM,upper=wrap(angle(rig[0],rig[1])-angle(source[0],source[1])),fore=wrap(angle(rig[1],rig[2])-angle(source[1],source[2]));
  const t=jointBlend(p,source[0],source[1],source[2],24);
  return rotate(p,source[1],rig[1],upper+wrap(fore-upper)*t);
}
export function createGreetingRenderer(asset,restAsset,W,H){
  const make=()=>Object.assign(document.createElement('canvas'),{width:W,height:H});
  const canvas=make(),ctx=canvas.getContext('2d'),body=make(),b=body.getContext('2d'),arm=make(),a=arm.getContext('2d');
  // Deliberate cut along the existing clothing seam, not a colour-key on skin.
  const mask=new Path2D('M 196 335 L 350 335 L 350 397 L 399 415 L 406 432 L 402 619 L 395 660 L 211 660 Z');
  b.drawImage(asset.image,0,0);b.globalCompositeOperation='destination-out';b.fill(mask);b.globalCompositeOperation='source-over';
  // The straight reference supplies the entire elbow surface, including the area
  // hidden by the forearm in the waving photo. The validated hand is a rigid layer.
  const sleeve=new Path2D('M 310 410 L 405 410 L 405 600 L 338 578 L 310 560 Z');
  const sleeveLayer=make(),sleeveContext=sleeveLayer.getContext('2d');
  sleeveContext.save();sleeveContext.clip(sleeve);sleeveContext.drawImage(restAsset.image,0,0);sleeveContext.restore();
  a.drawImage(restAsset.image,0,0);
  const pixels=a.getImageData(0,0,W,H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=(y*W+x)*4;
    const skin=smooth((pixels.data[i]-pixels.data[i+1]-12)/16);
    pixels.data[i+3]*=x>=295&&x<=405&&y>=566&&y<=808?skin:0;
  }
  a.putImageData(pixels,0,0);
  const hand=make(),h=hand.getContext('2d');
  h.save();h.beginPath();h.rect(208,338,135,165);h.clip();h.drawImage(asset.image,0,0);h.restore();
  const handPixels=h.getImageData(0,0,W,H);
  for(let i=0;i<handPixels.data.length;i+=4)handPixels.data[i+3]*=smooth((handPixels.data[i]-handPixels.data[i+1]-12)/16);
  h.putImageData(handPixels,0,0);
  const mesh=make(),gl=mesh.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,preserveDrawingBuffer:true});
  if(!gl)throw new Error('Greeting WebGL unavailable');
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  const program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p;attribute vec2 uv;uniform vec2 size;varying vec2 v;void main(){v=uv;gl_Position=vec4(p.x/size.x*2.-1.,1.-p.y/size.y*2.,0.,1.);}'));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D image;varying vec2 v;void main(){vec4 c=texture2D(image,v);gl_FragColor=vec4(c.rgb*c.a,c.a);}'));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  const points=[],indices=[],step=4,cols=31,rows=64,vertices=new Float32Array(cols*rows*4);
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const x=290+col*step,y=560+row*step,i=row*cols+col;points.push([x,y]);vertices.set([x,y,x/W,y/H],i*4);
    if(col<cols-1&&row<rows-1)indices.push(i,i+1,i+cols,i+cols,i+1,i+cols+1);
  }
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.DYNAMIC_DRAW);
  const element=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,element);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  for(const [name,offset]of [['p',0],['uv',8]]){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,16,offset);}
  gl.uniform2f(gl.getUniformLocation(program,'size'),W,H);gl.uniform1i(gl.getUniformLocation(program,'image'),0);
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,arm);
  for(const param of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,param,gl.LINEAR);
  for(const param of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE);
  gl.viewport(0,0,W,H);
  return {canvas,render(channels,postprocess){
    const rig=greetingRig(channels);
    for(let i=0;i<points.length;i++){const q=deformGreetingArm(points[i],rig);vertices[i*4]=q[0];vertices[i*4+1]=q[1];}
    gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
    ctx.clearRect(0,0,W,H);ctx.drawImage(body,0,0);ctx.drawImage(mesh,0,0);
    ctx.save();ctx.translate(...rig[2]);ctx.rotate(angle(rig[2],rig[3])-angle([281,487],[274,421]));ctx.translate(-281,-487);ctx.drawImage(hand,0,0);ctx.restore();
    ctx.drawImage(sleeveLayer,0,0);
    if(postprocess){const result=postprocess(canvas,'wave');ctx.clearRect(0,0,W,H);ctx.drawImage(result,0,0);}
    return canvas;
  }};
}
