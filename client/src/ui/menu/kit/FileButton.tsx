// Menu kit: styled file picker. The native input stays in the DOM (visually hidden, still focusable),
// so tests keep using getByLabel('<inputLabel>').setInputFiles(...).
import type {ReactNode} from 'react';
import {KitIcon} from './icon';
import type {ButtonSize,ButtonVariant} from './Button';

export interface FileButtonProps{
 /** Visible button text, e.g. "Import save". */
 label:ReactNode;
 /** aria-label of the hidden <input type=file>. Keep legacy names tests use: 'Import save', 'Import replay', 'Review browser backup'. Defaults to label when it is a string. */
 inputLabel?:string;
 accept?:string;
 multiple?:boolean;
 disabled?:boolean;
 icon?:string;
 variant?:Exclude<ButtonVariant,'danger'>;
 size?:ButtonSize;
 /** Receives the chosen files; the input is reset afterwards so the same file can be picked again. */
 onFiles:(files:File[])=>void;
 className?:string;
 title?:string;
}
export function FileButton({label,inputLabel,accept,multiple=false,disabled=false,icon='i-download',variant='secondary',size='md',onFiles,className='',title}:FileButtonProps){
 return <label className={`fcm-btn fcm-btn--${variant} fcm-btn--${size} fcm-file${disabled?' is-disabled':''}${className?` ${className}`:''}`} title={title}>
  <input type="file" className="fcm-file-input" aria-label={inputLabel??(typeof label==='string'?label:undefined)} accept={accept} multiple={multiple} disabled={disabled} onChange={event=>{const files=[...(event.target.files??[])];event.target.value='';if(files.length)onFiles(files)}}/>
  <KitIcon id={icon}/><span className="fcm-btn-label">{label}</span>
 </label>;
}
