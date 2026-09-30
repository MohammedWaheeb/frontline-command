// Presentation vocabulary only: display names, icons and readable explanations
// for identifiers returned by Go. No gameplay legality is decided here.
import type {Faction} from '../runtime';

export const FACTIONS:Record<Faction,{name:string;short:string;doctrine:string;emblem:string}>={
 US:{name:'United States',short:'US',doctrine:'Air superiority · escorted strikes · airlift',emblem:'em-US'},
 IR:{name:'Iran',short:'IR',doctrine:'Drone networks · banked missile volleys',emblem:'em-IR'},
 SY:{name:'Syrian Rebels',short:'SY',doctrine:'Concealment · ambush · safehouse routes',emblem:'em-SY'},
 SA:{name:'Saudi Arabia',short:'SA',doctrine:'Heavy armor · interception · repairs',emblem:'em-SA'},
};
export const isFaction=(value:string):value is Faction=>value in FACTIONS;

export interface CommandLabel {label:string;icon:string;shortcut?:string;target:'none'|'ground'|'entity'|'ground-or-entity';hint:string}
export const COMMANDS:Record<string,CommandLabel>={
 move:{label:'Move',icon:'i-move',shortcut:'move',target:'ground',hint:'Go to the destination without chasing.'},
 attack_move:{label:'Attack-move',icon:'i-attack-move',shortcut:'attack_move',target:'ground',hint:'Fight valid enemies along the route.'},
 attack:{label:'Attack',icon:'i-attack',target:'entity',hint:'Engage a chosen visible target.'},
 force_fire:{label:'Force-fire',icon:'i-force-fire',shortcut:'force_fire',target:'ground',hint:'Fire a ground-area weapon at a point.'},
 stop:{label:'Stop',icon:'i-stop',shortcut:'stop',target:'none',hint:'Clear current orders.'},
 hold:{label:'Hold',icon:'i-hold',shortcut:'hold',target:'none',hint:'Never move automatically.'},
 guard:{label:'Guard',icon:'i-guard',shortcut:'guard',target:'ground-or-entity',hint:'Engage within six tiles of the anchor, then return.'},
 patrol:{label:'Patrol',icon:'i-path',shortcut:'patrol',target:'ground',hint:'Travel between here and the target.'},
 escort:{label:'Escort',icon:'i-shield',shortcut:'escort',target:'entity',hint:'Guard an ally as it moves.'},
 aggressive:{label:'Aggressive',icon:'i-aggressive',shortcut:'aggressive',target:'ground',hint:'Chase visible enemies up to twelve tiles.'},
 gather:{label:'Gather',icon:'i-resource',shortcut:'gather',target:'ground',hint:'Harvest a known supply field.'},
 repair:{label:'Repair',icon:'i-wrench',shortcut:'repair',target:'entity',hint:'Heal or repair a friendly target out of combat; medics heal infantry free, mechanical repairs cost credits.'},
 capture:{label:'Capture',icon:'i-flag-checker',shortcut:'capture',target:'entity',hint:'Engineer channel on a weakened structure or station.'},
 board:{label:'Board',icon:'i-users',shortcut:'board',target:'entity',hint:'Enter a transport or garrison.'},
 unload:{label:'Unload',icon:'i-download',shortcut:'unload',target:'ground',hint:'Release passengers at a point.'},
 salvage:{label:'Salvage',icon:'i-wrench',shortcut:'salvage',target:'ground',hint:'Collect visible salvage.'},
 return:{label:'Return',icon:'i-aircraft',shortcut:'return',target:'none',hint:'Return to an assigned service pad.'},
 rebase:{label:'Rebase',icon:'i-aircraft',target:'entity',hint:'Choose an owned compatible service building with free slots. The aircraft flies there and reserves its new home immediately. Cannot be queued.'},
 repeat_sortie:{label:'Repeat sortie',icon:'i-refresh',target:'none',hint:'Toggle automatic sorties after rearm.'},
 deploy:{label:'Deploy',icon:'i-deploy',shortcut:'deploy',target:'none',hint:'Set up for firing or interception.'},
 pack:{label:'Pack',icon:'i-chevron-down',shortcut:'pack',target:'none',hint:'Pack up to move again.'},
 rally:{label:'Rally',icon:'i-rally',shortcut:'rally',target:'ground',hint:'Set the destination for new ground units. Haulers gather automatically; aircraft stay at their service home.'},
 sell:{label:'Sell',icon:'i-sell',shortcut:'sell',target:'none',hint:'Five-second sale; refund scales with health.'},
 power:{label:'Power',icon:'i-toggle-power',shortcut:'power',target:'none',hint:'Toggle this building on or off.'},
 resume:{label:'Resume build',icon:'i-building',target:'entity',hint:'Continue an unfinished foundation.'},
};

