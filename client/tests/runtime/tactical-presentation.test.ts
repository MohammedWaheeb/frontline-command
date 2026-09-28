import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {create,type MessageInitShape} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema,EntitySchema,VecSchema} from '../../src/protocol/frontline_pb';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {tacticalPresentation,tacticalDeadline} from '../../src/app/tactical-presentation';

// Read the real immutable Go rules; these are not separately tuned JS gameplay values.
const raw=JSON.parse(readFileSync(resolve('../pkg/content/rules.json'),'utf8')) as Catalog;
const catalog=new CatalogIndex(raw),pos={x:12500,y:23500};
const actor=(patch:MessageInitShape<typeof EntitySchema>={})=>create(EntitySchema,{id:1,owner:1,type:'US.rifle',position:create(VecSchema,pos),health:1000,enabled:true,complete:true,state:'idle',...patch});
const snapshot=(patch:MessageInitShape<typeof PlayerSnapshotSchema>={})=>create(PlayerSnapshotSchema,{tick:100,player:1,players:[{id:1,team:1},{id:2,team:1},{id:3,team:2}],...patch});

test('all 28 catalog weapons retain exact splash; known artillery and tactical radii are world units',()=>{
 const s=snapshot({projectiles:raw.weapons.map((w,i)=>({id:i+1,owner:3,weapon:w.id,position:{x:1000,y:2000},impact:pos,impactAt:260,warning:true}))});
 const out=tacticalPresentation(s,catalog);assert.equal(out.warnings.length,28);
 for(const [i,weapon] of raw.weapons.entries()){
  const warning=out.warnings[i];assert.deepEqual(warning.position,pos);assert.equal(warning.deadline.remainingTicks,160);assert.equal(warning.deadline.remainingSeconds,8);
  assert.deepEqual(warning.area,weapon.splash?{kind:'circle',radius:weapon.splash,source:'catalog-splash'}:{kind:'point',reason:'single-target'});
 }
 for(const [id,radius] of [['MISSILE',2000],['IR_MISSILE',2000],['SY_ROCKET',2000],['ART',2000],['IR_ART',1500],['SY_ART',1500]] as const){assert.equal((out.warnings.find(w=>w.weapon===id)!.area as {radius:number}).radius,radius)}
 assert.equal(out.gaps.length,0);
});

test('hidden warning coordinates do not become projectile bodies or launch routes; unknown strategic radii stay explicit',()=>{
 const s=snapshot({projectiles:[
  {id:1,weapon:'SATURATION',owner:3,position:pos,impact:pos,warning:true,impactAt:400,interceptable:true},
  {id:2,weapon:'SKYBREAKER',owner:3,position:pos,impact:pos,warning:true,impactAt:101},
  {id:3,weapon:'MISSILE',owner:3,position:{x:6000,y:6500},impact:pos,warning:true,impactAt:300},
  {id:4,weapon:'ART',owner:3,position:pos,impact:pos,warning:false,impactAt:120},
  {id:5,weapon:'FUTURE_WEAPON',owner:3,position:{x:2,y:3},impact:pos,warning:true,impactAt:500},
 ]});
 const out=tacticalPresentation(s,catalog);
 assert.equal(out.projectiles[0].bodyPosition,undefined);assert.equal(out.projectiles[1].bodyPosition,undefined);
 assert.deepEqual(out.projectiles[2].bodyPosition,{x:6000,y:6500});assert.equal(out.projectiles[2].bodyEffect,'fx.projectile.tactical_missile');
 assert.deepEqual(out.projectiles[3].bodyPosition,pos);assert.equal(out.warnings.length,4);
 assert.deepEqual(out.warnings[0].area,{kind:'point',reason:'radius-not-disclosed'});assert.equal(out.projectiles[4].bodyEffect,undefined);
 assert.ok(out.gaps.some(g=>g.code==='projectile-splash-not-disclosed'&&g.subject==='SATURATION'));
 assert.ok(out.gaps.some(g=>g.code==='projectile-position-visibility-not-disclosed'&&g.subject==='1'));
 assert.ok(!JSON.stringify(out).includes('trajectory'));
});

