import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {decodeContentIndex,soloMissionConfig,type LoadedMission} from '../../src/runtime/content-library';
import {commanderOverview,type CommanderProgress,type CommanderChallenge} from '../../src/runtime/commander-progress';
import type {CampaignProgress} from '../../src/runtime/progress';
import type {GameMap,Difficulty} from '../../src/runtime/types';
import {prepareCommanderChallenge,type CommanderChallengeFocus} from '../../src/app/commander-challenges';
import {ChallengeCards,CommanderProgressView,TrainingFocus,CommanderPendingRecords,CommanderResultCue} from '../../src/ui/CommanderProgress';
import {BackupDetails} from '../../src/ui/BackupPanel';
import {Observable} from '../../src/app/store';
import type {Application,ApplicationState} from '../../src/app/application';
import {DEFAULT_SETTINGS} from '../../src/app/settings';

const fixture=resolve('tests/runtime/fixtures/commander');
const index=decodeContentIndex(new Uint8Array(readFileSync(resolve(fixture,'index.json'))));
const entries=index.missions.filter(entry=>entry.mode==='campaign');
/** The boundary mock stands in for an already validated ContentLibrary result.
 * These tests check challenge preparation/UI, not Go terrain validation. */
function loaded(id=entries[0].id):LoadedMission{
 const entry=structuredClone(entries.find(value=>value.id===id)!);
 const missionSource=new Uint8Array(readFileSync(resolve(fixture,`${entry.id}.json`)));
 assert.equal(missionSource.length,entry.bytes);assert.equal(createHash('sha256').update(missionSource).digest('hex'),entry.sha256);
 const mission=JSON.parse(new TextDecoder().decode(missionSource));
 const map:GameMap={id:entry.map_id,version:'1',title:'Validated-map boundary fixture',author:'test',format_version:1,ruleset:'scenario-v2',width:2,height:2,tiles:Array.from({length:4},()=>({terrain:'open'})),spawns:[],shipment:{x:0,y:0},fields:[],required_packs:['base']};
 return {entry,map,mission,missionSource,mapSource:new Uint8Array(),packs:structuredClone(index.packs)};
}
function story(withOptional=false):CampaignProgress{
 return {version:1,results:entries.map((_,order)=>`earned-${order}`),missions:Object.fromEntries(entries.map(entry=>{
  const goal=(loaded(entry.id).mission.objectives as Array<{id:string;optional:boolean;failure:boolean}>).find(value=>value.optional&&!value.failure)!;
  return [`${entry.id}:${entry.version}:normal`,{mission:entry.id,mission_version:entry.version,difficulty:'normal',completions:1,first_completed:1,last_completed:1,best_tick:200,optional_objectives:withOptional?[goal.id]:[]}];
 }))};
}
const emptyMastery:CommanderProgress={version:1,results:[]};

test('all 24 installed exercise goals prepare on each difficulty without changing scenario rules or source data',async()=>{
 const progress=story(),overview=commanderOverview(index,progress,emptyMastery),before=JSON.stringify({index,progress});
 assert.equal(overview.challenges.length,24);
 for(const challenge of overview.challenges)for(const difficulty of ['easy','normal','hard'] as const){
  const content=loaded(challenge.mission),config=soloMissionConfig(content,difficulty,17),original=structuredClone(config);
  const prepared=await prepareCommanderChallenge({prepareSolo:async(id,level,seed)=>{assert.equal(id,challenge.mission);assert.equal(level,difficulty);assert.equal(seed,17);return {content,config}}},overview,challenge.id,difficulty,17);
  assert.equal(prepared.config,config);assert.deepEqual(prepared.config,original);assert.equal(config.ruleset,'scenario-v2');assert.equal(config.players,undefined);assert.equal(config.skip_countdown,undefined);
  assert.equal(prepared.challenge.mission,content.entry.id);assert.equal(prepared.challenge.version,content.entry.version);assert.equal(prepared.challenge.mapId,content.map.id);
  const goal=(content.mission.objectives as Array<{id:string;text:string;optional:boolean;failure:boolean}>).find(value=>value.id===prepared.challenge.objectiveID)!;
  assert.ok(goal.optional&&!goal.failure);assert.equal(prepared.challenge.goal,goal.text);
 }
 assert.equal(JSON.stringify({index,progress}),before);
});

