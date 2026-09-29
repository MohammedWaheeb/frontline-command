import {build} from '../../client/node_modules/esbuild/lib/main.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const work=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(work,'../..'),source=path.join(root,'work/renderer-performance-v1/baseline/client/src'),output=path.join(work,'prepared/fog-counterexample-source.mjs'),sha=b=>createHash('sha256').update(b).digest('hex');
await build({stdin:{contents:"export {fogTopology,fogVertexAlphas} from './render/terrain';export {TerrainSurface} from './render/terrain-surface';",resolveDir:source,loader:'ts'},outfile:output,platform:'node',format:'esm',bundle:true,external:['pixi.js']});
const {fogTopology,fogVertexAlphas,TerrainSurface}=await import(pathToFileURL(output).href);
// Public visibility only: V visible, E explored, U unknown. Center4 has one
// cardinal visible neighbour1. Its four closed-square corners are all fogged.
// E V E
// E V E
// U U E
const visible=[false,true,false,false,true,false,false,false,false],explored=[true,true,true,true,true,true,false,false,true],map={width:3,height:3,tiles:Array.from({length:9},()=>({terrain:'open',height:0}))},surface=new TerrainSurface(map),triangles=surface.topTriangles(4),topology=fogTopology(triangles,3,3),opacity=Int32Array.from(topology.fogTiles,t=>visible[t]?0:explored[t]?175:255),alphas=new Float32Array(12);
fogVertexAlphas(triangles,topology,opacity,visible,explored,alphas);
const corners=[alphas[1],alphas[2],alphas[5],alphas[8]],proposed=Math.min(...corners),eastTriangle=[...alphas.slice(3,6)],weights=[.25,.25,.5],before=eastTriangle.reduce((s,a,i)=>s+a*weights[i],0),after=proposed;
assert.deepEqual(corners,[175,175,255,255]);assert.equal(proposed,175);assert.equal(before,203.25);assert.equal(after-before,-28.25);
const report={status:'COUNTEREXAMPLE_PROVEN_IN_SOURCE_MATH',scope:'Read-only actual current fogTopology/fogVertexAlphas, synthetic public visibility mask. No fog candidate or GPU claim.',proposalReviewSHA256:sha(await readFile(path.join(root,'work/claude/29sept-integration-review-v3.md'))),terrainSourceSHA256:sha(await readFile(path.join(source,'render/terrain.ts'))),visibility:['E V E','E V E','U U E'],tile:4,visibleCardinalNeighbors:[1],corners,actualTriangleAlphas:[...alphas],proposedConstant:proposed,loweredCornerAlpha:{before:255,after:175,delta:-80},interiorBarycentric:{eastTriangle,weights,before,after,delta:after-before},conclusion:'The suggested min(cornerAlphas) fill lowers existing 255 corners to175 when explored and unknown neighbours mix. It also lowers a strictly interior affine sample. The claimed vertex/sample nondecrease cannot be accepted as stated. No live or combined terrain was edited.'};
await writeFile(path.join(work,'prepared/fog-proposal-counterexample.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