test('operation semantics distinguish actual impact, pending launch, observed arrival and raid exits',()=>{
 const exits=[{x:3000,y:4000},{x:3000,y:6000}];
 const s=snapshot({entities:[actor({id:7,type:'IR.launcher'})],warnings:[
  {kind:'skybreaker',owner:3,position:pos,at:350},
  {kind:'raid',owner:3,source:900,position:pos,at:340,exits},
  {kind:'transfer',owner:3,source:901,position:pos,at:160,exits},
  {kind:'second_volley',owner:1,source:7,position:pos,at:130},
  {kind:'second_volley',owner:2,position:pos,at:130},
 ]});
 const out=tacticalPresentation(s,catalog);assert.equal(out.warnings.length,4);
 assert.deepEqual(out.warnings.map(w=>w.deadlineKind),['impact','deployment','arrival','launch']);
 assert.equal(out.warnings[0].deadline.remainingSeconds,12.5);assert.deepEqual(out.warnings[1].exits,exits);
 assert.equal(out.warnings[1].source,undefined);assert.deepEqual(out.warnings[2].exits,[]);assert.equal(out.warnings[2].source,undefined);
 assert.deepEqual(out.warnings[3].area,{kind:'circle',radius:2000,source:'catalog-splash'});assert.equal(out.warnings[3].deadline.remainingSeconds,1.5);
 assert.ok(out.gaps.some(g=>g.code==='skybreaker-route-not-disclosed'));
 const later=tacticalPresentation(snapshot({...s,tick:160,warnings:s.warnings.map(w=>({...w,at:w.at+3}))}),catalog);
 assert.equal(out.warnings[0].key,later.warnings[0].key);assert.equal(later.warnings[0].deadline.remainingTicks,193);
});

test('zones use exact authorized radius/start/until including preparation, expiry and rewind',()=>{
 const s=snapshot({zones:[{kind:'shieldline',owner:1,position:pos,radius:10000,start:240,until:740},{kind:'scan',owner:3,position:pos,radius:9000,start:80,until:200}]});
 const before=structuredClone(s),out=tacticalPresentation(s,catalog);
 assert.deepEqual(out.zones.map(z=>[z.kind,z.phase,z.area.radius,z.deadline.remainingTicks]),[['shieldline','preparing',10000,140],['scan','active',9000,100]]);
 assert.equal(tacticalPresentation(snapshot({...s,tick:240}),catalog).zones[0].phase,'active');
 assert.equal(tacticalPresentation(snapshot({...s,tick:240}),catalog).zones[0].deadline.remainingTicks,500);
 assert.deepEqual(tacticalPresentation(snapshot({...s,tick:740}),catalog).zones,[]);
 assert.deepEqual(tacticalPresentation(s,catalog),out);assert.deepEqual(s,before);
 assert.deepEqual(tacticalDeadline(120,100),{at:100,remainingTicks:0,remainingSeconds:0});
 // A consumed, stalled or paused deadline is not removed speculatively.
 assert.equal(tacticalPresentation(snapshot({warnings:[{kind:'raid',position:pos,at:90}]}),catalog).warnings[0].deadline.remainingTicks,0);
});

test('endgame structure pulses remain minimap-only and defeat deadlines come from player summaries',()=>{
 const s=snapshot({players:[{id:1,team:1,defeatAt:250},{id:2,team:1,defeated:true,defeatAt:200},{id:3,team:2}],indicators:[{owner:3,position:pos}],memory:[{id:77,owner:3,type:'hq',position:{x:9000,y:9000}}]});
 const out=tacticalPresentation(s,catalog,[77]);assert.deepEqual(out.minimapIndicators,[{owner:3,relation:'hostile',position:pos}]);
 assert.deepEqual(out.defeatCountdowns,[{player:1,deadline:{at:250,remainingTicks:150,remainingSeconds:7.5}}]);
 assert.deepEqual(out.selected,[]);assert.deepEqual(out.actors,[]);assert.deepEqual(out.warnings,[]);
});

