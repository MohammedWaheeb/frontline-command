import type {Difficulty,Faction} from '../runtime/types';
import {sanitizeSkirmishSetup,type SkirmishSetup} from './skirmish-setup';

const MIRROR='frontline.skirmish.v1';
/** Untrusted storage is optional: privacy modes and quota failures never block play. */
export function readSkirmishMemory():SkirmishSetup|undefined {
 try{
  const raw=globalThis.localStorage.getItem(MIRROR);if(!raw||raw.length>16384)return undefined;
  const value:unknown=JSON.parse(raw);
  if(!value||typeof value!=='object'||!('version' in value)||value.version!==1||!('setup' in value))return undefined;
  return sanitizeSkirmishSetup(value.setup);
 }catch{return undefined}
}
export function writeSkirmishMemory(setup:SkirmishSetup):void {
 const safe=sanitizeSkirmishSetup(setup);if(!safe)return;
 try{globalThis.localStorage.setItem(MIRROR,JSON.stringify({version:1,setup:safe}))}catch{/* launch succeeds even when memory cannot be written */}
}


export interface MenuMemory {campaignFaction:Faction;campaignDifficulty:Difficulty}
const MENU_MIRROR='frontline.menu.v1',RECORDS_MIRROR='frontline.records.ui.v1';
const DEFAULT_MENU:MenuMemory={campaignFaction:'US',campaignDifficulty:'normal'};
function objectMemory(key:string):Record<string,unknown>{
 try{const raw=globalThis.localStorage.getItem(key);if(!raw||raw.length>16384)return {};const value=JSON.parse(raw);return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}
}
function campaignFields(value:Record<string,unknown>):Partial<MenuMemory>{
 const result:Partial<MenuMemory>={};
 if(typeof value.campaignFaction==='string'&&['US','IR','SY','SA'].includes(value.campaignFaction))result.campaignFaction=value.campaignFaction as Faction;
 if(typeof value.campaignDifficulty==='string'&&['easy','normal','hard'].includes(value.campaignDifficulty))result.campaignDifficulty=value.campaignDifficulty as Difficulty;
 return result;
}
/** Read through the records adapter during migration. Its unrelated tabs stay intact. */
export function readMenuMemory():MenuMemory{
 const saved=objectMemory(MENU_MIRROR),legacy=campaignFields(objectMemory(RECORDS_MIRROR));
 return {...DEFAULT_MENU,...legacy,...(saved.version===1?campaignFields(saved):{})};
}
export function writeMenuMemory(change:Partial<MenuMemory>):void{
 const memory={...readMenuMemory(),...campaignFields(change)};
 try{globalThis.localStorage.setItem(MENU_MIRROR,JSON.stringify({version:1,...memory}))}catch{/* optional browser memory */}
}
/** Explicitly copy valid legacy campaign choices; never remove the legacy key. */
export function migrateRecordsMemory():MenuMemory{const memory=readMenuMemory();writeMenuMemory(memory);return memory}
