import test from 'node:test';
import assert from 'node:assert/strict';
import {materialFor,roadJunction,farmPlot,basePad} from '../../src/render/terrain-materials';
import type {GameMap} from '../../src/runtime';
const map=():GameMap=>({id:'terrain-review',title:'Synthetic terrain review',author:'test',version:'1',format_version:1,ruleset:'standard-v2',width:64,height:64,tiles:Array.from({length:4096},()=>({terrain:'open',height:0})),spawns:[],fields:[],shipment:{x:0,y:0}});
test('open ground never displays the cover or rubble material, across broad material transitions',()=>{
 const m=map(),before=structuredClone(m),used=new Set<string>();
 for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){const value=materialFor(m,x,y);assert(['sand','packed_earth','dry_riverbed'].includes(value),value);used.add(value)}
 assert(used.has('sand')&&used.has('packed_earth'));assert(!used.has('scrub_ground')&&!used.has('rubble_ground'));assert.deepEqual(m,before);
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

test('authored pad, yard, wash and farm materials dress only plain open ground',()=>{
 const m=map();m.spawns=[{position:{x:32500,y:32500}}];
 // A road crossing at (10,10): long horizontal and vertical 3-wide roads.
 for(let i=0;i<64;i++)for(let k=9;k<=11;k++){m.tiles[k*64+i].terrain='road';m.tiles[i*64+k].terrain='road'}
 const before=structuredClone(m);
 assert.equal(roadJunction(m,10,10),true);assert.equal(roadJunction(m,30,10),false,'a straight wide road is not a junction');
 assert.equal(materialFor(m,12,12),'industrial_pavement');assert.equal(materialFor(m,10,10),'asphalt');
 assert.equal(materialFor(m,30,12)==='industrial_pavement',false);
 assert.equal(basePad(m,32,32),true);assert.equal(materialFor(m,32,32),'concrete_slab');assert.equal(materialFor(m,32,40)==='concrete_slab',false);
 // Pads never cover non-open terrain.
 m.tiles[32*64+33].terrain='cover';assert.equal(materialFor(m,33,32),'scrub_ground');m.tiles[32*64+33].terrain='open';
 // Farm plots are 4-aligned and never touch roads, pads or rock.
 for(let y=0;y<64;y+=4)for(let x=0;x<64;x+=4)if(farmPlot(m,x,y))for(let j=y-1;j<=y+4;j++)for(let i=x-1;i<=x+4;i++)assert(['sand','packed_earth'].includes(materialFor(m,i,j)));
 assert.equal(farmPlot(m,13,13),false);assert.deepEqual(m,before);
 const dry=new Set<string>();const big:GameMap={...map(),width:128,height:128,tiles:Array.from({length:128*128},()=>({terrain:'open',height:0}))};
 for(let y=0;y<128;y++)for(let x=0;x<128;x++)dry.add(materialFor(big,x,y));assert(dry.has('dry_riverbed'),'large open maps get a few dry washes');
});
