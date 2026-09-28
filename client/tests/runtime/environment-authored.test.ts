import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {decodeMapEnvironment} from '../../src/content/environment';
import type {GameMap} from '../../src/runtime/types';
// Authored pilot contract: not a simulation or full-map aesthetic certificate.
const root=path.resolve(process.cwd(),'..');
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
test('Copper Junction pilot binds unchanged map bytes and exactly ten mirrored public entries',async()=>{
 const mapBytes=await readFile(path.join(root,'content/maps/copper-junction.json')),map=JSON.parse(mapBytes.toString()) as GameMap;
 const sidecar=await readFile(path.join(root,'content/environment/copper-junction.json')),index=JSON.parse(await readFile(path.join(root,'content/index.json'),'utf8'));
 const hash=digest(mapBytes);assert.equal(hash,'9ce72f0cbb236557ad75e37feed6c2aa7f5726e6f77cd61803eb84d0b1545057');
 const environment=decodeMapEnvironment(sidecar,map,{mapSHA256:hash}),entry=index.maps.find((m:{id:string})=>m.id===map.id);
 assert.deepEqual(entry.environment,{url:'/content/environment/copper-junction.json',sha256:digest(sidecar),bytes:sidecar.length});assert.equal(entry.sha256,hash);
 assert.equal(environment.placements.length,8);assert.equal(environment.object_skins.length,2);
 for(const a of environment.placements){const b=environment.placements.find(b=>b!==a&&b.asset===a.asset&&b.position.x===128000-a.position.x&&b.position.y===128000-a.position.y);assert(b,`${a.id} lacks a reflected pair`);assert.equal(b.direction,(a.direction+2)%4)}
 const objects=environment.object_skins.map(skin=>({skin,object:map.objects!.find(object=>object.id===skin.object_id)!}));assert.equal(objects[0].object.position.x+objects[1].object.position.x,128000);assert.equal(objects[0].object.position.y+objects[1].object.position.y,128000);assert(objects.every(o=>o.object.class==='garrison'));
});
