import {RuntimeError} from './errors';
import {sha256Hex} from './crypto';
import {ContentLibrary,soloMissionConfig,type ContentIndex,type LibraryMission,type LoadedMission} from './content-library';
import {CampaignProgressStore,type CampaignProgress,type MissionCompletion,type MissionProgress} from './progress';
import type {LocalSetting,LocalStore} from './storage';
import type {OfflineTransport} from './offline';
import type {MatchConnection} from './online';
import type {Difficulty,Faction,MatchResult,PlayerSnapshot} from './types';

export const CAMPAIGN_STORIES:ReadonlyArray<{faction:Faction;title:string;missions:readonly string[]}>=Object.freeze([
 {faction:'US',title:'Operation Clear Horizon',missions:Object.freeze(['First Foothold','Open Corridor','Relay Ridge','Broken Umbrella','Split Front','Clear Horizon'])},
 {faction:'IR',title:'Operation Iron Signal',missions:Object.freeze(['Forward Signal','Eyes Above','Beyond the Basin','Hold the Network','The Second Volley','Iron Signal'])},
 {faction:'SY',title:'Operation Open Road',missions:Object.freeze(['Workshop Foothold','Supply Trail','Three Crossings','Open Doors','Relay Break','Open Road'])},
 {faction:'SA',title:'Operation Shieldline',missions:Object.freeze(['Arrival Point','Moving Shield','Distant Depots','Intercept Window','Three Positions','Shieldline'])},
].map(value=>Object.freeze(value)) as Array<{faction:Faction;title:string;missions:readonly string[]}>);
export const TUTORIAL_LESSONS=Object.freeze(['Give an order','Operate a base','Read the counter','Defend the sky','Command a match']);
export const COOP_SCENARIOS=Object.freeze(['Convoy Union','Twin Outposts']);
export const MISSION_DIFFICULTIES:readonly Difficulty[]=Object.freeze(['easy','normal','hard']);
export interface JourneyMission {entry?:LibraryMission;mode:'tutorial'|'campaign'|'coop';faction?:Faction;order:number;title:string;availability:'available'|'locked'|'missing';reason?:'content_missing'|'previous_mission'|'previous_content_missing';previous?:string;completed:MissionProgress[];completed_current_version:Difficulty[]}
export interface CampaignOverview {tutorials:JourneyMission[];campaigns:Array<{faction:Faction;title:string;missions:JourneyMission[]}>;coop:JourneyMission[]}
const done=(entry:LibraryMission|undefined,progress:CampaignProgress|undefined):MissionProgress[]=>entry?Object.values(progress?.missions??{}).filter(value=>value.mission===entry.id&&value.completions>0):[];
/** Unlocking is a local story menu decision. It never changes combat or ranked access. */
export function campaignOverview(index:ContentIndex,progress?:CampaignProgress):CampaignOverview{
 const slot=(mode:LibraryMission['mode'],order:number,title:string,faction?:Faction):JourneyMission=>{
  const entry=index.missions.find(value=>value.mode===mode&&value.order===order&&(mode!=='campaign'||value.faction===faction));
  if(!entry)return {mode,faction,order,title,availability:'missing',reason:'content_missing',completed:[],completed_current_version:[]};
  const completed=done(entry,progress),current=MISSION_DIFFICULTIES.filter(difficulty=>completed.some(value=>value.mission_version===entry.version&&value.difficulty===difficulty));
  const result:JourneyMission={entry:structuredClone(entry),mode,faction,order,title:entry.title,availability:'available',completed:structuredClone(completed),completed_current_version:current};
  if(mode==='campaign'&&order>1&&!completed.length){const previous=index.missions.find(value=>value.mode===mode&&value.faction===faction&&value.order===order-1);if(!done(previous,progress).length){result.availability='locked';result.reason=previous?'previous_mission':'previous_content_missing';result.previous=previous?.id}}
  return result;
 };
 return {tutorials:TUTORIAL_LESSONS.map((title,index)=>slot('tutorial',index+1,title)),campaigns:CAMPAIGN_STORIES.map(story=>({faction:story.faction,title:story.title,missions:story.missions.map((title,index)=>slot('campaign',index+1,title,story.faction))})),coop:COOP_SCENARIOS.map((title,index)=>slot('coop',index+1,title))};
}
export interface JourneyCompletionResult {recorded:boolean;reason?:'ineligible_source'|'unfinished'|'not_a_victory'|'result_pending';result_id?:string}
export interface CompletionOptions {isCurrent:()=>boolean;completedAt?:number}
export type SoloCompletionRuntime=Pick<OfflineTransport,'mode'|'current'|'info'|'hash'>;
function current(options:CompletionOptions){if(!options.isCurrent())throw new RuntimeError('session_changed','The active game changed before its completion could be recorded.')}
function finalVictory(snapshot:PlayerSnapshot|undefined):JourneyCompletionResult['reason']|undefined{
 if(!snapshot?.outcome?.finished)return 'unfinished';const participant=snapshot.players.find(player=>player.id===snapshot.player);
 if(!snapshot.mission||snapshot.metadata?.ruleset!=='scenario-v2')return 'ineligible_source';
 if(snapshot.outcome.draw||snapshot.outcome.reason!=='mission_complete'||!participant||participant.team!==snapshot.outcome.winningTeam)return 'not_a_victory';
 return undefined;
}
function completion(index:ContentIndex,snapshot:PlayerSnapshot,resultID:string,completedAt:number):MissionCompletion{
 const mission=snapshot.mission!,entry=index.missions.find(entry=>entry.id===mission.id);
 if(!entry)throw new RuntimeError('content_missing','This completed mission is not in the installed content index. Preserve its save and retry with matching content.');
 if(!mission.version||!MISSION_DIFFICULTIES.includes(mission.difficulty as Difficulty)||!Number.isSafeInteger(snapshot.tick)||snapshot.tick<0||snapshot.outcome?.tick!==snapshot.tick||!Number.isSafeInteger(completedAt)||completedAt<0)throw new RuntimeError('progress_result_invalid','The authoritative mission completion metadata is incomplete.');
 const metadata=snapshot.metadata!;
 return {result_id:resultID,mission:mission.id,mission_version:mission.version,difficulty:mission.difficulty as Difficulty,completed_at:completedAt,tick:snapshot.tick,optional_objectives:mission.objectives.filter(objective=>objective.optional&&!objective.failure&&objective.complete).map(objective=>objective.id),metadata:{ruleset:metadata.ruleset}};
}

