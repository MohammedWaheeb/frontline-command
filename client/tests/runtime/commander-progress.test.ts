import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,MatchResultSchema} from '../../src/protocol/frontline_pb';
import {LocalStore,type LocalProgress} from '../../src/runtime/storage';
import {CampaignProgressStore,type CampaignProgress} from '../../src/runtime/progress';
import {decodeContentIndex,type LoadedMission} from '../../src/runtime/content-library';
import {COMMANDER_PROGRESS_ID,COMMANDER_PROGRESS_LIMIT,CommanderProgressStore,commanderOverview,commanderChallengeGoal,validateCommanderProgress,mergeCommanderProgress,type CommanderProgress,type CommanderFinalRecord,type CommanderSoloRuntime,type CommanderServerInput} from '../../src/runtime/commander-progress';
import type {PlayerSnapshot,SessionInfo,GameMap} from '../../src/runtime/types';

const contentRoot=resolve(process.cwd(),'..'),index=decodeContentIndex(new Uint8Array(readFileSync(resolve(contentRoot,'content/index.json'))));
const options={isCurrent:()=>true,completedAt:100};
let database=0;
const local=()=>new LocalStore(`commander-test-${++database}`);
function loaded(mission:string):LoadedMission {
 const entry=index.missions.find(value=>value.id===mission)!;
 const missionSource=new Uint8Array(readFileSync(resolve(contentRoot,entry.url.slice(1))));
 assert.equal(createHash('sha256').update(missionSource).digest('hex'),entry.sha256);
 // This is a content-byte fixture for the helper. Actual launching is Go-validated by ContentLibrary.
 return {entry:structuredClone(entry),mission:JSON.parse(new TextDecoder().decode(missionSource)),map:{} as GameMap,mapSource:new Uint8Array(),missionSource,packs:[]};
}
function final(player=1):PlayerSnapshot {
 return create(PlayerSnapshotSchema,{tick:6000,player,metadata:{simulation:'0.3.4',protocol:1,contentHash:'b'.repeat(64),mapVersion:'1',ruleset:'scenario-v2',seed:15n},players:[{id:player,faction:'US',team:1,name:'Fixture commander'}],outcome:{finished:true,draw:false,winningTeam:1,reason:'mission_complete',tick:6000},mission:{id:'us-01-first-foothold',version:'1',difficulty:'normal',objectives:[{id:'main',complete:true,optional:false,failure:false},{id:'engineering-rescue',complete:true,optional:true,failure:false},{id:'failed',complete:true,optional:false,failure:true},{id:'unearned',complete:false,optional:true,failure:false}]},debrief:{players:[{player,faction:'US',team:1,unitsSurviving:9,structuresSurviving:7,exploredTiles:200,metrics:{player,interceptorsFired:3,stationControlTicks:750}}],events:[{tick:6000,kind:'objective_complete',text:'Unrelated capped history entry'}],omittedEvents:300}});
}
function session(snapshot:PlayerSnapshot):SessionInfo {
 const m=snapshot.metadata!;
 return {adapter:'1',metadata:{simulation:m.simulation,protocol:m.protocol,content_hash:m.contentHash,map_version:m.mapVersion,ruleset:m.ruleset,seed:Number(m.seed)},tick:snapshot.tick,local_players:[snapshot.player],finished:true,replay:false,replay_start:0,replay_end:0};
}
function runtime(snapshot=final(),hash='a'.repeat(64)):CommanderSoloRuntime {
 return {mode:'offline',current:snapshot,info:async()=>session(snapshot),hash:async()=>hash};
}
function server(snapshot=final(),match='match-one',baseURL='http://localhost:8080'):CommanderServerInput {
 const m=snapshot.metadata!;
 return {kind:'online',baseURL,snapshot,connection:{match_id:match,player:snapshot.player,protocol:m.protocol,simulation:m.simulation,content_hash:m.contentHash},result:create(MatchResultSchema,{matchId:match,committed:true,outcome:structuredClone(snapshot.outcome)})};
}
function receipt(n=1):CommanderFinalRecord {
 return {result_id:`solo-${n.toString(16).padStart(64,'0')}-1`,source:'solo',faction:'US',completed_at:100,tick:6000,tilesSurveyed:200,unitsAtEnd:9,structuresAtEnd:7,interceptorShots:3,objectivesCompleted:2,stationControlTicks:750};
}
function campaign(mission='us-01-first-foothold',version='1',optional=['engineering-rescue']):CampaignProgress {
 return {version:1,results:['campaign-result'],missions:{[`${mission}:${version}:normal`]:{mission,mission_version:version,difficulty:'normal',completions:1,first_completed:10,last_completed:10,best_tick:6000,optional_objectives:optional}}};
}
async function restoreAll(target:LocalStore,file:Blob){const preview=await target.previewBackup(file);return target.restoreBackup(preview,preview.entries.map(entry=>({key:entry.key,action:'restore',expectedRevision:entry.current?.revision??0})))}

