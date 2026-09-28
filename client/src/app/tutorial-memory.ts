import type {LocalStore} from '../runtime/storage';
import {sha256Hex} from '../runtime/crypto';
const skills=new Set(['single_select','box_select','group_store','group_recall','stop','rally','rejected_order']);
interface Memory{version:1;mission:string;missionVersion:string;skills:string[]}
/** UI teaching memory only. It cannot record campaign completion or change Go state. */
export class TutorialInputMemory{
 private writes:Promise<unknown>=Promise.resolve();
 constructor(private readonly store:Pick<LocalStore,'setting'|'putSetting'>){}
 private async key(mission:string,version:string){return `tutorial-input-${(await sha256Hex(new TextEncoder().encode(`${mission}\0${version}`))).slice(0,40)}`}
 private checked(data:Memory|undefined,mission:string,version:string){if(!data)return [];if(data.version!==1||data.mission!==mission||data.missionVersion!==version||!Array.isArray(data.skills)||data.skills.length>skills.size||data.skills.some(skill=>!skills.has(skill)))throw Error('Saved tutorial input reminders are incompatible. Existing data was preserved.');return [...new Set(data.skills)]}
 async read(mission:string,version:string){const record=await this.store.setting<Memory>(await this.key(mission,version));return this.checked(record?.data,mission,version)}
 record(mission:string,version:string,skill:string):Promise<string[]>{if(!skills.has(skill))return this.read(mission,version);const operation=this.writes.then(async()=>{const key=await this.key(mission,version);for(let attempt=0;attempt<4;attempt++){const record=await this.store.setting<Memory>(key),current=this.checked(record?.data,mission,version);if(current.includes(skill))return current;const next=[...current,skill].sort();try{await this.store.putSetting(key,{version:1,mission,missionVersion:version,skills:next},record?.revision??0);return next}catch(error){if(attempt===3||(error as {code?:string}).code!=='settings_conflict')throw error}}throw Error('Tutorial input memory could not be saved.');});this.writes=operation.catch(()=>{});return operation}
}
