import test from 'node:test';
import assert from 'node:assert/strict';
import {create} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {economyStatus} from '../../src/app/economy-status';

const catalog=new CatalogIndex({version:'test',units:[{id:'US.hauler',name:'Hauler',role:'hauler'}],buildings:[{id:'supply',name:'Supply center',role:'supply',service_slots:0},{id:'factory',name:'Factory',role:'factory'},{id:'airfield',name:'Airfield',role:'airfield',service_slots:6},{id:'abm',name:'Interceptor',role:'abm'},{id:'strategic',name:'Strategic site',role:'strategic'},{id:'turret',name:'Turret',role:'turret',weapon:'gun'},{id:'hq',name:'HQ',role:'hq'}],upgrades:[],weapons:[]} as unknown as Catalog);
function snapshot(){return create(PlayerSnapshotSchema,{player:1,tick:1300,economy:{powerCapacity:40,powerDemand:80},entities:[{id:1,type:'supply',owner:1,enabled:true,complete:true,private:{hp:1n}},{id:2,type:'US.hauler',owner:1,state:'gathering',private:{hp:1n,field:7}},{id:3,type:'US.hauler',owner:1,state:'gathering',private:{hp:1n,field:7,harvestQueuePosition:2,harvestQueueLength:3}},{id:4,type:'US.hauler',owner:1,state:'returning_cargo',private:{hp:1n,field:7,cargo:600000n}},{id:5,type:'US.hauler',owner:1,state:'no_known_supplies',private:{hp:1n}},{id:6,type:'US.hauler',owner:1,state:'no_supply_center',private:{hp:1n}},{id:8,type:'US.hauler',owner:2,private:{hp:1n,field:7}},{id:9,type:'US.hauler',owner:1,private:{hp:0n,field:7}},{id:10,type:'US.hauler',owner:1},{id:11,type:'US.hauler',owner:1,private:{hp:1n,container:100}}],knownFields:[{id:7,position:{x:1000,y:1000},remaining:100000n,seen:500}]})}
test('owner-only haulers explain routes, idle states and loading bay congestion without refreshing field knowledge',()=>{
 const s=snapshot(),before=structuredClone(s),result=economyStatus(s,catalog);
 assert.deepEqual(result.haulers.map(value=>[value.id,value.state]),[[2,'gathering'],[3,'gathering'],[4,'returning'],[5,'idle_no_known_field'],[6,'blocked']]);
 assert.match(result.haulers[1].reason,/Waiting/);assert.match(result.haulers[4].reason,/supply center/);
 assert.deepEqual(result.congestion.map(value=>[value.field,value.haulerIDs]),[[7,[2,3,4]]]);
 assert.equal(result.fields[0].current,false);assert.equal(result.fields[0].seen,500);assert.equal(result.fields[0].remaining,100000n);
 assert.match(result.summary,/no known supply field/);assert.deepEqual(s,before);
 const two={...s,entities:s.entities.filter(value=>value.id!==4)};assert.deepEqual(economyStatus(two,catalog).congestion,[]);
 const loading=structuredClone(s);loading.entities[1].state='loading';assert.equal(economyStatus(loading,catalog).haulers[0].reason,'Loading supplies.');
});
test('income hides partial extrapolation, accepts a complete observed minute, and rejects stale observations',()=>{
 const s=snapshot(),full={amount:1200500n,fromTick:100,toTick:1300,windowTicks:1200,coverage:'full' as const};
 assert.equal(economyStatus(s,catalog).incomeState,'starting_up');
 assert.equal(economyStatus(s,catalog,{...full,fromTick:1200,windowTicks:100,coverage:'partial'}).incomePerMinute,undefined);
 assert.match(economyStatus(s,catalog).incomeLabel,/starting up/);
 assert.equal(economyStatus(s,catalog,full).incomePerMinute,1200500n);
 assert.equal(economyStatus({...s,tick:1301},catalog,full).incomeState,'starting_up');
 assert.equal(economyStatus({...s,economy:undefined},catalog,full).incomeState,'unavailable');
});
test('low power names affected owned operating buildings and their exact effects',()=>{
 const s=snapshot();s.entities.push(...create(PlayerSnapshotSchema,{entities:[{id:20,type:'factory',owner:1,complete:true,enabled:true,private:{hp:1n,jobs:[{type:'tank'}]}},{id:21,type:'airfield',owner:1,complete:true,enabled:true,private:{hp:1n}},{id:22,type:'abm',owner:1,complete:true,enabled:true,private:{hp:1n}},{id:23,type:'strategic',owner:1,complete:true,enabled:true,private:{hp:1n}},{id:24,type:'turret',owner:1,complete:true,enabled:true,private:{hp:1n}},{id:25,type:'hq',owner:1,complete:true,enabled:true,private:{hp:1n}},{id:26,type:'factory',owner:1,complete:false,enabled:true,private:{hp:1n}},{id:27,type:'factory',owner:1,complete:true,enabled:false,private:{hp:1n,jobs:[{type:'tank'}]}},{id:28,type:'factory',owner:2,complete:true,enabled:true,private:{hp:1n,jobs:[{type:'tank'}]}}]}).entities);
 const power=economyStatus(s,catalog).power;
 assert.equal(power.capacity,40);assert.equal(power.demand,80);assert.equal(power.state,'low');
 assert.deepEqual(power.slowedBuildings.map(value=>value.id),[20,21,22,23,24,25,26]);
 assert.match(power.slowedBuildings.find(value=>value.id===23)!.effects[0],/stopped/);
 assert.match(power.explanation,/demand 80 exceeds capacity 40/);
 assert.deepEqual(economyStatus({...s,economy:{...s.economy!,powerCapacity:80}},catalog).power.slowedBuildings,[]);
 assert.equal(economyStatus({...s,economy:{...s.economy!,powerCapacity:0,powerDemand:0}},catalog).power.state,'normal');
});
test('startup explanation distinguishes absent supply, no haulers and returning first cargo',()=>{
 const s=snapshot();
 assert.match(economyStatus({...s,entities:[]},catalog).summary,/No operating supply/);
 assert.match(economyStatus({...s,entities:s.entities.filter(value=>value.id===1)},catalog).summary,/No haulers/);
 const hauling={...s,entities:s.entities.filter(value=>[1,4].includes(value.id))};assert.match(economyStatus(hauling,catalog).summary,/deliveries add credits/);
});

