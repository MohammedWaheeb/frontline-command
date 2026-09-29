import type {PlayerSnapshot} from '../runtime/types';
import type {CatalogBuilding} from '../content/catalog';

const tickValue=(n:number)=>Number.isSafeInteger(n)&&n>=0;
/** All timing comes from the currently authorized timeline, including replay. */
export function defeatCountdowns(snapshot:PlayerSnapshot|undefined){
 if(!snapshot||snapshot.outcome?.finished||!tickValue(snapshot.tick))return [];
 return snapshot.players.filter(player=>!player.defeated&&tickValue(player.defeatAt)&&player.defeatAt>snapshot.tick)
  .map(player=>({player:player.id,name:player.name,own:player.id===snapshot.player,seconds:Math.ceil((player.defeatAt-snapshot.tick)/20)}))
  .sort((a,b)=>Number(b.own)-Number(a.own)||a.player-b.player);
}

/** A timestamp describes the recorded observation; it never claims current sight. */
export function memoryCaption(seen:number,tick:number):string|undefined {
 if(!tickValue(seen)||!tickValue(tick)||seen>tick)return;
 const seconds=Math.floor(seen/20),minutes=Math.floor(seconds/60);
 return `LAST SEEN ${minutes}:${String(seconds%60).padStart(2,'0')}`;
}

export function placementPower(building:CatalogBuilding|undefined,economy:PlayerSnapshot['economy']):string {
 if(!building||!economy)return 'Power estimate unavailable';
 return `Power after build ${economy.powerDemand+building.power_demand}/${economy.powerCapacity+building.power_capacity}`;
}
