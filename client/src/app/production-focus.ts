import type {Entity,PlayerSnapshot,CommandAffordances} from '../runtime';
import {tabFor,type CatalogIndex,type ProductionTab} from '../content/catalog';

/** Navigation categories only. Availability, costs and execution stay in Go. */
export function productionCategories(entity:Entity,catalog:CatalogIndex,faction:string):ProductionTab[]{
 const role=catalog.units.get(entity.type)?.role??catalog.buildings.get(entity.type)?.role;
 if(role==='rig')return ['structures','defense'];
 if(role==='engineer')return ['defense'];
 if(!catalog.buildings.has(entity.type))return [];
 const types=[...catalog.units.values()].filter(unit=>unit.faction===faction&&(unit.producer===role||role==='factory'&&unit.role==='rig')).map(unit=>unit.id);
 types.push(...[...catalog.upgrades.values()].filter(upgrade=>(!upgrade.faction||upgrade.faction===faction)&&upgrade.producer===role).map(upgrade=>upgrade.id));
 return [...new Set(types.map(type=>tabFor(catalog,type)))];
}
export function productionSources(snapshot:PlayerSnapshot,catalog:CatalogIndex):Entity[]{
 const faction=snapshot.players.find(player=>player.id===snapshot.player)?.faction??'';
 return snapshot.entities.filter(entity=>entity.owner===snapshot.player&&entity.private&&entity.private.hp>0n&&!entity.private.container&&productionCategories(entity,catalog,faction).length>0).sort((a,b)=>a.id-b.id);
}
export function productionFocus(snapshot:PlayerSnapshot,catalog:CatalogIndex,previous:number|undefined,selection:readonly number[],category?:ProductionTab):number|undefined{
 const sources=productionSources(snapshot,catalog),faction=snapshot.players.find(player=>player.id===snapshot.player)?.faction??'';
 const eligible=category?sources.filter(entity=>productionCategories(entity,catalog,faction).includes(category)):sources;
 // A deliberate single facility selection follows that facility. Box/select-all
 // gestures often include a headquarters while collecting troops; they must
 // not silently replace the production queue the player was managing.
 const selected=selection.length===1?eligible.find(entity=>selection[0]===entity.id):undefined;if(selected)return selected.id;
 if(eligible.some(entity=>entity.id===previous))return previous;
 // The HQ has the lowest starting ID, but its queue only replaces support
 // units. The opening needs the rig's structure palette immediately.
 const builder=eligible.find(entity=>entity.complete&&entity.enabled&&catalog.units.get(entity.type)?.role==='rig');
 if(builder)return builder.id;
 // Prefer a usable established source for navigation, but retain offline or
 // incomplete alternatives so Go can explain why their options are disabled.
 return eligible.find(entity=>entity.complete&&entity.enabled)?.id??eligible[0]?.id;
}
export interface OpeningObjective {id:string;title:string;description:string;type?:string;producer?:number;complete:boolean}
/** Nonbinding opening guidance; only disclosed owned structures advance it.
 * Keep a foundation's step visible until it finishes instead of telling the
 * player to place an unavailable prerequisite. Dismissal hides the current
 * step; it never bypasses a prerequisite to recommend later construction. */
export function openingObjective(snapshot:PlayerSnapshot,catalog:CatalogIndex,dismissed:readonly string[]=[]):OpeningObjective|undefined{
 const faction=snapshot.players.find(player=>player.id===snapshot.player)?.faction;
 if(!faction||snapshot.outcome?.finished||snapshot.players.find(player=>player.id===snapshot.player)?.defeated)return;
 const own=snapshot.entities.filter(entity=>entity.owner===snapshot.player&&entity.private&&entity.private.hp>0n);
 for(const role of ['power','supply','barracks','factory']){
  if(own.some(entity=>entity.complete&&catalog.buildings.get(entity.type)?.role===role))continue;
  const id=`opening-${role}`;if(dismissed.includes(id))return;
  const building=[...catalog.buildings.values()].find(building=>building.role===role&&(!building.faction||building.faction===faction));if(!building)return;
  const underway=own.some(entity=>catalog.buildings.get(entity.type)?.role===role);
  const builder=productionSources(snapshot,catalog).find(entity=>catalog.units.get(entity.type)?.role==='rig'&&entity.complete&&entity.enabled);
  return {id,type:building.id,producer:builder?.id,complete:false,title:`${underway?'Finish':'Build'} ${building.name}`,
   description:underway?'Construction is underway. Keep your Engineering rig safe.':role==='power'?'Select your Engineering rig and place power to start your base.':role==='supply'?'Build near a known supply field to start collecting credits.':role==='barracks'?'Train infantry to scout and defend your supply route.':'Build vehicles to expand and protect your base.'};
 }
}
/** Extra sidebar advice must never add factory commands to a selected army. */
export function selectionAffordances(advice:CommandAffordances,selection:readonly number[]):CommandAffordances{
 return {...advice,entities:advice.entities.filter(entity=>selection.includes(entity.id))};
}
