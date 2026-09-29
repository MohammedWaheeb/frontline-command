// This checks only declared ID readiness; it never traverses or copies the art bytes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pin,readJSON,unique,writeJSON} from './io.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const [catalogPath,expectedSHA,outPath]=process.argv.slice(2);assert(catalogPath&&expectedSHA&&outPath);
const d=await pin(root,catalogPath);assert.equal(d.sha256,expectedSHA);const c=await readJSON(root,d),u=JSON.parse(await readFile(path.join(here,'universe.json')));
unique(c.assets,'id');const ids=[...c.assets.map(x=>x.id),...c.reference_graph_inventory.base_only_ids];unique(ids.map(id=>({id})),'id');const missing=u.expectedIds.filter(id=>!ids.includes(id)),extra=ids.filter(id=>!u.expectedIds.includes(id));
const result={status:missing.length||extra.length?'incomplete':'declared-ids-complete-only',scope:'Count/identity gate only. No export hashes, bulk inputs, normalization, full assembly or live publication verified.',catalog:d,selected:c.assets.length,inherited:c.reference_graph_inventory.base_only_ids.length,total:ids.length,expected:u.expectedIds.length,missing,extra,entries:c.assets.map(x=>({id:x.id,path:x.handoff,sha256:x.handoff_sha256}))};
assert(path.resolve(root,outPath).startsWith(here+path.sep));await writeJSON(path.resolve(root,outPath),result,{exclusive:true});console.log(JSON.stringify({status:result.status,total:result.total,missing:missing.length,extra:extra.length}));process.exitCode=missing.length||extra.length?2:0;
