import type {CatalogIndex, CatalogWeapon} from '../content/catalog';
import type {PlayerSnapshot, Point} from '../runtime/types';
import {ownerRanges,type OwnerRanges} from './owner-ranges';

/** Geometry is in Go millitiles (1,000 per tile), never screen pixels. */
export type TacticalRelation='own'|'allied'|'hostile'|'neutral'|'unknown';
export interface TacticalDeadline {at:number; remainingTicks:number; remainingSeconds:number}
export type TacticalArea=
 |{kind:'circle';radius:number;source:'catalog-splash'|'snapshot-splash'|'snapshot-zone'}
 |{kind:'point';reason:'destination'|'single-target'|'radius-not-disclosed'};
export interface TacticalWarning {
 key:string;kind:string;owner:number;relation:TacticalRelation;position:Point;
 area:TacticalArea;deadline:TacticalDeadline;deadlineKind:'impact'|'launch'|'arrival'|'deployment'|'unknown';
 /** Only raid warnings currently disclose exact exits. Empty never means none exist. */
 exits:Point[];source?:number;weapon?:string;
}
export interface TacticalZone {
 key:string;kind:string;owner:number;relation:TacticalRelation;position:Point;
 area:Extract<TacticalArea,{kind:'circle'}>;phase:'preparing'|'active';start:number;until:number;
 deadline:TacticalDeadline;
}
export interface TacticalProjectile {
 id:number;owner:number;weapon:string;interceptable:boolean;
 /** Absent when the wire position could be a substituted hidden impact marker. */
 bodyPosition?:Point;
 /** No trajectory or hidden endpoint is inferred from a projectile snapshot. */
 bodyEffect?:string;
}
export interface TacticalOrderMarker {
 index:number;kind:string;position?:Point;target?:number;unresolvedTarget:boolean;
 /** Patrol intent, not Go's collision/pathfinding route. */
 patrol?:{points:Point[];next:number};area?:TacticalArea;
}
export interface TacticalWeaponRange {
 weapon:string;minimum:number;maximum:number;metric:'edge-distance';
 origin:{kind:'circle';radius:number}|{kind:'rectangle';width:number;height:number};
 /** Static reference only: target shape, LOS, deployment, ammo and legality stay in Go. */
 advisory:true;
}
export interface TacticalSelection {
 entity:number;position:Point;orders:TacticalOrderMarker[];rally?:Point;weaponRange?:TacticalWeaponRange;
 /** Catalog base values are not current sight, LOS, detection or attack legality. */
 catalogSight?:number;catalogDetection?:number;
 ranges?:OwnerRanges;
}
export interface TacticalActorStatus {
 entity:number;position:Point;owner:number;relation:TacticalRelation;state:string;
 enabled:boolean;complete:boolean;deployed:boolean;concealed:boolean;health:number;rank:number;
 progress:number;channel?:TacticalDeadline;
 /** Public disabled does not identify sabotage; private cooldowns do not identify active buffs. */
 own?:{ambushReady:boolean;lowPower?:boolean;ammo?:number;ammoCapacity?:number;charges?:number;
  enduranceTicks?:number;returnOrdered?:boolean;home?:number;homePosition?:Point;repeatSortie?:boolean};
}
export interface TacticalEventCue {
 id:number;tick:number;kind:string;owner:number;entity?:number;position?:Point;
 /** Deliberately unknown for ambiguous impact events, including entity=0. */
 impactOutcome?:'unspecified';
}
export interface TacticalGap {code:string;subject:string}
export interface TacticalPresentation {
 tick:number;warnings:TacticalWarning[];zones:TacticalZone[];projectiles:TacticalProjectile[];
 /** Minimap-only public pulse: not a world marker, target, fog reveal or entity. */
 minimapIndicators:Array<{owner:number;relation:TacticalRelation;position:Point}>;
 defeatCountdowns:Array<{player:number;deadline:TacticalDeadline}>;
 selected:TacticalSelection[];actors:TacticalActorStatus[];eventCues:TacticalEventCue[];gaps:TacticalGap[];
}

