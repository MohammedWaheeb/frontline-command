export type Modifier='ctrl'|'alt'|'shift'|'meta';
export interface KeyChord {code:string;modifiers?:readonly Modifier[]}
export interface ShortcutDefinition {id:string;label:string;category:'orders'|'selection'|'camera'|'interface'|'groups';defaults:readonly KeyChord[];repeat?:boolean;queueModifier?:boolean}
export type BindingMap=Record<string,KeyChord[]>;
export interface InputModifiers {queue:Modifier;multiSelect:Modifier;forceFire:Modifier}
export interface PointerBindings {select:number;context:number;pan:number;cancel:number}
export interface ControlBindings {preset:'standard'|'classic';keys:BindingMap;modifiers:InputModifiers;pointer:PointerBindings}
export interface BindingIssue {code:'unknown_action'|'invalid_binding'|'conflict';action:string;other?:string;message:string}
export interface KeyboardStroke {code:string;ctrlKey?:boolean;altKey?:boolean;shiftKey?:boolean;metaKey?:boolean;repeat?:boolean;isComposing?:boolean;defaultPrevented?:boolean}
export interface InputFocus {textEntry?:boolean;tagName?:string;role?:string;isContentEditable?:boolean;composing?:boolean;enabled?:boolean}
export interface InputContext extends InputFocus {queueLatched?:boolean;selectionLatched?:boolean}
const chord=(code:string,...modifiers:Modifier[]):KeyChord=>({code,modifiers});
const definition=(id:string,label:string,category:ShortcutDefinition['category'],defaults:KeyChord[]=[],extra:Partial<ShortcutDefinition>={}):ShortcutDefinition=>({id,label,category,defaults,...extra});

/** Input mappings only; available actions and gameplay legality still come from Go. */
export const SHORTCUT_DEFINITIONS:readonly ShortcutDefinition[]=[
 definition('attack_move','Attack-move','orders',[chord('KeyA')],{queueModifier:true}),
 definition('attack','Attack target','orders',[],{queueModifier:true}),
 definition('rebase','Rebase aircraft','orders'),
 definition('stop','Stop','orders',[chord('KeyS')],{queueModifier:true}),
 definition('hold','Hold position','orders',[chord('KeyH')],{queueModifier:true}),
 definition('guard','Guard unit or position','orders',[chord('KeyG')],{queueModifier:true}),
 definition('move','Move','orders',[chord('KeyM')],{queueModifier:true}),
 definition('patrol','Patrol','orders',[chord('KeyP')],{queueModifier:true}),
 definition('escort','Escort','orders',[chord('KeyE')],{queueModifier:true}),
 definition('return','Return to service','orders',[chord('KeyR')],{queueModifier:true}),
 definition('repair','Repair','orders',[chord('KeyY')],{queueModifier:true}),
 definition('board','Board','orders',[chord('KeyB')],{queueModifier:true}),
 definition('unload','Unload','orders',[chord('KeyU')],{queueModifier:true}),
 definition('capture','Capture','orders',[chord('KeyC')],{queueModifier:true}),
 definition('force_fire','Force-fire','orders',[chord('KeyF')],{queueModifier:true}),
 definition('rally','Set rally point','orders',[chord('KeyL')]),
 definition('aggressive','Aggressive stance','orders',[chord('KeyX')],{queueModifier:true}),
 definition('deploy','Deploy','orders',[chord('KeyD')]),
 definition('pack','Pack','orders',[chord('KeyV')]),
 ...['build','resume','train','research','cancel_production','sell','power','gather','salvage','repeat_sortie','repair_reserve','surrender_vote','surrender_cancel','convoy_hold','convoy_advance','ping'].map(id=>definition(id,id.replaceAll('_',' '),'orders')),
 ...Array.from({length:6},(_,i)=>definition(`ability_${i+1}`,`Ability ${i+1}`,'orders',[],{queueModifier:true})),
 definition('select_all','Select all controllable forces','selection',[chord('KeyA','ctrl')]),
 definition('select_same_type','Select same type on screen','selection',[chord('KeyT')]),
 definition('next_subgroup','Next selection subgroup','selection',[chord('Tab')]),
 definition('previous_subgroup','Previous selection subgroup','selection',[chord('Tab','shift')]),
 definition('toggle_queue','Toggle queued orders','interface'),
 definition('toggle_multiselect','Toggle additive selection','interface'),
 definition('center_selection','Center selection','camera',[chord('Home')]),
 definition('center_alert','Center latest actionable alert','camera',[chord('Space')]),
 ...(['Up','Down','Left','Right'] as const).map(direction=>definition(`pan_${direction.toLowerCase()}`,`Pan ${direction.toLowerCase()}`,'camera',[chord(`Arrow${direction}`)],{repeat:true})),
 definition('zoom_in','Zoom in','camera',[chord('Equal'),chord('NumpadAdd')],{repeat:true}),
 definition('zoom_out','Zoom out','camera',[chord('Minus'),chord('NumpadSubtract')],{repeat:true}),
 definition('escape','Cancel targeting / pause menu','interface',[chord('Escape')]),
 definition('chat','Open match chat','interface',[chord('Enter')]),
 definition('team_chat','Open team chat','interface',[chord('Enter','shift')]),
 definition('quick_save','Quick save (solo)','interface',[chord('F5')]),
 definition('quick_load','Quick load (solo)','interface',[chord('F9')]),
 ...Array.from({length:9},(_,i)=>[
  definition(`group_${i+1}_recall`,`Recall group ${i+1}`,'groups',[chord(`Digit${i+1}`)]),
  definition(`group_${i+1}_store`,`Store group ${i+1}`,'groups',[chord(`Digit${i+1}`,'ctrl')]),
  definition(`group_${i+1}_append`,`Add selection to group ${i+1}`,'groups',[chord(`Digit${i+1}`,'ctrl','shift')]),
 ]).flat(),
];

