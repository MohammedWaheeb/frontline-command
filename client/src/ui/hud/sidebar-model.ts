// Presentation-only helpers for the command sidebar (hud-sidebar lane). They
// read disclosed owner state from the snapshot and catalog. Go stays
// authoritative for availability, costs and execution. This is a thin local
// adapter. Codex may promote it to app/ later.
import type {KeyChord} from '../../runtime/keybindings';
import type {CommandAffordances,Entity,PlayerSnapshot} from '../../runtime/types';
import {tabFor,type CatalogIndex,type ProductionTab} from '../../content/catalog';
import type {ProductionChoice} from '../../app/battle-controller';
import {credits,reason} from '../../content/labels';
import {unitGuidance} from '../../content/unit-guidance';
import {buildingPrerequisites,type BuildingRequirement} from '../../content/building-prerequisites';

export type CameoState='ready'|'queued'|'building'|'waiting'|'locked'|'limit';

/** Short stamp words (≤ 7 characters) keyed by the readable reason text the controller shows. Each state also has a glyph, so it never relies on colour alone. */
const STAMPS=new Map([
 ['missing_prerequisite','LOCKED'],['prerequisite_lost','LOCKED'],['missing_tier','TIER'],['insufficient_credits','CREDITS'],['insufficient_energy','ENERGY'],
 ['producer_disabled','OFFLINE'],['queue_full','FULL'],['supply_cap','SUPPLY'],['structure_limit','LIMIT'],['defense_limit','LIMIT'],['unique_limit','MAX 1'],
 ['already_researched','DONE'],['already_queued','QUEUED'],['queued','QUEUED'],['cooldown','COOLING'],
].map(([code,tag]):[string,string]=>[reason(code),tag]));
const LIMITS=new Set(['queue_full','supply_cap','structure_limit','defense_limit','unique_limit','already_researched'].map(code=>reason(code)));

export function cameoStamp(choice:Pick<ProductionChoice,'available'|'reason'|'waitsFor'>):string|undefined{
 const text=choice.available?choice.waitsFor:choice.reason;
 if(!text)return undefined;
 return STAMPS.get(text)??(choice.available?'WAIT':'LOCKED');
}

export interface ConstructionSite {id:number;type:string;name:string;progress:number;position?:{x:number;y:number};stalled:boolean;noRig:boolean;tab:ProductionTab}

/** Own unfinished structures (foundations), most advanced first. "Stalled" comes from the
 * owner HUD advice (`construction_stalled`, Go: no progress for 60 observed ticks); missing or
 * stale advice means "not known to be stalled" — the UI never infers it locally. */
export function constructionSites(snapshot:PlayerSnapshot|undefined,catalog:CatalogIndex,advice?:CommandAffordances):ConstructionSite[]{
 if(!snapshot)return [];
 const fresh=advice&&advice.player===snapshot.player?advice:undefined;
 const own=snapshot.entities.filter(entity=>entity.owner===snapshot.player&&entity.private&&entity.private.hp>0n);
 const rigs=own.filter(entity=>catalog.units.get(entity.type)?.role==='rig'&&entity.position);
 const sites:ConstructionSite[]=[];
 for(const entity of own){
  const building=catalog.buildings.get(entity.type);
  if(!building||entity.complete||building.id.startsWith('map.'))continue;
  const stalled=!snapshot.countdown&&fresh?.entities.find(value=>value.id===entity.id)?.construction_stalled===true;
  const near=(rig:Entity)=>!!entity.position&&!!rig.position&&Math.hypot(rig.position.x-entity.position.x,rig.position.y-entity.position.y)<=Math.max(building.width,building.height)*1000/2+3000;
  sites.push({id:entity.id,type:entity.type,name:building.name,progress:Math.max(0,Math.min(1000,entity.progress)),position:entity.position?{x:entity.position.x,y:entity.position.y}:undefined,stalled,noRig:stalled&&!rigs.some(near),tab:tabFor(catalog,entity.type)});
 }
 return sites.sort((a,b)=>b.progress-a.progress||a.id-b.id);
}
/** @deprecated name kept for frozen builds; use constructionSites. */
export const useConstructionSites=constructionSites;

