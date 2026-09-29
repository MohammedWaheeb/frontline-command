import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ExpansionCommander,captureStationOwnerAllowed} from './expansion-commander.mjs';
import {ExpansionCommander as Original} from '../../multiplayer-current-loader-v1/prepared-03/source/expansion-commander.mjs';
const receipt=JSON.parse(readFileSync(new URL('../fixtures/export-receipt.json',import.meta.url)));
const fixture=name=>{const b=readFileSync(new URL('../fixtures/'+name,import.meta.url));assert.equal(createHash('sha256').update(b).digest('hex'),receipt.outputs[name].sha256);return JSON.parse(b)};
const original=fixture('owner2-midpoint.json'),catalog=fixture('catalog.json');
function harness(Class=ExpansionCommander,view=structuredClone(original)){
 const sent=[],c=new Class({player:2,map:{width:160,height:160},catalog,view:()=>view,send:async(orders,note)=>{sent.push({orders,note});return orders.map(()=>({accepted:true,code:'ok'}))},advice:async()=>{throw Error('Unexpected advisory request')}});
 const context=()=>({own:c.own(view).filter(e=>e.id===1033),seen:view.entities.filter(e=>e.owner!==2&&catalog.units.find(u=>u.id===e.type)?.weapon),building:()=>[]});
 return {view,c,sent,run:()=>c.logistics(view,context())};
}
test('earned owner2 midpoint reproduces original impossible station intent and successor emits none',async()=>{
 assert.equal(original.tick,21895);assert.equal(original.stations[0].owner,3);assert(original.players.find(p=>p.id===3).defeated);
 const before=JSON.stringify(original),old=harness(Original),fixed=harness();await old.run();await fixed.run();
 assert.deepEqual(old.sent.map(s=>s.orders),[[{kind:'capture',target:10,entities:[1033]}]]);assert.deepEqual(fixed.sent,[]);assert.equal(JSON.stringify(original),before);
});
test('public neutral and active enemy remain eligible; own, allied, defeated and unknown do not',()=>{
 const v=structuredClone(original);assert(captureStationOwnerAllowed(v,2,0));assert(captureStationOwnerAllowed(v,2,4));
 for(const owner of [1,2,3,99])assert.equal(captureStationOwnerAllowed(v,2,owner),false);
 v.players.find(p=>p.id===4).team=2;assert.equal(captureStationOwnerAllowed(v,2,4),false);
 v.players.find(p=>p.id===2).defeated=true;assert.equal(captureStationOwnerAllowed(v,2,0),false);
});
test('explicit synthetic owner variants of earned public view preserve actual capture intent when legal',async()=>{
 for(const owner of [0,4]){const h=harness();h.view.stations[0].owner=owner;await h.run();assert.deepEqual(h.sent.map(s=>s.orders),[[{kind:'capture',target:10,entities:[1033]}]])}
});
test('ineligible nearer station cannot starve an eligible public alternative',async()=>{
 const h=harness();const old=h.view.stations[0];h.view.stations.push({...structuredClone(old),id:11,owner:0,position:{x:old.position.x+1,y:old.position.y}});await h.run();assert.equal(h.sent[0].orders[0].target,11);
});
test('fog and visible armed threat checks remain in force',async()=>{
 const h=harness();h.view.stations[0].owner=0;const p=h.view.stations[0].position;h.view.visible[Math.floor(p.y/1000)*160+Math.floor(p.x/1000)]=false;await h.run();assert.deepEqual(h.sent,[]);
 const armed=harness();armed.view.stations[0].owner=0;const type=catalog.units.find(u=>u.weapon).id;armed.view.entities.push({id:999999,type,owner:4,health:1000,position:{...p}});await armed.run();assert.deepEqual(armed.sent,[]);
});
test('newly published public defeat before logistics is honored without hidden-state access',async()=>{
 const h=harness();const stale=structuredClone(h.view);stale.players.find(p=>p.id===3).defeated=false;
 await h.c.logistics(stale,{own:h.c.own(stale).filter(e=>e.id===1033),seen:[],building:()=>[]});assert.deepEqual(h.sent,[]);
 for(const poison of ['state','hiddenEntities','enemyEconomy'])Object.defineProperty(h.view,poison,{get(){throw Error('Private-state access')}});
 await h.run();assert.deepEqual(h.sent,[]);
});
