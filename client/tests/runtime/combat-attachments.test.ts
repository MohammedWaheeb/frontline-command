import test from 'node:test';
import assert from 'node:assert/strict';
import {Container,Sprite,Texture} from 'pixi.js';
import {create} from '@bufbuild/protobuf';
import {EntitySchema} from '../../src/protocol/frontline_pb';
import {ActorVisual} from '../../src/render/actors';
import {SpriteSheet,type ArtLibrary,type SpriteMeta,type SpriteState} from '../../src/render/art';
import type {CatalogIndex} from '../../src/content/catalog';

test('muzzle uses the exact displayed fallback frame, alias, part offset and heading while a page loads',()=>{
 const aim:SpriteState={name:'aim',part:'turret',directions:16,frames:1,fps:0,loop:false},fire:SpriteState={...aim,name:'fire',frames:3,fps:20};
 const meta={states:[aim,fire],aliases:[{name:'reverse_fire',source:'fire',reverse:true}],hardpoints_2x_rel_anchor:{muzzle:{'aim/d04_f00':[20,-14],'fire/d08_f00':[-40,-10],'fire/d08_f02':[-60,-16]}}} as unknown as SpriteMeta;
 const sheet=new SpriteSheet('test',meta,'1x',[]),texture={texture:Texture.EMPTY,atlasTexture:Texture.EMPTY,anchorX:.5,anchorY:.5};
 const available=new Set(['aim/4/0']);
 sheet.hasFrame=()=>true;
 sheet.frame=(_layer,state,direction,index)=>{const s=sheet.sourceFrame(state,direction,index);return available.has(`${s.state}/${s.direction}/${s.index}`)?texture:undefined};
 const actor=new ActorVisual(create(EntitySchema,{id:3,type:'US.tank',owner:1,position:{x:1000,y:1000},complete:true,enabled:true,health:1000}),{units:new Map(),buildings:new Map()} as unknown as CatalogIndex,{resolve:()=>undefined} as unknown as ArtLibrary);
 const internal=actor as any;internal.sheet=sheet;internal.stateAt=0;actor.root.position.set(50,70);
 const piece={root:new Container(),shadowRoot:new Container(),beauty:new Sprite(),team:new Sprite(),shadow:new Sprite(),offset:{x:100,y:200},poses:{}};
 const paint=(state:SpriteState,heading:number,now:number)=>{internal.paintedMuzzles.length=0;internal.paintPart(piece,state,heading,now,0xffffff,12);return actor.muzzleAttachment()!};
 const initial=paint(aim,90000,0);assert.equal(initial.x,56.8);assert.equal(initial.y,55.8);assert.ok(initial.rotation>2.6);
 // No new frame has decoded: both actual pixels and attachment retain aim d04.
 assert.deepEqual(paint(fire,180000,100),initial);
 available.add('fire/8/0');const fallback=paint(fire,180000,100);assert.equal(fallback.x,26.8);assert.equal(fallback.y,57.8);assert.ok(fallback.rotation< -2.6);assert.equal((piece.poses as any).beauty.frame,0);
 available.add('fire/8/2');const current=paint(fire,180000,100);assert.equal(current.x,16.799999999999997);assert.equal(current.y,54.8);assert.equal((piece.poses as any).beauty.frame,2);
 const alias=paint(sheet.states.get('reverse_fire')!,180000,0);assert.deepEqual(alias,current,'Reversed source frame carries its actual recoil hardpoint');
 actor.root.visible=false;assert.equal(actor.muzzleAttachment(),undefined);actor.root.visible=true;actor.entity.health=0;assert.equal(actor.muzzleAttachment(),undefined);
 for(const sprite of [piece.beauty,piece.team,piece.shadow])sprite.destroy();piece.root.destroy();piece.shadowRoot.destroy();actor.dispose();
});
