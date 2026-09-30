import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {authoredArtId,physicalArtType,actorArtKey} from '../../src/render/art-id';
const rules=JSON.parse(readFileSync('../pkg/content/rules.json','utf8')) as {units:Array<{id:string;faction:string}>;buildings:Array<{id:string;faction:string}>};
const manifest=JSON.parse(readFileSync('../assets/manifest/asset-manifest.json','utf8')) as {entries:Array<{id:string;category:string}>};
test('every Go roster and faction building maps exactly to the approved art inventory',()=>{
 const units=rules.units.map(u=>authoredArtId(u.id,u.faction));assert.equal(units.length,76);assert.equal(new Set(units).size,76);
 assert.deepEqual([...units].sort(),manifest.entries.filter(e=>e.category==='unit_sprite').map(e=>e.id).sort());
 const buildings=rules.buildings.flatMap(b=>(b.faction?[b.faction]:['US','IR','SY','SA']).map(f=>authoredArtId(b.id,f)));
 assert.equal(buildings.length,65);assert.equal(new Set(buildings).size,65);
 assert.deepEqual([...buildings].sort(),manifest.entries.filter(e=>e.category==='building_sprite').map(e=>e.id).sort());
 const mandatory=manifest.entries.filter(e=>['unit_sprite','building_sprite','prop'].includes(e.category));
 assert.equal(mandatory.length,167);assert.equal(new Set(mandatory.map(e=>e.id)).size,167);
 assert.equal(mandatory.filter(e=>e.category==='prop').length,26);
 const additions=['unit.IR.shahed',...['US','IR','SY','SA'].map(f=>`building.${f}.barrier`)];
 assert.deepEqual(mandatory.filter(e=>e.id==='unit.IR.shahed'||/^building\.(US|IR|SY|SA)\.barrier$/.test(e.id)).map(e=>e.id).sort(),additions.sort());
});
test('captured air producers and safehouses keep their original physical art',()=>{
 const workshop={type:'US.airfield',footprintType:'SY.workshop_air',footprintWidth:3,footprintHeight:3};
 assert.equal(physicalArtType(workshop),'SY.workshop_air');
 assert.equal(authoredArtId(physicalArtType(workshop),'US'),'building.SY.air_workshop');
 assert.equal(authoredArtId(physicalArtType({...workshop,type:'IR.drone_hub'}),'IR'),'building.SY.air_workshop');
 const outpost={type:'outpost',footprintType:'SY.safehouse',footprintWidth:2,footprintHeight:2};
 assert.equal(authoredArtId(physicalArtType(outpost),'US'),'building.SY.safehouse');
 assert.equal(physicalArtType({...outpost,type:'US.rifle',footprintWidth:0,footprintHeight:0}),'US.rifle');
 assert.equal(physicalArtType({...workshop,footprintType:''}),'US.airfield');
});
test('actor identity refreshes generic faction art on capture and is stable after restore',()=>{
 const power={type:'power',footprintType:'power',footprintWidth:3,footprintHeight:3};
 assert.notEqual(actorArtKey(power,'SY'),actorArtKey(power,'US'));
 assert.equal(authoredArtId(physicalArtType(power),'US'),'building.US.power');
 const captured={...power,type:'US.airfield',footprintType:'SY.workshop_air'};
 assert.notEqual(actorArtKey(captured,'US'),actorArtKey({...captured,footprintType:'US.airfield'},'US'));
 assert.equal(actorArtKey(captured,'US'),actorArtKey(JSON.parse(JSON.stringify(captured)),'US'));
});
test('object skins follow explicit Go classes without inventing faction or objective identity',()=>{
 assert.equal(authoredArtId('map.light_prop'),'prop.destructible_wall_hp_light');assert.equal(authoredArtId('map.heavy_prop'),'prop.destructible_wall_hp_heavy');assert.equal(authoredArtId('map.garrison'),'prop.warehouse_garrisonable');
 assert.equal(authoredArtId('map.supply_field'),'prop.supply_field');assert.equal(authoredArtId('strategic'),undefined);assert.equal(authoredArtId('strategic','unknown'),undefined);assert.equal(authoredArtId('vehicle_armor','US'),undefined);
 for(const type of ['map.light_prop','map.heavy_prop','map.garrison'])assert(manifest.entries.some(e=>e.id===authoredArtId(type)&&e.category==='prop'));
});