export class CampaignJourney{
 constructor(readonly library:ContentLibrary,readonly progress:CampaignProgressStore){}
 async overview(){const index=this.library.index;if(!index)throw new RuntimeError('content_index_missing','Load the installed content index first.');return campaignOverview(index,(await this.progress.read())?.data)}
 async prepareSolo(id:string,difficulty:Difficulty,seed:number,signal?:AbortSignal):Promise<{content:LoadedMission;config:ReturnType<typeof soloMissionConfig>}>{
  const view=await this.overview(),selected=[...view.tutorials,...view.campaigns.flatMap(campaign=>campaign.missions),...view.coop].find(value=>value.entry?.id===id);
  if(!selected)throw new RuntimeError('content_missing','This mission is not installed.');if(selected.availability!=='available')throw new RuntimeError('mission_locked','Complete the previous mission on any difficulty to continue this story.');
  if(selected.mode==='coop')throw new RuntimeError('coop_lobby_required','Choose commanders through the co-op lobby.');
  const loaded=await this.library.loadMission(id,signal);if(JSON.stringify(loaded.entry)!==JSON.stringify(selected.entry))throw new RuntimeError('content_superseded','The selected mission changed while loading. Review the updated campaign list.');return {content:loaded,config:soloMissionConfig(loaded,difficulty,seed)};
 }
 /** Call only for the active solo session. Go info and final state hash prevent replay awards and duplicate debriefs. */
 async recordSolo(runtime:SoloCompletionRuntime,kind:'solo'|'practice'|'replay',options:CompletionOptions):Promise<JourneyCompletionResult>{
  current(options);if(kind!=='solo'||runtime.mode!=='offline')return {recorded:false,reason:'ineligible_source'};
  const info=await runtime.info();current(options);if(info.replay||info.metadata?.ruleset!=='scenario-v2')return {recorded:false,reason:'ineligible_source'};
  const snapshot=runtime.current?structuredClone(runtime.current):undefined,reason=finalVictory(snapshot);if(reason)return {recorded:false,reason};
  if(!info.finished||info.tick!==snapshot!.tick||!info.local_players.includes(snapshot!.player))return {recorded:false,reason:'unfinished'};
  const hash=await runtime.hash();current(options);if(!/^[a-f0-9]{64}$/.test(hash)||runtime.current?.tick!==snapshot!.tick||runtime.current?.mission?.id!==snapshot!.mission!.id||runtime.current?.mission?.version!==snapshot!.mission!.version)throw new RuntimeError('session_changed','The mission changed before its final result was recorded.');
  const index=this.library.index;if(!index)throw new RuntimeError('content_index_missing','Load the content index before recording this mission.');const value=completion(index,snapshot!,`solo-${hash}`,options.completedAt??Date.now());current(options);await this.progress.record(value,'live-solo');return {recorded:true,result_id:value.result_id};
 }
 /** A committed result must match the active authenticated slot and its final snapshot. Observer/replay callers have no eligible connection. */
 async recordServer(input:{baseURL:string;connection:Pick<MatchConnection,'match_id'|'player'|'protocol'|'simulation'|'content_hash'>;snapshot:PlayerSnapshot;result:MatchResult;kind:'online'|'replay'|'observer'|'practice'},options:CompletionOptions):Promise<JourneyCompletionResult>{
  current(options);if(input.kind!=='online')return {recorded:false,reason:'ineligible_source'};const snapshot=structuredClone(input.snapshot),result=structuredClone(input.result),connection={...input.connection};
  if(result.void)return {recorded:false,reason:'ineligible_source'};if(!result.committed)return {recorded:false,reason:'result_pending'};const reason=finalVictory(snapshot);if(reason)return {recorded:false,reason};
  const outcome=snapshot.outcome!,metadata=snapshot.metadata!;
  if(result.matchId!==connection.match_id||snapshot.player!==connection.player||metadata.protocol!==connection.protocol||metadata.simulation!==connection.simulation||metadata.contentHash!==connection.content_hash||result.outcome?.finished!==true||result.outcome.tick!==outcome.tick||result.outcome.reason!==outcome.reason||result.outcome.winningTeam!==outcome.winningTeam||result.outcome.draw!==outcome.draw)throw new RuntimeError('progress_result_mismatch','The committed result does not match this commander and final mission snapshot.');
  const origin=new URL(input.baseURL);if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw new RuntimeError('content_origin','Choose the actual local match host.');
  const resultID='server-'+await sha256Hex(new TextEncoder().encode(`${origin.origin}\n${connection.match_id}`));current(options);const index=this.library.index;if(!index)throw new RuntimeError('content_index_missing','Load the content index before recording this mission.');const value=completion(index,snapshot,resultID,options.completedAt??Date.now());await this.progress.record(value,'live-server');return {recorded:true,result_id:value.result_id};
 }
}

