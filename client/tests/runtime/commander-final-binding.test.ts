import assert from 'node:assert/strict';
import {test} from 'node:test';
import {create,toBinary,fromBinary,type MessageInitShape} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {RuntimeError} from '../../src/runtime/errors';
import {captureCommanderFinalBinding,sameCommanderIdentity,type CommanderFinalBindingInput,type CommanderHostIdentity} from '../../src/app/commander-final-binding';

const identity=():CommanderHostIdentity=>({origin:'http://lan.test:8080',profileId:'profile-own',generation:7,hostGeneration:3});
function fixture():CommanderFinalBindingInput{
 const initial:MessageInitShape<typeof PlayerSnapshotSchema>={
  tick:1400,player:1,metadata:{protocol:1,simulation:'0.3.4',contentHash:'a'.repeat(64),mapVersion:'1',ruleset:'scenario-v2',seed:18446744073709551615n},outcome:{finished:true,draw:false,winningTeam:1,reason:'mission_complete',tick:1400},
  players:[{id:1,faction:'US',team:1,name:'SECRET_OWN_NAME',color:0x123456,strategicProgress:450},{id:2,faction:'IR',team:2,name:'SECRET_OTHER_NAME',defeated:true}],
  economy:{credits:777777n,energy:2000n},entities:[{id:99,owner:2,type:'SECRET_ENTITY',position:{x:123456,y:765432}}],events:[{kind:'SECRET_EVENT',position:{x:33333,y:44444}}],visible:[true],explored:[true],memory:[{id:88,type:'SECRET_MEMORY',position:{x:11111,y:22222}}],warnings:[{kind:'SECRET_WARNING',position:{x:55555,y:66666}}],
  debrief:{players:[{player:1,faction:'US',team:1,exploredTiles:900,unitsSurviving:8,structuresSurviving:4,name:'SECRET_DEBRIEF_NAME',credits:888888n,income:999999n,spent:555555n,lostValue:444444n,metrics:{player:1,interceptorsFired:3,stationControlTicks:1200,unitsLost:700,repairSpent:55555n,missileSpent:66666n,unitsProduced:[{type:'SECRET_PRODUCTION',count:10}],timeline:[{tick:1000,credits:77777n}]}},{player:2,faction:'IR',team:2,exploredTiles:12345,unitsSurviving:200,metrics:{player:2,interceptorsFired:9999,stationControlTicks:99999}}],events:[{kind:'SECRET_DEBRIEF_EVENT',text:'SECRET_EVENT_TEXT'}],omittedEvents:456},
  mission:{id:'coop-example',version:'1',difficulty:'normal',title:'SECRET_MISSION_TITLE',checkpoint:'SECRET_CHECKPOINT',objectives:[{id:'required-goal',optional:false,failure:false,complete:true,text:'SECRET_OBJECTIVE',progress:999,required:888},{id:'optional-goal',optional:true,failure:false,complete:true,text:'SECRET_OPTIONAL'},{id:'failure-goal',optional:false,failure:true,complete:false,text:'SECRET_FAILURE'}]},
 };
 const snapshot=create(PlayerSnapshotSchema,initial);
 return {session:'session-9',kind:'online',baseURL:'http://lan.test:8080',identity:identity(),connection:{match_id:'match-final',player:1,protocol:1,simulation:'0.3.4',content_hash:'a'.repeat(64)},slots:[{player:1,profile:'profile-own'},{player:2,profile:'profile-other'},{player:3}],snapshot};
}
function rejected(input:CommanderFinalBindingInput,code?:string){
 assert.throws(()=>captureCommanderFinalBinding(input),(error:unknown)=>error instanceof RuntimeError&&error.recoverable&&(!code||error.code===code)&&error.message.length<200&&error.details===undefined&&!/SECRET|profile-own|lan\.test|match-final/.test(error.message));
}
const json=(value:unknown)=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?String(item):item);