test('all 24 real campaign milestones expose SHA-bound optional challenges; absent mastery derives zero totals',()=>{
 const overview=commanderOverview(index);assert.equal(overview.factions.length,4);assert.equal(overview.challenges.length,24);
 for(const challenge of overview.challenges){const actual=commanderChallengeGoal(challenge,loaded(challenge.mission));assert.equal(actual.description,challenge.description);assert.equal(actual.objectiveID,challenge.objectiveID);assert.equal(actual.unlocked,false);assert.equal(actual.complete,false)}
 for(const faction of overview.factions){assert.equal(faction.campaignTotal,6);assert.equal(faction.campaignMissions,0);assert.equal(faction.matches,0);assert.equal(faction.badges.some(badge=>badge.earned),false)}
});

test('legacy campaign v1 grants story access and cosmetics without rewriting progress or combat configuration',()=>{
 const state=campaign(),before=structuredClone(state),view=commanderOverview(index,state),challenge=view.challenges.find(value=>value.mission==='us-01-first-foothold')!;
 assert.equal(challenge.unlocked,true);assert.equal(challenge.complete,true);assert.equal(challenge.objectiveID,'engineering-rescue');assert.equal(view.factions[0].campaignMissions,1);assert.equal(view.factions[0].matches,0);assert.deepEqual(state,before);
 const historical=commanderOverview(index,campaign('us-01-first-foothold','old'));assert.equal(historical.challenges[0].unlocked,true);assert.equal(historical.challenges[0].complete,false);assert.equal(historical.factions[0].badges[0].earned,true);
 const all:CampaignProgress={version:1,results:[],missions:{}};for(const entry of index.missions.filter(value=>value.mode==='campaign'&&value.faction==='US')){all.results.push(entry.id);Object.assign(all.missions,campaign(entry.id,'1',[]).missions)}
 assert.equal(commanderOverview(index,all).factions[0].badges.find(value=>value.id==='operation-US')?.earned,true);
});

test('changed content hides stale goal text and helper resolves only the matching loaded optional definition',()=>{
 const changed=structuredClone(index),entry=changed.missions.find(value=>value.mode==='campaign')!;entry.sha256='d'.repeat(64);const view=commanderOverview(changed,campaign()),challenge=view.challenges.find(value=>value.mission===entry.id)!;
 assert.equal(challenge.objectiveID,undefined);assert.equal(challenge.complete,false);
 const actual=loaded(entry.id);actual.entry.sha256=entry.sha256;actual.mission.objectives=[{id:'new-goal',text:'Preserve the new marked scout.',optional:true,failure:false}];const goal=commanderChallengeGoal(challenge,actual);assert.equal(goal.objectiveID,'new-goal');assert.equal(goal.description,'Preserve the new marked scout.');assert.equal(goal.complete,false);
 assert.throws(()=>commanderChallengeGoal(challenge,loaded(entry.id)),{code:'content_superseded'});
 actual.mission.objectives=[];assert.throws(()=>commanderChallengeGoal(challenge,actual),{code:'commander_challenge_invalid'});
});