export interface FirstRunChoices {language:string;ui_scale:number;sound:'enabled'|'disabled';destination:'tutorial'|'modes'}
export interface FirstRunRecord extends FirstRunChoices {version:1;completed_at:number}
export interface FirstRunOptions {languages:readonly string[];scales:readonly number[]}
export type FirstRunIntent={kind:'explore-modes'}|{kind:'start-tutorial';mission:string}|{kind:'tutorial-unavailable'};
/** Persists explicit choices only. Audio activation and session launching remain UI responsibilities. */
export class FirstRunJourney{
 private readonly options:FirstRunOptions;
 constructor(private readonly store:Pick<LocalStore,'setting'|'putSetting'>,options:FirstRunOptions,readonly id='first-run'){
  if(!options.languages.length||options.languages.length>64||options.languages.some(value=>!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value))||new Set(options.languages).size!==options.languages.length||!options.scales.length||options.scales.length>32||options.scales.some(value=>!Number.isFinite(value)||value<=0)||new Set(options.scales).size!==options.scales.length)throw new RuntimeError('onboarding_options','Provide the actual supported languages and interface scales.');this.options=structuredClone(options);
 }
 private check(value:unknown):asserts value is FirstRunRecord{
  const v=value as FirstRunRecord;if(!v||typeof v!=='object'||Array.isArray(v)||v.version!==1)throw new RuntimeError('onboarding_incompatible','Keep these first-run settings for the matching game version.');
  if(Object.keys(v).some(key=>!['version','completed_at','language','ui_scale','sound','destination'].includes(key))||!this.options.languages.includes(v.language)||!this.options.scales.includes(v.ui_scale)||!['enabled','disabled'].includes(v.sound)||!['tutorial','modes'].includes(v.destination)||!Number.isSafeInteger(v.completed_at)||v.completed_at<0)throw new RuntimeError('onboarding_invalid','Choose a supported language, interface scale, sound preference and starting mode. Existing settings are preserved.');
 }
 async read():Promise<{required:boolean;sound:'undecided'|'enabled'|'disabled';record?:LocalSetting<FirstRunRecord>}>{const record=await this.store.setting<FirstRunRecord>(this.id);if(record)this.check(record.data);return {required:!record,sound:record?.data.sound??'undecided',record}}
 async complete(choices:FirstRunChoices,expectedRevision:number,completedAt=Date.now()){const value:FirstRunRecord={...structuredClone(choices),version:1,completed_at:completedAt};this.check(value);return this.store.putSetting(this.id,value,expectedRevision)}
 intent(record:FirstRunRecord,index:ContentIndex):FirstRunIntent{this.check(record);if(record.destination==='modes')return {kind:'explore-modes'};const mission=index.missions.find(value=>value.mode==='tutorial'&&value.order===1);return mission?{kind:'start-tutorial',mission:mission.id}:{kind:'tutorial-unavailable'}}
}