/** Nearest operating rig to a point, for "send rig" on a stalled foundation. */
export function nearestRig(snapshot:PlayerSnapshot|undefined,catalog:CatalogIndex,point:{x:number;y:number}|undefined):Entity|undefined{
 if(!snapshot||!point)return undefined;
 let best:Entity|undefined,distance=Infinity;
 for(const entity of snapshot.entities){
  if(entity.owner!==snapshot.player||!entity.private||entity.private.hp<=0n||!entity.position||catalog.units.get(entity.type)?.role!=='rig')continue;
  const d=Math.hypot(entity.position.x-point.x,entity.position.y-point.y);if(d<distance){distance=d;best=entity}
 }
 return best;
}

export interface TabBadge {count:number;idle:boolean}
/** Per category: jobs queued across every own producer plus foundations under construction; `idle` when an operating non-rig producer of that category has an empty queue. */
export function tabBadges(snapshot:PlayerSnapshot|undefined,catalog:CatalogIndex,sources:readonly Entity[],categories:(entity:Entity)=>ProductionTab[],sites:readonly ConstructionSite[]):Record<ProductionTab,TabBadge>{
 const out={structures:{count:0,idle:false},defense:{count:0,idle:false},infantry:{count:0,idle:false},vehicles:{count:0,idle:false},aircraft:{count:0,idle:false},research:{count:0,idle:false}} as Record<ProductionTab,TabBadge>;
 if(!snapshot)return out;
 for(const source of sources){
  for(const job of source.private?.jobs??[])out[tabFor(catalog,job.type)].count++;
  if(source.complete&&source.enabled&&!source.private?.jobs.length&&catalog.buildings.has(source.type))for(const tab of categories(source))if(tab!=='structures'&&tab!=='defense')out[tab].idle=true;
 }
 for(const site of sites)out[site.tab].count++;
 return out;
}

export interface PowerReadout {demand:number;capacity:number;state:'ok'|'high'|'low'|'off';fill:number;label:string}
/** The single power readout: demand (used) against capacity (produced). */
export function powerReadout(demand=0,capacity=0):PowerReadout{
 const d=Number.isFinite(demand)?Math.max(0,demand):0,c=Number.isFinite(capacity)?Math.max(0,capacity):0;
 const state=d>c?'low':c===0?'off':d>=0.8*c?'high':'ok';
 const fill=c>0?Math.min(1,d/c):d>0?1:0;
 return {demand:d,capacity:c,state,fill,label:state==='off'?'Power: none produced, none used.':d>c?`Low power: ${d} used of ${c} produced. Production and construction run at half speed. Build a Power station.`:`Power: ${d} used of ${c} produced, ${c-d} spare.`};
}

const BUILDING_ROLES:Record<string,string>={
 hq:'Command · trains Engineering rigs',power:'Power · supplies your base',supply:'Economy · haulers deliver supplies here',barracks:'Production · trains infantry',
 factory:'Production · builds vehicles',radar:'Intel · reveals the minimap, unlocks tier 2',tech:'Technology · unlocks tier 3',depot:'Support · repairs vehicles',
 outpost:'Forward base · extends the build radius',bunker:'Defense · garrison for infantry',barrier:'Defense · blocks movement',turret:'Defense · anti-ground gun',
 aa_post:'Defense · anti-air',abm:'Defense · intercepts missiles',strategic:'Strategic · charges your faction operation',airfield:'Production · builds and services aircraft',
 drone_hub:'Production · builds drones',workshop_air:'Production · builds aircraft',safehouse:'Production · hidden infantry base',
};

