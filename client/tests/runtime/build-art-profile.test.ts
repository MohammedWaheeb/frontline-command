import test from 'node:test';
import assert from 'node:assert/strict';
import {qualityForBuild} from '../../src/render/build-art-profile';
test('portable builds normalize a retained High preference without changing source development',()=>{
 assert.equal(qualityForBuild('high','standard'),'standard');
 assert.equal(qualityForBuild('high','full'),'high');
 for(const value of ['auto','standard'] as const){
  assert.equal(qualityForBuild(value,'standard'),value);
  assert.equal(qualityForBuild(value,'full'),value);
 }
});
