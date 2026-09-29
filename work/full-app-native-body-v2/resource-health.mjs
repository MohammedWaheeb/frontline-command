// Page-realm diagnostic only. Never retains GL objects/canvases, calls getError,
// forces GC, changes allocation, or submits rendering. Bytes are API estimates.
export function installResourceHealth(env=globalThis,{maxResources=16384,maxContexts=16,maxFrameSamples=2048}={}){
 const contexts=[],contextMap=new WeakMap(),objects=new WeakMap(),faults=[],restores=[];let resourceCount=0,nextID=0,stopped=false,frameID,lastFrame,frames=[],frameTotal=0;
 const fault=e=>{if(faults.length<32)faults.push(String(e))};
 const context=gl=>{
  let c=contextMap.get(gl);if(c)return c;if(contexts.length>=maxContexts)throw Error('GL context observation limit');
  c={id:contexts.length+1,gl:new WeakRef(gl),canvas:new WeakRef(gl.canvas),role:'unattributed',lost:false,generation:0,resources:[],bindings:new Map(),unit:0,created:0,deleted:0,peakBytes:0};contextMap.set(gl,c);contexts.push(c);
  gl.canvas?.addEventListener?.('webglcontextlost',()=>{c.lost=true;for(const r of c.resources)if(r.live){r.live=false;r.releasedBy='context-lost'}c.bindings.clear()});
  gl.canvas?.addEventListener?.('webglcontextrestored',()=>{c.lost=false;c.generation++});return c;
 };
 const id=value=>value?objects.get(value)?.id:undefined;
 const find=(c,value)=>c.resources.find(r=>r.id===value);
 const bindingKey=(c,target)=>'texture:'+c.unit+':'+(target>=34069&&target<=34074?34067:target);
 const boundTexture=(c,target)=>find(c,c.bindings.get(bindingKey(c,target)));
 function size(format,type){
  const internal={33321:1,33323:2,32849:3,32856:4,35907:4,33189:2,33190:3,35056:4,34842:8,34836:16,33325:2,33326:4,33327:4,33328:8};
  if(internal[format])return internal[format];const components={6408:4,6407:3,6406:1,6409:1,6410:2,6403:1,33319:2},scalar={5121:1,5120:1,5123:2,5122:2,5125:4,5124:4,5126:4,5131:2,36193:2};
  if([32819,32820,33635].includes(type))return 2;if([34042,35899,35902].includes(type))return 4;return components[format]&&scalar[type]?components[format]*scalar[type]:undefined;
 }
 const total=c=>c.resources.reduce((sum,r)=>sum+(r.live?(r.bytes??0):0),0);
 function allocated(c,kind,value){if(!value)return;if(resourceCount>=maxResources)throw Error('Resource observation limit');resourceCount++;const r={id:++nextID,kind,generation:c.generation,live:true,bytes:kind==='texture'||kind==='renderbuffer'?null:0,levels:{}};objects.set(value,r);c.resources.push(r);c.created++}
 function allocation(c,r,key,width,height,depth,bpp,samples=1){if(!r)return;if(![width,height,depth,samples].every(n=>Number.isSafeInteger(n)&&n>=0)||!bpp){r.bytes=null;r.unknown=true;return}r.levels[key]=width*height*depth*bpp*samples;r.bytes=Object.values(r.levels).reduce((a,b)=>a+b,0);c.peakBytes=Math.max(c.peakBytes,total(c))}
 const methods={
  createTexture:(c,a,r)=>allocated(c,'texture',r),createBuffer:(c,a,r)=>allocated(c,'buffer',r),createFramebuffer:(c,a,r)=>allocated(c,'framebuffer',r),createRenderbuffer:(c,a,r)=>allocated(c,'renderbuffer',r),createProgram:(c,a,r)=>allocated(c,'program',r),createShader:(c,a,r)=>allocated(c,'shader',r),
  deleteTexture:deleted,deleteBuffer:deleted,deleteFramebuffer:deleted,deleteRenderbuffer:deleted,deleteProgram:deleted,deleteShader:deleted,
  activeTexture(c,a){c.unit=a[0]-33984},bindTexture(c,a){c.bindings.set(bindingKey(c,a[0]),id(a[1]))},bindBuffer(c,a){c.bindings.set('buffer:'+a[0],id(a[1]))},bindRenderbuffer(c,a){c.bindings.set('renderbuffer:'+a[0],id(a[1]))},
  bufferData(c,a){const r=find(c,c.bindings.get('buffer:'+a[0]));if(r){r.bytes=typeof a[1]==='number'?a[1]:a[3]!==undefined?(a[4]??(a[1].length-a[3]))*(a[1].BYTES_PER_ELEMENT??1):a[1]?.byteLength??0;c.peakBytes=Math.max(c.peakBytes,total(c))}},
  texImage2D(c,a){const source=a[5],explicit=typeof a[3]==='number'&&a.length>=9;const w=explicit?a[3]:source?.videoWidth??source?.naturalWidth??source?.width,h=explicit?a[4]:source?.videoHeight??source?.naturalHeight??source?.height;const r=boundTexture(c,a[0]);allocation(c,r,a[0]+':'+a[1],w,h,1,size(explicit?a[6]:a[3],explicit?a[7]:a[4]));if(r&&a[1]===0)r.base={width:w,height:h,bpp:size(explicit?a[6]:a[3],explicit?a[7]:a[4]),target:a[0]}},
  texStorage2D(c,a){const r=boundTexture(c,a[0]);if(r)r.levels={};for(let level=0;level<a[1];level++)allocation(c,r,a[0]+':'+level,Math.max(1,a[3]>>level),Math.max(1,a[4]>>level),1,size(a[2]));},
  texImage3D(c,a){allocation(c,boundTexture(c,a[0]),a[0]+':'+a[1],a[3],a[4],a[5],size(a[7],a[8]))},
  texStorage3D(c,a){const r=boundTexture(c,a[0]);if(r)r.levels={};for(let level=0;level<a[1];level++)allocation(c,r,a[0]+':'+level,Math.max(1,a[3]>>level),Math.max(1,a[4]>>level),a[0]===35866?a[5]:Math.max(1,a[5]>>level),size(a[2]));},
  generateMipmap(c,a){const r=boundTexture(c,a[0]),base=r?.base;if(base){for(let level=1;Math.max(base.width,base.height)>>level;level++)allocation(c,r,base.target+':'+level,Math.max(1,base.width>>level),Math.max(1,base.height>>level),1,base.bpp)}else if(r){r.unknown=true}},
  renderbufferStorage(c,a){allocation(c,find(c,c.bindings.get('renderbuffer:'+a[0])),'storage',a[2],a[3],1,size(a[1]))},
  renderbufferStorageMultisample(c,a){allocation(c,find(c,c.bindings.get('renderbuffer:'+a[0])),'storage',a[3],a[4],1,size(a[2]),Math.max(1,a[1]))},
 };
 function deleted(c,a){const r=objects.get(a[0]);if(r?.live){r.live=false;r.releasedBy='explicit-delete';c.deleted++}}
 for(const Constructor of [env.WebGLRenderingContext,env.WebGL2RenderingContext].filter(Boolean))for(const [name,observe]of Object.entries(methods)){
  const proto=Constructor.prototype,descriptor=Object.getOwnPropertyDescriptor(proto,name);if(typeof descriptor?.value!=='function')continue;const original=descriptor.value;
  const wrapper=function(...args){const result=Reflect.apply(original,this,args);try{if(!stopped)observe(context(this),args,result)}catch(error){fault(error)}return result};
  Object.defineProperty(proto,name,{...descriptor,value:wrapper});restores.push(()=>Object.defineProperty(proto,name,descriptor));
 }
 function frame(now){if(stopped)return;if(lastFrame!==undefined){const interval=now-lastFrame;frames.push(interval);if(frames.length>maxFrameSamples)frames.shift();frameTotal++}lastFrame=now;frameID=env.requestAnimationFrame(frame)}
 if(typeof env.requestAnimationFrame==='function')frameID=env.requestAnimationFrame(frame);
 const sample=(resetFrames=false)=>{
  const sorted=[...frames].sort((a,b)=>a-b),p=n=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*n))]:null;
  const result={scope:'Page WebGL API allocations and page RAF pacing only; not actual GPU memory, ArtLibrary cache bytes or renderer draw cost. Weak references; no forced GC.',limits:{maxResources,maxContexts,maxFrameSamples},faults:[...faults],frame:{samples:frames.length,total:frameTotal,p50:p(.5),p95:p(.95),p99:p(.99),over50:frames.filter(n=>n>50).length},contexts:contexts.map(c=>{
   const canvas=c.canvas.deref();if(canvas?.closest?.('.battlefield-canvas'))c.role='battlefield';
   const gl=c.gl.deref(),live=c.resources.filter(r=>r.live),lost=c.lost||gl?.isContextLost?.()===true;
   return {id:c.id,role:c.role,generation:c.generation,canvasConnected:canvas?.isConnected??false,contextCollected:!gl,lost,created:c.created,explicitDeleted:c.deleted,liveCounts:Object.fromEntries(['texture','buffer','framebuffer','renderbuffer','program','shader'].map(kind=>[kind,live.filter(r=>r.kind===kind).length])),liveEstimatedBytes:total(c),unknownAllocations:live.filter(r=>r.unknown||r.bytes===null).length,peakEstimatedBytes:c.peakBytes,unreleased:live.map(({id,kind,bytes})=>({id,kind,bytes}))};
  })};if(resetFrames){frames=[];lastFrame=undefined}return result;
 };
 return {sample,stop(){stopped=true;if(frameID!==undefined)env.cancelAnimationFrame?.(frameID);for(const restore of restores.reverse())restore();return sample()}};
}
export function resourceCleanup(report){
 const battle=report.contexts.filter(c=>c.role==='battlefield');
 return {status:report.faults.length?'observer-incomplete':!battle.length?'no-attributed-battlefield-context':battle.every(c=>!c.canvasConnected&&(c.lost||c.contextCollected||Object.values(c.liveCounts).every(n=>n===0)))?'passed-observed-context-release':'unresolved-live-allocations',battlefieldContexts:battle.map(c=>c.id),scope:'Observable GL disposal only; does not prove JS/image/asset-cache total memory release.'};
}
