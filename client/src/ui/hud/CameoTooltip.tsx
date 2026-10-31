// Rich styled tooltip for sidebar cameos, tabs and utility keys (hud-sidebar lane).
// It appears on hover after 250 ms and at once on keyboard focus. Once one tip is
// showing, moving to another switches immediately. Escape hides it. The tip
// docks to the LEFT of the sidebar so it never covers the build grid.
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ReactNode,type FocusEvent,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import type {CameoTip} from './sidebar-model';
import {Icon} from '../primitives';
import {modalOpen} from '../../runtime/keybindings';

export interface TipAnchor {id:string;top:number;bottom:number;left:number;content:ReactNode}
/** One tooltip channel per sidebar. Returns props for triggers plus the rendered tip. */
export function useSidebarTooltip(tipId:string){
 const [tip,setTip]=useState<TipAnchor>(),timer=useRef(0),warm=useRef(false),cool=useRef(0);
 const hide=useCallback(()=>{clearTimeout(timer.current);setTip(undefined);clearTimeout(cool.current);cool.current=window.setTimeout(()=>{warm.current=false},400)},[]);
 useEffect(()=>{if(!tip)return;const key=(event:KeyboardEvent)=>{if(modalOpen())return;if(event.key==='Escape'){event.stopPropagation();hide()}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true)},[tip,hide]);
 useEffect(()=>()=>{clearTimeout(timer.current);clearTimeout(cool.current)},[]);
 const show=useCallback((element:HTMLElement,id:string,content:ReactNode,immediate:boolean)=>{
  clearTimeout(timer.current);clearTimeout(cool.current);
  const open=()=>{const rect=element.getBoundingClientRect();warm.current=true;setTip({id,top:rect.top,bottom:rect.bottom,left:rect.left,content})};
  if(immediate||warm.current)open();else timer.current=window.setTimeout(open,250);
 },[]);
 const trigger=useCallback((id:string,content:()=>ReactNode)=>({
  onPointerEnter:(event:PointerEvent<HTMLElement>)=>{if(event.pointerType!=='touch')show(event.currentTarget,id,content(),false)},
  onPointerLeave:hide,
  onFocus:(event:FocusEvent<HTMLElement>)=>{if(event.currentTarget.matches(':focus-visible'))show(event.currentTarget,id,content(),true)},
  onBlur:hide,
  'aria-describedby':tip?.id===id?tipId:undefined,
 }),[show,hide,tip?.id,tipId]);
 return {tip,trigger,hide};
}

export function SidebarTooltip({tip,tipId}:{tip:TipAnchor|undefined;tipId:string}){
 const node=useRef<HTMLDivElement>(null),[top,setTop]=useState(0);
 useLayoutEffect(()=>{if(!tip||!node.current)return;const h=node.current.offsetHeight,margin=8;setTop(Math.max(margin,Math.min(window.innerHeight-h-margin,tip.top)))},[tip]);
 if(!tip)return null;
 return createPortal(<div ref={node} id={tipId} role="tooltip" className="hud-tip" style={{top}}>{tip.content}</div>,document.body);
}

const REQUIREMENT_HINT:Record<string,string>={missing:'build one',unfinished:'finish it',disabled:'power it on',unavailable:'unavailable',unknown:'host check'};
export function CameoTipBody({tip,hotkey}:{tip:CameoTip;hotkey?:string}){
 return <>
  <header className="hud-tip-head"><strong>{tip.name}</strong>{hotkey&&<kbd>{hotkey}</kbd>}</header>
  <p className="hud-tip-stats"><span className="hud-tip-cost"><b>{tip.cost}</b> credits</span>{tip.seconds!==undefined&&<span><b>{Math.floor(tip.seconds/60)}:{String(tip.seconds%60).padStart(2,'0')}</b> build</span>}{tip.power&&<span className={`hud-tip-power ${tip.power.kind}`}><b>{tip.power.kind==='gain'?'+':'−'}{tip.power.value}</b> power</span>}</p>
  {tip.blocker&&<p className={`hud-tip-blocker ${tip.blocker.tone}`}><Icon id={tip.blocker.tone==='locked'?'i-lock':'i-pause'}/>{tip.blocker.text}</p>}
  {tip.queued>0&&<p className="hud-tip-queue">{tip.progress!==undefined?`In progress · ${Math.floor(tip.progress*100)}%`:''}{tip.progress!==undefined&&tip.queued>1?' · ':''}{tip.queued>1||tip.progress===undefined?`${tip.queued} queued`:''}</p>}
  {(tip.role||tip.strong||tip.effect)&&<dl className="hud-tip-role">
   {tip.role&&<><dt>Role</dt><dd>{tip.role}</dd></>}
   {tip.effect&&<><dt>Effect</dt><dd>{tip.effect}</dd></>}
   {tip.strong&&<><dt>Strong vs</dt><dd>{tip.strong}</dd></>}
   {tip.weak&&<><dt>Weak vs</dt><dd>{tip.weak}</dd></>}
  </dl>}
  {tip.requirements.length>0&&<div className="hud-tip-req"><span>Requires</span><ul>{tip.requirements.map(requirement=><li key={requirement.name} data-met={requirement.met}><i aria-hidden="true">{requirement.met?'✓':'✗'}</i>{requirement.name}{!requirement.met&&<small> · {REQUIREMENT_HINT[requirement.state]??'missing'}</small>}</li>)}</ul></div>}
  <footer className="hud-tip-help">{tip.help}</footer>
 </>;
}

/** Short tooltip for tabs and utility keys: a title, a key and one line. */
export function KeyTipBody({title,hotkey,line,blocked}:{title:string;hotkey?:string;line?:string;blocked?:string}){
 return <><header className="hud-tip-head"><strong>{title}</strong>{hotkey&&<kbd>{hotkey}</kbd>}</header>{line&&<p className="hud-tip-line">{line}</p>}{blocked&&<p className="hud-tip-blocker waiting">{blocked}</p>}</>;
}
