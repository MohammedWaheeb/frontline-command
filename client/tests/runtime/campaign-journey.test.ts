import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {MatchResultSchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {CampaignJourney,FirstRunJourney,campaignOverview} from '../../src/runtime/campaign-journey';
import {CampaignProgressStore,type MissionCompletion} from '../../src/runtime/progress';
import {LocalStore} from '../../src/runtime/storage';
import type {SessionInfo} from '../../src/runtime/types';
import {contentFixture,encode} from './content-library-fixture';
const metadata={simulation:'test',protocol:1,content_hash:'fixture',map_version:'1',ruleset:'scenario-v2',seed:7};
function snapshot(){return create(PlayerSnapshotSchema,{tick:100,player:1,metadata:{simulation:'test',protocol:1,contentHash:'fixture',mapVersion:'1',ruleset:'scenario-v2',seed:9007199254740997n},players:[{id:1,team:1,faction:'US'},{id:2,team:2,faction:'IR'}],outcome:{finished:true,draw:false,reason:'mission_complete',winningTeam:1,tick:100},mission:{id:'us-one',version:'1',difficulty:'easy',objectives:[{id:'required',complete:true},{id:'optional',optional:true,complete:true},{id:'failure',failure:true,complete:false},{id:'incomplete-optional',optional:true}]}})}
function runtime(view=snapshot()){
 const info:SessionInfo={adapter:'test',metadata,tick:100,local_players:[1],finished:true,replay:false,replay_start:0,replay_end:0};
 return {mode:'offline' as const,current:view,info:async()=>info,hash:async()=>'a'.repeat(64)};
}
test('campaign order unlocks on any difficulty and keeps version-specific medals separate',async()=>{
 const f=await contentFixture();f.index.missions.push({...f.index.missions[0],id:'us-two',order:2,title:'Open Corridor',url:'/content/missions/us-two.json'},{...f.index.missions[0],id:'tutorial-five',mode:'tutorial',order:5,title:'Command a match',url:'/content/missions/tutorial-five.json'});f.library.useIndex(encode(f.index));const store=new LocalStore('journey-order'),progress=new CampaignProgressStore(store),journey=new CampaignJourney(f.library,progress);
 let overview=await journey.overview();assert.equal(overview.campaigns[0].missions[0].availability,'available');assert.equal(overview.campaigns[0].missions[1].availability,'locked');assert.equal(overview.campaigns[0].missions[2].availability,'missing');assert.equal(overview.tutorials[4].availability,'available');assert.equal(overview.tutorials[0].availability,'missing');
 await assert.rejects(journey.prepareSolo('us-two','hard',7),{code:'mission_locked'});assert.equal(f.calls.length,0);
 const completion:MissionCompletion={result_id:'old-completion',mission:'us-one',mission_version:'older-version',difficulty:'easy',completed_at:1,tick:100,optional_objectives:[],metadata:{ruleset:'scenario-v2'}};await progress.record(completion,'live-solo');overview=await journey.overview();assert.equal(overview.campaigns[0].missions[1].availability,'available');assert.equal(overview.campaigns[0].missions[0].completed_current_version.length,0);assert.equal(overview.campaigns[0].missions[0].completed.length,1);
 const loaded=await journey.prepareSolo('us-one','hard',123);assert.equal(loaded.config.difficulty,'hard');assert.equal(loaded.config.seed,123);assert.equal(loaded.config.ruleset,'scenario-v2');assert.equal(loaded.content.packs[0].id,'base');await store.close();
});
test('missing story predecessor remains locked while prior completed missions can be replayed',async()=>{
 const f=await contentFixture();f.index.missions=[{...f.index.missions[0],order:3,id:'us-three'}];let overview=campaignOverview(f.index);assert.equal(overview.campaigns[0].missions[2].reason,'previous_content_missing');
 overview=campaignOverview(f.index,{version:1,results:['win'],missions:{'us-three:1:normal':{mission:'us-three',mission_version:'1',difficulty:'normal',completions:1,first_completed:1,last_completed:1,best_tick:1,optional_objectives:[]}}});assert.equal(overview.campaigns[0].missions[2].availability,'available');
});
test('live solo victory records authoritative mission version and completed optional objectives exactly once',async()=>{
 const f=await contentFixture();f.index.missions[0].version='new-installed-version';f.library.useIndex(encode(f.index));const store=new LocalStore('journey-solo'),progress=new CampaignProgressStore(store),journey=new CampaignJourney(f.library,progress),engine=runtime();
 const result=await journey.recordSolo(engine,'solo',{isCurrent:()=>true,completedAt:10});assert.equal(result.recorded,true);await journey.recordSolo(engine,'solo',{isCurrent:()=>true,completedAt:20});const record=await progress.read();assert.equal(record?.revision,1);assert.equal(record?.data.missions['us-one:1:easy'].completions,1);assert.deepEqual(record?.data.missions['us-one:1:easy'].optional_objectives,['optional']);assert.equal(record?.data.missions['us-one:new-installed-version:easy'],undefined);assert.equal(JSON.stringify(record).includes('9007199254740997'),false);await store.close();
});
test('replay, practice, unfinished, defeat and changing sessions never award progression',async()=>{
 const f=await contentFixture(),store=new LocalStore('journey-denied'),progress=new CampaignProgressStore(store),journey=new CampaignJourney(f.library,progress);
 for(const kind of ['replay','practice'] as const){assert.equal((await journey.recordSolo(runtime(),kind,{isCurrent:()=>true})).recorded,false)}
 const replay=runtime();(await replay.info()).replay=true;assert.equal((await journey.recordSolo(replay,'solo',{isCurrent:()=>true})).reason,'ineligible_source');
 const practice=runtime();(await practice.info()).metadata={...metadata,ruleset:'practice-v1'};assert.equal((await journey.recordSolo(practice,'solo',{isCurrent:()=>true})).reason,'ineligible_source');
 const pending=runtime();pending.current.outcome!.finished=false;assert.equal((await journey.recordSolo(pending,'solo',{isCurrent:()=>true})).reason,'unfinished');
 const defeat=runtime();defeat.current.outcome!.winningTeam=2;assert.equal((await journey.recordSolo(defeat,'solo',{isCurrent:()=>true})).reason,'not_a_victory');
 let valid=true;const changing=runtime();changing.hash=async()=>{valid=false;return 'a'.repeat(64)};await assert.rejects(journey.recordSolo(changing,'solo',{isCurrent:()=>valid}),{code:'session_changed'});assert.equal(await progress.read(),undefined);await store.close();
});
test('online completion requires committed matching commander result, excludes observers and remains host-scoped',async()=>{
 const f=await contentFixture(),store=new LocalStore('journey-online'),progress=new CampaignProgressStore(store),journey=new CampaignJourney(f.library,progress),view=snapshot();
 const input={baseURL:'http://host-one:8080',connection:{match_id:'match-one',player:1,protocol:1,simulation:'test',content_hash:'fixture'},snapshot:view,result:create(MatchResultSchema,{matchId:'match-one',committed:true,outcome:view.outcome}),kind:'online' as const};
 assert.equal((await journey.recordServer({...input,kind:'observer'},{isCurrent:()=>true})).recorded,false);assert.equal((await journey.recordServer({...input,result:create(MatchResultSchema,{...input.result,committed:false})},{isCurrent:()=>true})).reason,'result_pending');assert.equal((await journey.recordServer({...input,result:create(MatchResultSchema,{...input.result,void:true})},{isCurrent:()=>true})).recorded,false);
 await assert.rejects(journey.recordServer({...input,connection:{...input.connection,player:2}},{isCurrent:()=>true}),{code:'progress_result_mismatch'});await assert.rejects(journey.recordServer({...input,result:create(MatchResultSchema,{...input.result,matchId:'other'})},{isCurrent:()=>true}),{code:'progress_result_mismatch'});
 await journey.recordServer(input,{isCurrent:()=>true,completedAt:10});await journey.recordServer(input,{isCurrent:()=>true,completedAt:20});assert.equal((await progress.read())?.revision,1);await journey.recordServer({...input,baseURL:'http://host-two:8080'},{isCurrent:()=>true,completedAt:30});assert.equal((await progress.read())?.data.missions['us-one:1:easy'].completions,2);await store.close();
});
test('first run requires explicit settings, preserves conflicting choices and returns a launch intent only',async()=>{
 const f=await contentFixture(),store=new LocalStore('first-run-journey'),journey=new FirstRunJourney(store,{languages:['en','ar'],scales:[1,1.25,1.5]});assert.deepEqual(await journey.read(),{required:true,sound:'undecided',record:undefined});
 await assert.rejects(journey.complete({language:'unsupported',ui_scale:1,sound:'disabled',destination:'modes'},0),{code:'onboarding_invalid'});assert.equal((await journey.read()).required,true);
 const saved=await journey.complete({language:'ar',ui_scale:1.25,sound:'disabled',destination:'tutorial'},0,1);assert.equal(saved.revision,1);assert.equal((await journey.read()).sound,'disabled');assert.deepEqual(journey.intent(saved.data,f.index),{kind:'tutorial-unavailable'});
 await assert.rejects(journey.complete({language:'en',ui_scale:1,sound:'enabled',destination:'modes'},0,2),{code:'settings_conflict'});assert.equal((await journey.read()).record?.data.language,'ar');
 f.index.missions.push({...f.index.missions[0],id:'tutorial-one',mode:'tutorial',order:1});assert.deepEqual(journey.intent(saved.data,f.index),{kind:'start-tutorial',mission:'tutorial-one'});assert.deepEqual(journey.intent({...saved.data,destination:'modes'},f.index),{kind:'explore-modes'});await store.close();
});
test('future first-run settings remain untouched and do not silently enable sound',async()=>{
 const store=new LocalStore('first-run-future'),journey=new FirstRunJourney(store,{languages:['en'],scales:[1]});await store.putSetting('first-run',{version:2,sound:'enabled'});await assert.rejects(journey.read(),{code:'onboarding_incompatible'});assert.equal((await store.setting('first-run'))?.revision,1);await store.close();
});
