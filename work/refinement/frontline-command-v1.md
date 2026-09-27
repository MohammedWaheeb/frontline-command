# FRONTLINE COMMAND
## Complete browser RTS - game design v1.0

**Working title.** A modern military real-time strategy game built around construction, harvesting, scouting, combined armies, and destroying an opponent's war economy. The requested factions are the United States, Iran, Syrian Rebels, and Saudi Arabia.

This is a full product design, not a playable build. All faction capabilities, statistics, maps, and conflicts are fictional game abstractions. They do not describe current military capabilities. The Syrian Rebels faction represents an invented coalition, with original symbols and commanders. All numerical values are starting targets that require playtesting.

### The experience
Command an army from an elevated battlefield view. Deploy a base, collect resources with vulnerable supply vehicles, manage electricity, construct production buildings, and train units. Scout what the enemy builds, field the right counters, expand your economy, and combine infantry, armor, artillery, aircraft, and missiles to win.

The reference is the classic Command & Conquer style of base-building RTS. The intended familiarity is in controls, economy, construction, army management, unit acknowledgments, and readable combat. Original art, unit designs, dialogue, music, interface graphics, and missions give this game its own identity.

### Product commitments
- A complete foundation: four factions, full technology progression, ground and air warfare, tactical missiles, strategic abilities, base defenses, repairs, capture, veterancy, and fog of war.
- Full modes: tutorial, campaigns, AI skirmish, cooperative play, competitive multiplayer, custom lobbies, saves, replays, and observers.
- Desktop browser first: mouse and keyboard, readable at 1280 x 720, scalable interface, responsive commands, and adjustable graphics. Phone controls are a later adaptation.
- Matches target 20-35 minutes in 1v1 and 25-45 minutes in team games. These are pacing goals, not forced time limits.
- Skill comes from scouting, positioning, composition, economy, and timing. Purchases never change combat strength.

### The recurring decisions
**Earn -> build -> scout -> counter -> attack -> repair -> expand.** Spending on a new resource position delays immediate military strength. Spending everything on tanks leaves gaps against aircraft and anti-armor infantry. Investing in missiles demands protection for the launcher and continued scouting.

### Winning
In standard play, a player is defeated when they own no headquarters, construction rig, barracks, vehicle factory, or airfield for 30 continuous seconds. Other buildings and surviving soldiers do not keep an otherwise eliminated player in the match. A rebuilt or captured qualifying asset cancels the countdown. A team wins when every opposing player is eliminated or surrenders.

The design below specifies the release target. Development milestones may stage implementation, but they do not redefine a limited prototype as the finished game.

<!-- page -->

# 01 / Economy and construction

### A familiar, vulnerable economy
Each player begins with a deployed headquarters, one construction rig, 6,000 credits, and 40 power capacity. A supply center includes one hauler. Haulers gather crates from finite supply fields and return them to a supply center automatically. A load is worth 600 credits; a nearby round trip targets 30 seconds, including loading and unloading. Congestion and travel distance reduce income.

A starting field contains 36,000 credits. Two haulers target 2,400 credits per minute and exhaust it in about 15 minutes. One unload lane serves one vehicle at a time; a third hauler offers diminishing returns. Expansions contain 24,000 credits. Capturable supply stations add 120 credits per minute each, with two per standard map. If every field is exhausted, a global three-minute countdown precedes a 6,000-credit shipment at a marked central depot; shipments repeat only while all fields remain empty.

### Build rules
Select a rig, choose a structure, place its footprint, and the rig travels there to construct it. Building sites must be visible and within 14 tiles of an owned headquarters, supply center, or outpost. A rig can establish an expansion outpost outside this radius for 1,000 credits and 30 seconds; the rig remains available afterward. The outpost provides a 14-tile build radius but does not count as a headquarters or generate power. Buildings cannot overlap terrain, block every route through a choke, or appear inside enemy foundations.

Pay the full cost when construction or production starts; waiting orders do not reserve credits. Canceling an active order refunds 75% of its unfinished value. Destroying a producer loses its active order; waiting orders are removed. Selling a completed building returns 50% of its building-only value, scaled by remaining health. A supply center's included hauler is excluded from resale value. Capturing a center never grants a free hauler.

| Building | Credits / seconds | Power | Requirement | Function |
|---|---|---|---|---|
| Headquarters | 3,500 / 70 | +40 | Rig | Rigs, strategic command |
| Power station | 500 / 15 | +100 | Headquarters | Powers the base |
| Supply center | 1,800 / 35 | 20 | Power station | Income; includes one hauler |
| Barracks | 600 / 15 | 10 | Power station | Infantry and support troops |
| Vehicle factory | 1,800 / 45 | 25 | Supply center + barracks | Vehicles and repairs |
| Radar center | 1,400 / 35 | 20 | Vehicle factory | Tier 2 and radar functions |
| Airfield | 2,000 / 50 | 30 | Radar center | Aircraft and four service slots |
| Technology center | 2,500 / 60 | 35 | Radar + factory | Tier 3 and advanced research |
| Repair depot | 1,000 / 25 | 15 | Vehicle factory | Vehicle servicing |
| Guard bunker | 400 / 10 | 0 | Barracks | Garrison for two squads |
| Gun turret | 650 / 15 | 10 | Vehicle factory | Anti-vehicle defense |
| Air-defense post | 900 / 25 | 15 | Barracks | Aircraft and drones |
| Interceptor battery | 1,800 / 40 | 30 | Radar center | Tactical/strategic interception |
| Strategic command site | 4,500 / 90 | 80 | Technology center | One faction superweapon |

Power below demand halves construction, research, and production speed; powered defenses fire at half rate and strategic charging stops. The basic minimap and warnings remain usable. Players can disable buildings to free power. Disabling a producer pauses its queue.

<!-- page -->

# 02 / Army control and combat

### Orders must feel immediate
Left-click selects; drag selects a group; Shift adds or queues; double-click selects the same type on screen. Right-click gives a contextual move, attack, repair, board, capture, or unload order. A + click gives attack-move; Ctrl + ground-click orders supported weapons to attack that position. S stops, H holds position, G guards a unit, and Ctrl + 1-9 saves groups. Bindings are remappable, including a classic left-click command option. Rally points, selection filters, health bars, and queued waypoints are standard.

The pointer, destination marker, and unit acknowledgment respond within a target of 100 milliseconds. The simulation confirms the actual command. Units turn and move without an artificial acknowledgment delay. Formation movement keeps nearby members together without waiting for the slowest distant unit. Queued routes are visible when Shift is held.

