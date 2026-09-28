// Exact-file publication audit; gameplay validation remains exclusively Go.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(new URL('../../..',import.meta.url).pathname);
const index=JSON.parse(await readFile(`${root}/content/index.json`,'utf8'));
const release=JSON.parse(await readFile(`${root}/content/release.json`,'utf8'));
const rows=[];const errors=[];
for(const kind of ['maps','missions'])for(const entry of index[kind]){
 const b=await readFile(root+entry.url),v=JSON.parse(b),hash=createHash('sha256').update(b).digest('hex');
 if(b.length!==entry.bytes||hash!==entry.sha256)errors.push(`${entry.id}: exact-byte mismatch`);
 for(const field of ['id','version','title',...(kind==='maps'?['author']:['map_id','mode','faction'])])if(v[field]!==entry[field])errors.push(`${entry.id}: ${field} mismatch`);
 if(kind==='maps'&&v.spawns.length!==entry.players)errors.push(`${entry.id}: player count mismatch`);
 if(kind==='missions'){
  const p=JSON.parse(await readFile(root+entry.presentation_url));
  if(p.mission_id!==v.id||p.objectives.length!==v.objectives.length||!p.subtitles.length)errors.push(`${entry.id}: incomplete presentation`);
  if(new Set(p.subtitles.map(l=>l.key)).size!==p.subtitles.length)errors.push(`${entry.id}: duplicate transcript key`);
  rows.push({id:v.id,mode:v.mode,faction:v.faction,order:entry.order,map_id:v.map_id,objectives:v.objectives.map(o=>({id:o.id,text:o.text,optional:o.optional,failure:o.failure,at_end:!!o.at_end})),checkpoints:v.triggers.flatMap(t=>t.actions.filter(a=>a.kind==='checkpoint').map(a=>({trigger:t.id,name:a.text}))),tutorial_variants:(v.tutorial_variants||[]).map(x=>x.faction)});
 }
}
if(index.maps.length!==32||index.missions.length!==31||release.launch_maps.length!==8)errors.push('inventory count mismatch');
if(errors.length)throw Error(errors.join('\n'));
await writeFile(`${root}/work/claude/05-authoring/evidence/inventory.json`,JSON.stringify(rows,null,2)+'\n');
console.log(`Exact index bytes/hash/metadata and all31 presentation transcripts verified; 32 maps,31 missions,8 launch maps. No gameplay completion claim.`);
