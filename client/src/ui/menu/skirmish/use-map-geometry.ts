// Presentation-only battlefield geography for the skirmish preview. The launch path
// still loads and validates the map through ContentLibrary; this read never decides
// placement, pathing or setup validity, and it avoids toggling the global busy state.
import {useEffect,useState} from 'react';
import type {GameMap} from '../../../runtime/types';

const cache=new Map<string,Promise<GameMap>>();
const isPoint=(value:unknown):value is {x:number;y:number}=>!!value&&typeof value==='object'&&typeof (value as {x?:unknown}).x==='number'&&typeof (value as {y?:unknown}).y==='number';

function shaped(value:unknown):GameMap{
 const map=value as Partial<GameMap>;
 if(!map||typeof map!=='object'||!Number.isInteger(map.width)||!Number.isInteger(map.height)||!Array.isArray(map.tiles)||map.tiles.length!==map.width!*map.height!||!Array.isArray(map.spawns)||!map.spawns.every(spawn=>isPoint(spawn?.position))||!isPoint(map.shipment))throw new Error('Map preview unavailable');
 return {...map,fields:Array.isArray(map.fields)?map.fields.filter(field=>isPoint(field?.position)):[],stations:Array.isArray(map.stations)?map.stations.filter(station=>isPoint(station?.position)):[]} as GameMap;
}

export function loadMapGeometry(url:string):Promise<GameMap>{
 let pending=cache.get(url);
 if(!pending){pending=fetch(url,{credentials:'omit'}).then(response=>{if(!response.ok)throw new Error('Map preview unavailable');return response.json()}).then(shaped);pending.catch(()=>cache.delete(url));cache.set(url,pending)}
 return pending;
}

export function useMapGeometry(url:string|undefined){
 const [state,setState]=useState<{url?:string;map?:GameMap;error?:string}>({});
 useEffect(()=>{if(!url)return;let live=true;loadMapGeometry(url).then(map=>{if(live)setState({url,map})},()=>{if(live)setState({url,error:'Map preview unavailable'})});return()=>{live=false}},[url]);
 return state.url===url?state:{};
}

export interface MapFacts {size:string;fields:number;stations:number;tags:string[]}
/** Facts computed from geography, never invented. */
export function mapFacts(map:GameMap):MapFacts{
 let water=0,high=0,cover=0;
 for(const tile of map.tiles){if(tile.terrain==='water')water++;if((tile.height??0)>0||tile.terrain==='cliff')high++;if(tile.terrain==='cover'||tile.terrain==='rubble'||tile.terrain==='forest')cover++}
 const total=map.tiles.length,tags:string[]=[];
 if(water/total>0.02)tags.push('Water crossings');if(high/total>0.03)tags.push('High ground');if(cover/total>0.02)tags.push('Cover and rubble');
 const area=map.width*map.height;
 return {size:`${area>=160*160?'Large':area>=128*128?'Medium':'Compact'} · ${map.width}×${map.height}`,fields:map.fields.length,stations:map.stations?.length??0,tags};
}