### Behavior and retaliation
- **Move:** travel to the destination; moving does not turn into a chase. Units with a permitted moving weapon can return fire without leaving the route.
- **Attack target:** engage the chosen valid target. On losing sight, travel only to its last visible position, then enter guard. Do not track an invisible unit.
- **Attack-move:** engage visible enemies on the route, then resume the route when local combat ends.
- **Guard:** retaliate against threats to the unit or its protected ally, pursue at most six tiles, then return. This is the default stance.
- **Hold position:** fire only within current range; do not move. **Aggressive:** pursue visible enemies up to twelve tiles from the assigned position.
- **Priority:** explicit orders first; otherwise enemies damaging the unit or guarded ally, then effective targets, then the nearest legal target. Commit until the target dies, is lost, or becomes unreachable. Avoid constant target switching.
- A blocked unit reroutes. After two failed routes, display a blocked-order indicator and alert once. Units never silently discard a player's instruction.

### Damage is predictable
Each attack has a weapon class, damage, reload time, range, projectile behavior, and legal target layers. Damage equals base damage multiplied by the target armor modifier and applicable cover modifier. Small arms cannot damage flying aircraft; anti-armor teams target ground vehicles; dedicated AA targets air. No universal weapon attacks everything.

| Weapon class | Infantry | Light vehicle | Heavy armor | Structure |
|---|---|---|---|---|
| Small arms | 100% | 35% | 10% | 10% |
| Autocannon | 100% | 100% | 35% | 30% |
| Tank cannon | 35% | 100% | 100% | 70% |
| Anti-armor missile | 30% | 100% | 140% | 70% |
| Artillery shell | 100% | 80% | 45% | 100% |
| Air-to-ground munition | 65% | 100% | 100% | 100% |

Infantry in cover take 25% less small-arms/autocannon damage; cover does not stack. Artillery shells and unguided bombs can miss moving targets because the target moves out of the impact area, not because of a hidden accuracy roll. Heavy splash deals 50% damage to friendly units. Ordinary direct fire has no friendly fire. Ground weapons have visible line-of-fire rules; indirect fire requires vision supplied by another unit.

### Elite disruption
A commando can disable a production building for ten seconds after a six-second visible channel beside it, with a 60-second cooldown. Moving or taking damage interrupts the channel. This is a bounded game ability, not permanent destruction or an invisible attack.

<!-- page -->

# 03 / United States
## Premium combined arms

**Play style:** a versatile army with strong reconnaissance, durable frontline units, and precise support. **Tradeoff:** replacing losses is expensive. **Visual language:** clean angular vehicles, readable armor silhouettes, compact sensors, and blue team accents that can be recolored.

| Role | Unit name | Battlefield job |
|---|---|---|
| Rifle squad | Ranger squad | General infantry; holds ground |
| Anti-armor team | Guided-missile team | Counters exposed armor |
| Recon squad | Pathfinder team | Scouts and detects concealment |
| Commando | Special operations team | Elite infantry; one active at a time |
| Engineer | Combat engineer | Repairs and captures structures |
| Medic | Field medic | Restores infantry health |
| Scout car | Recon rover | Fast scouting and light skirmishing |
| APC | Infantry carrier | Moves three infantry squads |
| Main battle tank | Sentinel tank | Durable frontline armor |
| Artillery | Precision howitzer | Long-range ground siege |
| Mobile AA | Skyguard vehicle | Protects ground armies from aircraft |
| Repair truck | Recovery vehicle | Maintains vehicles behind combat |
| Interceptor | Falcon interceptor | Hunts aircraft and drones |
| Strike aircraft | Precision strike jet | Limited-ammunition attack runs |
| Gunship | Attack helicopter | Sustained pressure on exposed armor |
| Tactical launcher | Precision missile carrier | Telegraphed long-range strike |
| Construction rig | Engineering rig | Builds and establishes outposts |
| Supply hauler | Logistics truck | Collects and delivers supplies |

### Distinct mechanics
Combat units cost 10% more and have 10% more health than the baseline. For this modifier, combat units include rifle, anti-armor, recon, commando, scout car, APC, tank, artillery, mobile AA, interceptor, strike aircraft, gunship, and launcher. Their production times are unchanged. Engineers, medics, repair vehicles, rigs, and haulers use the baseline.

Pathfinders can designate a visible target. The designation increases the sight range of friendly units against that target by two tiles for eight seconds; it grants no sight through unexplored terrain. It costs no credits and has a 30-second cooldown. The target receives a visible marked icon.

### Research and strategic ability
**Tier 2 - Networked optics:** 1,000 credits / 45 seconds; mobile AA and tanks gain one sight tile. **Tier 3 - Countermeasures:** 1,500 / 60; aircraft ignore the first incoming ordinary AA missile after each completed rearm, with a clear decoy effect. It does not defeat strategic interceptors.

**Precision barrage:** the strategic site launches three interceptable projectiles, each with a maximum 400 structure damage, across a player-selected cluster. Shared superweapon rules in section 09 determine warning, charge time, impact radius, and defenses.

### A readable match plan
Scout early, stabilize with mixed infantry and armor, then add aircraft or artillery according to the opponent's defenses. The opponent can punish an undersized expensive army, force repeated repairs, or contest resource expansions before the US player has enough coverage.

<!-- page -->

# 04 / Iran
## Missile and drone pressure

**Play style:** establish a defended position, use drones to maintain sight, and pressure targets with artillery and launchers. **Tradeoff:** tanks and manned aircraft are less durable in direct fighting. **Visual language:** modular launch vehicles, compact drones, distributed emplacements, and distinct silhouettes.

| Role | Unit name | Battlefield job |
|---|---|---|
| Rifle squad | Line infantry | Defends launchers and resource sites |
| Anti-armor team | Missile infantry | Threatens advancing vehicles |
| Recon squad | Forward observer team | Scouts for indirect fire |
| Commando | Infiltration team | Disrupts lightly defended positions |
| Engineer | Field engineer | Repairs and captures structures |
| Medic | Field medical team | Restores infantry health |
| Scout car | Patrol vehicle | Scouts routes and screens flanks |
| APC | Armored troop carrier | Transports three infantry squads |
| Main battle tank | Bastion tank | Holds the front line |
| Artillery | Rocket artillery | Area pressure with visible volleys |
| Mobile AA | Mobile SAM vehicle | Protects launchers from aircraft |
| Repair truck | Maintenance truck | Repairs damaged ground vehicles |
| Interceptor | Air-defense fighter | Defends local airspace |
| Strike aircraft | Attack drone | Repeated limited-ammunition sorties |
| Gunship | Support helicopter | Supports ground pushes |
| Tactical launcher | Tactical missile launcher | Long-range timed attacks |
| Construction rig | Construction crawler | Builds and establishes outposts |
| Supply hauler | Supply transporter | Collects and delivers supplies |

