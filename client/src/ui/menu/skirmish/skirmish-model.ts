// Skirmish setup presentation model (Lane C). Pure functions over the client-logic
// SkirmishSetup contract (app/skirmish-setup.ts). Go and resolveSkirmishPlayers stay
// authoritative; these helpers only keep the editable table internally consistent.
import {sanitizeSkirmishSetup,skirmishPreset,type SkirmishFaction,type SkirmishPreset,type SkirmishSetup,type SkirmishSlot} from '../../../app/skirmish-setup';
import {MAX_STARTING_CREDITS,MIN_STARTING_CREDITS,STANDARD_STARTING_CREDITS} from '../../../app/starting-money';
import {tokens} from '../../../design/tokens';
import {FACTIONS} from '../../../content/labels';
import type {Difficulty,Faction} from '../../../runtime/types';

export const SKIRMISH_FACTIONS:readonly Faction[]=['US','IR','SY','SA'];
export const DIFFICULTIES:readonly Difficulty[]=['easy','normal','hard'];
export const MAX_COMMANDERS=4;

/** Player-facing copy supplied by the AI lane (fix-ai.md, Go AI*Description constants). */
export const DIFFICULTY_COPY:Record<Difficulty,{label:string;description:string}>={
 easy:{label:'Easy',description:'Slower, smaller attack waves; longer regrouping, delayed technology and no harassment. Normal costs and fog of war.'},
 normal:{label:'Normal',description:'Balanced attack waves, mixed armies and production growth when resources allow. Normal costs and fog of war.'},
 hard:{label:'Hard',description:'Larger coordinated attack waves, faster regrouping, stronger counters to scouted forces and extra production. Normal costs and fog of war.'},
};

export type PaletteScheme='standard'|'cvd_safe';
const COLOR_NAMES:Record<PaletteScheme,readonly string[]>={
 standard:['Blue','Red','Teal','Orange','Violet','Yellow','Green','White'],
 cvd_safe:['Blue','Vermilion','Bluish green','Orange','Pink','Yellow','Sky','White'],
};
/** Slot colors 1..8 map onto the shared team palette (tokens.color.team). */
export function teamPalette(scheme:PaletteScheme):readonly string[]{return scheme==='cvd_safe'?tokens.color.team.cvd_safe:tokens.color.team.standard}
export function colorName(scheme:PaletteScheme,color:number){return COLOR_NAMES[scheme][color-1]??`Color ${color}`}
export function colorCSS(scheme:PaletteScheme,color:number){return teamPalette(scheme)[color-1]??tokens.color.team.relation.neutral}
/** Dark or light ink for text drawn on a team swatch. */
export function inkOn(css:string){const value=Number.parseInt(css.slice(1),16),r=value>>16&255,g=value>>8&255,b=value&255;return (0.299*r+0.587*g+0.114*b)>150?'#14110b':'#fbf6ea'}

export function factionName(faction:SkirmishFaction){return faction==='random'?'Random':FACTIONS[faction].name}
export function slotLabel(slot:SkirmishSlot){return slot.difficulty?`${DIFFICULTY_COPY[slot.difficulty].label} AI`:'You'}

const credit=new Intl.NumberFormat('en-US');
export const CREDIT_CHOICES=[6000,10000,25000,50000] as const;
export function creditsLabel(value:number){return credit.format(value)+(value===STANDARD_STARTING_CREDITS?' · Standard':'')}
export function parseCreditsDraft(text:string):number|undefined{
 const trimmed=text.replace(/[,\s]/g,'');if(!/^[0-9]+$/.test(trimmed))return undefined;
 const value=Number(trimmed);return Number.isSafeInteger(value)&&value>=MIN_STARTING_CREDITS&&value<=MAX_STARTING_CREDITS?value:undefined;
}

/** Stable IDs 1..n in table order, readable AI names and spawns within the battlefield capacity. */
export function normalize(setup:SkirmishSetup,spawnCount=MAX_COMMANDERS):SkirmishSetup{
 const human=setup.slots.find(slot=>!slot.difficulty)??setup.slots[0];
 const ordered=[human,...setup.slots.filter(slot=>slot!==human)].slice(0,MAX_COMMANDERS);
 const ais=ordered.filter(slot=>slot.difficulty).length;
 let ai=0;
 const slots=ordered.map((slot,index):SkirmishSlot=>{
  const id=index+1,spawn=slot.spawn>spawnCount?0:slot.spawn;
  if(index===0)return {id,name:slot.name?.trim()||'Commander',faction:slot.faction,team:slot.team,color:slot.color,spawn};
  ai++;const difficulty=slot.difficulty??'normal';
  return {id,name:`${DIFFICULTY_COPY[difficulty].label} AI${ais>1?' '+ai:''}`,faction:slot.faction,team:slot.team,color:slot.color,spawn,difficulty};
 });
 // Spawns must be distinct; a later duplicate becomes Automatic.
 const seen=new Set<number>();for(const slot of slots){if(slot.spawn&&seen.has(slot.spawn))slot.spawn=0;if(slot.spawn)seen.add(slot.spawn)}
 return {...setup,slots};
}