const TICKS_PER_SECOND=20;
export function tacticalDeadline(tick:number,at:number):TacticalDeadline {
 const remainingTicks=Math.max(0,at-tick);
 return {at,remainingTicks,remainingSeconds:remainingTicks/TICKS_PER_SECOND};
}
function point(p:Point|undefined):Point|undefined {
 return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?{x:p.x,y:p.y}:undefined;
}
function nonnegative(value:unknown):number|undefined {
 return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:undefined;
}
function blastArea(weapon:CatalogWeapon|undefined,instanceSplash?:unknown):TacticalArea {
 const radius=nonnegative(instanceSplash===undefined?weapon?.splash:instanceSplash);
 return radius===undefined?{kind:'point',reason:'radius-not-disclosed'}:
  radius===0?{kind:'point',reason:'single-target'}:{kind:'circle',radius,source:instanceSplash===undefined?'catalog-splash':'snapshot-splash'};
}
function equal(a:Point,b:Point){return a.x===b.x&&a.y===b.y}
const BODY_EFFECT:Readonly<Record<string,string>>={small:'tracer_small',auto:'tracer_auto',cannon:'shell_cannon',antiarmor:'missile_at',shell:'shell_artillery',antiair:'missile_aa',tactical:'tactical_missile'};
function projectileEffect(weapon:string,catalog:CatalogIndex):string|undefined {
 const name=weapon==='SATURATION'?'strategic_missile':weapon==='SKYBREAKER'?'bomb':weapon==='IR_ART'?'rocket_ir':weapon==='SY_ART'?'mortar':['STRIKE','US_STRIKE','IR_STRIKE'].includes(weapon)?'bomb':['GUN','US_GUN','IR_LOITER'].includes(weapon)?'tracer_auto':BODY_EFFECT[catalog.weapons.get(weapon)?.kind??''];
 return name?`fx.projectile.${name}`:undefined;
}
const POSITION_ORDERS=new Set(['move','attack_move','guard','aggressive','force_fire','build']);
const ENTITY_ORDERS=new Set(['attack','escort','repair','capture','board','build']);
const EVENT_CUES=new Set(['weapon_fired','impact','destroyed','missile_intercepted','interceptor_fired','decoy_triggered','under_attack','aircraft_return_soon','aircraft_returning','aircraft_endurance_lost','service_lost','aircraft_serviced','transfer_canceled','capture_interrupted','unload_exit_blocked','capture_exit_blocked','raid_exit_blocked','station_captured','building_captured','strategic_activated','shipment_arrived','tactical_ping']);

/** Build anew from one authorized perspective. No retained history, map/global
 * state, clock, random values, ownership transfer or simulation occurs here.
 * Rewind, pause, delayed observation and reconnect therefore use the same facts.
 * Essential geometry has no quality/reduced-motion option and must not be culled
 * by a cosmetic particle budget. Missing fields produce gaps, not guessed rules. */