### Distinct mechanics
Artillery and tactical launchers cost 15% less than baseline. Strike drones cost 20% less and have 20% less health. Tanks and the manned interceptor/gunship have 15% less health. Remaining costs, health values, build times, and direct damage use the baseline. Visual rocket salvos divide one artillery attack's damage among their rockets; extra visuals do not multiply damage.

Forward observers can deploy a stationary sensor beacon for 200 credits. It builds in four seconds, lasts 60 seconds, provides five tiles of sight, and has 100 health. One active beacon per team; no construction radius or targeting immunity. The beacon is a game scouting object, not a free source of permanent map vision.

### Research and strategic ability
**Tier 2 - Rapid servicing:** 1,000 credits / 45 seconds; strike drones rearm 20% faster. **Tier 3 - Launcher mobility:** 1,500 / 60; launcher setup falls from four seconds to three, and pack-up from three to two. It does not shorten strike warnings or missile flight time.

**Heavy missile salvo:** the strategic site launches three interceptable projectiles with the shared damage budget. The display emphasizes a broad incoming salvo, but the same warning time, intercept cost, and maximum damage apply as for other factions.

### A readable match plan
Observers establish sight, infantry screens protect the army, and artillery creates pressure. The opposing player can contest vision, take advantage of weaker direct-fight armor, or catch slow launchers while they move. Passive defense alone cannot secure the map's finite supply fields.

<!-- page -->

# 05 / Syrian Rebels
## Mobile coalition warfare

**Play style:** cheaper infantry, rapid redeployment, concealed scouts, and repaired or captured vehicles. **Tradeoff:** weaker heavy armor and a fragile air wing. This is a fictional coalition with original insignia, leaders, and story. It does not represent any specific present-day armed organization.

| Role | Unit name | Battlefield job |
|---|---|---|
| Rifle squad | Mobile rifle squad | Cheap infantry and territory control |
| Anti-armor team | Anti-armor crew | Punishes unsupported vehicles |
| Recon squad | Local scout team | Concealment and map information |
| Commando | Veteran raider team | Elite infantry and disruption |
| Engineer | Mechanic team | Repairs and captures structures |
| Medic | Aid team | Restores infantry health |
| Scout car | Light technical | Fast anti-infantry skirmishing |
| APC | Improvised troop carrier | Transports three infantry squads |
| Main battle tank | Refitted tank | Supports infantry pushes |
| Artillery | Mobile mortar carrier | Indirect area fire |
| Mobile AA | Air-defense technical | Protects the army from aircraft |
| Repair truck | Salvage workshop truck | Sustains scarce armored vehicles |
| Interceptor | Interceptor drone | Drone-based air interception |
| Strike aircraft | Strike drone | Limited-ammunition ground attacks |
| Gunship | Refitted light helicopter | Mobile air support |
| Tactical launcher | Heavy rocket carrier | Telegraphed siege strike |
| Construction rig | Workshop rig | Builds and establishes outposts |
| Supply hauler | Supply convoy truck | Collects and delivers supplies |

### Distinct mechanics
Rifle, anti-armor, recon, and commando units cost 15% less. Scout cars and APCs cost 15% less. Tanks have 25% less health. Interceptors, strike drones, and gunships have 20% less health. Other baseline values remain unchanged; affordability is balanced against durability, not extra hidden damage.

Recon and rifle squads conceal after four stationary seconds outside combat. They remain detectable within three tiles of any enemy or seven tiles of a recon unit. Moving, firing, capturing, or taking damage reveals them immediately. Concealment is clearly marked on the owning player's interface.

Destroyed enemy combat vehicles may leave one salvage crate worth 10% of their purchase cost, capped at 150 credits. Only a mechanic or workshop truck may claim it. No crates come from friendly units, summoned units, aircraft, structures, or repeatedly captured and resold units. Crates expire after 45 seconds. This bonus rewards winning fights without replacing harvesting.

### Research and strategic ability
**Tier 2 - Fast deployment:** 1,000 credits / 45 seconds; APC unloading takes one second instead of two. **Tier 3 - Field restoration:** 1,500 / 60; repair trucks restore 25% more health per second at the same credit cost per health point.

**Rocket concentration:** the strategic site delivers three interceptable heavy projectiles with the shared warning and damage budget. This is conventional fictional artillery. Air roles are provided by drones and refitted equipment so the faction has meaningful participation in every combat layer.

<!-- page -->

# 06 / Saudi Arabia
## Air mobility and sustained operations

**Play style:** durable premium aircraft, mechanized support, and efficient recovery between engagements. **Tradeoff:** losing airfields or expensive aircraft is costly, and air power cannot hold objectives on its own. **Visual language:** clean desert-toned vehicles, distinct service equipment, and readable aircraft silhouettes.

| Role | Unit name | Battlefield job |
|---|---|---|
| Rifle squad | Mechanized rifle squad | Holds positions behind mobile forces |
| Anti-armor team | Anti-tank detachment | Protects bases and infantry |
| Recon squad | Desert reconnaissance team | Scouts and detects concealment |
| Commando | Rapid-response team | Elite infantry support |
| Engineer | Engineering detachment | Repairs and captures structures |
| Medic | Medical detachment | Restores infantry health |
| Scout car | Desert patrol car | Fast information and screening |
| APC | Wheeled infantry carrier | Transports three infantry squads |
| Main battle tank | Guardian tank | Frontline mechanized combat |
| Artillery | Mobile howitzer | Supports ground advances |
| Mobile AA | Air-shield vehicle | Covers troops and supply routes |
| Repair truck | Service vehicle | Restores damaged ground vehicles |
| Interceptor | Air-superiority fighter | Protects strike formations |
| Strike aircraft | Multirole strike jet | Limited-ammunition ground strikes |
| Gunship | Escort helicopter | Supports mechanized forces |
| Tactical launcher | Cruise missile carrier | Long-range timed strike |
| Construction rig | Infrastructure rig | Builds and establishes outposts |
| Supply hauler | Logistics carrier | Collects and delivers supplies |

### Distinct mechanics
Interceptors, strike jets, and gunships cost 15% more and have 15% more health than the baseline. Their default rearm time is 15% shorter. Ground units keep baseline stats. These advantages consume credits and airfield capacity, so they do not provide unlimited air activity.

Repair trucks can deploy a service zone with a four-second setup. While deployed, they repair two nearby vehicles at half their normal individual repair rate each. This improves formation handling, not total repair output. The truck cannot move or fire while deployed and packs up in three seconds.

