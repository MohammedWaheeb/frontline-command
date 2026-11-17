import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultBindings,validateBindings,remapBindings,resolveShortcut,resolvePointer,textEntryFocused,exceedsDragThreshold,ModifierToggles,KEYBOARD_LAYOUTS} from '../../src/runtime/keybindings';

test('every keyboard layout validates independently of both mouse schemes',()=>{
 for(const {id} of KEYBOARD_LAYOUTS)for(const mouse of ['standard','classic'] as const){
  const bindings=defaultBindings(mouse,id);assert.deepEqual(validateBindings(bindings),[],`${id}/${mouse}`);
  assert.equal(bindings.preset,mouse);assert.equal(bindings.pointer.context,mouse==='classic'?0:2);
 }
});

test('Frontline production, cameos, commands, abilities and camera shortcuts resolve without conflicts',()=>{
 const bindings=defaultBindings();
 for(const [i,tab] of ['base','defense','infantry','vehicles','air','tech'].entries())assert.equal(resolveShortcut({code:`Key${'QWERTY'[i]}`},bindings)?.action,`production_${tab}`);
 assert.equal(resolveShortcut({code:'Tab'},bindings)?.action,'next_production_tab');
 assert.equal(resolveShortcut({code:'Tab',shiftKey:true},bindings)?.action,'previous_production_tab');
 for(let i=1;i<=12;i++){
  assert.equal(resolveShortcut({code:`F${i}`},bindings)?.action,`cameo_${i}`);
  assert.equal(resolveShortcut({code:`F${i}`,shiftKey:true},bindings)?.action,`cameo_${i}_batch`);
  assert.equal(resolveShortcut({code:`F${i}`,ctrlKey:true},bindings)?.action,`cameo_${i}_cancel`);
 }
 for(const [code,action] of Object.entries({KeyA:'attack_move',KeyS:'stop',KeyD:'deploy',KeyG:'guard',KeyH:'hold',KeyX:'scatter',KeyF:'force_fire',KeyZ:'ability_1',KeyC:'ability_2',KeyV:'ability_3',KeyB:'ability_4',KeyK:'repair_mode',KeyL:'sell_mode',KeyO:'power_mode',KeyP:'patrol',KeyN:'place_last_built',Backspace:'center_base',Space:'center_alert',Home:'center_selection',Backquote:'select_idle'}))assert.equal(resolveShortcut({code},bindings)?.action,action,code);
 assert.equal(resolveShortcut({code:'Backquote',shiftKey:true},bindings)?.action,'select_all_idle');
 assert.equal(resolveShortcut({code:'KeyA',ctrlKey:true,shiftKey:true},bindings)?.action,'select_all_screen');
 assert.equal(resolveShortcut({code:'KeyZ',shiftKey:true},bindings)?.queued,true);
 assert.equal(resolveShortcut({code:'F5',ctrlKey:true,shiftKey:true},bindings)?.action,'quick_save');
 assert.equal(resolveShortcut({code:'F9',ctrlKey:true,shiftKey:true},bindings)?.action,'quick_load');
});

test('Classic legacy keeps the original keyboard controls without activating new defaults',()=>{
 const bindings=defaultBindings('standard','classic');
 for(const [code,action] of Object.entries({KeyE:'escort',KeyR:'return',KeyY:'repair',KeyB:'board',KeyU:'unload',KeyC:'capture',KeyL:'rally',KeyX:'aggressive',KeyV:'pack',KeyT:'select_same_type',Tab:'next_subgroup',F5:'quick_save',F9:'quick_load'}))assert.equal(resolveShortcut({code},bindings)?.action,action,code);
 assert.equal(resolveShortcut({code:'Tab',shiftKey:true},bindings)?.action,'previous_subgroup');
 assert.equal(resolveShortcut({code:'KeyQ'},bindings),undefined);
 assert.deepEqual(bindings.keys.production_base,[]);
});

