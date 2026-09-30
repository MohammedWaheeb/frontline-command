import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {MAX_FOG_TILES,packFogMask,normalizeFogMask,unpackFogMask,decodeSnapshotFog} from '../../src/runtime/fog-codec';

interface MaskVector{name:string;tiles:number;trueIndices:number[];packedHex:string}
const vectors=(JSON.parse(readFileSync(path.resolve('..','internal/fogcodec/testdata/vectors.json'),'utf8')) as {vectors:MaskVector[]}).vectors;

test('Go/TS shared literal masks preserve exact tile order and cardinality',()=>{
 assert.equal(vectors.length,9);
 for(const v of vectors){
  const mask=Array<boolean>(v.tiles).fill(false);for(const i of v.trueIndices)mask[i]=true;
  const before=mask.slice(),expected=Uint8Array.from(Buffer.from(v.packedHex,'hex'));
  assert.deepEqual(packFogMask(mask,v.tiles),expected,v.name);
  assert.deepEqual(unpackFogMask(expected,v.tiles),mask,v.name);
  assert.deepEqual(mask,before,v.name+' mutated input');
 }
});

test('full256x256 legal map round-trips zeros and ones',()=>{
 for(const value of [false,true]){
  const mask=Array<boolean>(MAX_FOG_TILES).fill(value),packed=packFogMask(mask,MAX_FOG_TILES);
  assert.equal(packed.length,8192);assert.ok(packed.every(b=>b===(value?255:0)));
  assert.deepEqual(unpackFogMask(packed,MAX_FOG_TILES),mask);
 }
});

test('bool and byte cardinalities reject truncation, extension and nonintegers',()=>{
 for(const tiles of [0,-1,MAX_FOG_TILES+1,NaN,Infinity,1.5])assert.throws(()=>packFogMask([],tiles),{code:'cardinality'});
 for(const n of [8,10])assert.throws(()=>packFogMask(Array<boolean>(n).fill(false),9),{code:'cardinality'});
 for(const n of [0,1,3])assert.throws(()=>unpackFogMask(new Uint8Array(n),9),{code:'cardinality'});
 assert.throws(()=>packFogMask(Array(9),9),{code:'cardinality'});
});

test('padding is normalized without input mutation or extra disclosed tiles',()=>{
 const raw=new Uint8Array([0x81,0xff]),canonical=normalizeFogMask(raw,9),decoded=unpackFogMask(raw,9);
 assert.deepEqual(canonical,new Uint8Array([0x81,1]));assert.deepEqual(raw,new Uint8Array([0x81,0xff]));
 assert.equal(decoded.length,9);assert.deepEqual(decoded,[true,false,false,false,false,false,false,true,true]);
 canonical[0]=0;assert.equal(raw[0],0x81);assert.equal(decoded[0],true);
});

test('exploration and visibility are independent and lost sight is not retained',()=>{
 const explored=[true,true,false,false,true,false,false,false,true],visible=[false,true,false,false,false,false,false,false,false];
 const de=unpackFogMask(packFogMask(explored,9),9),dv=unpackFogMask(packFogMask(visible,9),9);
 assert.deepEqual(de,explored);assert.deepEqual(dv,visible);
 visible[1]=false;const lost=unpackFogMask(packFogMask(visible,9),9);
 assert.equal(lost[1],false);assert.equal(de[1],true);assert.equal(de[2],false);assert.equal(lost[2],false);
});


test('wire decode restores independent public planes and preserves non-fog references',()=>{
 const metadata={simulation:'unchanged'},entities=[{id:17}],original={metadata,entities,tick:200,
  explored:[],visible:[],fogTiles:9,exploredBits:new Uint8Array([0x81,1]),visibleBits:new Uint8Array([0x80,0])};
 const output=decodeSnapshotFog(original);
 assert.notEqual(output,original);assert.equal(output.metadata,metadata);assert.equal(output.entities,entities);
 assert.deepEqual(output.explored,[true,false,false,false,false,false,false,true,true]);
 assert.deepEqual(output.visible,[false,false,false,false,false,false,false,true,false]);
 assert.equal(output.fogTiles,0);assert.equal(output.exploredBits.length,0);assert.equal(output.visibleBits.length,0);
 assert.equal(original.fogTiles,9);assert.equal(original.visible.length,0);assert.equal(original.exploredBits[0],0x81);
});

test('packed full replacement clears lost vision and cannot disclose unknown tiles',()=>{
 const previous=decodeSnapshotFog({explored:[],visible:[],fogTiles:9,exploredBits:new Uint8Array([2,0]),visibleBits:new Uint8Array([2,0])});
 const next=decodeSnapshotFog({explored:[],visible:[],fogTiles:9,exploredBits:new Uint8Array([2,0]),visibleBits:new Uint8Array([0,0])});
 assert.equal(previous.visible[1],true);assert.equal(next.visible[1],false);assert.equal(next.explored[1],true);
 assert.equal(next.visible[2],false);assert.equal(next.explored[2],false);
});

test('wire boundary rejects truncated, mixed, absent-count and invalid-count masks',()=>{
 const valid={explored:[],visible:[],fogTiles:9,exploredBits:new Uint8Array([2,0]),visibleBits:new Uint8Array([0,0])};
 for(const invalid of [
  {...valid,visibleBits:new Uint8Array([0])},
  {...valid,exploredBits:new Uint8Array([2,0,0])},
  {...valid,fogTiles:0}, {...valid,fogTiles:MAX_FOG_TILES+1},
  {...valid,visible:[false]}, {...valid,explored:[false]},
  {...valid,visibleBits:new Uint8Array([0,128])}, {...valid,exploredBits:new Uint8Array([2,128])},
 ])assert.throws(()=>decodeSnapshotFog(invalid),{code:'cardinality'});
});

test('legacy decode creates a separate object and never overwrites ordinary public masks',()=>{
 const original={explored:[true,false],visible:[false,false],exploredBits:new Uint8Array(0),visibleBits:new Uint8Array(0),fogTiles:0};
 const output=decodeSnapshotFog(original);
 assert.notEqual(output,original);assert.equal(output.explored,original.explored);assert.equal(output.visible,original.visible);
});