### Research and strategic ability
**Tier 2 - Mobile logistics:** 1,000 credits / 45 seconds; repair trucks gain 15% movement speed. **Tier 3 - Hardened airfields:** 1,500 / 60; airfields gain 25% maximum and current health, with the current-health increase limited to the same proportion as their pre-upgrade health percentage. It does not repair a damaged building for free.

**Stand-off strike:** the strategic site launches three long-range precision projectiles with the shared interceptable strike rules. Aircraft flyovers are cosmetic only and do not secretly add another attack or consume the player's trained aircraft.

### A readable match plan
Build a stable ground army, scout the enemy's air defenses, and choose when to commit aircraft. Repairing and rearming efficiently makes repeated engagements valuable. The opponent can invest in mobile AA, interceptors, and map pressure that forces this faction to spread its expensive forces.

<!-- page -->

# 07 / Units, progression, and balancing

These are initial tuning values in fictional game units. Apply listed faction modifiers and upgrades multiplicatively, round credit prices to the nearest 10 and health to whole points. Range uses tiles. Infantry has one health pool per squad; visual casualties do not reduce its damage before elimination. Health upgrades preserve the unit's current health percentage.

| Archetype | Credits | Build sec | Health | Range | Cap | Tier |
|---|---|---|---|---|---|---|
| Rifle squad | 300 | 10 | 300 | 5 | 2 | 1 |
| Anti-armor team | 500 | 15 | 220 | 7 | 2 | 1 |
| Recon squad | 350 | 12 | 180 | 4 | 1 | 1 |
| Commando | 1,600 | 40 | 500 | 6 | 4 | 3 |
| Engineer | 400 | 12 | 150 | - | 1 | 1 |
| Medic | 350 | 12 | 160 | 3 | 1 | 1 |
| Scout car | 500 | 15 | 450 | 5 | 2 | 1 |
| APC | 700 | 20 | 700 | 5 | 3 | 1 |
| Main battle tank | 1,200 | 30 | 1,400 | 7 | 4 | 1 |
| Artillery | 1,100 | 30 | 600 | 14 | 3 | 2 |
| Mobile AA | 900 | 25 | 650 | 10 | 3 | 2 |
| Repair truck | 600 | 18 | 400 | 3 | 2 | 1 |
| Interceptor | 1,500 | 40 | 700 | 9 | 4 | 2 |
| Strike aircraft | 1,700 | 45 | 650 | 8 | 4 | 2 |
| Gunship | 1,300 | 35 | 800 | 7 | 4 | 2 |
| Tactical launcher | 2,200 | 55 | 650 | 40 | 5 | 3 |
| Construction rig | 800 | 20 | 600 | - | 0 | 1 |
| Supply hauler | 900 | 25 | 900 | - | 0 | 1 |

### Production and army limits
Barracks produce infantry, engineers, and medics. Factories produce ground vehicles and extra haulers. Airfields produce aircraft; headquarters produce rigs. Each building has one active queue and five waiting orders. Additional producers give additional queues; there is no invisible global speed boost.

The standard cap is 100 command points per player. Squads count as one simulation entity but use the listed command points. Rigs are limited to four and haulers to eight per player. Captured units count toward the cap; if a capture would exceed it, the capture is unavailable and the interface explains why. Preserved over-cap armies from rule changes cannot produce more combat units.

### Technology and veterancy
Tier 1 is available from initial buildings. A completed powered radar center unlocks Tier 2 production. A completed technology center unlocks Tier 3. Destroying a prerequisite prevents new advanced production; units already built remain functional. Completed research persists, but disabled radar-dependent functions still need an active radar center.

Two shared upgrades are available: vehicle armor at Tier 2 (1,200 credits / 45 seconds, +10% maximum health) and weapons training at Tier 3 (1,500 / 60, +10% direct weapon damage). They do not affect tactical missiles, strategic strikes, repair, or healing. Infantry and vehicles gain veteran status at 1.5 times their cost in attributed enemy value, and elite status at three times their cost. Veteran grants +5% damage; elite replaces it with +10% damage and +10% health. Kill value is split by contributed damage; no farming friendly units or buildings.

<!-- page -->

# 08 / Weapons, support, and capture

### Baseline weapons
The figures below are damage before armor modifiers. All listed cooldowns are measured from one shot or burst to the next. These values are tuning inputs, not claims that every matchup is already balanced.

| Unit | Weapon / damage | Cooldown | Important constraint |
|---|---|---|---|
| Rifle squad | Small arms / 24 | 1 sec | Ground only |
| Anti-armor team | Anti-armor / 100 | 3 sec | Ground vehicles and buildings |
| Recon squad | Small arms / 12 | 1 sec | Sight 11; detects within 7 |
| Commando | Small arms / 60 | 1 sec | One active per player |
| Scout car | Autocannon / 18 | 0.75 sec | Fast; weak against heavy armor |
| APC | Small arms / 16 | 1 sec | Carries three infantry squads |
| Main battle tank | Tank cannon / 100 | 2.5 sec | Can fire while moving |
| Artillery | Shell / 140 | 5 sec | Range 4-14; blast radius 2 |
| Mobile AA | AA missile / 70 | 2 sec | Air only |
| Interceptor | Air missile / 100 | 2 sec | Air only; six shots per sortie |
| Strike aircraft | Air-to-ground / 160 | 1 sec | Two shots per sortie |
| Gunship | Air-to-ground / 60 | 2 sec | Eight shots per sortie |
| Tactical launcher | Special / 500 max | 80 sec | Paid strike; see section 09 |

Artillery splash deals full damage within 0.7 tiles and falls linearly to zero at its two-tile edge. Standard ground sight is nine tiles and aircraft sight is eleven. Units cannot fire beyond supplied vision even when weapon range is longer. Ordinary missiles do not behave like tactical strike projectiles and are not intercepted by strategic batteries.

Infantry uses infantry armor; tanks and haulers use heavy armor; other ground vehicles use light armor. Air-only weapons deal 100% base damage to air armor. Gun turrets fire an 80-damage tank-class shot every two seconds at range nine. AA posts fire a 60-damage air-only shot every two seconds at range eleven. Bunkers add protection, not an extra weapon; occupants fire their own weapons.

Movement in tiles per second: infantry 2.5; tanks/artillery/rigs 2; launchers 1.8; other ground vehicles 3; scout cars 4.5; interceptors/strike aircraft 7; gunships 4. These are game speeds, not real-world measurements.

### Repair, healing, and transport
A medic restores 12 infantry health per second after the patient has been out of combat for three seconds. A repair truck restores 30 vehicle health per second; a depot restores 50. Repairs cost one credit per ten restored health and stop without funds. A unit receives only the strongest current healing or repair effect. There is no automatic universal regeneration.

