// Menu kit: machined key button. Pure presentation; styles live in src/styles/menu.css.
import type {ButtonHTMLAttributes,ReactNode} from 'react';
import {KitIcon as Icon} from './icon';

export type ButtonVariant='primary'|'secondary'|'ghost'|'danger';
export type ButtonSize='sm'|'md'|'lg';
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>,'children'>{
 /** primary = amber CTA (one per screen), secondary = gunmetal key, ghost = text, danger = red-bar key. */
 variant?:ButtonVariant;
 /** sm 32px, md 40px (menu hit target), lg 52px (footer primary); all × --fc-ui-scale. */
 size?:ButtonSize;
 /** fc-icons symbol id, e.g. 'i-attack'. Replaced by a spinner while busy. */
 icon?:string;
 /** Trailing icon (e.g. 'i-chevron-right'). */
 trailingIcon?:string;
 /** Shows a spinner, sets aria-busy and blocks clicks; the label stays. */
 busy?:boolean;
 children?:ReactNode;
}

/** Kit button. Keeps native <button> semantics, so getByRole('button',{name}) keeps working. */
export function Button({variant='secondary',size='md',icon,trailingIcon,busy=false,className='',type='button',disabled,children,...rest}:ButtonProps){
 return <button type={type} className={`fcm-btn fcm-btn--${variant} fcm-btn--${size}${className?` ${className}`:''}`} aria-busy={busy||undefined} disabled={disabled||busy} {...rest}>
  {busy?<span className="fcm-spinner" aria-hidden="true"/>:icon?<Icon id={icon}/>:null}
  {children!==undefined&&children!==null&&children!==false&&<span className="fcm-btn-label">{children}</span>}
  {trailingIcon&&<Icon id={trailingIcon} className="fcm-btn-trailing"/>}
 </button>;
}
