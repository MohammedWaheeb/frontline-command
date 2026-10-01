import type {KeyChord,Modifier} from '../runtime/keybindings';

/** Shared Settings/training wording; compact badges retain every modifier. */
function label(chord:KeyChord,compact:boolean):string{
 const modifiers=(chord.modifiers??[]).map(value=>value==='meta'?'Command':value[0].toUpperCase()+value.slice(1));
 const key=compact&&chord.code==='Escape'?'Esc':chord.code.replace(/^Key|^Digit/,'');
 return [...modifiers,key].join(compact?'+':' + ');
}
export const shortcutLabel=(chord:KeyChord)=>label(chord,false);
export const shortcutBadgeLabel=(chord:KeyChord)=>label(chord,true);
const ARIA_MODIFIERS:Record<Modifier,string>={ctrl:'Control',alt:'Alt',shift:'Shift',meta:'Meta'};
const PRINTABLE_CODES:Record<string,string>={Equal:'=',Minus:'-',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Backquote:'`',Comma:',',Period:'.',Slash:'/',NumpadAdd:'Plus',NumpadSubtract:'-',NumpadMultiply:'*',NumpadDivide:'/',NumpadDecimal:'.',NumpadComma:',',NumpadEnter:'Enter'};
const NAMED_CODES=new Set(['Escape','Enter','Tab','Space','Backspace','Delete','Insert','Home','End','PageUp','PageDown','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','CapsLock','NumLock','ScrollLock','Pause','PrintScreen','ContextMenu']);
/** ARIA uses modifier/key values, not KeyboardEvent code names such as KeyQ. */
export function shortcutAria(chord:KeyChord):string|undefined{
 const code=chord.code,key=/^Key[A-Z]$/.test(code)?code.slice(3):/^Digit[0-9]$/.test(code)?code.slice(5):/^Numpad[0-9]$/.test(code)?code.slice(6):PRINTABLE_CODES[code]??(NAMED_CODES.has(code)||/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)?code:undefined);
 if(!key)return undefined;
 return [...(chord.modifiers??[]).map(value=>ARIA_MODIFIERS[value]),key].join('+');
}
export function shortcutAriaList(chords:readonly KeyChord[]|undefined):string|undefined{
 const values=chords?.map(shortcutAria).filter((value):value is string=>!!value);
 return values?.length?values.join(' '):undefined;
}