Engineers repair structures at 25 health per second using the same credit rate. Headquarters have 4,500 health; power stations, barracks, radar centers, and repair depots have 1,500; supply centers, factories, and airfields have 2,500; technology centers have 2,000; strategic sites have 3,000. Guard bunkers and outposts have 1,200; gun/AA defenses have 1,000; interceptor batteries have 1,500. The shared armor upgrade affects vehicles only.

APCs load or unload in two seconds while stationary. If destroyed, each passenger squad exits at 50% of its previous health at the closest valid location; if no valid exit exists within two tiles, that squad is lost. Transported squads still use command points and cannot shoot from inside.

### Capture
Engineers capture an enemy structure only below 25% health. The action takes eight uninterrupted seconds at its entrance, gives both sides a progress indicator, and stops on movement, damage, or loss of vision. Repairing above 25% cancels progress. Headquarters and strategic sites cannot be captured. Neutral structures use a six-second capture without a health requirement.

<!-- page -->

# 09 / Aircraft, missiles, and defenses

### Aircraft behave like a complete combat system
Interceptors fight air targets; strike aircraft attack ground targets; gunships hover and support armies. Aircraft ignore ground collision but obey map boundaries. Orders include patrol, escort, attack run, return to base, and land. All aircraft have a visible altitude/layer indicator so the player can tell which weapons can engage them.

An airfield owns four aircraft service slots. New aircraft require a free assigned slot. Interceptors rearm in 18 seconds, strike aircraft in 22, and gunships in 20, before faction modifiers. Aircraft automatically return when empty and can be recalled manually. Rearming is free; repairing damage uses the standard credit rate. Service slots work simultaneously. Destroying an airfield sends assigned aircraft to another friendly field with space. If none exists, they receive a 60-second emergency timer to find a slot or are lost; a prominent warning and landing marker show the problem.

### Tactical missiles: powerful, visible, limited
A launcher needs Tier 3, a legal target 10-40 tiles away, four seconds of stationary setup, and current allied sight of the target area. Launch costs 400 credits. The eight-second flight begins a clear impact warning for affected players. A two-tile impact radius deals up to 500 damage to structures, 350 to vehicles, and 150 to infantry, with linear falloff outside the inner 0.7 tiles. It cannot damage aircraft. The shot aims at the chosen ground position, so moving units can escape.

The launcher is revealed to opponents for six seconds after firing and must pack up for three seconds before moving. Its 80-second reload begins at launch. Destroying it does not erase an already fired missile. Losing sight after launch does not redirect the projectile. These are fictional gameplay timings and tile distances.

### Interception without hidden dice rolls
Interceptor batteries have a 14-tile protection radius, two ready charges, and regenerate one charge every 18 powered seconds. One charge destroys one tactical or strategic projectile. Fire at the predicted incoming threat with earliest impact; nearby batteries reserve targets to avoid wasteful duplicate shots. Batteries require power, reveal their operating state, and have a one-second shot cooldown. Low power doubles cooldown and charge regeneration time. Charge supply, coverage, and depletion are visible to the owning player.

Mobile AA and air-defense posts counter aircraft, helicopters, and drones. They do not shoot down tactical strikes. Interceptor batteries do not replace ordinary AA. Ground troops and artillery can destroy either defense type. Warnings remain functional without radar, while detailed interception coverage needs powered radar.

### Strategic weapons
Each player can build one strategic site. After construction, a powered three-minute charge begins and is visible to all players. Firing requires current allied vision of the target area, costs 1,200 credits, and creates a twelve-second impact warning. Each faction delivers three interceptable projectiles to three chosen points within a four-tile cluster. Each projectile deals up to 400 structure, 300 vehicle, or 120 infantry damage in a two-tile blast; falloff matches tactical missiles. Friendly units take 50% damage.

A headquarters at full health survives the entire unopposed barrage. Charging restarts only after firing, pauses without adequate power, and is lost if the strategic site is destroyed. Counterplay includes interception, movement, dispersal, destroying the site before launch, or cutting its power before it fires. Already launched projectiles continue independently.

<!-- page -->

# 10 / Maps, fog, and tactical choices

### Readable maps with several ways to fight
Launch with eight original maps: three 1v1 maps, three four-player maps, and two cooperative scenario maps. Themes include a fictional desert junction, industrial valley, highland relay, dry river basin, border depot, and port outskirts. Geographic names, deployments, and layouts are invented for gameplay. Coastal scenery does not imply playable naval combat in the base release.

Standard 1v1 maps target 128 x 128 tiles; four-player maps target 160 x 160. Both starts receive equal resource quantity, nearby cover, buildable area, and route length to expansions. Balance mirrors opportunity, not every decorative object. Each map has a main route, at least two flanks, and open space where aircraft and artillery interact with ground movement.

### Terrain rules
- Open terrain favors vehicle movement; rubble and forest edges provide infantry cover and slow vehicles by 20%.
- Cliffs and deep water block ground movement. Ramps are clearly marked. Elevated ground increases sight by two tiles, with no hidden damage bonus.
- Designated empty structures allow two squads to garrison. Their footprint and capacity are visible. On collapse, occupants exit at half current health if space exists.
- Map walls and designated light obstacles can be destroyed; terrain is not universally destructible. Bridges are indestructible in competitive maps to prevent permanent isolation.
- Every resource expansion can be approached from at least two ground routes. A player cannot fully seal mandatory paths with placed buildings.

### Fog of war and detection
Unexplored ground is dark. Explored but currently unseen terrain remains visible without showing live enemies. Enemy buildings appear as dim last-seen silhouettes with a timestamp; moving units disappear immediately when sight is lost. Concealed units require proximity detection or recon. A radar center never grants full-map vision.

In team modes, allies share sight, warnings, and map pings. Spectators and replays use explicit perspective controls. Competitive observers are delayed and cannot communicate with active players through the game.

### Attack and response examples
| What the player sees | Immediate response | Longer-term adaptation |
|---|---|---|
| Tanks approaching | Place anti-armor teams behind cover | Add tanks/artillery and protect the supply line |
| Infantry massing | Bring rifle squads and scout cars | Add indirect fire; avoid single-unit armor armies |
| Aircraft starting an attack run | Move vulnerable units under AA coverage | Add interceptors and spread air-defense positions |
| Tactical missile impact marker | Move units away; check interceptor charges | Protect launch coverage and invest in mobile pressure |
| Long-range shelling | Move out of repeated impact zones | Scout the artillery and contest its supporting army |
| Capture progress on a building | Damage or displace the engineer | Add detection and a local guard squad |