test('captures only a detached own final record without credentials, text or opponent payloads',()=>{
 const input=fixture(),before=structuredClone(input);
 Object.assign(input.connection!,{token:'SECRET_MATCH_TOKEN'});Object.assign(input.identity!,{credential:'SECRET_PROFILE_KEY'});
 const binding=captureCommanderFinalBinding(input)!;
 assert.equal(binding.key,JSON.stringify(['session-9','match-final',1]));assert.equal(binding.baseURL,'http://lan.test:8080');assert.deepEqual(binding.identity,identity());
 assert.deepEqual(Object.keys(binding.connection).sort(),['content_hash','match_id','player','protocol','simulation']);
 assert.equal(binding.snapshot.metadata!.seed,18446744073709551615n,'only JSON measurement stringifies the bigint');
 assert.deepEqual(binding.snapshot.players.map(player=>({id:player.id,faction:player.faction,team:player.team})),[{id:1,faction:'US',team:1}]);assert.equal(binding.snapshot.players[0].name,'');
 const own=binding.snapshot.debrief!.players[0];assert.equal(binding.snapshot.debrief!.players.length,1);assert.equal(own.player,1);assert.equal(own.faction,'US');assert.equal(own.team,1);assert.equal(own.exploredTiles,900);assert.equal(own.unitsSurviving,8);assert.equal(own.structuresSurviving,4);assert.equal(own.metrics!.player,1);assert.equal(own.metrics!.interceptorsFired,3);assert.equal(own.metrics!.stationControlTicks,1200);
 assert.equal(own.credits,0n);assert.equal(own.income,0n);assert.equal(own.spent,0n);assert.equal(own.lostValue,0n);assert.equal(own.metrics!.unitsLost,0);assert.equal(own.metrics!.repairSpent,0n);assert.equal(own.metrics!.missileSpent,0n);assert.deepEqual(own.metrics!.unitsProduced,[]);assert.deepEqual(own.metrics!.timeline,[]);assert.deepEqual(binding.snapshot.debrief!.events,[]);
 assert.deepEqual(binding.snapshot.mission!.objectives.map(({id,optional,failure,complete})=>({id,optional,failure,complete})),[{id:'required-goal',optional:false,failure:false,complete:true},{id:'optional-goal',optional:true,failure:false,complete:true},{id:'failure-goal',optional:false,failure:true,complete:false}]);
 assert.equal(binding.snapshot.mission!.title,'');assert.equal(binding.snapshot.mission!.checkpoint,'');assert.ok(binding.snapshot.mission!.objectives.every(goal=>goal.text===''&&goal.progress===0&&goal.required===0));
 assert.equal(binding.snapshot.economy,undefined);for(const field of ['entities','events','visible','explored','memory','warnings','projectiles','fields','stations','results'] as const)assert.deepEqual(binding.snapshot[field],[]);
 assert.doesNotMatch(json(binding),/SECRET|12345|777777|888888|999999|765432/);assert.ok(new TextEncoder().encode(json(binding)).byteLength<=16384);
 const roundtrip=fromBinary(PlayerSnapshotSchema,toBinary(PlayerSnapshotSchema,binding.snapshot));assert.equal(roundtrip.metadata!.seed,binding.snapshot.metadata!.seed);assert.equal(roundtrip.debrief!.players[0].metrics!.interceptorsFired,3);
 binding.identity.generation=99;binding.connection.match_id='mutated';binding.snapshot.metadata!.simulation='mutated';binding.snapshot.outcome!.tick=2;binding.snapshot.debrief!.players[0].metrics!.interceptorsFired=88;binding.snapshot.mission!.objectives[0].complete=false;
 assert.equal(input.identity!.generation,before.identity!.generation);assert.equal(input.connection!.match_id,before.connection!.match_id);assert.deepEqual(input.snapshot,before.snapshot);
});

test('input mutation after capture cannot change the queued binding and its stable key',()=>{
 const input=fixture(),binding=captureCommanderFinalBinding(input)!,prior=structuredClone(binding);
 input.identity!.profileId='another';input.identity!.hostGeneration++;input.connection!.player=2;input.snapshot!.players[0].team=22;input.snapshot!.debrief!.players[0].unitsSurviving=55;input.snapshot!.mission!.objectives[0].id='changed';assert.deepEqual(binding,prior);
 const again=fixture();again.snapshot!.mission!.objectives[1].complete=false;assert.equal(captureCommanderFinalBinding(again)!.key,prior.key);
 for(const change of [(value:CommanderFinalBindingInput)=>{value.session='session-10'},(value:CommanderFinalBindingInput)=>{value.connection!.match_id='match-next'}]){const changed=fixture();change(changed);assert.notEqual(captureCommanderFinalBinding(changed)!.key,prior.key)}
});

