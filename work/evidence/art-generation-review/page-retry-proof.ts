import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {SpriteSheet,type SpriteMeta} from '../../art-generation-consumer-v1/frozen-v1/client/src/render/art';
import {RuntimeError} from '../../art-generation-consumer-v1/frozen-v1/client/src/runtime/errors';

// No browser, decoder, texture, image bytes, or renderer state is substituted.
// The production SpriteSheet loader fails before page creation, as a real
// generation.read() HTTP/queue failure does. Repeated frame() calls exercise its
// public demand-loading API against the exact frozen v1 failure path.
const meta:SpriteMeta={id:'review.page',frame_size_2x:[2,2],anchor_2x:[1,1],layers:['beauty'],atlases:{'1x':{},'2x':{}},states:[{name:'idle',part:'body',directions:1,frames:1,fps:1,loop:true}]};
const page={url:'/art/review/page.png',descriptors:{'idle/d00_f00':{frame:{x:0,y:0,w:1,h:1},sourceSize:{w:1,h:1}}},layer:'beauty',frames:new Map(),generation:0,lastUsed:0,bytes:0};
let attempts=0;const failures:string[]=[];
const transient=new RuntimeError('asset_unavailable','Controlled transient transport failure.');
const sheet=new SpriteSheet(meta.id,meta,'1x',[page],async()=>{attempts++;throw transient},error=>failures.push((error as RuntimeError).code));
const originalWarn=console.warn;console.warn=()=>{};
try{
 assert.equal(sheet.frame('beauty','idle',0,0),undefined);await sheet.settle();
 assert.equal(attempts,1);assert.deepEqual(failures,['asset_unavailable']);
 for(let i=0;i<100;i++)assert.equal(sheet.frame('beauty','idle',0,0),undefined);
 await sheet.settle();assert.equal(attempts,1);await sheet.dispose();
 const result={scope:'Frozen-v1 production SpriteSheet public API; controlled transient error before texture creation, no browser or GPU claim.',firstAttempts:1,laterFrameRequests:100,additionalAttempts:attempts-1,reportedFailures:failures,statisticsAfterDispose:sheet.statistics};
 await writeFile('work/evidence/art-generation-review/page-retry-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{console.warn=originalWarn;await sheet.dispose()}
