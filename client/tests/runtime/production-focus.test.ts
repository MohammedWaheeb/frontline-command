import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {create} from '@bufbuild/protobuf';
import {EntitySchema,PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex} from '../../src/content/catalog';
import {productionCategories,productionSources,productionFocus,selectionAffordances} from '../../src/app/production-focus';
const catalog=new CatalogIndex(JSON.parse(readFileSync('../pkg/content/rules.json','utf8')));
const entity=(id:number,type:string,extra:object={})=>create(EntitySchema,{id,type,owner:1,complete:true,enabled:true,private:{hp:100n},...extra});
const frame=()=>create(PlayerSnapshotSchema,{player:1,players:[{id:1,faction:'US'}],entities:[entity(1,'US.rig'),entity(2,'US.rifle'),entity(3,'barracks'),entity(4,'factory'),entity(5,'US.airfield')]});
test('production navigation keeps the chosen facility while combat selection changes',()=>{
 const f=frame();assert.deepEqual(productionSources(f,catalog).map(e=>e.id),[1,3,4,5]);
 assert.equal(productionFocus(f,catalog,3,[2]),3);assert.equal(productionFocus(f,catalog,3,[5]),5);
 assert.equal(productionFocus(f,catalog,3,[1,2,3,4,5]),3);
 assert.equal(productionFocus(f,catalog,3,[2],'aircraft'),5);assert.equal(productionFocus(f,catalog,5,[],'structures'),1);
 assert.ok(productionCategories(f.entities[2],catalog,'US').includes('infantry'));
 assert.ok(productionCategories(f.entities[3],catalog,'US').includes('vehicles'));
});
test('producer focus discards dead, carried, removed and foreign sources without inferring availability',()=>{
 const f=frame();f.entities[2].owner=2;f.entities[3].private!.hp=0n;f.entities[4].private!.container=9;
 assert.deepEqual(productionSources(f,catalog).map(e=>e.id),[1]);assert.equal(productionFocus(f,catalog,3,[]),1);
 f.entities=[entity(8,'US.airfield',{enabled:false,complete:false}),entity(9,'US.airfield')];
 assert.equal(productionFocus(f,catalog,undefined,[],'aircraft'),9);assert.equal(productionFocus(f,catalog,8,[],'aircraft'),8);
 assert.equal(productionFocus(f,catalog,8,[],'infantry'),undefined);f.entities=[];assert.equal(productionFocus(f,catalog,8,[]),undefined);
});
test('sidebar advice never leaks production actions into selected troops or mutates Go advice',()=>{
 const troop={id:2,commands:['move','attack'],abilities:[],builds:[],trains:[],research:[]},factory={id:4,commands:['train','sell'],abilities:[],builds:[],trains:['US.tank'],research:[]};
 const advice={tick:10,player:1,entities:[troop,factory],player_commands:['ping']};
 assert.deepEqual(selectionAffordances(advice,[2]).entities,[troop]);assert.deepEqual(selectionAffordances(advice,[]).entities,[]);assert.equal(advice.entities.length,2);
});
