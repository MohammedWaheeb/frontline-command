import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {create} from '@bufbuild/protobuf';
import {combatSound} from '../../src/audio/combat-sound';import {AudioDirector} from '../../src/audio/director';import type {AudioMixer} from '../../src/audio/mixer';import {CatalogIndex,type Catalog} from '../../src/content/catalog';import {EntitySchema,EventSchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
const catalog=new CatalogIndex(JSON.parse(await readFile('../pkg/content/rules.json','utf8')) as Catalog);
const actor=(id:number,type='US.tank',owner=1)=>create(EntitySchema,{id,type,owner,health:1000,complete:true,enabled:true,position:{x:8000,y:8000}});
const state=(tick=10,entities=[actor(1),actor(2,'IR.tank',2)])=>create(PlayerSnapshotSchema,{tick,player:1,entities,players:[{id:1,team:1,faction:'US'},{id:2,team:2,faction:'IR'}]});
function event(kind:string,combat?:unknown,entity=1,id=1,tick=11){const e=create(EventSchema,{id,tick,kind,entity,owner:1,position:{x:8000,y:8000}});if(combat!==undefined)Object.assign(e,{combat});return e}
test('combat audio uses the emitted weapon after source conversion, death or disappearance',()=>{
 const previous=state(),current=state(11,[actor(1,'IR.rifle'),actor(2,'IR.tank',2)]);
 assert.equal(combatSound(event('weapon_fired',{weapon:'TANK'}),current,previous,catalog)?.sound,'sfx.weapon.TANK');current.entities=[];
 assert.equal(combatSound(event('weapon_fired',{weapon:'IR_MISSILE'}),current,previous,catalog)?.sound,'sfx.weapon.IR_MISSILE');
 assert.equal(combatSound(event('weapon_fired',{weapon:'BAD'}),state(11),previous,catalog)?.sound,undefined);
 assert.equal(combatSound(event('weapon_fired',{weapon:'SATURATION'}),current,previous,catalog)?.sound,undefined);
});
test('combat audio consumes positive resolution armor, including landed aircraft, without current type guessing',()=>{
 const previous=state(),current=state(11,[actor(1,'US.fighter')]);current.entities[0].landed=true;
 for(const [targetArmor,sound]of [['infantry','sfx.impact_ground'],['light','sfx.impact_metal_light'],['heavy','sfx.impact_metal_heavy'],['structure','sfx.impact_structure'],['air','sfx.impact_metal_light']])assert.equal(combatSound(event('impact',{weapon:'TANK',outcome:'hit',targetArmor}),current,previous,catalog)?.sound,sound);
 assert.equal(combatSound(event('impact',{weapon:'RIF',outcome:'hit',targetArmor:'infantry',coverMitigated:true}),state(11,[actor(1,'US.rifle')]),previous,catalog)?.sound,'sfx.impact_ground');
});
test('known unknown/area/invalid metadata cannot recover material from current or previous victim',()=>{
 const previous=state(),current=state(11);for(const metadata of [{weapon:'TANK'},{weapon:'BAD',outcome:'hit',targetArmor:'heavy'},{weapon:'ART',outcome:'hit',targetArmor:'heavy'},{weapon:'TANK',outcome:'miss',targetArmor:'heavy'},{weapon:'TANK',outcome:'hit',targetArmor:'unknown'}])assert.equal(combatSound(event('impact',metadata),current,previous,catalog)?.sound,'sfx.impact_ground');
 const hit=event('impact',{weapon:'TANK',outcome:'hit',targetArmor:'heavy'});current.entities=[];assert.equal(combatSound(hit,current,previous,catalog)?.sound,'sfx.impact_ground');hit.entity=0;assert.equal(combatSound(hit,state(11),previous,catalog)?.sound,'sfx.impact_ground');
 assert.equal(combatSound(event('impact',{weapon:'TANK',outcome:'hit',targetArmor:'heavy'}),state(11),previous,undefined)?.sound,'sfx.impact_ground');
});
test('only absent metadata retains older runtime audio behavior',()=>{
 const previous=state(),current=state(11);assert.equal(combatSound(event('weapon_fired'),current,previous,catalog)?.sound,'sfx.weapon.TANK');assert.equal(combatSound(event('impact'),current,previous,catalog)?.sound,'sfx.impact_metal_heavy');
 current.entities=[];assert.equal(combatSound(event('impact'),current,previous,catalog)?.sound,'sfx.impact_metal_heavy');assert.equal(combatSound(event('impact',{}),current,previous,catalog)?.sound,'sfx.impact_ground');
});
function harness(){const sounds:string[]=[],captions:string[]=[];const mixer={play:(id:string)=>sounds.push(id),caption:(text:string)=>captions.push(text),music:()=>{},continuous:()=>{},reset:()=>{},manifest:undefined} as unknown as AudioMixer;return {sounds,captions,director:new AudioDirector(mixer,()=>catalog)}}
test('explicit decoy/interception events remain separate, deduplicate IDs and never guess a defender or failed shot',()=>{
 const h=harness();h.director.snapshot(state());const current=state(11),decoy=event('decoy_triggered',undefined,2,1),intercept=event('missile_intercepted',undefined,0,2);intercept.owner=2;
 current.events=[decoy,intercept,decoy,intercept,event('interceptor_fired',undefined,1,3)];h.director.snapshot(current);h.director.snapshot(state(12));assert.deepEqual(h.sounds,['sfx.intercept_burst']);assert.deepEqual(h.captions,['Decoy defeated an incoming shot.']);
 const unknown=state(13);unknown.events=[event('impact',{weapon:'TANK'},0,4,13)];h.director.snapshot(unknown);assert.deepEqual(h.sounds,['sfx.intercept_burst','sfx.impact_ground']);assert(!h.captions.some(text=>/miss|blocked|defender/i.test(text)));
 h.director.discontinuity();h.director.snapshot(current);assert.equal(h.sounds.length,2);assert.equal(h.captions.length,1);
});
test('director ignores future combat cues and consumes a valid later delivery only once',()=>{
 const h=harness();h.director.snapshot(state());const future=event('weapon_fired',{weapon:'TANK'},1,10,20),current=state(11);current.events=[future];h.director.snapshot(current);assert.equal(h.sounds.length,0);const later=state(20);later.events=[future];h.director.snapshot(later);h.director.snapshot(later);assert.deepEqual(h.sounds,['sfx.weapon.TANK']);
 const restored=harness(),baseline=state(11);baseline.events=[future];restored.director.snapshot(baseline);restored.director.snapshot(later);assert.deepEqual(restored.sounds,['sfx.weapon.TANK']);
});
test('fixed batteries and mobile Aegis warn on owned charge depletion, not ammo or foreign counts',()=>{
 for(const type of ['abm','SA.mobile_abm']){const h=harness(),old=state(10,[actor(1,type)]);old.entities[0].private=create(EntitySchema,{private:{charges:1,ammo:9}}).private;h.director.snapshot(old);const next=state(11,[actor(1,type)]);next.entities[0].private=create(EntitySchema,{private:{charges:0,ammo:9}}).private;h.director.snapshot(next);assert.deepEqual(h.sounds,['vo.announcer.US.interceptor_depleted']);h.director.snapshot(next);assert.equal(h.sounds.length,1)}
 const h=harness(),old=state(10,[actor(1,'abm'),actor(2,'SA.mobile_abm',2)]);old.entities.forEach(e=>e.private=create(EntitySchema,{private:{charges:1,ammo:1}}).private);h.director.snapshot(old);const next=state(11,[actor(1,'abm'),actor(2,'SA.mobile_abm',2)]);next.entities[0].private=create(EntitySchema,{private:{charges:1,ammo:0}}).private;next.entities[1].private=create(EntitySchema,{private:{charges:0,ammo:0}}).private;h.director.snapshot(next);assert.deepEqual(h.sounds,[]);
});