test('Grid owns the twelve command-card letters while preserving production access and queueing',()=>{
 const bindings=defaultBindings('standard','grid');
 for(const [i,key] of [...'QWERASDFZXCV'].entries()){
  assert.equal(resolveShortcut({code:`Key${key}`},bindings)?.action,`card_slot_${i+1}`);
  assert.deepEqual(resolveShortcut({code:`Key${key}`,shiftKey:true},bindings),{action:`card_slot_${i+1}`,queued:true,preventDefault:true});
 }
 assert.equal(resolveShortcut({code:'KeyQ',altKey:true},bindings)?.action,'production_base');
 assert.equal(resolveShortcut({code:'KeyA',ctrlKey:true},bindings)?.action,'select_all');
 assert.equal(resolveShortcut({code:'F1'},bindings)?.action,'cameo_1');
});

test('layout default factories return independent binding arrays',()=>{
 const first=defaultBindings(),second=defaultBindings();first.keys.production_base[0].code='KeyJ';
 assert.equal(second.keys.production_base[0].code,'KeyQ');assert.equal(defaultBindings().keys.production_base[0].code,'KeyQ');
});

test('native keyboard activation is not consumed as chat or alert navigation',()=>{
 const bindings=defaultBindings();
 for(const focus of [{tagName:'button'},{tagName:'A'},{tagName:'SUMMARY'},{role:'button'},{role:'link'}])for(const code of ['Enter','Space','NumpadEnter'])assert.equal(resolveShortcut({code},bindings,focus),undefined);
 assert.equal(resolveShortcut({code:'Enter'},bindings,{tagName:'CANVAS'})?.action,'chat');
 assert.equal(resolveShortcut({code:'Space'},bindings,{tagName:'CANVAS'})?.action,'center_alert');
 assert.equal(resolveShortcut({code:'KeyA'},bindings,{tagName:'BUTTON'})?.action,'attack_move');
});

test('default and classic controls have no shortcut conflicts, including queued commands and groups',()=>{
 for(const preset of ['standard','classic'] as const){
  const bindings=defaultBindings(preset);assert.deepEqual(validateBindings(bindings),[]);
  assert.deepEqual(resolveShortcut({code:'KeyA'},bindings),{action:'attack_move',queued:false,preventDefault:true});
  assert.deepEqual(resolveShortcut({code:'KeyA',shiftKey:true},bindings),{action:'attack_move',queued:true,preventDefault:true});
  assert.equal(resolveShortcut({code:'KeyA',ctrlKey:true},bindings)?.action,'select_all');
  for(let i=1;i<=9;i++){
   assert.equal(resolveShortcut({code:`Digit${i}`},bindings)?.action,`group_${i}_recall`);
   assert.equal(resolveShortcut({code:`Digit${i}`,ctrlKey:true},bindings)?.action,`group_${i}_store`);
   assert.equal(resolveShortcut({code:`Digit${i}`,ctrlKey:true,shiftKey:true},bindings)?.action,`group_${i}_append`);
  }
  assert.equal(resolveShortcut({code:'Digit1',repeat:true},bindings),undefined);
  assert.equal(resolveShortcut({code:'ArrowLeft',repeat:true},bindings)?.action,'pan_left');
 }
});

test('remapping is transactional and detects overlaps introduced by the queue modifier',()=>{
 const bindings=defaultBindings(),failed=remapBindings(bindings,{attack_move:[{code:'KeyS'}]});
 assert.equal(failed.bindings,undefined);assert.ok(failed.issues.some(issue=>issue.code==='conflict'));
 assert.equal(bindings.keys.attack_move[0].code,'KeyA');
 const moved=remapBindings(bindings,{stop:[],attack_move:[{code:'KeyS'}]});assert.deepEqual(moved.issues,[]);
 assert.equal(resolveShortcut({code:'KeyS',shiftKey:true},moved.bindings!)?.action,'attack_move');
 const collision=remapBindings(bindings,{repair:[{code:'KeyA',modifiers:['shift']}]});assert.ok(collision.issues.some(issue=>issue.code==='conflict'));
 assert.ok(remapBindings(bindings,{unknown:[{code:'KeyK'}]}).issues.some(issue=>issue.code==='unknown_action'));
 assert.ok(remapBindings(bindings,JSON.parse('{"__proto__": [{"code":"KeyK"}]}')).issues.some(issue=>issue.code==='unknown_action'));
 const modified=defaultBindings();modified.modifiers.queue='alt';assert.deepEqual(validateBindings(modified),[]);
 assert.equal(resolveShortcut({code:'KeyA',altKey:true},modified)?.queued,true);
 assert.equal(resolveShortcut({code:'KeyA',shiftKey:true},modified),undefined);
});