test('missing and locked exercises reject before starting content preparation',async()=>{
 const overview=commanderOverview(index),challenge=overview.challenges[0];let prepared=0;
 const campaign={prepareSolo:async()=>{prepared++;return {content:loaded(),config:soloMissionConfig(loaded(),'normal',1)}}};
 await assert.rejects(prepareCommanderChallenge(campaign,overview,'absent','normal',1),{code:'challenge_missing'});
 await assert.rejects(prepareCommanderChallenge(campaign,overview,challenge.id,'normal',1),{code:'challenge_locked'});
 assert.equal(prepared,0);
});

test('changed mission identity or version cannot attach stale exercise goals',async()=>{
 const overview=commanderOverview(index,story()),challenge=overview.challenges[0],content=loaded();content.entry.version='future';
 await assert.rejects(prepareCommanderChallenge({prepareSolo:async()=>({content,config:soloMissionConfig(content,'normal',1)})},overview,challenge.id,'normal',1),{code:'content_superseded'});
});

test('story badges and optional exercise awards use existing v1 records and render honest local mastery',()=>{
 const progress=story(true),before=JSON.stringify(progress),overview=commanderOverview(index,progress,emptyMastery);
 assert.equal(overview.challenges.filter(value=>value.complete).length,24);
 const markup=renderToStaticMarkup(createElement(CommanderProgressView,{overview,faction:'SA',difficulty:'hard',onFaction:()=>{},onDifficulty:()=>{},onChallenge:()=>{}}));
 assert.ok(markup.includes('All factions and combat options are available from the start.'));
 assert.ok(markup.includes('These records grant no combat bonuses.'));assert.ok(markup.includes('6 / 6'));
 assert.ok(markup.includes('include initial and allied sight'));assert.ok(markup.includes('including utility')||markup.includes('include utility'));
 assert.ok(markup.includes('rather than confirmed hits'));assert.ok(markup.includes('aria-pressed="true"'));
 assert.equal((markup.match(/Attempt again/g)??[]).length,6);assert.equal(JSON.stringify(progress),before);
});

test('locked challenge cards expose disabled attempt buttons and clear campaign unlock text',()=>{
 const challenges=commanderOverview(index).challenges.filter(value=>value.faction==='US');
 const markup=renderToStaticMarkup(createElement(ChallengeCards,{challenges,difficulty:'normal',onChallenge:()=>{throw Error('Render cannot launch')}}));
 assert.equal((markup.match(/disabled=""/g)??[]).length,6);assert.ok(markup.includes('Complete this campaign operation to unlock its exercise.'));
 assert.equal(markup.includes('Complete us-'),false);
});

function focus():CommanderChallengeFocus{
 const goal=commanderOverview(index,story()).challenges[0];return {id:goal.id,mission:goal.mission,version:goal.missionVersion,mapId:entries[0].map_id,objectiveID:goal.objectiveID!,title:goal.title,goal:goal.description};
}
function snapshot(goal=focus()){
 return create(PlayerSnapshotSchema,{player:1,tick:20,players:[{id:1,team:1,faction:'US'}],outcome:{finished:true,winningTeam:1,reason:'mission_complete',tick:20},mission:{id:goal.mission,version:goal.version,objectives:[{id:goal.objectiveID,optional:true,complete:true}]}});
}
test('active exercise success requires the exact optional goal and a team mission victory',()=>{
 const goal=focus(),view=snapshot(goal),render=(value= view)=>renderToStaticMarkup(createElement(TrainingFocus,{focus:goal,snapshot:value}));
 assert.ok(render().includes('Exercise objective achieved.'));
 for(const change of [(v:typeof view)=>{v.outcome!.winningTeam=2},(v:typeof view)=>{v.outcome!.draw=true},(v:typeof view)=>{v.outcome!.reason='mission_failed'},(v:typeof view)=>{v.mission!.objectives[0].complete=false},(v:typeof view)=>{v.mission!.objectives[0].failure=true}]){
  const changed=structuredClone(view);change(changed);assert.equal(render(changed).includes('Exercise objective achieved.'),false);assert.ok(render(changed).includes('Exercise objective not achieved.'));
 }
 const running=structuredClone(view);running.outcome!.finished=false;assert.ok(render(running).includes('Win this operation with the optional exercise objective.'));
 const stale=structuredClone(view);stale.mission!.version='future';assert.equal(render(stale),'');
 const noMission=structuredClone(view);noMission.mission=undefined;assert.equal(render(noMission),'');
 const other=structuredClone(view);other.mission!.id='other';assert.equal(render(other),'');
});

