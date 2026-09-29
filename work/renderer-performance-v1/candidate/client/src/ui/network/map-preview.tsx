import {useEffect,useRef,useState} from 'react';
import type {NetworkController} from '../../app/network-controller';
import {useObservable} from '../../app/store';
import type {GameMap} from '../../runtime/types';
/** Read-only authorized map geography. This view decides no placement or pathing rules. */
export function NetworkMapPreview({controller,id}:{controller:NetworkController;id:string}){
 const state=useObservable(controller.state),[map,setMap]=useState<GameMap>(),[error,setError]=useState(''),[loadedKey,setLoadedKey]=useState('');
 const key=[id,state.host,state.account?.profile?.id,state.lobby?.revision,state.ownMaps.find(value=>value.id===id)?.revision].join(':');
 useEffect(()=>{let current=true;setMap(undefined);setError('');if(id)void controller.previewMap(id).then(map=>{if(current){setMap(map);setLoadedKey(key)}}).catch(error=>{if(current){setError(error instanceof Error?error.message:'Map preview unavailable');setLoadedKey(key)}});return()=>{current=false}},[controller,key]);
 if(!id)return null;return <MapGeometryPreview map={loadedKey===key?map:undefined} error={loadedKey===key?error:undefined}/>;
}
export function MapGeometryPreview({map,error}:{map?:GameMap;error?:string}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const node=canvas.current;if(!node||!map)return;const context=node.getContext('2d');if(!context)return;const width=map.width,height=map.height,scale=Math.min(220/width,160/height),left=(240-width*scale)/2,top=(180-height*scale)/2;context.clearRect(0,0,240,180);context.fillStyle='#0b0a09';context.fillRect(0,0,240,180);const colors:Record<string,string>={open:'#494d34',road:'#807660',water:'#253d36',rock:'#59564c',rubble:'#5f5545',forest:'#273523',sand:'#8d794b',cover:'#6b7042',blocked:'#1f2118'};
  for(let index=0;index<map.tiles.length;index++){const tile=map.tiles[index];context.fillStyle=tile.sight_blocker?'#20231b':colors[tile.terrain]??'#494d34';context.fillRect(left+index%width*scale,top+Math.floor(index/width)*scale,Math.ceil(scale),Math.ceil(scale))}
  const dot=(x:number,y:number,color:string,radius:number)=>{context.fillStyle=color;context.beginPath();context.arc(left+x/1000*scale,top+y/1000*scale,radius,0,Math.PI*2);context.fill()};for(const field of map.fields)dot(field.position.x,field.position.y,'#b88b3e',3);for(const station of map.stations??[])dot(station.position.x,station.position.y,'#d0c9ad',3);dot(map.shipment.x,map.shipment.y,'#e2a232',4);
  map.spawns.forEach((spawn,index)=>{dot(spawn.position.x,spawn.position.y,'#12130e',9);context.fillStyle='#ede6d6';context.font='bold 11px sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(String(index+1),left+spawn.position.x/1000*scale,top+spawn.position.y/1000*scale)});
 },[map]);
 return <figure className="network-map-preview"><canvas ref={canvas} width={240} height={180} aria-label={map?`${map.title} map preview showing ${map.spawns.length} starting positions`:'Loading map preview'}/><figcaption>{error?<span className="network-warning">{error}</span>:map?<><strong>{map.title}</strong><small>{map.width} × {map.height} tiles · {map.spawns.length} starts · v{map.version}</small><small>Gold: supply / shipment · ivory: control stations</small></>:<small>Loading validated map…</small>}</figcaption></figure>;
}