/** Remembered setup if it still fits an installed curated battlefield, else a fresh 1v1. */
export function initialSetup(remembered:SkirmishSetup|undefined,maps:readonly {id:string;players:number}[]):SkirmishSetup|undefined{
 const first=maps[0];if(!first)return undefined;
 const map=remembered&&maps.find(value=>value.id===remembered.mapID);
 if(remembered&&map&&remembered.slots.length<=map.players)return normalize(remembered,map.players);
 return normalize({...skirmishPreset('1v1',first.id),...(remembered?{startingCredits:remembered.startingCredits}:{})},first.players);
}

/** Fit the table to a newly chosen battlefield. Returns the removed AI labels for a notice. */
export function fitToMap(setup:SkirmishSetup,mapID:string,players:number):{setup:SkirmishSetup;removed:number}{
 const keep=Math.max(2,Math.min(players,MAX_COMMANDERS)),removed=Math.max(0,setup.slots.length-keep);
 let next=normalize({...setup,mapID,slots:setup.slots.slice(0,keep)},players);
 if(sides(next.slots)<2)next=normalize({...next,slots:next.slots.map((slot,index)=>index===0?slot:{...slot,team:slot.team===next.slots[0].team?nextFreeTeam(next.slots):slot.team})});
 return {setup:next,removed};
}

export function applyPreset(setup:SkirmishSetup,preset:SkirmishPreset,spawnTeams?:readonly (number|undefined)[]):SkirmishSetup{
 const human=setup.slots[0],fresh=skirmishPreset(preset,setup.mapID,human?.faction??'US');
 const keepColor=human?.color??1,difficulty=setup.slots.find(slot=>slot.difficulty)?.difficulty??'normal';
 // Keep your faction, colour and the current AI difficulty; colours stay distinct.
 const colors=[keepColor,...[1,2,3,4,5,6,7,8].filter(color=>color!==keepColor)];
 let slots=fresh.slots.map((slot,index)=>({...slot,color:colors[index],...(index===0?{name:human?.name||slot.name}:{difficulty})}));
 if(preset==='2v2'&&spawnTeams)slots=alliedSpawns(slots,spawnTeams);
 return normalize({...setup,slots});
}

/** For maps whose authored spawns carry team hints, seat allies on their side. */
export function alliedSpawns(slots:SkirmishSlot[],spawnTeams:readonly (number|undefined)[]):SkirmishSlot[]{
 const active=spawnTeams.slice(0,slots.length),teams=[...new Set(slots.map(slot=>slot.team))];
 if(active.some(team=>!team)||teams.length!==2)return slots;
 const byHint=new Map<number,number[]>();active.forEach((team,index)=>{const list=byHint.get(team!)??[];list.push(index+1);byHint.set(team!,list)});
 const hints=[...byHint.keys()];if(hints.length!==2)return slots;
 const pool=new Map(teams.map((team,index)=>[team,[...(byHint.get(hints[index])??[])]]));
 if(teams.some(team=>(pool.get(team)?.length??0)!==slots.filter(slot=>slot.team===team).length))return slots;
 return slots.map(slot=>({...slot,spawn:pool.get(slot.team)!.shift()!}));
}

export function sides(slots:readonly SkirmishSlot[]){return new Set(slots.filter(slot=>slot.team!==0).map(slot=>slot.team)).size+slots.filter(slot=>slot.team===0).length}
function nextFreeTeam(slots:readonly SkirmishSlot[]){const used=new Set(slots.map(slot=>slot.team));for(let team=1;team<=4;team++)if(!used.has(team))return team;return 0}