test('identity equality requires defined valid origins/profiles and exact auth/host epochs',()=>{
 const value=identity();assert.equal(sameCommanderIdentity(value,{...value}),true);assert.equal(sameCommanderIdentity(undefined,undefined),false);assert.equal(sameCommanderIdentity(value,undefined),false);
 const noOrigin={...value,origin:undefined} as unknown as CommanderHostIdentity;assert.equal(sameCommanderIdentity(noOrigin,noOrigin),false);
 for(const patch of [{origin:'http://another.test:8080'},{profileId:'another'},{generation:8},{hostGeneration:4},{generation:NaN},{generation:-1},{hostGeneration:Infinity},{origin:'http://lan.test:8080/'},{profileId:''},{origin:'http://user:SECRET@lan.test:8080'}]){const changed={...value,...patch};assert.equal(sameCommanderIdentity(value,changed),false);if(!Number.isSafeInteger(changed.generation)||!Number.isSafeInteger(changed.hostGeneration)||changed.generation<0||changed.hostGeneration<0||!changed.profileId||changed.origin.endsWith('/')||changed.origin.includes('SECRET'))assert.equal(sameCommanderIdentity(changed,changed),false)}
});

test('unfinished, absent, solo, practice, replay and observer sources never capture or require auth',()=>{
 for(const kind of ['solo','practice','replay','observer','editor',undefined]){const input=fixture();input.kind=kind;input.identity=undefined;assert.equal(captureCommanderFinalBinding(input),undefined)}
 const unfinished=fixture();unfinished.snapshot!.outcome!.finished=false;unfinished.identity=undefined;assert.equal(captureCommanderFinalBinding(unfinished),undefined);
 const absent=fixture();absent.snapshot=undefined;assert.equal(captureCommanderFinalBinding(absent),undefined);
 for(const ruleset of ['practice-v1','unknown','replay-v1']){const input=fixture();input.snapshot!.metadata!.ruleset=ruleset;input.identity=undefined;assert.equal(captureCommanderFinalBinding(input),undefined)}
 const standard=fixture();standard.snapshot!.metadata!.ruleset='standard-v2';standard.snapshot!.mission=undefined;assert.ok(captureCommanderFinalBinding(standard));
});

test('final capture rejects missing auth and mismatched host/profile slots/perspective',()=>{
 const missing=fixture();missing.identity=undefined;rejected(missing,'commander_final_auth');const noOrigin=fixture();noOrigin.identity!.origin=undefined as any;rejected(noOrigin,'commander_final_auth');
 const badIdentity:Array<(value:CommanderFinalBindingInput)=>void>=[value=>{value.identity!.generation=NaN},value=>{value.identity!.hostGeneration=-1},value=>{value.identity!.profileId=''},value=>{value.identity!.origin='http://lan.test:8080/'}];for(const change of badIdentity){const input=fixture();change(input);rejected(input,'commander_final_auth')}
 const changes:Array<(value:CommanderFinalBindingInput)=>void>=[value=>{value.baseURL='http://other.test:8080'},value=>{value.slots=[{player:1,profile:'another'}]},value=>{value.slots=[{player:2,profile:'profile-own'}]},value=>{value.slots=[{player:1}]},value=>{value.slots=[{player:1,profile:'profile-own'},{player:2,profile:'profile-own'}]},value=>{value.slots=[{player:1,profile:'profile-own'},{player:1,profile:'another'}]},value=>{value.snapshot!.player=2},value=>{value.snapshot!.metadata!.contentHash='b'.repeat(64)},value=>{value.snapshot!.metadata!.protocol=2},value=>{value.snapshot!.metadata!.simulation='next'},value=>{value.snapshot!.metadata=undefined}];
 for(const change of changes){const input=fixture();change(input);rejected(input,'commander_final_mismatch')}
});