test('own order intentions never turn target-only defaults or stale memory into routes',()=>{
 const path=[{x:1000,y:5000},{x:2000,y:5000},{x:3000,y:5000}];
 const s=snapshot({entities:[actor({type:'IR.artillery',private:{orders:[
  {kind:'move',position:{x:0,y:0}},{kind:'attack',target:99,position:{x:0,y:0}},
  {kind:'attack',target:3},{kind:'patrol',points:path,index:1},
  {kind:'force_fire',position:pos},{kind:'unload',position:{x:0,y:0}},
  {kind:'ability',position:{x:0,y:0}},{kind:'capture',target:88},
 ]}}),actor({id:3,owner:3,position:{x:8500,y:6500}})],stations:[{id:88,position:{x:9000,y:11000}}],memory:[{id:99,type:'hq',position:{x:64000,y:64000}}]});
 const before=structuredClone(s),orders=tacticalPresentation(s,catalog,[1]).selected[0].orders;
 assert.deepEqual(orders[0].position,{x:0,y:0});assert.equal(orders[1].position,undefined);assert.equal(orders[1].unresolvedTarget,true);
 assert.deepEqual(orders[2].position,{x:8500,y:6500});assert.deepEqual(orders[3].patrol,{points:path,next:1});assert.deepEqual(orders[3].position,path[1]);
 assert.deepEqual(orders[4].area,{kind:'circle',radius:1500,source:'catalog-splash'});
 assert.equal(orders[5].position,undefined);assert.equal(orders[6].position,undefined);assert.deepEqual(orders[7].position,{x:9000,y:11000});
 assert.deepEqual(s,before);
});

test('return uses only current owned home intent; rally sentinel and foreign private state are not displayed',()=>{
 const privateData={ammo:0,charges:2,ambushReady:true,endurance:550,home:9,rally:{x:1000,y:1000},orders:[{kind:'return'}]};
 const s=snapshot({entities:[actor({type:'US.fighter',private:privateData}),actor({id:2,type:'US.fighter',owner:2,private:privateData}),actor({id:3,type:'US.fighter',owner:3,private:privateData}),actor({id:9,type:'US.airfield',position:{x:6000,y:7000},private:{rally:{x:0,y:0}}})],economy:{powerDemand:100,powerCapacity:50}});
 const out=tacticalPresentation(s,catalog,[1,2,3,9]);
 assert.deepEqual(out.selected[0].orders[0].position,{x:6000,y:7000});assert.equal(out.selected[0].orders[0].target,9);
 assert.deepEqual(out.selected[1].orders,[]);assert.deepEqual(out.selected[2].orders,[]);assert.equal(out.selected[3].rally,undefined);
 assert.equal(out.actors[0].own?.enduranceTicks,550);assert.equal(out.actors[0].own?.ammo,0);assert.equal(out.actors[0].own?.ammoCapacity,6);assert.equal(out.actors[0].own?.returnOrdered,true);
 assert.equal(out.actors[1].own,undefined);assert.equal(out.actors[2].own,undefined);assert.equal(out.actors[3].own?.lowPower,true);
 s.entities=s.entities.filter(e=>e.id!==9);s.memory.push({id:9,position:{x:99,y:99}} as typeof s.memory[number]);
 const lost=tacticalPresentation(s,catalog,[1]);assert.equal(lost.selected[0].orders[0].position,undefined);assert.equal(lost.selected[0].orders[0].unresolvedTarget,true);assert.equal(lost.actors[0].own?.homePosition,undefined);
});

test('range references use actual max_range and retained footprint, never silently become hit eligibility',()=>{
 const s=snapshot({entities:[actor({type:'IR.launcher',private:{charges:2}}),actor({id:2,type:'turret',footprintType:'SY.workshop',footprintWidth:3,footprintHeight:4}),actor({id:3,type:'abm',private:{charges:0}}),actor({id:4,type:'SA.mobile_abm',private:{charges:1}}),actor({id:5,private:{container:9}})]});
 const out=tacticalPresentation(s,catalog,[1,2,3,4,5]);assert.equal(out.selected.length,4);assert.equal(out.actors.length,4);
 assert.deepEqual(out.selected[0].weaponRange,{weapon:'IR_MISSILE',minimum:10000,maximum:44000,metric:'edge-distance',origin:{kind:'circle',radius:600},advisory:true});
 assert.deepEqual(out.selected[1].weaponRange?.origin,{kind:'rectangle',width:3000,height:4000});assert.equal(out.selected[1].weaponRange?.maximum,9000);
 assert.equal(out.selected[2].weaponRange,undefined);assert.equal(out.selected[3].weaponRange,undefined);
 assert.equal(out.actors[2].own?.charges,0);assert.equal(out.actors[3].own?.charges,1);
 assert.deepEqual(out.gaps.filter(g=>g.code==='abm-coverage-not-in-catalog').map(g=>g.subject),['3','4']);
 assert.ok(out.gaps.some(g=>g.code==='effective-sight-detection-not-disclosed'));
});

