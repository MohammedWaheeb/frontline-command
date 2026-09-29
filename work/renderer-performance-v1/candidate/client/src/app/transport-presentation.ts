import type {PlayerSnapshot} from '../runtime';
import type {CatalogIndex} from '../content/catalog';

/** Cosmetic receiving activity from exact active owner-private board orders.
 * No hidden lookup, nearest-receiver guess, capacity or legality simulation. */
export function ownedBoardingReceivers(snapshot:PlayerSnapshot,catalog:CatalogIndex):number[]{
 const entities=new Map(snapshot.entities.map(entity=>[entity.id,entity])),receiving=new Set<number>();
 for(const passenger of snapshot.entities){
  if(passenger.owner!==snapshot.player||!passenger.private||passenger.state!=='board'||!passenger.complete||!passenger.enabled||passenger.health<=0||passenger.channelUntil<=snapshot.tick)continue;
  const order=passenger.private.orders[0];if(order?.kind!=='board'||!order.target)continue;
  const receiver=entities.get(order.target);if(!receiver||!receiver.complete||!receiver.enabled||receiver.health<=0||receiver.state==='destroyed')continue;
  const neutralGarrison=receiver.owner===0&&receiver.type==='map.garrison';if(receiver.owner!==snapshot.player&&!neutralGarrison)continue;
  const role=catalog.units.get(receiver.type)?.role??catalog.buildings.get(receiver.type)?.role;
  if(!neutralGarrison&&!['apc','airlift','bunker','safehouse'].includes(role??''))continue;
  receiving.add(receiver.id);
 }
 return [...receiving].sort((a,b)=>a-b);
}
