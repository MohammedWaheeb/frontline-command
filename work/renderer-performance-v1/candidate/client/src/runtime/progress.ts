import {RuntimeError} from './errors';
import type {Difficulty,EngineMetadata} from './types';
import type {LocalProgress,LocalStore} from './storage';
export interface MissionCompletion{result_id:string;mission:string;mission_version:string;difficulty:Difficulty;completed_at:number;tick:number;optional_objectives:string[];metadata:Pick<EngineMetadata,'ruleset'>&Partial<EngineMetadata>}
export interface MissionProgress{mission:string;mission_version:string;difficulty:Difficulty;completions:number;first_completed:number;last_completed:number;best_tick:number;optional_objectives:string[]}
export interface CampaignProgress{version:1;results:string[];missions:Record<string,MissionProgress>}
const EMPTY:CampaignProgress={version:1,results:[],missions:{}};
const stableID=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(value);
const nonnegative=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
export function validateCampaignProgress(value:CampaignProgress){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['version','results','missions'].includes(key))||new TextEncoder().encode(JSON.stringify(value)).length>256*1024)throw new RuntimeError('progress_invalid','Choose a supported campaign ledger no larger than 256 KiB.');
 if(!value||value.version!==1)throw new RuntimeError('progress_incompatible','Keep this campaign progress for a matching game version.');
 if(!Array.isArray(value.results)||value.results.length>4096||value.results.some(result=>!stableID(result))||new Set(value.results).size!==value.results.length||!value.missions||typeof value.missions!=='object'||Array.isArray(value.missions)||Object.keys(value.missions).length>4096)throw new RuntimeError('progress_invalid','This campaign progress is damaged. Export its backup before recovery.');
 for(const [key,mission] of Object.entries(value.missions)){
  if(!mission||Object.keys(mission).some(key=>!['mission','mission_version','difficulty','completions','first_completed','last_completed','best_tick','optional_objectives'].includes(key))||!stableID(mission.mission)||!stableID(mission.mission_version)||!['easy','normal','hard'].includes(mission.difficulty)||key!==`${mission.mission}:${mission.mission_version}:${mission.difficulty}`||!Number.isSafeInteger(mission.completions)||mission.completions<1||mission.completions>value.results.length||!nonnegative(mission.first_completed)||!nonnegative(mission.last_completed)||mission.last_completed<mission.first_completed||!nonnegative(mission.best_tick)||!Array.isArray(mission.optional_objectives)||mission.optional_objectives.length>100||mission.optional_objectives.some(objective=>!stableID(objective))||new Set(mission.optional_objectives).size!==mission.optional_objectives.length)throw new RuntimeError('progress_invalid','This campaign progress is damaged. Export its backup before recovery.');
 }
}
function valid(value:MissionCompletion){
 const id=stableID;
 if(!id(value.result_id)||!id(value.mission)||!id(value.mission_version)||!['easy','normal','hard'].includes(value.difficulty)||!Number.isSafeInteger(value.completed_at)||value.completed_at<0||!Number.isSafeInteger(value.tick)||value.tick<0||!Array.isArray(value.optional_objectives)||value.optional_objectives.length>100||value.optional_objectives.some(objective=>!id(objective))||new Set(value.optional_objectives).size!==value.optional_objectives.length)throw new RuntimeError('progress_invalid','This mission result is not a valid local completion record.');
}
/** Local story records only. Ranked rating, rewards and combat unlocks remain server/Go owned. */
export class CampaignProgressStore{
 constructor(private readonly store:Pick<LocalStore,'progress'|'putProgress'>,readonly id='campaign'){}
 async read():Promise<LocalProgress<CampaignProgress>|undefined>{
  const record=await this.store.progress<CampaignProgress>(this.id);if(record){if(record.schema_version!==1)throw new RuntimeError('progress_incompatible','Keep this campaign progress for a matching game version.');validateCampaignProgress(record.data)}return record;
 }
 /** The caller must supply a final authoritative live result, never replay seek events. */
 async record(completion:MissionCompletion,source:'live-solo'|'live-server'|'replay'|'practice'):Promise<LocalProgress<CampaignProgress>|undefined>{
  if(source==='replay'||source==='practice'||completion.metadata?.ruleset==='practice-v1')return this.read();if(source!=='live-solo'&&source!=='live-server')throw new RuntimeError('progress_source','Only a completed live match can update story records.');valid(completion);
  for(let attempt=0;attempt<4;attempt++){
   const current=await this.read(),data=structuredClone(current?.data??EMPTY);if(data.results.includes(completion.result_id))return current;
   // The bounded ledger refuses new entries rather than forgetting old result
   // IDs and allowing an old debrief to award another completion.
   if(data.results.length>=4096)throw new RuntimeError('progress_full','Export this campaign progress before creating another local profile.');
   const key=`${completion.mission}:${completion.mission_version}:${completion.difficulty}`,prior=data.missions[key];
   data.results.push(completion.result_id);data.missions[key]={mission:completion.mission,mission_version:completion.mission_version,difficulty:completion.difficulty,completions:(prior?.completions??0)+1,first_completed:Math.min(prior?.first_completed??completion.completed_at,completion.completed_at),last_completed:Math.max(prior?.last_completed??0,completion.completed_at),best_tick:Math.min(prior?.best_tick??completion.tick,completion.tick),optional_objectives:[...new Set([...(prior?.optional_objectives??[]),...completion.optional_objectives])].sort()};
   try{return await this.store.putProgress(this.id,data,current?.revision??0)}catch(error){if(!(error instanceof RuntimeError)||error.code!=='progress_conflict'||attempt===3)throw error}
  }
 }
}