const modifiers:readonly Modifier[]=['ctrl','alt','shift','meta'];
function validModifier(value:unknown):value is Modifier{return modifiers.includes(value as Modifier)}
function normalized(chord:KeyChord):KeyChord {
 if(!chord||typeof chord.code!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(chord.code)||chord.modifiers&&!Array.isArray(chord.modifiers))throw new TypeError('Use a physical keyboard code and modifier list');
 const list=chord.modifiers??[];
 if(list.some(modifier=>!validModifier(modifier))||new Set(list).size!==list.length)throw new TypeError('Invalid or repeated keyboard modifier');
 return {code:chord.code,modifiers:modifiers.filter(modifier=>list.includes(modifier))};
}
const signature=(chord:KeyChord)=>`${chord.code}:${(chord.modifiers??[]).join('+')}`;
export function defaultBindings(preset:'standard'|'classic'='standard'):ControlBindings{
 return {preset,keys:Object.fromEntries(SHORTCUT_DEFINITIONS.map(def=>[def.id,def.defaults.map(normalized)])),modifiers:{queue:'shift',multiSelect:'shift',forceFire:'ctrl'},pointer:{select:0,context:preset==='classic'?0:2,pan:1,cancel:2}};
}

/** Returns issues without modifying saved settings. Extra content actions may be registered. */
export function validateBindings(bindings:ControlBindings,definitions:readonly ShortcutDefinition[]=SHORTCUT_DEFINITIONS):BindingIssue[]{
 const issues:BindingIssue[]=[],known=new Map(definitions.map(def=>[def.id,def])),used=new Map<string,string>();
 if(bindings.preset!=='standard'&&bindings.preset!=='classic')issues.push({code:'invalid_binding',action:'preset',message:'Choose standard or classic controls.'});
 if(!bindings.modifiers||!['queue','multiSelect','forceFire'].every(key=>validModifier(bindings.modifiers[key as keyof InputModifiers])))issues.push({code:'invalid_binding',action:'modifiers',message:'Choose keyboard modifiers for queue, selection and force-fire.'});
 if(!bindings.pointer||!['select','context','pan','cancel'].every(key=>Number.isInteger(bindings.pointer[key as keyof PointerBindings])&&bindings.pointer[key as keyof PointerBindings]>=0&&bindings.pointer[key as keyof PointerBindings]<=4)||bindings.pointer.pan===bindings.pointer.select||bindings.pointer.pan===bindings.pointer.context||bindings.pointer.cancel===bindings.pointer.select||bindings.preset==='standard'&&bindings.pointer.select===bindings.pointer.context)issues.push({code:'invalid_binding',action:'pointer',message:'Choose mouse buttons 0–4, a separate pan button and usable select/cancel buttons.'});
 if(!bindings.keys||typeof bindings.keys!=='object'||Array.isArray(bindings.keys)){issues.push({code:'invalid_binding',action:'keys',message:'Use a shortcut action map.'});return issues}
 for(const [action,chords] of Object.entries(bindings.keys??{})){
  const def=known.get(action);
  if(!def){issues.push({code:'unknown_action',action,message:'This shortcut action is not registered.'});continue}
  if(!Array.isArray(chords)||chords.length>4){issues.push({code:'invalid_binding',action,message:'An action supports up to four key bindings.'});continue}
  for(const source of chords){
   let chord:KeyChord;
   try{chord=normalized(source)}catch{issues.push({code:'invalid_binding',action,message:'The key binding is invalid.'});continue}
   const variants=[chord];
   if(def.queueModifier&&validModifier(bindings.modifiers?.queue)&&!chord.modifiers?.includes(bindings.modifiers.queue))variants.push(normalized({code:chord.code,modifiers:[...(chord.modifiers??[]),bindings.modifiers.queue]}));
   for(const variant of variants){const key=signature(variant),other=used.get(key);if(other&&other!==action)issues.push({code:'conflict',action,other,message:`${action} and ${other} use the same key combination.`});else used.set(key,action)}
  }
 }
 return issues;
}

