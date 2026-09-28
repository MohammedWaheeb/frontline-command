import test from 'node:test';
import assert from 'node:assert/strict';
import {Texture} from 'pixi.js';
import {PlacementGhost} from '../../src/render/placement-ghost';
import {SpriteSheet,type ArtLibrary,type SpriteMeta} from '../../src/render/art';
import {TerrainSurface,projectSurfaceVertex} from '../../src/render/terrain-surface';
import type {CatalogBuilding} from '../../src/content/catalog';

const building={id:'hq',role:'hq',width:4,height:3} as CatalogBuilding;
const position={x:6000,y:6000};
const surface=new TerrainSurface({width:12,height:12,tiles:Array.from({length:144},()=>({terrain:'clear',height:2}))});
function sheet(scale:'1x'|'2x'='2x'){
 const meta={turret_pivot_mt:[500,250],states:[{name:'idle',part:'body',directions:1,frames:1,fps:0,loop:false},{name:'aim',part:'turret',directions:16,frames:1,fps:0,loop:false}]} as SpriteMeta;
 const result=new SpriteSheet('building.US.hq',meta,scale,[]),available=new Set<string>();
 result.frame=(layer,state)=>available.has(`${state}/${layer}`)?{texture:Texture.EMPTY,atlasTexture:Texture.EMPTY,anchorX:.3,anchorY:.8}:undefined;
 return {result,available};
}

test('construction ghost waits for body beauty, keeps physical @2x scale, and suppresses unmatched turret paint',async()=>{
 const {result,available}=sheet(),ghost=new PlacementGhost({sheet:async()=>result} as unknown as ArtLibrary),internal=ghost as any;
 try{
  ghost.draw(building,'US',position,true,surface);await ghost.settle();
  available.add('idle/team');available.add('aim/team');ghost.draw(building,'US',position,true,surface);
  assert(internal.sprites.every((s:any)=>!s.visible),'partial team pages cannot overprint a fallback');
  available.add('idle/beauty');ghost.draw(building,'US',position,true,surface);
  assert.equal(internal.sprites[0].visible,true);assert.equal(internal.sprites[1].visible,true);assert.equal(internal.sprites[3].visible,false);
  assert.equal(internal.sprites[0].scale.x,.5);assert.equal(internal.sprites[0].anchor.y,.8);
  available.add('aim/beauty');ghost.draw(building,'US',position,false,surface);
  assert.equal(internal.sprites[2].visible,true);assert.equal(internal.sprites[3].visible,true);assert.equal(internal.sprites[2].position.x,8);assert.equal(internal.sprites[2].position.y,12);
  const support=surface.footprintSurface(position,building.width,building.height),point=projectSurfaceVertex({...position,height:support.height});
  assert.equal(ghost.root.x,point.x);assert.equal(ghost.root.y,point.y);assert.equal(ghost.root.children.length,5);assert.equal(ghost.root.eventMode,'none');
  assert.equal(internal.sprites[0].tint,0xda967b);assert.equal(ghost.root.alpha,.36);
 }finally{ghost.dispose()}
 assert.equal(ghost.root.destroyed,true);assert.equal(Texture.EMPTY.destroyed,false,'shared atlas textures belong to the ArtLibrary');
});

test('cleared, switched and disposed proposals reject late art admission',async()=>{
 const requests:Array<{id:string;resolve:(sheet:SpriteSheet)=>void}>=[],art={sheet:(id:string)=>new Promise<SpriteSheet>(resolve=>requests.push({id,resolve}))};
 const ghost=new PlacementGhost(art as unknown as ArtLibrary),internal=ghost as any,first=sheet(),second=sheet();
 first.available.add('idle/beauty');second.available.add('idle/beauty');
 ghost.draw(building,'US',position,true,surface);const stale=internal.pending;
 ghost.draw(building,'IR',position,true,surface);assert.deepEqual(requests.map(request=>request.id),['building.US.hq','building.IR.hq']);
 requests[1].resolve(second.result);await ghost.settle();requests[0].resolve(first.result);await stale;assert.equal(internal.sheet,second.result);
 ghost.clear();assert.equal(ghost.root.visible,false);assert.equal(internal.sheet,undefined);assert(internal.sprites.every((s:any)=>!s.visible));
 ghost.draw(building,'US',position,undefined,surface);const canceled=internal.pending;ghost.clear();requests[2].resolve(first.result);await canceled;assert.equal(internal.sheet,undefined);
 ghost.draw(building,'IR',position,true,surface);const disposed=internal.pending;ghost.dispose();requests[3].resolve(second.result);await disposed;assert.equal(internal.sheet,undefined);
 ghost.draw(building,'US',position,true,surface);assert.equal(requests.length,4,'disposed ghost never requests art');
});
