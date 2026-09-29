import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ArtLibrary} from '../../art-generation-consumer-v1/frozen-v2/client/src/render/art';
import {authoredArtId} from '../../art-generation-consumer-v1/frozen-v2/client/src/render/art-id';
import {captureAssetGeneration} from '../../art-generation-consumer-v1/frozen-v2/client/src/runtime/asset-generation';

const origin='http://127.0.0.1:17990',encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const sha=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
const catalog=JSON.parse(await readFile('pkg/content/rules.json','utf8'));
const ids=[...new Set(['US','IR','SY','SA'].flatMap(faction=>[
 ...catalog.units.filter((unit:any)=>unit.faction===faction),
 ...catalog.buildings.filter((building:any)=>!building.faction||building.faction===faction),
].map((entry:any)=>authoredArtId(entry.id,faction))))].filter(Boolean) as string[];
assert.equal(ids.length,136);
const source=encode({format_version:1,version:'review',packs:[{id:'2.0.0',version:'review',manifest_url:'/assets/packs/base.json'}],maps:[],missions:[]});
const art={format:1,sprites:Object.fromEntries(ids.map((id,index)=>[id,`s${index}.json`])),terrain:[],portraits:['US.rifle'],chrome:[],icons:false,emblems:false};
const bodies=new Map<string,Uint8Array>([['/content/index.json',source],['/art/index.json',encode(art)],['/art/test.png',new Uint8Array([1,2,3])],...['beauty','team'].map(layer=>[`/art/ui/portraits/US.rifle@2x.${layer}.png`,new Uint8Array([1,2,3])] as [string,Uint8Array])]);
for(const [index,id]of ids.entries())bodies.set(`/art/s${index}.json`,encode({id,frame_size_2x:[2,2],anchor_2x:[1,1],layers:[],atlases:{'1x':{},'2x':{}},states:[]}));
bodies.set('/assets/packs/base.json',encode({id:'2.0.0',version:'review',files:[...bodies].map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes)}))}));
const requests:string[]=[];let fail:(path:string)=>boolean=()=>false,hold=false;
const fetcher:typeof fetch=async(input,init)=>{
 init?.signal?.throwIfAborted();const path=new URL(String(input),origin).pathname;requests.push(path);
 if(hold&&/^\/art\/s\d+\.json$/.test(path))await new Promise<void>((_resolve,reject)=>{
  const abort=()=>reject(new DOMException('Controlled cancellation','AbortError'));
  if(init?.signal?.aborted)abort();else init?.signal?.addEventListener('abort',abort,{once:true});
 });
 const bytes=bodies.get(path);return new Response(fail(path)?'controlled unavailable':bytes?.slice().buffer,{status:fail(path)?503:bytes?200:404});
};
const report:any={scope:'Frozen-v2 exact consumer/core, actual 136 catalog IDs, synthetic manifest-declared metadata and controlled transport failures. No browser/image decode/GPU/Go proof.'};
const warn=console.warn;console.warn=()=>{};
try{
 const lib=new ArtLibrary({origin,indexSource:source,fetcher});const errors:string[]=[];lib.onError=error=>errors.push((error as any).code);
 await lib.init();const sheets=await Promise.all(ids.map(id=>lib.sheet(id)));assert.equal(sheets.filter(Boolean).length,136);assert.deepEqual(errors,[]);
 report.fanout={requested:136,loaded:136,errors:[...errors],statistics:lib.generationStatistics};
 await lib.release();fail=path=>path==='/art/s0.json';assert.equal(await lib.sheet(ids[0]),undefined);fail=()=>false;
 const metadataAt=requests.length;assert.equal((await lib.sheet(ids[0]))?.id,ids[0]);assert.equal(requests.length-metadataAt,1);
 report.metadataRecovery={additionalRequests:1,loaded:true};
 fail=path=>path==='/art/test.png';for(let i=0;i<2;i++)await assert.rejects(lib.image('/art/test.png'),(error:any)=>error.code==='asset_unavailable');
 assert.equal(requests.filter(path=>path==='/art/test.png').length,2);
 report.imageFailedPromiseEvicted={attempts:2,successfulDecodeClaim:false};
 fail=path=>path.includes('/ui/portraits/');for(let i=0;i<2;i++)assert.equal(await lib.cameo('unit.US.rifle','#abcdef'),undefined);
 assert.equal(requests.filter(path=>path.includes('/ui/portraits/')).length,4);
 report.cameoFailedPromiseEvicted={calls:2,imageRequests:4,successfulDecodeClaim:false};fail=()=>false;
 const identity=lib.generationIdentity?.key,reloadAt=requests.length;await lib.useIndex(source);assert.equal(lib.generationIdentity?.key,identity);
 assert.deepEqual(requests.slice(reloadAt),['/assets/packs/base.json','/art/index.json']);
 report.explicitSameIndexRecapture={sameExactIndexAndIdentity:true,newRequests:requests.slice(reloadAt)};await lib.dispose();

 // All cancellation is through the production generation and ArtLibrary APIs.
 // The controlled fetcher waits for the caller's actual AbortSignal.
 const generation=await captureAssetGeneration(source,'2.0.0',{origin,fetcher});
 const canceled=new ArtLibrary({origin,generation,fetcher});await canceled.init();hold=true;
 const cancellationErrors:string[]=[];canceled.onError=error=>cancellationErrors.push((error as any).code);
 const cancelAt=requests.length,pending=ids.map(id=>canceled.sheet(id));await new Promise(resolve=>setImmediate(resolve));
 const before=generation.statistics;assert.equal(before.inFlight,4);assert.equal(before.queued,132);
 await canceled.dispose();assert((await Promise.all(pending)).every(value=>value===undefined));
 assert.equal(requests.length-cancelAt,4);assert.deepEqual(cancellationErrors,[]);assert.equal(generation.statistics.inFlight,0);assert.equal(generation.statistics.inFlightBytes,0);assert.equal(generation.statistics.queued,0);
 report.disposeQueuedFanout={before,after:generation.statistics,startedRequests:4,lateQueuedStarts:0,reportedErrors:cancellationErrors};
}finally{console.warn=warn}
await writeFile('work/evidence/art-generation-review/v2-recovery-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