test('semantic event cues retain uncertainty, attacker-owned interception, and authorized scopes',()=>{
 const s=snapshot({events:[
  {id:1,tick:99,kind:'impact',owner:3,entity:0,position:pos,scope:'visible'},
  {id:2,tick:99,kind:'impact',owner:3,entity:4,position:pos,scope:'visible'},
  {id:3,tick:100,kind:'missile_intercepted',owner:3,entity:0,position:pos,scope:'all'},
  {id:4,tick:100,kind:'service_lost',owner:1,entity:1,position:pos,scope:'owner'},
  {id:5,tick:100,kind:'service_lost',owner:2,entity:2,position:pos,scope:'owner'},
  {id:6,tick:100,kind:'ping',owner:2,position:pos,scope:'team'},
  {id:7,tick:100,kind:'ping',owner:3,position:pos,scope:'team'},
  {id:8,tick:101,kind:'destroyed',owner:3,position:pos,scope:'visible'},
 ]});
 const cues=tacticalPresentation(s,catalog).eventCues;
 assert.deepEqual(cues.map(e=>e.id),[1,2,3,4,6]);assert.equal(cues[0].impactOutcome,'unspecified');assert.equal(cues[1].impactOutcome,'unspecified');
 assert.equal(cues[0].entity,undefined);assert.equal(cues[2].owner,3);assert.equal(cues[2].entity,undefined);
});

test('pure snapshots rebuild without sharing mutable geometry, clocks, playback state or quality budgets',()=>{
 const s=snapshot({warnings:[{kind:'raid',position:pos,at:150,exits:[{x:2,y:3}]}],entities:[actor({private:{orders:[{kind:'move',position:pos}]}})]});
 const out=tacticalPresentation(s,catalog,[1]),again=tacticalPresentation(s,catalog,[1]);
 out.warnings[0].position.x=99;out.warnings[0].exits[0].x=99;out.selected[0].orders[0].position!.x=99;
 assert.deepEqual(tacticalPresentation(s,catalog,[1]),again);assert.deepEqual(s.warnings[0].position&&{x:s.warnings[0].position.x,y:s.warnings[0].position.y},pos);
 const rewound=tacticalPresentation(snapshot({...s,tick:20}),catalog,[1]);assert.equal(rewound.warnings[0].deadline.remainingTicks,130);
 assert.equal(tacticalPresentation(snapshot({tick:250}),catalog).warnings.length,0);
});


test('cosmetic projectile choices reference manifest effects without inventing installed art or interceptor trajectories',()=>{
 const manifest=JSON.parse(readFileSync(resolve('../assets/manifest/asset-manifest.json'),'utf8')) as {entries:Array<{id:string;category:string}>};
 const effects=new Set(manifest.entries.filter(e=>e.category==='effect').map(e=>e.id));
 const s=snapshot({projectiles:[...raw.weapons.map(w=>w.id),'SATURATION','SKYBREAKER'].map((weapon,i)=>({id:i+1,weapon,position:{x:1000,y:2000},impact:pos}))});
 const out=tacticalPresentation(s,catalog);
 for(const projectile of out.projectiles)if(projectile.bodyEffect)assert.ok(effects.has(projectile.bodyEffect),projectile.bodyEffect);
 assert.equal(out.projectiles.find(p=>p.weapon==='IR_ART')?.bodyEffect,'fx.projectile.rocket_ir');
 assert.equal(out.projectiles.find(p=>p.weapon==='SY_ART')?.bodyEffect,'fx.projectile.mortar');
 assert.equal(out.projectiles.find(p=>p.weapon==='US_GUN')?.bodyEffect,'fx.projectile.tracer_auto');
 assert.equal(out.projectiles.find(p=>p.weapon==='US_STRIKE')?.bodyEffect,'fx.projectile.bomb');
 assert.ok(!out.projectiles.some(p=>p.bodyEffect==='fx.projectile.interceptor'));
});
