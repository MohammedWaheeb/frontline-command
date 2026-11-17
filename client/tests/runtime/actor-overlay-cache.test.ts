import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {EntitySchema} from '../../src/protocol/frontline_pb';
import {ActorVisual} from '../../src/render/actors';
import type {ArtLibrary,SpriteState} from '../../src/render/art';
import type {CatalogIndex} from '../../src/content/catalog';
import type {Graphics} from 'pixi.js';

function fixture(type='US.tank'){
 const entity=create(EntitySchema,{id:1,type,owner:1,position:{x:1000,y:1000},complete:true,enabled:true,health:1000,state:'idle'});
 const catalog={units:new Map([['US.tank',{radius:800,armor:'armor'}]]),buildings:new Map([['hq',{width:3,height:2,role:'hq'}]])} as unknown as CatalogIndex;
 const actor=new ActorVisual(entity,catalog,{resolve:()=>undefined} as unknown as ArtLibrary,'US');
 const internal=actor as unknown as {selectionGround:Graphics;hardpoint:()=>{x:number;y:number}|undefined;state:()=>SpriteState|undefined;visualAltitude:()=>number};
 let clears=0;
 for(const graphic of [actor.overlays,internal.selectionGround]){
  const clear=graphic.clear.bind(graphic);graphic.clear=()=>{clears++;return clear()};
 }
 const render=(selected=true,zoom=1,mode:'always'|'selected'|'damaged'='selected')=>actor.render(200,0x779944,selected,mode,false,zoom);
 return {actor,internal,render,clears:()=>clears};
}

test('ActorVisual keeps overlay geometry during repeated frames and movement',()=>{
 const f=fixture();f.actor.relation='self';f.render();
 const instruction=f.actor.overlays.context.instructions[0],clears=f.clears();
 assert(instruction);assert(f.internal.selectionGround.context.instructions.length>0);
 for(let i=0;i<10;i++)f.render();
 f.actor.update({...f.actor.entity,position:{...f.actor.entity.position!,x:2000,y:3000}},100);f.render();
 assert.equal(f.clears(),clears);assert.equal(f.actor.overlays.context.instructions[0],instruction);
 assert.notEqual(f.actor.root.position.x,0);f.actor.dispose();
});

test('ActorVisual refreshes changed selection, relation, health, rank, zoom and private marks',()=>{
 const f=fixture();f.render();
 const changed=(mutate:()=>void,selected=true,zoom=1)=>{
  const before=f.clears();mutate();f.render(selected,zoom);assert.equal(f.clears(),before+2);
  f.render(selected,zoom);assert.equal(f.clears(),before+2,'unchanged input redrew geometry');
 };
 changed(()=>{f.actor.entity={...f.actor.entity,health:600}});
 changed(()=>{f.actor.entity={...f.actor.entity,rank:2}});
 changed(()=>{f.actor.relation='enemy'});
 changed(()=>{},true,.65);
 changed(()=>{f.actor.hovered=true},false,.65);
 changed(()=>{f.actor.entity={...f.actor.entity,private:{...f.actor.entity.private!,ambushReady:true}}},false,.65);
 changed(()=>{f.actor.hovered=false;f.actor.entity={...f.actor.entity,state:'destroyed'}},false,.65);
 f.actor.dispose();
});

test('ActorVisual invalidates footprint and animated hardpoint/altitude placement',()=>{
 const f=fixture('hq');f.render();let before=f.clears();
 f.actor.entity={...f.actor.entity,footprintWidth:4,footprintHeight:3};f.render();assert.equal(f.clears(),before+2);
 let anchor={x:2,y:-30},altitude=0;
 f.internal.state=()=>({name:'idle'} as SpriteState);f.internal.hardpoint=()=>anchor;f.internal.visualAltitude=()=>altitude;
 f.render();before=f.clears();anchor={x:3,y:-31};f.render();assert.equal(f.clears(),before+2);
 before=f.clears();altitude=12;f.render();assert.equal(f.clears(),before+2);
 before=f.clears();f.render();assert.equal(f.clears(),before);f.actor.dispose();
});

test('destroying an unselected veteran clears cached chevrons even with unchanged health',()=>{
 const f=fixture();f.actor.entity={...f.actor.entity,rank:1};f.render(false);
 assert(f.actor.overlays.context.instructions.length>0);
 f.actor.entity={...f.actor.entity,state:'destroyed'};f.render(false);
 assert.equal(f.actor.overlays.context.instructions.length,0);f.actor.dispose();
});
