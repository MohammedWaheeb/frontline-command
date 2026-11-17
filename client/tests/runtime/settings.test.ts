import test from 'node:test';
import assert from 'node:assert/strict';
import {applySettingsToDocument,readSettingsMirror,sanitizeSettings,DEFAULT_SETTINGS,resetPreferences,resetAudioSettings,resetDisplaySettings,resetCameraSettings,resetControlSettings,resetAccessibilitySettings,resetSettingsSection} from '../../src/app/settings';
import {defaultBindings,remapBindings,resolveShortcut} from '../../src/runtime/keybindings';

test('new settings use edge scrolling and damaged health bars; migration preserves explicit old preferences',()=>{
 assert.equal(DEFAULT_SETTINGS.edgeScroll,true);assert.equal(DEFAULT_SETTINGS.healthBars,'damaged');
 const fresh=sanitizeSettings(undefined);assert.equal(fresh.edgeScroll,true);assert.equal(fresh.healthBars,'damaged');
 const missing=sanitizeSettings({version:1,firstRunComplete:true});assert.equal(missing.edgeScroll,true);assert.equal(missing.healthBars,'damaged');
 for(const healthBars of ['selected','always','damaged'] as const){
  const saved=sanitizeSettings({version:1,edgeScroll:false,healthBars});assert.equal(saved.edgeScroll,false);assert.equal(saved.healthBars,healthBars);
 }
 const partial=sanitizeSettings({edgeScroll:false});assert.equal(partial.edgeScroll,false);assert.equal(partial.healthBars,'damaged');
});

test('saved Classic and customized key maps survive default layout migration without filling new actions',()=>{
 const legacy=defaultBindings('classic','classic');
 // Old version-one records did not contain the new action identifiers.
 for(const action of Object.keys(legacy.keys))if(legacy.keys[action].length===0)delete legacy.keys[action];
 const edited=remapBindings(legacy,{attack_move:[{code:'KeyJ'}]}).bindings!;
 const saved={version:1,edgeScroll:false,healthBars:'selected',bindings:edited};
 const migrated=sanitizeSettings(saved);assert.deepEqual(migrated.bindings,edited);
 assert.equal(resolveShortcut({code:'KeyJ'},migrated.bindings)?.action,'attack_move');
 assert.equal(resolveShortcut({code:'KeyE'},migrated.bindings)?.action,'escort');
 assert.equal(resolveShortcut({code:'KeyQ'},migrated.bindings),undefined);
 migrated.bindings.keys.attack_move[0].code='KeyI';assert.equal(edited.keys.attack_move[0].code,'KeyJ');
});

test('missing settings bindings are independent of shared defaults',()=>{
 const first=sanitizeSettings(undefined),second=sanitizeSettings(undefined);first.bindings.keys.move[0].code='KeyJ';
 assert.equal(second.bindings.keys.move[0].code,'KeyM');assert.equal(DEFAULT_SETTINGS.bindings.keys.move[0].code,'KeyM');
});

function stubGlobals(reduce:boolean,stored?:unknown){
 const original=new Map<string,PropertyDescriptor|undefined>();
 const replace=(name:string,value:unknown)=>{original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,value})};
 const dataset:Record<string,string>={},props=new Map<string,string>();
 replace('document',{documentElement:{dataset,style:{setProperty:(k:string,v:string)=>props.set(k,v)}}});
 replace('localStorage',{getItem:(k:string)=>k==='frontline.settings.v1'&&stored!==undefined?JSON.stringify(stored):null,setItem:()=>{}});
 replace('matchMedia',(query:string)=>({matches:reduce&&query.includes('prefers-reduced-motion'),media:query}));
 return {dataset,props,restore(){for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name)}}};
}

test('persisted settings migrate missing fields and retain saved camera, display and customized controls',()=>{
 const bindings=remapBindings(defaultBindings('standard','classic'),{attack_move:[{code:'KeyJ'}]}).bindings!;
 const saved=stubGlobals(false,{version:1,edgeScroll:false,healthBars:'selected',bindings});
 try{
  const migrated=readSettingsMirror();assert.equal(migrated.edgeScroll,false);assert.equal(migrated.healthBars,'selected');assert.deepEqual(migrated.bindings,bindings);
 }finally{saved.restore()}
 const partial=stubGlobals(false,{version:1,firstRunComplete:true});
 try{const migrated=readSettingsMirror();assert.equal(migrated.edgeScroll,true);assert.equal(migrated.healthBars,'damaged')}finally{partial.restore()}
});

