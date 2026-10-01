import test from 'node:test';
import assert from 'node:assert/strict';
import {create,type MessageInitShape} from '@bufbuild/protobuf';
import {EntitySchema} from '../../src/protocol/frontline_pb';
import {ActorVisual} from '../../src/render/actors';
import type {ArtLibrary,SpriteSheet,SpriteState} from '../../src/render/art';
import type {CatalogIndex,CatalogUnit} from '../../src/content/catalog';
import {Container,Sprite,Texture} from 'pixi.js';

const bases=['parked','rearm','takeoff','landing','launch','recover','damaged','fire'];
const defaults:MessageInitShape<typeof EntitySchema>={id:7,type:'US.fighter',owner:1,position:{x:1000,y:1000},complete:true,enabled:true,health:1000,state:'flying',private:{ammo:0,home:10}};
const entity=(patch:MessageInitShape<typeof EntitySchema>={})=>create(EntitySchema,{...defaults,...patch,$typeName:undefined});
function fixture(patch:MessageInitShape<typeof EntitySchema>={},drone=false,weapon='AIR_CANNON'){
 const unit={id:'US.fighter',role:drone?'gunship':'fighter',armor:'air',faction:drone?'IR':'US',weapon} as CatalogUnit;
 const catalog={units:new Map([[unit.id,unit]]),buildings:new Map()} as unknown as CatalogIndex;
 const actor=new ActorVisual(entity(patch),catalog,{resolve:()=>undefined} as unknown as ArtLibrary,'US');
 const states=new Map([...bases,...bases.map(name=>name+'_empty'),'fly','hover','empty','crash','bank_left','bank_right','orbit'].map(name=>[name,{name,part:'body',directions:16,frames:6,fps:10,loop:['fly','hover','empty','rearm','rearm_empty'].includes(name)} satisfies SpriteState]));
 if(drone)for(const name of ['takeoff','landing','takeoff_empty','landing_empty'])states.delete(name);
 const internal=actor as unknown as {viewer?:number;sheet:SpriteSheet;state:(now:number,reduced?:boolean)=>SpriteState|undefined;frameIndex:(state:SpriteState,now:number)=>number;stateAt:number;missingPayloadArt?:string};
 internal.viewer=1;internal.sheet={states,meta:{air:{cruise_altitude_mt:1400}}} as SpriteSheet;internal.stateAt=0;
 return {actor,internal,states,choose:(now=150,reduced=false)=>internal.state(now,reduced)?.name,frame:(now:number)=>internal.frameIndex(internal.state(now)!,now)};
}

test('actual aircraft poses retain current owned empty payload through parked, service, damage and final-shot cues',()=>{
 const scenarios=[
  {patch:{landed:true,state:'ready'},want:'parked_empty'},
  {patch:{landed:true,state:'servicing'},want:'rearm_empty'},
  {patch:{landed:true,state:'emergency_takeoff'},want:'parked_empty'},
  {patch:{health:300},want:'damaged_empty'},
  {patch:{enabled:false},want:'damaged_empty'},
  {patch:{state:'firing'},want:'fire_empty'},
  {patch:{state:'destroyed',health:0},want:'crash'},
 ];
 for(const {patch,want} of scenarios){const {actor,choose}=fixture(patch),before=structuredClone(actor.entity);assert.equal(choose(),want);assert.deepEqual(actor.entity,before);actor.dispose()}
 const {actor,choose,frame}=fixture();actor.cue('weapon_fired',100,true);assert.equal(choose(450),'fire_empty');assert.equal(frame(450),3);
 actor.update({...actor.entity,private:{...actor.entity.private!,ammo:1}},450);assert.equal(choose(450),'fire');assert.equal(frame(450),3,'Ammo change cannot restart the same cue');
 actor.clearFeedback();actor.update({...actor.entity,private:{...actor.entity.private!,ammo:0}},500);assert.equal(choose(550),'empty','Restore cannot replay a prior fire cue');actor.dispose();
});

test('payload appearance checks current viewer, current owner and current private data every time',()=>{
 const {actor,internal,choose}=fixture({landed:true,state:'servicing'});
 assert.equal(choose(),'rearm_empty');
 for(const owner of [2,3]){actor.update({...actor.entity,owner},200);assert.equal(choose(250),'rearm','Foreign private-shaped input must not become an ammo oracle')}
 actor.update({...actor.entity,owner:1,private:undefined},300);assert.equal(choose(350),'rearm','Missing private data is unknown');
 actor.update({...actor.entity,private:{...entity().private!}},400);assert.equal(choose(450),'rearm_empty');
 internal.viewer=2;assert.equal(choose(450),'rearm');internal.viewer=undefined;assert.equal(choose(450),'rearm');internal.viewer=1;assert.equal(choose(450),'rearm_empty');
 actor.update({...actor.entity,private:{...actor.entity.private!,ammo:2}},500);assert.equal(choose(550),'rearm');actor.dispose();
 const unarmed=fixture({landed:true,state:'servicing'},false,'');assert.equal(unarmed.choose(),'rearm');unarmed.actor.dispose();
 const foreignFlight=fixture({owner:2});assert.equal(foreignFlight.choose(),'hover','Even ordinary empty flight needs matching viewer');foreignFlight.actor.dispose();
});