test('accessible modifier toggles preserve normal shortcuts and clear cleanly on focus loss',()=>{
 const bindings=defaultBindings(),toggles=new ModifierToggles();toggles.toggle('queue');toggles.toggle('selection');
 assert.equal(resolveShortcut({code:'KeyA'},bindings,toggles.context)?.queued,true);
 assert.equal(resolveShortcut({code:'Space'},bindings,toggles.context)?.queued,false);
 assert.deepEqual(resolvePointer({button:0,phase:'click',hit:'owned',hasSelection:true,targeting:false},bindings,toggles.context),{action:'select',additive:true});
 toggles.clear();assert.deepEqual(toggles.context,{queueLatched:false,selectionLatched:false});
});

test('text entry, composition, disabled surfaces and already consumed events suppress battlefield shortcuts',()=>{
 const bindings=defaultBindings();
 for(const focus of [{tagName:'input'},{tagName:'TEXTAREA'},{tagName:'select'},{isContentEditable:true},{role:'textbox'},{role:'slider'},{textEntry:true},{composing:true}]){
  assert.equal(textEntryFocused(focus),true);assert.equal(resolveShortcut({code:'Space'},bindings,focus),undefined);
 }
 assert.equal(resolveShortcut({code:'KeyS',isComposing:true},bindings),undefined);
 assert.equal(resolveShortcut({code:'KeyS',defaultPrevented:true},bindings),undefined);
 assert.equal(resolveShortcut({code:'KeyS'},bindings,{enabled:false}),undefined);
 assert.equal(resolveShortcut({code:'KeyS',metaKey:true},bindings),undefined);
});

test('standard and classic pointer presets return correct selection, targeting and queued command intentions',()=>{
 const standard=defaultBindings(),classic=defaultBindings('classic');
 const click={button:0,phase:'click' as const,hit:'ground' as const,hasSelection:true,targeting:false};
 assert.deepEqual(resolvePointer(click,standard),{action:'select',additive:false});
 assert.deepEqual(resolvePointer({...click,button:2,shiftKey:true},standard),{action:'context-command',queued:true});
 assert.deepEqual(resolvePointer(click,classic),{action:'context-command',queued:false});
 assert.deepEqual(resolvePointer({...click,hit:'owned'},classic),{action:'select',additive:false});
 assert.deepEqual(resolvePointer({...click,button:2},classic),{action:'clear-selection'});
 assert.deepEqual(resolvePointer({...click,ctrlKey:true},standard),{action:'force-fire',queued:false});
 assert.deepEqual(resolvePointer({...click,targeting:true,button:2},standard),{action:'cancel-targeting'});
 assert.deepEqual(resolvePointer({...click,targeting:true,shiftKey:true},standard),{action:'confirm-target',queued:true});
 assert.deepEqual(resolvePointer({...click,phase:'drag',shiftKey:true},classic),{action:'box-select',additive:true});
 assert.deepEqual(resolvePointer({...click,phase:'drag',button:1},standard),{action:'pan'});
 assert.deepEqual(resolvePointer({...click,phase:'double-click',hit:'owned'},standard),{action:'select-type',additive:false});
 assert.deepEqual(resolvePointer({...click,ctrlKey:true,hit:'owned'},standard),{action:'select-type',additive:false});
 assert.deepEqual(resolvePointer({...click,ctrlKey:true,shiftKey:true,hit:'owned'},classic),{action:'select-type',additive:true});
 assert.deepEqual(resolvePointer({...click,ctrlKey:true,hit:'visible-entity'},standard),{action:'select',additive:false});
 assert.deepEqual(resolvePointer({...click,hit:'visible-entity',hasSelection:false},classic),{action:'select',additive:false});
 assert.deepEqual(resolvePointer({...click,hit:'visible-entity'},classic),{action:'context-command',queued:false});
 assert.equal(resolvePointer(click,standard,{textEntry:true}),undefined);
 assert.equal(exceedsDragThreshold({x:0,y:0},{x:3,y:4},5),true);
 assert.equal(exceedsDragThreshold({x:0,y:0},{x:3,y:4},6),false);
 assert.throws(()=>exceedsDragThreshold({x:NaN,y:0},{x:3,y:4}));
});