test('mastery uses honest final counters and authoritative team objectives, never capped events or interception success',async()=>{
 const store=local(),progress=new CommanderProgressStore(store),result=await progress.recordSolo(runtime(),'solo',options);assert.equal(result.recorded,true);
 const saved=(await progress.read())!.data,record=saved.results[0];assert.equal(record.objectivesCompleted,2);assert.equal(record.interceptorShots,3);assert.equal(record.unitsAtEnd,9);assert.equal(record.tilesSurveyed,200);
 const next=final();next.debrief!.players[0].exploredTiles=100;next.debrief!.players[0].unitsSurviving=2;await progress.recordSolo(runtime(next,'c'.repeat(64)),'solo',options);
 const view=commanderOverview(index,undefined,(await progress.read())!.data).factions[0];assert.equal(view.matches,2);assert.equal(view.tilesSurveyed,200);assert.equal(view.unitsAtEnd,11);assert.equal(view.interceptorShots,6);assert.equal(view.objectivesCompleted,4);assert.match(view.badges.find(value=>value.id.includes('interceptorShots'))!.description,/not a success count/);await store.close();
});

test('all ineligible solo caller modes, replay flags, and practice/unknown rulesets refuse every write',async()=>{
 const store=local(),progress=new CommanderProgressStore(store);
 for(const kind of ['practice','replay','editor','observer'] as const)assert.equal((await progress.recordSolo(runtime(),kind,options)).reason,'ineligible_source');
 const replay=runtime();replay.info=async()=>({...session(final()),replay:true});assert.equal((await progress.recordSolo(replay,'solo',options)).reason,'ineligible_source');
 for(const ruleset of ['practice-v1','future-v9']){const snapshot=final();snapshot.metadata!.ruleset=ruleset;assert.equal((await progress.recordSolo(runtime(snapshot),'solo',options)).reason,'ineligible_source')}
 const fakeInfo=runtime();fakeInfo.info=async()=>({...session(final()),metadata:{...session(final()).metadata!,ruleset:'practice-v1'}});assert.equal((await progress.recordSolo(fakeInfo,'solo',options)).reason,'ineligible_source');assert.equal(await progress.read(),undefined);await store.close();
});

test('unfinished, missing final debrief/mission, and local-player mismatch cannot award mastery',async()=>{
 const store=local(),progress=new CommanderProgressStore(store);
 const unfinished=final();unfinished.outcome!.finished=false;assert.equal((await progress.recordSolo(runtime(unfinished),'solo',options)).reason,'unfinished');
 const debrief=final();debrief.debrief=undefined;assert.equal((await progress.recordSolo(runtime(debrief),'solo',options)).reason,'result_pending');
 const mission=final();mission.mission=undefined;assert.equal((await progress.recordSolo(runtime(mission),'solo',options)).reason,'result_pending');
 const other=runtime();other.info=async()=>({...session(final()),local_players:[2]});assert.equal((await progress.recordSolo(other,'solo',options)).reason,'unfinished');assert.equal(await progress.read(),undefined);await store.close();
});

test('metadata, player/telemetry and numeric corruption reject atomically',async()=>{
 const store=local(),progress=new CommanderProgressStore(store);
 const mismatched=runtime();mismatched.info=async()=>({...session(final()),metadata:{...session(final()).metadata!,content_hash:'c'.repeat(64)}});await assert.rejects(()=>progress.recordSolo(mismatched,'solo',options),{code:'commander_result_invalid'});
 for(const mutate of [(s:PlayerSnapshot)=>s.debrief!.players[0].metrics!.player=2,(s:PlayerSnapshot)=>s.debrief!.players[0].faction='IR',(s:PlayerSnapshot)=>s.debrief!.players[0].unitsSurviving=-1,(s:PlayerSnapshot)=>s.debrief!.players[0].metrics!.interceptorsFired=0x100000000,(s:PlayerSnapshot)=>s.outcome!.tick++]){const snapshot=final();mutate(snapshot);await assert.rejects(()=>progress.recordSolo(runtime(snapshot),'solo',options),{code:'commander_result_invalid'})}
 await assert.rejects(()=>progress.recordSolo(runtime(final(),'invalid'),'solo',options),{code:'commander_result_invalid'});assert.equal(await progress.read(),undefined);await store.close();
});

