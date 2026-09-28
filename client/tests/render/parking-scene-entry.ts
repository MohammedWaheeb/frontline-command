import {BattlefieldRenderer} from '../../src/render/battlefield';
import {ArtLibrary} from '../../src/render/art';
import {CatalogIndex,type Catalog} from '../../src/content/catalog';
import {DEFAULT_SETTINGS} from '../../src/app/settings';
import {OfflineTransport} from '../../src/runtime/offline';
import {physicalArtType} from '../../src/render/art-id';
const runtime=new OfflineTransport();await runtime.ready;
const catalog=new CatalogIndex(await runtime.content() as unknown as Catalog);
let renderer:BattlefieldRenderer|undefined,art:ArtLibrary|undefined;
const errors:string[]=[];
async function dispose(){renderer?.dispose();renderer=undefined;await art?.release();return art?.statistics}
const api={
 async scene(name:string,quality:'standard'|'high'='standard'){
  await dispose();art=new ArtLibrary();art.configure(quality);await art.init();
  const fixture=await fetch(`/parking-fixtures/${name}.json`).then(response=>response.json());
  const saveResponse=await fetch(`/parking-fixtures/${name}.save.json`);const buffer=await saveResponse.arrayBuffer(),bytes=new Uint8Array(buffer);
  await runtime.load(bytes,[1]);const hash=await runtime.hash();if(hash!==fixture.hash)throw Error('Actual Go save differs from accepted native scene');
  const frame=runtime.current!,map=await runtime.map();
  renderer=await BattlefieldRenderer.create(document.getElementById('field')!,{map,catalog,art,settings:{...DEFAULT_SETTINGS,artQuality:quality,healthBars:'damaged',screenShake:0,reducedMotion:true},onGesture:()=>{},onError:error=>errors.push(error.message)});
  renderer.setSnapshot(frame);renderer.center(fixture.home.position);await renderer.whenAssetsReady();await new Promise(resolve=>setTimeout(resolve,200));
  const actors=(renderer as unknown as {actors:Map<number,any>}).actors;
  const focus=[fixture.home.id,...fixture.aircraft.map((value:{id:number})=>value.id)];
  const receipt=focus.map(id=>{
   const actor=actors.get(id),entity=frame.entities.find(entity=>entity.id===id),expected=fixture.view.entities.find((entity:{id:number})=>entity.id===id);
   if(!actor||!entity||!expected)throw Error(`Missing authorized focus actor ${id}`);
   for(const key of ['type','owner','facing','landed'])if(entity[key as keyof typeof entity]!==expected[key])throw Error(`Changed ${key} for ${id}`);
   if(entity.position!.x!==expected.position.x||entity.position!.y!==expected.position.y)throw Error(`Changed position for ${id}`);
   const faction=frame.players.find(player=>player.id===entity.owner)?.faction,resolved=art!.resolve(physicalArtType(entity),faction,catalog);
   if(!resolved||resolved.standIn||actor.standIn||actor.missingArt||actor.fallback.visible)throw Error(`Focus actor ${id} uses fallback art`);
   const parts=actor.parts.map((part:any)=>({poses:part.poses,visible:part.root.visible,layers:['beauty','team','shadow'].map(name=>{const pose=part.poses[name],sprite=part[name];if(!pose||!actor.sheet.hasFrame(name,pose.state,pose.direction,pose.frame)||!sprite.visible||sprite.texture.destroyed||sprite.texture.source.destroyed)throw Error(`Missing resident ${name} pose for ${id}`);return {name,pose,valid:true,tint:sprite.tint}})}));
   return {id,type:entity.type,physicalType:physicalArtType(entity),position:entity.position,facing:entity.facing,landed:entity.landed,asset:resolved.id,standIn:resolved.standIn,parts,bounds:actor.root.getBounds(),shadowBounds:actor.terrainShadow?.getBounds(),depth:actor.root.zIndex};
  });
  return {name,quality,tick:frame.tick,hash,afterHash:await runtime.hash(),focus:receipt,statistics:art.statistics,errors,legacyStrikeReference:receipt.some(actor=>actor.type==='IR.strike')};
 },
 async dispose(){const statistics=await dispose();runtime.dispose();return {statistics,canvases:document.querySelectorAll('canvas').length,errors}},
};
Object.defineProperty(window,'parkingQA',{value:api});document.body.dataset.ready='true';
