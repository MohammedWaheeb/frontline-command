import type {Event} from '../protocol/frontline_pb';
import {EVENT_ALERTS,formatClock,type AlertStyle} from '../content/labels';

export interface BattleAlert {event:Event;style:AlertStyle;timestamp:string}
const priority:Record<AlertStyle['priority'],number>={critical:2,warning:1,info:0,success:0};
/** The operation clock and event id provide recency without adding an alert lifetime. */
function newer(left:Event,right:Event){return left.tick-right.tick||left.id-right.id}

/** One classification for visual alerts and Space. The bounded visual list favors
 * severity; Space retains the latest actionable location, irrespective of severity. */
export function selectBattleAlerts(events:readonly Event[]):{visible:BattleAlert[];latestActionable?:BattleAlert}{
 const alerts:BattleAlert[]=[];let latestActionable:BattleAlert|undefined;
 for(const event of events){
  const style=EVENT_ALERTS[event.kind]?.(event.value,event.text);if(!style)continue;
  const alert={event,style,timestamp:formatClock(event.tick)};alerts.push(alert);
  if(style.actionable&&event.position&&(!latestActionable||newer(event,latestActionable.event)>=0))latestActionable=alert;
 }
 return {visible:alerts.sort((left,right)=>priority[right.style.priority]-priority[left.style.priority]||newer(right.event,left.event)).slice(0,3),latestActionable};
}

import type {PlayerSnapshot,CommandAffordances} from '../runtime/types';
import type {CatalogIndex} from '../content/catalog';
import {economyStatus} from './economy-status';

type Position={x:number;y:number};
export interface BattleStatusAlert {
 id:string;kind:'idle_hauler'|'idle_production'|'low_power'|'base_under_attack'|'unit_lost';
 tick:number;entity?:number;position?:Position;text:string;priority:'warning'|'info';
}
export interface BattleAlertState {
 player:number;tick:number;lastEventID:number;lastEmitted:Record<string,number>;idleSince:Record<string,number>;
 latestActionable?:BattleStatusAlert;ownedEntities:Record<number,{name:string;building:boolean;position?:Position}>;
}
export interface BattleAlertSelection {alerts:BattleStatusAlert[];state:BattleAlertState;latestActionable?:BattleStatusAlert}

/** Pure transition. Callers reset on session/load/seek, including forward seeks.
 * `alerts` contains new emissions; latestActionable lives for ten simulation seconds.
 * Status reminders repeat every 30s, attacks every 10s and losses every 2s.
 * Idle production needs 15s of continuously affordable, fresh Go advice (<=4s).
 */
