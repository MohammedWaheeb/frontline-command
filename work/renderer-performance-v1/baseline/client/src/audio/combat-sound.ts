import {combatFacts} from '../app/combat-feedback';
import type {CatalogIndex} from '../content/catalog';
import type {Event,PlayerSnapshot} from '../protocol/frontline_pb';
import {impactSound} from './battlefield-sound';
export interface CombatSoundCue {sound?:string;caption?:string;cooldown:number;kind:'weapon'|'impact'|'intercept'|'decoy'}
/** Chooses existing audio only. The shared facts helper owns positive-hit privacy;
 * unknown outcome is never called a miss, block, decoy or failed interception. */
export function combatSound(event:Event,snapshot:PlayerSnapshot,previous:PlayerSnapshot,catalog:CatalogIndex|undefined):CombatSoundCue|undefined {
 if(event.kind==='missile_intercepted')return {kind:'intercept',sound:'sfx.intercept_burst',cooldown:100};
 if(event.kind==='decoy_triggered')return {kind:'decoy',caption:'Decoy defeated an incoming shot.',cooldown:0};
 if(event.kind!=='weapon_fired'&&event.kind!=='impact')return;
 const facts=catalog?combatFacts(event,snapshot,catalog):undefined;
 // Without a catalog no extension can be validated, so do not reconstruct it.
 const extension=(event as Event&{combat?:unknown}).combat,legacy=facts?.metadata==='absent'||!catalog&&extension==null;
 const entity=legacy?(snapshot.entities.find(value=>value.id===event.entity)??previous.entities.find(value=>value.id===event.entity)):undefined;
 if(event.kind==='weapon_fired'){
  const weapon=facts?.weapon??(legacy&&entity?(catalog?.units.get(entity.type)?.weapon??catalog?.buildings.get(entity.type)?.weapon):undefined);
  // Synthetic strategic rounds have no authored per-weapon firing clip. Their
  // existing operation warnings remain separate, rather than requesting fake IDs.
  return {kind:'weapon',sound:weapon&&!['SATURATION','SKYBREAKER'].includes(weapon)?`sfx.weapon.${weapon}`:undefined,cooldown:60};
 }
 let sound='sfx.impact_ground';
 if(legacy)sound=impactSound(entity,catalog);
 else if(facts?.hit){
  if(facts.targetArmor==='structure')sound='sfx.impact_structure';
  else if(facts.targetArmor==='heavy')sound='sfx.impact_metal_heavy';
  else if(facts.targetArmor==='light'||facts.targetArmor==='air')sound='sfx.impact_metal_light';
 }
 return {kind:'impact',sound,cooldown:70};
}
