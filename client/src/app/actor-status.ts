import type {Entity,PlayerSnapshot} from '../runtime/types';
import type {CatalogIndex} from '../content/catalog';

export type StatusTone='neutral'|'benefit'|'warning'|'critical';
export interface ActorBadge {id:string;symbol:string;label:string;tone:StatusTone;priority:number;seconds?:number}
export interface ActorStatusModel {
 badges:ActorBadge[];
 ammunition?:{label:string;current:number;capacity?:number};
 channel?:{label:string;progress:number;seconds:number};
}

const EFFECTS:Readonly<Record<string,{symbol:string;label:string;tone:StatusTone;priority:number}>>={
 designated:{symbol:'◎',label:'Designated',tone:'critical',priority:230},
 disabled:{symbol:'×',label:'Disabled',tone:'critical',priority:240},
 sabotage_resistance:{symbol:'R',label:'Sabotage resistant',tone:'benefit',priority:100},
 decoy:{symbol:'D',label:'Decoy active',tone:'benefit',priority:140},
 disperse:{symbol:'↔',label:'Dispersed',tone:'benefit',priority:110},
 emergency_power:{symbol:'ϟ',label:'Emergency power',tone:'benefit',priority:140},
 rapid_sortie:{symbol:'»',label:'Rapid sortie',tone:'benefit',priority:110},
 recall:{symbol:'↩',label:'Drone recall',tone:'benefit',priority:150},
 recovery:{symbol:'+',label:'Recovery order',tone:'benefit',priority:110},
 relay:{symbol:'⌁',label:'Relay boost',tone:'benefit',priority:110},
 shieldline:{symbol:'◇',label:'Shieldline',tone:'benefit',priority:130},
 hull_down:{symbol:'▱',label:'Hull down',tone:'benefit',priority:120},
 temporary:{symbol:'T',label:'Withdrawal',tone:'warning',priority:150},
 launch_reveal:{symbol:'!',label:'Launch reveal',tone:'warning',priority:190},
};
const CHANNELS:Readonly<Record<string,string>>={capture:'Capturing',sabotage:'Sabotaging',designate:'Designating',beacon:'Placing beacon',board:'Boarding',unload:'Unloading',salvage:'Salvaging',sell:'Selling',selling:'Selling',transit:'Transferring'};
const uint=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=0xffffffff;
const seconds=(tick:number,until:number)=>Math.ceil(Math.max(0,until-tick)/20);

/** Builds only labels/pips from the latest authorized entity. No cooldown-to-buff
 * inference, wall-clock timers, hidden health, magazine or enemy economy lookup.
 * Optional extension reads support older runtime0.3.3 until the wire is promoted. */
export function actorStatus(entity:Entity,snapshot:PlayerSnapshot,catalog:CatalogIndex):ActorStatusModel {
 const out:ActorStatusModel={badges:[]};
 if(entity.state==='destroyed'||entity.health<=0||entity.private?.container&&entity.owner===snapshot.player)return out;
 const own=entity.owner===snapshot.player,unit=catalog.units.get(entity.type),building=catalog.buildings.get(entity.type);
 const privateState=own?entity.private:undefined;
 const add=(id:string,symbol:string,label:string,tone:StatusTone,priority:number,until?:number)=>{
  if(out.badges.some(b=>b.id===id))return;
  out.badges.push({id,symbol,label,tone,priority,...until!==undefined&&until>0?{seconds:seconds(snapshot.tick,until)}:{}});
 };
 const extension=entity as Entity&{effects?:Array<{kind?:unknown;until?:unknown}>};
 if(Array.isArray(extension.effects))for(const effect of extension.effects.slice(0,32)){
  if(typeof effect?.kind!=='string'||!uint(effect.until)||effect.until>0&&effect.until<=snapshot.tick)continue;
  const known=EFFECTS[effect.kind];if(known)add(effect.kind,known.symbol,known.label,known.tone,known.priority,effect.until);
 }
 if(!entity.enabled)add('disabled','×','Disabled','critical',240);
 if(entity.concealed)add('concealed','◐','Concealed','neutral',90);
 if(privateState?.ambushReady)add('ambush','◆','Ambush ready','benefit',130);
 if(entity.type==='SA.tank'&&entity.deployed)add('hull_down','▱','Hull down','benefit',120);
 if(own&&building&&snapshot.economy&&snapshot.economy.powerDemand>snapshot.economy.powerCapacity)add('low_power','ϟ','Low power','warning',180);
 if(entity.state==='landing_blocked')add('landing_blocked','!','Landing area blocked','critical',270);
 if(entity.state==='exit_blocked')add('exit_blocked','!','Production exit blocked','warning',250);
 if(entity.state==='capture_exit_blocked')add('capture_exit_blocked','!','Capture exits blocked','warning',250);
 if(entity.state==='unload_exit_blocked')add('unload_exit_blocked','!','Unload exits blocked','warning',250);
 if(entity.state==='repairing')add('repairing','+','Repairing','benefit',90);
 if(entity.state==='healing')add('healing','+','Healing','benefit',90);
 if(privateState&&unit?.armor==='air'){
  const emergency=(privateState as typeof privateState&{emergencyTakeoffUntil?:unknown}).emergencyTakeoffUntil;
  if(uint(emergency)&&emergency>snapshot.tick)add('emergency_takeoff','↑','Emergency takeoff','critical',300,emergency);
  else if(entity.state==='emergency_takeoff')add('emergency_takeoff','↑','Emergency takeoff','critical',300);
  if(!entity.landed&&privateState.home===0)add('no_home','!','No service base','critical',280);
  if(!entity.landed&&privateState.orders.some(order=>order.kind==='return'))add('return','↩','Returning to base','warning',170);
  if(entity.landed&&entity.state==='servicing')add('servicing','↻','Aircraft servicing','neutral',160);
 }
 const weapon=catalog.weapons.get(unit?.weapon??building?.weapon??'');
 if(privateState){
  const capacity=weapon?.ammo;
  if(typeof capacity==='number'&&Number.isInteger(capacity)&&capacity>0&&capacity<=64){
   const current=weapon?.kind==='tactical'?privateState.charges:privateState.ammo;
   if(uint(current))out.ammunition={label:weapon?.kind==='tactical'?'Charges':'Ammo',current,capacity};
  }else if(building?.role==='abm'||entity.type==='SA.mobile_abm'){
   if(uint(privateState.charges))out.ammunition={label:'Interceptors',current:privateState.charges};
  }
 }
 const channel=CHANNELS[entity.state];
 if(channel&&uint(entity.channelUntil)&&entity.channelUntil>snapshot.tick)out.channel={label:channel,progress:Math.max(0,Math.min(1000,entity.progress)),seconds:seconds(snapshot.tick,entity.channelUntil)};
 out.badges.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
 return out;
}
