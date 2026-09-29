// Restore only the unchanged private dependency copies. Never writes live files.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),baseline=JSON.parse(await readFile(path.join(here,'baseline-source.json'))),lock=JSON.parse(await readFile(path.join(here,'source-lock.json'))),sha=b=>createHash('sha256').update(b).digest('hex');
for(const record of baseline.files){if(lock.changedProduction.includes(record.path))continue;const bytes=await readFile(path.join(root,baseline.source,record.path));assert.equal(sha(bytes),record.sha256,record.path);const destination=path.join(here,'source/client/src',record.path);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,bytes)}
for(const record of lock.files)assert.equal(sha(await readFile(path.join(here,record.path))),record.sha256,record.path);
console.log('Private dependencies restored; all frozen source hashes agree.');
