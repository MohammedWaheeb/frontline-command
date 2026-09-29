// Private seven-file integration snapshot. No shipping writes or browser launch.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),here=path.resolve('work/ui-polish-validation-v1');
const digest=b=>createHash('sha256').update(b).digest('hex');
const pins={...JSON.parse(await readFile('work/art-residency-v1/baseline-pins.json')),...JSON.parse(await readFile('work/art-residency-v1/fixture-extra-pins.json'))};
async function guard(){for(const [rel,sha]of Object.entries(pins))assert.equal(digest(await readFile(path.join(root,rel))),sha,`Live input drift: ${rel}`)}
await guard();
const out=path.join(here,'checks-01'),source=path.join(out,'source');await mkdir(out);
execFileSync('cp',['-cR',path.resolve('work/art-residency-v1/candidate'),source]);
// The earlier private ArtLibrary snapshot is a convenience copy only. Restore
// and verify every pinned input before applying this explicitly closed delta.
for(const [rel,sha]of Object.entries(pins)){const dest=path.join(source,rel);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(root,rel),dest);assert.equal(digest(await readFile(dest)),sha)}
const changes=[];
for(const [prefix,files]of [
 ['work/claude/ui-polish-v4/candidate/client',['src/ui/App.tsx','src/styles/game.css','src/ui/StrikeReview.tsx','src/ui/strike-review.css']],
 ['work/renderer-performance-v1/combined-candidate/client',['src/render/art.ts','src/render/battlefield.ts','src/render/terrain.ts']],
])for(const rel of files){const src=path.join(root,prefix,rel),bytes=await readFile(src),dest='client/'+rel;assert(pins[dest],dest);await writeFile(path.join(source,dest),bytes);changes.push({path:dest,source:path.relative(root,src),before:pins[dest],after:digest(bytes)})}
await guard();
await writeFile(path.join(out,'inputs.json'),JSON.stringify({scope:'Private existing complete runtime suite and semantic checks on exactly four UI and three renderer candidate files. No browser, art, gameplay, performance or release acceptance.',pins,changes,source},null,2)+'\n');
await copyFile(new URL(import.meta.url),path.join(out,'actual-prepare.mjs'));
console.log(JSON.stringify({source,pinnedFiles:Object.keys(pins).length,changes:changes.length}));
