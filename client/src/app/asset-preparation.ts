import type {GameMap} from '../runtime';
import type {CatalogIndex} from '../content/catalog';
import type {ArtLibrary} from '../render/art';
import {materialFor} from '../render/terrain';
import {AssetPreflight,planArtPreparation,verifyArtImages} from './asset-preflight';
export interface AssetPreparation {files:number;fallbacks:string[]}
/** Preflight actual files without retaining every faction atlas in GPU memory. */
export async function prepareBattleAssets(map:GameMap,slots:readonly {faction:string}[],catalog:CatalogIndex,art:ArtLibrary,onProgress?:(label:string)=>void,signal?:AbortSignal,environmentAssets:readonly string[]=[]):Promise<AssetPreparation>{
 signal?.throwIfAborted();const index=await art.init(),factions=[...new Set(slots.map(slot=>slot.faction))],sheets=new Set<string>(),fallbacks=new Set<string>();signal?.throwIfAborted();
 const resolve=(type:string,faction?:string)=>{const choice=art.resolve(type,faction,catalog);if(choice)sheets.add(choice.id);if(!choice||choice.standIn)fallbacks.add(`${faction??'neutral'}:${type}`)};
 for(const faction of factions){for(const unit of catalog.units.values())if(unit.faction===faction)resolve(unit.id,faction);for(const building of catalog.buildings.values())if(!building.faction||building.faction===faction)resolve(building.id,faction)}
 resolve('map.supply_field');resolve('map.central_shipment_site');for(const object of map.objects??[])resolve(`map.${object.class}`);if(map.stations?.length)resolve('map.energy_station');
 for(const id of environmentAssets){if(index.sprites[id])sheets.add(id);else fallbacks.add(id)}
 const verifier=new AssetPreflight({signal}),plan=await planArtPreparation(index,sheets,art.scale,verifier,onProgress);
 const terrain=new Set<string>();for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++)terrain.add(materialFor(map,x,y));for(const material of terrain)if(index.terrain.includes(material))plan.images.set(`/art/terrain/${material}.png`,{right:0,bottom:0});else fallbacks.add(`terrain:${material}`);
 await verifyArtImages(plan,verifier,onProgress);
 return {files:verifier.files,fallbacks:[...fallbacks].sort()};
}
