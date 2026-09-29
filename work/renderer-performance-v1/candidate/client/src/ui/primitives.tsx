import {useEffect,useRef,useState,type ReactNode} from 'react';
import {art} from '../render/art';
import type {CatalogIndex} from '../content/catalog';
export function Icon({id,className=''}:{id:string;className?:string}){return <svg className={`icon ${className}`} aria-hidden="true"><use href={`/art/ui/icons/fc-icons.svg#${({'i-chevron-left':'i-chevron-right','i-settings':'i-gear','i-home':'i-building','i-info':'i-help','i-save':'i-download','i-crosshair':'i-attack','i-units':'i-tank'} as Record<string,string>)[id]??id}`}/></svg>}
export function Emblem({faction}:{faction:string}){return <svg className="emblem" aria-hidden="true"><use href={`/art/ui/emblems/fc-emblems.svg#em-${faction}`}/></svg>}
export function Cameo({type,faction,catalog,color='#4daf62',purpose='portrait'}:{type:string;faction:string;catalog:CatalogIndex;color?:string;purpose?:'build'|'portrait'}){
 const [url,setURL]=useState<string>();const resolved=art.resolve(type,faction,catalog);
 useEffect(()=>{let canceled=false;setURL(undefined);if(resolved?.id)void art.cameo(resolved.id,color,'idle',undefined,purpose).then(value=>{if(!canceled)setURL(value)}).catch(()=>{});return()=>{canceled=true}},[resolved?.id,color,purpose]);
 return url?<img className="cameo-art" src={url} alt=""/>:<span className="cameo-unavailable"><Icon id={catalog.isBuilding(type)?'i-building':'i-units'}/></span>;
}
export function Modal({title,onClose,children,wide=false}:{title:string;onClose?:()=>void;children:ReactNode;wide?:boolean}){
 const dialog=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const node=dialog.current;if(!node)return;const first=node.querySelector<HTMLElement>('button,input,select,[tabindex="0"]');(first??node).focus();
 const key=(event:KeyboardEvent)=>{if(event.defaultPrevented||document.querySelectorAll('[role="dialog"]').item(document.querySelectorAll('[role="dialog"]').length-1)!==node)return;if(event.key==='Escape'&&close.current){event.preventDefault();close.current()}if(event.key==='Tab'){const controls=[...node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element=>element.getClientRects().length);if(!controls.length){event.preventDefault();return}const i=controls.indexOf(document.activeElement as HTMLElement);if(event.shiftKey&&i<=0){event.preventDefault();controls.at(-1)?.focus()}else if(!event.shiftKey&&i===controls.length-1){event.preventDefault();controls[0].focus()}}};node.addEventListener('keydown',key);return()=>{node.removeEventListener('keydown',key);previous?.focus()};},[]);
 return <div className="scrim"><div ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`modal console ${wide?'wide':''}`}><header><h2>{title}</h2>{onClose&&<button className="icon-button" onClick={onClose} aria-label="Close"><Icon id="i-close"/></button>}</header><div className="modal-body">{children}</div></div></div>;
}
export function Empty({children}:{children:ReactNode}){return <p className="empty">{children}</p>}