test('active-session cancellation and final-state changes during hash verification leave no receipt',async()=>{
 const store=local(),progress=new CommanderProgressStore(store),changed=runtime();changed.hash=async()=>{changed.current=final();changed.current.tick++;changed.current.outcome!.tick++;return 'a'.repeat(64)};
 await assert.rejects(()=>progress.recordSolo(changed,'solo',options),{code:'session_changed'});
 let active=true;const canceled=runtime();canceled.info=async()=>{active=false;return session(final())};await assert.rejects(()=>progress.recordSolo(canceled,'solo',{isCurrent:()=>active}),{code:'session_changed'});assert.equal(await progress.read(),undefined);await store.close();
});

test('same final receipt across concurrent tabs or restored finals increments once; different local players remain distinct',async()=>{
 const store=local(),other=new LocalStore(store.name),a=new CommanderProgressStore(store),b=new CommanderProgressStore(other);
 const results=await Promise.all([a.recordSolo(runtime(),'solo',options),b.recordSolo(runtime(),'solo',options)]);assert.equal(results.filter(value=>value.recorded).length,1);assert.equal((await a.read())?.revision,1);assert.equal((await a.recordSolo(runtime(),'solo',{...options,completedAt:999})).reason,'duplicate');
 await b.recordSolo(runtime(final(2)),'solo',options);assert.equal((await a.read())?.data.results.length,2);assert.equal(commanderOverview(index,undefined,(await a.read())?.data).factions[0].matches,2);await store.close();await other.close();
});

test('a repeated final hash with different counters is a conflict, not a silent overwrite',async()=>{
 const store=local(),progress=new CommanderProgressStore(store);await progress.recordSolo(runtime(),'solo',options);const changed=final();changed.debrief!.players[0].unitsSurviving=1;
 await assert.rejects(()=>progress.recordSolo(runtime(changed),'solo',options),{code:'commander_result_conflict'});assert.equal((await progress.read())?.revision,1);assert.equal((await progress.read())?.data.results[0].unitsAtEnd,9);await store.close();
});

test('losses and draws track useful actions without requiring victory or rewarding match sabotage',async()=>{
 const store=local(),progress=new CommanderProgressStore(store),loss=final();loss.outcome!.winningTeam=2;loss.outcome!.reason='annihilation';await progress.recordSolo(runtime(loss),'solo',options);
 const draw=final();draw.outcome!.draw=true;draw.outcome!.winningTeam=0;draw.outcome!.reason='draw';await progress.recordSolo(runtime(draw,'c'.repeat(64)),'solo',options);assert.equal((await progress.read())?.data.results.length,2);await store.close();
});

test('committed server records bind normalized host, match, authenticated player, metadata and final outcome',async()=>{
 const store=local(),progress=new CommanderProgressStore(store);const first=await progress.recordServer(server(),options);assert.equal(first.recorded,true);assert.equal((await progress.recordServer(server(final(),'match-one','http://localhost:8080/path'),options)).reason,'duplicate');
 await progress.recordServer(server(final(2)),options);assert.equal((await progress.read())?.data.results.length,2);
 const mismatch=server();mismatch.connection.player=2;await assert.rejects(()=>progress.recordServer(mismatch,options),{code:'commander_result_mismatch'});
 const metadata=server();metadata.connection.content_hash='c'.repeat(64);await assert.rejects(()=>progress.recordServer(metadata,options),{code:'commander_result_mismatch'});
 const outcome=server();outcome.result.outcome!.winningTeam=2;await assert.rejects(()=>progress.recordServer(outcome,options),{code:'commander_result_mismatch'});
 await assert.rejects(()=>progress.recordServer(server(final(),'other','http://user:password@localhost:8080'),options),{code:'content_origin'});assert.equal((await progress.read())?.data.results.length,2);await store.close();
});

test('void, uncommitted, observer/replay/editor/practice and mislabeled practice server results never write',async()=>{
 const store=local(),progress=new CommanderProgressStore(store);
 for(const kind of ['observer','replay','practice','editor'] as const){const input=server();input.kind=kind;assert.equal((await progress.recordServer(input,options)).reason,'ineligible_source')}
 const pending=server();pending.result.committed=false;assert.equal((await progress.recordServer(pending,options)).reason,'result_pending');const voided=server();voided.result.void=true;assert.equal((await progress.recordServer(voided,options)).reason,'ineligible_source');
 const practice=server();practice.snapshot.metadata!.ruleset='practice-v1';assert.equal((await progress.recordServer(practice,options)).reason,'ineligible_source');assert.equal(await progress.read(),undefined);await store.close();
});

