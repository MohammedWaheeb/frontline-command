// Icon symbol mapping for research upgrades, abilities and strategic
// operations. Symbols live in assets/ui/icons/fc-icons.svg (served as
// /art/ui/icons/fc-icons.svg). Values are <symbol> ids for the Icon
// component; unknown ids fall back to the previous generic glyphs so this
// module is safe to adopt incrementally.

const UPGRADES: Readonly<Record<string, string>> = {
  'US.countermeasures': 'i-research-defensive-countermeasures',
  'US.service_crews': 'i-research-airfield-service-crews',
  'IR.drone_servicing': 'i-research-distributed-drone-servicing',
  'IR.launcher_crews': 'i-research-mobile-launcher-crews',
  'SY.prepared_exits': 'i-research-prepared-exits',
  'SY.field_restoration': 'i-research-field-restoration',
  'SA.service_crews': 'i-research-mobile-service-crews',
  'SA.interception': 'i-research-integrated-interception',
  vehicle_armor: 'i-research-vehicle-armor',
  weapons_training: 'i-research-weapons-training',
};

const ABILITIES: Readonly<Record<string, string>> = {
  radar_pulse: 'i-ability-radar-pulse',
  observe: 'i-ability-observe',
  designate: 'i-ability-designate',
  beacon: 'i-ability-beacon',
  sabotage: 'i-ability-sabotage',
  decoy: 'i-ability-decoy',
  transfer: 'i-ability-transfer',
  volley: 'i-ability-volley',
  strategic: 'i-ability-strategic',
  recon_sweep: 'i-ability-recon-sweep',
  rapid_sortie: 'i-ability-rapid-sortie',
  relay_boost: 'i-ability-relay-boost',
  drone_recall: 'i-ability-drone-recall',
  rapid_transfer: 'i-ability-rapid-transfer',
  disperse: 'i-ability-disperse',
  emergency_power: 'i-ability-emergency-power',
  recovery_order: 'i-ability-recovery-order',
};

const OPERATIONS: Readonly<Record<string, string>> = {
  US: 'i-operation-skybreaker-wing',
  IR: 'i-operation-saturation-salvo',
  SY: 'i-operation-coordinated-raid',
  SA: 'i-operation-shieldline-protocol',
  us_skybreaker_wing: 'i-operation-skybreaker-wing',
  iran_saturation_salvo: 'i-operation-saturation-salvo',
  syrian_rebels_coordinated_raid: 'i-operation-coordinated-raid',
  saudi_arabia_shieldline_protocol: 'i-operation-shieldline-protocol',
  skybreaker_wing: 'i-operation-skybreaker-wing',
  saturation_salvo: 'i-operation-saturation-salvo',
  coordinated_raid: 'i-operation-coordinated-raid',
  shieldline_protocol: 'i-operation-shieldline-protocol',
};

export function upgradeIcon(id: string): string {
  return UPGRADES[id] ?? 'i-research';
}

export function abilityIcon(id: string): string {
  return ABILITIES[id] ?? 'i-energy';
}

export function operationIcon(id: string): string {
  return OPERATIONS[id] ?? 'i-missile';
}