### Prevent static, endless matches
Finite starting resources encourage expansion. Artillery outranges standard defenses, and strategic weapons eventually threaten concentrated positions. Repair consumes money, defenses consume power, and no defensive structure counters all layers. A clearly announced central supply shipment keeps a depleted battlefield contestable without giving hidden income to either side.

<!-- page -->

# 11 / Single-player, multiplayer, and AI

### Single-player release content
Five short tutorial missions teach selection and movement; economy and power; counters and transport; air/missile defense; and a full mixed-arms match. Four fictional faction campaigns contain six missions each, for 24 missions total. Each campaign progresses through base establishment, convoy protection, contested expansion, defense, multi-objective assault, and a final combined-arms mission. Objectives, layouts, and scripted events differ between campaigns; these are not the same six maps with swapped colors.

Skirmish supports all factions, all competitive maps, selectable AI personalities, map visibility settings, starting credits, game speed, and optional superweapons. Solo games support pause, manual saves, rotating autosaves, restart, and difficulty changes between missions. Campaign progress stores locally and syncs to an account when connected. The main menu makes guest/local progress and account-synced progress distinguishable.

### Multiplayer release content
Ranked 1v1, unranked 1v1, 2v2, four-player free-for-all, private custom lobbies, and two humans versus two AI are included. One shared ruleset powers single-player and multiplayer. Ranked uses standard speed, fixed 6,000-credit starts, standard caps, fog enabled, superweapons enabled, and validated maps. Custom lobbies may change these rules before ready-up; every modification is shown.

Lobbies include faction/color selection, team assignment, map preview, connection quality, ready state, private codes, and a clear summary of rules. Add friend invites, text chat, team pings, mute/report controls, surrender, rematch, match history, reconnect, replay download, and observer slots. New players begin with placement matches; ratings update from match outcomes rather than army size or spending.

### Disconnect and fairness rules
An authoritative match server owns resources, vision, movement, combat, and victory. Clients send orders, never final damage or credit totals. The server sends only the information each player is entitled to see. Check command ownership, rate limits, legal costs, target visibility, and placements. Spectators see a two-minute delayed stream in competitive matches; private lobbies can opt into live observers before the match.

A disconnected player gets a 120-second reconnect window. Existing units keep their last orders and normal guard behavior; the game does not secretly give control to an AI. Reconnect restores the current state. On timeout the player is eliminated. Server failures void ranked results when a valid outcome cannot be recovered. Matchmaking selects regions using connection quality and displays the estimate before play.

### AI should look like an opponent
AI uses the same fog, costs, queues, tech requirements, and cap as the player. Easy responds every four seconds and uses simpler armies. Normal responds every two seconds and scouts before choosing counters. Hard responds every second, protects resource routes, retreats damaged units, and changes composition based on observed enemy investment. No difficulty has free vision, free credits, or faster production in standard skirmish.

Campaign reinforcements are explicit mission events with warnings and predictable entry points. AI personalities alter spending priorities: raider, armor commander, air commander, and siege commander. They are strategy preferences, not permission to ignore counters or scenario objectives.

<!-- page -->

# 12 / Interface, art, sound, and feedback

### The battlefield stays central
The top bar shows credits, income trend, power used/available, command points, and the clock. The right panel contains construction, infantry, vehicles, aircraft, and upgrades, with clear locked-state explanations. The lower-left minimap shows discovered terrain, friendly forces, vision, pings, and threat alerts. The lower-center selection panel shows units, health, ammo, stance, passengers, and special commands. Strategic charge and abilities sit above the production panel.

At 1280 x 720 the map remains the dominant surface. Collapsible side panels and interface scaling preserve readable controls. Control groups display unit counts and critical damage. Hovering a unit explains its role, effective targets, weaknesses, prerequisites, cost, and build time. Purchase failures identify the exact reason: money, power, cap, missing prerequisite, or no aircraft slot.

### Selection and attack must feel finished
Selection produces a ring, a short acknowledgment, and a visible command card. Moving produces a destination marker; attacking produces a target reticle and a weapon-specific effect. A blocked shot shows an obstructed indicator. Impacts read differently on infantry, armor, shields/countermeasures, and buildings. Hit feedback never pretends to damage an illegal target.

Track distinctive silhouettes at the normal camera height. Friendly/enemy ownership uses color plus outlines and symbols. Artillery blast zones, missile warnings, detector areas, and power failures have consistent visual language. Use smoke and debris to communicate damage without hiding targeting outlines. No essential information depends only on color, sound, or small particles.

### Unit voices and announcer behavior
Original short lines include "Ready for orders," "Moving to position," "Target acquired," "Returning to base," "Repair team on site," and "Unable to reach that position." Aircraft acknowledge ammo limits and emergency landings. Troops sound professional and distinct without caricatured accents or political slogans.

Announcer alerts include "Base under attack," "Supply convoy attacked," "Low power," "Aircraft returning," "Missile launch detected," "Interceptor depleted," and "Enemy structure captured." Bundle repeated damage alerts by location within six seconds. Critical warnings can interrupt ordinary acknowledgments; only one ordinary selection voice plays at a time. Clicking an alert centers the camera without changing selection.

### Settings and accessibility
Provide remappable hotkeys, right/left-handed camera options, edge-scroll toggle, camera speed, zoom limits, minimap size, UI scale, subtitles, separate voice/music/effect levels, reduced flashes, screen-shake strength, color-vision palettes, and hold-versus-toggle controls. Show captions for all actionable audio. Settings persist between sessions.

### Presentation beyond the match
Include a coherent title screen, faction descriptions, campaign map, tutorial reminders, loading progress, connection/reconnect states, credits, and clear error messages. The debrief shows the winner, objectives, resource spending, economy timeline, losses, units built, key events, and replay actions. Never reward the player solely for kills when capturing, repairing, or defending was the actual mission objective.

<!-- page -->

# 13 / Complete release and expansion contract

### The base release is the full RTS
The release target includes four complete factions with 18 roles each, fourteen shared building roles plus expansion outposts, three technology tiers, two shared upgrades, two faction upgrades per faction, eight skirmish/co-op maps, five tutorial missions, and 24 campaign missions. Exact reusable archetypes are listed in section 07; names and modifications are defined in sections 03-06. Every faction has ground, air, anti-air, missile, interception, economy, and recovery tools.

Full controls, formations, transport, capture, repair, veterancy, cover, visibility, responsive audio, settings, saves, matchmaking, custom lobbies, reconnect, replays, observers, and debriefs are part of completion. A map editor is also included: terrain painting, start points, resource fields, neutral structures, pathing/visibility preview, validation, and scenario import/export. User maps are private/custom by default and need review before ranked use.

