import type {CatalogIndex} from './catalog';

// Keep the opening economy at the top of the construction palette. Never sort
// by affordability: income and prerequisite changes must not move a button
// underneath the pointer while the commander is choosing an order.
const STRUCTURE_ROLES=['power','supply','barracks','factory','airfield','drone_hub','workshop_air','radar','tech','depot','outpost','safehouse','hq','bunker','turret','aa_post','abm','strategic'];
export function productionOrder<T extends {type:string}>(choices:readonly T[],catalog:CatalogIndex):T[]{
 const unitOrder=new Map([...catalog.units.keys()].map((id,index)=>[id,index]));
 const rank=(id:string)=>{const building=catalog.buildings.get(id);if(building){const order=STRUCTURE_ROLES.indexOf(building.role);return order<0?99:order}const unit=catalog.units.get(id);return unit?100+unit.tier*100+(unitOrder.get(id)??99):1000};
 return [...choices].sort((a,b)=>rank(a.type)-rank(b.type)||a.type.localeCompare(b.type));
}
