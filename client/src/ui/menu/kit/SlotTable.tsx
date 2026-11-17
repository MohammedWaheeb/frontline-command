// Menu kit: commander slot table shell shared by Skirmish and the multiplayer lobby.
// Pure layout: the owning screen supplies the cell controls. Columns are a CSS grid shared by
// every row through --fcm-slot-cols, so header and rows always align.
import type {CSSProperties,ReactNode} from 'react';

export interface SlotColumn{
 id:string;
 label:ReactNode;
 /** CSS grid track, e.g. '44px', 'minmax(0,1.4fr)'. Default 'minmax(0,1fr)'. Use calc(… * var(--fc-ui-scale)) for fixed tracks. */
 width?:string;
 align?:'start'|'center'|'end';
 /** Hide the header text visually (still announced). */
 srOnly?:boolean;
 /** Hide this column below the compact breakpoint (cell must carry .fcm-slot-cell--optional too). */
 optional?:boolean;
}
export interface SlotTableProps{
 /** Accessible name, e.g. "Commanders". */
 label:string;
 columns:ReadonlyArray<SlotColumn>;
 children:ReactNode;
 /** Content under the rows (quick setups, add-AI form). */
 footer?:ReactNode;
 className?:string;
}
export function SlotTable({label,columns,children,footer,className=''}:SlotTableProps){
 const style={['--fcm-slot-cols' as string]:columns.map(column=>column.width??'minmax(0,1fr)').join(' ')} as CSSProperties;
 return <div className={`fcm-slots${className?` ${className}`:''}`} style={style}>
  <div role="table" aria-label={label} className="fcm-slots-table">
   <div role="rowgroup" className="fcm-slots-head"><div role="row" className="fcm-slot-row fcm-slot-row--head">{columns.map(column=><div key={column.id} role="columnheader" className={`fcm-slot-th fcm-align-${column.align??'start'}${column.optional?' fcm-slot-cell--optional':''}`}>{column.srOnly?<span className="fcm-sr-only">{column.label}</span>:column.label}</div>)}</div></div>
   <div role="rowgroup" className="fcm-slots-body">{children}</div>
  </div>
  {footer&&<div className="fcm-slots-footer">{footer}</div>}
 </div>;
}

export interface SlotRowProps{
 /** Team colour of this commander (CSS colour). Drawn as the 4px left edge — the only place team colour touches the row. */
 teamColor?:string;
 /** 'open' and 'closed' rows render dimmed. */
 state?:'filled'|'open'|'closed';
 /** The local player's row gets a brass star marker. */
 self?:boolean;
 /** Focused/selected row (e.g. the row that receives a map spawn click): amber left bar. */
 selected?:boolean;
 /** Extra classes, e.g. 'network-commander' to keep lobby test selectors. */
 className?:string;
 children:ReactNode;
 onFocusRow?:()=>void;
}
export function SlotRow({teamColor,state='filled',self=false,selected=false,className='',children,onFocusRow}:SlotRowProps){
 return <div role="row" className={`fcm-slot-row fcm-slot-row--${state}${self?' is-self':''}${selected?' is-selected':''}${className?` ${className}`:''}`} style={teamColor?{['--fcm-slot-color' as string]:teamColor}:undefined} onFocus={onFocusRow}>{children}</div>;
}

export interface SlotCellProps{children?:ReactNode;align?:'start'|'center'|'end';optional?:boolean;className?:string;/** Use for the slot number / name cell. */header?:boolean}
export function SlotCell({children,align='start',optional=false,className='',header=false}:SlotCellProps){
 return <div role={header?'rowheader':'cell'} className={`fcm-slot-cell fcm-align-${align}${optional?' fcm-slot-cell--optional':''}${className?` ${className}`:''}`}>{children}</div>;
}

/** Small numbered badge for the # column. */
export function SlotNumber({value}:{value:number}){return <span className="fcm-slot-num">{value}</span>}
