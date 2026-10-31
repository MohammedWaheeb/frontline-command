/** Fixed-slot command card model for the selection tray (presentation only).
 *
 * Shared by rendering and keyboard dispatch. Input is the deduplicated
 * Go affordance data the view already derives; output is pages of 12 sockets
 * laid out 4×3. Core orders never move between selections: a missing order
 * leaves an empty socket. Go stays authoritative for legality. */

export type CardEntry=
 |{key:string;kind:'command';command:string}
 |{key:string;kind:'setting';command:'power'|'repeat_sortie'}
 |{key:string;kind:'rebase'}
 |{key:string;kind:'barricade'}
 |{key:string;kind:'ability';ability:string}
 |{key:string;kind:'observe'};
export type CardSlot=CardEntry|{key:string;kind:'empty'}|{key:string;kind:'page';target:number;label:string};
export type CardLayout='unit'|'building'|'free';
export const CARD_SLOTS=12,CARD_COLUMNS=4;

/** Affordance ordering retained from the original command-card presentation. */
const COMMAND_FIRST=['move','attack_move','attack','stop','hold','force_fire','guard','patrol','escort'],COMMAND_LAST=['aggressive','resume'];
const commandRank=(kind:string)=>{const first=COMMAND_FIRST.indexOf(kind),last=COMMAND_LAST.indexOf(kind);return first>=0?first:last>=0?COMMAND_FIRST.length+1+last:COMMAND_FIRST.length};
export const orderCommands=(kinds:readonly string[])=>[...kinds].sort((a,b)=>commandRank(a)-commandRank(b));
export function commandCardEntries(commandKinds:readonly string[],abilities:readonly string[],fieldBarricade:boolean):CardEntry[]{return [
 ...commandKinds.map((kind):CardEntry=>kind==='power'||kind==='repeat_sortie'?{key:`set:${kind}`,kind:'setting',command:kind}:{key:`cmd:${kind}`,kind:'command',command:kind}),
 ...(commandKinds.includes('return')?[{key:'rebase',kind:'rebase'} as const]:[]),
 ...(fieldBarricade?[{key:'barricade',kind:'barricade'} as const]:[]),
 ...abilities.map((type):CardEntry=>type==='observe'?{key:'observe',kind:'observe'}:{key:`ab:${type}`,kind:'ability',ability:type}),
]}
export function currentCommandCard(entries:readonly CardEntry[],page=0){const model=commandCardPages(entries),index=Math.max(0,Math.min(page,model.pages.length-1));return {...model,page:index,current:model.pages[index],entries}}

/** Row 1–2 of the unit card. A tuple lists alternatives for one socket. */
const UNIT_FIXED:readonly (readonly string[])[]=[['attack_move'],['move'],['stop'],['hold'],['guard'],['patrol'],['force_fire'],['aggressive','escort']];
/** Row 1 of the building card. */
const BUILDING_FIXED:readonly (readonly string[])[]=[['rally'],['power'],['repair'],['sell']];
/** Contextual order priority for the free sockets (row 3 first). */
const CONTEXT_ORDER=['deploy','pack','capture','board','unload','repair','gather','salvage','return','rebase','attack','escort','barricade','resume','repeat_sortie','rally','power','sell'];

const entryCommand=(entry:CardEntry)=>entry.kind==='command'||entry.kind==='setting'?entry.command:entry.kind==='rebase'?'rebase':entry.kind==='barricade'?'barricade':undefined;

function rank(entry:CardEntry){
 const command=entryCommand(entry);
 if(command!==undefined){const index=CONTEXT_ORDER.indexOf(command);return index>=0?index:CONTEXT_ORDER.length}
 // Abilities after orders; the strategic operation is always the last ability.
 return CONTEXT_ORDER.length+1+(entry.kind==='ability'&&entry.ability==='strategic'?1:0);
}

