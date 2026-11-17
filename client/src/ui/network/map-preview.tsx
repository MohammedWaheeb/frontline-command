import {useEffect,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import type {NetworkController} from '../../app/network-controller';
import {useObservable} from '../../app/store';
import type {GameMap} from '../../runtime/types';
import '../../styles/skirmish.css';
/** Read-only authorized map geography. This view decides no placement or pathing rules. */
export function NetworkMapPreview({controller,id}:{controller:NetworkController;id:string}){
 const state=useObservable(controller.state),[map,setMap]=useState<GameMap>(),[error,setError]=useState(''),[loadedKey,setLoadedKey]=useState('');
 const key=[id,state.host,state.account?.profile?.id,state.lobby?.revision,state.ownMaps.find(value=>value.id===id)?.revision].join(':');
 useEffect(()=>{let current=true;setMap(undefined);setError('');if(id)void controller.previewMap(id).then(map=>{if(current){setMap(map);setLoadedKey(key)}}).catch(error=>{if(current){setError(error instanceof Error?error.message:'Map preview unavailable');setLoadedKey(key)}});return()=>{current=false}},[controller,key]);
 if(!id)return null;return <MapGeometryPreview map={loadedKey===key?map:undefined} error={loadedKey===key?error:undefined}/>;
}

/** Stylised top-down terrain palette: warm, readable, no UI-blue. */
const TERRAIN:Record<string,string>={open:'#5f5b3d',road:'#8c7f62',water:'#2c4643',rock:'#5e594d',rubble:'#6c5e4a',forest:'#34452b',sand:'#957f50',cover:'#4b5a33',blocked:'#2a261d',cliff:'#3d362c',ramp:'#776b52'};
const shade=(hex:string,amount:number)=>{const value=Number.parseInt(hex.slice(1),16),f=(c:number)=>Math.max(0,Math.min(255,Math.round(c+amount)));return `rgb(${f(value>>16&255)},${f(value>>8&255)},${f(value&255)})`};
const noise=(x:number,y:number)=>{let h=(x*374761393+y*668265263)|0;h=(h^(h>>>13))*1274126177|0;return ((h^(h>>>16))&255)/255};
export interface MapDrawOptions {spawns?:boolean;grid?:boolean;tile?:number}

/** Draw map geography into a canvas sized `width`×`height`, letterboxed. Returns the map rectangle. */
export function drawMapGeometry(context:CanvasRenderingContext2D,map:GameMap,width:number,height:number,options:MapDrawOptions={}){
 const pad=options.tile?0:Math.round(Math.min(width,height)*0.04),scale=Math.min((width-pad*2)/map.width,(height-pad*2)/map.height),left=(width-map.width*scale)/2,top=(height-map.height*scale)/2;
 context.clearRect(0,0,width,height);context.fillStyle='#0b0a09';context.fillRect(0,0,width,height);
 const heightAt=(x:number,y:number)=>map.tiles[Math.max(0,Math.min(map.height-1,y))*map.width+Math.max(0,Math.min(map.width-1,x))]?.height??0;
 for(let index=0;index<map.tiles.length;index++){
  const tile=map.tiles[index],x=index%map.width,y=Math.floor(index/map.width),base=tile.sight_blocker&&tile.terrain==='open'?'#2f3324':TERRAIN[tile.terrain]??TERRAIN.open;
  const h=tile.height??0,relief=(h-heightAt(x-1,y-1))*14,grain=(noise(x,y)-0.5)*7;
  context.fillStyle=shade(base,h*6+relief+grain);context.fillRect(left+x*scale,top+y*scale,Math.ceil(scale),Math.ceil(scale));
 }
 if(options.grid!==false&&scale>=2){context.strokeStyle='rgba(12,10,8,.22)';context.lineWidth=1;context.beginPath();for(let x=16;x<map.width;x+=16){const px=Math.round(left+x*scale)+.5;context.moveTo(px,top);context.lineTo(px,top+map.height*scale)}for(let y=16;y<map.height;y+=16){const py=Math.round(top+y*scale)+.5;context.moveTo(left,py);context.lineTo(left+map.width*scale,py)}context.stroke()}
 const at=(p:{x:number;y:number})=>[left+p.x/1000*scale,top+p.y/1000*scale] as const,unit=Math.max(3,Math.min(width,height)/90);
 const diamond=(p:{x:number;y:number},r:number,fill:string|undefined,stroke:string)=>{const [x,y]=at(p);context.beginPath();context.moveTo(x,y-r);context.lineTo(x+r,y);context.lineTo(x,y+r);context.lineTo(x-r,y);context.closePath();if(fill){context.fillStyle=fill;context.fill()}context.lineWidth=Math.max(1.2,r/3.2);context.strokeStyle=stroke;context.stroke()};
 for(const field of map.fields)diamond(field.position,unit*1.25,'#e8c05a','#1a1206');
 for(const station of map.stations??[])diamond(station.position,unit*1.35,'rgba(20,17,11,.75)','#e2d8bc');
 {const [x,y]=at(map.shipment),r=unit*1.6;context.lineCap='round';context.strokeStyle='#1a1206';context.lineWidth=r*.9;context.beginPath();context.moveTo(x-r,y);context.lineTo(x+r,y);context.moveTo(x,y-r);context.lineTo(x,y+r);context.stroke();context.strokeStyle='#e2a232';context.lineWidth=r*.45;context.stroke()}
 if(options.spawns!==false)map.spawns.forEach((spawn,index)=>{const [x,y]=at(spawn.position),r=Math.max(7,unit*2.4);context.fillStyle='#12130e';context.beginPath();context.arc(x,y,r,0,Math.PI*2);context.fill();context.strokeStyle='#d0ae66';context.lineWidth=1.5;context.stroke();context.fillStyle='#ede6d6';context.font=`bold ${Math.round(r*1.2)}px sans-serif`;context.textAlign='center';context.textBaseline='middle';context.fillText(String(index+1),x,y)});
 return {left,top,scale};
}

export function MapGeometryPreview({map,error}:{map?:GameMap;error?:string}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const node=canvas.current;if(!node||!map)return;const context=node.getContext('2d');if(!context)return;drawMapGeometry(context,map,240,180,{grid:false})},[map]);
 return <figure className="network-map-preview"><canvas ref={canvas} width={240} height={180} aria-label={map?`${map.title} map preview showing ${map.spawns.length} starting positions`:'Loading map preview'}/><figcaption>{error?<span className="network-warning">{error}</span>:map?<><strong>{map.title}</strong><small>{map.width} × {map.height} tiles · {map.spawns.length} starts · v{map.version}</small><small>Gold: supply / shipment · ivory: control stations</small></>:<small>Loading validated map…</small>}</figcaption></figure>;
}