test('schema validation refuses future, corrupt, duplicate or out-of-range receipts and preserves originals',async()=>{
 for(const value of [{version:2,results:[]},{version:1,results:[receipt(),receipt()]},{version:1,results:[{...receipt(),unitsAtEnd:'9'}]},{version:1,results:[{...receipt(),tick:-1}]},{version:1,results:[{...receipt(),interceptorShots:0x100000000}]},{version:1,results:[],combatBonus:1}])assert.throws(()=>validateCommanderProgress(value));
 const store=local(),progress=new CommanderProgressStore(store);await store.putProgress(COMMANDER_PROGRESS_ID,{version:2,results:[]});const before=await store.progress(COMMANDER_PROGRESS_ID);await assert.rejects(()=>progress.recordSolo(runtime(),'solo',options),{code:'commander_progress_incompatible'});assert.deepEqual(await store.progress(COMMANDER_PROGRESS_ID),before);assert.match(await (await store.backup()).text(),/"version":2/);await store.close();
});

test('512 maximal receipts fit 256 KiB; a full ledger preserves all IDs and accepts duplicates only',async()=>{
 const maximum={...receipt(),source:'server' as const,completed_at:Number.MAX_SAFE_INTEGER,tick:0xffffffff,tilesSurveyed:0xffffffff,unitsAtEnd:0xffffffff,structuresAtEnd:0xffffffff,interceptorShots:0xffffffff,objectivesCompleted:100,stationControlTicks:0xffffffff};
 const max:CommanderProgress={version:1,results:Array.from({length:COMMANDER_PROGRESS_LIMIT},(_,n)=>({...maximum,result_id:`server-${(n+1).toString(16).padStart(64,'0')}`}))};validateCommanderProgress(max);assert.ok(new TextEncoder().encode(JSON.stringify(max)).length<256*1024);
 const store=local(),progress=new CommanderProgressStore(store),full:CommanderProgress={version:1,results:Array.from({length:COMMANDER_PROGRESS_LIMIT},(_,n)=>receipt(n+1))};full.results[0].result_id=`solo-${'a'.repeat(64)}-1`;await store.putProgress(COMMANDER_PROGRESS_ID,full);
 assert.equal((await progress.recordSolo(runtime(),'solo',options)).reason,'duplicate');await assert.rejects(()=>progress.recordSolo(runtime(final(),'e'.repeat(64)),'solo',options),{code:'commander_progress_full'});assert.equal((await progress.read())?.revision,1);assert.deepEqual((await progress.read())?.data,full);await store.close();
});

test('merging repeated or older backups never discards IDs or adds duplicate mastery; conflicting receipts reject',()=>{
 const first:CommanderProgress={version:1,results:[receipt(1),receipt(2)]},incoming:CommanderProgress={version:1,results:[{...receipt(1),completed_at:999},receipt(3)]},merged=mergeCommanderProgress(first,incoming);assert.equal(merged.results.length,3);assert.equal(merged.results[0].completed_at,100);assert.equal(mergeCommanderProgress(merged,incoming).results.length,3);assert.equal(mergeCommanderProgress(merged,{version:1,results:[]}).results.length,3);
 assert.throws(()=>mergeCommanderProgress(first,{version:1,results:[{...receipt(1),unitsAtEnd:1}]}),{code:'commander_result_conflict'});assert.deepEqual(first.results,[receipt(1),receipt(2)]);
});

test('real backup restore merges old/repeated mastery receipts and never rewrites CampaignProgress v1',async()=>{
 const source=local(),target=local(),campaignStore=new CampaignProgressStore(target);await source.putProgress(COMMANDER_PROGRESS_ID,{version:1,results:[receipt(1)]});await target.putProgress(COMMANDER_PROGRESS_ID,{version:1,results:[receipt(1),receipt(2)]});await target.putProgress('campaign',campaign());const campaignBefore=await campaignStore.read(),file=await source.backup();
 await restoreAll(target,file);await restoreAll(target,file);const result=await new CommanderProgressStore(target).read();assert.equal(result?.data.results.length,2);assert.equal(commanderOverview(index,undefined,result?.data).factions[0].matches,2);assert.deepEqual(await campaignStore.read(),campaignBefore);await source.close();await target.close();
});

