// Menu kit: the mode-screen seam. MenuShell provides the context; screens render <FooterActionBar>
// anywhere and it portals into the shell's fixed (non-scrolling) footer.
import {createContext,useContext,useLayoutEffect,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Button,type ButtonVariant} from './Button';
import {KitIcon as Icon} from './icon';

export interface MenuScreenContextValue{
 /** The shell footer element (null until mounted, or outside the shell). */
 footerHost:HTMLElement|null;
 /** Return to the main menu (patch({page:'command'})). */
 back:()=>void;
 /** Called by FooterActionBar so the shell hides its default Back-only footer. Returns a release function. */
 claimFooter:()=>()=>void;
 /** Called by useScreenFill: the screen body becomes exactly the viewport height so the screen scrolls its own wells. */
 claimFill?:()=>()=>void;
}
export const MenuScreenContext=createContext<MenuScreenContextValue|null>(null);
/** Shell services for a mode screen, or null when rendered outside MenuShell (e.g. in-game Options). */
export function useMenuScreen(){return useContext(MenuScreenContext)}
/**
 * Kit "fill screen" option: while mounted (and enabled), the shell's screen body is sized to the
 * available height (`.fcm-screen-inner[data-fill]`), so the screen lays out internal scroll wells
 * instead of growing the page. No-op outside MenuShell (e.g. the in-game Options modal).
 */
export function useScreenFill(enabled=true){
 const screen=useMenuScreen(),claim=screen?.claimFill;
 useLayoutEffect(()=>enabled&&claim?claim():undefined,[claim,enabled]);
}

export interface FooterAction{
 label:ReactNode;
 onClick:()=>void;
 disabled?:boolean;
 busy?:boolean;
 icon?:string;
 /** Extra accessible context; it must contain the visible label (WCAG 2.5.3 label in name). */
 ariaLabel?:string;
 title?:string;
 variant?:ButtonVariant;
}
export interface FooterActionBarProps{
 /** One-line context in the middle (rules · credits · countdown). Player language, 13px+. */
 summary?:ReactNode;
 /** Shown instead of the summary while the primary is disabled, e.g. "Add at least one opponent". */
 disabledReason?:ReactNode;
 /** The single amber action, always at the far right. */
 primary?:FooterAction;
 /** Extra actions placed left of the primary (secondary keys). */
 actions?:ReadonlyArray<FooterAction>;
 /** Free-form content left of the actions (e.g. a Ready toggle). */
 secondary?:ReactNode;
 /** false hides Back. Default: shell back to the main menu. */
 back?:boolean;
 /** Disable Back while a request is in flight (e.g. a lobby host operation). */
 backDisabled?:boolean;
 onBack?:()=>void;
 backLabel?:string;
 className?:string;
}
/**
 * Fixed bottom action bar of a mode screen: Back left, summary middle, primary right.
 * Inside MenuShell it portals into the shell footer (never scrolls with the body); elsewhere it renders inline.
 */
export function FooterActionBar({summary,disabledReason,primary,actions=[],secondary,back=true,backDisabled=false,onBack,backLabel='Back',className=''}:FooterActionBarProps){
 const screen=useMenuScreen();
 useLayoutEffect(()=>screen?.claimFooter(),[screen]);
 const blocked=!!primary?.disabled&&!!disabledReason;
 const bar=<div className={`fcm-footer${className?` ${className}`:''}`} role="group" aria-label="Screen actions">
  {back&&<Button variant="ghost" icon="i-chevron-left" className="fcm-footer-back" disabled={backDisabled} onClick={onBack??screen?.back}>{backLabel}</Button>}
  <div className={`fcm-footer-summary${blocked?' is-blocked':''}`} aria-live="polite">{blocked?<><Icon id="i-alert"/><span>{disabledReason}</span></>:summary}</div>
  <div className="fcm-footer-actions">
   {secondary}
   {actions.map((action,index)=><Button key={index} variant={action.variant??'secondary'} icon={action.icon} busy={action.busy} disabled={action.disabled} aria-label={action.ariaLabel} title={action.title} onClick={action.onClick}>{action.label}</Button>)}
   {primary&&<Button variant={primary.variant??'primary'} size="lg" icon={primary.icon} trailingIcon={primary.variant&&primary.variant!=='primary'?undefined:'i-chevron-right'} busy={primary.busy} disabled={primary.disabled} aria-label={primary.ariaLabel} title={primary.title??(blocked&&typeof disabledReason==='string'?disabledReason:undefined)} onClick={primary.onClick} className="fcm-footer-primary">{primary.label}</Button>}
  </div>
 </div>;
 return screen?.footerHost?createPortal(bar,screen.footerHost):bar;
}

export interface ColumnsProps{
 /** Left column (e.g. map panel). */
 left:ReactNode;
 right:ReactNode;
 /** Left column width rule. Default 'clamp(400px, 38%, 560px)' × scale. */
 leftWidth?:string;
 className?:string;
}
/** Two independent scroll columns that stack when the effective viewport is narrow. */
export function Columns({left,right,leftWidth,className=''}:ColumnsProps){
 return <div className={`fcm-columns${className?` ${className}`:''}`} style={leftWidth?{['--fcm-left' as string]:leftWidth}:undefined}><div className="fcm-col fcm-col--left">{left}</div><div className="fcm-col fcm-col--right">{right}</div></div>;
}
