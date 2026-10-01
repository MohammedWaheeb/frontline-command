// PREPARED, UNRUN. Full actual modules; source-controlled receivers/views only.
// No Application/GPU, worker, decoded PNG, paid build or native selected ID.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {create} from '@bufbuild/protobuf';
import {Container} from 'pixi.js';
// Root stages this file under the qualified variant's client/tests/runtime.
// These static imports use the existing normal runtime-test bundling route.
import {BattlefieldRenderer} from '../../src/render/battlefield';
import {ActorVisual} from '../../src/render/actors';
import type {ArtLibrary} from '../../src/render/art';
import {CatalogIndex} from '../../src/content/catalog';
import {TerrainSurface} from '../../src/render/terrain-surface';
import {EntitySchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
const sourceRoot=process.env.FC_PICKING_SOURCE_ROOT??path.resolve(process.cwd(),'..');
const map=JSON.parse(readFileSync(path.join(sourceRoot,'content/maps/copper-junction.json'),'utf8'));
const catalog=new CatalogIndex(JSON.parse(readFileSync(path.join(sourceRoot,'pkg/content/rules.json'),'utf8')));
const A={x:23500,y:65500},B={x:25500,y:63500},APRON_TIP={x:-1280,y:1424};
const options={timeout:5000};

/** Actual ActorVisual fallback drawing and exact Pixi indexed mesh. The art
 * resolver deliberately supplies no sheet, modelling the existing permitted
 * procedural course; no atlas/page/alpha/native admission is implied. */
function fixture({snapshotOrder=[1,2],childOrder=[1,2],zoom=1,bPosition=B}={}){
 const actors=new Map(),ground=new Container(),world=new Container();
 const now=performance.now(),surface=new TerrainSurface(map);
 const renderer=Object.create(BattlefieldRenderer.prototype);
 try{
  const actorRows:Array<[number,{x:number;y:number}]>=[[1,A],[2,bPosition]];
  for(const [id,position] of actorRows){
   const entity=create(EntitySchema,{id,type:'power',owner:1,position,health:1000,state:'idle',complete:false,enabled:true,progress:0,footprintWidth:2,footprintHeight:2,footprintType:'power'});
   const actor=new ActorVisual(entity,catalog,{resolve:()=>undefined} as unknown as ArtLibrary,'US',surface);
   actors.set(id,actor);actor.render(now,0x887742,false,'selected',true,zoom);
  }
  ground.sortableChildren=true;
  for(const id of childOrder)ground.addChild(actors.get(id).root);
  ground.sortChildren(); // Actual Pixi stable order, no hit-induced scene sort.
  world.position.set(1380,-1324);world.scale.set(zoom);
  Object.assign(renderer,{actors,ground,world,surface,camera:{x:0,y:0,zoom},settings:{...DEFAULT_SETTINGS,reducedMotion:true,selectionTolerance:6},options:{map,catalog},snapshot:create(PlayerSnapshotSchema,{player:1,tick:100,entities:snapshotOrder.map(id=>actors.get(id).entity)})});
  return {renderer,actors,ground,surface,point(iso=APRON_TIP){return {x:iso.x*zoom+world.x,y:iso.y*zoom+world.y}},dispose(){const errors=[];for(const actor of actors.values())try{actor.dispose()}catch(error){errors.push(error)}ground.destroy({children:true});world.destroy({children:true});if(errors.length)throw new AggregateError(errors,'CPU actor cleanup failed')}};
 }catch(error){
  const errors=[error];for(const actor of actors.values())try{actor.dispose()}catch(cleanup){errors.push(cleanup)}ground.destroy({children:true});world.destroy({children:true});throw new AggregateError(errors,'CPU fixture setup failed');
 }
}
function picked(f:ReturnType<typeof fixture>,iso=APRON_TIP){return f.renderer.hit(f.point(iso))}
function assertBothCurrentMeshes(f:ReturnType<typeof fixture>,iso=APRON_TIP){
 for(const actor of f.actors.values()){
  assert.equal(actor.containsPaintedBody(iso,6/f.renderer.camera.zoom),true,'Actual drawn apron geometry accepts this coordinate');
  assert.equal(actor.groundDepth(performance.now(),true),91000);
 }
 const terrainHit=f.surface.pickSurface(iso);
 assert(terrainHit,'Actual Copper surface must exist at the source witness');
 assert(terrainHit.triangle.depth<=91000.01,'Actual Copper surface does not occlude the source witness');
}

test('equal-depth opaque procedural overlap chooses the later actual painter child',options,()=>{
 const f=fixture();try{assertBothCurrentMeshes(f);assert.deepEqual(f.ground.children,[f.actors.get(1).root,f.actors.get(2).root]);assert.deepEqual(picked(f),{kind:'entity',id:2})}finally{f.dispose()}
});
test('reverse snapshot order does not alter the current child-order winner',options,()=>{
 const f=fixture({snapshotOrder:[2,1]});try{assertBothCurrentMeshes(f);assert.deepEqual(picked(f),{kind:'entity',id:2})}finally{f.dispose()}
});
test('re-entry history can put the lower ID later in the stable child order',options,()=>{
 const f=fixture({snapshotOrder:[2,1],childOrder:[2,1]});try{assertBothCurrentMeshes(f);assert.deepEqual(f.ground.children,[f.actors.get(2).root,f.actors.get(1).root]);assert.deepEqual(picked(f),{kind:'entity',id:1})}finally{f.dispose()}
});
test('reversed child order also stays correct with ascending snapshot IDs',options,()=>{
 const f=fixture({childOrder:[2,1]});try{assertBothCurrentMeshes(f);assert.deepEqual(picked(f),{kind:'entity',id:1})}finally{f.dispose()}
});
test('unequal depths retain the original larger-depth priority',options,()=>{
 // Grid-aligned 500mt offset gives different actual front depths. At the
 // existing .45 zoom and6px tolerance both apron tips admit this midpoint.
 const f=fixture({childOrder:[2,1],zoom:.45,bPosition:{x:26000,y:63500}}),iso={x:-1272,y:1428};
 try{
  for(const actor of f.actors.values())assert.equal(actor.containsPaintedBody(iso,6/.45),true);
  assert(f.actors.get(2).groundDepth(performance.now(),true)>f.actors.get(1).groundDepth(performance.now(),true));
  // Make source-controlled child order disagree deliberately: it must never
  // replace the unequal-depth rule. This does not model a rendered scene.
  f.ground.removeChildren();f.ground.addChild(f.actors.get(2).root,f.actors.get(1).root);
  assert.deepEqual(picked(f,iso),{kind:'entity',id:2});
 }finally{f.dispose()}
});
test('an alpha-negative later body remains rejected before tie priority',options,()=>{
 const f=fixture();try{
  // Explicit controlled loaded-body result; this is no decoded opacity mask.
  f.actors.get(2).containsPaintedBody=()=>false;
  assert.deepEqual(picked(f),{kind:'entity',id:1});
 }finally{f.dispose()}
});
test('coarse bounds still prevent any body query outside their neighborhood',options,()=>{
 const f=fixture();try{
  f.actors.get(2).paintedBodyBounds=()=>({left:5000,top:5000,right:5010,bottom:5010});
  f.actors.get(2).containsPaintedBody=()=>{throw Error('Coarse-rejected actor queried')};
  assert.deepEqual(picked(f),{kind:'entity',id:1});
 }finally{f.dispose()}
});
test('an owned contained entity remains excluded by actual bounds policy',options,()=>{
 const f=fixture();try{
  f.actors.get(2).entity.private={container:77};
  assert.deepEqual(picked(f),{kind:'entity',id:1});
 }finally{f.dispose()}
});
test('a retained scene actor absent from the current disclosed rows cannot win',options,()=>{
 const f=fixture();try{
  f.renderer.snapshot.entities=[f.actors.get(1).entity];
  assert.deepEqual(picked(f),{kind:'entity',id:1});
 }finally{f.dispose()}
});
test('terrain-depth rejection still precedes any accepted actor tie',options,()=>{
 const f=fixture();try{
  const original=f.surface.pickSurface.bind(f.surface);
  f.surface.pickSurface=point=>{const hit=original(point);return hit&&{...hit,triangle:{...hit.triangle,depth:1000000}}};
  // Explicit controlled front-triangle gate input, not new public map data.
  assert.equal(picked(f).kind,'ground');
 }finally{f.dispose()}
});
test('512-row controlled scene preserves the same tie despite unrelated children',options,()=>{
 const f=fixture();const extras=[];try{
  const rows=f.renderer.snapshot.entities;
  for(let index=0;index<510;index++){
   const id=100+index,entity=create(EntitySchema,{id,type:'US.rifle',owner:1,position:{x:5000,y:5000},health:1000,state:'idle',complete:true,enabled:true});
   const root=new Container();extras.push(root);f.ground.addChildAt(root,index);
   // Controlled off-pointer records, not instantiated/native roster actors.
   f.renderer.actors.set(id,{entity,root,paintedBodyBounds:()=>({left:5000,top:5000,right:5001,bottom:5001}),containsPaintedBody(){throw Error('Off-pointer record should not be queried')}});
   rows.splice(index,0,entity);
  }
  assert.equal(rows.length,512);assert.deepEqual(picked(f),{kind:'entity',id:2});
  assert.deepEqual(f.ground.children.slice(-2),[f.actors.get(1).root,f.actors.get(2).root]);
 }finally{for(const root of extras)root.destroy({children:true});for(const id of [...f.renderer.actors.keys()])if(id>=100)f.renderer.actors.delete(id);f.dispose()}
});
