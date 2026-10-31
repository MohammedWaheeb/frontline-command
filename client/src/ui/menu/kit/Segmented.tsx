// Menu kit: segmented radio groups and in-panel tabs (both roving-tabindex, arrow-key driven).
import {useRef,type KeyboardEvent,type ReactNode} from 'react';
import {KitIcon as Icon} from './icon';

/** Arrow/Home/End navigation over enabled siblings; returns the index to activate or undefined. */
function rovingIndex(event:KeyboardEvent,current:number,enabled:boolean[],vertical=false):number|undefined{
 const count=enabled.length;if(!count)return undefined;
 const forward=vertical?'ArrowDown':'ArrowRight',backward=vertical?'ArrowUp':'ArrowLeft';
 let step=0;
 if(event.key===forward||(!vertical&&event.key==='ArrowDown'))step=1;else if(event.key===backward||(!vertical&&event.key==='ArrowUp'))step=-1;
 else if(event.key==='Home'){const first=enabled.indexOf(true);return first<0?undefined:first}
 else if(event.key==='End'){const last=enabled.lastIndexOf(true);return last<0?undefined:last}
 else return undefined;
 for(let i=1;i<=count;i++){const next=(current+step*i+count*count)%count;if(enabled[next])return next}
 return undefined;
}

export interface SegmentedOption<T extends string>{value:T;label:ReactNode;icon?:string;disabled?:boolean;title?:string;ariaLabel?:string}
export interface SegmentedProps<T extends string>{
 /** Accessible name of the radiogroup (e.g. "Difficulty"). */
 label:string;
 value:T;
 options:ReadonlyArray<SegmentedOption<T>>;
 onChange:(value:T)=>void;
 size?:'sm'|'md';
 /** Stretch options to fill the row. */
 block?:boolean;
 disabled?:boolean;
 className?:string;
}
/** 2–5 mutually exclusive choices (difficulty, format, speed). role="radiogroup"; the selected option gets an amber bottom bar (shape cue). */
export function Segmented<T extends string>({label,value,options,onChange,size='md',block=false,disabled=false,className=''}:SegmentedProps<T>){
 const refs=useRef<Array<HTMLButtonElement|null>>([]);
 const enabled=options.map(option=>!disabled&&!option.disabled);
 const selected=Math.max(0,options.findIndex(option=>option.value===value));
 const key=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{const next=rovingIndex(event,index,enabled);if(next===undefined)return;event.preventDefault();refs.current[next]?.focus();onChange(options[next].value)};
 return <div role="radiogroup" aria-label={label} aria-disabled={disabled||undefined} className={`fcm-seg fcm-seg--${size}${block?' fcm-seg--block':''}${className?` ${className}`:''}`}>
  {options.map((option,index)=>{const checked=option.value===value;return <button key={option.value} ref={node=>{refs.current[index]=node}} type="button" role="radio" aria-checked={checked} aria-label={option.ariaLabel} title={option.title} tabIndex={index===selected?0:-1} disabled={!enabled[index]} className={`fcm-seg-option${checked?' is-selected':''}`} onClick={()=>onChange(option.value)} onKeyDown={event=>key(event,index)}>{option.icon&&<Icon id={option.icon}/>}<span>{option.label}</span></button>})}
 </div>;
}

export interface TabItem<T extends string>{id:T;label:ReactNode;icon?:string;/** Small count or dot after the label. */badge?:ReactNode;disabled?:boolean;title?:string}
export interface TabsProps<T extends string>{
 /** Accessible name of the tablist (e.g. "Options sections"). */
 label:string;
 tabs:ReadonlyArray<TabItem<T>>;
 value:T;
 onChange:(value:T)=>void;
 /** Stable prefix shared with <TabPanel idBase>; use useId(). */
 idBase:string;
 /** 'underline' = flat tabs with a 3px amber underline (default); 'vertical' = side rail with a 3px amber left bar. */
 variant?:'underline'|'vertical';
 className?:string;
}
/** WAI-ARIA tabs. Visually distinct from buttons: flat, no key face. */
export function Tabs<T extends string>({label,tabs,value,onChange,idBase,variant='underline',className=''}:TabsProps<T>){
 const refs=useRef<Array<HTMLButtonElement|null>>([]);
 const enabled=tabs.map(tab=>!tab.disabled);
 const selected=Math.max(0,tabs.findIndex(tab=>tab.id===value));
 const key=(event:KeyboardEvent<HTMLButtonElement>,index:number)=>{const next=rovingIndex(event,index,enabled,variant==='vertical');if(next===undefined)return;event.preventDefault();refs.current[next]?.focus();onChange(tabs[next].id)};
 return <div role="tablist" aria-label={label} aria-orientation={variant==='vertical'?'vertical':'horizontal'} className={`fcm-tabs fcm-tabs--${variant}${className?` ${className}`:''}`}>
  {tabs.map((tab,index)=>{const active=tab.id===value;return <button key={tab.id} ref={node=>{refs.current[index]=node}} type="button" role="tab" id={`${idBase}-tab-${tab.id}`} aria-controls={`${idBase}-panel-${tab.id}`} aria-selected={active} tabIndex={index===selected?0:-1} disabled={tab.disabled} title={tab.title} className={`fcm-tab${active?' is-active':''}`} onClick={()=>onChange(tab.id)} onKeyDown={event=>key(event,index)}>{tab.icon&&<Icon id={tab.icon}/>}<span className="fcm-tab-label">{tab.label}</span>{tab.badge!==undefined&&tab.badge!==null&&<span className="fcm-tab-badge">{tab.badge}</span>}</button>})}
 </div>;
}

export interface TabPanelProps{idBase:string;id:string;children?:ReactNode;className?:string}
/** Pair with <Tabs>: render only the active panel, or render all and pass hidden. */
export function TabPanel({idBase,id,children,className=''}:TabPanelProps){
 return <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`} tabIndex={0} className={`fcm-tabpanel${className?` ${className}`:''}`}>{children}</div>;
}
