import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {create} from '@bufbuild/protobuf';
import {EventSchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex} from '../../src/content/catalog';
import {combatCue,CombatTimeline} from '../../src/app/combat-presentation';
import type {TacticalProjectile} from '../../src/app/tactical-presentation';
const catalog=new CatalogIndex(JSON.parse(readFileSync('../pkg/content/rules.json','utf8')));
const event=(id=1,kind='impact',tick=100,combat:unknown={weapon:'RIF',outcome:'hit',targetArmor:'infantry',coverMitigated:true})=>Object.assign(create(EventSchema,{id,kind,tick,entity:4,position:{x:4000,y:5000},owner:2,scope:'visible'}),{combat});
function snapshot(tick=100,events:ReturnType<typeof event>[]=[],player=1){return Object.assign(create(PlayerSnapshotSchema,{tick,player,entities:[{id:4,type:'IR.rifle',owner:2,health:700,complete:true,enabled:true}],players:[{id:1,team:1},{id:2,team:2},{id:3,team:1}]}),{events})}
const body=(x:number,extra:Partial<TacticalProjectile>={}):TacticalProjectile=>({id:20,owner:2,weapon:'TANK',interceptable:false,bodyPosition:{x,y:6000},bodyEffect:'fx.projectile.shell_cannon',...extra});

test('confirmed hits and cover select exact art IDs; ambiguity never becomes miss or blocked',()=>{
 const e=event(),s=snapshot(100,[e]);const cue=combatCue(e,s,catalog)!;
 assert.equal(cue.kind,'hit');assert.equal(cue.armor,'infantry');assert.equal(cue.cover,true);assert.equal(cue.anchor,4);
 assert.deepEqual(cue.effects,['fx.impact.hit_infantry','fx.impact.cover_mitigated']);
 for(const meta of [undefined,{weapon:'RIF'},{weapon:'RIF',outcome:'miss'},{weapon:'RIF',outcome:'blocked'},{weapon:'ART',outcome:'hit',targetArmor:'infantry'}]){
  const ambiguous=combatCue(Object.assign(event(),{combat:meta}),s,catalog)!;assert.equal(ambiguous.kind,'impact');assert.equal(ambiguous.anchor,undefined);assert.equal(ambiguous.cover,false);
 }
 assert.equal(combatCue(event(1,'impact',100,{weapon:'ART'}),s,catalog)!.effects[0],'fx.explosion.blast_radius_2');
 assert.equal(combatCue(event(1,'impact',100,{weapon:'IR_ART'}),s,catalog)!.effects[0],'fx.explosion.blast_radius_1_5');
});

test('interception is a warning-point outcome distinct from a launch or decoy',()=>{
 const s=snapshot();
 const intercepted=combatCue(event(1,'missile_intercepted'),s,catalog)!;
 assert.equal(intercepted.kind,'intercepted');assert.equal(intercepted.anchor,undefined);assert.deepEqual(intercepted.effects,['fx.impact.intercepted_missile']);
 const decoy=combatCue(event(2,'decoy_triggered'),s,catalog)!;assert.equal(decoy.kind,'decoy');assert.equal(decoy.anchor,4);
 assert.equal(combatCue(event(3,'interceptor_fired'),s,catalog)!.kind,'interceptor-launch');
 const muzzle=combatCue(event(4,'weapon_fired',100,{weapon:'TANK'}),s,catalog)!;assert.equal(muzzle.effects[0],'fx.weapon_muzzle.TANK');
});

test('scope, future events, stale cues and unsupported kinds fail closed',()=>{
 const s=snapshot();for(const patch of [{scope:'owner',owner:2},{scope:'team',owner:2},{tick:101},{tick:60},{kind:'route_blocked'},{position:undefined},{id:NaN}])assert.equal(combatCue({...event(),...patch},s,catalog),undefined,JSON.stringify(patch));
 assert.ok(combatCue({...event(),scope:'team',owner:3},s,catalog));
});