export interface AbilityLabel {label:string;target:'none'|'ground'|'entity'|'points';points?:number;hint:string;edge?:boolean}
export const ABILITIES:Record<string,AbilityLabel>={
 radar_pulse:{label:'Radar Pulse',target:'ground',hint:'25 Energy · 80-second cooldown. Select an active radar and scan a point within 14 tiles, including unknown terrain. Reveals a 12-tile radius for 6 seconds. One source pays once.'},
 observe:{label:'Recon Observe',target:'none',hint:'Free. Enable: stay still for 2 seconds, then gain +3 sight. Disable: return to normal sight. Movement or work cancels Observe; detection and armour stay unchanged.'},
 designate:{label:'Designate',target:'entity',hint:'Mark a visible vehicle or structure within seven tiles.'},
 beacon:{label:'Forward beacon',target:'ground',hint:'Costs 200. Place within one tile of the observers.'},
 sabotage:{label:'Sabotage',target:'entity',hint:'Channel on an adjacent enemy production or tech building.'},
 decoy:{label:'Decoy flares',target:'none',hint:'Requires Countermeasures research.'},
 transfer:{label:'Transfer',target:'entity',hint:'Move passengers to another quiet owned safehouse.'},
 volley:{label:'Volley',target:'points',points:2,hint:'Two visible points within four tiles; needs two charges and 600 credits.'},
 strategic:{label:'Strategic operation',target:'none',hint:'Uses the strategic site charge.'},
 recon_sweep:{label:'Recon Sweep',target:'ground',hint:'35 Energy. Reveals explored terrain after two seconds; opponents see the circle.'},
 rapid_sortie:{label:'Rapid Sortie',target:'none',hint:'50 Energy. This airfield rearms 1.5× for 15 seconds.'},
 relay_boost:{label:'Relay Boost',target:'none',hint:'35 Energy. +3 sight radius for ten seconds.'},
 drone_recall:{label:'Drone Recall',target:'none',hint:'45 Energy. Up to four drones return faster; they cannot fire.'},
 rapid_transfer:{label:'Rapid Transfer',target:'none',hint:'40 Energy. Next transfer within ten seconds prepares in three.'},
 disperse:{label:'Disperse',target:'ground',hint:'45 Energy. Infantry within six tiles move faster for eight seconds.'},
 emergency_power:{label:'Emergency Power',target:'none',hint:'45 Energy. HQ supplies +80 power for 20 seconds.'},
 recovery_order:{label:'Recovery Order',target:'ground',hint:'50 Energy. Repair sources within eight tiles work faster.'},
};
export const STRATEGIC:Record<Faction,{label:string;activationCost:number;target:'points'|'none';points?:number;edge?:boolean;hint:string}>={
 US:{label:'Skybreaker Wing',activationCost:1200000,target:'points',points:3,edge:true,hint:'Costs 1,200 credits per cast and a full site charge. Choose an entry edge, then three visible impact points within four tiles.'},
 IR:{label:'Saturation Salvo',activationCost:1500000,target:'points',points:3,hint:'Costs 1,500 credits per cast and a full site charge. Three visible impact points within four tiles; six interceptable missiles.'},
 SY:{label:'Coordinated Raid',activationCost:1200000,target:'none',hint:'Costs 1,200 credits per cast and a full site charge. Selected complete safehouses deploy temporary squads after twelve seconds.'},
 SA:{label:'Shieldline Protocol',activationCost:1000000,target:'none',hint:'Costs 1,000 credits per cast and a full site charge. Selected HQ, outpost or deployed Aegis carrier anchors a radius-ten zone.'},
};