export function tacticalPresentation(snapshot:PlayerSnapshot,catalog:CatalogIndex,selection:readonly number[]=[]):TacticalPresentation {
 const result:TacticalPresentation={tick:snapshot.tick,warnings:[],zones:[],projectiles:[],minimapIndicators:[],defeatCountdowns:[],selected:[],actors:[],eventCues:[],gaps:[]};
 const players=new Map(snapshot.players.map(p=>[p.id,p])),entities=new Map(snapshot.entities.map(e=>[e.id,e]));
 const selected=new Set(selection),gapKeys=new Set<string>();
 const gap=(code:string,subject:string)=>{const key=`${code}:${subject}`;if(!gapKeys.has(key)){gapKeys.add(key);result.gaps.push({code,subject})}};
 const relation=(owner:number):TacticalRelation=>{
  if(owner===0)return 'neutral';if(owner===snapshot.player)return 'own';
  const us=players.get(snapshot.player),them=players.get(owner);
  return !us||!them?'unknown':us.team===them.team?'allied':'hostile';
 };
 for(const projectile of snapshot.projectiles){
  const position=point(projectile.position),impact=point(projectile.impact);
  // Optional presence distinguishes a legacy snapshot from explicit false.
  // Only older feeds use the conservative impact-substitution equality fallback.
  const disclosure=projectile as typeof projectile&{splash?:number;positionVisible?:boolean};
  const disclosed=disclosure.positionVisible===undefined?(!projectile.warning||!!position&&!!impact&&!equal(position,impact)):disclosure.positionVisible===true;
  const body=position&&disclosed?position:undefined;
  result.projectiles.push({id:projectile.id,owner:projectile.owner,weapon:projectile.weapon,interceptable:projectile.interceptable,bodyPosition:body,bodyEffect:body?projectileEffect(projectile.weapon,catalog):undefined});
  if(projectile.warning&&disclosure.positionVisible===undefined&&!body)gap('projectile-position-visibility-not-disclosed',String(projectile.id));
  if(!projectile.warning||!impact)continue;
  const area=blastArea(catalog.weapons.get(projectile.weapon),disclosure.splash);
  if(area.kind==='point'&&area.reason==='radius-not-disclosed')gap('projectile-splash-not-disclosed',projectile.weapon);
  result.warnings.push({key:`projectile:${projectile.id}`,kind:projectile.weapon==='SATURATION'?'saturation':projectile.weapon==='SKYBREAKER'?'skybreaker':catalog.weapons.get(projectile.weapon)?.kind==='tactical'?'tactical':'projectile',owner:projectile.owner,relation:relation(projectile.owner),position:impact,area,deadline:tacticalDeadline(snapshot.tick,projectile.impactAt),deadlineKind:'impact',exits:[],weapon:projectile.weapon});
 }
 const warningKeys=new Map<string,number>();
 for(const warning of snapshot.warnings){
  const position=point(warning.position);if(!position)continue;
  // Defense in depth: this operation is owner-private even in a malformed feed.
  if(warning.kind==='second_volley'&&warning.owner!==snapshot.player)continue;
  const base=`operation:${warning.kind}:${warning.owner}:${warning.source}:${position.x}:${position.y}`,occurrence=warningKeys.get(base)??0;warningKeys.set(base,occurrence+1);
  const candidate=entities.get(warning.source),source=candidate?.owner===warning.owner?candidate:undefined,sourceWeapon=source&&(catalog.units.get(source.type)?.weapon??catalog.buildings.get(source.type)?.weapon);
  const splash=(warning as typeof warning&{splash?:number}).splash;
  const area:TacticalArea=warning.kind==='second_volley'?blastArea(sourceWeapon?catalog.weapons.get(sourceWeapon):undefined,splash):warning.kind==='skybreaker'?blastArea(undefined,splash):{kind:'point',reason:'destination'};
  if(warning.kind==='skybreaker'){gap('skybreaker-route-not-disclosed','skybreaker');if(area.kind==='point'&&area.reason==='radius-not-disclosed')gap('operation-splash-not-disclosed','skybreaker')}
  if(warning.kind==='second_volley'&&area.kind==='point'&&area.reason==='radius-not-disclosed')gap('operation-splash-not-disclosed','second_volley');
  if(warning.kind==='transfer')gap('transfer-exits-intentionally-private','transfer');
  result.warnings.push({key:`${base}:${occurrence}`,kind:warning.kind,owner:warning.owner,relation:relation(warning.owner),position,area,deadline:tacticalDeadline(snapshot.tick,warning.at),deadlineKind:warning.kind==='second_volley'?'launch':warning.kind==='skybreaker'?'impact':warning.kind==='transfer'?'arrival':warning.kind==='raid'?'deployment':'unknown',exits:warning.kind==='raid'?warning.exits.flatMap(p=>{const value=point(p);return value?[value]:[]}):[],source:['raid','second_volley'].includes(warning.kind)?source?.id:undefined});
 }
 for(const zone of snapshot.zones){
  const position=point(zone.position),radius=nonnegative(zone.radius);if(!position||radius===undefined||zone.until<=snapshot.tick)continue;
  const phase=snapshot.tick<zone.start?'preparing':'active';
  result.zones.push({key:`zone:${zone.kind}:${zone.owner}:${position.x}:${position.y}:${zone.start}`,kind:zone.kind,owner:zone.owner,relation:relation(zone.owner),position,area:{kind:'circle',radius,source:'snapshot-zone'},phase,start:zone.start,until:zone.until,deadline:tacticalDeadline(snapshot.tick,phase==='preparing'?zone.start:zone.until)});
 }
 for(const indicator of snapshot.indicators){const position=point(indicator.position);if(position)result.minimapIndicators.push({owner:indicator.owner,relation:relation(indicator.owner),position})}
 for(const player of snapshot.players)if(!player.defeated&&player.defeatAt>0)result.defeatCountdowns.push({player:player.id,deadline:tacticalDeadline(snapshot.tick,player.defeatAt)});
 for(const entity of snapshot.entities){
  const position=point(entity.position);if(!position)continue;
  const own=entity.owner===snapshot.player?entity.private:undefined;
  if(own?.container)continue;
  const unit=catalog.units.get(entity.type),building=catalog.buildings.get(entity.type),weapon=catalog.weapons.get(unit?.weapon??building?.weapon??'');
  const status:TacticalActorStatus={entity:entity.id,position,owner:entity.owner,relation:relation(entity.owner),state:entity.state,enabled:entity.enabled,complete:entity.complete,deployed:entity.deployed,concealed:entity.concealed,health:entity.health,rank:entity.rank,progress:entity.progress,channel:entity.channelUntil>snapshot.tick?tacticalDeadline(snapshot.tick,entity.channelUntil):undefined};
  if(own){
   status.own={ambushReady:own.ambushReady};
   if(building&&snapshot.economy)status.own.lowPower=snapshot.economy.powerDemand>snapshot.economy.powerCapacity;
   const ammo=nonnegative(weapon?.ammo);if(ammo&&unit?.armor==='air'){status.own.ammo=own.ammo;status.own.ammoCapacity=ammo}
   if(building?.role==='abm'||unit?.role==='launcher'||entity.type==='SA.mobile_abm')status.own.charges=own.charges;
   if(unit?.armor==='air'&&unit.role!=='support_plane'){
    status.own.enduranceTicks=own.endurance;status.own.returnOrdered=own.orders.some(o=>o.kind==='return');status.own.home=own.home;status.own.repeatSortie=own.repeatSortie;
    const home=entities.get(own.home);if(home?.owner===entity.owner)status.own.homePosition=point(home.position);
   }
  }
  result.actors.push(status);
  if(!selected.has(entity.id))continue;
  const descriptor:TacticalSelection={entity:entity.id,position:{...position},orders:[]};result.selected.push(descriptor);
  if(unit){descriptor.catalogSight=nonnegative(unit.sight);descriptor.catalogDetection=nonnegative(unit.detection)}
  descriptor.ranges=ownerRanges(entity,snapshot);
  if(!descriptor.ranges)gap('effective-sight-detection-not-disclosed',String(entity.id));
  if((building?.role==='abm'||entity.type==='SA.mobile_abm')&&!descriptor.ranges?.interception)gap('abm-coverage-not-in-catalog',String(entity.id));
  if(entity.complete&&entity.health>0){
   const minimum=nonnegative(weapon?.min_range),maximum=nonnegative(weapon?.max_range);
   const width=entity.footprintWidth||building?.width||0,height=entity.footprintHeight||building?.height||0;
   if(weapon&&minimum!==undefined&&maximum!==undefined&&maximum>=minimum&&(building||unit))descriptor.weaponRange={weapon:weapon.id,minimum,maximum,metric:'edge-distance',origin:building?{kind:'rectangle',width:width*1000,height:height*1000}:{kind:'circle',radius:unit!.radius},advisory:true};
  }
  if(!own)continue;
  // Rally (0,0) is the Go unset sentinel. It must not draw a false origin line.
  if(building&&own.rally&&(own.rally.x!==0||own.rally.y!==0))descriptor.rally=point(own.rally);
  for(const [index,order] of own.orders.entries()){
   const marker:TacticalOrderMarker={index,kind:order.kind,unresolvedTarget:false};
   if(order.kind==='patrol'){
    marker.patrol={points:order.points.flatMap(p=>{const value=point(p);return value?[value]:[]}),next:order.index};
    marker.position=point(order.points[order.index]);
   }else if(order.kind==='return'){
    // Return is a facility intent. Exact reserved landing slot/path is private Go state.
    const target=entities.get(order.target||own.home);marker.target=order.target||own.home||undefined;
    if(target?.owner===entity.owner)marker.position=point(target.position);else marker.unresolvedTarget=true;
   }else if((ENTITY_ORDERS.has(order.kind)||['guard','aggressive'].includes(order.kind))&&order.target!==0){
    marker.target=order.target;marker.position=point(entities.get(order.target)?.position);
    if(!marker.position&&order.kind==='capture')marker.position=point(snapshot.stations.find(s=>s.id===order.target)?.position);
    marker.unresolvedTarget=!marker.position;
   }else if(order.kind==='gather'){
    marker.target=order.target;marker.position=point(snapshot.fields.find(f=>f.id===order.target)?.position);marker.unresolvedTarget=!marker.position;
   }else if(order.kind==='salvage'){
    marker.target=order.target;marker.position=point(snapshot.salvage.find(s=>s.id===order.target)?.position);marker.unresolvedTarget=!marker.position;
   }else if(POSITION_ORDERS.has(order.kind)||order.kind==='unload'&&order.position&&(order.position.x!==0||order.position.y!==0))marker.position=point(order.position);
   if(order.kind==='force_fire')marker.area=blastArea(weapon);
   // Unknown orders stay nonspatial. Do not interpret a default zero Vec as intent.
   descriptor.orders.push(marker);
  }
 }
 for(const event of snapshot.events){
  if(!EVENT_CUES.has(event.kind)||event.tick>snapshot.tick)continue;
  // Trust Go's visibility filtering; never try to recover a zeroed entity ID.
  // Explicit owner/team scopes additionally reject a malformed foreign packet.
  if(event.scope==='owner'&&event.owner!==snapshot.player)continue;
  if(event.scope==='team'&&!['own','allied'].includes(relation(event.owner)))continue;
  result.eventCues.push({id:event.id,tick:event.tick,kind:event.kind,owner:event.owner,entity:event.entity||undefined,position:point(event.position),impactOutcome:event.kind==='impact'?'unspecified':undefined});
 }
 return result;
}