test('all departure/recovery aliases keep canonical frame clocks and altitude when payload changes',()=>{
 for(const drone of [false,true]){
  const {actor,internal,choose,frame}=fixture({landed:true,state:'ready'},drone),depart=drone?'launch':'takeoff',arrive=drone?'recover':'landing';
  actor.update({...actor.entity,landed:false,state:'returning'},100);
  assert.equal(choose(400),depart+'_empty');assert.equal(frame(400),3);assert.equal(actor.visualAltitude(400),17.5);
  actor.update({...actor.entity,private:{...actor.entity.private!,ammo:1}},400);assert.equal(choose(400),depart);assert.equal(frame(400),3);assert.equal(actor.visualAltitude(400),17.5);
  actor.update({...actor.entity,private:{...actor.entity.private!,ammo:0}},450);assert.equal(choose(450),depart+'_empty');assert.equal(frame(450),3);
  internal.viewer=2;assert.equal(choose(450),depart);assert.equal(frame(450),3);internal.viewer=1;
  assert.equal(choose(700),'empty');assert.equal(actor.visualAltitude(700),35);
  actor.update({...actor.entity,landed:true,state:'servicing'},1000);assert.equal(choose(1300),arrive+'_empty');assert.equal(frame(1300),3);assert.equal(actor.visualAltitude(1300),17.5);
  assert.equal(choose(1300,true),'rearm_empty');assert.equal(actor.visualAltitude(1300,true),0);
  assert.equal(choose(1600),'rearm_empty');assert.equal(choose(2200),'rearm_empty');
  // Low power/stalled service does not change ammo, nor does destruction of home.
  actor.update({...actor.entity,private:{...actor.entity.private!,home:0}},2300);assert.equal(choose(2500),'rearm_empty');
  actor.clearFeedback();actor.update({...actor.entity},2600);assert.equal(choose(2700),'rearm_empty');assert.equal(actor.visualAltitude(2700),0);
  actor.update({...actor.entity,state:'ready',private:{...actor.entity.private!,ammo:2}},2800);assert.equal(choose(2850),'parked');actor.dispose();
 }
});

test('missing empty variants stay explicit incomplete art without changing authoritative state',()=>{
 const {actor,internal,states,choose}=fixture({landed:true,state:'servicing'});states.delete('rearm_empty');const before=structuredClone(actor.entity);
 assert.equal(choose(),'rearm');assert.equal(internal.missingPayloadArt,'rearm_empty');assert.deepEqual(actor.entity,before);
 actor.update({...actor.entity,private:{...actor.entity.private!,ammo:2}},200);assert.equal(choose(250),'rearm');assert.equal(internal.missingPayloadArt,undefined);actor.dispose();
});

test('a decoding atlas cannot retain stale payload pixels across empty or viewer boundaries',()=>{
 const {actor,internal,states}=fixture({landed:true,state:'servicing'});
 const roots=[new Container(),new Container()];
 const piece={root:roots[0],shadowRoot:roots[1],shadow:new Sprite(),beauty:new Sprite(),team:new Sprite(),offset:{x:0,y:0},poses:{} as Record<string,{state:string;direction:number;frame:number}>};
 const paint=actor as unknown as {paintPart:(part:typeof piece,state:SpriteState,heading:number,now:number,team:number,altitude:number)=>void};
 const frame={texture:Texture.EMPTY,atlasTexture:Texture.EMPTY,anchorX:.5,anchorY:.5};
 let ready='rearm';
 internal.sheet={...internal.sheet,pixelScale:1,hasFrame:()=>true,frame:(_layer:string,state:string)=>state===ready?frame:undefined} as unknown as SpriteSheet;
 for(const [previous,next] of [['rearm','rearm_empty'],['rearm_empty','rearm'],['fly','empty'],['empty','fly'],['fire','crash']]){
  ready=previous;piece.poses={};paint.paintPart(piece,states.get(previous)!,0,100,0xffffff,0);assert.equal(piece.beauty.visible,true);
  paint.paintPart(piece,states.get(next)!,0,150,0xffffff,0);assert.equal(piece.beauty.visible,false,previous+' must not persist while '+next+' loads');assert.equal(piece.team.visible,false);assert.equal(piece.shadow.visible,false);
  ready=next;paint.paintPart(piece,states.get(next)!,0,200,0xffffff,0);assert.equal(piece.beauty.visible,true,'Current authorized artwork becomes visible after decode');
 }
 // Ordinary same-knowledge animation pages retain the existing no-flicker path.
 ready='rearm_empty';piece.poses={};paint.paintPart(piece,states.get('rearm_empty')!,0,300,0xffffff,0);paint.paintPart(piece,states.get('parked_empty')!,0,350,0xffffff,0);assert.equal(piece.beauty.visible,true);
 for(const sprite of [piece.shadow,piece.beauty,piece.team])sprite.destroy();for(const root of roots)root.destroy();actor.dispose();
});
