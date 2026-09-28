// Deterministic original-content build. Run from any directory with Node.
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {launchLayouts,campaignLayouts} from './layouts.mjs';
import {campaignMissions,tutorialMissions,coopMissions} from './missions.mjs';
import {PACK,previewPNG,routeDistance} from './lib/mapkit.mjs';

export const project=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
export const layouts=[...launchLayouts(),...campaignLayouts()];
const root=join(project,'content');
await Promise.all(['maps','missions','presentation'].map(d=>mkdir(join(root,d),{recursive:true})));
await mkdir(join(project,'work/claude/05-authoring/previews'),{recursive:true});
const mapRecords=[];
const review=[];
for(const layout of layouts) {
  const map=layout.builder.toJSON();layout.map=map;
  const bytes=Buffer.from(JSON.stringify(map)+'\n');
  await writeFile(join(root,'maps',`${map.id}.json`),bytes);
  await writeFile(join(project,'work/claude/05-authoring/previews',`${map.id}.png`),previewPNG(map,4));
  mapRecords.push({id:map.id,version:map.version,title:map.title,author:map.author,url:`/content/maps/${map.id}.json`,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,players:map.spawns.length,kind:layout.kind,required_packs:[PACK]});
  if(layout.kind==='skirmish') {
    const starts=map.spawns.map((s,i)=>{
      const field=map.fields.filter(f=>f.credits===36000000).sort((a,b)=>Math.hypot(a.position.x-s.position.x,a.position.y-s.position.y)-Math.hypot(b.position.x-s.position.x,b.position.y-s.position.y))[0];
      return {spawn:i+1,field:field.id,geometric_ground_route_tiles:routeDistance(map,s.position,field.position,{clearance:2}),nearest_map_edge_tiles:Math.min(s.position.x,s.position.y,map.width*1000-s.position.x,map.height*1000-s.position.y)/1000};
    });
    review.push({map:map.id,starts,measurement_scope:'Geometric route diagnostics only; actual Go hauler-income parity and six-matchup review remain required.'});
  }
}
await writeFile(join(root,'release.json'),JSON.stringify({format_version:1,launch_maps:layouts.filter(l=>l.launch).map(l=>l.map.id)},null,2)+'\n');
await writeFile(join(project,'work/claude/05-authoring/map-review.json'),JSON.stringify(review,null,2)+'\n');

const missionRecords=[];
for(const {builder:m} of [...tutorialMissions(layouts),...campaignMissions(layouts),...coopMissions(layouts)]) {
  const mission=m.build(),bytes=Buffer.from(JSON.stringify(mission)+'\n');
  await writeFile(join(root,'missions',`${mission.id}.json`),bytes);
  const presentation=m.presentation({author:'Codex authored scenarios during authorized quota takeover; Claude Opus 5.5 authored original helpers',tutorial_steps:m.presentationSteps||[],tutorial_factions:m.variantPresentation||[],art_status:'Declared art references require the separately produced asset pack; no voice or illustration delivery is claimed here.'});
  await writeFile(join(root,'presentation',`${mission.id}.json`),JSON.stringify(presentation,null,2)+'\n');
  missionRecords.push({id:mission.id,version:mission.version,title:mission.title,url:`/content/missions/${mission.id}.json`,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,map_id:mission.map_id,mode:mission.mode,faction:mission.faction,order:m.meta.order,required_packs:[PACK],presentation_url:`/content/presentation/${mission.id}.json`});
}
const index={format_version:1,version:'2.0.0',packs:[{id:PACK,version:'2.0.0',manifest_url:'/assets/packs/base.json'}],maps:mapRecords,missions:missionRecords};
// The root/UI lane supplies the actual pack manifest. Referencing the declared
// dependency does not claim it exists, is downloaded, or is fully authored.
await writeFile(join(root,'index.json'),JSON.stringify(index,null,2)+'\n');
console.log(`Authored ${mapRecords.length} maps and ${missionRecords.length} missions.`);
