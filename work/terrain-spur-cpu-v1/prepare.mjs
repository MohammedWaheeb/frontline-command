import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../../client/node_modules/esbuild/lib/main.js';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),sha=b=>createHash('sha256').update(b).digest('hex');
const closure=JSON.parse(await readFile(path.join(here,'closure.json')));
for(const f of closure.files){assert.equal(sha(await readFile(path.join(root,f.source))),f.sha256);assert.equal(sha(await readFile(path.join(here,f.destination))),f.sha256)}
const candidate=path.join(here,'source/work/claude/fog-spur-max-v1/candidate-terrain.ts'),baseline=path.join(here,'source/work/renderer-performance-v1/combined-candidate/client/src/render/terrain.ts');
const strings=await Promise.all([candidate,baseline].map(p=>readFile(p,'utf8')));
const regions=[['/** Immutable fog topology','export type FogTopology='],['/** Writes three vertex alphas','/** Fallback painted colours']];
const outside=strings.map(s=>{let out='',end=0;for(const [begin,stop] of regions){assert.equal(s.split(begin).length,2);assert.equal(s.split(stop).length,2);const a=s.indexOf(begin),b=s.indexOf(stop);assert(a>=end&&b>a);out+=s.slice(end,a);end=b}return out+s.slice(end)});assert.equal(outside[0],outside[1],'Undeclared source delta');
const imports=strings.map(s=>s.split('\n').filter(line=>line.startsWith('import ')));assert.deepEqual(imports[0],imports[1],'Import changes');
const sourceAudit={candidateSHA256:sha(strings[0]),baselineSHA256:sha(strings[1]),exactImports:imports[0],outsideTwoFunctionsByteExact:true,scope:'Byte comparison excluding only two uniquely delimited exported-function/comment regions; no rewrite or transformed exports used.'};
await writeFile(path.join(here,'source-audit.json'),JSON.stringify(sourceAudit,null,2)+'\n');
const result=await build({absWorkingDir:here,entryPoints:['source/work/claude/fog-spur-max-v1/fog-spur.test.ts'],outfile:path.join(here,'authored-tests.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',metafile:true,sourcemap:true});
await writeFile(path.join(here,'bundle-metafile.json'),JSON.stringify(result.metafile,null,2)+'\n');
const files=['client/node_modules/pixi.js/package.json','client/node_modules/pixi.js/lib/index.mjs','client/node_modules/esbuild/package.json','client/node_modules/typescript/package.json'];
const tools=[];for(const p of files){const b=await readFile(path.join(root,p));tools.push({path:p,sha256:sha(b),bytes:b.length,...p.endsWith('package.json')?{version:JSON.parse(b).version}:{}})}
await writeFile(path.join(here,'build-receipt.json'),JSON.stringify({sourceAudit,tools,metafileSHA256:sha(await readFile(path.join(here,'bundle-metafile.json'))),bundleSHA256:sha(await readFile(path.join(here,'authored-tests.mjs'))),sourceCopies:closure.files.length},null,2)+'\n');
console.log(JSON.stringify({sourceCopies:closure.files.length,bundleInputs:Object.keys(result.metafile.inputs),tools:tools.filter(t=>t.version).map(t=>[t.path,t.version])},null,2));