test('copying a malformed generic progress record into commander is rejected before every selected write',async()=>{
 const source=local(),target=local();await source.putSetting('language',{language:'en'});await source.putProgress('generic',{version:1,results:[{result_id:'bad'}]});const preview=await target.previewBackup(await source.backup());assert.equal(preview.entries.every(entry=>entry.status==='ready'),true);
 await assert.rejects(()=>target.restoreBackup(preview,preview.entries.map(entry=>entry.store==='progress'?{key:entry.key,action:'copy',id:COMMANDER_PROGRESS_ID,expectedRevision:0}:{key:entry.key,action:'restore',expectedRevision:0})),{code:'commander_progress_invalid'});assert.equal(await target.setting('language'),undefined);assert.equal(await target.progress(COMMANDER_PROGRESS_ID),undefined);await source.close();await target.close();
});

test('same-ID receipt conflict and full restore abort all writes, preserving prior settings and ledger',async()=>{
 const source=local(),target=local();await source.putSetting('language',{language:'new'});await source.putProgress(COMMANDER_PROGRESS_ID,{version:1,results:[{...receipt(1),unitsAtEnd:1}]});await target.putSetting('language',{language:'old'});await target.putProgress(COMMANDER_PROGRESS_ID,{version:1,results:[receipt(1)]});const before=await target.progress(COMMANDER_PROGRESS_ID);
 await assert.rejects(async()=>restoreAll(target,await source.backup()),{code:'commander_result_conflict'});assert.equal((await target.setting<{language:string}>('language'))?.data.language,'old');assert.deepEqual(await target.progress(COMMANDER_PROGRESS_ID),before);
 const full:CommanderProgress={version:1,results:Array.from({length:COMMANDER_PROGRESS_LIMIT},(_,n)=>receipt(n+1))};await target.putProgress(COMMANDER_PROGRESS_ID,full,before!.revision);await source.putProgress(COMMANDER_PROGRESS_ID,{version:1,results:[receipt(1000)]},1);const fullBefore=await target.progress(COMMANDER_PROGRESS_ID);
 await assert.rejects(async()=>restoreAll(target,await source.backup()),{code:'commander_progress_full'});assert.equal((await target.setting<{language:string}>('language'))?.data.language,'old');assert.deepEqual(await target.progress(COMMANDER_PROGRESS_ID),fullBefore);await source.close();await target.close();
});

test('unsupported and corrupt mastery imports are marked, preserved as original recovery bytes, and never restored',async()=>{
 const source=local(),target=local();await source.putProgress(COMMANDER_PROGRESS_ID,{version:2,results:[]});const file=await source.backup(),preview=await target.previewBackup(file);assert.equal(preview.preserveOriginal,true);assert.equal(preview.entries[0].status,'unsupported');await target.restoreBackup(preview,preview.entries.map(entry=>({key:entry.key,action:'keep'})));const recovery=await target.listRecoveryFiles();assert.equal(recovery.length,1);assert.equal(await (await target.exportRecovery(recovery[0].id)).text(),await file.text());assert.equal(await target.progress(COMMANDER_PROGRESS_ID),undefined);
 await source.putProgress(COMMANDER_PROGRESS_ID,{version:1,results:[{...receipt(),tilesSurveyed:-1}]},1);const invalid=await target.previewBackup(await source.backup());assert.equal(invalid.entries[0].status,'invalid');assert.equal(invalid.preserveOriginal,true);await source.close();await target.close();
});

test('lossy uint64 save seeds are refused explicitly and leave final saves and local receipts untouched',async()=>{
 const store=local(),progress=new CommanderProgressStore(store),snapshot=final();snapshot.metadata!.seed=9007199254740992n;const before=structuredClone(snapshot);
 await assert.rejects(()=>progress.recordSolo(runtime(snapshot),'solo',options),{code:'commander_seed_unsupported'});assert.equal(await progress.read(),undefined);assert.deepEqual(snapshot,before);await store.close();
});
