import test from 'node:test';
import assert from 'node:assert/strict';
import {TerrainSurface} from '../../src/render/terrain-surface';
import {fogTopology} from '../../src/render/terrain';
import {FogField,FOG_EXPLORED} from '../../src/render/fog-field';
import {memoryLabelSize} from '../../src/render/battlefield';

type Tile={terrain:string;height:number};
const map=(width:number,height:number,tile:(x:number,y:number)=>Tile=()=>({terrain:'open',height:0}))=>({width,height,tiles:Array.from({length:width*height},(_,i)=>tile(i%width,Math.floor(i/width)))});

// F1 (revised 2026-10-31): fog is a shared feathered texture sampled in tile
// space, replacing per-vertex "most fogged corner" alphas. The staircase and
// fan creases are gone because every triangle samples one continuous field.
test('F1 every triangle samples one continuous field: equal ground points get equal fog',()=>{
 const w=10,h=10,f=new FogField(w,h),visible=Array.from({length:w*h},(_,i)=>i%w<5),explored=visible.map(()=>true);f.update(visible,explored);
 const surface=new TerrainSurface(map(w,h,(x)=>({terrain:'open',height:x>6?1:0})));
 const byPoint=new Map<string,number>();
 for(const t of surface.triangles())for(const v of t.vertices){const key=`${v.x},${v.y}`,a=f.sample(v.x,v.y),prior=byPoint.get(key);if(prior!==undefined)assert.equal(a,prior);byPoint.set(key,a)}
 // Along a straight vertical edge, fog is constant along y (no diagonal staircase).
 for(let y=1000;y<9000;y+=250)assert(Math.abs(f.sample(5000,y)-f.sample(5000,5000))<1e-9);
 assert(f.sample(5000,5000)>0&&f.sample(5000,5000)<FOG_EXPLORED);
});

test('F1 topology reads every tile the far corners touch, so changed-tile memoization sees them; geometry untouched',()=>{
 const w=6,h=6,surface=new TerrainSurface(map(w,h,(x,y)=>({terrain:'open',height:x>2?1:0}))),tile=2*w+2,triangle=surface.topTriangles(tile)[0],before=structuredClone(triangle);
 const topology=fogTopology([triangle],w,h),tiles=new Set(topology.fogTiles);
 for(const [dx,dy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-1,1],[0,1],[1,1]])assert(tiles.has(tile+dy*w+dx),`tile ${dx},${dy} missing from the fog dependency set`);
 assert.deepEqual(triangle,before);
});

test('F5 last-seen tag follows the UI scale and never falls below 11px',()=>{
 assert.equal(memoryLabelSize(.85),11);assert.equal(memoryLabelSize(1),12);assert.equal(memoryLabelSize(1.5),18);assert.equal(memoryLabelSize(Number.NaN),12);
 for(let s=.85;s<=1.5;s+=.05)assert(memoryLabelSize(s)>=11);
});
