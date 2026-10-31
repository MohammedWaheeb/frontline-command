// Menu kit: labelled form fields, styled native selects and the on/off switch.
import {useId,type ChangeEvent,type InputHTMLAttributes,type ReactNode,type SelectHTMLAttributes} from 'react';

export interface FieldControlProps{id:string;'aria-describedby'?:string;'aria-invalid'?:true}
export interface FieldProps{
 label:ReactNode;
 /** Player-language help under the control (13px, sentence case, never mono). */
 hint?:ReactNode;
 /** Inline validation message. Sets aria-invalid on render-prop controls. */
 error?:ReactNode;
 /** 'stack' (label above) or 'inline' (label left, control right — for dense rule rows). */
 layout?:'stack'|'inline';
 /**
  * Use for composite controls (Segmented, Switch, swatches): renders role="group" labelled by the caption
  * instead of wrapping the control in a <label> (which would hijack clicks and names).
  */
 group?:boolean;
 className?:string;
 /**
  * Either a control element (wrapped in the <label>, so it gets the label text as its name),
  * or a render function receiving {id, aria-describedby, aria-invalid} to spread on the control.
  */
 children:ReactNode|((control:FieldControlProps)=>ReactNode);
}
/** Label + control + hint + error with aria wiring. */
export function Field({label,hint,error,layout='stack',group=false,className='',children}:FieldProps){
 const id=useId(),hintID=`${id}-hint`,errorID=`${id}-error`;
 const describedBy=[hint?hintID:'',error?errorID:''].filter(Boolean).join(' ')||undefined;
 const classes=`fcm-field fcm-field--${layout}${error?' fcm-field--error':''}${className?` ${className}`:''}`;
 const notes=<>{hint&&<p className="fcm-hint" id={hintID}>{hint}</p>}{error&&<p className="fcm-field-error" id={errorID} role="alert">{error}</p>}</>;
 if(group)return <div className={classes} role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy}><span className="fcm-field-label" id={`${id}-label`}>{label}</span><div className="fcm-field-control">{typeof children==='function'?children({id,'aria-describedby':describedBy}):children}</div>{notes}</div>;
 if(typeof children==='function')return <div className={classes}><label className="fcm-field-label" htmlFor={id}>{label}</label><div className="fcm-field-control">{children({id,'aria-describedby':describedBy,...(error?{'aria-invalid':true as const}:{})})}</div>{notes}</div>;
 return <div className={classes}><label className="fcm-field-wrap"><span className="fcm-field-label">{label}</span><span className="fcm-field-control">{children}</span></label>{notes}</div>;
}

export interface SelectOption<T extends string>{value:T;label:string;disabled?:boolean}
export interface SelectProps<T extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>,'value'|'onChange'|'children'|'size'>{
 value:T;
 onChange:(value:T,event:ChangeEvent<HTMLSelectElement>)=>void;
 /** Title-case labels ("Normal", not "normal"). */
 options?:ReadonlyArray<SelectOption<T>>;
 children?:ReactNode;
 /** Visual height: sm 32px, md 40px (× scale). */
 density?:'sm'|'md';
}
/** Styled native <select>. Stays native for accessibility and for tests (selectOption, aria-label). */
export function Select<T extends string>({value,onChange,options,children,className='',density='md',...rest}:SelectProps<T>){
 return <select className={`fcm-select fcm-select--${density}${className?` ${className}`:''}`} value={value} onChange={event=>onChange(event.target.value as T,event)} {...rest}>
  {options?options.map(option=><option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>):children}
 </select>;
}

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'onChange'|'checked'|'children'>{
 checked:boolean;
 onChange:(checked:boolean)=>void;
 /** Visible label; also the accessible name unless aria-label is given. */
 label:ReactNode;
 onText?:string;
 offText?:string;
 className?:string;
}
/** Two-state toggle. A native checkbox with role="switch", so getByLabel(...).check() keeps working. */
export function Switch({checked,onChange,label,onText='On',offText='Off',className='',id,...rest}:SwitchProps){
 const generated=useId(),inputID=id??generated;
 return <label className={`fcm-switch${checked?' is-on':''}${className?` ${className}`:''}`} htmlFor={inputID}>
  <input id={inputID} type="checkbox" role="switch" className="fcm-switch-input" checked={checked} onChange={event=>onChange(event.target.checked)} {...rest}/>
  <span className="fcm-switch-label">{label}</span>
  <span className="fcm-switch-track" aria-hidden="true"><span className="fcm-switch-thumb"/><span className="fcm-switch-state">{checked?onText:offText}</span></span>
 </label>;
}
