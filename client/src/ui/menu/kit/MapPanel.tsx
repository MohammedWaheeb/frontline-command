// Menu kit: battlefield panel shell (preview well, title with cycling, facts, thumbnail strip).
// The owning screen supplies the preview content (map PNG or geometry canvas) and spawn markers.
import {useRef,type KeyboardEvent,type ReactNode} from 'react';
import {KitIcon} from './icon';

export interface MapPanelProps{
 title:ReactNode;
 /** e.g. "2–4 players". */
 subtitle?:ReactNode;
 /** Short facts rendered as a dotted line: ["96×96", "6 supply fields", …]. */
 facts?:ReadonlyArray<ReactNode>;
 /** The square preview content. Overlay spawn markers with <MapMarker>. */
 preview:ReactNode;
 /** Accessible name of the preview frame (role=group, so clickable MapMarkers inside stay reachable). */
 previewLabel?:string;
 onPrev?:()=>void;
 onNext?:()=>void;
 /** Thumbnail strip, usually <MapThumbStrip>. */
 thumbnails?:ReactNode;
 /** Extra content under the facts (e.g. rules). */
 children?:ReactNode;
 className?:string;
}
export function MapPanel({title,subtitle,facts=[],preview,previewLabel,onPrev,onNext,thumbnails,children,className=''}:MapPanelProps){
 return <section className={`fcm-map${className?` ${className}`:''}`} aria-label="Battlefield">
  <div className="fcm-map-frame" role={previewLabel?'group':undefined} aria-label={previewLabel}><div className="fcm-map-preview">{preview}</div><i className="fcm-map-corner tl" aria-hidden="true"/><i className="fcm-map-corner tr" aria-hidden="true"/><i className="fcm-map-corner bl" aria-hidden="true"/><i className="fcm-map-corner br" aria-hidden="true"/></div>
  <div className="fcm-map-titlebar">
   {onPrev&&<button type="button" className="fcm-map-cycle" aria-label="Previous battlefield" onClick={onPrev}><KitIcon id="i-chevron-left"/></button>}
   <div className="fcm-map-titles"><h3 className="fcm-map-title">{title}</h3>{subtitle&&<span className="fcm-map-subtitle">{subtitle}</span>}</div>
   {onNext&&<button type="button" className="fcm-map-cycle" aria-label="Next battlefield" onClick={onNext}><KitIcon id="i-chevron-right"/></button>}
  </div>
  {facts.length>0&&<ul className="fcm-map-facts">{facts.map((fact,index)=><li key={index}>{fact}</li>)}</ul>}
  {thumbnails}
  {children}
 </section>;
}

export interface MapMarkerProps{
 /** Position in percent of the preview (0–100). */
 x:number;y:number;
 /** Slot number or '?' for an unassigned start. */
 label:ReactNode;
 /** Team colour fill; omit for a hollow brass ring (unassigned / Random). */
 color?:string;
 /** Accessible name, e.g. "Start position 2, north-east: claim for commander 1". */
 ariaLabel:string;
 onClick?:()=>void;
 selected?:boolean;
}
/** 28px numbered start marker over the preview; a button when claimable. */
export function MapMarker({x,y,label,color,ariaLabel,onClick,selected=false}:MapMarkerProps){
 const style={left:`${x}%`,top:`${y}%`,['--fcm-marker' as string]:color};
 const classes=`fcm-map-marker${color?' is-filled':''}${selected?' is-selected':''}`;
 return onClick?<button type="button" className={classes} style={style} aria-label={ariaLabel} title={ariaLabel} onClick={onClick}>{label}</button>:<span className={classes} style={style} role="img" aria-label={ariaLabel}>{label}</span>;
}

export interface MapThumbStripProps{label:string;children:ReactNode;className?:string}
/** Radio group of map thumbnails; arrow keys move and select. */
export function MapThumbStrip({label,children,className=''}:MapThumbStripProps){
 const root=useRef<HTMLDivElement>(null);
 const key=(event:KeyboardEvent<HTMLDivElement>)=>{
  const step=event.key==='ArrowRight'||event.key==='ArrowDown'?1:event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:0;if(!step||!root.current)return;
  const items=[...root.current.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')],index=items.indexOf(document.activeElement as HTMLButtonElement);if(index<0)return;
  event.preventDefault();const next=items[(index+step+items.length)%items.length];next.focus();next.click();
 };
 return <div ref={root} role="radiogroup" aria-label={label} className={`fcm-map-thumbs${className?` ${className}`:''}`} onKeyDown={key}>{children}</div>;
}
export interface MapThumbProps{label:string;selected:boolean;onSelect:()=>void;/** Thumbnail image URL (preview-256.png). */image?:string;/** Fallback content when there is no image (e.g. initials). */children?:ReactNode;disabled?:boolean;/** Small caption under the image (shown at ≥1600 wide). */caption?:ReactNode}
export function MapThumb({label,selected,onSelect,image,children,disabled=false,caption}:MapThumbProps){
 return <button type="button" role="radio" aria-checked={selected} aria-label={label} title={label} tabIndex={selected?0:-1} disabled={disabled} className={`fcm-map-thumb${selected?' is-selected':''}`} onClick={onSelect}>
  <span className="fcm-map-thumb-art">{image?<img src={image} alt="" draggable={false}/>:children}</span>{caption&&<span className="fcm-map-thumb-caption">{caption}</span>}
 </button>;
}
