// Menu kit: destructive-action confirmation built on primitives.Modal (focus trap + Escape stacking).
import type {ReactNode} from 'react';
import {Modal} from '../../primitives';
import {Button} from './Button';

export interface ConfirmModalProps{
 title:string;
 /** One or two sentences: what happens and what is preserved. */
 children:ReactNode;
 confirmLabel:string;
 cancelLabel?:string;
 /** Danger styling on the confirm key (reset, delete, surrender, leave). */
 danger?:boolean;
 busy?:boolean;
 onConfirm:()=>void;
 onCancel:()=>void;
}
/** Use for Reset preferences, Delete save, Surrender, Leave lobby while ready. Escape and Cancel both cancel. */
export function ConfirmModal({title,children,confirmLabel,cancelLabel='Cancel',danger=false,busy=false,onConfirm,onCancel}:ConfirmModalProps){
 return <Modal alert title={title} onClose={onCancel}>
  <div className="fcm-confirm"><div className="fcm-confirm-body">{children}</div>
   <div className="fcm-confirm-actions"><Button variant="secondary" onClick={onCancel}>{cancelLabel}</Button><Button variant={danger?'danger':'primary'} busy={busy} onClick={onConfirm}>{confirmLabel}</Button></div>
  </div>
 </Modal>;
}
