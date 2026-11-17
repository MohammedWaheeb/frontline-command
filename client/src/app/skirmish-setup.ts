import type {Difficulty,Faction,PlayerConfig,GameMap} from '../runtime/types';
import {requireStartingCredits,STANDARD_STARTING_CREDITS} from './starting-money';

export type SkirmishFaction=Faction|'random';
export interface SkirmishSlot {id:number;name:string;faction:SkirmishFaction;team:number;color:number;spawn:number;difficulty?:Difficulty}
export interface SkirmishSetup {mapID:string;slots:SkirmishSlot[];startingCredits:number;seed?:number}
export type SkirmishPreset='1v1'|'2v2'|'ffa';
const factions:readonly Faction[]=['US','IR','SY','SA'];
const integer=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function fail(message:string):never {throw new Error(message)}
function checkedSlots(value:unknown):SkirmishSlot[]{
 if(!Array.isArray(value)||value.length<2||value.length>4)fail('Choose two to four commanders. For solo training, use the Practice range.');
 const ids=new Set<number>(),colors=new Set<number>(),spawns=new Set<number>();
 const slots=Array.from(value).map((slot:unknown)=>{
  if(!object(slot)||!integer(slot.id,1,4)||ids.has(slot.id))fail('Commander IDs must be unique from 1 to 4.');
  if(typeof slot.name!=='string'||!slot.name.trim()||new TextEncoder().encode(slot.name.trim()).length>48||/[\u0000-\u001f\u007f]/.test(slot.name))fail('Commander names must contain 1 to 48 bytes without control characters.');
  if(slot.faction!=='random'&&!factions.includes(slot.faction as Faction))fail('Choose a supported commander faction.');
  if(!integer(slot.team,0,4))fail('Choose a team from 1 to 4, or No team.');
  if(!integer(slot.color,1,8)||colors.has(slot.color))fail('Choose a distinct commander color from 1 to 8.');
  // Explicit positions address the whole map, independently of player count.
  if(!integer(slot.spawn,0,4)||slot.spawn!==0&&spawns.has(slot.spawn))fail('Choose a distinct starting position within the battlefield, or Automatic.');
  if(slot.id===1?slot.difficulty!==undefined:!['easy','normal','hard'].includes(slot.difficulty as string))fail('Commander 1 is human; every other commander needs an AI difficulty.');
  ids.add(slot.id);colors.add(slot.color);if(slot.spawn!==0)spawns.add(slot.spawn);
  return {id:slot.id,name:slot.name.trim(),faction:slot.faction as SkirmishFaction,team:slot.team,color:slot.color,spawn:slot.spawn,...(slot.difficulty!==undefined?{difficulty:slot.difficulty as Difficulty}:{})};
 });
 if(!ids.has(1))fail('The local commander must have ID 1.');
 const sides=new Set(slots.filter(slot=>slot.team!==0).map(slot=>slot.team)).size+slots.filter(slot=>slot.team===0).length;
 if(sides<2)fail('Choose at least two opposing teams.');
 return slots;
}

/** Fresh presets use slot 1 as the local commander, irrespective of spawn order. */
export function skirmishPreset(preset:SkirmishPreset,mapID:string,faction:SkirmishFaction='US'):SkirmishSetup {
 if(!['1v1','2v2','ffa'].includes(preset))fail('Choose a supported skirmish preset.');
 const count=preset==='1v1'?2:4;
 const setup:SkirmishSetup={mapID,startingCredits:STANDARD_STARTING_CREDITS,slots:Array.from({length:count},(_,index)=>({id:index+1,name:index===0?'Commander':`AI commander ${index}`,faction:index===0?faction:'random',team:preset==='2v2'?(index<2?1:2):index+1,color:index+1,spawn:0,...(index===0?{}:{difficulty:'normal' as const})}))};
 const checked=sanitizeSkirmishSetup(setup);if(!checked)fail('The skirmish preset needs a valid battlefield and faction.');return checked;
}

/** Deterministic and independent of input row order. Does not mutate slots. */
export function resolveSkirmishPlayers(slots:readonly SkirmishSlot[],seed:number,spawnCount:number,spawns?:GameMap['spawns']):(PlayerConfig&{spawn:number})[]{
 const checked=checkedSlots(slots).sort((a,b)=>a.id-b.id);
 if(!integer(seed,0,0xffffffff))fail('The skirmish seed must be an unsigned 32-bit integer.');
 if(!integer(spawnCount,1,4)||checked.length>spawnCount)fail('The commander count exceeds this battlefield’s starting positions.');
 if(checked.some(slot=>slot.spawn>spawnCount))fail('Choose a starting position within this battlefield.');
 // The engine defaults team 0 to player ID. Allocate explicit unused teams to
 // prevent a No team commander from accidentally joining a named team.
 const usedTeams=new Set(checked.filter(slot=>slot.team!==0).map(slot=>slot.team));
 for(const slot of checked){if(slot.team!==0)continue;let team=1;while(usedTeams.has(team))team++;slot.team=team;usedTeams.add(team)}
 // A zero seed is normalized to one by Go as well.
 let randomState=seed||1;
 const next=(limit:number)=>{randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;return (randomState>>>0)%limit};
 const occupied=new Set(checked.filter(slot=>slot.spawn!==0).map(slot=>slot.spawn));
 // Automatic duels use the farthest start from the first/explicit player.
 // The installed map geometry, rather than a presumed corner ordering, decides.
 if(checked.length===2&&spawnCount===4){
  const explicit=checked.filter(slot=>slot.spawn!==0);
  if(explicit.length<2){
   const anchor=explicit[0]??checked[0];anchor.spawn ||= 1;
   let opposite=(anchor.spawn+1)%4+1,best=-1;
   if(spawns?.length===spawnCount){
    const start=spawns[anchor.spawn-1].position;
    for(let index=0;index<spawnCount;index++){
     if(index===anchor.spawn-1)continue;
     const point=spawns[index].position,distance=(point.x-start.x)**2+(point.y-start.y)**2;
     if(distance>best){best=distance;opposite=index+1}
    }
   }
   checked.find(slot=>slot!==anchor)!.spawn=opposite;
   occupied.add(anchor.spawn);occupied.add(opposite);
  }
 }
 const free=Array.from({length:spawnCount},(_,i)=>i+1).filter(spawn=>!occupied.has(spawn));
 for(let i=free.length-1;i>0;i--){const j=next(i+1);[free[i],free[j]]=[free[j],free[i]]}
 let auto=0;
 return checked.map(slot=>({spawn:slot.spawn||free[auto++],id:slot.id,name:slot.name,faction:slot.faction==='random'?factions[next(factions.length)]:slot.faction,team:slot.team,color:slot.color,...(slot.difficulty?{controller:'ai' as const,ai:slot.difficulty}:{controller:'human' as const})}));
}

/** Invalid stored setups are discarded as a whole; never silently change teams. */
export function sanitizeSkirmishSetup(value:unknown):SkirmishSetup|undefined {
 try{
  if(!object(value)||typeof value.mapID!=='string'||value.mapID.length>128||!/^[-a-zA-Z0-9_]+$/.test(value.mapID))return undefined;
  if(value.seed!==undefined&&!integer(value.seed,0,0xffffffff))return undefined;
  const slots=checkedSlots(value.slots),startingCredits=requireStartingCredits(value.startingCredits as number);
  return {mapID:value.mapID,slots,startingCredits,...(value.seed!==undefined?{seed:value.seed as number}:{})};
 }catch{return undefined}
}