test('gather orders distinguish travelling empty and cargo returns even when navigation reports moving or turning',()=>{
 const s=snapshot();s.entities=s.entities.filter(entity=>[1,2,3,4].includes(entity.id));
 for(const entity of s.entities.filter(entity=>entity.id!==1)){entity.private!.orders=create(PlayerSnapshotSchema,{entities:[{private:{orders:[{kind:'gather'}]}}]}).entities[0].private!.orders;entity.state=entity.id===3?'turning':'moving'}
 assert.deepEqual(economyStatus(s,catalog).haulers.map(hauler=>hauler.state),['gathering','gathering','returning']);
});
test('manual orders override stale harvest states and field assignments; safety retreat still returns cargo',()=>{
 const s=snapshot();s.entities=s.entities.filter(entity=>[1,2,3,4].includes(entity.id));
 for(const entity of s.entities.filter(entity=>entity.id!==1))entity.private!.orders=create(PlayerSnapshotSchema,{entities:[{private:{orders:[{kind:entity.id===3?'guard':'move'}]}}]}).entities[0].private!.orders;
 const result=economyStatus(s,catalog);assert.deepEqual(result.haulers.map(hauler=>hauler.state),['assigned','assigned','assigned']);assert.deepEqual(result.congestion,[]);assert.match(result.summary,/assigned to other orders/);assert.match(result.haulers[0].reason,/move/);
 s.entities.find(entity=>entity.id===4)!.private!.retreating=true;
 assert.equal(economyStatus(s,catalog).haulers.find(hauler=>hauler.id===4)!.state,'returning');
});
