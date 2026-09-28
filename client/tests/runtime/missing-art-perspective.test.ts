import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,EventSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex} from '../../src/content/catalog';
import {CombatEffects} from '../../src/render/combat-effects';
import {BattlefieldRenderer} from '../../src/render/battlefield';

const catalog=new CatalogIndex(JSON.parse(readFileSync('../pkg/content/rules.json','utf8')));
function snapshot(tick:number,player=1,fired=false){
 const s=create(PlayerSnapshotSchema,{tick,player,players:[{id:1,team:1},{id:2,team:2}],entities:fired?[{id:4,type:'US.tank',owner:1,health:1000,complete:true,enabled:true,position:{x:4000,y:5000}}]:[]});
 if(fired)s.events=[Object.assign(create(EventSchema,{id:tick,tick,kind:'weapon_fired',entity:4,owner:1,scope:'visible',position:{x:4000,y:5000}}),{combat:{weapon:'TANK'}})];
 return s;
}
test('late failed FX load cannot disclose a prior perspective through missing-art diagnostics',async()=>{
 const effects=new CombatEffects(catalog,{width:32,height:32}),internal=effects as any,id='fx.weapon_muzzle.TANK';
 let resolve!:(sheet:undefined)=>void;const late=new Promise<undefined>(finish=>resolve=finish);
 internal.library.has=()=>true;internal.library.load=()=>late;
 try{
  effects.sync(snapshot(99),[]);effects.sync(snapshot(100,1,true),[]);internal.request(id);
  effects.sync(snapshot(101,2),[],true);resolve(undefined);await late;await Promise.resolve();
  assert(internal.missing.has(id),'failure can remain in the resource cache');assert.deepEqual(effects.diagnostics.missing,[]);
  effects.sync(snapshot(102,1),[],true);effects.sync(snapshot(103,1,true),[]);assert.deepEqual(effects.diagnostics.missing,[id],'a new authorized occurrence may report the cached failure');
  effects.sync(snapshot(110),[]);assert.deepEqual(effects.diagnostics.missing,[],'expired cues no longer report past asset names');
  effects.sync(snapshot(111,1,true),[]);effects.reset();assert.deepEqual(effects.diagnostics.missing,[]);
 }finally{await effects.dispose()}
});
test('actor fallback and payload diagnostics are derived from current visible actors',()=>{
 const renderer=Object.create(BattlefieldRenderer.prototype) as BattlefieldRenderer,internal=renderer as any;
 internal.environment={missingArt:[]};internal.combat={diagnostics:{missing:[]}};
 const actor={entity:{type:'US.tank'},root:{visible:true},standIn:true,missingArt:false,missingPayloadArt:'fire_empty'};
 internal.actors=new Map([[4,actor]]);assert.deepEqual(renderer.missingArt,['US.tank','US.tank:fire_empty']);
 actor.root.visible=false;assert.deepEqual(renderer.missingArt,[]);
 actor.root.visible=true;actor.standIn=false;actor.missingPayloadArt='';assert.deepEqual(renderer.missingArt,[]);
 actor.standIn=true;internal.actors.clear();assert.deepEqual(renderer.missingArt,[],'perspective removal leaves no historical actor-type set');
});
