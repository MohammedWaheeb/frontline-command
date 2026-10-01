import test from 'node:test';
import assert from 'node:assert/strict';
import {create,type MessageInitShape} from '@bufbuild/protobuf';
import {Container,Sprite,Texture} from 'pixi.js';
import {EntitySchema} from '../../src/protocol/frontline_pb';
import {ActorVisual} from '../../src/render/actors';
import type {CatalogIndex,CatalogUnit} from '../../src/content/catalog';
import type {ArtLibrary,SpriteSheet,SpriteState} from '../../src/render/art';
import {groundLauncherPose,canonicalGroundLauncherPose} from '../../src/render/ground-launcher-payload';

type Patch=MessageInitShape<typeof EntitySchema>;
const mobile=['idle','move','damaged','deploy','pack'];
const names=[...mobile,...mobile.flatMap(s=>[s+'_charges_0',s+'_charges_1']),'fire','fire_charges_1','ready','ready_empty','ready_two_charges','wreck'];
function fixture(type='IR.launcher',patch:Patch={}){
 const entity=create(EntitySchema,{id:7,type,owner:1,position:{x:1000,y:1000},complete:true,enabled:true,health:1000,state:'idle',private:{charges:1},...patch,$typeName:undefined});
 const unit={id:type,role:'launcher',armor:'light',faction:type.slice(0,2),weapon:'TACTICAL'} as CatalogUnit;
 const catalog={units:new Map([[type,unit]]),buildings:new Map()} as unknown as CatalogIndex;
 const actor=new ActorVisual(entity,catalog,{resolve:()=>undefined} as unknown as ArtLibrary,unit.faction);
 const states=new Map(names.map(name=>[name,{name,part:'whole',directions:16,frames:name.startsWith('fire')?4:10,fps:10,loop:name.startsWith('move'),progress_driven:/^(deploy|pack)/.test(name)} satisfies SpriteState]));
 const internal=actor as unknown as {viewer?:number;sheet:SpriteSheet;state:(now:number,reduced?:boolean)=>SpriteState|undefined;frameIndex:(state:SpriteState,now:number)=>number;stateAt:number;missingPayloadArt?:string};
 internal.viewer=1;internal.sheet={states,meta:{}} as SpriteSheet;internal.stateAt=0;
 return {actor,internal,unit,states,choose:(now=150)=>internal.state(now)?.name,frame:(now:number)=>internal.frameIndex(internal.state(now)!,now)};
}

test('all four owned launchers retain disclosed empty payload through mobile and transition states',()=>{
 for(const type of ['US.launcher','IR.launcher','SY.launcher','SA.launcher'])for(const charges of type==='IR.launcher'?[0,1,2]:[0,1]){
  for(const [patch,canonical] of [[{},'idle'],[{health:300},'damaged'],[{enabled:false},'damaged'],[{state:'deploying',progress:400},'deploy'],[{state:'packing',deployed:true,progress:700},'pack']] as [Patch,string][]){
   const f=fixture(type,{...patch,private:{charges},$typeName:undefined}),before=structuredClone(f.actor.entity);
   assert.equal(f.choose(),canonical+(charges===0||type==='IR.launcher'&&charges===1?'_charges_'+charges:''));
   if(canonical==='deploy'||canonical==='pack')assert.equal(f.frame(150),canonical==='deploy'?4:7);
   assert.deepEqual(f.actor.entity,before);f.actor.dispose();
  }
  const f=fixture(type,{private:{charges}});f.actor.update({...f.actor.entity,position:{...f.actor.entity.position!,x:1200,y:1000}},100);
  assert.equal(f.choose(),'move'+(charges===0||type==='IR.launcher'&&charges===1?'_charges_'+charges:''));f.actor.dispose();
 }
});

test('IR first and last shots use separate real cue clocks and current post-shot charges',()=>{
 const f=fixture('IR.launcher',{deployed:true,state:'attacking'});
 f.actor.cue('weapon_fired',100,true);assert.equal(f.choose(300),'fire_charges_1');assert.equal(f.frame(300),2);
 assert.equal(f.choose(501),'ready','First shot settles with group0 still present');
 f.actor.update({...f.actor.entity,private:{...f.actor.entity.private!,charges:0}},1600);f.actor.cue('weapon_fired',1600,true);
 assert.equal(f.choose(1800),'fire');assert.equal(f.frame(1800),2);assert.equal(f.choose(2001),'ready_empty');
 f.actor.clearFeedback();f.actor.update({...f.actor.entity},2100);assert.equal(f.choose(2100),'ready_empty','Restore does not replay a shot');f.actor.dispose();
});

test('partial pose aliases preserve progress and current action epoch when knowledge changes',()=>{
 const f=fixture('IR.launcher',{deployed:true});f.actor.cue('weapon_fired',100,true);
 assert.equal(f.choose(350),'fire_charges_1');assert.equal(f.frame(350),2);
 f.internal.viewer=2;assert.equal(f.choose(350),'fire');assert.equal(f.frame(350),2);
 f.internal.viewer=1;assert.equal(f.choose(350),'fire_charges_1');assert.equal(f.frame(350),2);
 f.actor.clearFeedback();f.actor.update({...f.actor.entity,state:'packing',progress:600},500);
 assert.equal(f.choose(500),'pack_charges_1');assert.equal(f.frame(500),6);
 f.actor.update({...f.actor.entity,private:{...f.actor.entity.private!,charges:0}},600);
 assert.equal(f.choose(600),'pack_charges_0');assert.equal(f.frame(600),6);f.actor.dispose();
 for(const name of names)if(name.includes('_charges_'))assert.equal(canonicalGroundLauncherPose(name),name.replace(/_charges_[01]$/,''));
});

