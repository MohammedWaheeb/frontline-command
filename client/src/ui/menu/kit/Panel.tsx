// Menu kit: plates, section headers, empty states and status chips.
import {useId,type ReactNode} from 'react';
import {KitIcon as Icon} from './icon';

type HeadingLevel=2|3|4;
function Heading({level,id,className,children}:{level:HeadingLevel;id?:string;className:string;children:ReactNode}){
 return level===2?<h2 id={id} className={className}>{children}</h2>:level===4?<h4 id={id} className={className}>{children}</h4>:<h3 id={id} className={className}>{children}</h3>;
}

export interface SectionHeaderProps{
 title:ReactNode;
 /** Small brass caption above the title. Use sparingly; never a generic label like "COMMAND CENTER". */
 eyebrow?:ReactNode;
 /** Right-aligned content: a count, a StatusChip or a small button. */
 aside?:ReactNode;
 level?:HeadingLevel;
 id?:string;
 className?:string;
}
/** Condensed upper-case title with the brass rule under it. */
export function SectionHeader({title,eyebrow,aside,level=3,id,className=''}:SectionHeaderProps){
 return <header className={`fcm-section-header${className?` ${className}`:''}`}>
  <div className="fcm-section-heading">{eyebrow&&<span className="fcm-eyebrow">{eyebrow}</span>}<Heading level={level} id={id} className="fcm-section-title">{title}</Heading></div>
  {aside&&<div className="fcm-section-aside">{aside}</div>}
 </header>;
}

export interface PanelProps{
 title?:ReactNode;
 eyebrow?:ReactNode;
 aside?:ReactNode;
 /** 'plate' = raised gunmetal panel with chamfered corners (default); 'well' = recessed charcoal content well; 'flat' = no frame. */
 tone?:'plate'|'well'|'flat';
 /** Fill the parent's height and scroll the body only (header stays put). */
 fill?:boolean;
 headingLevel?:HeadingLevel;
 className?:string;
 bodyClassName?:string;
 /** Accessible name when there is no visible title. */
 label?:string;
 children?:ReactNode;
}
/** Chamfered gunmetal plate. Replaces .page-panel / .network-block for new screens. */
export function Panel({title,eyebrow,aside,tone='plate',fill=false,headingLevel=3,className='',bodyClassName='',label,children}:PanelProps){
 const id=useId();
 return <section className={`fcm-panel fcm-panel--${tone}${fill?' fcm-panel--fill':''}${className?` ${className}`:''}`} aria-labelledby={title?id:undefined} aria-label={title?undefined:label}>
  {title&&<SectionHeader title={title} eyebrow={eyebrow} aside={aside} level={headingLevel} id={id}/>}
  <div className={`fcm-panel-body${bodyClassName?` ${bodyClassName}`:''}`}>{children}</div>
 </section>;
}

export interface EmptyStateProps{icon?:string;title?:ReactNode;children?:ReactNode;action?:ReactNode;className?:string}
/** Icon, one sentence, one way forward. Never a dead end. */
export function EmptyState({icon='i-info',title,children,action,className=''}:EmptyStateProps){
 return <div className={`fcm-empty${className?` ${className}`:''}`}>
  <span className="fcm-empty-icon" aria-hidden="true"><Icon id={icon}/></span>
  <div className="fcm-empty-copy">{title&&<strong className="fcm-empty-title">{title}</strong>}{children&&<p>{children}</p>}</div>
  {action&&<div className="fcm-empty-action">{action}</div>}
 </div>;
}

export type StatusTone='ok'|'warn'|'danger'|'off'|'busy'|'info';
export interface StatusChipProps{tone?:StatusTone;children:ReactNode;title?:string;className?:string;/** Adds role="status" so changes are announced. */live?:boolean}
/** LED plus short text: host reachability, readiness, install state. The LED shape differs per tone, so state never relies on colour alone. */
export function StatusChip({tone='off',children,title,className='',live=false}:StatusChipProps){
 return <span className={`fcm-chip fcm-chip--${tone}${className?` ${className}`:''}`} title={title} role={live?'status':undefined}><i className="fcm-led" aria-hidden="true"/><span className="fcm-chip-text">{children}</span></span>;
}
