import test from 'node:test';
import assert from 'node:assert/strict';
import {applySettingsToDocument,readSettingsMirror,sanitizeSettings,DEFAULT_SETTINGS} from '../../src/app/settings';

function stubGlobals(reduce:boolean,stored?:unknown){
 const original=new Map<string,PropertyDescriptor|undefined>();
 const replace=(name:string,value:unknown)=>{original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,value})};
 const dataset:Record<string,string>={},props=new Map<string,string>();
 replace('document',{documentElement:{dataset,style:{setProperty:(k:string,v:string)=>props.set(k,v)}}});
 replace('localStorage',{getItem:(k:string)=>k==='frontline.settings.v1'&&stored!==undefined?JSON.stringify(stored):null,setItem:()=>{}});
 replace('matchMedia',(query:string)=>({matches:reduce&&query.includes('prefers-reduced-motion'),media:query}));
 return {dataset,props,restore(){for(const [name,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name)}}};
}

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