/** A transactional settings update: a conflict never silently unbinds another action. */
export function remapBindings(current:ControlBindings,changes:Partial<BindingMap>,definitions:readonly ShortcutDefinition[]=SHORTCUT_DEFINITIONS):{bindings?:ControlBindings;issues:BindingIssue[]}{
 const next:ControlBindings=structuredClone(current);
 const known=new Set(definitions.map(def=>def.id)),unknown:BindingIssue[]=[];
 for(const [action,chords] of Object.entries(changes))if(chords!==undefined){
  if(!known.has(action)||['__proto__','prototype','constructor'].includes(action)){unknown.push({code:'unknown_action',action,message:'This shortcut action is not registered.'});continue}
  next.keys[action]=structuredClone(chords);
 }
 if(unknown.length)return {issues:unknown};
 const issues=validateBindings(next,definitions);
 return issues.length?{issues}:{bindings:next,issues:[]};
}

export function textEntryFocused(focus:InputFocus={}):boolean{
 return !!focus.textEntry||!!focus.isContentEditable||!!focus.composing||['INPUT','TEXTAREA','SELECT'].includes((focus.tagName??'').toUpperCase())||['textbox','searchbox','combobox','spinbutton','slider'].includes((focus.role??'').toLowerCase());
}
function held(event:Pick<KeyboardStroke,'ctrlKey'|'altKey'|'shiftKey'|'metaKey'>,modifier:Modifier):boolean{return !!event[`${modifier}Key` as 'ctrlKey'|'altKey'|'shiftKey'|'metaKey']}
export interface ShortcutIntent {action:string;queued:boolean;preventDefault:true}
/** No listeners are installed. The UI passes its current focus and a keyboard event shape. */
export function resolveShortcut(event:KeyboardStroke,bindings:ControlBindings,focus:InputContext={},definitions:readonly ShortcutDefinition[]=SHORTCUT_DEFINITIONS):ShortcutIntent|undefined{
 if(focus.enabled===false||textEntryFocused(focus)||event.isComposing||event.defaultPrevented)return undefined;
 // Focus navigation belongs to the currently focused console control. Tab on
 // the document or battlefield canvas still cycles selection subgroups.
 if(event.code==='Tab'&&((focus.tagName&&!['BODY','CANVAS'].includes(focus.tagName.toUpperCase()))||focus.role&&focus.role.toLowerCase()!=='application'))return undefined;
 // Native control activation wins over battlefield chat/alert shortcuts.
 // Other command keys remain usable after clicking a command-panel button.
 if(['Enter','NumpadEnter','Space'].includes(event.code)&&(['BUTTON','A','SUMMARY'].includes((focus.tagName??'').toUpperCase())||['button','link'].includes((focus.role??'').toLowerCase())))return undefined;
 for(const def of definitions){
  if(event.repeat&&!def.repeat)continue;
  for(const binding of bindings.keys[def.id]??[]){
   if(binding.code!==event.code)continue;
   const required=binding.modifiers??[];
   const matches=modifiers.every(modifier=>held(event,modifier)===required.includes(modifier)||!!def.queueModifier&&modifier===bindings.modifiers.queue&&!required.includes(modifier));
   if(matches)return {action:def.id,queued:!!def.queueModifier&&(held(event,bindings.modifiers.queue)||!!focus.queueLatched),preventDefault:true};
  }
 }
 return undefined;
}