/** Readable recovery text for Go reason codes. Unknown codes stay visible verbatim. */
const REASONS:Record<string,string>={
 ok:'Accepted.',indeterminate:'The host will check this when the order executes.',
 insufficient_credits:'Not enough credits.',insufficient_energy:'Not enough Command Energy.',cooldown:'Still cooling down.',
 queue_full:'The queue is full (one active job plus five waiting).',producer_disabled:'The producer is disabled or unpowered.',
 missing_tier:'Requires a higher technology tier.',missing_prerequisite:'A prerequisite building is missing.',already_researched:'Already researched.',already_queued:'Already queued elsewhere.',
 blocked_terrain:'Blocked terrain under the foundation.',mandatory_corridor:'Would block a mandatory route.',unseen_placement:'Part of the foundation is not currently visible.',outside_map:'Outside the battlefield.',snap_to_grid:'Placement must align to the tile grid.',
 outside_builder_radius:'Place the field barricade within three tiles of a selected rig or engineer.',builder_required:'Select an owned rig or engineer.',barricade_limit:'Field barricade limit reached (16).',no_eligible_entities:'No selected units support this action.',
 outside_build_radius:'Outside the 14-tile build radius of an HQ or outpost.',overlap:'Overlaps another structure or unit.',occupied:'The site is occupied.',
 target_not_visible:'The target is not currently visible.',not_controllable:'That unit cannot be commanded.',unsupported_command:'Selected units without this action keep their current orders.',
 selection_empty:'Select units first.',countdown:'Commands unlock when the opening countdown ends.',match_countdown:'Commands unlock when the opening countdown ends.',replay_read_only:'Replays are read-only.',
 one_builder_required:'Select one engineering rig.',one_producer_required:'Choose one producer.',structure_limit:'Structure limit reached.',defense_limit:'Defense limit reached (16).',unique_limit:'Only one of this structure is allowed.',
 supply_cap:'Army Supply is at its cap.',service_capacity:'No aircraft service slot is available.',no_service_slot:'No aircraft service slot is available.',
 service_full:'Aircraft service is unavailable. Check free slots and whether the service base is enabled.',owned_service_required:'Choose one of your own aircraft service buildings.',service_unavailable:'Choose a completed, enabled service building that is not being sold.',incompatible_service:'This base cannot service every selected aircraft.',aircraft_servicing:'Wait for servicing to finish before changing bases.',aircraft_recovering:'Wait for emergency takeoff to finish before changing bases.',rebase_not_queueable:'Rebase changes reserved service slots immediately; release Shift and turn off queue mode.',takeoff_blocked:'The aircraft cannot take off until the airspace above its pad is clear.',
 invalid_designation:'Choose a visible enemy vehicle or structure within seven tiles.',invalid_sabotage:'Choose an adjacent enemy production or tech building.',ability_prerequisite:'Requires Tier 2 and an active HQ.',
 unexplored_target:'Choose explored terrain.',target_required:'Choose a target.',invalid_target_kind:'That target does not fit this command.',no_context_command:'No applicable order for that target.',
 targeting_changed:'Selection changed; the order was not sent.',command_limit:'Too many orders at once.',not_connected:'Reconnect to the host before issuing orders.',
 capture_exit_blocked:'Garrison exits are blocked — clear space or cancel the capture.',landing_blocked:'Landing pads are blocked.',exit_blocked:'Production exit is blocked.',
 route_blocked:'No route found.',cannot_queue:'This order cannot be queued.',selection_limit:'Too many units selected for this order.',
 completed_building_required:'Select a completed building.',wrong_research_producer:'Research here is unavailable.',unknown_ability:'Unknown ability.',
};
export function reason(code:string|undefined,fallback?:string):string{
 if(!code)return fallback??'Unknown result.';
 return REASONS[code]??fallback??code.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())+'.';
}

