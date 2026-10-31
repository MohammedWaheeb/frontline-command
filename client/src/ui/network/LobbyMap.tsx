// Lobby battlefield panel (Lane E): crisp terrain, resources and team-coloured start markers.
// Read-only geography from controller.previewMap; the Go host still validates every start.
import {useEffect,useRef,useState} from 'react';
import type {NetworkController,NetworkLobbySlot} from '../../app/network-controller';
import {useObservable} from '../../app/store';
import type {GameMap} from '../../runtime/types';
import type {TeamPaletteScheme} from '../../design/team-colors';
import {colorCss} from './kit';

const TERRAIN:Record<string,string>={open:'#4a4a33',road:'#857a60',water:'#24403a',rock:'#5a564b',rubble:'#605645',forest:'#283624',sand:'#8f7a4a',cover:'#6b6f41',blocked:'#1f2018'};
const COMPASS=(x:number,y:number,w:number,h:number)=>{const v=y<h/3?'north':y>h*2/3?'south':'',u=x<w/3?'west':x>w*2/3?'east':'';return v&&u?`${v}-${u}`:v||u||'centre'};

/** Shared by Host modal and Lobby. `onClaim` makes free markers clickable for the viewer's own slot. */
export function LobbyMap({controller,mapId,slots,palette,onClaim,compact=false}:{controller:NetworkController;mapId:string;slots:readonly NetworkLobbySlot[];palette:TeamPaletteScheme;onClaim?:(spawn:number)=>void;compact?:boolean}){
 const state=useObservable(controller.state),[map,setMap]=useState<GameMap>(),[error,setError]=useState(''),canvas=useRef<HTMLCanvasElement>(null);
 const key=[mapId,state.host,state.account?.profile?.id,state.lobby?.map_id===mapId?state.lobby.map_hash:''].join(':');
 useEffect(()=>{let live=true;setMap(undefined);setError('');if(mapId)void controller.previewMap(mapId).then(value=>{if(live)setMap(value)}).catch(reason=>{if(live)setError(reason instanceof Error?reason.message:'Map preview unavailable.')});return()=>{live=false}},[controller,key]);
 useEffect(()=>{
  const node=canvas.current;if(!node||!map)return;const context=node.getContext('2d');if(!context)return;
  const W=node.width,H=node.height,sx=W/map.width,sy=H/map.height;context.clearRect(0,0,W,H);
  for(let index=0;index<map.tiles.length;index++){const tile=map.tiles[index];context.fillStyle=tile.sight_blocker?'#1e2119':TERRAIN[tile.terrain]??TERRAIN.open;context.fillRect(Math.floor(index%map.width*sx),Math.floor(Math.floor(index/map.width)*sy),Math.ceil(sx)+1,Math.ceil(sy)+1)}
  // Gentle vignette so markers read over bright sand.
  const shade=context.createRadialGradient(W/2,H/2,Math.min(W,H)*.3,W/2,H/2,Math.max(W,H)*.75);shade.addColorStop(0,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(0,0,0,.35)');context.fillStyle=shade;context.fillRect(0,0,W,H);
  const at=(p:{x:number;y:number})=>[p.x/1000*sx,p.y/1000*sy] as const,r=Math.max(4,W/80);
  const diamond=(x:number,y:number,size:number,fill:string,stroke?:string)=>{context.beginPath();context.moveTo(x,y-size);context.lineTo(x+size,y);context.lineTo(x,y+size);context.lineTo(x-size,y);context.closePath();if(stroke){context.lineWidth=2;context.strokeStyle='#0b0a09';context.stroke();context.strokeStyle=stroke;context.lineWidth=1.5;context.stroke()}else{context.fillStyle=fill;context.fill();context.lineWidth=1.5;context.strokeStyle='#0b0a09';context.stroke()}};
  for(const field of map.fields){const [x,y]=at(field.position);diamond(x,y,r,'#E8C05A')}
  for(const station of map.stations??[]){const [x,y]=at(station.position);diamond(x,y,r*1.1,'',`#D7CBA8`)}
  const [qx,qy]=at(map.shipment);context.fillStyle='#E2A232';context.strokeStyle='#0b0a09';context.lineWidth=1.5;context.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rad=i%2?r*.6:r*1.5;context.lineTo(qx+Math.cos(a)*rad,qy+Math.sin(a)*rad)}context.closePath();context.fill();context.stroke();
 },[map]);
 const width=480,height=map?Math.round(width*map.height/map.width):360;
 const owner=(index:number)=>slots.find(slot=>slot.spawn===index+1);
 const label=map?`${map.title} map preview, ${map.spawns.length} starting positions`+map.spawns.map((spawn,index)=>{const slot=owner(index);return `, position ${index+1} ${COMPASS(spawn.position.x/1000,spawn.position.y/1000,map.width,map.height)}${slot?` ${slot.name}`:''}`}).join(''):'Loading map preview';
 return <figure className={`network-map-preview mp-map ${compact?'compact':''}`}>
  <div className="mp-map-frame" style={{aspectRatio:`${width} / ${height}`}}>
   <canvas ref={canvas} width={width} height={height} role="img" aria-label={label}/>
   {map?.spawns.map((spawn,index)=>{const slot=owner(index),free=!slot,claim=free&&onClaim,style={left:`${spawn.position.x/1000/map.width*100}%`,top:`${spawn.position.y/1000/map.height*100}%`,...(slot?{'--spawn-color':colorCss(slot.color,palette)}:{})} as React.CSSProperties;
    const text=`Start ${index+1}${slot?`: ${slot.name}`:': open'}`;
    return claim?<button key={index} type="button" className="mp-spawn" data-free="true" style={style} title={`${text} — click to take this start`} aria-label={`Take start position ${index+1}`} onClick={()=>onClaim(index+1)}>{index+1}</button>
     :<span key={index} className="mp-spawn" data-free={free||undefined} style={style} title={text} aria-hidden="true">{index+1}{slot&&!compact&&<em>{slot.name}</em>}</span>})}
   {!map&&<span className="mp-map-loading">{error||'Loading battlefield…'}</span>}
  </div>
  <figcaption>{map?<><strong>{map.title}</strong><small>{map.width} × {map.height} tiles · {map.spawns.length} starts · {map.fields.length} supply fields{map.stations?.length?` · ${map.stations.length} control stations`:''}</small><span className="mp-legend" aria-hidden="true"><i data-k="supply"/>Supply<i data-k="station"/>Station<i data-k="shipment"/>Shipment</span></>:<small>{error?'Preview unavailable':'Validating battlefield…'}</small>}</figcaption>
 </figure>;
}
