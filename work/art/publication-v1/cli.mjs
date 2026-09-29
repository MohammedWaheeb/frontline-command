import assert from 'node:assert/strict';
import path from 'node:path';
import {prepare,check,promote,recover} from './publication.mjs';
import {pin} from './io.mjs';
const [mode,...args]=process.argv.slice(2),flags={};assert(args.length%2===0,'Use explicit --name value pairs');for(let i=0;i<args.length;i+=2){assert(args[i].startsWith('--')&&!flags[args[i]],'Duplicate/invalid flag');flags[args[i]]=args[i+1]}
const root=path.resolve(flags['--root']??process.cwd()),out=path.resolve(root,flags['--out']??'');assert(flags['--out']);
const bound=async(base,p,hash)=>{assert(p&&hash,'Explicit path and SHA required');const d=await pin(base,p);assert.equal(d.sha256,hash);return d};
let value;
if(mode==='prepare')value=await prepare({root,out,selection:await bound(root,flags['--selection'],flags['--selection-sha'])});
else{const prepared=await bound(out,'prepared.json',flags['--prepared-sha']);if(mode==='check')value=await check({root,out,prepared});else{const checked=await bound(out,'checked.json',flags['--checked-sha']);if(mode==='promote')value=await promote({root,out,prepared,checked,boundary:flags['--boundary']?await bound(root,flags['--boundary'],flags['--boundary-sha']):undefined});else{assert.equal(mode,'recover');value=await recover({root,out,prepared,checked})}}}
console.log(JSON.stringify(value,null,2));
