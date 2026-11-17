import {createContext,useCallback,useContext,useEffect,useId,useMemo,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import type {KeyChord} from '../../runtime/keybindings';
import {shortcutLabel} from '../shortcut-presentation';

/** Layered tooltip for the selection tray and command card (research rule 23).
 * L1: title + bound hotkey + cost; L2: one-line hint; L3: muted detail lines.
 * Shown after 250 ms of hover or immediately on keyboard focus; once one tip is
 * up, moving to another key swaps instantly. Escape hides it. The tip body is
 * linked with aria-describedby, so the accessible name stays on the control. */
export interface TrayTip {title:string;keycap?:KeyChord;cost?:string;state?:string;hint?:string;detail?:readonly string[];tone?:'ok'|'warn'|'danger'}
interface Anchor {tip:TrayTip;x:number}
interface TipApi {id:string;show(tip:TrayTip,element:HTMLElement,immediate?:boolean):void;hide():void}
const TipContext=createContext<TipApi|undefined>(undefined);

export function useTrayTip(){return useContext(TipContext)}

/** Props for any control that should show a tray tooltip. */
export function tipHandlers(api:TipApi|undefined,tip:TrayTip){
 if(!api)return {};
 return {
  'aria-describedby':api.id,
  onPointerEnter:(event:{currentTarget:HTMLElement})=>api.show(tip,event.currentTarget),
  onPointerLeave:()=>api.hide(),
  onFocus:(event:{currentTarget:HTMLElement})=>{if(event.currentTarget.matches(':focus-visible'))api.show(tip,event.currentTarget,true)},
  onBlur:()=>api.hide(),
 };
}

export function TrayTooltipLayer({children,frame}:{children:ReactNode;frame:HTMLElement|null}){
 const id=useId(),[anchor,setAnchor]=useState<Anchor>(),timer=useRef<number|undefined>(undefined),visible=useRef(false);
 visible.current=!!anchor;
 const hide=useCallback(()=>{window.clearTimeout(timer.current);setAnchor(undefined)},[]);
 const show=useCallback((tip:TrayTip,element:HTMLElement,immediate=false)=>{
  window.clearTimeout(timer.current);
  const place=()=>{const box=element.getBoundingClientRect(),host=frame?.getBoundingClientRect();setAnchor({tip,x:box.left+box.width/2-(host?.left??0)})};
  if(immediate||visible.current)place();else timer.current=window.setTimeout(place,250);
 },[frame]);
 useEffect(()=>{if(!anchor)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape')hide()};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true)},[anchor,hide]);
 useEffect(()=>()=>window.clearTimeout(timer.current),[]);
 const api=useMemo(()=>({id,show,hide}),[id,show,hide]);
 const tip=anchor?.tip;
 return <TipContext.Provider value={api}>{children}
  <div id={id} role="tooltip" className="tray-tooltip" data-open={!!tip} data-tone={tip?.tone} style={anchor?{'--tip-x':`${anchor.x}px`} as CSSProperties:undefined} aria-hidden={!tip}>
   {tip&&<><header><strong>{tip.title}</strong>{tip.keycap&&<kbd>{shortcutLabel(tip.keycap)}</kbd>}</header>
    {(tip.cost||tip.state)&&<p className="tray-tooltip-meta">{tip.cost&&<span className="tray-tooltip-cost">{tip.cost}</span>}{tip.state&&<span>{tip.state}</span>}</p>}
    {tip.hint&&<p className="tray-tooltip-hint">{tip.hint}</p>}
    {tip.detail?.filter(Boolean).map((line,index)=><p key={index} className="tray-tooltip-detail">{line}</p>)}</>}
  </div>
 </TipContext.Provider>;
}
