// Menu shell (menu-shell lane): home layout vs mode-screen template.
// Home = command bay + utility bar over the key art. Mode screen = top bar (home key, group tabs,
// sound/options/help) + scrolling body + fixed footer host that <FooterActionBar> portals into.
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {Application} from '../../app/application';
import {useObservable} from '../../app/store';
import {MenuDiorama} from '../MenuDiorama';
import {CommanderPendingRecords} from '../CommanderProgress';
import {MenuFocus} from './menu-focus';
import {HomeMenu} from './HomeMenu';
import {ScreenRouter} from './screen-router';
import {SoundToggle} from './SoundToggle';
import {KitIcon,MenuScreenContext,Button,type MenuScreenContextValue} from './kit';
import {groupEntries,groupTitle,menuEntry} from './menu-model';

const NARROW_EFFECTIVE_WIDTH=1060;
function uiScale(){return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fc-ui-scale'))||1}
function reducedMotion(){return document.documentElement.dataset.reducedMotion==='true'||document.documentElement.dataset.reducedMotion!=='false'&&matchMedia('(prefers-reduced-motion: reduce)').matches}

/**
 * Sets data-narrow (effective width below 1060 px at the current UI scale) and, on home, steps
 * data-compact 0→5 until the menu list fits; data-overflow=true only if it still cannot fit.
 */
function useShellLayout(shell:React.RefObject<HTMLElement|null>,home:boolean,deps:readonly unknown[]){
 const measure=useCallback(()=>{
  const node=shell.current;if(!node)return;
  node.dataset.narrow=String(node.clientWidth/uiScale()<NARROW_EFFECTIVE_WIDTH);
  if(!home)return;
  const list=node.querySelector<HTMLElement>('.fcm-home-list');if(!list)return;
  let level=0;node.dataset.compact='0';node.dataset.overflow='false';
  while(list.scrollHeight>list.clientHeight&&level<5){level++;node.dataset.compact=String(level)}
  node.dataset.overflow=String(list.scrollHeight>list.clientHeight);
 },[shell,home]);
 useLayoutEffect(()=>{
  measure();const node=shell.current;if(!node)return;
  const observer=new ResizeObserver(()=>measure());observer.observe(node);
  let active=true;void document.fonts?.ready.then(()=>{if(active)measure()});
  return()=>{active=false;observer.disconnect()};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[measure,...deps]);
 return measure;
}

/** Subtle pointer parallax on the key art (±8 px). Off with reduced motion. */
function useParallax(shell:React.RefObject<HTMLElement|null>,enabled:boolean){
 useEffect(()=>{
  const node=shell.current;if(!node||!enabled)return;
  let frame=0,x=0,y=0;
  const apply=()=>{frame=0;node.style.setProperty('--fcm-px',`${x.toFixed(1)}px`);node.style.setProperty('--fcm-py',`${y.toFixed(1)}px`)};
  const move=(event:PointerEvent)=>{if(reducedMotion())return;x=-(event.clientX/innerWidth-.5)*16;y=-(event.clientY/innerHeight-.5)*10;if(!frame)frame=requestAnimationFrame(apply)};
  node.addEventListener('pointermove',move);
  return()=>{node.removeEventListener('pointermove',move);if(frame)cancelAnimationFrame(frame);node.style.removeProperty('--fcm-px');node.style.removeProperty('--fcm-py')};
 },[shell,enabled]);
}

export function MenuShell({app}:{app:Application}){
 const state=useObservable(app.state),entry=menuEntry(state.page),home=state.page==='command'||!entry;
 const shell=useRef<HTMLElement>(null),focus=useRef(new MenuFocus());
 useLayoutEffect(()=>{if(shell.current)focus.current.enter(shell.current,state.page,home)},[state.page,home]);
 const rememberFocus=(event:React.SyntheticEvent<HTMLElement>)=>{if(home&&shell.current)focus.current.remember(shell.current,event.target as HTMLElement)};
 const [footerHost,setFooterHost]=useState<HTMLDivElement|null>(null),[claims,setClaims]=useState(0),[fills,setFills]=useState(0);
 const back=useCallback(()=>app.patch({page:'command'}),[app]);
 const claimFooter=useCallback(()=>{setClaims(count=>count+1);return()=>setClaims(count=>count-1)},[]);
 const claimFill=useCallback(()=>{setFills(count=>count+1);return()=>setFills(count=>count-1)},[]);
 const context=useMemo<MenuScreenContextValue>(()=>({footerHost,back,claimFooter,claimFill}),[footerHost,back,claimFooter,claimFill]);
 const measure=useShellLayout(shell,home,[state.page,state.settings.uiScale,state.index]);
 useParallax(shell,home);
 // Esc returns home from any mode screen (not while a dialog, text field or key capture owns it).
 useEffect(()=>{
  if(home)return;
  const key=(event:KeyboardEvent)=>{
   if(event.key!=='Escape'||event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey)return;
   if(document.querySelector('[role="dialog"],[role="alertdialog"]'))return;
   const target=event.target as HTMLElement|null;if(target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
   event.preventDefault();back();
  };
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[home,back]);
 const backdrop=<div className="fcm-backdrop" aria-hidden="true"><MenuDiorama generation={state.index}/></div>;
 if(home)return <main ref={shell} onFocusCapture={rememberFocus} onClickCapture={rememberFocus} className="fcm-shell fcm-shell--home" data-compact="0">
  {backdrop}
  <div className="fcm-corner"><SoundToggle app={app}/></div>
  <div className="fcm-home-records"><CommanderPendingRecords app={app}/></div>
  <HomeMenu app={app} onLayoutChange={measure}/>
 </main>;
 const siblings=entry.group==='utility'?[]:groupEntries(entry.group);
 const tool=(page:'settings'|'help')=>{const item=menuEntry(page)!;return <button type="button" className="fcm-tool" aria-label={item.label} title={item.title} aria-current={state.page===page?'page':undefined} onClick={()=>app.patch({page})}><KitIcon id={item.icon}/></button>};
 return <main ref={shell} className={`fcm-shell fcm-shell--screen fcm-group-${entry.group}`} data-page={state.page}>
  {backdrop}
  <header className="fcm-topbar">
   <button type="button" className="fcm-home-key" aria-label="Main menu: Frontline Command" title="Main menu (Esc)" onClick={back}><KitIcon id="i-chevron-left" className="fcm-home-chevron"/><span className="fcm-home-key-mark" aria-hidden="true"><span>Frontline</span><b>Command</b></span></button>
   {siblings.length?<>
     <span className={`fcm-crumb fcm-crumb--${entry.group}`} aria-hidden="true">{groupTitle[entry.group]}<KitIcon id="i-chevron-right"/></span>
     <nav className="fcm-section-nav" aria-label={`${groupTitle[entry.group]} sections`}><ul>{siblings.map(item=><li key={item.page}><button type="button" className="fcm-section-tab" aria-label={item.label} aria-current={item.page===state.page?'page':undefined} onClick={()=>app.patch({page:item.page})}><KitIcon id={item.icon}/><span>{item.title}</span></button></li>)}</ul></nav>
     <h1 tabIndex={-1} className="fcm-sr-only">{entry.title}</h1>
    </>:<h1 tabIndex={-1} className="fcm-screen-title">{entry.title}</h1>}
   <div className="fcm-topbar-tools"><SoundToggle app={app}/>{tool('settings')}{tool('help')}</div>
  </header>
  <MenuScreenContext.Provider value={context}>
   <section className="fcm-screen-body" aria-label={entry.title}>
    <div className="fcm-screen-inner" key={state.page} data-fill={fills>0||undefined}><CommanderPendingRecords app={app}/><ScreenRouter app={app} state={state}/></div>
   </section>
  </MenuScreenContext.Provider>
  <div className="fcm-screen-footer" ref={setFooterHost}>
   {claims===0&&<div className="fcm-footer"><Button variant="ghost" icon="i-chevron-left" className="fcm-footer-back" onClick={back}>Back</Button><div className="fcm-footer-summary"><span className="fcm-footer-hint"><kbd className="fcm-kbd">Esc</kbd>Main menu</span></div><div className="fcm-footer-actions"/></div>}
  </div>
 </main>;
}