/** One interactive start marker drawn over a MapSurface. Text never relies on colour alone. */
export interface MapSpawnMarker {state:'claimed'|'open'|'unused';text:string;label:string;color?:string;ink?:string;current?:boolean;pulse?:boolean}

/**
 * Responsive square map surface with HTML start markers (focusable buttons positioned
 * over the canvas). Shared by offline skirmish and, when wired, the lobby spawn picker.
 */
export function MapSurface({map,markers,onSpawn,label,className='',status}:{map?:GameMap;markers?:readonly MapSpawnMarker[];onSpawn?:(spawn:number)=>void;label:string;className?:string;status?:string}){
 const canvas=useRef<HTMLCanvasElement>(null),size=map?Math.min(960,Math.max(480,Math.max(map.width,map.height)*6)):480;
 useEffect(()=>{const node=canvas.current;if(!node||!map)return;const context=node.getContext('2d');if(!context)return;drawMapGeometry(context,map,size,size,{spawns:!markers})},[map,size,!!markers]);
 const geometry=map?(()=>{const pad=Math.round(size*0.04),scale=Math.min((size-pad*2)/map.width,(size-pad*2)/map.height);return {left:(size-map.width*scale)/2,top:(size-map.height*scale)/2,scale}})():undefined;
 const keyNav=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{if(!markers||!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key))return;event.preventDefault();const step=event.key==='ArrowRight'||event.key==='ArrowDown'?1:-1,buttons=[...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('.map-surface-spawn')??[])];buttons[(index+step+buttons.length)%buttons.length]?.focus()};
 return <div className={`map-surface ${className}`} role="group" aria-label={label} aria-busy={map?undefined:true}>
  <canvas ref={canvas} width={size} height={size} aria-hidden="true"/>
  {!map&&<span className="map-surface-status">{status??'Surveying battlefield…'}</span>}
  {map&&geometry&&markers?.map((marker,index)=>{const spawn=map.spawns[index];if(!spawn)return null;const style={left:`${(geometry.left+spawn.position.x/1000*geometry.scale)/size*100}%`,top:`${(geometry.top+spawn.position.y/1000*geometry.scale)/size*100}%`,'--spawn-color':marker.color,'--spawn-ink':marker.ink} as CSSProperties;
   return <button key={index} type="button" className={`map-surface-spawn sk-spawn is-${marker.state}${marker.current?' is-current':''}${marker.pulse?' is-pulse':''}`} style={style} disabled={marker.state==='unused'||!onSpawn} aria-label={marker.label} title={marker.label} onClick={()=>onSpawn?.(index+1)} onKeyDown={event=>keyNav(event,index)}><span aria-hidden="true">{marker.text}</span></button>})}
 </div>;
}
