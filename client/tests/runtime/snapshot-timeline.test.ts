import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {EntitySchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {SnapshotTimeline} from '../../src/render/snapshot-timeline';
import {ActorVisual} from '../../src/render/actors';
import {BattlefieldRenderer,type BattlefieldOptions} from '../../src/render/battlefield';
import {CatalogIndex} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import type {ArtLibrary} from '../../src/render/art';
import type {GameMap} from '../../src/runtime';

const catalog={units:new Map(),buildings:new Map(),weapons:new Map(),objects:new Map(),abilities:new Map()} as unknown as CatalogIndex;
const art={resolve:()=>undefined} as unknown as ArtLibrary;
const entity=(x=1000,facing=0,id=1)=>create(EntitySchema,{id,type:'test.mobile',owner:1,position:{x,y:1000},facing,health:1000,complete:true,enabled:true,state:'moving'});
const fixture=()=>new ActorVisual(entity(),catalog,art);
test('20 Hz and 10 Hz full states choose 50 and 100 ms; long tick jumps stay bounded',()=>{
 const clock=new SnapshotTimeline();assert.equal(clock.observe(0,1),50);assert.equal(clock.observe(1,1),50);assert.equal(clock.observe(3,1),100);assert.equal(clock.observe(100,1),100);assert.equal(clock.observe(100,1),null);assert.equal(clock.observe(0,1),50);assert.equal(clock.observe(0,2),50);
});
test('10 Hz interpolation moves through the second 50 ms without exceeding authority',()=>{
 const a=fixture();a.update(entity(2000),100,100);assert.equal(a.position(150).x,1500);assert.equal(a.position(175).x,1750);assert.equal(a.position(200).x,2000);assert.equal(a.position(2000).x,2000);a.dispose();
});
test('jittered updates sample the painted position and facing before changing destination',()=>{
 const a=fixture();a.update(entity(2000,90000),100,100);const p=a.position(170),f=a.facing(170);a.update(entity(3000,180000),170,100);assert.deepEqual(a.position(170),p);assert.equal(a.facing(170),f);assert.equal(a.position(220).x,2350);assert.equal(a.facing(220),121500);assert.equal(a.position(270).x,3000);a.dispose();
});
test('same-tick priority does not reset position, heading or current cosmetic cue',()=>{
 const a=fixture();a.update(entity(2000,90000),100,100);const internal=a as unknown as {action?:{names:string[];at:number}};internal.action={names:['launch'],at:100};const cue=internal.action;a.update({...a.entity},150,null);assert.equal(a.position(175).x,1750);assert.equal(a.facing(175),67500);assert.equal(internal.action,cue);a.dispose();
});
test('stalls hold last authority and resumed packets settle within 100 ms',()=>{
 const a=fixture();a.update(entity(2000),100,100);assert.equal(a.position(5000).x,2000);a.update(entity(8000),5000,100);assert.equal(a.position(5000).x,2000);assert.equal(a.position(5050).x,5000);assert.equal(a.position(5100).x,8000);assert.equal(a.position(10000).x,8000);a.dispose();
});
test('backward clock samples cannot overshoot and heading wraps along shortest arc',()=>{
 const a=fixture();a.update(entity(2000,350000),100,50);assert.equal(a.position(50).x,1000);assert.equal(a.facing(50),0);assert.equal(a.facing(125),-5000);a.update(entity(3000,10000),150,50);assert.equal(a.facing(175),0);assert.equal(a.facing(200),10000);a.dispose();
});
test('replay reset snaps directly to newly authorized position and suppresses stale heading',()=>{
 const a=fixture();a.update(entity(2000,90000),100,100);a.clearFeedback();a.update(entity(7000,180000),120,50);assert.equal(a.position(120).x,7000);assert.equal(a.facing(120),180000);a.dispose();
});
test('real Battlefield setSnapshot immediately redacts actor while retaining other movement clock',()=>{
 const map={id:'test',width:4,height:4,tiles:Array.from({length:16},()=>({terrain:'sand',height:0})),spawns:[],fields:[],stations:[],objects:[],shipment:{x:9000,y:9000}} as unknown as GameMap;
 const Renderer=BattlefieldRenderer as unknown as new(host:HTMLElement,options:BattlefieldOptions)=>BattlefieldRenderer;
 const r=new Renderer({} as HTMLElement,{map,catalog,art,settings:DEFAULT_SETTINGS,onGesture:()=>{}});
 const internal=r as unknown as {centered:boolean;actors:Map<number,ActorVisual>};internal.centered=true;
 const snapshot=(tick:number,entities:ReturnType<typeof entity>[])=>create(PlayerSnapshotSchema,{tick,player:1,entities,players:[{id:1,faction:'US',color:1}],visible:Array(16).fill(true),explored:Array(16).fill(true)});
 r.setSnapshot(snapshot(0,[entity(),entity(1000,0,2)]));r.setSnapshot(snapshot(2,[entity(2000),entity(2000,0,2)]));const retained=internal.actors.get(1)!;const state=retained as unknown as {changedAt:number};const at=state.changedAt;
 r.setSnapshot(snapshot(2,[entity(2000)]));assert.equal(internal.actors.has(2),false);assert.equal(internal.actors.get(1),retained);assert.equal(state.changedAt,at);assert.equal(retained.position(at+75).x,1750);
 r.setSnapshot(snapshot(4,[entity(3000),entity(2000,0,2)]));assert.equal(internal.actors.has(2),true);assert.equal(internal.actors.get(2)!.position(performance.now()).x,2000);
 for(const actor of internal.actors.values())actor.dispose();
});