export interface PointerGesture extends Omit<KeyboardStroke,'code'> {button:number;phase:'click'|'double-click'|'drag';hit:'owned'|'visible-entity'|'ground';hasSelection:boolean;targeting:boolean}
export type PointerIntent={action:'select'|'select-type'|'box-select';additive:boolean}|{action:'context-command'|'confirm-target'|'force-fire';queued:boolean}|{action:'pan'|'cancel-targeting'|'clear-selection'};
export function resolvePointer(gesture:PointerGesture,bindings:ControlBindings,focus:InputContext={}):PointerIntent|undefined{
 if(focus.enabled===false||textEntryFocused(focus)||gesture.isComposing||gesture.defaultPrevented)return undefined;
 const {pointer,modifiers:mods}=bindings,additive=held(gesture,mods.multiSelect)||!!focus.selectionLatched,queued=held(gesture,mods.queue)||!!focus.queueLatched;
 if(gesture.phase==='drag'&&gesture.button===pointer.pan)return {action:'pan'};
 if(gesture.targeting){
  if(gesture.button===pointer.cancel&&gesture.phase==='click')return {action:'cancel-targeting'};
  if(gesture.button===pointer.select&&gesture.phase==='click')return {action:'confirm-target',queued};
  return undefined;
 }
 if(gesture.button===pointer.select&&gesture.hit==='ground'&&gesture.phase==='click'&&gesture.hasSelection&&held(gesture,mods.forceFire))return {action:'force-fire',queued};
 if(gesture.phase==='drag'&&gesture.button===pointer.select)return {action:'box-select',additive};
 if(gesture.phase==='double-click'&&gesture.button===pointer.select&&gesture.hit==='owned')return {action:'select-type',additive};
 if(gesture.phase!=='click')return undefined;
 if(gesture.button===pointer.select&&(bindings.preset==='standard'||gesture.hit==='owned'||!gesture.hasSelection))return {action:'select',additive};
 if(gesture.button===pointer.context&&gesture.hasSelection)return {action:'context-command',queued};
 if(bindings.preset==='classic'&&gesture.button===pointer.cancel)return {action:'clear-selection'};
 return undefined;
}
export function exceedsDragThreshold(start:{x:number;y:number},current:{x:number;y:number},threshold=5):boolean{
 if(![start.x,start.y,current.x,current.y,threshold].every(Number.isFinite)||threshold<0)throw new RangeError('Invalid drag threshold or coordinates');
 return Math.hypot(current.x-start.x,current.y-start.y)>=threshold;
}

/** Safe optional modifier toggles. Clear on focus loss and on session/perspective switches. */
export class ModifierToggles {
 private queue=false;
 private selection=false;
 get context():Pick<InputContext,'queueLatched'|'selectionLatched'>{return {queueLatched:this.queue,selectionLatched:this.selection}}
 toggle(kind:'queue'|'selection'):void{if(kind==='queue')this.queue=!this.queue;else this.selection=!this.selection}
 clear():void{this.queue=false;this.selection=false}
}