test('invalid connection/session, final tick, metadata, own stats and flags fail with bounded errors',()=>{
 const changes:Array<(value:CommanderFinalBindingInput)=>void>=[value=>{value.session=''},value=>{value.session='bad\nSECRET'},value=>{value.baseURL='http://user:SECRET@lan.test:8080'},value=>{value.baseURL='http://lan.test:8080/private'},value=>{value.connection=undefined},value=>{value.connection!.match_id='bad/id'},value=>{value.connection!.player=Infinity},value=>{value.connection!.protocol=NaN},value=>{value.connection!.simulation=''},value=>{value.connection!.content_hash='hash'},value=>{value.snapshot!.tick=Infinity},value=>{value.snapshot!.tick=-1},value=>{value.snapshot!.outcome!.tick++},value=>{value.snapshot!.outcome!.draw='true' as any},value=>{value.snapshot!.outcome!.winningTeam=NaN},value=>{value.snapshot!.outcome!.reason=''},value=>{value.snapshot!.metadata!.seed=-1n},value=>{value.snapshot!.metadata!.seed=18446744073709551616n},value=>{value.snapshot!.metadata!.seed=5 as any},value=>{value.snapshot!.metadata!.mapVersion=''},value=>{value.snapshot!.players=[]},value=>{value.snapshot!.players.push(value.snapshot!.players[0])},value=>{value.snapshot!.players[0].faction='unknown'},value=>{value.snapshot!.players[0].team=NaN},value=>{value.snapshot!.debrief=undefined},value=>{value.snapshot!.debrief!.players=[]},value=>{value.snapshot!.debrief!.players.push(value.snapshot!.debrief!.players[0])},value=>{value.snapshot!.debrief!.players[0].faction='IR'},value=>{value.snapshot!.debrief!.players[0].team=2},value=>{value.snapshot!.debrief!.players[0].metrics=undefined},value=>{value.snapshot!.debrief!.players[0].metrics!.player=2},value=>{value.snapshot!.debrief!.players[0].exploredTiles=NaN},value=>{value.snapshot!.debrief!.players[0].unitsSurviving=1.5},value=>{value.snapshot!.debrief!.players[0].structuresSurviving=-1},value=>{value.snapshot!.debrief!.players[0].metrics!.interceptorsFired=Infinity},value=>{value.snapshot!.debrief!.players[0].metrics!.stationControlTicks=4294967296},value=>{value.snapshot!.mission=undefined},value=>{value.snapshot!.mission!.version=''},value=>{value.snapshot!.mission!.difficulty='extreme'},value=>{value.snapshot!.mission!.objectives[0].id='bad\nSECRET'},value=>{value.snapshot!.mission!.objectives.push(value.snapshot!.mission!.objectives[0])},value=>{value.snapshot!.mission!.objectives[0].optional='yes' as any},value=>{value.snapshot!.mission!.objectives[0].failure=1 as any},value=>{value.snapshot!.mission!.objectives[0].complete=undefined as any}];
 for(const change of changes){const input=fixture();change(input);rejected(input)}
 const wrongRules=fixture();wrongRules.snapshot!.metadata!.ruleset='standard-v2';rejected(wrongRules);
});

test('objective count and reduced JSON size are independently bounded',()=>{
 const count=fixture();count.snapshot!.mission!.objectives=Array.from({length:101},(_,index)=>({...count.snapshot!.mission!.objectives[0],id:`goal-${index}`}));rejected(count,'commander_final_invalid');
 const large=fixture();large.snapshot!.mission!.objectives=Array.from({length:100},(_,index)=>({...large.snapshot!.mission!.objectives[0],id:`g${index}-`+'x'.repeat(90)}));rejected(large,'commander_final_size');
 const discarded=fixture();discarded.snapshot!.mission!.title='SECRET'.repeat(100000);discarded.snapshot!.mission!.objectives[0].text='SECRET'.repeat(100000);discarded.snapshot!.players[0].name='SECRET'.repeat(100000);assert.ok(new TextEncoder().encode(json(captureCommanderFinalBinding(discarded))).byteLength<16384,'discarded text is not copied or measured as retained payload');
});
