// Records lane (beta revamp): presentation helpers shared by the campaign, archive,
// settings, help and debrief screens. Pure presentation; no gameplay decisions.
import {useEffect,useRef,useState} from 'react';
import type {Difficulty,Faction} from '../../runtime';
import '../../styles/records.css';

/** Player-language difficulty copy (scenario and exercise difficulty). */
export const DIFFICULTY_COPY:Record<Difficulty,{label:string;hint:string}>={
 easy:{label:'Easy',hint:'Lighter enemy pressure and more time to build.'},
 normal:{label:'Normal',hint:'The intended balance for this operation.'},
 hard:{label:'Hard',hint:'Stronger, faster enemy attacks. Little room for error.'},
};
export const DIFFICULTIES:readonly Difficulty[]=['easy','normal','hard'];

/** Guarded per-browser UI memory (remembered tab, faction). Bad or blocked storage never blocks a screen. */
const MEMORY='frontline.records.ui.v1';
type Memory={campaignFaction?:Faction;campaignDifficulty?:Difficulty;trainingDifficulty?:Difficulty;optionsTab?:string;helpTab?:string;recordFaction?:Faction};
export function readRecordsMemory():Memory{try{const raw=localStorage.getItem(MEMORY),value=raw?JSON.parse(raw):{};return value&&typeof value==='object'&&!Array.isArray(value)?value as Memory:{}}catch{return {}}}
export function writeRecordsMemory(change:Memory){try{localStorage.setItem(MEMORY,JSON.stringify({...readRecordsMemory(),...change}))}catch{/* storage blocked: keep the in-memory choice */}}
/** useState mirrored into the guarded records memory. */
export function useRemembered<K extends keyof Memory>(key:K,fallback:NonNullable<Memory[K]>,valid:(value:unknown)=>boolean){
 const [value,setValue]=useState<NonNullable<Memory[K]>>(()=>{const stored=readRecordsMemory()[key];return valid(stored)?stored as NonNullable<Memory[K]>:fallback});
 return [value,(next:NonNullable<Memory[K]>)=>{setValue(next);writeRecordsMemory({[key]:next} as Memory)}] as const;
}

/** "3 min ago", "2 h ago", "Yesterday", or a short date. The absolute time goes in a title. */
export function relativeTime(when:number,now=Date.now()){
 const seconds=Math.max(0,Math.round((now-when)/1000));
 if(seconds<60)return 'Just now';const minutes=Math.round(seconds/60);if(minutes<60)return `${minutes} min ago`;
 const hours=Math.round(minutes/60);if(hours<24)return `${hours} h ago`;const days=Math.round(hours/24);if(days===1)return 'Yesterday';if(days<7)return `${days} days ago`;
 return new Date(when).toLocaleDateString(undefined,{day:'numeric',month:'short',year:new Date(when).getFullYear()===new Date(now).getFullYear()?undefined:'numeric'});
}
export const absoluteTime=(when:number)=>new Date(when).toLocaleString();
/** Whole-second match clock from simulation ticks (20 per second). */
export function matchClock(ticks:number){const s=Math.max(0,Math.floor(ticks/20)),h=Math.floor(s/3600),m=Math.floor(s/60)%60,r=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`}
export function fileSize(bytes:number){return bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(0)} KB`:bytes<1073741824?`${(bytes/1048576).toFixed(1)} MB`:`${(bytes/1073741824).toFixed(1)} GB`}
/** Human key-cap text for a KeyboardEvent code (display only). */
const CODE_LABEL:Record<string,string>={ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Equal:'=',Minus:'−',NumpadAdd:'Num +',NumpadSubtract:'Num −',NumpadMultiply:'Num ×',NumpadDivide:'Num ÷',NumpadEnter:'Num Enter',NumpadDecimal:'Num .',Backquote:'`',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Escape:'Esc',PageUp:'Pg Up',PageDown:'Pg Dn',Delete:'Del',Insert:'Ins',ContextMenu:'Menu'};
const MODIFIER_LABEL:Record<string,string>={ctrl:'Ctrl',shift:'Shift',alt:'Alt',meta:'Cmd'};
export function keyParts(chord:{code:string;modifiers?:readonly string[]}):string[]{const code=chord.code,key=CODE_LABEL[code]??code.replace(/^Key|^Digit/,'').replace(/^Numpad(\d)$/,'Num $1');return [...(chord.modifiers??[]).map(value=>MODIFIER_LABEL[value]??value),key]}
/** Key chord as separate caps: Ctrl + Shift + 1. */
export function Chord({chord}:{chord:{code:string;modifiers?:readonly string[]}}){const parts=keyParts(chord);return <span className="rec-chord">{parts.map((part,index)=><span key={index} className="rec-chord-part">{index>0&&<i aria-hidden="true">+</i>}<kbd className="rec-kbd">{part}</kbd></span>)}</span>}