### Build milestones without cutting the final promise
1. **Core systems complete:** construction, resources, controls, combat, power, fog, pathfinding, production, and save/load work together on a test map.
2. **All combat layers complete:** every faction role, aircraft service, interception, strategic weapons, research, and AI operate under one ruleset.
3. **All modes complete:** campaigns, tutorials, maps, online services, replays, reconnect, and editor are integrated.
4. **Release polish complete:** art, audio, menus, usability, balance, compatibility, performance, recovery, and accessibility pass the acceptance gates.

These are production gates, not calendar estimates. Schedule and staffing require an implementation plan, asset budget, and measured prototype performance.

### Browser and reliability targets
Use an authoritative 20-tick-per-second simulation with smooth independent rendering. Target 60 frames per second on the agreed mainstream desktop reference machine at 1080p and 30 on the agreed low-spec machine. Define and record both machines before benchmarking. The stress case is four players at the 100-point cap, eight haulers and four rigs each, full bases, projectiles, fog, and simultaneous battles. Visual infantry models are not separate pathfinding agents.

Use prioritized asset loading, cached resources, scalable effects, and a graphics preset that preserves tactical information. Offline play uses cached single-player assets after the initial download. Version saves and replays; preserve supported old rulesets or clearly explain incompatibility before a user loads a file. Save restoration must reproduce resources, queues, random state, fog, unit orders, and mission triggers without duplicating rewards.

### Expansion-ready rules
Keep unit definitions, prices, weapons, abilities, technology, factions, and map metadata data-driven. Separate ground, air, and future naval target layers. Map format includes a version, size, terrain, spawns, resources, neutral entities, and scenario triggers. New modes select their own victory rules without rewriting base combat. Expansions may add naval maps, weather, new factions, commanders, or larger battles after their counters and compatibility rules are defined.

Map packs and cosmetic content can fund development. Ranked rules must keep combat options equally available to all players; there are no paid stat boosts, build-time skips, or exclusive stronger units.

<!-- page -->

# 14 / Release acceptance and open production work

### Functional gates
- Every faction can start, build a viable economy, reach each tier, field every listed role, defend each target layer, lose key buildings, rebuild, and win by standard rules.
- Simultaneous attacks do not break selection, targeting, transport, capture, queues, fog, or victory detection. A unit never acquires information from an enemy hidden by fog.
- Aircraft handle full airfields, destroyed service slots, forced returns, rearm queues, and reconnects. Missiles obey warning, damage, interception, and friendly-fire rules.
- All 24 missions have complete objectives, checkpoints, win/loss states, briefing, debrief, difficulty tuning, and no progression blockers. Tutorials use the actual controls.
- Multiplayer validates all orders, keeps clients synchronized, restores reconnecting players, handles surrender and team elimination, and produces a usable replay.
- Save/load cannot create extra credits, units, salvage, research, or mission rewards. Corrupted local data produces a recoverable error rather than silently erasing progress.

### Balance gates
Test all six cross-faction matchups plus four mirror matchups on every ranked map, separated by player skill and starting side. Evaluate win rates with sample size and uncertainty, not a few developer matches. An initial investigation band is 45-55% win rate for sufficiently sampled, skill-adjusted matchups; it is a signal to investigate, not proof of balance.

Review time to first contact, income lost to harassment, percentage of games using every combat layer, average unit survival, supply-field exhaustion, strategic strike damage, comeback frequency, and match length. Check whether one opening or one unit composition wins across every map. Compare equal-credit armies and normal supply constraints, not just one expensive unit against one cheap unit.

Missile pressure must permit reactions, air investment must pay off without bypassing defenses, defensive structures must buy time without ending map interaction, and concealment must reward scouting instead of requiring guesses. Observer data should identify what players could actually see when they made decisions.

### Polish gates
Run complete matches on current stable desktop Chrome, Edge, Firefox, and Safari using the recorded reference hardware. Check UI scaling, browser zoom, focus loss, sound permissions, reconnect, low-memory behavior, and background-tab recovery. Browsers and hardware are a validation matrix, not an untested compatibility claim.

Verify readable selection and enemy recognition at ordinary zoom. Every important event has a visual cue and, where appropriate, an audio cue with captions. Menus, loading, failed joins, full lobbies, invalid maps, unavailable saves, and defeated states receive designed screens rather than raw errors.

### What still requires production
This document settles the product direction and initial system rules. It is not final balance data, finished art, scripted missions, a completed map set, or working multiplayer. Production must author those assets, implement the rules, playtest the numbers, and meet the acceptance gates before the product can be called complete.

### Reference and authorship
The genre reference is EA's official "How to play the Command & Conquer Remastered Collection" guide, which describes construction, credits, resource harvesting, and unit production. The faction mechanics, names, figures, modes, and rules in this document are original design proposals and are not extracted balance data from Command & Conquer.

Reference: https://help.ea.com/en/articles/command-and-conquer/command-and-conquer-remastered/how-to-play/

Prepared 27 September 2026. Working title and numerical tuning remain revisable as playtesting supplies evidence.

<!-- page -->

# 15 / Campaign mission concepts
## United States and Iran

The four campaigns tell separate fictional operations in invented regions. Objectives involve military sites, supply convoys, and battlefield infrastructure. Every mission has authored briefings and debriefings, optional objectives, a restartable checkpoint, and three difficulty presets. These are mission concepts to guide level production, not completed levels.

### United States / Operation Clear Horizon
| Mission | Main objective | Distinct challenge |
|---|---|---|
| 1. First foothold | Establish a base and reconnect two isolated squads | Limited power forces an early construction choice |
| 2. Open corridor | Escort three supply vehicles across a valley | Two routes trade speed for cover; convoy can pause |
| 3. Relay ridge | Capture two relay sites and hold one for four minutes | Recon reveals alternate ramps and artillery positions |
| 4. Broken umbrella | Defend a forward airfield for twelve minutes | Repair, interception, and aircraft servicing compete for power |
| 5. Split front | Disable three command relays in any order | Each relay removes a different enemy production advantage |
| 6. Clear horizon | Eliminate two enemy production bases | Allied reinforcements depend on protecting a central supply route |

### Iran / Operation Iron Signal
| Mission | Main objective | Distinct challenge |
|---|---|---|
| 1. Forward signal | Build a defended observation and supply base | Place visible sensor beacons to maintain firing information |
| 2. Moving shield | Escort two launch vehicles to a new depot | Vehicles must alternate between moving and defending |
| 3. Beyond the basin | Secure two supply fields before the starting field empties | Drones spot several possible expansion routes |
| 4. Hold the network | Keep two of three radar stations alive for twelve minutes | Power sites are separated; defense must remain mobile |
| 5. Interference | Disable three fortified military outposts | Limited initial ammunition rewards careful observation |
| 6. Iron signal | Break a layered defense and destroy its command base | Combine ground pressure, air reconnaissance, and timed strikes |