test('current ownership and private knowledge gate every mobile, ready and firing variant',()=>{
 for(const patch of [{},{deployed:true,state:'ready'},{state:'deploying',progress:500}] as Patch[]){
  const f=fixture('IR.launcher',{...patch,private:{charges:0},$typeName:undefined}),generic=patch.deployed?'ready':patch.state==='deploying'?'deploy':'idle';
  for(const viewer of [undefined,2,3]){f.internal.viewer=viewer;assert.equal(f.choose(),generic)}
  f.internal.viewer=1;f.actor.update({...f.actor.entity,owner:2},200);assert.equal(f.choose(),generic,'Foreign private-shaped input is not permission');
  f.actor.update({...f.actor.entity,owner:1,private:undefined},300);assert.equal(f.choose(),generic);f.actor.dispose();
 }
 const f=fixture('IR.launcher',{deployed:true});f.actor.cue('weapon_fired',100,true);f.internal.viewer=2;assert.equal(f.choose(),'fire');f.actor.dispose();
});

test('packing, undeployment and structural interruptions discard launcher shot cues',()=>{
 for(const patch of [{state:'packing',progress:500},{state:'deploying',progress:500,deployed:false},{state:'idle',deployed:false},{state:'destroyed',health:0},{enabled:false}] as Patch[]){
  const f=fixture('IR.launcher',{deployed:true});f.actor.cue('weapon_fired',100,true);assert.equal(f.choose(150),'fire_charges_1');
  f.actor.update(create(EntitySchema,{...f.actor.entity,...patch,$typeName:undefined}),200);assert(!f.choose(200)?.startsWith('fire'));
  f.actor.update({...f.actor.entity,deployed:true,state:'ready',enabled:true,health:1000},210);assert.equal(f.choose(250),'ready','Interrupted old cue cannot restart');f.actor.dispose();
 }
});

test('missing variants are an explicit incomplete-art diagnostic and unrelated actors remain unchanged',()=>{
 const f=fixture();f.states.delete('idle_charges_1');const before=structuredClone(f.actor.entity);
 assert.equal(f.choose(),'idle');assert.equal(f.internal.missingPayloadArt,'idle_charges_1');assert.deepEqual(f.actor.entity,before);
 f.actor.update({...f.actor.entity,private:{...f.actor.entity.private!,charges:2}},200);assert.equal(f.choose(),'idle');assert.equal(f.internal.missingPayloadArt,undefined);
 for(const unit of [undefined,{...f.unit,role:'tank'},{...f.unit,armor:'air'}])assert.equal(groundLauncherPose(f.actor.entity,unit,1,'move'),undefined);
 for(const charges of [-1,3,NaN])assert.equal(groundLauncherPose({...f.actor.entity,private:{...f.actor.entity.private!,charges}},f.unit,1,'idle'),undefined);
 assert.equal(groundLauncherPose({...f.actor.entity,type:'map.fake'},f.unit,1,'idle'),undefined);f.actor.dispose();
});

test('pending real atlas pages cannot keep stale payload or an expired departing missile',()=>{
 const f=fixture(),roots=[new Container(),new Container()];
 const piece={root:roots[0],shadowRoot:roots[1],shadow:new Sprite(),beauty:new Sprite(),team:new Sprite(),offset:{x:0,y:0},poses:{} as Record<string,{state:string;direction:number;frame:number}>};
 const paint=f.actor as unknown as {paintPart:(part:typeof piece,state:SpriteState,heading:number,now:number,team:number,altitude:number)=>void};
 const frame={texture:Texture.EMPTY,atlasTexture:Texture.EMPTY,anchorX:.5,anchorY:.5};let ready='idle';
 f.internal.sheet={...f.internal.sheet,pixelScale:1,hasFrame:()=>true,frame:(_layer:string,state:string)=>state===ready?frame:undefined} as unknown as SpriteSheet;
 for(const [old,next] of [['idle','idle_charges_0'],['idle_charges_0','idle'],['idle_charges_1','idle_charges_0'],['ready_two_charges','ready'],['ready_empty','ready'],['fire_charges_1','idle_charges_1'],['fire','ready_empty'],['move_charges_0','wreck']]){
  ready=old;piece.poses={};paint.paintPart(piece,f.states.get(old)!,0,100,0xffffff,0);assert(piece.beauty.visible);
  paint.paintPart(piece,f.states.get(next)!,0,150,0xffffff,0);for(const name of ['beauty','team','shadow'] as const)assert.equal(piece[name].visible,false,old+' cannot stand in for '+next);
  ready=next;paint.paintPart(piece,f.states.get(next)!,0,200,0xffffff,0);assert(piece.beauty.visible);
 }
 ready='idle_charges_0';piece.poses={};paint.paintPart(piece,f.states.get(ready)!,0,300,0xffffff,0);paint.paintPart(piece,f.states.get('move_charges_0')!,0,350,0xffffff,0);assert(piece.beauty.visible,'Same disclosed payload retains safe no-flicker fallback');
 for(const sprite of [piece.shadow,piece.beauty,piece.team])sprite.destroy();for(const root of roots)root.destroy();f.actor.dispose();
});
