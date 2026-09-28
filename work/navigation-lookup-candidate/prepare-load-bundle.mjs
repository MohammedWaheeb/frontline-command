// Freeze the already-tested renderer so independent hit-picking work cannot
// change a paired Go-runtime comparison. This writes no shipping files.
import {build} from '../../client/node_modules/esbuild/lib/main.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const own=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(own,'../..');
const captured=path.join(root,'work/art/sprite-terrain-depth/culling-source-v1');
const inputs={};
await mkdir(path.join(own,'browser-input'),{recursive:true});
const outfile=path.join(own,'browser-input/main.js');
await build({entryPoints:[path.join(root,'client/tests/render/load-fixture.ts')],outfile,bundle:true,format:'esm',platform:'browser',target:'es2022',plugins:[{
 name:'retained-renderer-for-runtime-comparison',setup(builder){
  builder.onLoad({filter:/\/src\/render\/(actors|art|battlefield)\.ts$/},async args=>{
   const relative=path.relative(root,args.path),source=path.join(captured,relative),contents=await readFile(source,'utf8');
   inputs[relative]={source,sha256:createHash('sha256').update(contents).digest('hex')};
   return {contents,loader:'ts',resolveDir:path.dirname(args.path)};
  });
 }
}]});
const sha256=createHash('sha256').update(await readFile(outfile)).digest('hex');
if(sha256!=='ebce6753b5c49f4014dff5663cca02f829eb8e99d759df4f7bae682104729915')throw Error('Bundle differs from prior quiet baseline; investigate before comparing');
await writeFile(path.join(own,'browser-input/receipt.json'),JSON.stringify({sha256,inputs,scope:'Exact retained renderer bundle; includes neither subsequent alpha picking nor other UI edits.'},null,2)+'\n');
console.log(sha256);
