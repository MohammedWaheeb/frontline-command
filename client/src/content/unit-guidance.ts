import type {CatalogIndex,CatalogUnit} from './catalog';
import type {ControlBindings} from '../runtime/keybindings';

/** Public role guidance from the base design; never reads a player's private state. */
export interface UnitGuidance {role:string;targets:string;counters:string}
const ROLES:Readonly<Record<string,string>>={
 rifle:'Anti-infantry squad. Use cover and protect your support units.',
 at:'Anti-armor infantry. Screen against vehicles and protect it from infantry.',
 recon:'Ground scouting and concealment detection. Keep it ahead of protected forces.',
 elite:'Elite infantry with interruptible sabotage against production and technology.',
 engineer:'Captures weakened structures and repairs friendly assets. Needs protection.',
 medic:'Free healing for friendly infantry out of combat. Keep it behind the fighting line.',
 car:'Fast reconnaissance vehicle with an anti-infantry autocannon.',
 apc:'Carries two infantry squads and supports them with small arms.',
 tank:'Heavy direct-fire vehicle for fighting enemy armor.',
 artillery:'Indirect blast fire against infantry and structures. Keep enemies outside its minimum range.',
 aa:'Ground anti-air protection. It cannot intercept tactical missiles.',
 repair:'Paid vehicle repair out of combat. Protect it while damaged vehicles recover.',
 fighter:'Air interception and escort with finite ammunition and endurance.',
 strike:'Attack passes against ground targets with a finite payload and endurance.',
 shahed:'One-way ground-impact attack drone. May Return or Recall before attack commitment. Once committed, flies to the fixed impact point and is consumed; cannot Return, Recall, rebase, rearm or attack again.',
 gunship:'Moving ground-attack aircraft with finite ammunition and endurance.',
 launcher:'Deploys to fire paid tactical missiles at visible ground targets. Each shot warns its defender.',
 rig:'Constructs and resumes structures. Preserve one to recover a lost base.',
 hauler:'Carries supply cargo to a supply center. Protect its route and loading area.',
 airlift:'Unarmed air transport for two infantry squads. Land on visible legal ground to unload.',
 isr:'Unarmed aerial sight and concealment detection. Protect its scouting route and service base.',
 portable_aa:'Infantry anti-air protection. It cannot intercept tactical missiles.',
 scout_drone:'Unarmed aerial sight and concealment detection. Protect its scouting route and service base.',
 buggy:'Fast anti-armor vehicle. Requires support against infantry and aircraft.',
 mobile_abm:'Deploys to intercept tactical and strategic missiles aimed inside its coverage. It cannot attack aircraft or carry passengers.',
};
const TARGETS:Readonly<Record<string,string>>={
 small:'Infantry, vehicles and structures. Small arms do little damage to heavy armor or buildings.',
 auto:'Infantry, vehicles and structures. Autocannons are weaker against heavy armor and buildings.',
 cannon:'Infantry, vehicles and structures. Tank cannon fire is weaker against infantry.',
 antiarmor:'Vehicles and structures. Cannot attack infantry or aircraft.',
 shell:'Infantry, vehicles and structures. Blast damage falls with distance from the impact.',
 antiair:'Aircraft only. Does not intercept tactical or strategic missiles.',
 airground:'Infantry, vehicles and structures. Cannot attack aircraft.',
 tactical:'Ground units and structures. Aircraft are unaffected; missile interception can stop the projectile.',
};
const COUNTERS:Readonly<Record<string,string>>={
 infantry:'Anti-infantry guns, artillery and air strikes. Cover and supporting forces improve survival.',
 light:'Autocannons, anti-armor weapons, tank cannon fire and aircraft. Avoid unsupported direct fights.',
 heavy:'Anti-armor weapons, tank cannon fire, aircraft and tactical missiles. Screen the flanks.',
 air:'Ground anti-air and enemy fighters. Loss of service capacity also limits its sorties.',
};
function factionRole(unit:CatalogUnit,role:string):string{
 if(unit.faction==='SY'&&['rifle','recon','elite'].includes(unit.role))return `${role} Can conceal in marked cover and earn one Ambush shot.`;
 if(unit.id==='US.recon')return `${role} Designation shortens US aircraft attack windup on a visible target.`;
 if(unit.id==='IR.recon')return `${role} A paid temporary beacon provides sight without detection or a build radius.`;
 if(unit.id==='IR.launcher')return `${role} Banks two charges for a paid two-point volley.`;
 if(unit.id==='SY.engineer'||unit.id==='SY.repair')return `${role} Can collect bounded salvage from destroyed enemy ground vehicles.`;
 if(unit.id==='SA.tank')return `${role} Hull-down reduces direct ground fire while stationary; artillery and aircraft bypass it.`;
 if(unit.id==='SA.repair')return `${role} Deploys to repair two nearby vehicles with the normal credit cost.`;
 return role;
}
export function unitGuidance(catalog:Pick<CatalogIndex,'units'|'weapons'>,type:string):UnitGuidance|undefined{
 const unit=catalog.units.get(type),role=unit&&ROLES[unit.role];
 if(!unit||!role)return undefined;
 const kind=unit.weapon?catalog.weapons.get(unit.weapon)?.kind:undefined;
 return {role:factionRole(unit,role),targets:unit.role==='shahed'?'Infantry, vehicles and structures at the committed ground point. Cannot attack aircraft; strikes by physical impact, not ranged fire.':unit.role==='mobile_abm'?'Hostile tactical and strategic missiles whose impact point is in deployed coverage.':!unit.weapon?'Unarmed. Does not attack enemies.':kind&&TARGETS[kind]||'Consult the installed weapon rules.',counters:unit.role==='shahed'?'Ground anti-air and enemy fighters during approach.':COUNTERS[unit.armor]??'Keep this support unit protected.'};
}
/** Repair is also the medic's free healing order; never advertise a medic charge. */
export function repairCommandHint(catalog:Pick<CatalogIndex,'units'>,types:readonly string[]):string{
 const roles=types.map(type=>catalog.units.get(type)?.role);
 if(roles.length&&roles.every(role=>role==='medic'))return 'Free medical healing for friendly infantry; requires out-of-combat time.';
 if(roles.some(role=>role==='medic'))return 'Medics heal infantry free; mechanical repair costs credits. Both require out-of-combat time.';
 return 'Paid mechanical repair; requires out-of-combat time.';
}
/** Role and counters precede numeric purchase details in production tooltips. */
export function unitTooltip(catalog:Pick<CatalogIndex,'units'|'weapons'>,type:string):string{
 const guide=unitGuidance(catalog,type);
 return guide?`${guide.role} Targets: ${guide.targets} Counters: ${guide.counters}`:'';
}
export const FACTION_COMMAND_ABILITIES={
 US:['recon_sweep','rapid_sortie'],IR:['relay_boost','drone_recall'],
 SY:['rapid_transfer','disperse'],SA:['emergency_power','recovery_order'],
} as const;
const POINTER_NAMES=['Left','Middle','Right','Back','Forward'] as const;
export function selectionInstruction(bindings:Pick<ControlBindings,'pointer'>):string{
 const select=POINTER_NAMES[bindings.pointer.select]??'Selection',context=POINTER_NAMES[bindings.pointer.context]??'Order';
 return `${select}-click or drag to select · ${context}-click to command`;
}
