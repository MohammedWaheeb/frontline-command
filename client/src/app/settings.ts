import {defaultBindings,validateBindings,type ControlBindings} from '../runtime';

export interface Settings {
 version:1;
 firstRunComplete:boolean;
 language:'en';
 uiScale:number;            // 0.85 – 1.5
 minimapScale:number;       // 0.8 – 1.4
 audioConsent:boolean;
 audio:{master:number;music:number;effects:number;voice:number;ui:number};
 captions:boolean;
 reducedMotion:boolean;
 reducedFlashing:boolean;
 screenShake:number;        // 0 – 1
 palette:'standard'|'cvd_safe';
 healthBars:'always'|'selected'|'damaged';
 keyboardCamera:boolean;
 edgeScroll:boolean;
 scrollSpeed:number;        // 0.4 – 2
 zoomSpeed:number;          // 0.4 – 2
 selectionTolerance:number; // px, 2 – 16
 dragThreshold:number;      // px, 3 – 20
 artQuality:'auto'|'high'|'standard';
 bindings:ControlBindings;
}
export const DEFAULT_SETTINGS:Settings={
 version:1,firstRunComplete:false,language:'en',uiScale:1,minimapScale:1,audioConsent:false,
 audio:{master:0.8,music:0.6,effects:0.8,voice:0.9,ui:0.6},captions:true,reducedMotion:false,reducedFlashing:false,screenShake:0.6,
 palette:'standard',healthBars:'selected',keyboardCamera:true,edgeScroll:false,scrollSpeed:1,zoomSpeed:1,selectionTolerance:6,dragThreshold:6,artQuality:'auto',
 bindings:defaultBindings('standard'),
};
const clamp=(v:unknown,lo:number,hi:number,d:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):d;
/** Accept only known shapes; anything malformed falls back to its default. */
export function sanitizeSettings(value:unknown):Settings{
 const v=(value&&typeof value==='object'?value:{}) as Partial<Settings>,d=DEFAULT_SETTINGS;
 const audio=(v.audio&&typeof v.audio==='object'?v.audio:{}) as Partial<Settings['audio']>;
 let bindings=d.bindings;
 if(v.bindings&&typeof v.bindings==='object'){try{if(validateBindings(v.bindings as ControlBindings).length===0)bindings=structuredClone(v.bindings as ControlBindings)}catch{/* invalid saved bindings keep defaults */}}
 return {
  version:1,firstRunComplete:v.firstRunComplete===true,language:'en',
  uiScale:clamp(v.uiScale,0.85,1.5,d.uiScale),minimapScale:clamp(v.minimapScale,0.8,1.4,d.minimapScale),audioConsent:v.audioConsent===true,
  audio:{master:clamp(audio.master,0,1,d.audio.master),music:clamp(audio.music,0,1,d.audio.music),effects:clamp(audio.effects,0,1,d.audio.effects),voice:clamp(audio.voice,0,1,d.audio.voice),ui:clamp(audio.ui,0,1,d.audio.ui)},
  captions:v.captions!==false,reducedMotion:v.reducedMotion===true,reducedFlashing:v.reducedFlashing===true,screenShake:clamp(v.screenShake,0,1,d.screenShake),
  palette:v.palette==='cvd_safe'?'cvd_safe':'standard',healthBars:v.healthBars==='always'||v.healthBars==='damaged'?v.healthBars:'selected',
  keyboardCamera:v.keyboardCamera!==false,edgeScroll:v.edgeScroll===true,scrollSpeed:clamp(v.scrollSpeed,0.4,2,1),zoomSpeed:clamp(v.zoomSpeed,0.4,2,1),
  selectionTolerance:clamp(v.selectionTolerance,2,16,d.selectionTolerance),dragThreshold:clamp(v.dragThreshold,3,20,d.dragThreshold),
  artQuality:v.artQuality==='high'||v.artQuality==='standard'?v.artQuality:'auto',bindings,
 };
}
const MIRROR='frontline.settings.v1';
/** Synchronous mirror for first paint (scale/motion) before IndexedDB answers. */
export function readSettingsMirror():Settings{try{const raw=localStorage.getItem(MIRROR);return sanitizeSettings(raw?JSON.parse(raw):undefined)}catch{return structuredClone(DEFAULT_SETTINGS)}}
export function writeSettingsMirror(settings:Settings){try{localStorage.setItem(MIRROR,JSON.stringify(settings))}catch{/* storage full: IndexedDB copy still attempted */}}
export function applySettingsToDocument(settings:Settings){
 const root=document.documentElement;
 root.style.setProperty('--fc-ui-scale',String(settings.uiScale));
 root.style.setProperty('--ui-minimap-scale',String(settings.minimapScale));
 root.dataset.motion=settings.reducedMotion?'reduced':'full';
 root.dataset.flashing=settings.reducedFlashing?'reduced':'full';
 root.dataset.palette=settings.palette;
}
