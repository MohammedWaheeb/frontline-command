import {ambienceFor,battlefieldSounds,oneShotMix,type AudioViewport} from './battlefield-sound';
import type {GameMap} from '../runtime/types';
import type {Entity,Event,PlayerSnapshot,MatchStatus} from '../protocol/frontline_pb';
import type {CatalogIndex} from '../content/catalog';
import {classify} from '../content/catalog';
import {AudioMixer} from './mixer';
import {combatSound} from './combat-sound';
import {soldDestruction} from '../app/combat-feedback';
const title=(text:string)=>text.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const OWN_EVENTS=new Set(['construction_complete','unit_ready','research_complete','aircraft_returning','capture_interrupted','building_captured','transfer_canceled']);
/** Owns presentation history only. Its only world input is the authorized snapshot. */
export class AudioDirector {
 private viewport?:()=>AudioViewport;private ambience='';private paused=false;private suspended=false;private loopTimer?:ReturnType<typeof setInterval>;private battlefieldToken=0;private advancedAt=0;private enduranceLost=new Map<number,number>();
 private previous?:PlayerSnapshot;private lastEvent=0;private scene='';private faction='US';private combatUntil=0;private tensionUntil=0;private scope='';private connectionPhase='';private teammates=new Map<number,boolean>();
 /** Music-transition dynamics (tuning mirrored in assets/audio/music_projects/scores.json `dynamics.transitions`). */
 private combatHits:number[]=[];private musicLayer=-1;private lastStinger=0;private lastStingerById=new Map<string,number>();
 attachBattlefield(map:GameMap,viewport:()=>AudioViewport){const token=++this.battlefieldToken;this.viewport=viewport;this.ambience=ambienceFor(map);if(this.loopTimer)clearInterval(this.loopTimer);this.loopTimer=setInterval(()=>this.refreshContinuous(),150);this.refreshContinuous();return()=>{if(token!==this.battlefieldToken)return;this.viewport=undefined;if(this.loopTimer)clearInterval(this.loopTimer);this.loopTimer=undefined;this.mixer.continuous([])}}
 setPaused(paused:boolean){this.paused=paused;this.refreshContinuous()}
 private refreshContinuous(){const catalog=this.catalog();if(!this.previous||!catalog||!this.viewport||this.suspended||performance.now()-this.advancedAt>1000){this.mixer.continuous([]);return}this.mixer.continuous(battlefieldSounds(this.previous,catalog,this.viewport(),this.ambience,this.paused))}
 dispose(){if(this.loopTimer)clearInterval(this.loopTimer);this.viewport=undefined;this.mixer.continuous([])}
 constructor(readonly mixer:AudioMixer,private catalog:()=>CatalogIndex|undefined){}
 operation(scope:string){if(scope===this.scope)return;this.scope=scope;this.connectionPhase='';this.suspended=false;this.enduranceLost.clear();this.teammates.clear();this.previous=undefined;this.lastEvent=0;this.combatUntil=0;this.tensionUntil=0;this.combatHits=[];this.musicLayer=-1;this.lastStinger=0;this.lastStingerById.clear();this.scene='';this.mixer.reset();this.mixer.music([])}
 discontinuity(){this.enduranceLost.clear();this.teammates.clear();this.previous=undefined;this.lastEvent=0;this.combatUntil=0;this.tensionUntil=0;this.combatHits=[];this.musicLayer=-1;this.lastStinger=0;this.lastStingerById.clear();this.mixer.reset();this.mixer.music([]);this.scene=''}
 page(page:string,briefing?:string){if(this.scope)return;const scene=briefing?`briefing:${briefing}`:page==='editor'?'editor':page==='network'?'lobby':'menu';if(this.scene===scene)return;this.scene=scene;this.musicLayer=-1;this.mixer.reset();this.mixer.music([`music.${briefing?'briefing_bed':page==='editor'?'editor_ambient':page==='network'?'lobby_loop':'menu_theme'}`])}
 briefing(id:string,faction?:string){this.mixer.stopTransient();this.mixer.clearCaptions();this.mixer.play(`vo.briefing.${id}${faction?`.${faction}`:''}`)}
 connection(phase:string){if(phase===this.connectionPhase)return;this.connectionPhase=phase;if(phase==='reconnecting'){this.suspended=true;this.discontinuity();this.announce('reconnecting',undefined,100)}else if(phase==='connected'){this.suspended=false;this.discontinuity()}}
 status(status:MatchStatus){for(const teammate of status.teammates){if(this.teammates.get(teammate.player)===true&&!teammate.connected)this.announce('teammate_disconnected',undefined,100);this.teammates.set(teammate.player,teammate.connected)}}
 selection(entities:readonly Entity[],player:number){const entity=entities.find(entity=>entity.owner===player&&this.catalog()?.units.has(entity.type));if(entity)this.unit(entity,'select')}
 receipt(kind:string,accepted:boolean,entity?:Pick<Entity,'type'|'owner'>,code?:string){
  if(!accepted){this.mixer.play('sfx.ui_error',{cooldown:300});if(code==='insufficient_credits')this.announce('insufficient_funds');else if(entity)this.unit(entity,'unavailable');return}
  // Go's accepted return order withdraws an aircraft to service (or rebases it).
  // It uses the existing retreat response without inventing a ground order.
  const event=['move','attack_move','patrol','guard','escort','board','unload','capture','rally','gather','salvage','harvest','return_aircraft'].includes(kind)?'move':['attack','force_fire'].includes(kind)?'attack':['stop','hold'].includes(kind)?'stop':kind==='repair'?'repair':['return','retreat'].includes(kind)?'retreat':undefined;
  if(event&&entity)this.unit(entity,event);else this.mixer.play(['train','research','build'].includes(kind)?'sfx.ui_queue_add':'sfx.ui_confirm',{cooldown:200});
 }
 private unit(entity:Pick<Entity,'type'|'owner'>,event:string,key?:string){const unit=this.catalog()?.units.get(entity.type);if(!unit)return;const unitClass=classify(unit),family=unitClass==='infantry'?'infantry':['aircraft','rotor','drone'].includes(unitClass)?(['IR','SY'].includes(unit.faction)?'drone_operator':'pilot'):'vehicle_crew';this.mixer.play(`vo.unit.${unit.faction}.${family}.${event}`,{key:key??`unit:${event}`,cooldown:event==='under_fire'?6000:event==='select'?2500:800,caption:`${unit.name}: ${title(event)}.`,priority:10})}
 /** Distance attenuation and pan for a one-shot from its entity's screen rect. */
 private mixFor(entity:Entity|undefined):{gain:number;pan:number}{
  try{
   const view=this.viewport?.();if(!view)return {gain:1,pan:0};
   return oneShotMix(view.viewport,entity?view.bounds(entity):undefined);
  }catch{return {gain:1,pan:0}}
 }
 /** Resolve a combat cue ID against the loaded index. Clips still pending from
  * the SFX lane (e.g. sfx.weapon.IR_SHAHED) fall back instead of going silent:
  * terminal impacts use explosion_small, weapon fire stays silent per the
  * strategic-round precedent. Unknown index state plays the ID as-is; the
  * mixer tolerates absence. */
 private resolveCombatSound(kind:string,sound:string|undefined):string|undefined{
  if(!sound)return;
  const entries=this.mixer.manifest?.entries;if(!entries||entries[sound])return sound;
  if(kind==='impact')return entries['sfx.explosion_small']?'sfx.explosion_small':sound;
  return undefined;
 }
 /** Destruction cascade routing. SFX-lane cascade IDs win when the loaded index
  * has them, otherwise buildings fall back to explosion_building; large kills
  * (heavy armor, airframes, tanks, artillery, launchers) use explosion_large. */
 private destructionSound(entity:Entity|undefined,catalog:CatalogIndex|undefined,building:boolean):string{
  const entries=this.mixer.manifest?.entries;
  if(building){
   if(entries)for(const id of ['sfx.explosion_cascade','sfx.building_collapse','sfx.destruction_cascade'])if(entries[id])return id;
   return 'sfx.explosion_building';
  }
  const unit=entity?catalog?.units.get(entity.type):undefined;
  const large=!!unit&&(unit.armor==='heavy'||unit.armor==='air'||unit.role==='tank'||unit.role==='artillery'||unit.role==='launcher');
  if(large&&(!entries||entries['sfx.explosion_large']))return 'sfx.explosion_large';
  return 'sfx.explosion_small';
 }
 private announce(event:string,position?:{x:number;y:number},priority=50,caption?:string){const location=position?`${Math.floor(position.x/10000)},${Math.floor(position.y/10000)}`:'global';this.mixer.play(`vo.announcer.${this.faction}.${event}`,{key:`alert:${event}:${location}`,cooldown:6000,priority,caption:caption??title(event)})}
 snapshot(snapshot:PlayerSnapshot){
  const previous=this.previous;this.faction=snapshot.players.find(player=>player.id===snapshot.player)?.faction??'US';
  const boundary=!previous||snapshot.player!==previous.player||snapshot.tick<previous.tick||snapshot.tick-previous.tick>100;
  if(boundary&&previous)this.discontinuity();
  if(!previous||snapshot.tick!==previous.tick||snapshot.player!==previous.player)this.advancedAt=performance.now();this.previous=snapshot;this.refreshContinuous();
  if(boundary){this.lastEvent=Math.max(0,...snapshot.events.filter(event=>event.tick<=snapshot.tick).map(event=>event.id));this.battleMusic(snapshot);return}
  const seen=new Set<number>(),events=snapshot.events.filter(event=>{if(event.id<=this.lastEvent||event.tick<previous.tick-2||event.tick>snapshot.tick||seen.has(event.id))return false;seen.add(event.id);return true});this.lastEvent=Math.max(this.lastEvent,...snapshot.events.filter(event=>event.tick<=snapshot.tick).map(event=>event.id));
  for(const event of events)if(event.kind==='aircraft_endurance_lost'&&event.owner===snapshot.player)this.enduranceLost.set(event.entity,event.tick);
  for(const [id,tick]of this.enduranceLost)if(snapshot.tick-tick>100)this.enduranceLost.delete(id);
  const ownPlayer=snapshot.players.find(player=>player.id===snapshot.player);
  for(const player of snapshot.players){const old=previous.players.find(value=>value.id===player.id);if(old&&player.id!==snapshot.player&&player.team!==ownPlayer?.team&&!player.defeated&&old.strategicProgress<1000&&player.strategicProgress>=1000)this.announce('enemy_strategic_ready',undefined,100)}
  // All entities and events here were delivered to this perspective; lost-vision removal is not death.
  for(const event of events)this.event(event,snapshot,previous);
  if(snapshot.economy&&previous.economy){const low=snapshot.economy.powerDemand>snapshot.economy.powerCapacity,wasLow=previous.economy.powerDemand>previous.economy.powerCapacity;if(low&&!wasLow){this.announce('low_power');this.mixer.play('sfx.power_down')}else if(!low&&wasLow)this.mixer.play('sfx.power_up')}
  if(!previous.indicators.length&&snapshot.indicators.length)this.announce('endgame_reveal');
  for(const entity of snapshot.entities){if(entity.owner!==snapshot.player||!entity.private)continue;const old=previous.entities.find(value=>value.id===entity.id)?.private;if(!old)continue;const role=this.catalog()?.units.get(entity.type)?.role??this.catalog()?.buildings.get(entity.type)?.role;
   if((role==='abm'||entity.type==='SA.mobile_abm')&&old.charges>0&&entity.private.charges===0)this.announce('interceptor_depleted',entity.position,100);
   if(role==='strategic'&&old.charges===0&&entity.private.charges>0)this.announce('our_strategic_ready',entity.position,50);
   if(role==='strategic'&&old.chargeWork===0&&entity.private.chargeWork>0)this.announce('strategic_site_charging',entity.position,50);
   if(old.cooldowns.some(cooldown=>cooldown.until>previous.tick&&cooldown.until<=snapshot.tick))this.unit(entity,'ability_ready');
  }
  for(const field of snapshot.fields)if(field.remaining===0n&&previous.fields.some(old=>old.id===field.id&&old.remaining>0n))this.announce('field_depleted',field.position);
  if(snapshot.outcome?.finished&&!previous.outcome?.finished){const own=snapshot.players.find(player=>player.id===snapshot.player),victory=!snapshot.outcome.draw&&snapshot.outcome.winningTeam===own?.team;this.stinger(`music.stinger_${victory?'victory':'defeat'}`,true);this.announce(victory?'mission_accomplished':'mission_failed',undefined,100,snapshot.outcome.draw?'Operation ended in a draw.':undefined);if(snapshot.mission)this.mixer.afterSpeech(`vo.debrief.${snapshot.mission.id}`)}
  this.battleMusic(snapshot);
 }
 /** Combat entry needs confirmation so a single stray shot only raises tension:
  * two weapon/impact cues inside ENTRY_WINDOW_MS, or immediate own-unit damage. */
 private static readonly COMBAT_ENTRY_WINDOW_MS=3000;private static readonly COMBAT_ENTRY_HITS=2;
 private static readonly COMBAT_HOLD_MS=8000;private static readonly TENSION_HOLD_MS=15000;private static readonly COMBAT_EXIT_TENSION_MS=15000;
 private static readonly STINGER_GLOBAL_MS=5000;private static readonly STINGER_REPEAT_MS=15000;
 /** Record weapon/impact fire. Confirmed exchanges hold the combat layer; a lone
  * shot only sustains tension. Combat always sustains tension so the exit
  * decays combat -> tension -> calm instead of dropping straight to calm. */
 private noteCombatFire(immediate:boolean){const now=performance.now(),entry=AudioDirector,window=now-entry.COMBAT_ENTRY_WINDOW_MS;
  this.combatHits=this.combatHits.filter(hit=>hit>=window);this.combatHits.push(now);
  this.tensionUntil=Math.max(this.tensionUntil,now+entry.TENSION_HOLD_MS);
  if(immediate||this.combatHits.length>=entry.COMBAT_ENTRY_HITS)this.combatUntil=Math.max(this.combatUntil,now+entry.COMBAT_HOLD_MS)}
 /** Warnings sustain tension without touching the combat layer. */
 private noteTension(){this.tensionUntil=Math.max(this.tensionUntil,performance.now()+AudioDirector.TENSION_HOLD_MS)}
 /** Stinger anti-fatigue: terminal victory/defeat stingers always play; other
  * stingers yield to any recent stinger and never repeat the same ID in a row. */
 private stinger(id:string,terminal=false){const now=performance.now();
  if(!terminal&&(now-this.lastStinger<AudioDirector.STINGER_GLOBAL_MS||now-(this.lastStingerById.get(id)??-Infinity)<AudioDirector.STINGER_REPEAT_MS))return;
  this.lastStinger=now;this.lastStingerById.set(id,now);this.mixer.play(id,{cooldown:3000})}
 private battleMusic(snapshot:PlayerSnapshot){const finished=snapshot.outcome?.finished,key=finished?'debrief':`battle:${this.faction}`;
  if(this.scene!==key){this.scene=key;this.musicLayer=-1;if(finished){this.mixer.music(['music.debrief_bed']);return}this.mixer.music(['calm','tension','combat'].map(layer=>`music.battle_${this.faction}_${layer}`))}
  if(finished)return;const now=performance.now();
  if(now>=this.combatUntil&&this.musicLayer===2)this.tensionUntil=Math.max(this.tensionUntil,now+AudioDirector.COMBAT_EXIT_TENSION_MS);
  const layer=now<this.combatUntil?2:now<this.tensionUntil?1:0;if(layer===this.musicLayer)return;this.musicLayer=layer;
  this.mixer.music(['calm','tension','combat'].map(value=>`music.battle_${this.faction}_${value}`),[0,1,2].map(index=>index===layer?1:0))}
 private event(event:Event,snapshot:PlayerSnapshot,previous:PlayerSnapshot){
  if(soldDestruction(event,snapshot))return;
  const entity=snapshot.entities.find(entity=>entity.id===event.entity)??previous.entities.find(entity=>entity.id===event.entity),own=event.owner===snapshot.player,catalog=this.catalog();
  const combat=combatSound(event,snapshot,previous,catalog);
  if(combat){const sound=this.resolveCombatSound(combat.kind,combat.sound);if(sound)this.mixer.play(sound,{cooldown:combat.cooldown,...this.mixFor(entity)});if(combat.caption)this.mixer.caption(combat.caption,70);if(combat.kind==='weapon'||combat.kind==='impact')this.noteCombatFire(false);return}
  if(event.kind==='under_attack'&&own){this.noteCombatFire(true);if(entity&&catalog?.buildings.has(entity.type))this.announce('base_attacked',event.position,100);else if(entity&&catalog?.units.get(entity.type)?.role==='hauler')this.announce('hauler_attacked',event.position,100);else if(entity){const p=event.position;this.unit(entity,'under_fire',`attack:${p?`${Math.floor(p.x/10000)},${Math.floor(p.y/10000)}`:'unknown'}`)}return}
  if(event.kind==='destroyed'){const building=!!entity&&!!catalog?.buildings.has(entity.type);this.mixer.play(this.destructionSound(entity,catalog,building),{cooldown:100,...this.mixFor(entity)});if(own&&!this.enduranceLost.has(event.entity))this.announce(building?'building_lost':'unit_lost',event.position,50);return}
  if(OWN_EVENTS.has(event.kind)&&own){this.announce(event.kind==='transfer_canceled'?'safehouse_transfer_canceled':event.kind,event.position);if(event.kind==='construction_complete')this.mixer.play('sfx.construct_complete');return}
  if(['missile_warning','airstrike_warning','raid_warning'].includes(event.kind)){this.noteTension();if(event.kind==='missile_warning')this.announce('missile_warning',event.position,100);else this.mixer.caption(title(event.kind),100);this.mixer.play('sfx.missile_warning_tone',{cooldown:6000});return}
  if(event.kind==='defeat_countdown'&&own){this.announce('defeat_countdown',undefined,100);return}
  if(event.kind==='objective_complete'){this.announce('objective_updated',undefined,50,event.text?`Objective complete: ${event.text}`:undefined);this.stinger('music.stinger_objective');return}
  if(event.kind==='mission_warning'&&event.text){const prefix=`vo.warning.${snapshot.mission?.id}.`,entry=Object.entries(this.mixer.manifest?.entries??{}).sort(([a],[b])=>Number(b.startsWith(prefix+this.faction+'.'))-Number(a.startsWith(prefix+this.faction+'.'))).find(([id,value])=>id.startsWith(prefix)&&value.variants.some(variant=>(variant.display_caption??variant.caption)===event.text));if(entry)this.mixer.play(entry[0],{cooldown:6000,priority:100});else this.mixer.caption(event.text,100);return}
  if(event.kind==='aircraft_endurance_lost'&&own)this.announce('aircraft_lost_emergency',event.position,100);
  if(event.kind==='shipment_arrived')this.announce('shipment_arrived',event.position);
  if(event.kind==='service_lost'&&own){
   // Go emits service_lost even when it immediately assigns another home.
   // Previous/absent actors cannot establish current reservation failure.
   const current=snapshot.entities.find(value=>value.id===event.entity&&value.owner===snapshot.player&&value.health>0&&value.state!=='destroyed');
   if(current?.private?.home===0&&catalog?.units.get(current.type)?.armor==='air')this.announce('no_landing_slot',event.position);
  }
  if(event.kind==='building_sold'&&own)this.mixer.play('sfx.sell');
  if(event.kind==='tactical_ping')this.mixer.play('sfx.ui_ping',{cooldown:300});
 }
}
