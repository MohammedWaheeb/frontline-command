// Authoring-time checks for public region markers; no gameplay simulation.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {checkActorGroups,effectiveTutorialMission} from './lib/presentation-actors.mjs';
const project=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const read=async path=>JSON.parse(await readFile(join(project,path),'utf8'));
const index=await read('content/index.json');
const failures=[];
let markers=0,regionsRequired=0,actorGroups=0,variantActorGroups=0;
function conditionRegions(node,result){if(node.region)result.add(node.region);for(const child of node.children??[])conditionRegions(child,result);}
for(const entry of index.missions){
 const mission=await read(entry.url.slice(1));
 const mapRecord=index.maps.find(map=>map.id===mission.map_id);
 const map=await read(mapRecord.url.slice(1));
 const presentation=await read(entry.presentation_url.slice(1));
 const prefix=entry.id;
 if(presentation.mission_id!==entry.id||presentation.mission_version!==entry.version)failures.push(`${prefix}: presentation identity/version mismatch`);
 try{
  actorGroups+=checkActorGroups(mission,presentation.actor_groups);
  const factions=new Set();
  for(const entry of presentation.tutorial_factions??[]){
   if(factions.has(entry.faction))throw new Error(`${prefix}: duplicate faction metadata ${entry.faction}`);
   factions.add(entry.faction);
   const effective=effectiveTutorialMission(mission,entry.faction);
   checkActorGroups(effective,[...presentation.actor_groups,...(entry.actor_groups??[])]);
   variantActorGroups+=(entry.actor_groups??[]).length;
  }
 }catch(error){failures.push(error.message);}
 const regionIDs=new Set(map.regions.map(region=>region.id));
 const publicObjectives=new Set(mission.objectives.filter(objective=>!objective.failure).map(objective=>objective.id));
 const ids=new Set(),publishedRegions=new Set();
 if(!Array.isArray(presentation.markers)||presentation.markers.length>128){failures.push(`${prefix}: invalid marker array`);continue;}
 for(const marker of presentation.markers){
  if(typeof marker.id!=='string'||!marker.id||marker.id.length>128||ids.has(marker.id))failures.push(`${prefix}: invalid/duplicate marker ID ${marker.id}`);
  if(typeof marker.text!=='string'||!marker.text||marker.text.length>200)failures.push(`${prefix}: invalid label ${marker.id}`);
  if(!regionIDs.has(marker.region))failures.push(`${prefix}: unknown public region ${marker.region}`);
  if(marker.objective!==undefined&&!publicObjectives.has(marker.objective))failures.push(`${prefix}: unknown/private objective ${marker.objective}`);
  if(Object.keys(marker).some(key=>!['id','text','region','objective'].includes(key)))failures.push(`${prefix}: marker has unsupported non-region data ${marker.id}`);
  ids.add(marker.id);publishedRegions.add(marker.region);markers++;
 }
 const required=new Set();
 for(const objective of mission.objectives)if(!objective.failure)conditionRegions(objective.condition,required);
 for(const convoy of mission.convoys??[])for(const route of convoy.routes)for(const region of route)required.add(region);
 for(const region of required){regionsRequired++;if(!publishedRegions.has(region))failures.push(`${prefix}: public objective/convoy route region ${region} has no marker`);}
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log(`Validated ${index.missions.length} presentations, ${markers} public markers, ${regionsRequired} objective/convoy region references, ${actorGroups} common actor groups, and ${variantActorGroups} faction actor groups.`);
