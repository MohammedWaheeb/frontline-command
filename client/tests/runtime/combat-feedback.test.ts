import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {create} from '@bufbuild/protobuf';
import {EventSchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex} from '../../src/content/catalog';
import {combatFacts} from '../../src/app/combat-feedback';

const catalog=new CatalogIndex(JSON.parse(readFileSync('../pkg/content/rules.json','utf8')));
const snapshot=()=>create(PlayerSnapshotSchema,{tick:100,player:1,entities:[
 {id:4,type:'US.fighter',owner:2,health:800,complete:true,enabled:true,landed:true,position:{x:4000,y:5000}},
 {id:7,type:'IR.rifle',owner:2,health:600,complete:true,enabled:true},
]});
const event=(combat:unknown,patch:Record<string,unknown>={})=>Object.assign(create(EventSchema,{id:30,tick:100,kind:'impact',entity:4,position:{x:4000,y:5000},...patch}),{combat});

test('shot weapon and resolved armor survive source loss, conversion and landed aircraft',()=>{
 const s=snapshot(),e=event({weapon:'TANK',outcome:'hit',targetArmor:'light'}),before=structuredClone({s,e});
 assert.deepEqual(combatFacts(e,s,catalog),{metadata:'known',weapon:'TANK',weaponKind:'cannon',hit:true,target:4,targetArmor:'light',coverMitigated:false});
 s.entities.push(create(PlayerSnapshotSchema,{entities:[{id:8,type:'SY.car',owner:3}]}).entities[0]);
 assert.equal(combatFacts(e,s,catalog).weapon,'TANK');
 assert.deepEqual(e,before.e);assert.deepEqual(s.entities.slice(0,2),before.s.entities);
});

test('legacy absence and malformed metadata remain distinct and never claim a miss',()=>{
 for(const raw of [undefined,null])assert.equal(combatFacts(event(raw),snapshot(),catalog).metadata,'absent');
 for(const raw of [false,[],{},'TANK',{weapon:'unlisted'}])assert.deepEqual(combatFacts(event(raw),snapshot(),catalog),{metadata:'invalid',hit:false,coverMitigated:false});
 for(const outcome of [undefined,'miss','blocked','intercepted','']){
  const facts=combatFacts(event({weapon:'TANK',outcome,targetArmor:'heavy'}),snapshot(),catalog);
  assert.equal(facts.metadata,'known');assert.equal(facts.hit,false);assert.equal(facts.targetArmor,undefined);
 }
});

test('positive hit facts cannot recover a removed, contained, dead or undisclosed target',()=>{
 for(const change of ['absent','dead','destroyed','contained','zero','unknown-armor']){
  const s=snapshot(),e=event({weapon:'RIF',outcome:'hit',targetArmor:change==='unknown-armor'?'secret':'infantry',coverMitigated:true},{entity:change==='zero'?0:7});
  const target=s.entities[1];
  if(change==='absent')s.entities.pop();if(change==='dead')target.health=0;if(change==='destroyed')target.state='destroyed';
  if(change==='contained')target.private=create(PlayerSnapshotSchema,{entities:[{private:{container:90}}]}).entities[0].private;
  const facts=combatFacts(e,s,catalog);assert.equal(facts.hit,false,change);assert.equal(facts.coverMitigated,false,change);assert.equal(facts.target,undefined,change);
 }
});

test('area and strategic metadata never manufacture victim identity',()=>{
 for(const weapon of ['ART','IR_ART','SY_ART','MISSILE','IR_MISSILE','SY_ROCKET','SATURATION','SKYBREAKER']){
  const facts=combatFacts(event({weapon,outcome:'hit',targetArmor:'infantry',coverMitigated:true},{entity:7}),snapshot(),catalog);
  assert.equal(facts.weapon,weapon);assert.equal(facts.hit,false);assert.equal(facts.target,undefined);assert.equal(facts.coverMitigated,false);
 }
});

test('cover feedback requires explicit positive small-arm mitigation on infantry',()=>{
 for(const weapon of ['RIF','AUTO'])assert.equal(combatFacts(event({weapon,outcome:'hit',targetArmor:'infantry',coverMitigated:true},{entity:7}),snapshot(),catalog).coverMitigated,true);
 for(const extra of [{weapon:'TANK'},{targetArmor:'heavy'},{coverMitigated:false},{coverMitigated:1},{coverMitigated:undefined}]){
  assert.equal(combatFacts(event({weapon:'RIF',outcome:'hit',targetArmor:'infantry',coverMitigated:true,...extra},{entity:7}),snapshot(),catalog).coverMitigated,false);
 }
 const fired=combatFacts(event({weapon:'AUTO',outcome:'hit',targetArmor:'infantry',coverMitigated:true},{kind:'weapon_fired',entity:7}),snapshot(),catalog);
 assert.equal(fired.weapon,'AUTO');assert.equal(fired.hit,false);assert.equal(fired.coverMitigated,false);
 assert.equal(combatFacts(event({weapon:'AUTO'},{kind:'destroyed'}),snapshot(),catalog).metadata,'invalid');
});
