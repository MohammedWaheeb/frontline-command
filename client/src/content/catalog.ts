// Typed view of Go's immutable content catalog (GET /api/v1/content or the
// worker's content()). Used only for names, costs and prerequisite *explanations*.
export interface CatalogUnit {id:string;name:string;faction:string;role:string;cost:number;build_ticks:number;hp:number;armor:string;supply:number;tier:number;speed:number;weapon:string;producer:string;radius:number;sight:number;detection:number}
export interface CatalogBuilding {id:string;name:string;role:string;cost:number;build_ticks:number;hp:number;width:number;height:number;power_capacity:number;power_demand:number;prerequisites:string[];faction:string;service_slots:number;weapon:string;defense:boolean;qualifying:boolean}
export interface CatalogUpgrade {id:string;name:string;faction:string;cost:number;build_ticks:number;tier:number;producer:string;effect:string}
export interface CatalogWeapon {id:string;name?:string;kind?:string;range?:number;min_range?:number;targets?:string[];[key:string]:unknown}
export interface CatalogObject {id:string;width:number;height:number;hp:number;capacity:number}
export interface Catalog {version:string;units:CatalogUnit[];weapons:CatalogWeapon[];buildings:CatalogBuilding[];upgrades:CatalogUpgrade[];object_classes?:CatalogObject[]}

export class CatalogIndex {
 readonly units=new Map<string,CatalogUnit>();readonly buildings=new Map<string,CatalogBuilding>();readonly upgrades=new Map<string,CatalogUpgrade>();readonly weapons=new Map<string,CatalogWeapon>();readonly objects=new Map<string,CatalogObject>();
 constructor(readonly raw:Catalog){
  for(const u of raw.units??[])this.units.set(u.id,u);
  for(const b of raw.buildings??[])this.buildings.set(b.id,b);
  for(const u of raw.upgrades??[])this.upgrades.set(u.id,u);
  for(const w of raw.weapons??[])this.weapons.set(w.id,w);
  for(const object of raw.object_classes??[])this.objects.set(object.id,object);
 }
 name(type:string){return this.units.get(type)?.name??this.buildings.get(type)?.name??this.upgrades.get(type)?.name??mapObjectName(type)??type}
 isBuilding(type:string){return this.buildings.has(type)}
 unitClass(type:string):UnitClass{const u=this.units.get(type);return u?classify(u):'vehicle'}
 cost(type:string){return this.units.get(type)?.cost??this.buildings.get(type)?.cost??this.upgrades.get(type)?.cost}
 buildTicks(type:string){return this.units.get(type)?.build_ticks??this.buildings.get(type)?.build_ticks??this.upgrades.get(type)?.build_ticks}
}
function mapObjectName(type:string){if(type.startsWith('map.'))return type.slice(4).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());return undefined}
export type UnitClass='infantry'|'vehicle'|'tank'|'aircraft'|'drone'|'rotor'|'support';
const AIR_ROLES=new Set(['fighter','strike','shahed','gunship','airlift','isr','scout_drone']);
export function classify(u:Pick<CatalogUnit,'role'|'faction'|'armor'>):UnitClass{
 if(u.armor==='infantry')return 'infantry';
 if(AIR_ROLES.has(u.role))return u.faction==='IR'||u.role==='scout_drone'?'drone':u.role==='gunship'||u.role==='airlift'?'rotor':'aircraft';
 if(u.role==='tank')return 'tank';
 if(['rig','hauler','repair'].includes(u.role))return 'support';
 return 'vehicle';
}
export type ProductionTab='structures'|'defense'|'infantry'|'vehicles'|'aircraft'|'research';
export function tabFor(catalog:CatalogIndex,type:string):ProductionTab{
 const b=catalog.buildings.get(type);if(b)return b.defense||['abm','strategic','barrier'].includes(b.role)?'defense':'structures';
 if(catalog.upgrades.has(type))return 'research';
 const u=catalog.units.get(type);if(!u)return 'vehicles';
 const c=classify(u);return c==='infantry'?'infantry':c==='aircraft'||c==='drone'||c==='rotor'?'aircraft':'vehicles';
}