/** Lays out the entries into pages of 12 sockets. Page navigation keys occupy
 * the last socket ("More" on page 1, "Back" on the last page). */
export function commandCardPages(entries:readonly CardEntry[]):{layout:CardLayout;pages:CardSlot[][]}{
 const commands=new Set(entries.map(entryCommand).filter((value):value is string=>!!value));
 const layout:CardLayout=['move','attack_move','stop','hold'].some(kind=>commands.has(kind))?'unit':BUILDING_FIXED.some(group=>group.some(kind=>commands.has(kind)))?'building':'free';
 const fixed=layout==='unit'?UNIT_FIXED:layout==='building'?BUILDING_FIXED:[];
 const first:CardSlot[]=Array.from({length:CARD_SLOTS},(_,index)=>({key:`empty-${index}`,kind:'empty'}));
 const placed=new Set<string>();
 fixed.forEach((group,index)=>{const entry=group.map(kind=>entries.find(value=>entryCommand(value)===kind&&!placed.has(value.key))).find(Boolean);if(entry){first[index]=entry;placed.add(entry.key)}});
 const rest=entries.filter(entry=>!placed.has(entry.key)).map((entry,order)=>({entry,order})).sort((a,b)=>rank(a.entry)-rank(b.entry)||a.order-b.order).map(value=>value.entry);
 // Free sockets: after the fixed rows first, then (only if needed) empty fixed sockets from the end.
 const after=first.map((slot,index)=>({slot,index})).filter(({slot,index})=>slot.kind==='empty'&&index>=fixed.length).map(value=>value.index);
 const before=first.map((slot,index)=>({slot,index})).filter(({slot,index})=>slot.kind==='empty'&&index<fixed.length).map(value=>value.index).reverse();
 const free=rest.length>after.length?[...after,...before]:after;
 if(rest.length<=free.length){rest.forEach((entry,index)=>{first[free[index]]=entry});return {layout,pages:[first]}}
 // Overflow: the last free socket becomes More; further pages hold 11 entries plus a page key.
 const firstCount=free.length-1;free.slice(0,firstCount).forEach((socket,index)=>{first[socket]=rest[index]});
 const overflow=rest.slice(firstCount),pages:CardSlot[][]=[first];
 for(let offset=0;offset<overflow.length;offset+=CARD_SLOTS-1){
  const chunk=overflow.slice(offset,offset+CARD_SLOTS-1),page:CardSlot[]=Array.from({length:CARD_SLOTS},(_,index)=>chunk[index]??{key:`empty-p${pages.length}-${index}`,kind:'empty'});
  pages.push(page);
 }
 const moreSocket=free[firstCount];
 pages.forEach((page,index)=>{const last=index===pages.length-1,target=last?0:index+1,socket=index===0?moreSocket:CARD_SLOTS-1;page[socket]={key:`page-${index}`,kind:'page',target,label:last?'Back':'More'}});
 return {layout,pages};
}

/** Player-facing coverage line for a card tooltip (research rule 16: no
 * "capable unit" engine copy). Silent when every selected actor can act. */
export function selectionCoverage(snapshot:{player:number;entities:readonly {id:number;owner:number;private?:unknown}[]}|undefined,ids:readonly number[],advice:{player:number;entities:readonly {id:number;commands:readonly string[];abilities:readonly string[];builds:readonly string[]}[]}|undefined,kind:string,type?:string):string|undefined{
 if(!snapshot||!advice||advice.player!==snapshot.player||ids.length<2)return;
 const able=ids.filter(id=>{const value=advice.entities.find(entity=>entity.id===id);return !!value&&value.commands.includes(kind)&&(kind!=='ability'||!type||value.abilities.includes(type))&&(kind!=='build'||!type||value.builds.includes(type))}).length;
 if(able===ids.length)return;
 return able?`${able} of ${ids.length} selected can do this; the rest keep their orders.`:'None of the selected forces can do this.';
}
