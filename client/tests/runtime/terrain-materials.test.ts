import test from 'node:test';
import assert from 'node:assert/strict';
import {materialFor} from '../../src/render/terrain-materials';
import type {GameMap} from '../../src/runtime';
const map=():GameMap=>({id:'terrain-review',title:'Synthetic terrain review',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:64,tiles:Array.from({length:4096},()=>({terrain:'open',height:0})),spawns:[],fields:[],shipment:{x:0,y:0}});
test('open ground never displays the cover or rubble material, across broad material transitions',()=>{
 const m=map(),before=structuredClone(m),used=new Set<string>();
 for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){const value=materialFor(m,x,y);assert(['sand','packed_earth'].includes(value));used.add(value)}
 assert.equal(used.size,2);assert.deepEqual(m,before);
 for(const [terrain,material] of [['cover','scrub_ground'],['rubble','rubble_ground'],['road','asphalt'],['blocked','gravel'],['cliff','gravel'],['ramp','ramp']]){m.tiles[0]={terrain,height:2};assert.equal(materialFor(m,0,0),material)}
});
test('water, shore and beach remain distinct without changing gameplay terrain',()=>{
 const m=map();for(let y=20;y<25;y++)for(let x=20;x<25;x++)m.tiles[y*64+x].terrain='water';const before=structuredClone(m);
 assert.equal(materialFor(m,22,22),'deep_water');assert.equal(materialFor(m,20,22),'shallow_water');assert.equal(materialFor(m,19,22),'coast_sand');
 m.tiles[22*64+19].terrain='cover';assert.equal(materialFor(m,19,22),'scrub_ground');m.tiles[22*64+19].terrain='open';
 assert.deepEqual(m,before);
});
test('low scree only dresses open neighbors of real rock and never changes their rules',()=>{
 const m=map();m.tiles[20*64+20]={terrain:'cliff',height:3};const before=structuredClone(m);
 assert.equal(materialFor(m,19,20),'gravel_wash');assert.equal(materialFor(m,20,20),'gravel');
 assert(['sand','packed_earth'].includes(materialFor(m,0,0)));assert.deepEqual(m,before);
 for(const [terrain,material] of [['cover','scrub_ground'],['rubble','rubble_ground'],['road','asphalt'],['ramp','ramp']]){m.tiles[20*64+19].terrain=terrain;assert.equal(materialFor(m,19,20),material)}
});