export interface CameoTip {
 name:string;cost:string;seconds?:number;power?:{value:number;kind:'gain'|'use'};role?:string;strong?:string;weak?:string;effect?:string;
 blocker?:{tone:'locked'|'waiting';text:string};requirements:{name:string;met:boolean;state:BuildingRequirement['state']}[];
 queued:number;progress?:number;help:string;
}
/** Tooltip lines for one cameo, in layers: name and numbers, role, counters, blockers, prerequisites, mouse help. */
export function cameoTip(snapshot:PlayerSnapshot|undefined,catalog:CatalogIndex,choice:ProductionChoice,queued:number,progress?:number):CameoTip{
 const building=catalog.buildings.get(choice.type),unit=catalog.units.get(choice.type),upgrade=catalog.upgrades.get(choice.type);
 const ticks=catalog.buildTicks(choice.type),guide=unit?unitGuidance(catalog,choice.type):undefined;
 const power=building?(building.power_capacity>0?{value:building.power_capacity,kind:'gain' as const}:building.power_demand>0?{value:building.power_demand,kind:'use' as const}:undefined):undefined;
 const model=buildingPrerequisites(snapshot,catalog,choice);
 const blocker=!choice.available&&choice.reason?{tone:'locked' as const,text:choice.reason}:choice.waitsFor?{tone:'waiting' as const,text:`Queue waits: ${choice.waitsFor}`}:undefined;
 return {
  name:catalog.name(choice.type),cost:credits(catalog.cost(choice.type)??0),seconds:ticks?Math.round(ticks/20):undefined,power,
  role:guide?.role??(building?BUILDING_ROLES[building.role]:upgrade?'Research upgrade':undefined),strong:guide?.targets,weak:guide?.counters,
  effect:upgrade?`Unlocks ${upgrade.name.toLowerCase()} for your forces.`:undefined,blocker,
  requirements:model?model.requirements.map(requirement=>({name:requirement.name,met:requirement.state==='met',state:requirement.state})):[],
  queued,progress,
  help:choice.kind==='build'?'Click to place · Esc or right-click cancels placement':'Click to queue · Shift-click ×5 · right-click cancels one',
 };
}

/** Production hotkeys come from the user's bindings, never hard-coded letters.
 * The client-logic-2 lane is adding tab and cameo-slot actions. Their ids are
 * matched by pattern, so presets and remaps show correctly as soon as they land:
 * a tab id names production/tab/category plus the category, and a slot id ends
 * in slot/cameo plus a number. Missing bindings show no keycap. */
const TAB_ALIASES:Record<ProductionTab,readonly string[]>={structures:['structures','structure','base'],defense:['defense','defence','def'],infantry:['infantry','inf'],vehicles:['vehicles','vehicle','veh'],aircraft:['aircraft','air'],research:['research','tech']};
type BindingTable=Record<string,readonly {code:string;modifiers?:readonly string[]}[]|undefined>;
export function tabBindingId(keys:BindingTable,tab:ProductionTab,index:number):string|undefined{
 const ids=Object.keys(keys).filter(id=>/(production|tab|category)/.test(id)&&!/(slot|cameo|next|prev|cycle)/.test(id));
 return ids.find(id=>TAB_ALIASES[tab].some(alias=>new RegExp(`(^|_)${alias}($|_)`).test(id)))??ids.find(id=>new RegExp(`(^|_)${index+1}$`).test(id));
}
export function slotBindingId(keys:BindingTable,slot:number):string|undefined{
 return Object.keys(keys).find(id=>new RegExp(`(slot|cameo)_?0*${slot}$`).test(id)&&!/card|command|cancel|batch|five|x5|shift/.test(id));
}

/** Display only configured shortcuts; empty/legacy maps never imply a hidden fallback. */
export function productionTabShortcut(keys:Record<string,readonly KeyChord[]|undefined>,tab:ProductionTab,index:number):readonly KeyChord[]{const id=tabBindingId(keys,tab,index);return id?keys[id]??[]:[]}
