# Frontline Command

## Complete game design specification · Version 2.0

**Format:** desktop-browser real-time strategy. **Reference experience:** classic Command & Conquer base construction, resource collection, army production, responsive orders, and readable combined-arms battles. **Modes:** campaign, solo skirmish, co-op, ranked 1v1, unranked teams, free-for-all, and custom scenarios.

**The design direction is firm: US air superiority; Iranian drones and missiles; Syrian Rebels guerrilla warfare; Saudi armored formations, interception, and logistics.** Each army has distinctive actions, infrastructure, costs, and weaknesses. They share understandable rules without needing equivalent aircraft, equivalent superweapons, or identical rosters.

This document supersedes the v1 Markdown and PDF. The v1 percentage bonuses, identical strategic barrages, and Saudi air-specialist identity are retired. This is the authoritative design proposal; it is not a claim that the game has been implemented or its matchups proven balanced. Values marked as tuning inputs must pass the tests in section 25 before release. Factions, equipment, locations, conflicts, and abilities are fictionalized gameplay representations. The Syrian Rebels faction is an invented coalition with original insignia and leaders.

## Contents

1. [Product, scope, and player experience](#1-product-scope-and-player-experience)
2. [Match lifecycle and victory](#2-match-lifecycle-and-victory)
3. [Resources and economic decisions](#3-resources-and-economic-decisions)
4. [Construction, power, and technology](#4-construction-power-and-technology)
5. [Controls, movement, and orders](#5-controls-movement-and-orders)
6. [Combat, weapons, and visibility](#6-combat-weapons-and-visibility)
7. [Aircraft and drone operations](#7-aircraft-and-drone-operations)
8. [Missiles and interception](#8-missiles-and-interception)
9. [Faction design contract](#9-faction-design-contract)
10. [United States](#10-united-states--air-superiority)
11. [Iran](#11-iran--drones-and-missiles)
12. [Syrian Rebels](#12-syrian-rebels--guerrilla-warfare)
13. [Saudi Arabia](#13-saudi-arabia--armored-defense-and-logistics)
14. [Command abilities and strategic operations](#14-command-abilities-and-strategic-operations)
15. [Research, veterancy, and progression](#15-research-veterancy-and-progression)
16. [Healing, repair, transport, and capture](#16-healing-repair-transport-and-capture)
17. [Terrain, maps, and editor](#17-terrain-maps-and-editor)
18. [Modes, onboarding, and player journey](#18-modes-onboarding-and-player-journey)
19. [Campaign and co-op content](#19-campaign-and-co-op-content)
20. [AI behavior](#20-ai-behavior)
21. [Multiplayer and competitive integrity](#21-multiplayer-and-competitive-integrity)
22. [Interface and accessibility](#22-interface-and-accessibility)
23. [Art, animation, sound, and voice](#23-art-animation-sound-and-voice)
24. [Browser architecture and content pipeline](#24-browser-architecture-and-content-pipeline)
25. [Balance model, checks, and playtests](#25-balance-model-checks-and-playtests)
26. [Completion criteria and production gates](#26-completion-criteria-and-production-gates)
27. [Expansion, live operation, and business model](#27-expansion-live-operation-and-business-model)
28. [Decisions, assumptions, and reference](#28-decisions-assumptions-and-reference)

---

## 1. Product, scope, and player experience

### 1.1 The promise

The player sees a substantial battlefield, builds an operating base, protects resource vehicles, scouts the opponent, chooses a composition, and wins through decisions made across the whole map. Tanks feel heavy, aircraft commit to visible runs, infantry use cover, and a missile warning gives the defender a meaningful action. Units carry out orders reliably, with immediate visual and audio acknowledgment.

The core loop is **collect → build → scout → choose counters → attack → preserve survivors → expand**. Each loop creates competing expenditures: another factory versus more units, an airfield versus missile defense, a forward base versus safety at home. No faction can solve every problem by repeatedly producing its signature unit.

### 1.2 Complete base-release scope

| Included at release | Deliberately reserved for expansion |
|---|---|
| Four fully playable asymmetrical factions | Additional factions and commanders |
| Ground, air, drone, artillery, missile, and interception layers | Naval warfare and naval maps |
| Economy, power, construction, research, repair, capture, veterancy | Weather that changes combat rules |
| Five tutorials; four six-mission campaigns; two co-op scenarios | Further campaign chapters |
| Three 1v1 maps; three four-player maps; two co-op maps | Additional map themes and player counts |
| Solo AI, co-op, ranked 1v1, 2v2, FFA, custom lobbies | Ranked team ladders after population supports them |
| Complete menus, accessibility, sound, saves, reconnect, replays, observers, map editor | Phone-specific controls and interface |

The absence of expansion features does not make the base release a demo. Every advertised base mode, faction, map, and system must be complete and tested. Do not advertise a planned feature as available.

### 1.3 Targets

- Standard 1v1: 20–35 minutes; team matches: 25–45 minutes. These are distribution targets, not guaranteed durations.
- First scouting information: 45–90 seconds. First meaningful ground contact: roughly 2–4 minutes on standard maps.
- First combat aircraft: roughly 3–5 minutes when deliberately prioritized; corresponding ground AA is available earlier.
- Tier 3 pressure: roughly 7–11 minutes. Timing includes spending choices and income, not simply adding build timers.
- Learning curve: a new player can win the final tutorial without memorizing the armor table. Advanced players gain value from timing, positioning, and scouting.
- Desktop mouse and keyboard first, usable at 1280 × 720. UI scaling and input remapping are requirements.

## 2. Match lifecycle and victory

### 2.1 Before and after combat

**Menu → mode selection → map/faction/rules → loading → five-second readiness countdown → match → debrief → replay/rematch/menu.** The game preloads required faction and map assets before the readiness countdown. A slow client cannot be attacked while still loading.

The debrief identifies the result, objectives, economy timeline, production, casualties, repairs, map control, and important events. Match statistics never imply that kills alone determine good play. A campaign objective, escort, or recovery can matter more.

### 2.2 Standard elimination

Qualifying assets are completed headquarters, barracks, vehicle factories, faction air producers, and living construction rigs. A player with none enters a visible 30-second defeat countdown. Capturing or completing a qualifying asset cancels it. Foundations, outposts, safehouses, temporary units, and strategic sites do not qualify.

A player loses on countdown expiry or surrender. Remaining assets become inactive wrecks: no allied ownership transfer, loot, production, sight, or experience reward. A team wins after every opponent is eliminated. Same-tick elimination of all remaining opposing players is a draw, resolved from the same simulation snapshot. Surviving mobile armies alone do not prolong a lost economy indefinitely.

### 2.3 Recovery and surrender

A player who loses their headquarters may produce an emergency rig at an owned factory for 1,200 credits / 30 seconds. It uses the normal rig limit and is the only exception to HQ rig production. A rig can construct a replacement headquarters outside an existing build radius on visible legal terrain. Neither requires a surviving HQ. This closes the recovery dead end in the earlier design.

Individual surrender eliminates only that player; team surrender requires every active teammate's agreement. Solo pause is unrestricted. Ranked has no tactical pause; unranked co-op/custom lobbies may enable a shared pause. Browser focus loss does not pause an online match.

### 2.4 Avoiding stalemates

Finite supplies, artillery, and contested replenishment encourage movement. From minute 35, completed qualifying enemy structures are indicated on the minimap for five seconds every 90 seconds; this is an announced endgame rule and does not reveal units or provide firing vision. It applies equally to all factions. No passive hidden-building victory strategy should outlast the actual battle.

The server safety limit is 90 minutes. If neither side has won, record a draw with no rating change; this is an infrastructure limit, not a score-based alternative victory. Track repeated intentional timeouts for review. Custom scenarios may declare explicit objective-based win conditions before loading.

## 3. Resources and economic decisions

### 3.1 Shared economy

All factions start with one HQ, one rig, 6,000 credits, zero Command Energy, and 40 power capacity. They have the same fundamental extraction rate and field quantities. Faction combat identity does not include invisible income multipliers.

There is one spendable currency: **credits**. **Power** supports buildings. **Army Supply** limits army size. **Command Energy** pays for support abilities. These are distinct UI values; none is ambiguously called “command points.”

| Resource rule | Initial specification |
|---|---|
| Starting field | 36,000 credits per player |
| Nearby expansion | 24,000 credits per player |
| Contested fields | Two fields of 24,000 on each competitive map |
| Hauler capacity | 600 credits |
| Field extraction | One loading bay, 40 credits/second; 15 seconds for a full load |
| Delivery | Three seconds per vehicle; supply center has two unload positions |
| Reference travel | Twelve seconds for the complete round trip, excluding loading/delivery |
| Reference cycle | 30 seconds; one hauler averages 1,200 credits/minute |
| Reference saturation | Two staggered haulers average 2,400/minute; the loading bay prevents unlimited scaling |
| Supply stations | Two per standard map; each pays its owner 120 credits/minute |
| Limits | Eight haulers per player; no finite credit-bank capacity |

Extra haulers help long routes or replace losses but cannot exceed a field's extraction capacity. The UI shows actual recent income, queue congestion, and remaining field value. The resource numbers describe the reference layout; do not promise that all travel distances produce the same income.

### 3.2 Gathering behavior

Haulers automatically choose an owned supply center, a field, a loading queue, and a return route. Players can pin either endpoint. On depletion they search for another known field; on danger they keep the assigned order until manually changed or an enabled “retreat when attacked” preference triggers. A retreating hauler returns to the closest reachable owned supply center, keeps its cargo, and alerts the player.

Supply removed from a field enters the hauler's cargo; credits enter the bank only after delivery. Destroyed cargo is lost, not credited to either side. The interface distinguishes carried resources from spendable funds. Neutral supply stations transfer only future income when captured.

### 3.3 Replenishment

When all collectible fields are empty, start a globally visible 180-second timer. On expiry, add one 6,000-credit field at the marked central shipment site. A new timer can start only after that shipment is exhausted. No hidden faction catch-up income is used. The shipment site must have multiple ground approaches and must not overlap occupied buildings.

### 3.4 Costs, refunds, and queues

Pay when an order begins; waiting orders reserve neither money nor Supply. Each producer has one active job and five waiting slots. At completion, active units already hold their reserved Supply and service capacity, preventing simultaneous queues from exceeding caps.

Canceling an active job refunds `0.75 × purchase price × remaining progress fraction`. Waiting orders cancel freely. Destroying the producer loses the active investment; queued unpaid orders disappear. Selling a completed building returns `0.5 × eligible building value × health fraction`, after a visible five-second channel interrupted by incoming damage or capture. Selling an aircraft producer warns about affected aircraft.

The supply center's included hauler accounts for 900 of its 1,800-credit price and is excluded from building resale. Eligible building value is capped at the lower of its original paid building-only investment and its current type's catalog value; conversion or capture never increases that investment basis. No free hauler is created by capture, rebuilding a save, ownership changes, or selling and buying an upgrade. Duplicate event processing cannot duplicate units or credits.

### 3.5 Economic fairness

No paid advantages, permanent combat unlocks, kill-based global income, free defensive repairs, or faction income bonuses exist in standard matches. Syrian salvage is a small, bounded recovery mechanic defined in section 12. Research, repairs, missile ammunition, extra production capacity, and expanding all compete for the same credits.

## 4. Construction, power, and technology

### 4.1 Building placement and progress

A rig travels to a visible legal footprint and remains there while constructing. Other rigs cannot accelerate the same job. Construction starts at 10% maximum HP and increases maximum usable HP with progress; existing damage is preserved rather than erased by growth. A destroyed or displaced builder pauses the foundation. Another owned rig can resume it.

Normal placement requires a position within 14 tiles of an owned HQ or outpost. **Supply centers do not extend build radius**, closing cheap creeping-base chains. A rig may establish an outpost outside the radius for 1,000 credits / 30 seconds and remains available afterward. HQ replacement is the explicit exception in section 2.

Placement cannot overlap units, terrain, foundations, objectives, or reserved paths. The path validator preserves every map-designated mandatory corridor. No construction inside unexplored or currently unseen territory. Entering combat during construction does not automatically cancel the order.

### 4.2 Building catalog

Power values with `+` generate capacity; other values are demand. Times assume sufficient power. HP values are full-build values. Footprints are tiles; clearance lanes are part of the footprint where needed.

| Building | Credits / seconds | HP | Footprint | Power | Prerequisite / purpose |
|---|---:|---:|---|---:|---|
| Headquarters | 3500 / 70 | 4500 | 4×4 | +40 | Rig; strategic control, rigs, abilities |
| Power station | 500 / 15 | 1500 | 2×2 | +100 | HQ; power generation |
| Supply center | 1800 / 35 | 2500 | 4×3 | 20 | Power station; one included hauler, extra hauler production |
| Barracks | 600 / 15 | 1500 | 3×2 | 10 | Power station; infantry |
| Vehicle factory | 1800 / 45 | 2500 | 4×4 | 25 | Supply center + barracks; ground vehicles |
| Radar center | 1400 / 35 | 1500 | 3×2 | 20 | Supply center + barracks; Tier 2 |
| Technology center | 2500 / 60 | 2000 | 3×3 | 35 | Radar + factory; Tier 3 |
| Repair depot | 1000 / 25 | 1500 | 3×3 | 15 | Factory; repair, no unit production |
| Outpost | 1000 / 30 | 1200 | 2×2 | 0 | Rig; forward build radius |
| Guard bunker | 400 / 15 | 1200 | 2×2 | 0 | Barracks; two squads, no built-in weapon |
| Gun turret | 650 / 20 | 1000 | 2×2 | 10 | Factory; `TURRET` weapon |
| Air-defense post | 800 / 20 | 1000 | 2×2 | 15 | Barracks; `AA_POST` weapon |
| Interceptor battery | 1800 / 40 | 1500 | 3×2 | 30 | Radar; intercepts tactical/strategic missiles |
| Strategic operations site | 4500 / 90 | 3000 | 4×4 | 80 | Technology center; limit one; faction operation |
| US airfield | 2200 / 45 | 2500 | 6×5 | 35 | Radar; six service slots |
| Iranian drone hub | 1500 / 35 | 2200 | 4×4 | 30 | Radar; six drone service slots |
| Syrian air workshop | 1000 / 30 | 1800 | 3×3 | 15 | Radar; two scout-drone slots |
| Saudi airfield | 2000 / 50 | 2500 | 6×5 | 30 | Radar; four service slots |
| Syrian safehouse | 800 / 25 | 900 | 2×2 | 0 | Radar; network transit; maximum three |

Faction production buildings are alternatives, not extra universal unlocks. Base structures have original faction art but use the shared values unless this table explicitly differs. Limit ordinary structures to 60 per player, of which no more than 16 are weapon defenses; outposts, bunkers, safehouses, and strategic sites count toward the 60. Foundations reserve their future slot. These caps are visible.

### 4.3 Power behavior

At or above demand, buildings operate normally. Below demand, construction, production, research, and aircraft rearming run at half speed; weapon-defense intervals and missile-charge regeneration times double; strategic charging stops. Command Energy regenerates at half speed. Units retain their normal combat and movement performance.

Players can disable buildings; disabled buildings draw no power and perform no functions. A disabled air producer keeps its assigned capacity but cannot service or produce aircraft. The basic minimap, ownership outlines, missile warnings, and all accessibility alerts remain available. Zero demand counts as sufficient power.

### 4.4 Tech rules

Tier 1 comes from initial prerequisites. One completed active radar grants Tier 2. One completed active technology center plus active radar grants Tier 3. “Active” means manually enabled and not temporarily disabled; low power slows functions but does not remove tiers.

Losing a required structure pauses affected active jobs at their current progress and blocks new ones; it does not delete investments or already completed units/upgrades. Restoring the prerequisite resumes the work. Research benefits persist after its research building is lost. A captured producer uses the new owner's roster and tech access, never the previous owner's faction abilities.

## 5. Controls, movement, and orders

### 5.1 Input contract

| Input | Default action |
|---|---|
| Left-click / drag | Select / box-select |
| Shift-select | Add or remove members |
| Double-click | Select same type on screen |
| Right-click | Contextual move, attack, repair, capture, board, or unload |
| A then click | Attack-move |
| Ctrl + ground-click | Force-fire with a supported ground-area weapon |
| S / H / G | Stop / hold position / guard unit or position |
| Ctrl + 1–9 / 1–9 | Store / recall control group; double-tap centers camera |
| Shift + order | Queue up to ten waypoints/orders |
| Space | Center the latest actionable alert without changing selection |
| Middle-drag / arrows | Pan camera; edge scrolling optional |
| Mouse wheel | Zoom within readability limits |

All keys are remappable; a classic left-click command preset is included. Text-entry focus disables battlefield shortcuts. Escape cancels targeting before opening the pause menu. Ability buttons show range, legal targets, cost, warning, cooldown, and the exact failure reason.

### 5.2 Reliable unit behavior

**Move:** go to the destination; do not chase. **Attack target:** engage the chosen legal visible target; on losing sight, go only to its last known position and enter Guard. **Attack-move:** fight valid enemies along the route, then continue. **Guard:** engage within six tiles of the assigned anchor, then return. **Hold:** never move automatically. **Aggressive:** chase visible enemies up to twelve tiles from the anchor.

Explicit orders override automatic target choice. Otherwise prioritize an enemy attacking the protected ally/self, then a target the unit can damage effectively, then nearest legal target. Keep the target while it remains valid. Support units do not run toward enemies to perform an impossible attack. Ground-only units ignore aircraft for attack-move stopping decisions.

Tank, scout-car, APC, and hovering gunship weapons may fire while moving. Infantry, ground AA, artillery, anti-armor crews, and raider buggies stop to fire. Fixed-wing aircraft use flight passes. Artillery and launchers obey minimum range. An escort guards the ally's location, not its original starting point.

### 5.3 Pathfinding and formations

Local avoidance prevents permanent unit overlap. Infantry squads use one gameplay footprint and cosmetic individual models. At a choke, units form a queue rather than repeatedly changing lanes. Group movement preserves loose formation on open ground and reforms after a choke without waiting for distant units.

A unit that makes no meaningful progress for two seconds requests another route. After two failed attempts it displays a blocked-order marker and alerts once; the intended destination remains visible. Haulers and builders retain task reservations during short reroutes and release them after confirmed failure. Unreachable enemies do not induce infinite pursuit.

### 5.4 Responsiveness targets

Selection, targeting previews, sounds, and command markers appear within 100 ms on the reference machine. They are acknowledgment, not premature confirmation of a purchase or hit. Server-rejected orders receive an explicit reason and revert predicted presentation. Actual movement and combat remain authoritative; network delay is never concealed by inventing damage.

## 6. Combat, weapons, and visibility

### 6.1 Consistent units and damage

Ranges and movement use fictional tiles and seconds, not real-world weapon specifications. Measure distance between collision-footprint edges. Fixed tick resolution is 0.05 seconds. Use fixed-point damage and resource arithmetic to avoid platform-specific floating-point drift.

`Damage = projectile damage × target-armor multiplier × cover × ability modifiers × research/veterancy.`

Illegal target layers cannot be attacked. The matrix below governs ordinary weapons. Tactical and strategic attacks use their own explicit values. Direct armor is not directional; unit facing and turret turn are visible movement/aiming behavior, not a hidden armor multiplier.

| Weapon class | Infantry | Light vehicle | Heavy vehicle | Structure | Air |
|---|---:|---:|---:|---:|---:|
| Small arms | 1.00 | 0.35 | 0.10 | 0.10 | Illegal |
| Autocannon | 1.00 | 1.00 | 0.35 | 0.30 | Illegal |
| Tank cannon | 0.35 | 1.00 | 1.00 | 0.70 | Illegal |
| Anti-armor | Illegal | 1.00 | 1.40 | 0.70 | Illegal |
| Artillery shell | 1.00 | 0.80 | 0.45 | 1.00 | Illegal |
| Anti-air | Illegal | Illegal | Illegal | Illegal | 1.00 |
| Air-to-ground | 0.65 | 1.00 | 1.00 | 1.00 | Illegal |

Ground infantry squads share one HP pool. Models lost as HP falls are cosmetic; damage output is unchanged until destruction. Circular gameplay footprint radii are 0.35 tiles for infantry squads, 0.6 for light vehicles, 0.8 for heavy vehicles, and 0.6 for aircraft. Flying units ignore ground collision and use local separation from other aircraft. Buildings use their declared rectangular footprints. No random critical hits or hidden accuracy percentages exist in standard play.

### 6.2 Weapon catalog

`Unlimited` means no consumable magazine, not unlimited fire rate. Aircraft ammunition is per sortie. Tactical intervals are charge-regeneration times. All class names in this catalog correspond to the matrix or the special tactical rules in section 8.

{{WEAPON_TABLE}}

Iranian rocket artillery fires four 40-damage shells at 0.4-second spacing; the next volley starts six seconds after the prior volley began. Standard artillery blast radius is two tiles; Syrian mortar and Iranian rocket-shell radius is 1.5. Full damage applies within 0.5 tiles and falls linearly to zero at the outer edge. Ordinary air-to-ground weapons and tank cannons deal single-target damage in the base release; do not silently add splash to them.

### 6.3 Projectile and targeting rules

Small arms resolve as direct hits after the firing animation's 0.15-second windup. Cannon and ordinary guided missiles have a 0.3-second windup. Ordinary projectiles travel at 12 tiles/second; artillery shells take two seconds from launch to impact at the chosen ground point. These timings are readable game abstractions. Turning is limited to 180 degrees/second for vehicles and immediate squad orientation for infantry.

Projectiles already fired are not erased when the shooter dies. Direct projectiles can finish tracking a target after it enters fog on the server; hidden trajectories, damage floaters, enemy HP, and target locations are not sent without vision. A legitimate kill may still award the shooter's own experience, but does not reveal the victim's live position or identity. Lost targets are never acquired again through an order merely because an unseen projectile remains active.

Artillery and missiles target a ground point and do not follow a moving unit. All armed units need current allied vision to issue a direct target order; indirect fire requires supplied sight of its ground target. Force-fire may target explored ground with suitable artillery/cannon weapons, but provides no hidden hit or occupancy information. Strategic attacks always require current vision unless their section explicitly says otherwise.

### 6.4 Cover, friendly fire, and limits

Infantry in designated cover take 25% less small-arms/autocannon damage. Cover does not reduce artillery, tactical strikes, or air-to-ground damage. Shell, tactical, and strategic blast damage affects friendlies at 50%; ordinary direct fire has no friendly fire. A friendly explosion reveals concealed units it damages.

Apply only the strongest instance of the same buff or debuff. Different damage-reduction categories multiply, but total ability-based damage reduction is capped at 30%; cover is then applied separately where legal. Healing never stacks from several sources. Rate bonuses multiply, with production and rearming never faster than 50% of the original base time. Cooldown resets, ammunition refills, and max-HP changes occur only when explicitly stated.

### 6.5 Fog and detection

Standard ground sight is nine tiles; ground recon sight is eleven with a seven-tile concealment-detection radius. Combat aircraft sight is eleven. Survey/scout drones have sight twelve and detection six. Terrain height grants two extra sight tiles, not extra damage. Cliffs and designated sight blockers limit ground vision; aircraft see over them within their radius.

Unexplored terrain is dark. Explored but unseen terrain shows scenery and last-seen building silhouettes with timestamps. Enemy mobile units vanish when sight is lost. A radar center does not reveal the whole map. Allies share sight and pings, not construction rights or control of one another's units. Stealth detection reveals a concealed enemy only while the detecting source and its sight remain valid.

## 7. Aircraft and drone operations

### 7.1 Air roles stay distinct

Interceptors attack air only. Strike aircraft perform ground passes and automatically return when empty. Gunships/loiter drones hover and can support a ground army until their magazine is empty. Scout aircraft are unarmed. Transport helicopters carry two infantry squads and cannot fire. Syrian Rebels have no manned fighter, attack jet, or gunship in the base roster; portable AA, mobile AA, concealment, and dispersal are their air-response tools.

### 7.2 Capacity and servicing

Each aircraft reserves one owned service slot before production starts. US airfields provide six slots; Iranian hubs six; Saudi airfields four; Syrian workshops two. A new slot is not a free plane or a global air-Supply bonus. Other players cannot use it. Every air producer still has one production queue.

Baseline rearm times: interceptor 20 seconds, strike aircraft 24, gunship/loiter 24, unarmed scout/transport 18. US rearming is 20% faster; other factions use baseline unless researched. Iranian economy advantages are already in drone purchase prices, not a further automatic rearm discount. Rearming is free; damage repair is paid and follows section 16. Occupied service slots work independently.

All aircraft have a 120-second airborne endurance timer. On reaching 30 seconds remaining, they return automatically unless a manual return already exists. Landing resets endurance only after completing its applicable service time. A transport first unloads on legal ground within five tiles; if none exists, it returns with passengers and unloads at its base. The warning appears 15 seconds before automatic return; a unit is lost at zero if it cannot land. There is no unsafe “ignore return forever” stance.

Rearming and paid repair occur in parallel after landing. A player may depart once rearming/service finishes without waiting for full HP. By default a serviced aircraft waits at base; a queued Patrol, Escort, or Return sequence may resume. Repeating ground attack runs requires an explicit queued order or enabled repeat-sortie toggle, never an invisible automatic commitment to another dangerous pass.

### 7.3 Producer loss and emergency landing

If an air producer is destroyed or captured, its aircraft become unassigned and request free owned compatible slots. Losing a hub never deletes flying drones instantly. An unassigned aircraft's remaining endurance is limited to at most 60 seconds, and the player sees its emergency countdown. New construction cannot reserve a slot already claimed by a returning aircraft. Low power slows service, not the endurance timer; risky power management has a visible consequence.

Aircraft on the ground can be targeted by ground weapons using light armor at their existing HP. Their airfield being hit does not automatically duplicate splash onto every aircraft; only actual overlapping blast footprints do so. Grounded aircraft take two seconds to lift off after producer loss, retaining HP, ammunition, and remaining endurance, subject to the same maximum 60-second emergency timer. Endurance is paused while landed, and refills only when servicing completes. This makes attacks on air infrastructure useful without unavoidable instant fleet wipes.

### 7.4 Information and counterplay

Flight paths, attack intent, missile trails, ammunition, return state, and reserved home slot are readable. No ordinary combat aircraft is permanently invisible. Interceptors, mobile AA, and static AA can all respond. Electronic or decoy effects never remove the defender's missile-impact warnings or essential interface.

## 8. Missiles and interception

### 8.1 Tactical launchers

Launchers require Tier 3 and current allied vision at launch. Their ammunition is a limited magazine that recharges while the unit is alive; there is no money-free firing. A new launcher begins with one charge. Iranian launchers can store a second after 60 seconds. Other launchers store one. Charge regeneration continues while moving, stops while disabled, and is unaffected by base power.

| Launcher family | Range | Stored charges | Recharge | Credit cost per shot | Maximum structure / vehicle / infantry damage |
|---|---|---:|---:|---:|---|
| US / Saudi standard | 10–36 | 1 | 80 s | 400 | 500 / 350 / 150 |
| Iranian missile | 10–44 | 2 | 60 s per charge | 300 | 350 / 245 / 105 |
| Syrian heavy rocket | 8–28 | 1 | 65 s | 300 | 400 / 280 / 120 |

All take four stationary seconds to set up and three to pack. Setup is canceled by movement; packing prevents firing. A launch reveals the firing unit's position for six seconds. The defender receives an eight-second minimum impact warning, a marked area, and a voice/caption alert. Blast radius is two tiles, full within 0.5 and linearly falling to zero. Aircraft are unaffected. Destroying the launcher after launch does not remove its projectile.

Iranian **Volley Order** fires two stored missiles 1.5 seconds apart at two selected points within four tiles of one another, paying 600 credits. The second missile has its own eight-second warning, so the second impact occurs 1.5 seconds later. Both points are committed before the first launch; both need vision at that moment. Movement before the second shot cancels that unfired shot without spending its charge or 300 credits. This is a burst advantage, not a permanent doubled rate of fire.

### 8.2 Interceptor batteries

Fixed batteries cover a 14-tile radius, hold two charges, and regenerate one charge every 24 normally powered seconds. New batteries begin empty. They fire no faster than once per second. One charge destroys one interceptable tactical or strategic projectile. No percentage chance or hidden accuracy roll is involved.

A battery can engage a hostile projectile whose predicted impact point is inside its radius once impact is three seconds away. It never spends charges on friendly projectiles. It selects earliest impact and reserves the projectile across allied defenses to prevent duplicate fire. If the battery is destroyed before firing, release the reservation. Once fired, the intercept completes after 0.5 seconds even if the battery then dies. A projectile outside protected impact coverage cannot be intercepted merely because its visual arc crosses the circle.

Low power doubles charge-regeneration and firing intervals. Disabling a battery freezes charge regeneration and prevents fire. Selling, capturing, or rebuilding never refills charges: capture retains the actual remaining count; a newly constructed battery starts empty. Display coverage, ready charges, next-charge time, and assignments to the owner.

### 8.3 Saudi mobile interception

An Aegis carrier must deploy for three seconds, then covers ten tiles. It stores one charge and regenerates it every 30 deployed seconds; it begins empty. Undeploying takes two seconds and stops regeneration but preserves a stored charge. It is unarmed against troops and aircraft. Base power does not affect a deployed carrier; its cost, smaller coverage, low capacity, and vulnerability pay for that independence.

### 8.4 Separate counter layers

Ordinary AA attacks planes and drones. Missile interception attacks only explicitly interceptable tactical/strategic projectiles. It does not erase bullets, artillery shells, tank shots, bombs, or ordinary anti-armor missiles. Missile defenses cannot be a universal shield. Moving away from an impact marker, dispersing, attacking a launcher's support, or denying launch vision remain valid responses even without an interceptor.

## 9. Faction design contract

| Faction | Main advantage | How the player expresses it | What the player pays | What the opponent can exploit |
|---|---|---|---|---|
| United States | Air superiority and flexible sorties | Scout, escort, strike, recall, rearm, airlift | Expensive aircraft and airfields; service/endurance limits | Ground AA, airfield pressure, multiple simultaneous fronts |
| Iran | Drone information and missile saturation | Maintain drone sight, bank missile charges, time volleys | Fragile drones, launch costs, exposed setup, weaker direct armor | Interceptors, depleted sight coverage, mobile ground pressure |
| Syrian Rebels | Guerrilla mobility and information denial | Conceal in cover, stage ambushes, transfer squads, sabotage | Fragile units, restricted aviation, vulnerable safehouse exits | Recon, splash, guarded production, denial of safehouses |
| Saudi Arabia | Armored staying power and mobile defense | Advance in formations, deploy interceptors, retreat to repair | Higher vehicle prices, paid repairs, setup and formation commitments | Artillery, flanks, repair-truck focus, forcing repeated redeployment |

Every faction has early scouting, early infantry counters, early anti-vehicle tools, early air defense, repair, transport, capture, siege, and a late-game closing option. These tools need not be the same unit. No faction receives “wins against faction X” bonuses. Identity comes from actions and constraints rather than real-world strength rankings.

Roster tables are the numeric source of truth. They contain complete purchase values, not modifiers to another table. `Move` is tiles/second. Supply is army-cap usage, not currency. Producer `workshop_air` means the Syrian air workshop; `drone_hub` is Iranian only. Role IDs are stable content identifiers; names and art may change without changing saved games.

### 9.1 Two opening plans per faction

These are intended strategic branches to test, not verified optimal build orders. All begin with power and a supply center; a second hauler improves the reference field's throughput. Scout before deciding which branch to commit to.

| Faction | Opening A | Opening B | Required pivot |
|---|---|---|---|
| US | Barracks/recon → radar → airfield → escorted first sortie | Barracks → factory → mixed ground force → later airfield | Buy early ground AA if the opponent reaches air first; do not assume aircraft can capture objectives |
| Iran | Observers → radar → drone hub → survey/strike mix | Factory screen → radar → rocket artillery → drones for sight | Add AA before committing to stationary siege; postpone launchers when ground defense is inadequate |
| Syrian Rebels | Rifle/technical pressure with scouts and portable AA | Mixed infantry → radar → forward safehouse pair and mortar support | Add anti-armor against tanks; abandon an observed unsafe exit rather than repeatedly transferring into it |
| Saudi Arabia | Mechanized rifle/APC force → tank and Service vehicle | Scouted defensive opening → radar → mobile interception when missiles become likely | Expand after surviving pressure; a large stationary army at home cannot contest every field |

The US air-opening skeleton of power, supply center, second hauler, barracks, Pathfinder, radar, airfield, and one strike jet costs 9,550 credits. It therefore needs 3,550 earned beyond starting funds, before optional defenses or escorts. This exposes the real economic commitment instead of treating a short aircraft build timer as its full arrival time. All other openings need the same accounting in measured tests.

## 10. United States — air superiority

**Player fantasy:** command a smaller, valuable air wing that changes where the next fight occurs. Ground troops claim territory and protect its operating bases; aircraft enable that army instead of replacing it.

### 10.1 Roster

{{US_ROSTER}}

### 10.2 Distinct mechanics

- **Air operations infrastructure:** six service slots per airfield and 20% faster baseline rearming. Building cost is higher than ordinary air infrastructure, and there is still only one production queue per airfield.
- **Fighter escort:** Falcon Guard orders follow a selected friendly aircraft group and attack air threats within six tiles of it; they never chase across the map automatically. Their superior range and servicing support sustained air control, not immunity to AA.
- **Target designation:** a Pathfinder channels for one second on a currently visible enemy vehicle/structure within seven tiles. For eight seconds, US aircraft need 0.15 seconds rather than 0.3 to finish attack windup against that target. No bonus damage, range, or fog tracking. Mark has a visible icon and a 30-second cooldown; the Pathfinder cannot shoot during the channel.
- **Airlift:** a transport helicopter boards up to two infantry squads in three stationary seconds, then unloads them in three seconds on visible legal ground. Passengers keep their Supply reservation. Transport destruction uses the passenger-loss rule in section 16; it is not a safe teleport.

### 10.3 Research

| Upgrade | Cost / time / tier | Effect | Limitation |
|---|---|---|---|
| Defensive countermeasures | 1200 / 45 s / T2 | Combat aircraft may activate **Decoy**, negating the next ordinary AA projectile within three seconds | 45 s unit cooldown; requires a completed rearm before first use; does not stop cannon fire, strategic interception, or multiple missiles |
| Airfield service crews | 1600 / 60 s / T3 | Paid aircraft repair rate rises from 40 to 55 HP/s | No additional rearm discount, no free HP, no extra service capacity |

### 10.4 Playing and opposing the faction

The player should win air engagements through escort and servicing, then use that freedom to help a ground objective. **Recon Sweep** and **Rapid Sortie** support this rhythm; **Skybreaker Wing** provides a late-game aircraft operation. All are defined in section 14.

The opponent can reveal a greedy air opening, build early AA, attack an airfield's approach from several directions, or force the air wing to protect distant areas at the same time. Ground AA must remain efficient enough to defend before the opponent can afford fighters. US tank costs intentionally do not provide a second best-in-class armored faction.

## 11. Iran — drones and missiles

**Player fantasy:** build a visible intelligence-and-fire-support network, pressure several areas with expendable-cost drones, and force the opponent to manage finite interception capacity.

### 11.1 Roster

{{IR_ROSTER}}

### 11.2 Distinct mechanics

- **Drone wing:** all Iranian air units are unmanned game units with their own HP, Supply, endurance, and service slot. Their low price is balanced by low durability and smaller magazines/payloads. A squad of decorative sub-drones never counts as several hidden targeting entities.
- **Survey:** a Survey drone can orbit a selected point, supplying twelve-tile sight and six-tile detection. It has no weapon and cannot capture or mark missile targets through fog. Enemy fighters and ground AA can remove the vision source.
- **Buffered missile magazines:** launchers can bank two charges and use Volley Order. A prepared volley may exceed a battery's ready charges, but costs ammunition and creates multiple impact warnings. Recharging from empty to full takes two 60-second intervals.
- **Forward beacon:** an observer channels for four seconds to place a 200-credit, 100-HP sensor with sight five for 45 seconds. One per observer, maximum three per player. It has no detection, build radius, gun, income, or concealment. Replacing it destroys the previous beacon without a refund.

### 11.3 Research

| Upgrade | Cost / time / tier | Effect | Limitation |
|---|---|---|---|
| Distributed drone servicing | 1000 / 45 s / T2 | Drone rearm/service times ×0.85 | Does not increase endurance, HP, or damage; rate floor still applies |
| Mobile launcher crews | 1600 / 60 s / T3 | Launcher setup becomes three seconds and pack-up two | No change to recharge, shot price, range, or warning |

### 11.4 Playing and opposing the faction

Iran uses Survey drones and observers to earn targeting information, then chooses between cheap air pressure, artillery, and a banked missile volley. **Relay Boost** and **Drone Recall** help manage this network; **Saturation Salvo** is its strategic operation.

Its weaknesses are exposed support units, fragile air units, launch expenditure, and a direct-fight tank that is less durable than its peers. Opponents can remove sight, force relocation before setup finishes, attack between stored volleys, or combine fixed/mobile interception with ordinary AA. Missile saturation cannot be stopped by ordinary aircraft AA, but it also cannot bypass the need to earn ground vision.

## 12. Syrian Rebels — guerrilla warfare

**Player fantasy:** fight through information, cover, local surprise, and fast repositioning. This fictional coalition wins by making the opponent guard too many places, not by receiving invisible damage or an equal air force under different names.

### 12.1 Roster

{{SY_ROSTER}}

Portable AA and raider buggies are ground units with their own identifiers and production rules. Only the unarmed Scout drone uses the Syrian air workshop and service slots. Ground interception and concealment replace a mirrored manned-air roster.

### 12.2 Concealment and ambush

Mobile rifle squads, Local scouts, and Veteran raiders conceal after four stationary seconds in marked cover, provided they have neither fired nor taken damage for six seconds. Concealment does not apply in open ground, while boarding, during transit preparation, or while capturing. Any enemy within three tiles, ground recon within seven, or a detecting scout drone within six reveals them.

The first rifle-class shot after at least six continuous concealed seconds receives +20% damage. This **Ambush** bonus has a 30-second cooldown and applies to one shot only, not a full magazine, missiles, abilities, or allies. Firing reveals the squad immediately, and it cannot conceal again until the conditions are met anew. A visible ambush-ready indicator teaches the owning player when the bonus exists.

### 12.3 Safehouse network

Build up to three safehouses at Tier 2. They remain visible ordinary buildings when scouted; they cannot be disguised as neutral civilian structures. Each holds two infantry squads, has 900 HP, grants no build radius, and has no intrinsic weapon. Infantry can garrison and fire normally when not transferring.

Select up to two infantry squads inside a source and choose another owned completed safehouse. A six-second preparation bar runs while the squads physically remain in the source, cannot fire, and occupy its capacity. The destination receives a visible exit marker during the final three seconds for players who can see that area. On completion the squads emerge on legal adjacent ground.

Transfer requires both houses out of combat for five seconds, a destination in current allied vision, and available exit space. Any damage to either house cancels preparation; squads remain in the source. Destroying the source triggers ordinary garrison escape rules. Destroying the destination cancels the transfer. One transfer may be active per player. No vehicles, missiles, aircraft, temporary squads, or allied units can transfer. Exiting squads cannot fire or capture for two seconds.

This is an abstract game transport mechanic with defined endpoints and counters. It does not model a real tunnel network or real-world movement routes.

### 12.4 Sabotage and salvage

Veteran raiders use the shared elite disable ability, with a five-second channel instead of six. The result remains ten seconds of production disable and a 60-second cooldown. Taking damage interrupts it. Headquarters, strategic sites, and neutral objectives cannot be disabled by this ability.

Enemy non-temporary combat ground vehicles leave one salvage crate worth 8% of their actual original purchase price, capped at 120 credits. Only a Syrian mechanic or salvage truck can collect it, with a two-second channel. A crate expires after 45 seconds, can be collected once, and yields nothing from friendly kills, sold vehicles, temporary units, or aircraft. Per-player collection is capped at 400 credits per rolling minute and 3,000 per match; excess crates remain collectible for zero credits with an explicit capped label. No chance roll is involved.

### 12.5 Research and limits

| Upgrade | Cost / time / tier | Effect | Limitation |
|---|---|---|---|
| Prepared exits | 1000 / 45 s / T2 | Safehouse preparation falls from six to five seconds | Three-second warning and two-second exit firing lock remain |
| Field restoration | 1400 / 60 s / T3 | Salvage-truck paid repair rate rises from 30 to 40 HP/s | Same price per restored HP; no in-combat repair exception |

**Rapid Transfer** and **Disperse** emphasize repositioning. **Coordinated Raid** is a telegraphed ground-reinforcement operation. Their armor is deliberately weaker in direct battles; the refitted tank is a support option, not a cheap dominant tank. Portable AA is available in Tier 1, so restricted aviation never means helplessness against the US.

## 13. Saudi Arabia — armored defense and logistics

**Player fantasy:** move a protected formation, establish temporary defensive coverage, absorb a manageable attack, and preserve expensive ground vehicles through paid servicing. This faction owns the armored-logistics identity; the US owns the air-specialist identity.

### 13.1 Roster

{{SA_ROSTER}}

### 13.2 Distinct mechanics

- **Guardian hull-down:** after three stationary seconds, activate a stance that reduces incoming direct small-arms, autocannon, tank-cannon, and anti-armor damage by 15%. The tank cannot move while active and needs two seconds to leave the stance. Artillery, aircraft weapons, and tactical/strategic blast ignore this reduction. The stance does not add range, fire rate, or turning restrictions beyond normal aim rules.
- **Aegis carrier:** mobile tactical-missile protection with a one-charge magazine and deployment rules from section 8. It cannot double as ordinary AA or a troop transport.
- **Service deployment:** a Service vehicle can deploy for three seconds and repair two nearby out-of-combat vehicles at 20 HP/s each, instead of one at 30. Both consume credits normally. Undeploying takes two seconds. Focused healing still cannot stack with other repair sources.
- **Armored transport:** the stronger APC preserves mechanized infantry at a higher purchase cost. It does not make passengers invulnerable or remove Supply use.

### 13.3 Research

| Upgrade | Cost / time / tier | Effect | Limitation |
|---|---|---|---|
| Mobile service crews | 1100 / 45 s / T2 | Service deployment/pack times fall to two/one seconds | No free repair or change to in-combat restrictions |
| Integrated interception | 1700 / 60 s / T3 | Aegis recharge decreases from 30 to 25 deployed seconds | Magazine remains one; deployment still required; does not affect fixed batteries |

### 13.4 Playing and opposing the faction

**Emergency Power** supports a stressed base; **Recovery Order** improves paid servicing during a retreat. **Shieldline Protocol** protects a temporary fighting position. Saudi aircraft remain competent baseline support, without US rearm, escort, or airlift advantages.

The opponent can force repeated setup, pressure separate expansions, use artillery against hull-down tanks, or remove the repair and interception vehicles first. This army is strongest when it holds a useful position and weakest when it must constantly relocate. Launchers and artillery provide siege so a defensive strategic ability never prevents it from ending a match.

## 14. Command abilities and strategic operations

### 14.1 Shared resource and casting rules

Command Energy starts at zero, caps at 100, and regenerates at 0.5/second while at least one active HQ exists, halved under low power. Extra headquarters do not increase it. Kills, payment, and territory ownership do not grant Energy. It is retained on HQ loss but cannot be spent until an HQ is active again. Every ability below requires Tier 2; strategic operations instead use their own site and charge.

Unit-local abilities use the stated cooldown rather than Command Energy. Support effects never refill ammunition unless explicitly stated. A cast validates ownership, current legality, Energy, and cooldown together on the server. Failure before acceptance spends nothing. After a valid cast begins, its cost and cooldown remain spent if its target is destroyed or the opponent interrupts it. One unit receives only the strongest identical support effect. Unless a specific rule overrides it, a channeled ability stops on movement, damage, or loss of target legality; instant abilities have no channel. Forward beacons cost 200 on accepted placement, with no refund if interrupted. Boarding, ordinary repair, construction, and deployment follow their own section's interruption rules rather than this ability-channel default.

### 14.2 Faction command abilities

| Faction / ability | Energy / cooldown | Effect | Warning and counter |
|---|---|---|---|
| US: Recon Sweep | 35 / 100 s | After two seconds, reveal a radius-nine area of previously explored terrain for eight seconds | Sweep circle visible to opponents in that area; no concealment detection |
| US: Rapid Sortie | 50 / 120 s | One owned airfield rearms 1.5× as fast for 15 seconds | Visible service effect; no ammo instant-fill, repair bonus, or endurance reset |
| Iran: Relay Boost | 35 / 100 s | One owned Survey drone gains +3 sight radius for ten seconds | Drone displays an obvious relay effect; can still be shot down; detection radius unchanged |
| Iran: Drone Recall | 45 / 120 s | Up to four selected drones gain +20% speed for eight seconds and receive Return orders | They cannot fire during the effect; no invulnerability, teleport, or fuel reset |
| Syrian Rebels: Rapid Transfer | 40 / 120 s | The next legal safehouse transfer started within ten seconds prepares in three seconds | Exit is visibly marked for all three seconds; damage cancels; no stacking with Prepared exits |
| Syrian Rebels: Disperse | 45 / 120 s | Owned infantry within radius six move 20% faster for eight seconds | Each squad loses the effect when it fires, captures, boards, or channels sabotage |
| Saudi Arabia: Emergency Power | 45 / 120 s | One owned HQ supplies +80 temporary power for 20 seconds | HQ effect and countdown visible; ends if that HQ is disabled/destroyed |
| Saudi Arabia: Recovery Order | 50 / 120 s | Owned repair sources within radius eight work 1.5× as fast for twelve seconds | Still paid, out-of-combat only, and subject to non-stacking rules |

Enemy-warning requirements do not reveal unrelated fogged units or HQ positions. Scan/transfer graphics show only the affected area. All tooltips state these limitations.

### 14.3 Strategic site rules

One strategic site per player, Tier 3, 4,500 credits, 90-second build, and 80 power demand. It begins empty. All players see the faction, charge progress, readiness, and destruction announcement, but the site's exact position still requires scouting. Normal power and the owner's active Tier 3 are required to charge and activate; interrupted charge pauses rather than restarting. Destroying or capturing prerequisites does not retroactively cancel projectiles already launched.

Activation spends credits and consumes the full charge. A new charge begins immediately but pauses during insufficient power or missing prerequisites. No kill-based acceleration or cash recharge. Strategic operations do not use Command Energy. Their effect strengths must be tested separately; equal cooldowns do not imply equal power.

### 14.4 Four different operations

| Operation | Charge / activation cost | Exact effect | Defensive response |
|---|---|---|---|
| US: Skybreaker Wing | 180 s / 1200 | Three temporary strike aircraft, 550 HP each; one bomb each, max 400 structure / 300 vehicle / 120 infantry; blast radius two | Ordinary AA and interceptors attack the planes; move from marked impacts; ABM cannot intercept bombs |
| Iran: Saturation Salvo | 210 s / 1500 | Six interceptable missiles in two groups of three; each max 220 structure / 154 vehicle / 66 infantry; blast radius two | Missile interception, movement, dispersion; ordinary AA cannot intercept the missiles |
| Syrian Rebels: Coordinated Raid | 210 s / 1200 | Up to three owned safehouses each deploy one temporary rifle squad and one temporary anti-armor crew; 12 Supply total if all three activate | Twelve-second warning at exits; destroy or pressure the safehouses; use detection, infantry counters, or splash |
| Saudi Arabia: Shieldline Protocol | 180 s / 1000 | One radius-ten zone for 25 seconds: owned ground vehicles take 20% less ordinary air-to-ground damage; owned missile defenses regenerate charges at 2× rate | Leave the zone, pressure another front, use ground artillery, destroy the anchor, or exhaust magazines faster than they refill |

All strikes use full damage inside 0.5 tiles with linear falloff to zero at radius two. Strategic damage is not modified by weapon research, veterancy, designation, or Ambush. Friendly blast damage is 50%. A full-health HQ survives the maximum damage from either direct-damage operation.

**Skybreaker detail:** the player chooses a map edge and three currently visible impact points within a four-tile cluster. The UI previews the route and impact ETA. Aircraft enter from that edge and travel at six tiles/second. If flight would take less than twelve seconds, entry waits outside the map until the twelve-second warning can be honored. Otherwise flight time is the warning time. The marked targets stay fixed. Surviving aircraft exit without becoming controllable units. No army Supply is used; they cannot scout outside their visible path or capture. Each destroyed support plane awards a fixed 200 experience-value budget, split by damage, and no salvage.

**Saturation detail:** select three visible impact points in a four-tile cluster; each receives two missiles. First impacts occur after fourteen seconds, second impacts three seconds later. All six markers and timings appear at activation. Interception is per projectile. Destroying the site after the activation has launched the operation does not cancel it. The attack has a larger interception demand but longer charge, higher credit cost, and low individual warhead damage.

**Raid detail:** selected houses must be complete for at least 20 seconds, currently visible to their owner, and have legal exits. Acceptance reserves four Supply per selected house; insufficient Supply disables that selection. Each house has a twelve-second visible deployment bar. Any damage cancels that house's deployment with no credit refund and releases its reserved Supply. Destroying it does the same. Surviving houses deploy their pair into marked exits. Squads use the Syrian roster's base stats and do not inherit upgrades/veterancy. They last 45 seconds from deployment, use their reserved Supply, cannot capture, board, use safehouse transit, earn veterancy, be healed, or drop salvage. They visibly withdraw and disappear on expiry. Normal rifle concealment and one-shot Ambush may apply. Defeating them grants no experience. No permanent free army remains after the operation.

**Shieldline detail:** choose one visible owned HQ, outpost, or deployed Aegis carrier as anchor. A twelve-second preparation ring is visible before activation; the anchor must remain stationary during preparation and the effect. A move/pack order cancels the operation rather than being ignored. Destroying, disabling, or undeploying the anchor also ends it without refund. The zone does not grant immediate charges, protect infantry/buildings, stop bombs outright, heal anything, or increase ordinary weapon damage. Only missile-defense regeneration is accelerated; firing cooldown and magazine capacities remain unchanged. The maximum air-damage reduction from all ability categories is still 30%.

## 15. Research, veterancy, and progression

### 15.1 Shared research

| Upgrade | Producer / tier | Cost / time | Effect |
|---|---|---|---|
| Vehicle armor | Technology center / T3 | 1200 / 45 s | +10% max HP to ground vehicles, including rigs/haulers; no buildings, infantry, or aircraft |
| Weapons training | Radar center / T2 | 1500 / 60 s | +10% ordinary weapon damage; no tactical/strategic damage, healing, or repair |

Each research building has one research queue, separate from unit producers. Buying a faction upgrade requires its listed tier; faction upgrades are researched at radar for T2 or technology center for T3. Only one instance may be purchased. Upgrades apply to eligible existing and future owned units. HP increases preserve current health percentage, so upgrade completion does not act as a full heal.

### 15.2 Veterancy

Ordinary permanent combat units gain experience only from enemy combat units, not structures, friendly damage, cargo loss, or temporary raid squads. Destroyed enemy value equals actual purchase price and is distributed among contributing attackers in proportion to actual HP damage. Healed damage is excluded from repeat rewards by capping attributed damage at the victim's maximum HP over its lifetime.

Veteran threshold: 1.5× the receiving unit's purchase price; elite threshold: 3×. Veteran grants +5% ordinary damage; elite replaces that with +10% damage and +10% max HP. There is no elite self-heal or speed bonus. Utility units remain unranked. Research and veterancy multiply; health preserves its percentage. Trading units among allies is unsupported, removing XP/ownership loopholes.

### 15.3 Player progression outside matches

All ranked combat options and factions are available from the start. Campaign unlocks are mission access, story records, cosmetic badges, and practice challenges. Account levels do not change unit stats, Command Energy, starting credits, matchmaking rules, or resource rates. Faction mastery tracks useful actions such as scouting, preserving units, interception, and objectives without pressuring players to sabotage matches for achievements.

## 16. Healing, repair, transport, and capture

### 16.1 Healing and repair

A unit is out of combat after three seconds without dealing or receiving damage. Medics restore 12 infantry HP/s, free, only out of combat. Repair trucks restore 30 vehicle HP/s; depots 50; air servicing 40; engineers restore structure HP at 25. All mechanical repair costs one credit per ten restored HP. No mechanical repair occurs while its recipient is in combat. Repair sources cannot heal themselves; medics cannot heal one another indefinitely during combat.

Only the strongest current source applies to one target. Structures use the same out-of-combat condition; new incoming damage suspends repair immediately. Automated repair respects a user-set credit reserve. If a tick costs more credits than available, apply only affordable repair rather than negative money. Repairs, medical healing, and temporary buffs cannot exceed max HP.

### 16.2 Boarding, garrison, and transport destruction

Ground APCs carry three infantry squads and need two stationary seconds to load or unload. Syrian troop technicals carry two and need one second; US transport helicopters carry two and need three. Boarding is canceled if the transport moves or either participant dies; taking damage alone does not cancel it or create an invulnerable animation. Passengers cannot shoot, heal, repair, capture, or generate vision while inside a vehicle.

Bunkers and designated map garrisons hold two squads; occupants fire from the structure at their normal range and share its sight. The building takes incoming fire until it is destroyed. On destruction of a ground transport or garrison, passengers emerge with 50% of their prior HP at valid exits within two tiles. If no exit exists, they are lost. Destruction of an airborne transport kills its passengers; no invented parachutes. A landed transport follows ground-transport escape rules.

### 16.3 Capture and sabotage

Engineers can capture enemy ordinary structures below 25% HP after eight uninterrupted seconds at an entrance. Moving, damage to the engineer, loss of vision, or repairing the building above 25% cancels progress. Both players see the channel. HQs and strategic sites cannot be captured. Neutral supply stations use six seconds with no HP requirement.

Capture preserves health percentage, disables the old active/waiting queues without refund, transfers future income only, and creates no free units. A captured faction air producer converts to the new owner's air-producer type over ten seconds, cannot operate during conversion, and drops previous aircraft assignments. Its new HP preserves percentage; slots become the new type's capacity. A captured safehouse becomes an ordinary unarmed outpost after ten seconds; it retains no transit network. Captured research buildings do not transfer completed research.

An ordinary commando can disable one visible enemy barracks, factory, air producer, radar, or tech center for ten seconds by channeling for six seconds within one tile, with a 60-second cooldown. Taking damage or moving interrupts it and starts a ten-second failed-attempt cooldown; a successful channel starts the full cooldown. Syrian Veteran raiders need five seconds. A sabotaged building cannot be re-targeted while disabled or for 30 seconds after recovery; show this temporary resistance. Buildings display the disable icon and remaining duration. Ordinary units cannot be captured or stolen in the base release.

### 16.4 Caps and ownership

Army Supply cap is 100 per player, with a separate limit of four rigs, eight haulers, and one living or reserved commando. Temporary raid units use Supply; temporary strategic strike planes do not and are not controllable. Aircraft also need owned service slots. Capturing a structure does not grant control of its existing units. Captured structures may take the owner above a structure/defense cap, but block additional construction in that category until below the cap; capture does not create another world entity. Allies cannot donate credits or units in ranked/team standard rules; this avoids concentrated economic funneling that would invalidate 1v1 cost balance.

<!-- REMAINING_SECTIONS -->
