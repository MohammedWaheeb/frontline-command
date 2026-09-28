// Explicit pre-run addition of the reviewed, isolated 59-effect candidate.
// No shipping assets or runtime files change; preserve the prior build receipt.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {access,cp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectEffectPack} from '../../scripts/ui/effect-pack.mjs';
import {writeBasePack} from '../../scripts/ui/art-plugin.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
assert(process.env.FRONTLINE_COMBAT_BUILD,'Choose the new, not-yet-run build explicitly.');
const dir=path.resolve(process.env.FRONTLINE_COMBAT_BUILD),product=path.join(dir,'product'),candidate=path.join(root,'work/art/effects-opus-v2/candidate-59');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const descriptor={url:'fx/index.json',sha256:'7ed104b52445915761e17654500fb217ca79843924a3a56c000e4a009d49aac5',bytes:9590};
try{await access(path.join(dir,'candidate-effects-receipt.json'));throw Error('Refusing to repeat candidate addition.')}catch(error){if(error.code!=='ENOENT')throw error}
const graph=await inspectEffectPack(candidate,{descriptor});assert.equal(Object.keys(graph.index.effects).length,59);
const buildBytes=await readFile(path.join(dir,'build.json')),build=JSON.parse(buildBytes),artBytes=await readFile(path.join(product,'art/index.json')),art=JSON.parse(artBytes),packBytes=await readFile(path.join(product,'assets/packs/base.json'));
assert.equal(art.effects,undefined);assert.equal(sha(packBytes),build.sha256.pack);
await writeFile(path.join(dir,'build-before-candidate-effects.json'),buildBytes);
await writeFile(path.join(dir,'art-index-before-candidate-effects.json'),artBytes);
await writeFile(path.join(dir,'pack-before-candidate-effects.json'),packBytes);
await cp(path.join(candidate,'fx'),path.join(product,'art/fx'),{recursive:true,errorOnExist:true,force:false});
art.effects=descriptor;await writeFile(path.join(product,'art/index.json'),JSON.stringify(art));
const afterGraph=await inspectEffectPack(path.join(product,'art'),{descriptor});
for(const rel of graph.files)assert.equal(sha(await readFile(path.join(candidate,rel))),sha(await readFile(path.join(product,'art',rel))),`Effect copy changed: ${rel}`);
const pack=await writeBasePack(product),packAfter=await readFile(path.join(product,'assets/packs/base.json'));
const receipt={time:new Date().toISOString(),scope:'Explicit pre-run isolated59FX addition; no shipping publication, source/runtime substitution or completeness claim.',candidate:path.relative(root,candidate),validationSHA256:sha(await readFile(path.join(candidate,'runtime-validation.json'))),descriptor,files:afterGraph.files.map(rel=>({path:rel,...afterGraph.descriptors.get(rel)})),before:{build:sha(buildBytes),art:sha(artBytes),pack:sha(packBytes)},after:{art:sha(await readFile(path.join(product,'art/index.json'))),pack:sha(packAfter)},helperSHA256:sha(await readFile(fileURLToPath(import.meta.url)))};
await writeFile(path.join(dir,'candidate-effects-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
build.art=art;build.sha256.pack=sha(packAfter);build.packFiles=pack.files.length;build.effectsCandidate={descriptor,receiptSHA256:sha(await readFile(path.join(dir,'candidate-effects-receipt.json'))),beforeBuildSHA256:sha(buildBytes)};
build.scope+=' Explicit reviewed isolated59FX candidate included; neither shipping art nor all132effect completion.';build.completed=new Date().toISOString();
await writeFile(path.join(dir,'build.json'),JSON.stringify(build,null,2)+'\n');
console.log(JSON.stringify({build:dir,effects:Object.keys(graph.index.effects).length,descriptor,pack:build.sha256.pack,packFiles:pack.files.length},null,2));
