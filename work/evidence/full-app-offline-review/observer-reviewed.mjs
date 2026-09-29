// Test-page observation only. No simulation calls or authoritative state writes.
import {fromBinary,toJson} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,OrderBatchSchema} from '../../src/protocol/frontline_pb';
const data={workers:[],methods:{},requests:[],replies:[],errors:[],consoleErrors:[],httpErrors:[],exports:[],results:[],saves:[],latest:null,clock:null,overflow:false};
const append=(key,value,limit=512)=>{if(data[key].length>=limit){data.overflow=true;return}data[key].push(value)};
const stamp=()=>performance.now();
const view=bytes=>{const raw=fromBinary(PlayerSnapshotSchema,bytes),j=toJson(PlayerSnapshotSchema,raw);return {metadata:j.metadata,tick:raw.tick,countdown:raw.countdown,player:raw.player,economy:j.economy,players:j.players??[],entities:j.entities??[],results:j.results??[],outcome:j.outcome}};
const message=e=>String(e?.stack??e?.message??e);
addEventListener('error',e=>append('errors',{kind:'window/resource',message:e.message??e.target?.src??e.target?.href??'unknown resource'}),true);
addEventListener('unhandledrejection',e=>append('errors',{kind:'rejection',message:message(e.reason)}));
const oldError=console.error;console.error=function(...args){append('consoleErrors',args.map(message));return oldError.apply(this,args)};
const oldFetch=window.fetch;window.fetch=async function(...args){try{const r=await oldFetch.apply(this,args);if(!r.ok)append('httpErrors',{url:r.url,status:r.status});return r}catch(e){append('httpErrors',{url:String(args[0]),error:message(e)});throw e}};
const Base=window.Worker;let next=0;const seenResults=new Set();
window.Worker=class extends Base{
 constructor(...args){super(...args);if(args[1]?.name!=='Frontline Go simulation')return;
  const worker={id:++next,url:String(args[0]),live:true,createdAt:stamp()},pending=new Map();data.workers.push(worker);
  this.addEventListener('error',e=>append('errors',{kind:'worker',worker:worker.id,message:e.message}));
  this.addEventListener('message',e=>{const m=e.data;try{
   if(m.event==='frame'){const snapshot=view(m.bytes);data.latest={worker:worker.id,...snapshot};for(const result of snapshot.results){const key=JSON.stringify(result);if(!seenResults.has(key)){seenResults.add(key);append('results',result)}}for(const request of pending.values())if(['create','load','loadReplay','seekReplay'].includes(request.method)&&!request.firstFrame)request.firstFrame=snapshot;return}
   if(m.event==='clock'){data.clock={worker:worker.id,...m};return}
   if(m.event==='error'){append('errors',{kind:'runtime',worker:worker.id,error:m.error});return}
   const request=pending.get(m.id);if(!request)return;pending.delete(m.id);
   if(!m.ok)append('errors',{kind:'rpc',method:request.method,error:m.error});
   if(request.method==='save'&&m.ok){append('saves',{worker:worker.id,id:m.id,time:stamp(),tick:m.result.tick,hash:m.result.hash,metadata:m.result.metadata,engine:new TextDecoder().decode(m.result.data)},16)}
   if(request.method==='content'&&m.ok)data.catalogRig=m.result.units?.find(u=>u.id==='US.rig');
   if(['create','load','loadReplay','seekReplay','pause','resume','submit','save','exportReplay','inspect','inspectReplay'].includes(request.method))append('replies',{worker:worker.id,id:m.id,method:request.method,ok:m.ok,result:['create','load','loadReplay','seekReplay','inspect','inspectReplay'].includes(request.method)?m.result:undefined,firstFrame:request.firstFrame,time:stamp()});
  }catch(error){append('errors',{kind:'observer-decode',message:message(error)})}});
  const original=this.postMessage;this.postMessage=function(m,...rest){if(m?.method){data.methods[m.method]=(data.methods[m.method]??0)+1;const request={worker:worker.id,id:m.id,method:m.method,time:stamp()};
   if(m.method==='submit')request.batch=toJson(OrderBatchSchema,fromBinary(OrderBatchSchema,m.args[0]));
   if(m.method==='create'){const c=m.args[0];request.config={seed:c.seed,ruleset:c.ruleset,players:c.players,map:{id:c.map.id,width:c.map.width,height:c.map.height}};data.create=request.config}
   if(m.method==='load')request.engine=new TextDecoder().decode(m.args[0]);
   if(m.method==='seekReplay')request.tick=m.args[0];pending.set(m.id,request);
   if(['create','load','loadReplay','seekReplay','pause','resume','submit','exportReplay'].includes(m.method))append('requests',request);
  }return original.call(this,m,...rest)};
  const terminate=this.terminate;this.terminate=function(){worker.live=false;worker.terminatedAt=stamp();return terminate.call(this)};
 }
};
// Capture the actual App-generated download blob. Suppress only its native OS
// download dispatch, keeping Safari Downloads and browser preferences untouched.
const blobs=new Map(),objectURL=URL.createObjectURL,revokeURL=URL.revokeObjectURL;
URL.createObjectURL=function(blob){const url=objectURL.call(this,blob);if(blob instanceof Blob)blobs.set(url,blob);return url};
URL.revokeObjectURL=function(url){blobs.delete(url);return revokeURL.call(this,url)};
const anchorClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){const blob=blobs.get(this.href);if(this.download&&blob){const entry={name:this.download,mime:blob.type,size:blob.size,ready:false};append('exports',entry,8);void blob.arrayBuffer().then(buffer=>{const b=new Uint8Array(buffer);let binary='';for(let i=0;i<b.length;i+=16384)binary+=String.fromCharCode(...b.subarray(i,i+16384));entry.base64=btoa(binary);entry.ready=true}).catch(e=>append('errors',{kind:'export-capture',message:message(e)}));return}return anchorClick.call(this)};
// Normal polling avoids retransferring multi-megabyte save/export bodies. Full
// evidence is read only for explicit integrity assertions and the final receipt.
window.__stockQA={read:(large=false)=>large?data:{...data,
 requests:data.requests.map(({engine,...entry})=>({...entry,engineBytes:engine?.length})),
 saves:data.saves.map(({engine,...entry})=>({...entry,engineBytes:engine.length})),
 exports:data.exports.map(({base64,...entry})=>entry),
}};