/** Owner-visible event presentation; the alert text is the visible cue for every sound. */
export interface AlertStyle {text:string;priority:'critical'|'warning'|'info'|'success';icon:string;actionable:boolean}
export const EVENT_ALERTS:Record<string,(value:bigint,text:string)=>AlertStyle|undefined>={
 under_attack:()=>({text:'Base under attack',priority:'warning',icon:'i-alert',actionable:true}),
 missile_warning:()=>({text:'Missile launch detected',priority:'critical',icon:'i-missile',actionable:true}),
 airstrike_warning:()=>({text:'Airstrike inbound',priority:'critical',icon:'i-aircraft',actionable:true}),
 raid_warning:()=>({text:'Raid deployment spotted',priority:'critical',icon:'i-alert',actionable:true}),
 shield_preparing:()=>({text:'Shieldline preparing',priority:'warning',icon:'i-shield',actionable:true}),
 construction_complete:()=>({text:'Construction complete',priority:'success',icon:'i-building',actionable:true}),
 unit_ready:()=>({text:'Unit ready',priority:'info',icon:'i-check',actionable:true}),
 research_complete:()=>({text:'Research complete',priority:'success',icon:'i-research',actionable:false}),
 foundation_placed:()=>({text:'Foundation placed',priority:'info',icon:'i-building',actionable:true}),
 building_captured:()=>({text:'Structure captured',priority:'warning',icon:'i-flag-checker',actionable:true}),
 station_captured:()=>({text:'Supply station captured',priority:'info',icon:'i-flag-checker',actionable:true}),
 capture_interrupted:()=>({text:'Capture interrupted',priority:'warning',icon:'i-flag-checker',actionable:true}),
 capture_exit_blocked:()=>({text:'Capture waiting: garrison exits blocked',priority:'warning',icon:'i-flag-checker',actionable:true}),
 route_blocked:()=>({text:'Route blocked',priority:'warning',icon:'i-path',actionable:true}),
 hauler_retreat:value=>({text:value>0n?'Hauler retreating to supply center':'Hauler retreating — no reachable supply center',priority:'warning',icon:'i-alert',actionable:true}),
 service_lost:()=>({text:'Aircraft service slot lost',priority:'warning',icon:'i-aircraft',actionable:true}),
 aircraft_returning:()=>({text:'Aircraft returning',priority:'info',icon:'i-aircraft',actionable:true}),
 aircraft_return_soon:()=>({text:'Aircraft endurance low',priority:'info',icon:'i-aircraft',actionable:true}),
 missile_intercepted:()=>({text:'Missile intercepted',priority:'success',icon:'i-intercept',actionable:true}),
 decoy_triggered:()=>({text:'Decoy released',priority:'info',icon:'i-aircraft',actionable:true}),
 shipment_countdown:()=>({text:'Central shipment countdown started',priority:'info',icon:'i-credits',actionable:true}),
 shipment_arrived:()=>({text:'Central shipment arrived',priority:'info',icon:'i-credits',actionable:true}),
 defeat_countdown:()=>({text:'Elimination countdown: restore a qualifying structure',priority:'critical',icon:'i-alert',actionable:false}),
 player_defeated:(_v,t)=>({text:t||'A commander was defeated',priority:'warning',icon:'i-flag-checker',actionable:false}),
 objective_complete:(_v,t)=>({text:t?`Objective complete: ${t}`:'Objective complete',priority:'success',icon:'i-objective',actionable:false}),
 checkpoint:(_v,t)=>({text:t?`Checkpoint: ${t}`:'Checkpoint reached',priority:'info',icon:'i-flag-checker',actionable:false}),
 mission_warning:(_v,t)=>({text:t||'Mission warning',priority:'warning',icon:'i-alert',actionable:true}),
 scenario_reinforcement:(_v,t)=>({text:t||'Reinforcements arrived',priority:'info',icon:'i-users',actionable:true}),
 transfer_canceled:()=>({text:'Safehouse transfer canceled',priority:'warning',icon:'i-alert',actionable:true}),
 raid_canceled:()=>({text:'Raid deployment canceled',priority:'warning',icon:'i-alert',actionable:true}),
 raid_exit_blocked:()=>({text:'Raid exit blocked',priority:'warning',icon:'i-alert',actionable:true}),
 unload_exit_blocked:()=>({text:'Unload exit blocked',priority:'warning',icon:'i-download',actionable:true}),
 strategic_activated:()=>({text:'Strategic operation launched',priority:'warning',icon:'i-impact',actionable:true}),
 tactical_ping:()=>({text:'Ally ping',priority:'info',icon:'i-signal',actionable:true}),
 building_sold:()=>({text:'Structure sold',priority:'info',icon:'i-sell',actionable:false}),
};

export function titleCase(id:string){return id.replace(/^(US|IR|SY|SA)\./,'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
export function formatClock(ticks:number){const s=Math.floor(ticks/20),m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
export function credits(milli:bigint|number){const v=typeof milli==='bigint'?Number(milli/1000n):Math.floor(milli/1000);return v.toLocaleString('en-US')}