/** Generated top-down preview for the curated battlefields (assets-api.md); undefined for scenario layouts. */
const PREVIEW_MAPS=new Set(['copper-junction','industrial-valley','port-outskirts','relay-heights','dry-river','border-depots','convoy-union','twin-outposts']);
export function mapPreviewURL(mapID:string|undefined,size:'256'|'full'='256'){if(!mapID||!PREVIEW_MAPS.has(mapID))return undefined;const slug=mapID.replaceAll('-','_');return `/art/maps/${slug}/${size==='256'?'preview-256':'preview'}.png`}

/** Small JSON fetch cache for public presentation data (mission presentation, map surveys). */
const cache=new Map<string,Promise<unknown>>();
function fetchJSON<T>(url:string):Promise<T>{let request=cache.get(url);if(!request){request=fetch(url).then(response=>{if(!response.ok)throw Error(`HTTP ${response.status}`);return response.json()});request.catch(()=>cache.delete(url));cache.set(url,request)}return request as Promise<T>}
export function useJSON<T>(url:string|undefined){
 const [state,setState]=useState<{url?:string;value?:T;failed?:boolean}>({});
 useEffect(()=>{if(!url)return;let active=true;void fetchJSON<T>(url).then(value=>{if(active)setState({url,value})}).catch(()=>{if(active)setState({url,failed:true})});return()=>{active=false}},[url]);
 return state.url===url?state:{};
}
export interface MissionPresentation{operation?:string;theater?:string;lesson?:string;objectives?:Array<{id:string;kind:'primary'|'optional'|'failure'|string;text:string}>}

/** Public map layout subset used for the terrain survey. Presentation only: never validated or played. */
/** Quiet, validated map read for previews (Application.peekMap: checksum + Go validation, no loading screen). */
export function usePeekedMap(app:{peekMap:(id:string,signal?:AbortSignal)=>Promise<{map:unknown}>},id:string|undefined){
 const [state,setState]=useState<{id?:string;map?:SurveyMap;failed?:boolean}>({});
 useEffect(()=>{if(!id)return;const controller=new AbortController();let active=true;
  app.peekMap(id,controller.signal).then(loaded=>{if(active)setState({id,map:loaded.map as SurveyMap})},()=>{if(active)setState({id,failed:true})});
  return()=>{active=false;controller.abort()}},[app,id]);
 return state.id===id?{value:state.map,failed:!!state.failed}:{value:undefined,failed:false};
}
export interface SurveyMap{width:number;height:number;tiles:Array<{terrain:string;height?:number}>;spawns?:Array<{position:{x:number;y:number};team?:number}>;fields?:Array<{position:{x:number;y:number}}>}
const TERRAIN:Record<string,[number,number,number]>={open:[121,108,72],rough:[96,92,62],road:[150,138,96],forest:[62,78,46],water:[46,60,62],cliff:[70,66,54],ramp:[160,144,98],cover:[92,96,60],urban:[120,116,98],blocked:[48,46,40],rubble:[112,104,86]};
/** Terrain survey canvas with numbered starts. Draws a GameMap or a public layout JSON. */
export function TerrainSurvey({map,label,showSpawns=true,className=''}:{map:SurveyMap;label:string;showSpawns?:boolean;className?:string}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const context=canvas.current?.getContext('2d');if(!context||!map.width||!map.height)return;const data=context.createImageData(map.width,map.height);
  for(let index=0;index<map.tiles.length;index++){const tile=map.tiles[index],rgb=TERRAIN[tile.terrain]??[110,104,74],x=index%map.width,y=Math.floor(index/map.width),lift=(tile.height??0)*9,grain=((x*7+y*13)%5)-2;data.data.set([Math.min(255,rgb[0]+lift+grain),Math.min(255,rgb[1]+lift+grain),Math.min(255,rgb[2]+lift+grain),255],index*4)}
  context.putImageData(data,0,0)},[map]);
 return <div className={`rec-survey ${className}`}><canvas ref={canvas} width={map.width} height={map.height} role="img" aria-label={label}/>
  {map.fields?.map((field,index)=><i key={`f${index}`} className="rec-survey-field" style={{left:`${field.position.x/10/map.width}%`,top:`${field.position.y/10/map.height}%`}} aria-hidden="true"/>)}
  {showSpawns&&map.spawns?.map((spawn,index)=><b key={index} className="rec-survey-spawn" data-team={spawn.team} style={{left:`${spawn.position.x/10/map.width}%`,top:`${spawn.position.y/10/map.height}%`}} aria-hidden="true">{index+1}</b>)}
 </div>;
}