test('exercise briefing escapes public goal text and backup review identifies mastery without counting malformed data',()=>{
 const goal={...focus(),title:'Exercise <script>alert(1)</script>',goal:'Preserve <marked> forces & win.'};
 const markup=renderToStaticMarkup(createElement(TrainingFocus,{focus:goal}));assert.equal(markup.includes('<script>'),false);assert.ok(markup.includes('&lt;marked&gt;'));assert.ok(markup.includes('&amp; win.'));
 const ledger:CommanderProgress={version:1,results:[{result_id:`solo-${'a'.repeat(64)}-1`,source:'solo',faction:'US',completed_at:1,tick:1,tilesSurveyed:10,unitsAtEnd:2,structuresAtEnd:1,interceptorShots:0,objectivesCompleted:1,stationControlTicks:0}]};
 const record={id:'commander',revision:1,updated:1,data:ledger};
 const backup=renderToStaticMarkup(createElement(BackupDetails,{record}));assert.ok(backup.includes('Faction mastery'));assert.ok(backup.includes('1 completed operations'));assert.ok(backup.includes('duplicate results count once'));
 const damaged=renderToStaticMarkup(createElement(BackupDetails,{record:{...record,data:{version:2,results:ledger.results}}}));assert.equal(damaged.includes('completed operations'),false);
});

test('pending final records remain visible after menu return with explicit waiting and retry states',()=>{
 const initial:ApplicationState={booting:false,page:'command',firstRun:false,settings:structuredClone(DEFAULT_SETTINGS),paused:true,speed:1,session:{phase:'menu'}};
 const state=new Observable<ApplicationState>({...initial,commanderFinals:[{id:'first',faction:'US',phase:'awaiting'},{id:'second',faction:'IR',phase:'recording'},{id:'third',faction:'SA',phase:'failed',error:'Storage <blocked> & original preserved.'}]});
 const app={state} as unknown as Application,markup=renderToStaticMarkup(createElement(CommanderPendingRecords,{app}));
 assert.ok(markup.includes('aria-label="Pending command records"'));assert.ok(markup.includes('keep this browser open')||markup.includes('Keep this browser open'));
 assert.ok(markup.includes('signing in again cancels pending records'));assert.ok(markup.includes('Waiting for the host'));assert.ok(markup.includes('Saving command record'));
 assert.ok(markup.includes('role="alert"'));assert.ok(markup.includes('&lt;blocked&gt; &amp; original preserved.'));assert.equal((markup.match(/disabled=""/g)??[]).length,1);
 state.set({...initial,commanderFinals:[]});assert.equal(renderToStaticMarkup(createElement(CommanderPendingRecords,{app})), '');
 const final=snapshot();state.set({...initial,session:{phase:'active',kind:'online'},snapshot:final,commanderStatus:'awaiting'});
 const cue=renderToStaticMarkup(createElement(CommanderResultCue,{app}));assert.ok(cue.includes('You may return to the command center'));
 state.set({...state.get(),session:{phase:'active',kind:'replay'}});assert.equal(renderToStaticMarkup(createElement(CommanderResultCue,{app})), '');
});
