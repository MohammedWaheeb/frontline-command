// Read actual Go-authorized snapshots through the real protobuf/ActorVisual
// path. Candidate state declarations are used without fabricated sprite pixels.
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fromJson,type JsonValue} from '@bufbuild/protobuf';
import {PlayerSnapshotSchema} from '../../../client/src/protocol/frontline_pb';
import {ActorVisual} from '../../../client/src/render/actors';
import {CatalogIndex,type Catalog} from '../../../client/src/content/catalog';
import type {ArtLibrary,SpriteSheet,SpriteState} from '../../../client/src/render/art';

const root=process.cwd(),out=process.env.FRONTLINE_PAYLOAD_COURSE!;
assert(out,'FRONTLINE_PAYLOAD_COURSE required');
const catalog=new CatalogIndex(JSON.parse(readFileSync(path.join(root,'work/navigation-lookup-candidate/source/pkg/content/rules.json'),'utf8')) as Catalog);
const expected:Record<string,string[]>={
 '01-initial-one-round':['parked'],
 '02-final-round':['empty','fire_empty'],
 '03-service-admission':['rearm_empty'],
 '04-half-service':['rearm_empty'],
 '05-disabled-service':['rearm_empty'],
 '06-home-loss-grounded':['parked_empty'],
 '07-emergency-airborne':['empty'],
 '08-backup-service':['rearm_empty'],
 '09-before-refill':['rearm_empty'],
 '10-refilled':['parked'],
};
const checks:unknown[]=[],specs:unknown[]=[];
try {
 for(const type of ['US.fighter','IR.gunship']){
  const native=JSON.parse(readFileSync(path.join(out,type,'result.json'),'utf8'));assert.equal(native.status,'passed');assert.equal(native.replay_views_exact,true);
  const specPath=path.join(root,'work/art/aircraft-payload-pilot/candidate-specs/unit.'+type+'.json'),bytes=readFileSync(specPath),spec=JSON.parse(bytes.toString());
  specs.push({type,path:path.relative(root,specPath),sha256:createHash('sha256').update(bytes).digest('hex')});
  const states=new Map<string,SpriteState>(spec.states.map((state:SpriteState)=>[state.name,state]));
  const course=JSON.parse(readFileSync(path.join(out,type,'course.json'),'utf8')) as Array<{stage:string;tick:number;actor:number;hash:string;owned:JsonValue;foreign:JsonValue}>;
  assert.equal(course.length,10);
  for(const point of course)for(const perspective of ['owned','foreign'] as const){
   const snapshot=fromJson(PlayerSnapshotSchema,point[perspective],{ignoreUnknownFields:true}),entity=snapshot.entities.find(e=>e.id===point.actor);assert(entity,'Actual foreign visibility must exist');
   const actor=new ActorVisual(entity,catalog,{resolve:()=>undefined} as unknown as ArtLibrary,type.slice(0,2));actor.viewer=snapshot.player;
   const internal=actor as unknown as {sheet:SpriteSheet;state:(now:number)=>SpriteState|undefined};internal.sheet={states,meta:{air:spec.air}} as SpriteSheet;
   const before=structuredClone(entity),pose=internal.state(point.tick*50)?.name;assert(pose);
   if(perspective==='owned')assert(expected[point.stage].includes(pose),`${type} ${point.stage}: ${pose}`);
   else {assert.equal(entity.private,undefined);assert(!pose.endsWith('_empty')&&pose!=='empty',`Foreign pose inferred ammunition: ${pose}`)}
   assert.deepEqual(entity,before,'Renderer mutated authorized facts');
   // Restore/rewind explicitly clears prior cosmetic feedback. The Go course
   // independently proved these same authorized views at each replay boundary.
   actor.cue('weapon_fired',point.tick*50,true);actor.clearFeedback();actor.update(entity,point.tick*50);assert.equal(internal.state(point.tick*50)?.name,pose);
   assert.equal(actor.missingPayloadArt,undefined,'Planned variant declarations missing');
   checks.push({type,stage:point.stage,tick:point.tick,hash:point.hash,viewer:snapshot.player,perspective,pose,...entity.private?{ammo:entity.private.ammo}: {}});actor.dispose();
  }
 }
 writeFileSync(path.join(out,'renderer.json'),JSON.stringify({status:'passed',scope:'Actual Go authorized views with candidate state declarations and real ActorVisual; no completed-art or pixel acceptance.',specs,checks},null,2)+'\n');console.log('40 actual Go owner/foreign pose and reset checks passed');
}catch(error){writeFileSync(path.join(out,'renderer.json'),JSON.stringify({status:'failed',error:String(error),specs,checks},null,2)+'\n');throw error}
