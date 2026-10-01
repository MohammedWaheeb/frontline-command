import test from 'node:test';
import assert from 'node:assert/strict';
import {create,type MessageInitShape} from '@bufbuild/protobuf';
import {EntitySchema} from '../../src/protocol/frontline_pb';
import {FlightPresentation} from '../../src/render/flight-presentation';
import {actorSpriteState} from '../../src/render/poses';
import type {SpriteState} from '../../src/render/art';
import type {CatalogUnit} from '../../src/content/catalog';
const art=new Map(['fly','hover','parked','rearm','takeoff','landing','launch','recover','crash','damaged','empty','bank_left','bank_right','orbit','ready','ready_empty','ready_two_charges','work_salvage','work_repair','deployed_work'].map(name=>[name,{name,part:'body',frames:6,fps:10,directions:16,loop:false} satisfies SpriteState]));
const aircraft={role:'fighter',armor:'air',faction:'US',weapon:'AIR_CANNON'} as CatalogUnit;
const entity=(patch:MessageInitShape<typeof EntitySchema>={})=>create(EntitySchema,{id:7,type:'US.fighter',owner:1,complete:true,enabled:true,health:1000,state:'flying',...patch});
test('aircraft empty payload and orbit art use only owner-private facts; observed service is public',()=>{
 const choose=(e:ReturnType<typeof entity>,unit=aircraft,turning=0)=>actorSpriteState(e,unit,true,art,undefined,turning,false,e.owner===1)?.name;
 assert.equal(choose(entity({private:{ammo:0}})),'empty');assert.equal(choose(entity({private:{ammo:2}})),'fly');
 assert.equal(choose(entity({owner:2})),'fly');assert.equal(choose(entity({owner:3})),'fly');
 assert.equal(choose(entity({private:{ammo:0}}),{...aircraft,weapon:''}),'fly');
 assert.equal(choose(entity({landed:true,state:'servicing',owner:2})),'rearm');assert.equal(choose(entity({landed:true,state:'ready'})),'parked');
 assert.equal(choose(entity({private:{ammo:2,orders:[{kind:'orbit'}]}})),'orbit');assert.equal(choose(entity(),aircraft,9000),'bank_left');assert.equal(choose(entity(),aircraft,-9000),'bank_right');
 assert.equal(choose(entity({health:300,private:{ammo:0}})),'damaged');assert.equal(choose(entity({state:'destroyed',enabled:false})),'crash');
});
test('launcher ready art never derives another player’s exact charges',()=>{
 const launcher={...aircraft,role:'launcher',armor:'light'},base={type:'IR.launcher',state:'idle',deployed:true};
 const choose=(patch:Parameters<typeof entity>[0])=>{const e=entity({...base,...patch});return actorSpriteState(e,launcher,false,art,undefined,0,false,e.owner===1)?.name};
 assert.equal(choose({private:{charges:0}}),'ready_empty');assert.equal(choose({private:{charges:1}}),'ready');assert.equal(choose({private:{charges:2}}),'ready_two_charges');
 assert.equal(choose({owner:2,private:undefined}),'ready');assert.equal(choose({owner:3,private:undefined}),'ready');
 for(const owner of [2,3])for(const charges of [0,1,2])assert.equal(choose({owner,private:{charges}}),'ready');
 assert.equal(actorSpriteState(entity({state:'salvage'}),{...launcher,role:'repair'},false,art)?.name,'work_salvage');
 assert.equal(actorSpriteState(entity({state:'repairing',deployed:true}),{...launcher,role:'repair'},false,art)?.name,'deployed_work');
});
test('initial and reset flight states are stable; transitions only follow observed landing changes',()=>{
 const visual=new FlightPresentation(),parked=entity({landed:true}),flying=entity();
 assert.equal(visual.altitude(flying,0,35),35);assert.equal(visual.state(0,art),undefined);assert.equal(visual.altitude(parked,0,35),0);
 visual.observe(parked,flying,100,35,art,false);assert.equal(visual.state(100,art)?.name,'takeoff');assert.equal(visual.altitude(flying,100,35),0);assert.equal(visual.altitude(flying,400,35),17.5);assert.equal(visual.altitude(flying,700,35),35);
 const before=structuredClone(flying);visual.observe(flying,flying,400,35,art,false);assert.equal(visual.startedAt('takeoff',400),100);assert.deepEqual(flying,before);
 visual.reset();assert.equal(visual.state(450,art),undefined);assert.equal(visual.altitude(flying,450,35),35);
 visual.observe(flying,parked,1000,35,art,false);assert.equal(visual.state(1000,art)?.name,'landing');assert.equal(visual.altitude(parked,1300,35),17.5);assert.equal(visual.altitude(parked,1600,35),0);
});
test('interrupted flight and crash remain continuous and settle on terrain without gameplay delay',()=>{
 const visual=new FlightPresentation(),flying=entity(),parked=entity({landed:true}),dead=entity({state:'destroyed',health:0});
 visual.observe(parked,flying,0,35,art,false);const interrupted=visual.altitude(flying,300,35);visual.observe(flying,parked,300,35,art,false);assert.equal(visual.altitude(parked,300,35),interrupted);
 visual.reset();visual.observe(flying,dead,1000,35,art,false);assert.equal(visual.state(1000,art)?.name,'crash');assert.equal(visual.altitude(dead,1000,35),35);assert(visual.altitude(dead,1300,35)<35);assert.equal(visual.altitude(dead,1600,35),0);
 assert.equal(visual.altitude(dead,1000,35,true),0);assert.equal(visual.state(1000,art,true),undefined);
 const droneArt=new Map(art);droneArt.delete('takeoff');droneArt.delete('landing');visual.reset();visual.observe(parked,flying,2000,35,droneArt,true);assert.equal(visual.state(2000,droneArt)?.name,'launch');
 visual.observe(flying,parked,2700,35,droneArt,true);assert.equal(visual.state(2700,droneArt)?.name,'recover');
});