test('timeline deduplicates aggregates, freezes paused tick, expires and ignores future watermark',()=>{
 const timeline=new CombatTimeline();timeline.sync(snapshot(99),catalog);
 timeline.sync(snapshot(100,[event(3),event(1),event(3),event(2)]),catalog);assert.deepEqual(timeline.values.map(c=>c.id),[1,2,3]);
 const before=structuredClone(timeline.values);timeline.sync(snapshot(100,[event(1),event(2),event(3),event(999,'impact',101)]),catalog);assert.deepEqual(timeline.values,before);
 timeline.sync(snapshot(101,[event(4,'weapon_fired',101,{weapon:'TANK'}),event(Infinity)]),catalog);assert.deepEqual(timeline.values.map(c=>c.id),[1,2,3,4]);
 timeline.sync(snapshot(114),catalog);assert.deepEqual(timeline.values,[]);
});

test('first load, replacement, perspective, rewind and long gaps establish empty baselines',()=>{
 for(const reset of ['first','replace','perspective','rewind','gap']){
  const timeline=new CombatTimeline();if(reset!=='first'){timeline.sync(snapshot(99),catalog);timeline.sync(snapshot(100,[event()]),catalog);assert.equal(timeline.values.length,1)}
  const s=reset==='rewind'?snapshot(80,[event(2,'impact',80)]):reset==='gap'?snapshot(150,[event(2,'impact',150)]):snapshot(101,[event(2,'impact',101)],reset==='perspective'?2:1);
  timeline.sync(s,catalog,[],reset==='replace');assert.deepEqual(timeline.values,[],reset);
  timeline.sync(s,catalog);assert.deepEqual(timeline.values,[],reset+' duplicate');
 }
});

test('lost hit anchors disappear immediately, without manufacturing death or hidden locations',()=>{
 const timeline=new CombatTimeline();timeline.sync(snapshot(99),catalog);timeline.sync(snapshot(100,[event()]),catalog);
 const hidden=snapshot(101);hidden.entities=[];timeline.sync(hidden,catalog);assert.deepEqual(timeline.values,[]);
 timeline.sync(snapshot(102),catalog);assert.deepEqual(timeline.values,[]);
});

test('trails retain only successive authorized samples and reset on loss, reuse or replacement',()=>{
 const timeline=new CombatTimeline();timeline.sync(snapshot(100),catalog,[body(4000)]);
 timeline.sync(snapshot(101),catalog,[body(4500)]);assert.equal(timeline.projectiles[0].samples.length,2);
 const frozen=structuredClone(timeline.projectiles);timeline.sync(snapshot(101),catalog,[body(4500)]);assert.deepEqual(timeline.projectiles,frozen);
 timeline.sync(snapshot(102),catalog,[body(5000,{bodyPosition:undefined})]);assert.equal(timeline.projectiles.length,0);
 timeline.sync(snapshot(103),catalog,[body(5500)]);assert.equal(timeline.projectiles[0].samples.length,1);
 timeline.sync(snapshot(104),catalog,[body(6000,{owner:3})]);assert.equal(timeline.projectiles[0].samples.length,1);
 timeline.sync(snapshot(105),catalog,[body(6500,{owner:3})],true);assert.equal(timeline.projectiles[0].samples.length,1);
 timeline.sync(snapshot(106),catalog,[]);assert.equal(timeline.projectiles.length,0);
});

test('full legal actor-scale burst preserves all essential cues independently of decoration budgets',()=>{
 const timeline=new CombatTimeline();timeline.sync(snapshot(99),catalog);
 const events=Array.from({length:688},(_,i)=>event(i+1,'missile_intercepted'));
 timeline.sync(snapshot(100,events),catalog);assert.equal(timeline.values.length,688);
 timeline.sync(snapshot(101,events),catalog);assert.equal(timeline.values.length,688);
 timeline.sync(snapshot(130),catalog);assert.equal(timeline.values.length,0);
});
