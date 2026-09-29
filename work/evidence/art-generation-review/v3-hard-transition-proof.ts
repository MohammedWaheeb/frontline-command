import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {SpriteSheet,type SpriteMeta} from '../../art-generation-consumer-v1/frozen-v3/client/src/render/art';
import {RuntimeError} from '../../art-generation-consumer-v1/frozen-v3/client/src/runtime/errors';

const originalPerformance=globalThis.performance,originalWarn=console.warn;
let clock=1000;
Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock}});
console.warn=()=>{};
const cases=[];
try{
 for(const hard of ['asset_integrity','asset_generation_unavailable','decode']){
  const meta={id:'review.page',states:[{name:'idle',part:'body',directions:1,frames:1,fps:1,loop:true}]} as SpriteMeta;
  const page={url:'/art/review/page.png',descriptors:{'idle/d00_f00':{frame:{x:0,y:0,w:1,h:1},sourceSize:{w:1,h:1}}},layer:'shadow',frames:new Map(),generation:0,lastUsed:0,bytes:0};
  let attempts=0;const reports:string[]=[];
  const sheet=new SpriteSheet(meta.id,meta,'1x',[page],async()=>{if(++attempts===1)throw new RuntimeError('asset_unavailable','Controlled transient response failure.');if(hard==='decode')throw Error('Controlled page decode failure.');throw new RuntimeError(hard,'Controlled hard page failure.')},error=>reports.push((error as RuntimeError).code??'decode'));
  sheet.frame('shadow','idle',0,0);await sheet.settle();
  for(let i=0;i<100;i++)sheet.frame('shadow','idle',0,0);
  await sheet.settle();assert.equal(attempts,1,'Cooldown prevents a per-frame retry storm.');
  clock+=250;sheet.frame('shadow','idle',0,0);await sheet.settle();assert.equal(attempts,2);
  clock+=60000;for(let i=0;i<100;i++)sheet.frame('shadow','idle',0,0);await sheet.settle();
  assert.equal(attempts,2,'Terminal errors stay held.');assert.deepEqual(reports,['asset_unavailable',hard],'Frozen-v3 reports the terminal cause once after transient retry.');
  await sheet.dispose();cases.push({secondFailure:hard,attempts,reported:reports,hardFailureReported:true,laterFrames:100,held:true,disposed:sheet.statistics.residentBytes===0});
 }
 const result={scope:'Frozen-v3 production SpriteSheet public API with deterministic clock; controlled failures before texture creation, no browser/GPU or production edits.',status:'PASS: terminal failure after transient retry is reported once and held',cases};
 await writeFile('work/evidence/art-generation-review/v3-hard-transition-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{console.warn=originalWarn;Object.defineProperty(globalThis,'performance',{configurable:true,value:originalPerformance})}