test('in-game reduced motion toggle drives the CSS data-reduced-motion contract',()=>{
 const env=stubGlobals(false);
 try{
  applySettingsToDocument({...sanitizeSettings(undefined),reducedMotion:true});
  assert.equal(env.dataset.reducedMotion,'true');
  applySettingsToDocument({...sanitizeSettings(undefined),reducedMotion:false});
  assert.equal(env.dataset.reducedMotion,'false');
 }finally{env.restore()}
});

test('first-run defaults honor the operating system reduced-motion preference',()=>{
 const env=stubGlobals(true);
 try{
  assert.equal(readSettingsMirror().reducedMotion,true);
 }finally{env.restore()}
 const plain=stubGlobals(false);
 try{
  assert.equal(readSettingsMirror().reducedMotion,false);
 }finally{plain.restore()}
});

test('an explicitly saved motion preference wins over the OS default',()=>{
 const env=stubGlobals(true,{...DEFAULT_SETTINGS,reducedMotion:false});
 try{
  assert.equal(readSettingsMirror().reducedMotion,false);
 }finally{env.restore()}
});
test('reset all preferences requires explicit confirmation and preserves onboarding and consent',()=>{
 const current=sanitizeSettings({...DEFAULT_SETTINGS,firstRunComplete:true,audioConsent:true,uiScale:1.5,reducedMotion:true,audio:{...DEFAULT_SETTINGS.audio,music:0}}),before=structuredClone(current);
 assert.deepEqual(resetPreferences(current),current);assert.deepEqual(resetPreferences(current,false),current);
 const reset=resetPreferences(current,true);assert.equal(reset.firstRunComplete,true);assert.equal(reset.audioConsent,true);assert.equal(reset.uiScale,1);assert.equal(reset.audio.music,DEFAULT_SETTINGS.audio.music);assert.equal(reset.reducedMotion,false);
 reset.bindings.keys.move[0].code='KeyZ';assert.deepEqual(current,before);assert.notEqual(reset.bindings.keys.move[0].code,DEFAULT_SETTINGS.bindings.keys.move[0].code);
});
test('each reset section leaves unrelated preferences intact and returns independent nested defaults',()=>{
 const current=sanitizeSettings({...DEFAULT_SETTINGS,firstRunComplete:true,audioConsent:true,uiScale:1.5,reducedMotion:true,edgeScroll:true,selectionTolerance:15,audio:{...DEFAULT_SETTINGS.audio,music:0}}),before=structuredClone(current);
 const audio=resetAudioSettings(current);assert.equal(audio.audio.music,DEFAULT_SETTINGS.audio.music);assert.equal(audio.uiScale,1.5);assert.equal(audio.reducedMotion,true);
 const display=resetDisplaySettings(current);assert.equal(display.uiScale,1);assert.equal(display.audio.music,0);assert.equal(display.edgeScroll,true);
 const camera=resetCameraSettings(current);assert.equal(camera.edgeScroll,true);assert.equal(camera.selectionTolerance,15);
 const controls=resetControlSettings(current);assert.equal(controls.selectionTolerance,6);assert.equal(controls.edgeScroll,true);
 const access=resetAccessibilitySettings(current);assert.equal(access.reducedMotion,false);assert.equal(access.uiScale,1.5);assert.equal(access.audio.music,0);
 for(const result of [audio,display,camera,controls,access]){assert.equal(result.firstRunComplete,true);assert.equal(result.audioConsent,true)}
 audio.audio.music=0.1;assert.equal(DEFAULT_SETTINGS.audio.music,0.6);assert.deepEqual(current,before);
});

test('diagnostics is opt-in, persists and resets with display preferences',()=>{
 assert.equal(sanitizeSettings(undefined).diagnostics,false);assert.equal(sanitizeSettings({diagnostics:'true'}).diagnostics,false);
 const enabled=sanitizeSettings({diagnostics:true});assert.equal(enabled.diagnostics,true);assert.equal(resetSettingsSection(enabled,'display').diagnostics,false);
});