export function addAI(setup:SkirmishSetup,players:number):SkirmishSetup{
 if(setup.slots.length>=Math.min(players,MAX_COMMANDERS))return setup;
 const used=new Set(setup.slots.map(slot=>slot.color)),color=[1,2,3,4,5,6,7,8].find(value=>!used.has(value))??1;
 const allDistinct=new Set(setup.slots.map(slot=>slot.team)).size===setup.slots.length&&!setup.slots.some(slot=>slot.team===0);
 const ffa=setup.slots.every(slot=>slot.team===0);
 let team=0;
 if(!ffa){
  if(allDistinct)team=nextFreeTeam(setup.slots)||0;
  else{const human=setup.slots[0].team,counts=new Map<number,number>();for(const slot of setup.slots)if(slot.team!==human&&slot.team!==0)counts.set(slot.team,(counts.get(slot.team)??0)+1);team=[...counts.entries()].sort((a,b)=>a[1]-b[1]||a[0]-b[0])[0]?.[0]??nextFreeTeam(setup.slots)}
 }
 const difficulty=[...setup.slots].reverse().find(slot=>slot.difficulty)?.difficulty??'normal';
 return normalize({...setup,slots:[...setup.slots,{id:setup.slots.length+1,name:'AI',faction:'random',team,color,spawn:0,difficulty}]});
}
export function removeSlot(setup:SkirmishSetup,id:number):SkirmishSetup{
 if(id===1||setup.slots.length<=2)return setup;
 return normalize({...setup,slots:setup.slots.filter(slot=>slot.id!==id)});
}
export function updateSlot(setup:SkirmishSetup,id:number,patch:Partial<Omit<SkirmishSlot,'id'|'color'|'spawn'>>):SkirmishSetup{
 return normalize({...setup,slots:setup.slots.map(slot=>slot.id===id?{...slot,...patch}:slot)});
}
/** Choosing a taken colour swaps it with its holder, so colours stay distinct. */
export function setColor(setup:SkirmishSetup,id:number,color:number):SkirmishSetup{
 const own=setup.slots.find(slot=>slot.id===id);if(!own)return setup;
 return normalize({...setup,slots:setup.slots.map(slot=>slot.id===id?{...slot,color}:slot.color===color?{...slot,color:own.color}:slot)});
}
/** Claiming a held start swaps the two commanders' positions. Claiming your own start again frees it. */
export function setSpawn(setup:SkirmishSetup,id:number,spawn:number,toggle=false,spawnCount=MAX_COMMANDERS):SkirmishSetup{
 const own=setup.slots.find(slot=>slot.id===id);if(!own||!Number.isInteger(spawn)||spawn<0||spawn>spawnCount)return setup;
 if(toggle&&own.spawn===spawn)spawn=0;
 return normalize({...setup,slots:setup.slots.map(slot=>slot.id===id?{...slot,spawn}:spawn!==0&&slot.spawn===spawn?{...slot,spawn:own.spawn}:slot)},spawnCount);
}

/** Presentation-only reason the launch is unavailable; Go still validates. */
export function setupProblem(setup:SkirmishSetup|undefined,credits:number|undefined,players:number|undefined):string|undefined{
 if(!setup||!players)return 'Choose a battlefield.';
 if(setup.slots.length<2)return 'Add at least one AI commander.';
 if(setup.slots.length>players)return `This battlefield holds ${players} commanders.`;
 if(sides(setup.slots)<2)return 'Put at least one commander on an opposing team.';
 if(credits===undefined)return 'Enter starting credits from 1 to 1,000,000.';
 if(!sanitizeSkirmishSetup({...setup,startingCredits:credits}))return 'Review the commander table before deploying.';
 return undefined;
}

/** "1 v 1", "2 v 2", "1 v 2", "Free-for-all · 3". */
export function matchFormat(slots:readonly SkirmishSlot[]){
 const groups=new Map<string,number>();slots.forEach(slot=>{const key=slot.team===0?`solo-${slot.id}`:`t${slot.team}`;groups.set(key,(groups.get(key)??0)+1)});
 const sizes=[...groups.values()];
 if(sizes.length>2&&sizes.every(size=>size===1))return `Free-for-all · ${sizes.length}`;
 const own=slots[0]?(slots[0].team===0?`solo-${slots[0].id}`:`t${slots[0].team}`):'';
 const first=groups.get(own)??0,rest=[...groups.entries()].filter(([key])=>key!==own).map(([,size])=>size);
 return [first,...rest].join(' v ');
}

/** Compass words for a spawn, used in accessible names. */
export function compass(x:number,y:number,width:number,height:number){
 const fx=x/1000/width,fy=y/1000/height,ns=fy<0.36?'north':fy>0.64?'south':'',ew=fx<0.36?'west':fx>0.64?'east':'';
 return ns&&ew?`${ns}-${ew}`:ns||ew||'centre';
}
