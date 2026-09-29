// Source-only freeze and preflight; no browser/host/native binary execution.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=['browser.mjs','observer.mjs','observer.test.mjs','prepare.mjs',...(await readdir(path.join(here,'helpers'))).filter(f=>f.endsWith('.mjs')).sort().map(f=>'helpers/'+f)];
const pins={};for(const file of files)pins[file]=sha(await readFile(path.join(here,file)));
for(const file of ['client/package-lock.json','client/node_modules/playwright-core/package.json'])pins[path.relative(here,path.join(root,file))]=sha(await readFile(path.join(root,file)));
const old=JSON.parse(await readFile(path.join(root,'work/art-generation-diagnostic-v1/helper-lock.json')));for(const [file,digest]of Object.entries(old.files))if(file.startsWith('helpers/'))assert.equal(pins[file],digest,'Historical helper changed');
const lock={scope:'Source-only successor to original-reader diagnostics. Exact app-v3-build-03 and prepared-02 remain unchanged; no browser acceptance yet.',parentPreparedSHA256:'e7637f6546778c4bc38c79d4f00317860c69c405b627cfa5415e4dac444875f2',productBuildSHA256:'f714d2d6c761dc9b389f91034f361e4662f0c420e42905b1229b1ee76d7cd445',files:pins};
const bytes=JSON.stringify(lock,null,2)+'\n';await writeFile(path.join(here,'source-lock.json'),bytes,{flag:'wx'});console.log(JSON.stringify({sourceLockSHA256:sha(bytes),files:files.length,allPins:Object.keys(pins).length}));
