// Menu kit: team colour choice. Colours come from the shared team palette (tokens), so the
// swatch matches the in-game team mask. Every swatch also carries its slot number and a name,
// so colour is never the only cue.
import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {tokens} from '../../../design/tokens';
import type {TeamPaletteScheme} from '../../../design/team-colors';
import {KitIcon} from './icon';

const NAMES:Record<TeamPaletteScheme,readonly string[]>={
 standard:['Blue','Red','Teal','Orange','Violet','Yellow','Green','White'],
 cvd_safe:['Blue','Vermilion','Bluish green','Orange','Pink','Yellow','Sky blue','White'],
};
/** Public colour slots are 1..8. */
export const TEAM_COLOR_SLOTS=[1,2,3,4,5,6,7,8] as const;
/** CSS colour of a public colour slot (1..8) in the active palette. */
export function teamColorCss(slot:number,palette:TeamPaletteScheme='standard'){return (palette==='cvd_safe'?tokens.color.team.cvd_safe:tokens.color.team.standard)[slot-1]??tokens.color.team.relation.neutral}
/** Player-facing colour name, e.g. "Red". Use instead of "Color slot 2". */
export function teamColorName(slot:number,palette:TeamPaletteScheme='standard'){return NAMES[palette][slot-1]??'Unassigned'}

export interface ColorSwatchPickerProps{
 /** Selected slot 1..8. */
 value:number;
 onChange:(slot:number)=>void;
 palette?:TeamPaletteScheme;
 /** Slots used by other commanders; shown locked and not selectable. */
 taken?:readonly number[];
 /** Accessible group name, e.g. "Commander 2 color". */
 label:string;
 disabled?:boolean;
 /** 'inline' = 8 swatches in a row; 'popover' = one swatch button that opens the grid (slot tables). */
 variant?:'inline'|'popover';
 className?:string;
}
export function ColorSwatchPicker({value,onChange,palette='standard',taken=[],label,disabled=false,variant='inline',className=''}:ColorSwatchPickerProps){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 useEffect(()=>{if(!open)return;const away=(event:PointerEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false)};document.addEventListener('pointerdown',away);return()=>document.removeEventListener('pointerdown',away)},[open]);
 const choose=(slot:number)=>{onChange(slot);if(variant==='popover'){setOpen(false);trigger.current?.focus()}};
 const blocked=(slot:number)=>disabled||slot!==value&&taken.includes(slot);
 const key=(event:KeyboardEvent<HTMLButtonElement>,slot:number)=>{
  if(event.key==='Escape'&&variant==='popover'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();return}
  const step=event.key==='ArrowRight'||event.key==='ArrowDown'?1:event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:0;if(!step)return;event.preventDefault();
  for(let i=1;i<=8;i++){const next=((slot-1+step*i+80)%8)+1;if(!blocked(next)){(root.current?.querySelector(`[data-slot="${next}"]`) as HTMLButtonElement|null)?.focus();choose(next);return}}
 };
 const grid=<div role="radiogroup" aria-label={label} id={id} className="fcm-swatches">
  {TEAM_COLOR_SLOTS.map(slot=>{const checked=slot===value,locked=slot!==value&&taken.includes(slot),name=teamColorName(slot,palette);return <button key={slot} type="button" role="radio" data-slot={slot} aria-checked={checked} aria-label={`${name}${locked?', taken':''}`} title={`${name}${locked?' (taken)':''}`} tabIndex={checked?0:-1} disabled={blocked(slot)} className={`fcm-swatch${checked?' is-selected':''}${locked?' is-taken':''}`} style={{['--fcm-swatch' as string]:teamColorCss(slot,palette)}} onClick={()=>choose(slot)} onKeyDown={event=>key(event,slot)}><span className="fcm-swatch-num" aria-hidden="true">{locked?<KitIcon id="i-lock"/>:slot}</span></button>})}
 </div>;
 if(variant==='inline')return <div ref={root} className={`fcm-swatch-picker${className?` ${className}`:''}`}>{grid}</div>;
 return <div ref={root} className={`fcm-swatch-picker fcm-swatch-picker--popover${open?' is-open':''}${className?` ${className}`:''}`} onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus()}}}>
  <button ref={trigger} type="button" className="fcm-swatch-trigger" aria-label={`${label}: ${teamColorName(value,palette)}`} aria-haspopup="true" aria-expanded={open} aria-controls={open?id:undefined} disabled={disabled} style={{['--fcm-swatch' as string]:teamColorCss(value,palette)}} onClick={()=>setOpen(current=>!current)}><span className="fcm-swatch-chip"><span className="fcm-swatch-num" aria-hidden="true">{value}</span></span><KitIcon id="i-chevron-down" className="fcm-swatch-caret"/></button>
  {open&&<div className="fcm-swatch-popover">{grid}</div>}
 </div>;
}
