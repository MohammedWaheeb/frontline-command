import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Texture} from 'pixi.js';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex} from '../../src/content/catalog';
import {CombatEffects} from '../../src/render/combat-effects';
import {TerrainSurface} from '../../src/render/terrain-surface';
import {DEFAULT_SETTINGS} from '../../src/app/settings';

const map={width:32,height:32},surface=new TerrainSurface({...map,tiles:Array.from({length:1024},()=>({terrain:'open'}))});
const catalog=new CatalogIndex(JSON.parse(readFileSync('../pkg/content/rules.json','utf8')));
const view={left:-500,right:500,top:-500,bottom:500};
function harness(){
 const effects=new CombatEffects(catalog,map),internal=effects as any,frame={page:0,x:0,y:0,w:40,h:80,origin:[20,70]};
 const sheet={pixelScale:1,clip:(variant:string)=>({fps:variant==='reduced'||variant==='reducedMotion'?0:20,loop:true,frames:Array(variant==='reduced'||variant==='reducedMotion'?1:40).fill(frame)}),frame:()=>({texture:Texture.EMPTY,pixelScale:1,anchorX:.5,anchorY:.875})};
 internal.request=(id:string)=>internal.sheets.set(id,sheet);
 return {effects,internal};
}
const snapshot=(tick:number,count=1)=>create(PlayerSnapshotSchema,{tick,player:1,visible:Array(1024).fill(true),players:[{id:1,team:1}],entities:Array.from({length:count},(_,i)=>({id:i+1,type:'US.tank',owner:1,health:400,complete:true,enabled:true,position:{x:4000,y:5000}}))});

test('ambient attachments track displayed actor height and interpolation; motion reductions keep a static frame',async()=>{
 const {effects,internal}=harness();try{
  effects.sync(snapshot(100),[]);
  effects.draw(surface,1,DEFAULT_SETTINGS,view,()=>35,undefined,()=>({x:100,y:200}));
  let node=[...internal.sprites.values()][0] as any;assert.equal(node.sprite.x,100);assert.equal(node.sprite.y,165);assert.equal(node.frame,107%40);
  effects.draw(surface,1,DEFAULT_SETTINGS,view,()=>25,undefined,()=>({x:101,y:201}));
  node=[...internal.sprites.values()][0] as any;assert.equal(node.sprite.x,101);assert.equal(node.sprite.y,176,'same simulation tick still follows displayed position');
  effects.draw(surface,1,{...DEFAULT_SETTINGS,reducedMotion:true,reducedFlashing:true},view,()=>25,undefined,()=>({x:101,y:201}));assert.equal(node.frame,0);assert.equal(node.variant,'reduced');
  effects.draw(surface,1,DEFAULT_SETTINGS,view,()=>0,undefined,()=>undefined);assert.equal(effects.diagnostics.decorations,0,'culled actor has no detached smoke');
 }finally{await effects.dispose()}
 assert.equal(effects.diagnostics.decorations,0);assert.equal(effects.root.destroyed,true);assert.equal(Texture.EMPTY.destroyed,false);
});

test('rotor wash stays on ground and requires a disclosed low visual altitude',async()=>{
 const {effects,internal}=harness();try{
  const s=snapshot(100);s.entities[0].type='US.gunship';s.entities[0].health=1000;effects.sync(s,[]);
  for(const height of [undefined,60]){effects.draw(surface,1,DEFAULT_SETTINGS,view,()=>height,undefined,()=>({x:80,y:90}));assert.equal(effects.diagnostics.decorations,0)}
  effects.draw(surface,1,DEFAULT_SETTINGS,view,()=>35,undefined,()=>({x:80,y:90}));assert.equal(effects.diagnostics.ambientDrawn,1);assert.equal(([...internal.sprites.values()][0] as any).sprite.y,90);
  effects.sync({...s,tick:101,entities:[{...s.entities[0],landed:true}]},[]);effects.draw(surface,1,DEFAULT_SETTINGS,view,()=>0);assert.equal(effects.diagnostics.decorations,0);
 }finally{await effects.dispose()}
});

test('combat keeps priority in the shared bounded pool and reset releases every ambient node',async()=>{
 const {effects,internal}=harness();try{
  effects.sync(snapshot(100,220),[]);
  const s=snapshot(101,220);s.events=create(PlayerSnapshotSchema,{events:[{id:1,tick:101,kind:'impact',owner:1,scope:'visible',position:{x:4000,y:5000}}]}).events;effects.sync(s,[]);
  effects.draw(surface,1,DEFAULT_SETTINGS,view,()=>0);assert.equal(effects.diagnostics.decorations,192);assert.equal(effects.diagnostics.ambientDrawn,191);assert(internal.sprites.has('1:1:0'));
  effects.reset();assert.equal(internal.sprites.size,0);assert.equal(effects.diagnostics.ambientCues,0);assert.equal(effects.diagnostics.decorations,0);
 }finally{await effects.dispose()}
});
