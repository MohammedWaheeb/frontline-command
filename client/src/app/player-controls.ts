import type {CommandAffordances,PlayerSnapshot} from '../runtime/types';
export type SelectionSetting='power'|'repeat_sortie';
export interface SelectionSettingState {state:'on'|'off'|'mixed';pressed:boolean|'mixed';nextIndex:0|1}
/** Read disclosed owned state only. Unsupported owned forces are skipped; foreign or missing actors invalidate the selection.
 * Power is effective operation, including temporary disable; its raw manual
 * switch is not disclosed. Explicit Enable/Disable choices do not clear sabotage. */
export function selectionSettingState(kind:SelectionSetting,snapshot:PlayerSnapshot|undefined,ids:readonly number[],advice:CommandAffordances|undefined):SelectionSettingState|undefined{
 if(!snapshot||!ids.length||new Set(ids).size!==ids.length||!advice||advice.player!==snapshot.player)return;
 const selected=ids.map(id=>snapshot.entities.find(entity=>entity.id===id&&entity.owner===snapshot.player));
 if(selected.some(entity=>!entity?.private))return;
 const eligible=selected.filter(entity=>advice.entities.some(value=>value.id===entity!.id&&value.commands.includes(kind)));if(!eligible.length)return;
 const on=eligible.map(entity=>kind==='power'?entity!.enabled:entity!.private!.repeatSortie);
 const allOn=on.every(Boolean),allOff=on.every(value=>!value);
 return {state:allOn?'on':allOff?'off':'mixed',pressed:allOn?true:allOff?false:'mixed',nextIndex:allOn?0:1};
}
export const MAX_REPAIR_RESERVE=1000000;
/** The wire carries whole credits; Go converts them to the fixed-point economy. */
export function parseRepairReserve(value:string):number|undefined{
 if(!/^\d+$/.test(value))return;
 const amount=Number(value);return Number.isSafeInteger(amount)&&amount>=0&&amount<=MAX_REPAIR_RESERVE?amount:undefined;
}

/** Observe's private flag is read only for owned, capable recon actors. */
export function observeSettingState(snapshot:PlayerSnapshot|undefined,ids:readonly number[],advice:CommandAffordances|undefined):SelectionSettingState|undefined{
 if(!snapshot||!advice||advice.player!==snapshot.player||!ids.length||new Set(ids).size!==ids.length)return;
 const own=new Map(snapshot.entities.filter(entity=>entity.owner===snapshot.player&&entity.private).map(entity=>[entity.id,entity]));
 if(ids.some(id=>!own.has(id)))return;
 const eligible=ids.filter(id=>advice.entities.some(value=>value.id===id&&value.abilities.includes('observe')));if(!eligible.length)return;
 const on=eligible.map(id=>(own.get(id)!.private as NonNullable<typeof snapshot.entities[number]['private']>&{reconObserve?:boolean}).reconObserve===true);
 const allOn=on.every(Boolean),allOff=on.every(value=>!value);
 // Go uses Observe index 0 = ON and 1 = OFF, unlike Power.
 return {state:allOn?'on':allOff?'off':'mixed',pressed:allOn?true:allOff?false:'mixed',nextIndex:allOn?1:0};
}

/** Counts are affordance feedback, not legality or a gameplay decision. */
export function capableSelectionHint(snapshot:PlayerSnapshot|undefined,ids:readonly number[],advice:CommandAffordances|undefined,kind:string,type?:string):string{
 if(!snapshot||!advice||advice.player!==snapshot.player||!ids.length)return '';
 const own=new Set(snapshot.entities.filter(entity=>entity.owner===snapshot.player&&entity.private).map(entity=>entity.id));
 if(new Set(ids).size!==ids.length||ids.some(id=>!own.has(id)))return 'Selection unavailable.';
 const eligible=ids.filter(id=>{const capability=advice.entities.find(value=>value.id===id);return capability?.commands.includes(kind)&&(kind!=='ability'||!type||capability.abilities.includes(type))&&(kind!=='build'||!type||capability.builds.includes(type))}).length;
 const unknown=ids.filter(id=>!advice.entities.some(value=>value.id===id)).length;
 const skipped=ids.length-eligible-unknown;
 return `${eligible} capable selected unit${eligible===1?'':'s'}${skipped?`; ${skipped} unsupported keep their orders`:''}${unknown?`; capability unknown for ${unknown} selected unit${unknown===1?'':'s'}`:''}.`;
}

/** This acknowledgement comes from execution, never the requested selection size. */
export function executionCountFeedback(result:{accepted:boolean;appliedCount?:number;eligibleEntities?:readonly number[]}):string|undefined{
 const count=result.appliedCount;
 if(!result.accepted||!Number.isInteger(count)||count!<=0||count!>4096)return;
 return `Order applied to ${count} capable unit${count===1?'':'s'}.`;
}
