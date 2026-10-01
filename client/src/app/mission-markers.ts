import type {GameMap,Point,PlayerSnapshot} from '../runtime';

/** Authored briefing locations only. Never derives locations from hidden actors. */
export interface MissionMarker {id:string;text:string;region:string;objective?:string;position:Point;min:Point;max:Point}
export function readMissionMarkers(value:unknown,map:GameMap,mission:NonNullable<PlayerSnapshot['mission']>):MissionMarker[]{
 const data=value as {mission_id?:unknown;mission_version?:unknown;markers?:unknown};
 if(!data||data.mission_id!==mission.id||data.mission_version!==mission.version)throw Error('Objective markers do not match this operation.');
 if(data.markers===undefined)return [];
 if(!Array.isArray(data.markers)||data.markers.length>128)throw Error('Objective markers are malformed.');
 const ids=new Set<string>();
 return data.markers.map((source:unknown)=>{
  const marker=source as {id?:unknown;text?:unknown;region?:unknown;objective?:unknown};
  if(!marker||typeof marker.id!=='string'||!marker.id||marker.id.length>128||ids.has(marker.id)||typeof marker.text!=='string'||!marker.text||marker.text.length>200||typeof marker.region!=='string'||marker.objective!==undefined&&typeof marker.objective!=='string')throw Error('Objective markers are malformed.');
  ids.add(marker.id);
  const region=map.regions?.find(region=>region.id===marker.region);
  if(!region||![region.min.x,region.min.y,region.max.x,region.max.y].every(Number.isSafeInteger)||region.min.x<0||region.min.y<0||region.max.x>=map.width*1000||region.max.y>=map.height*1000||region.min.x>region.max.x||region.min.y>region.max.y)throw Error('An objective marker has no valid map region.');
  if(marker.objective!==undefined&&!mission.objectives.some(objective=>objective.id===marker.objective&&!objective.failure))throw Error('An objective marker names an unavailable objective.');
  return {id:marker.id,text:marker.text,region:region.id,objective:marker.objective,position:{x:Math.floor((region.min.x+region.max.x)/2),y:Math.floor((region.min.y+region.max.y)/2)},min:{...region.min},max:{...region.max}};
 });
}
export function activeMissionMarkers(markers:readonly MissionMarker[],mission:PlayerSnapshot['mission']):MissionMarker[]{
 if(!mission)return [];
 return markers.filter(marker=>!marker.objective||mission.objectives.some(objective=>objective.id===marker.objective&&!objective.failure&&!objective.complete));
}
