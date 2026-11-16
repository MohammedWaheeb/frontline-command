import test from 'node:test';
import assert from 'node:assert/strict';
import {atlasResolution} from '../../src/render/atlas-resolution';
import {SpriteSheet,type SpriteMeta} from '../../src/render/art';

test('legacy and resized tiers retain the same world geometry',()=>{
 const meta:SpriteMeta={id:'unit.US.tank',frame_size_2x:[326,204],anchor_2x:[148,104],layers:[],states:[],atlases:{'1x':{},'2x':{}}};
 assert.equal(new SpriteSheet(meta.id,meta,'1x',[]).pixelScale,1);
 assert.equal(new SpriteSheet(meta.id,meta,'2x',[]).pixelScale,.5);
 const resized={...meta,atlas_resolution:{'1x':1,'2x':1.5}};
 const sheet=new SpriteSheet(meta.id,resized,'2x',[]);
 assert.equal(sheet.pixelScale,2/3);
 assert.ok(Math.abs(Math.round(326*.75)*sheet.pixelScale-326*.5)<.5);
 assert.equal(Math.round(204*.75)*sheet.pixelScale,204*.5);
 assert.equal(atlasResolution(resized,'1x'),1);
 assert.deepEqual(resized.anchor_2x,[148,104]);
});
test('invalid physical resolutions cannot distort sprite geometry',()=>{
 for(const value of [0,-1,.5,3,Infinity,NaN])assert.throws(()=>atlasResolution({atlas_resolution:{'2x':value}},'2x'),/Invalid sprite/);
});
