import test from 'node:test';
import assert from 'node:assert/strict';
import {readSkirmishMemory,writeSkirmishMemory,readMenuMemory,writeMenuMemory,migrateRecordsMemory} from '../../src/app/menu-memory';
import {skirmishPreset} from '../../src/app/skirmish-setup';

function storage(run:(data:Map<string,string>)=>void){
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),data=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)}});
 try{run(data)}finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage')}
}

test('last skirmish settings round-trip with seed, per-slot fields and independent objects',()=>storage(data=>{
 const setup=skirmishPreset('2v2','industrial-valley','random');setup.seed=105;
 setup.slots[0].spawn=3;setup.slots[0].color=8;setup.slots[1].difficulty='hard';
 assert.equal(readSkirmishMemory(),undefined);writeSkirmishMemory(setup);
 assert.equal(data.size,1);assert.deepEqual(JSON.parse([...data.values()][0]),{version:1,setup});
 const remembered=readSkirmishMemory();assert.deepEqual(remembered,setup);
 remembered!.slots[0].name='Changed';assert.deepEqual(readSkirmishMemory(),setup);
}));

test('unknown versions, malformed JSON and invalid saved settings never launch',()=>storage(data=>{
 const setup=skirmishPreset('1v1','copper-junction');writeSkirmishMemory(setup);const key=[...data.keys()][0];
 for(const raw of ['{','null',JSON.stringify({version:2,setup}),JSON.stringify({version:1,setup:{...setup,startingCredits:-1}}),'x'.repeat(16385)]){data.set(key,raw);assert.equal(readSkirmishMemory(),undefined)}
}));

test('invalid writes preserve the previous valid memory',()=>storage(()=>{
 const setup=skirmishPreset('1v1','copper-junction');writeSkirmishMemory(setup);
 writeSkirmishMemory({...setup,slots:[]});assert.deepEqual(readSkirmishMemory(),setup);
}));

test('blocked and missing storage do not prevent setup or launch',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try{
  Reflect.deleteProperty(globalThis,'localStorage');assert.equal(readSkirmishMemory(),undefined);
  assert.doesNotThrow(()=>writeSkirmishMemory(skirmishPreset('1v1','copper-junction')));
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Storage blocked')}});
  assert.equal(readSkirmishMemory(),undefined);assert.doesNotThrow(()=>writeSkirmishMemory(skirmishPreset('ffa','industrial-valley')));
 }finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage')}
});

test('campaign memory validates, migrates records choices and preserves legacy tabs',()=>storage(data=>{
 data.set('frontline.records.ui.v1',JSON.stringify({campaignFaction:'IR',campaignDifficulty:'hard',optionsTab:'audio'}));
 assert.deepEqual(readMenuMemory(),{campaignFaction:'IR',campaignDifficulty:'hard'});
 assert.deepEqual(migrateRecordsMemory(),readMenuMemory());assert.equal(JSON.parse(data.get('frontline.records.ui.v1')!).optionsTab,'audio');
 writeMenuMemory({campaignFaction:'SA'});assert.deepEqual(readMenuMemory(),{campaignFaction:'SA',campaignDifficulty:'hard'});
 writeMenuMemory({campaignFaction:'bad',campaignDifficulty:'bad'} as any);assert.deepEqual(readMenuMemory(),{campaignFaction:'SA',campaignDifficulty:'hard'});
 data.set('frontline.menu.v1','{');data.set('frontline.records.ui.v1','null');assert.deepEqual(readMenuMemory(),{campaignFaction:'US',campaignDifficulty:'normal'});
}));
test('campaign memory ignores hostile storage and invalid legacy fields',()=>storage(data=>{
 data.set('frontline.records.ui.v1',JSON.stringify({campaignFaction:'enemy',campaignDifficulty:'impossible'}));
 assert.deepEqual(readMenuMemory(),{campaignFaction:'US',campaignDifficulty:'normal'});
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('blocked')}});
 assert.deepEqual(readMenuMemory(),{campaignFaction:'US',campaignDifficulty:'normal'});assert.doesNotThrow(()=>writeMenuMemory({campaignDifficulty:'easy'}));
}));
