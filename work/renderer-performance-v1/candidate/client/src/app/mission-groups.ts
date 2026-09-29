import type {PlayerSnapshot} from '../runtime/types';
export interface MissionGroupLabel {origin:string;text:string}
export interface MissionGroup extends MissionGroupLabel {ids:number[];aboard:number}

/** Public author labels are joined only to identity keys in the owner's private view. */
export function readMissionGroupLabels(value:unknown,snapshot:PlayerSnapshot):MissionGroupLabel[]{
 const data=value as {mission_id?:unknown;mission_version?:unknown;actor_groups?:unknown;tutorial_factions?:unknown};
 if(!snapshot.mission||!data||data.mission_id!==snapshot.mission.id||data.mission_version!==snapshot.mission.version)throw Error('Marked force labels do not match this operation.');
 const faction=snapshot.players.find(player=>player.id===snapshot.player)?.faction;
 if(data.tutorial_factions!==undefined&&(!Array.isArray(data.tutorial_factions)||data.tutorial_factions.length>4))throw Error('Faction training labels are malformed.');
 const variants=Array.isArray(data.tutorial_factions)?data.tutorial_factions.filter(entry=>entry&&entry.faction===faction):[];
 if(variants.length>1)throw Error('Faction training labels are ambiguous.');
 const lists=[data.actor_groups??[],variants[0]?.actor_groups??[]],labels:MissionGroupLabel[]=[],seen=new Set<string>();
 for(const list of lists){
  if(!Array.isArray(list)||list.length>256)throw Error('Marked force labels are malformed.');
  for(const source of list){
   if(!source||typeof source.origin!=='string'||!/^initial:(0|[1-9]\d{0,2})$/.test(source.origin)||Number(source.origin.slice(8))>255||seen.has(source.origin)||typeof source.text!=='string'||!source.text.trim()||source.text.length>120||/[\u0000-\u001f]/.test(source.text))throw Error('Marked force labels are malformed.');
   seen.add(source.origin);labels.push({origin:source.origin,text:source.text});
  }
 }
 if(labels.length>256)throw Error('Too many marked force labels.');
 return labels;
}
export function missionGroups(labels:readonly MissionGroupLabel[],snapshot:PlayerSnapshot):MissionGroup[]{
 const groups=new Map(labels.map(label=>[label.origin,{...label,ids:[] as number[],aboard:0}]));
 for(const entity of snapshot.entities){
  if(entity.owner!==snapshot.player||!entity.private||entity.private.hp<=0n)continue;
  const group=groups.get(entity.private.missionOrigin);if(!group)continue;
  if(entity.private.container)group.aboard++;else group.ids.push(entity.id);
 }
 return [...groups.values()].filter(group=>group.ids.length||group.aboard).map(group=>({...group,ids:group.ids.sort((a,b)=>a-b)}));
}
