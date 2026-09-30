import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {create} from '@bufbuild/protobuf';
import {combatSound} from '../../src/audio/combat-sound';
// This file is copied beside the real client runtime tests for the combined
// source qualification. No fake catalog or new protocol fields are introduced.
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {AudioDirector} from '../../src/audio/director';
import type {AudioMixer} from '../../src/audio/mixer';
import {EventSchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
const catalog=new CatalogIndex(JSON.parse(await readFile('../pkg/content/rules.json','utf8')) as Catalog);
const state=(tick:number)=>create(PlayerSnapshotSchema,{tick,player:1,players:[{id:1,team:1,faction:'IR'}]});
const event=(kind:string,id:number)=>create(EventSchema,{id,tick:11,kind,entity:0,owner:1,position:{x:8000,y:8000},combat:{weapon:'IR_SHAHED'}});
test('terminal Shahed plays one explicit payload without hidden victim or early firing audio',()=>{
 assert(catalog.weapons.has('IR_SHAHED'),'requires the actual merged 29-weapon catalog');
 const old=state(10),live=state(11),fire=event('weapon_fired',1),impact=event('impact',2);
 assert.equal(combatSound(fire,live,old,catalog),undefined);
 assert.equal(combatSound(impact,live,old,catalog)?.sound,'sfx.weapon.IR_SHAHED');
 assert.equal(combatSound(impact,live,old,undefined)?.sound,'sfx.impact_ground');
 const missing=event('impact',3);delete missing.combat;
 assert.equal(combatSound(missing,live,old,catalog)?.sound,'sfx.impact_ground');
 const invalid=event('impact',4);invalid.combat!.weapon='INVALID';
 assert.equal(combatSound(invalid,live,old,catalog)?.sound,'sfx.impact_ground');
});
test('director consumes terminal pair once, skips future cues and baselines seeks',()=>{
 const sounds:string[]=[];
 const mixer={play:(id:string)=>sounds.push(id),caption:()=>{},music:()=>{},continuous:()=>{},reset:()=>{},manifest:undefined} as unknown as AudioMixer;
 const director=new AudioDirector(mixer,()=>catalog);director.snapshot(state(10));
 const live=state(11),fire=event('weapon_fired',1),impact=event('impact',2);live.events=[fire,impact,fire,impact];
 director.snapshot(live);director.snapshot(live);assert.deepEqual(sounds,['sfx.weapon.IR_SHAHED']);
 director.discontinuity();director.snapshot(live);assert.equal(sounds.length,1);
 const future=event('impact',3);future.tick=20;const before=state(12);before.events=[future];director.snapshot(before);assert.equal(sounds.length,1);
 const due=state(20);due.events=[future];director.snapshot(due);assert.equal(sounds.length,2);
});
