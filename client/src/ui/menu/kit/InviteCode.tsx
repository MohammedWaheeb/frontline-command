// Menu kit: mono invite/ID readout with a Copy key, and the hover/focus info tip.
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Button} from './Button';

async function copyText(text:string,fallback:HTMLInputElement|null){
 try{await navigator.clipboard.writeText(text);return true}catch{
  if(!fallback)return false;
  try{fallback.focus();fallback.select();return document.execCommand('copy')}catch{return false}
 }
}

export interface InviteCodeProps{
 value:string;
 /** Visible caption. */
 label?:ReactNode;
 /** aria-label of the readonly input. Keep 'Current lobby ID' / 'Current access code' for tests. */
 inputLabel:string;
 /** Text placed on the clipboard (e.g. controller.inviteText()); defaults to value. */
 copyValue?:string;
 copyLabel?:string;
 /** Accessible name of the copy button; default `Copy ${inputLabel}`. */
 copyAriaLabel?:string;
 onCopied?:()=>void;
 className?:string;
}
/** Readonly mono code + Copy. Announces "Copied" politely. */
export function InviteCode({value,label,inputLabel,copyValue,copyLabel='Copy',copyAriaLabel,onCopied,className=''}:InviteCodeProps){
 const input=useRef<HTMLInputElement>(null),[state,setState]=useState<'idle'|'copied'|'failed'>('idle');
 useEffect(()=>{if(state==='idle')return;const timer=setTimeout(()=>setState('idle'),2200);return()=>clearTimeout(timer)},[state]);
 return <div className={`fcm-invite${className?` ${className}`:''}`}>
  {label&&<span className="fcm-invite-label">{label}</span>}
  <div className="fcm-invite-row">
   <input ref={input} className="fcm-invite-input" readOnly value={value} aria-label={inputLabel} onFocus={event=>event.currentTarget.select()}/>
   <Button size="sm" icon={state==='copied'?'i-check':'i-copy'} aria-label={copyAriaLabel??`Copy ${inputLabel}`} disabled={!value} onClick={()=>void copyText(copyValue??value,input.current).then(ok=>{setState(ok?'copied':'failed');if(ok)onCopied?.()})}>{state==='copied'?'Copied':copyLabel}</Button>
  </div>
  <span className="fcm-sr-only" role="status">{state==='copied'?'Copied to clipboard':state==='failed'?'Copy failed. Select the code and copy it manually.':''}</span>
 </div>;
}

export interface InfoTipProps{
 /** Accessible name of the ⓘ button, e.g. "About AI difficulty". */
 label:string;
 children:ReactNode;
 side?:'top'|'bottom'|'left'|'right';
 className?:string;
}
/** ⓘ with hover and focus content. Replaces inline jargon <small>s. Escape closes. */
export function InfoTip({label,children,side='top',className=''}:InfoTipProps){
 const id=useId(),[open,setOpen]=useState(false),[pinned,setPinned]=useState(false);
 const shown=open||pinned;
 return <span className={`fcm-infotip fcm-infotip--${side}${shown?' is-open':''}${className?` ${className}`:''}`} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
  <button type="button" className="fcm-infotip-button" aria-label={label} aria-describedby={id} aria-expanded={shown} onFocus={()=>setOpen(true)} onBlur={()=>{setOpen(false);setPinned(false)}} onClick={()=>setPinned(value=>!value)} onKeyDown={event=>{if(event.key==='Escape'&&shown){event.preventDefault();event.stopPropagation();setOpen(false);setPinned(false)}}}>i</button>
  <span role="tooltip" id={id} className="fcm-infotip-bubble" hidden={!shown}>{children}</span>
 </span>;
}
