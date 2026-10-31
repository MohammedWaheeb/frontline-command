import type {MouseEvent} from 'react';
import type {KeyChord} from '../../runtime/keybindings';
import {Icon} from '../primitives';
import {shortcutBadgeLabel,shortcutLabel} from '../shortcut-presentation';
import {tipHandlers,useTrayTip,type TrayTip} from './TrayTooltip';

/** One socket of the 4×3 command card: icon first, bound keycap bottom-right,
 * optional brass cost tab top-left and an LED for one-key toggles. The label
 * stays in the accessible name; at small tiers it is visually hidden and the
 * tooltip carries it. */
export interface CardKeyProps {
 icon:string;label:string;stateText?:string;keycap?:KeyChord;ariaShortcuts?:string;cost?:string;
 active?:boolean;pressed?:boolean;led?:'on'|'off'|'mixed';disabled?:boolean;quiet?:boolean;
 tip:TrayTip;onClick:(event:MouseEvent<HTMLButtonElement>)=>void;className?:string;
}
export function CardKey({icon,label,stateText,keycap,ariaShortcuts,cost,active,pressed,led,disabled,quiet,tip,onClick,className=''}:CardKeyProps){
 const api=useTrayTip();
 return <button type="button" className={`card-key ${active?'active':''} ${className}`} data-quiet={quiet||undefined} disabled={disabled} aria-pressed={pressed} aria-keyshortcuts={disabled?undefined:ariaShortcuts} onClick={onClick} {...tipHandlers(api,{...tip,keycap:tip.keycap??keycap})}>
  <Icon id={icon}/>
  <span className="card-label">{label}{stateText&&<span className="hud-vh">: {stateText}</span>}</span>
  {led&&<i className="card-led" data-led={led} aria-hidden="true"/>}
  {cost&&<b className="card-cost" aria-hidden="true">{cost}</b>}
  {keycap&&<kbd aria-hidden="true" title={shortcutLabel(keycap)}>{shortcutBadgeLabel(keycap)}</kbd>}
 </button>;
}
/** A recessed socket with no action: positions stay stable across selections. */
export function EmptySocket(){return <span className="card-socket" aria-hidden="true"/>}
