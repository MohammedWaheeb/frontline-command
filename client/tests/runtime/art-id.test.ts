import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {authoredArtId} from '../../src/render/art-id';
const rules=JSON.parse(readFileSync('../pkg/content/rules.json','utf8')) as {units:Array<{id:string;faction:string}>;buildings:Array<{id:string;faction:string}>};
const manifest=JSON.parse(readFileSync('../assets/manifest/asset-manifest.json','utf8')) as {entries:Array<{id:string;category:string}>};
test('every Go roster and faction building maps exactly to the approved art inventory',()=>{
 const units=rules.units.map(u=>authoredArtId(u.id,u.faction));assert.equal(units.length,75);
 assert.deepEqual([...units].sort(),manifest.entries.filter(e=>e.category==='unit_sprite').map(e=>e.id).sort());
 const buildings=rules.buildings.flatMap(b=>(b.faction?[b.faction]:['US','IR','SY','SA']).map(f=>authoredArtId(b.id,f)));
 assert.equal(buildings.length,61);assert.equal(new Set(buildings).size,61);
 assert.deepEqual([...buildings].sort(),manifest.entries.filter(e=>e.category==='building_sprite').map(e=>e.id).sort());
});
test('object skins follow explicit Go classes without inventing faction or objective identity',()=>{
 assert.equal(authoredArtId('map.light_prop'),'prop.destructible_wall_hp_light');assert.equal(authoredArtId('map.heavy_prop'),'prop.destructible_wall_hp_heavy');assert.equal(authoredArtId('map.garrison'),'prop.warehouse_garrisonable');
 assert.equal(authoredArtId('map.supply_field'),'prop.supply_field');assert.equal(authoredArtId('strategic'),undefined);assert.equal(authoredArtId('strategic','unknown'),undefined);assert.equal(authoredArtId('vehicle_armor','US'),undefined);
 for(const type of ['map.light_prop','map.heavy_prop','map.garrison'])assert(manifest.entries.some(e=>e.id===authoredArtId(type)&&e.category==='prop'));
});
