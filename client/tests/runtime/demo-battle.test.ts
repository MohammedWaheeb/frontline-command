import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {create,fromBinary} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {armDemoEconomy,buildDemoBattle,prepareDemoBattle,DEMO_MAP_ID} from '../../src/app/demo-battle';
import type {GameMap,OrderIntent,RuntimeListener} from '../../src/runtime/types';
import type {LoadedMap} from '../../src/runtime/content-library';

const root=resolve(process.cwd(),'..');
const battlefield=()=>JSON.parse(readFileSync(join(root,'content/maps/copper-junction.json'),'utf8')) as GameMap;

test('demo opens a complete powered combined-arms base without changing the installed map',()=>{
 const map=battlefield(),before=JSON.stringify(map),config=buildDemoBattle(map),mission=config.mission as any;
 assert.equal(JSON.stringify(map),before);
 assert.equal(config.ruleset,'practice-v1','demo results must not write campaign or mastery progress');
 assert.equal(config.players,undefined,'mission owns the player slots');
 assert.equal(mission.default_bases,false,'the authored base replaces the normal bare HQ opening');
 assert.equal(mission.players[0].controller,'human');assert.equal(mission.players[1].ai,'easy');
 const own=mission.initial.filter((spawn:any)=>spawn.owner===1);
 for(const type of ['hq','power','supply','barracks','factory','radar','tech','depot','strategic','US.airfield','turret','aa_post','abm','US.rig','US.hauler','US.rifle','US.at','US.tank','US.artillery','US.aa','US.fighter','US.strike','US.gunship'])assert.ok(own.some((spawn:any)=>spawn.type===type),type);
 const objectives=mission.objectives[0].condition.children;
 assert.ok(objectives.some((condition:any)=>condition.type==='hq'&&condition.owner===2));
 assert.ok(objectives.every((condition:any)=>condition.kind==='count_type'&&condition.compare==='at_most'&&condition.count===0),'victory checks surviving production, including rebuilt structures');
 assert.throws(()=>buildDemoBattle({...map,version:'2'}),/Copper Junction/);
});

test('demo loads the verified installed battlefield once and propagates loading failures',async()=>{
 const map=battlefield(),calls:string[]=[];
 const config=await prepareDemoBattle({loadMap:async id=>{calls.push(id);return {map} as LoadedMap}});
 assert.deepEqual(calls,[DEMO_MAP_ID]);assert.equal(config.map,map);
 const failure=new Error('map unavailable');
 await assert.rejects(prepareDemoBattle({loadMap:async()=>{throw failure}}),error=>error===failure);
});

test('demo gather waits for countdown completion, commands only own haulers once, and detaches',async()=>{
 const snapshot=create(PlayerSnapshotSchema,{player:1,countdown:5,mission:{id:'demo-battle'},entities:[{id:10,type:'US.hauler',owner:1},{id:11,type:'US.tank',owner:1},{id:12,type:'US.hauler',owner:2}]}),listeners=new Set<RuntimeListener>(),orders:OrderIntent[][]=[];
 const runtime={current:snapshot,subscribe:(listener:RuntimeListener)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},sendOrders:async(batch:OrderIntent[])=>{orders.push(batch);return 1}};
 armDemoEconomy(runtime,error=>{throw error});assert.equal(orders.length,0);assert.equal(listeners.size,1);
 snapshot.countdown=0;for(const listener of listeners)listener({type:'snapshot',snapshot});await Promise.resolve();
 assert.deepEqual(orders,[[{kind:'gather',entities:[10]}]]);assert.equal(listeners.size,0);
 armDemoEconomy({...runtime,current:{...snapshot,mission:{...snapshot.mission!,id:'another-mission'}}},error=>{throw error});await Promise.resolve();assert.equal(orders.length,1);assert.equal(listeners.size,0);
});

test('demo gather setup can be canceled and reports command failures',async()=>{
 const snapshot=create(PlayerSnapshotSchema,{player:1,countdown:5,mission:{id:'demo-battle'},entities:[{id:10,type:'US.hauler',owner:1}]}),listeners=new Set<RuntimeListener>(),errors:unknown[]=[];
 let sends=0;const failure=new Error('transport failed');
 const runtime={current:snapshot,subscribe:(listener:RuntimeListener)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},sendOrders:async()=>{sends++;throw failure}};
 const cancel=armDemoEconomy(runtime,error=>errors.push(error));cancel();assert.equal(listeners.size,0);assert.equal(sends,0);
 snapshot.countdown=0;armDemoEconomy(runtime,error=>errors.push(error));await new Promise(resolve=>setImmediate(resolve));assert.equal(sends,1);assert.deepEqual(errors,[failure]);assert.equal(listeners.size,0);
});

test('actual Go demo creation, economy orders, save/restore and power/supply limits', {skip:process.env.FRONTLINE_DEMO_NATIVE!=='1'},()=>{
 const temporary=mkdtempSync(join(tmpdir(),'fc-demo-'));
 try{
  const config=buildDemoBattle(battlefield());
  const run=(script:unknown[])=>{
   const file=join(temporary,'scenario.json');writeFileSync(file,JSON.stringify({config,script}));
   return JSON.parse(execFileSync('go',['run','./cmd/wasm','-scenario',file],{cwd:root,encoding:'utf8',timeout:120000}));
  };
  const opening=run([{op:'view',player:1,label:'opening'}]);
  const snapshot=fromBinary(PlayerSnapshotSchema,Buffer.from(opening.views.opening,'hex'));
  const isUnit=(type:string)=>type.startsWith('US.')&&type!=='US.airfield';
  assert.equal(snapshot.entities.filter(actor=>actor.owner===1&&!isUnit(actor.type)).length,19);
  assert.equal(snapshot.entities.filter(actor=>actor.owner===1&&isUnit(actor.type)).length,31);
  assert.equal(snapshot.economy?.supply,77);assert.equal(snapshot.economy?.tier,3);
  assert.ok(snapshot.economy!.powerCapacity>snapshot.economy!.powerDemand);
  const airfield=snapshot.entities.find(actor=>actor.type==='US.airfield')!;
  for(const actor of snapshot.entities.filter(actor=>['US.fighter','US.strike','US.gunship','US.airlift'].includes(actor.type)))assert.equal(actor.private?.home,airfield.id);
  const haulers=snapshot.entities.filter(actor=>actor.owner===1&&actor.type==='US.hauler').map(actor=>actor.id);
  const playing=run([{op:'step',n:100},{op:'submit',player:1,batch:{sequence:1,orders:[{kind:'gather',entities:haulers}]}},...Array.from({length:7},()=>({op:'step',n:200})),{op:'checkpoint',label:'before-save'},{op:'save_restore'},{op:'checkpoint',label:'after-restore'},{op:'view',player:1,label:'playing'}]);
  assert.equal(playing.submits[0],'accepted');
  assert.equal(playing.checkpoints[0].hash,playing.checkpoints[1].hash);
  const after=fromBinary(PlayerSnapshotSchema,Buffer.from(playing.views.playing,'hex'));
  assert.ok(after.economy!.income>0n,'prepared haulers must earn income when given the initial gather order');
  assert.equal(after.outcome?.finished,false,'the opening should remain playable');
 }finally{rmSync(temporary,{recursive:true,force:true})}
});
