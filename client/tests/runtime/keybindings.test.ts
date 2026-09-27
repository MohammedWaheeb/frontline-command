import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultBindings,validateBindings,remapBindings,resolveShortcut,resolvePointer,textEntryFocused,exceedsDragThreshold,ModifierToggles} from '../../src/runtime/keybindings';

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
 assert.equal(resolvePointer(click,standard,{textEntry:true}),undefined);
 assert.equal(exceedsDragThreshold({x:0,y:0},{x:3,y:4},5),true);
 assert.equal(exceedsDragThreshold({x:0,y:0},{x:3,y:4},6),false);
 assert.throws(()=>exceedsDragThreshold({x:NaN,y:0},{x:3,y:4}));
});