export function selectBattleStatusAlerts(snapshot:PlayerSnapshot,catalog:CatalogIndex,previous?:BattleAlertState,advice?:CommandAffordances):BattleAlertSelection {
 const tick=snapshot.tick;
 const prior=previous?.player===snapshot.player&&previous.tick<=tick?previous:undefined;
 const state:BattleAlertState={player:snapshot.player,tick,lastEventID:prior?.lastEventID??0,lastEmitted:{...prior?.lastEmitted},idleSince:{},ownedEntities:{},...(prior?.latestActionable&&tick-prior.latestActionable.tick<=200?{latestActionable:structuredClone(prior.latestActionable)}:{})};
 const alerts:BattleStatusAlert[]=[];
 const owned=snapshot.entities.filter(entity=>entity.owner===snapshot.player&&entity.private&&entity.private.hp>0n&&!entity.private.container).sort((a,b)=>a.id-b.id);
 for(const entity of owned)state.ownedEntities[entity.id]={name:catalog.name(entity.type),building:catalog.buildings.has(entity.type),...entity.position?{position:{x:entity.position.x,y:entity.position.y}}:{}};
 const emit=(key:string,alert:Omit<BattleStatusAlert,'id'>,cooldown:number,refreshLocation=false)=>{
  const next={...alert,text:alert.text.length>48?`${alert.text.slice(0,47)}…`:alert.text,id:`${key}:${alert.tick}`};
  // A throttled combat message still updates Space to the latest disclosed hit.
  if(refreshLocation&&next.position&&(!state.latestActionable||next.tick>=state.latestActionable.tick))state.latestActionable=next;
  const last=state.lastEmitted[key];if(last!==undefined&&tick-last<cooldown)return;
  state.lastEmitted[key]=tick;alerts.push(next);
  if(next.position&&(!state.latestActionable||next.tick>=state.latestActionable.tick))state.latestActionable=next;
 };
 const economy=economyStatus(snapshot,catalog);
 if(!snapshot.outcome?.finished&&!snapshot.players.find(player=>player.id===snapshot.player)?.defeated){
  for(const hauler of economy.haulers)if(hauler.state==='blocked'||hauler.state==='idle_no_known_field'){
   const key=`idle_hauler:${hauler.id}`;state.idleSince[key]=prior?.idleSince[key]??tick;
   emit(key,{kind:'idle_hauler',tick,entity:hauler.id,position:hauler.position,text:hauler.state==='idle_no_known_field'?'Hauler idle · scout for supplies':'Hauler idle · check route and supply center',priority:'warning'},600);
  }
  if(economy.power.state==='low'){
   state.idleSince.low_power=prior?.idleSince.low_power??tick;
   const building=owned.find(entity=>catalog.buildings.has(entity.type)&&entity.enabled);
   emit('low_power',{kind:'low_power',tick,position:building?.position?{x:building.position.x,y:building.position.y}:undefined,text:'Low power · build power or disable buildings',priority:'warning'},600);
  }
  if(advice?.player===snapshot.player&&advice.tick<=tick&&tick-advice.tick<=80&&snapshot.economy){
   for(const entity of owned){
    if(!entity.complete||!entity.enabled||!catalog.buildings.has(entity.type)||entity.private!.jobs.length)continue;
    const capability=advice.entities.find(value=>value.id===entity.id);
    const affordable=capability?.production_status?.some(status=>{
     if(status.kind==='build'||status.code!=='ok'||status.waits_for)return false;
     const types=status.kind==='train'?capability.trains:capability.research;
     const cost=catalog.cost(status.type);
     return types.includes(status.type)&&cost!==undefined&&Number.isSafeInteger(cost)&&cost>=0&&snapshot.economy!.credits>=BigInt(cost);
    });
    if(!affordable)continue;
    const key=`idle_production:${entity.id}`,since=prior?.idleSince[key]??tick;state.idleSince[key]=since;
    if(tick-since>=300)emit(key,{kind:'idle_production',tick,entity:entity.id,position:entity.position?{x:entity.position.x,y:entity.position.y}:undefined,text:`${catalog.name(entity.type)} idle · production available`,priority:'info'},600);
   }
  }
 }
 // Event IDs are monotonic within a session. Never infer a death from disappearance.
 for(const event of [...snapshot.events].sort((a,b)=>a.tick-b.tick||a.id-b.id)){
  if(event.tick>tick)continue;
  state.lastEventID=Math.max(state.lastEventID,event.id);
  if(event.id<=(prior?.lastEventID??0)||event.owner!==snapshot.player||tick-event.tick>200)continue;
  const entity=state.ownedEntities[event.entity]??prior?.ownedEntities[event.entity];
  const position=event.position?{x:event.position.x,y:event.position.y}:entity?.position;
  if(event.kind==='under_attack'&&entity?.building)emit('base_under_attack',{kind:'base_under_attack',tick:event.tick,entity:event.entity,position,text:'Base under attack',priority:'warning'},200,true);
  if(event.kind==='destroyed'&&entity&&!entity.building)emit('unit_lost',{kind:'unit_lost',tick:event.tick,entity:event.entity,position,text:`${entity.name} lost`,priority:'warning'},40,true);
 }
 // Bound memory to currently relevant entities and the two event categories.
 for(const key of Object.keys(state.lastEmitted))if(!(key in state.idleSince)&&key!=='base_under_attack'&&key!=='unit_lost')delete state.lastEmitted[key];
 return {alerts,state,...state.latestActionable?{latestActionable:state.latestActionable}:{}};
}

/** Public roster presence only; reconnect countdowns remain team-private on the host. */
export function networkPresenceChanges(previous:import('../runtime/types').MatchStatus|undefined,current:import('../runtime/types').MatchStatus,slots:readonly {player:number;name:string}[],self?:number){
 return current.teammates.flatMap(peer=>{
  if(peer.player===self)return [];
  const prior=previous?.teammates.find(value=>value.player===peer.player);
  if(prior?.connected===peer.connected||!prior&&peer.connected||current.waitingForPlayers)return [];
  const name=slots.find(slot=>slot.player===peer.player)?.name??String(peer.player);
  return [`${/^commander\b/i.test(name)?name:`Commander ${name}`} ${peer.connected?'reconnected':'disconnected'}.`];
 });
}
