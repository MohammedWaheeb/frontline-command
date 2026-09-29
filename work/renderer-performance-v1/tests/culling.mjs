import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from '../../../client/node_modules/esbuild/lib/main.js';
import {Texture} from '../../../client/node_modules/pixi.js/lib/index.mjs';
const work=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.resolve(work,'../..'),base=path.join(work,'baseline/client/src');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const modified=await readFile(path.join(work,'culling-candidate/client/src/render/battlefield.ts'),'utf8'),original=await readFile(path.join(base,'render/battlefield.ts'),'utf8');
assert.equal(original,await readFile(path.join(root,'client/src/render/battlefield.ts'),'utf8'));
const results=[];
let clock=1000;
const nowDescriptor=Object.getOwnPropertyDescriptor(performance,'now');
Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
try{
 for(const variant of ['baseline','candidate']){
  const outfile=path.join(work,'evidence',`${variant}-culling.mjs`);
  await build({stdin:{contents:"export {BattlefieldRenderer} from './render/battlefield';export {ActorVisual} from './render/actors';export {TerrainSurface} from './render/terrain-surface';",resolveDir:base,loader:'ts'},outfile,bundle:true,format:'esm',platform:'node',nodePaths:[path.join(root,'client/node_modules')],plugins:[{name:'frozen-pixi-and-scene',setup(b){b.onResolve({filter:/^pixi\.js$/},()=>({path:path.join(root,'client/node_modules/pixi.js/lib/index.mjs'),external:true}));b.onLoad({filter:/render\/battlefield\.ts$/},()=>({contents:variant==='candidate'?modified:original,loader:'ts'}))}}]});
  const {BattlefieldRenderer,ActorVisual,TerrainSurface}=await import(pathToFileURL(outfile).href);
  for(const height of [0,4])for(const reducedMotion of [false,true])for(const air of [false,true]){
   clock=1000;
   const map={width:96,height:96,tiles:Array.from({length:96*96},()=>({terrain:'open',height}))},surface=new TerrainSurface(map),type=air?'US.fighter':'US.tank';
   const unit={id:type,role:air?'fighter':'tank',armor:air?'air':'heavy',radius:400,faction:'US'};
   const catalog={units:new Map([[type,unit]]),buildings:new Map()};
   const entity={id:1,type,owner:1,position:{x:20000,y:60000},facing:0,turretFacing:0,health:1000,complete:true,enabled:true,state:'idle',progress:1000,footprintWidth:0,footprintHeight:0,rank:0,landed:!air};
   const states=new Map(['idle','move','fly','hover'].map(name=>[name,{name,part:'body',directions:1,frames:1,fps:0,loop:true}]));
   const frame={texture:Texture.EMPTY,atlasTexture:Texture.EMPTY,anchorX:.5,anchorY:.5,bodyBottom:.5,inkBounds:{x:0,y:0,w:1,h:1},containsAlpha:(x,y)=>x>=0&&x<=1&&y>=0&&y<=1};
   const sheet={states,meta:{states:[...states.values()]},pixelScale:1,frame:()=>frame,hasFrame:()=>true,sourceFrame:(state,direction,index)=>({state,direction,index})};
   const art={resolve:()=>({id:type,standIn:false}),sheet:async()=>sheet,trim(){}};
   const actor=new ActorVisual(entity,catalog,art,'US',surface);await actor.ready;
   actor.render(clock,0xffffff,false,'selected',reducedMotion);
   assert(actor.paintedBodyBounds());
   let groundCalls=0,renderCalls=0;
   const ground=actor.groundAnchor.bind(actor),paint=actor.render.bind(actor);
   actor.groundAnchor=(...args)=>{groundCalls++;return ground(...args)};
   actor.render=(...args)=>{renderCalls++;return paint(...args)};
   const scene={disposed:false,lost:false,frame:0,app:{screen:{width:1280,height:720}},world:{x:640,y:-664},camera:{x:0,y:1024,zoom:1},actors:new Map([[1,actor]]),deaths:[],surface,settings:{edgeScroll:false,reducedMotion,healthBars:'selected'},selected:new Set(),options:{map,catalog,art},environment:{render(){},shadowPlates:[]},surfaceShadows:{update(){}},combat:{draw(){},trim(){}},memoryLabels:[],overlay:{clear(){}},updateShake(){},cameraTransform(){},terrainFrame(){},team:()=>0xffffff,drawTactical(){},paintMinimap(){},bounds:BattlefieldRenderer.prototype.bounds};
   BattlefieldRenderer.prototype.render.call(scene);assert.equal(actor.root.visible,false,'Initial last-painted position is outside the view');
   assert.equal(renderCalls,0);
   const moved={...entity,position:{x:40000,y:40000}},before=structuredClone(moved);
   actor.update(moved,clock);clock+=50;
   const projected=surface.projectGround(moved.position);assert(projected.x+scene.world.x>0&&projected.x+scene.world.x<1280);
   const positionBefore={x:actor.root.x,y:actor.root.y};
   BattlefieldRenderer.prototype.render.call(scene);
   assert.deepEqual(moved,before,'No authorized entity mutation');
   assert.equal(actor.root.visible,variant==='candidate');
   assert.equal(renderCalls,variant==='candidate'?1:0);
   if(variant==='candidate'){
    assert.equal(actor.root.x,projected.x);assert.equal(actor.root.y,projected.y);
    const body=actor.paintedBodyBounds();assert(body);assert.equal(actor.containsPaintedBody({x:(body.left+body.right)/2,y:(body.top+body.bottom)/2},0),true,'Current rendered body remains pickable');
    assert.equal(actor.containsPaintedBody({x:body.right+100,y:body.bottom+100},0),false,'Transparent/outside positions remain unpickable');
    // Once visible, the patch incurs no additional groundAnchor call; it only
    // adds work while the actor was culled in the previous frame.
    const visibleCalls=groundCalls;BattlefieldRenderer.prototype.render.call(scene);const callsInVisibleFrame=groundCalls-visibleCalls;
    results.push({variant,height,reducedMotion,air,reentry:true,picking:true,callsInVisibleFrame,groundCalls,renderCalls});
   }else{
    assert.equal(actor.root.x,positionBefore.x);assert.equal(actor.root.y,positionBefore.y);
    results.push({variant,height,reducedMotion,air,reentry:false,rootFrozen:true,groundCalls,renderCalls});
   }
   actor.dispose();
  }
 }
}finally{if(nowDescriptor)Object.defineProperty(performance,'now',nowDescriptor);else delete performance.now}
const report={status:'PASS',scope:'Actual frozen BattlefieldRenderer.render + bounds and actual ActorVisual/real Pixi scene objects in Node, synthetic1pixel frame and authorized-shape entity. No GPU, browser, Go transport, raster or actual art acceptance.',baselineStatus:'REPRODUCED_FAILURE',candidateStatus:'PASS_8_REENTRY_AND_PICKING_CASES',baselineSHA256:sha(original),candidateSHA256:sha(modified),delta:['client/src/render/battlefield.ts'],results,limits:['Per-frame ground projection is newly required for previously culled actors; current visible actors retain their prior path.','Bounds retain the existing200pixel margin and current pose/alpha rules; no culling-envelope redesign.','Actual App/browser pan/reentry, aircraft service decks, replay and actual-art regression remain required before promotion.']};
await writeFile(path.join(work,'evidence/culling.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
