import {RuntimeError} from './errors';
import {sha256Hex} from './crypto';
import {decodeContentIndex,type ContentIndex,type LoadedMission} from './content-library';
import {CAMPAIGN_STORIES} from './campaign-journey';
import {validateCampaignProgress,type CampaignProgress} from './progress';
import type {LocalProgress,LocalStore} from './storage';
import type {OfflineTransport} from './offline';
import type {MatchConnection} from './online';
import type {Faction,MatchResult,PlayerSnapshot} from './types';

export const COMMANDER_PROGRESS_ID='commander';
export const COMMANDER_PROGRESS_LIMIT=512;
const MAX_BYTES=256*1024,UINT32_MAX=0xffffffff;
const FACTIONS:readonly Faction[]=['US','IR','SY','SA'];
/** Local final-result receipts. These counters never alter combat or ranked access. */
export interface CommanderFinalRecord {
 result_id:string;source:'solo'|'server';faction:Faction;completed_at:number;tick:number;
 tilesSurveyed:number;unitsAtEnd:number;structuresAtEnd:number;interceptorShots:number;
 objectivesCompleted:number;stationControlTicks:number;
}
export interface CommanderProgress {version:1;results:CommanderFinalRecord[]}
export interface CommanderBadge {id:string;faction:Faction;title:string;description:string;earned:boolean;mission?:string}
export interface CommanderChallenge {
 id:string;faction:Faction;mission:string;missionVersion:string;missionSHA256:string;title:string;
 description:string;objectiveID?:string;unlockAfter:string;unlocked:boolean;complete:boolean;completedObjectives:string[];
}
export interface CommanderFactionOverview {
 faction:Faction;matches:number;tilesSurveyed:number;unitsAtEnd:number;structuresAtEnd:number;
 interceptorShots:number;objectivesCompleted:number;stationControlTicks:number;
 campaignMissions:number;campaignTotal:6;badges:CommanderBadge[];challenges:CommanderChallenge[];
}
export interface CommanderOverview {factions:CommanderFactionOverview[];badges:CommanderBadge[];challenges:CommanderChallenge[]}
export interface CommanderRecordResult {recorded:boolean;reason?:'ineligible_source'|'unfinished'|'result_pending'|'duplicate';result_id?:string}
export interface CommanderRecordOptions {isCurrent:()=>boolean;completedAt?:number}
export type CommanderSoloRuntime=Pick<OfflineTransport,'mode'|'current'|'info'|'hash'>;
export interface CommanderServerInput {
 baseURL:string;connection:Pick<MatchConnection,'match_id'|'player'|'protocol'|'simulation'|'content_hash'>;
 snapshot:PlayerSnapshot;result:MatchResult;kind:'online'|'replay'|'observer'|'practice'|'editor';
}
const COUNTERS=['tilesSurveyed','unitsAtEnd','structuresAtEnd','interceptorShots','objectivesCompleted','stationControlTicks'] as const;
const RECORD_FIELDS=['result_id','source','faction','completed_at','tick',...COUNTERS];
const integer=(value:unknown,maximum=Number.MAX_SAFE_INTEGER):value is number=>Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=maximum;
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value);
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function invalid(message='This local mastery ledger is damaged. Export its original backup before recovery.'):never {throw new RuntimeError('commander_progress_invalid',message)}
export function validateCommanderProgress(value:unknown):asserts value is CommanderProgress {
 if(!object(value))invalid();
 if(value.version!==1){if(integer(value.version)&&value.version>1)throw new RuntimeError('commander_progress_incompatible','Keep this local mastery ledger for the matching game version.');invalid()}
 if(Object.keys(value).some(key=>!['version','results'].includes(key))||!Array.isArray(value.results)||value.results.length>COMMANDER_PROGRESS_LIMIT)invalid();
 let bytes:number;try{bytes=new TextEncoder().encode(JSON.stringify(value)).length}catch{invalid()}
 if(bytes>MAX_BYTES)invalid('Choose a local mastery ledger no larger than 256 KiB.');
 const seen=new Set<string>();
 for(const result of value.results){
  if(!object(result)||RECORD_FIELDS.some(key=>!Object.hasOwn(result,key))||Object.keys(result).some(key=>!RECORD_FIELDS.includes(key))||!FACTIONS.includes(result.faction as Faction)||!['solo','server'].includes(String(result.source))||typeof result.result_id!=='string'||!(result.source==='solo'?/^solo-[a-f0-9]{64}-[1-4]$/:/^server-[a-f0-9]{64}$/).test(result.result_id)||seen.has(result.result_id)||!integer(result.completed_at)||!integer(result.tick,UINT32_MAX)||COUNTERS.some(key=>!integer(result[key],key==='objectivesCompleted'?100:UINT32_MAX)))invalid();
  seen.add(result.result_id);
 }
}
function sameReceipt(a:CommanderFinalRecord,b:CommanderFinalRecord){return RECORD_FIELDS.filter(key=>key!=='completed_at').every(key=>a[key as keyof CommanderFinalRecord]===b[key as keyof CommanderFinalRecord])}
/** Restoring an older backup keeps every already-known result ID. No import awards a new duplicate. */
export function mergeCommanderProgress(prior:CommanderProgress|undefined,incoming:CommanderProgress):CommanderProgress {
 validateCommanderProgress(incoming);if(prior)validateCommanderProgress(prior);
 const results=structuredClone(prior?.results??[]),known=new Map(results.map(value=>[value.result_id,value]));
 for(const value of incoming.results){
  const existing=known.get(value.result_id);
  if(existing){if(!sameReceipt(existing,value))throw new RuntimeError('commander_result_conflict','The same final result has different mastery counters. Preserve both backups before recovery.');continue}
  if(results.length>=COMMANDER_PROGRESS_LIMIT)throw new RuntimeError('commander_progress_full','This local mastery ledger is full. Export its backup; existing result IDs are preserved.');
  const copy=structuredClone(value);results.push(copy);known.set(copy.result_id,copy);
 }
 const result:CommanderProgress={version:1,results};validateCommanderProgress(result);return result;
}
/** Exact optional goal text is used only for the content bytes from which it was read. */
const SHIPPED_GOALS:Readonly<Record<string,{sha256:string;objectiveID:string;text:string}>>={
 "us-01-first-foothold": {"sha256": "d30e2d649eed0f97ffe38408bbfe56a7e8fc121e05cb027b7ce6c96af5aaab75", "objectiveID": "engineering-rescue", "text": "Recover the intact engineering rig and keep it alive."},
 "us-02-open-corridor": {"sha256": "f43b20bda662ec5a4fd7d92f6c796a736063ae243b44f11ba29620a5fc9feea3", "objectiveID": "all-trucks", "text": "Preserve all three original convoy trucks."},
 "us-03-relay-ridge": {"sha256": "0bc37dbfef27d46be9c4807ceaf3214a174844e4fbd00b9273afd5303d77504d", "objectiveID": "scout-preserved", "text": "Finish without losing a scout."},
 "us-04-broken-umbrella": {"sha256": "148b3de09ba49e65c82a2a0154c3b5a08cc7b2bee20b36206cd80a2e1565280b", "objectiveID": "wing-evacuated", "text": "Evacuate both marked aircraft to the backup site, service each and repair battle damage on the wing."},
 "us-05-split-front": {"sha256": "3f77387393366560c0ca75e3c8c824dd575a429a7621f2009c537dc31367703a", "objectiveID": "no-transport-loss", "text": "Finish without losing any airlift transport."},
 "us-06-clear-horizon": {"sha256": "c7738a1594a9cb884f16a34b7e1fdb7d6c9d453f372b3380f82087f600800eb5", "objectiveID": "site-before-launch", "text": "Neutralize the strategic site before any launch from it."},
 "ir-01-forward-signal": {"sha256": "06d00d1c7f4b0fb2e9287be07decfcd42f6f4a0ca5e54ea0f8aabc69da384c03", "objectiveID": "recon-survives", "text": "Keep the original recon team alive."},
 "ir-02-eyes-above": {"sha256": "8716047c7c8e61c55c650a938643af3502791e47e945f0f88a2969c2d3a0a65d", "objectiveID": "recover-drones", "text": "Keep and fully service both starting drones."},
 "ir-03-beyond-the-basin": {"sha256": "6a09a54bd371c7c5e9b8fcccc07c9110f213f4a822abb6172a46c2f4b106fd4d", "objectiveID": "two-stations", "text": "Own both military supply stations at victory."},
 "ir-04-hold-the-network": {"sha256": "c5d5b28274e9a3194ebb94deeb530832917bb4a21148fc92070a6343412bf3de", "objectiveID": "no-emergency-loss", "text": "Finish without losing a drone or losing its service capacity."},
 "ir-05-the-second-volley": {"sha256": "cdfc62d7315e753b31cb75785a1cd64685334d7b2ab9fc1f5f3379ac972b41f0", "objectiveID": "missile-budget", "text": "Spend at most 1,200 credits on missiles."},
 "ir-06-iron-signal": {"sha256": "0cbf453dbf93d1ecee94a58749cf8aba1af1e8c2b853c0c1f4d42c9c917935bf", "objectiveID": "observer-network", "text": "Keep both original observers alive at the two forward observation sites."},
 "sy-01-workshop-foothold": {"sha256": "2e55068169ee4b872f003240140b38d4746d85cada4a4da9d9685a49747ecab5", "objectiveID": "mechanic-teams", "text": "Recover both separated mechanic teams and keep them alive."},
 "sy-02-supply-trail": {"sha256": "efce83a805d007384d8d3816d449433d4763051f8b35005a747959c5e5443ba8", "objectiveID": "limited-salvage", "text": "Collect at least 300 credits of salvage, from hostile vehicle wrecks."},
 "sy-03-three-crossings": {"sha256": "fc66fe40f86b8da35b75a5b1ba7c4b28d8bbcdf1db2d1b693c22a1943a03554c", "objectiveID": "scout-mark", "text": "Optional: keep the marked scout concealed for one uninterrupted minute."},
 "sy-04-open-doors": {"sha256": "bf1b9636f15f2682fd5a7071c97ceb362bae39904a43a89216ec32efcc4c6e8b", "objectiveID": "evacuation", "text": "Evacuate both marked squads to the rear safe region."},
 "sy-05-relay-break": {"sha256": "7222d9d6acdd59c26e8aa81374c2c970b3831b4f5cc0ee64fdaa2110c3b21f2f", "objectiveID": "factory-captured", "text": "Capture the marked factory and preserve it under your control."},
 "sy-06-open-road": {"sha256": "1909b29039b4166825fcfcab8c39ddbe0357036a0f605d02b57bd80e7dbff415", "objectiveID": "no-lost-raid", "text": "Finish without a canceled or blocked temporary-raid deployment."},
 "sa-01-arrival-point": {"sha256": "c1b00695c05bc9803aa44941e530f98d03a4c94514332e2dc88580296df0043b", "objectiveID": "apcs-preserved", "text": "Keep both original APCs alive."},
 "sa-02-moving-shield": {"sha256": "6839a82869874f7435120575342766e9fcf47eb1240d1a17e680e97aa779b8a9", "objectiveID": "repair-budget", "text": "Spend no more than 700 credits on repairs."},
 "sa-03-distant-depots": {"sha256": "a8dc6064b1d074f415fa183ce4caee25a26278d24dfa3934a36df36e68c773fd", "objectiveID": "stations-together", "text": "Hold both military stations simultaneously at victory."},
 "sa-04-intercept-window": {"sha256": "df597d748bf3e373ec9c0ba89f4910a56fff695efab53485f6c3d82a6ebb2898", "objectiveID": "clean-interception", "text": "Intercept a missile from the marked detachment without losing an original defended building."},
 "sa-05-three-positions": {"sha256": "86f8608db3b7a3525d3a2d393ef167bf8d3b4baafb18c762e36a22c8627014a0", "objectiveID": "service-preserved", "text": "Keep the original Service vehicle alive."},
 "sa-06-shieldline": {"sha256": "44d8d331c3472920288a4b1286109ccc891954be10ec87e8602a5e8245ab7aa2", "objectiveID": "connected-routes", "text": "Keep both permanent supply corridors controlled and maintain two supply centers."},
};
function missionRecords(progress:CampaignProgress|undefined,mission:string){return Object.values(progress?.missions??{}).filter(value=>value.mission===mission&&value.completions>0)}
export function commanderOverview(input:ContentIndex,campaign?:CampaignProgress,mastery?:CommanderProgress):CommanderOverview {
 const index=decodeContentIndex(new TextEncoder().encode(JSON.stringify(input)));if(campaign)validateCampaignProgress(campaign);if(mastery)validateCommanderProgress(mastery);
 const factions:CommanderFactionOverview[]=CAMPAIGN_STORIES.map(story=>{
  const entries=index.missions.filter(entry=>entry.mode==='campaign'&&entry.faction===story.faction).sort((a,b)=>a.order-b.order),records=(mastery?.results??[]).filter(result=>result.faction===story.faction);
  const totals={matches:records.length,tilesSurveyed:0,unitsAtEnd:0,structuresAtEnd:0,interceptorShots:0,objectivesCompleted:0,stationControlTicks:0};
  for(const result of records){totals.tilesSurveyed=Math.max(totals.tilesSurveyed,result.tilesSurveyed);for(const key of COUNTERS)if(key!=='tilesSurveyed')totals[key]+=result[key]}
  const completed=entries.filter(entry=>missionRecords(campaign,entry.id).length>0);
  const badges:CommanderBadge[]=entries.map(entry=>({id:`story-${entry.id}`,faction:story.faction,title:`${entry.title} — story record`,description:'Cosmetic record of completing this campaign mission on any difficulty.',earned:completed.some(value=>value.id===entry.id),mission:entry.id}));
  badges.push({id:`operation-${story.faction}`,faction:story.faction,title:story.title,description:'Cosmetic record of completing all six campaign milestones.',earned:completed.length===6&&entries.length===6});
  const masteryBadges:Array<[keyof typeof totals,string,string]>=[['tilesSurveyed','Surveyed ground','A final match recorded surveyed or allied shared tiles.'],['unitsAtEnd','Units preserved','A final match ended with owned surviving units, including utility and temporary units.'],['interceptorShots','Interception practice','A final match recorded an interception shot; this is not a success count.'],['objectivesCompleted','Team objectives','A final mission recorded a completed team objective.']];
  for(const [counter,title,description] of masteryBadges)badges.push({id:`mastery-${story.faction}-${counter}`,faction:story.faction,title,description,earned:totals[counter]>0});
  const challenges=entries.map(entry=>{
   const completions=missionRecords(campaign,entry.id),completedObjectives=[...new Set(completions.filter(value=>value.mission_version===entry.version).flatMap(value=>value.optional_objectives))].sort(),candidate=SHIPPED_GOALS[entry.id],goal=candidate?.sha256===entry.sha256?candidate:undefined;
   return {id:`challenge-${entry.id}`,faction:story.faction,mission:entry.id,missionVersion:entry.version,missionSHA256:entry.sha256,title:`${entry.title} — optional goal`,description:goal?.text??'Complete this mission and its optional objective using the ordinary scenario rules.',objectiveID:goal?.objectiveID,unlockAfter:entry.id,unlocked:completions.length>0,complete:!!goal&&completedObjectives.includes(goal.objectiveID),completedObjectives};
  });
  return {faction:story.faction,...totals,campaignMissions:completed.length,campaignTotal:6,badges,challenges};
 });
 return {factions,badges:factions.flatMap(value=>value.badges),challenges:factions.flatMap(value=>value.challenges)};
}
/** LoadedMission must come from ContentLibrary's verified bytes and Go mission validator. */
export function commanderChallengeGoal(challenge:CommanderChallenge,loaded:LoadedMission):CommanderChallenge {
 const entry=loaded.entry,mission=loaded.mission;
 if(entry.mode!=='campaign'||entry.id!==challenge.mission||entry.version!==challenge.missionVersion||entry.sha256!==challenge.missionSHA256||entry.faction!==challenge.faction||mission.id!==entry.id||mission.version!==entry.version||mission.mode!=='campaign'||mission.faction!==entry.faction)throw new RuntimeError('content_superseded','Reload this challenge from its matching installed mission.');
 if(!Array.isArray(mission.objectives))throw new RuntimeError('commander_challenge_invalid','The validated mission does not expose its objective definitions.');
 const goals=mission.objectives.filter(value=>object(value)&&value.optional===true&&value.failure===false) as Array<Record<string,unknown>>,goal=goals.find(value=>value.id===challenge.objectiveID)??goals[0];
 if(!goal||!id(goal.id)||typeof goal.text!=='string'||!goal.text.trim()||goal.text.length>1000||/[<>]/.test(goal.text)||Array.from(goal.text).some(value=>value.charCodeAt(0)<32))throw new RuntimeError('commander_challenge_invalid','This mission has no readable optional objective to use as a guided challenge.');
 return {...structuredClone(challenge),description:goal.text,objectiveID:goal.id,complete:challenge.completedObjectives.includes(goal.id)};
}
function current(options:CommanderRecordOptions){if(!options.isCurrent())throw new RuntimeError('session_changed','The active game changed before its mastery record was stored.')}
function liveRuleset(ruleset:unknown){return ruleset==='standard-v2'||ruleset==='scenario-v2'}
function finalReason(snapshot:PlayerSnapshot|undefined):CommanderRecordResult['reason']|undefined {
 if(!snapshot?.outcome?.finished)return 'unfinished';if(!liveRuleset(snapshot.metadata?.ruleset))return 'ineligible_source';
 if(!snapshot.debrief||snapshot.metadata?.ruleset==='scenario-v2'&&!snapshot.mission)return 'result_pending';
 return undefined;
}
function resultInvalid(message='The authoritative final match data is incomplete or inconsistent.'):never {throw new RuntimeError('commander_result_invalid',message)}
function finalFields(snapshot:PlayerSnapshot) {
 const metadata=snapshot.metadata,outcome=snapshot.outcome,participant=snapshot.players.filter(value=>value.id===snapshot.player),debrief=snapshot.debrief?.players.filter(value=>value.player===snapshot.player);
 if(!metadata||!outcome?.finished||!integer(snapshot.player,4)||snapshot.player<1||!integer(snapshot.tick,UINT32_MAX)||outcome.tick!==snapshot.tick||typeof outcome.draw!=='boolean'||!integer(outcome.winningTeam,UINT32_MAX)||!id(outcome.reason)||!integer(metadata.protocol,UINT32_MAX)||metadata.protocol<1||!id(metadata.simulation)||typeof metadata.contentHash!=='string'||!/^[a-f0-9]{64}$/.test(metadata.contentHash)||!id(metadata.mapVersion)||typeof metadata.seed!=='bigint'||metadata.seed<0n||metadata.seed>0xffffffffffffffffn||participant.length!==1||debrief?.length!==1)resultInvalid();
 const player=participant[0],stats=debrief![0],metrics=stats.metrics;
 if(!FACTIONS.includes(player.faction as Faction)||stats.faction!==player.faction||stats.team!==player.team||!integer(player.team,UINT32_MAX)||player.team<1||!metrics||metrics.player!==snapshot.player)resultInvalid();
 let objectivesCompleted=0;
 if(snapshot.mission){
  const mission=snapshot.mission;
  if(metadata.ruleset!=='scenario-v2'||!id(mission.id)||!id(mission.version)||!['easy','normal','hard'].includes(mission.difficulty)||!Array.isArray(mission.objectives)||mission.objectives.length>100||new Set(mission.objectives.map(value=>value.id)).size!==mission.objectives.length||mission.objectives.some(value=>!id(value.id)||typeof value.optional!=='boolean'||typeof value.failure!=='boolean'||typeof value.complete!=='boolean'))resultInvalid();
  // Mission objectives belong to the team; a capped debrief event list is not evidence.
  objectivesCompleted=mission.objectives.filter(value=>value.complete&&!value.failure).length;
 }
 const counters={tilesSurveyed:stats.exploredTiles,unitsAtEnd:stats.unitsSurviving,structuresAtEnd:stats.structuresSurviving,interceptorShots:metrics.interceptorsFired,objectivesCompleted,stationControlTicks:metrics.stationControlTicks};
 if(COUNTERS.some(key=>!integer(counters[key],UINT32_MAX)))resultInvalid();
 return {faction:player.faction as Faction,counters,signature:JSON.stringify({tick:snapshot.tick,player:snapshot.player,metadata:{...metadata,seed:String(metadata.seed)},outcome,participant:{faction:player.faction,team:player.team},counters,mission:snapshot.mission?{id:snapshot.mission.id,version:snapshot.mission.version,difficulty:snapshot.mission.difficulty,objectives:snapshot.mission.objectives.map(value=>({id:value.id,optional:value.optional,failure:value.failure,complete:value.complete}))}:undefined})};
}
/** New key: absent means empty v1. Existing campaign records are derived, never rewritten. */
export class CommanderProgressStore {
 constructor(private readonly store:Pick<LocalStore,'progress'|'putProgress'>,readonly id=COMMANDER_PROGRESS_ID){}
 async read():Promise<LocalProgress<CommanderProgress>|undefined>{
  const record=await this.store.progress<CommanderProgress>(this.id);
  if(record){if(record.schema_version!==1)throw new RuntimeError('commander_progress_incompatible','Keep this local mastery record for a matching game version.');validateCommanderProgress(record.data)}
  return record;
 }
 private async append(value:CommanderFinalRecord,options:CommanderRecordOptions):Promise<CommanderRecordResult>{
  validateCommanderProgress({version:1,results:[value]});
  for(let attempt=0;attempt<4;attempt++){
   current(options);const prior=await this.read();current(options);
   const duplicate=prior?.data.results.find(record=>record.result_id===value.result_id);
   if(duplicate){if(!sameReceipt(duplicate,value))throw new RuntimeError('commander_result_conflict','The same final result has different mastery counters. Preserve this local ledger before recovery.');return {recorded:false,reason:'duplicate',result_id:value.result_id}}
   const data=mergeCommanderProgress(prior?.data,{version:1,results:[value]});
   try{await this.store.putProgress(this.id,data,prior?.revision??0);return {recorded:true,result_id:value.result_id}}catch(error){if(!(error instanceof RuntimeError)||error.code!=='progress_conflict'||attempt===3)throw error}
  }
  throw new RuntimeError('progress_conflict','The local mastery ledger changed repeatedly. Retry recording this final match.');
 }
 async recordSolo(runtime:CommanderSoloRuntime,kind:'solo'|'practice'|'replay'|'editor'|'observer',options:CommanderRecordOptions):Promise<CommanderRecordResult>{
  current(options);if(kind!=='solo'||runtime.mode!=='offline')return {recorded:false,reason:'ineligible_source'};
  const info=await runtime.info();current(options);if(info.replay||!liveRuleset(info.metadata?.ruleset))return {recorded:false,reason:'ineligible_source'};
  const snapshot=runtime.current?structuredClone(runtime.current):undefined,reason=finalReason(snapshot);if(reason)return {recorded:false,reason};
  if(!info.finished||info.tick!==snapshot!.tick||!info.local_players.includes(snapshot!.player))return {recorded:false,reason:'unfinished'};
  const fields=finalFields(snapshot!),metadata=snapshot!.metadata!,actual=info.metadata!;
  if(!integer(actual.seed))throw new RuntimeError('commander_seed_unsupported','This save uses a seed beyond the exact range of the browser metadata bridge. Preserve the save; its local mastery cannot be recorded by this version.');
  if(actual.protocol!==metadata.protocol||actual.simulation!==metadata.simulation||actual.content_hash!==metadata.contentHash||actual.map_version!==metadata.mapVersion||actual.ruleset!==metadata.ruleset||BigInt(actual.seed)!==metadata.seed)resultInvalid('The Go session metadata does not match this final commander snapshot.');
  const hash=await runtime.hash();current(options);
  if(!/^[a-f0-9]{64}$/.test(hash))resultInvalid('The Go final state hash is not valid.');
  if(!runtime.current||finalReason(runtime.current)||finalFields(runtime.current).signature!==fields.signature)throw new RuntimeError('session_changed','The final commander snapshot changed while its state hash was read.');
  return this.append({result_id:`solo-${hash}-${snapshot!.player}`,source:'solo',faction:fields.faction,completed_at:options.completedAt??Date.now(),tick:snapshot!.tick,...fields.counters},options);
 }
 async recordServer(input:CommanderServerInput,options:CommanderRecordOptions):Promise<CommanderRecordResult>{
  current(options);if(input.kind!=='online')return {recorded:false,reason:'ineligible_source'};
  const snapshot=structuredClone(input.snapshot),result=structuredClone(input.result),connection={...input.connection};
  if(result.void)return {recorded:false,reason:'ineligible_source'};if(!result.committed)return {recorded:false,reason:'result_pending'};
  const reason=finalReason(snapshot);if(reason)return {recorded:false,reason};
  const fields=finalFields(snapshot),metadata=snapshot.metadata!,outcome=snapshot.outcome!;
  if(!id(connection.match_id)||result.matchId!==connection.match_id||snapshot.player!==connection.player||metadata.protocol!==connection.protocol||metadata.simulation!==connection.simulation||metadata.contentHash!==connection.content_hash||result.outcome?.finished!==true||result.outcome.tick!==outcome.tick||result.outcome.reason!==outcome.reason||result.outcome.winningTeam!==outcome.winningTeam||result.outcome.draw!==outcome.draw)throw new RuntimeError('commander_result_mismatch','The committed result does not match the authenticated commander and final snapshot.');
  let host:URL;try{host=new URL(input.baseURL)}catch{throw new RuntimeError('content_origin','Choose the actual local match host.')}
  if(!['http:','https:'].includes(host.protocol)||host.username||host.password)throw new RuntimeError('content_origin','Choose the actual local match host.');
  const digest=await sha256Hex(new TextEncoder().encode(JSON.stringify([host.origin,connection.match_id,connection.player])));current(options);
  return this.append({result_id:`server-${digest}`,source:'server',faction:fields.faction,completed_at:options.completedAt??Date.now(),tick:snapshot.tick,...fields.counters},options);
 }
}
