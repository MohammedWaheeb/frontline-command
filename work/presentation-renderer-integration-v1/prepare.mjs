// Exact seven-file integration in a private snapshot; no product writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),out=path.resolve('work/presentation-renderer-integration-v1/checks-01'),source=path.join(out,'source'),sha=b=>createHash('sha256').update(b).digest('hex');
const prior=JSON.parse(await readFile('work/ui-polish-validation-v1/checks-01/inputs.json'));
const changes=prior.changes.map(c=>c.path==='client/src/render/battlefield.ts'?{...c,source:'work/renderer-performance-browser-v1/memory-label-v1/candidate-battlefield.ts',after:'259e490c099a7f1b67e22bece69ba6f1cab6a443839a47d96500eddd77d2648f'}:c);
const after={...prior.pins};for(const c of changes)after[c.path]=c.after;
async function guard(base,pins){for(const[p,h]of Object.entries(pins))assert.equal(sha(await readFile(path.join(base,p))),h,p)}
await guard(root,prior.pins);await mkdir(out);execFileSync('cp',['-cR',prior.source,source]);
for(const c of changes){const b=await readFile(c.source);assert.equal(sha(b),c.after);await writeFile(path.join(source,c.path),b)}
await guard(source,after);await guard(root,prior.pins);
await writeFile(path.join(out,'inputs.json'),JSON.stringify({pins:prior.pins,after,changes,source,scope:'Exact four reviewed UI files and three reviewed renderer files including Container ownership correction; fog MAX rejected and excluded.'},null,2)+'\n');
console.log(JSON.stringify({source,changes:changes.length,pins:Object.keys(after).length}));