### Mission rules shared by all campaigns
Primary objectives show exact progress and failure conditions. Time limits begin only after the briefing and initial player interaction. Optional objectives grant in-mission resources or story information, never permanent ranked advantages. Scripted incoming forces are warned and enter from defined routes. Saving during an event restores its exact state instead of spawning it again.

Each mission needs a distinct terrain layout, opening army, objective sequence, and difficulty budget. Faction campaigns teach their own strengths while repeatedly requiring the shared counter system. Later missions can introduce new combinations without introducing unexplained rules.

<!-- page -->

# 16 / Campaign mission concepts
## Syrian Rebels and Saudi Arabia

### Syrian Rebels / Operation Open Road
| Mission | Main objective | Distinct challenge |
|---|---|---|
| 1. Workshop foothold | Recover a rig and establish a supply workshop | Small squads must use cover while heavy support is unavailable |
| 2. Supply trail | Escort four supply trucks to a safe forward depot | Detours create tradeoffs between protection and travel time |
| 3. Three crossings | Capture two expansion sites from a three-route map | Cheap mobile forces must hold ground until defenses finish |
| 4. Hold the workshop | Defend the factory and one supply center for twelve minutes | Repair and salvage sustain an initially limited armored force |
| 5. Relay break | Capture three military communications buildings | Visible engineer channels require protection and timing |
| 6. Open road | Defeat two bases blocking the final supply route | Aircraft and missiles support an infantry-led combined army |

### Saudi Arabia / Operation Desert Shieldline
| Mission | Main objective | Distinct challenge |
|---|---|---|
| 1. Arrival point | Establish a supply base and complete an airfield | Ground forces must secure the site before aircraft arrive |
| 2. Air corridor | Escort a ground convoy through two defended sectors | Aircraft sortie timing matters because rearm capacity is limited |
| 3. Distant wells | Secure two separated supply depots | Mobile service vehicles reduce travel back to the main base |
| 4. Shieldline | Defend two airfields and an interception node | Damaged aircraft must change service slots as buildings are hit |
| 5. Three positions | Capture three military relay positions | Air superiority helps, but infantry must hold each objective |
| 6. Desert shieldline | Eliminate an enemy command complex and its forward base | Repeated sorties, ground control, and protected logistics all matter |

### Tutorial sequence
1. **Give an order:** select, move, attack, stop, use a control group, and follow a rally point.
2. **Keep the base working:** build, gather, spend, resolve low power, repair, and replace a hauler.
3. **Choose a counter:** use infantry, armor, cover, scouting, transport, and attack-move in small encounters.
4. **Read the warning:** rearm aircraft, defend with AA, evacuate an impact marker, and intercept a missile.
5. **Command the whole match:** win a short standard-rules battle with reminders that can be disabled.

### Cooperative scenarios
**Convoy Union:** two players establish separate economies and escort three shared convoys. One route has multiple branches; checkpoints become forward repair positions. Both players can issue convoy advance/hold requests, with a visible shared vote when they disagree.

**Twin Outposts:** two players defend separated headquarters, reconnect a central supply corridor, then defeat two AI bases. Early waves teach mutual support; the final phase uses standard base-elimination rules. Both scenarios support solo play with an AI ally, shared checkpoints, and multiplayer reconnect.

<!-- page -->

# 17 / Launch map catalogue

Competitive maps use the normal resource rules from section 01. Each player has one 36,000-credit starting field and one nearby 24,000-credit expansion field. Two further 24,000-credit fields are contested. Two capturable supply stations sit away from the starting bases. Decorative supply props never suggest collectible resources where none exist.

| Map / format | Shape and identity | Main strategic choice |
|---|---|---|
| Copper Junction / 1v1 | 128 x 128; two corner bases, open center, two wide side routes | Fast center pressure or a safer side expansion |
| Relay Heights / 1v1 | 128 x 128; central plateau, two ramps per side, low ground flanks | Gain sight from elevation or bypass it with mobile forces |
| Dry River / 1v1 | 128 x 128; shallow impassable channel with three permanent crossings | Concentrate at one crossing or threaten several routes |
| Industrial Valley / 2v2, FFA | 160 x 160; four perimeter starts, central depot district | Hold defensible structures while keeping supply routes open |
| Border Depots / 2v2, FFA | 160 x 160; four starts, two broad corridors, connected side lanes | Share a team front or control independent expansions |
| Port Outskirts / 2v2, FFA | 160 x 160; coastal boundary, warehouse cover, inland ring road | Use covered infantry routes or open vehicle lanes |
| Convoy Union / co-op | 160 x 160; two starting depots and a branching convoy road | Divide escort work while keeping both economies alive |
| Twin Outposts / co-op | 160 x 160; separated allied starts and a shared central corridor | Reconnect allies before committing to the final attack |

### Map validation before release
All legal starts must reach their own supply field, expansion, every required objective, and at least one route to every enemy base. Evaluate travel time separately for infantry and vehicles. Airfields need adequate free approach space for their visual flight paths even though aircraft ignore ground obstacles.

Measure buildable area, resource distance, cover availability, height advantage, and attack distance for each spawn. Test both fixed teams and every supported free-for-all spawn arrangement. A map may support custom FFA while requiring further balance review before ranked rotation.

Run each map at maximum unit count with simultaneous movement through its narrowest legal corridor. Building placement must keep mandatory routes open. Expansion sites need room for a supply center, a power station, and a defending army; otherwise the advertised expansion is not functionally usable.

### Editor essentials
The editor includes undo/redo, grid snapping, terrain painting, height and ramp tools, resource placement, spawn/team markers, neutral objects, objective regions, trigger inspection, and a playable test mode. Validation identifies disconnected terrain, unequal starting resources, missing win conditions, inaccessible capture objects, or invalid building footprints.

Saved maps contain a thumbnail, title, author credit, version, supported player counts, dimensions, ruleset requirement, and checksum. Importing a map validates its data and never executes arbitrary imported code. User scenarios use a bounded trigger library such as area entered, unit destroyed, timer elapsed, objective updated, and reinforcement wave started.

### Future additions
Additional maps should introduce one understandable terrain or objective idea at a time. New factions, naval combat, weather, and commander systems require complete counters and AI support. Existing standard matches and their map pool remain playable when expansion content is added.
