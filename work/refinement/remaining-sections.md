## 17. Terrain, maps, and editor

### 17.1 Terrain rules

Open ground uses normal movement. Marked rubble/forest-edge ground provides infantry cover and slows vehicles to 80% speed. Terrain reductions do not stack. Cliffs and deep water block ground movement; ramps are readable. Competitive bridges cannot be permanently destroyed. Height changes sight as specified in section 6 and never grant an undisclosed damage bonus.

Garrisonable military/abandoned structures show a two-squad capacity. Decorations that cannot be entered look different. Destructible props use named HP classes and known blocking behavior; destruction changes pathfinding once, with deterministic debris footprints. No randomly collapsing building can eliminate a required route. Permanent civilian populations and civilian-targeting objectives are outside this design.

### 17.2 Competitive map standards

Standard 1v1 maps are 128×128 tiles; four-player maps 160×160. Starts receive equal resource quantities and comparable loading distances, buildable land, cover, and approach times. Equal opportunity does not require identical scenery. Each starting economy has two attack approaches; each central region has at least one usable flank. No base can be completely secured by one chokepoint turret.

| Balance-sensitive feature | Required review |
|---|---|
| Wide open fields | Must not let fast air/armor ignore every defensive route |
| Dense cover | Must have navigable gaps and recon access; no permanent Syrian invisibility corridors |
| Highlands | Must not provide one-sided launch vision or unanswerable artillery |
| Air approach | Comparable shortest edge-to-base distances; space for interception before impact |
| Missile range | No starting-position launcher may cover every expansion without moving |
| Supply loading distance | Measured actual income parity across spawn sides, target within 5% before contest |
| Safehouse sites | Several useful forward positions, but none fully protected from ground access |
| Mobile defense sites | Useful deployment areas that do not seal every alternate path |

### 17.3 Launch maps

| Map | Players / mode | Layout | Strategic question |
|---|---|---|---|
| Copper Junction | 2 / 1v1 | Open central junction, two wide side routes | Commit to central pressure or protect a flank expansion? |
| Relay Heights | 2 / 1v1 | Central plateau, two ramps per side, lower flanks | Buy sight with ground control or bypass the plateau? |
| Dry River | 2 / 1v1 | Three permanent crossings with separate approaches | Concentrate force or threaten several crossings? |
| Industrial Valley | 4 / 2v2, FFA | Four perimeter bases, central warehouse district | Occupy cover while preserving supply routes? |
| Border Depots | 4 / 2v2, FFA | Broad paired lanes plus cross-map connectors | Share a front or operate independent expansions? |
| Port Outskirts | 4 / 2v2, FFA | Coastal boundary, inland ring route, abandoned warehouses | Use covered infantry paths or the fast vehicle road? |
| Convoy Union | 2 humans + AI / co-op | Two allied depots and a branching convoy route | Balance escort duties with separate economies? |
| Twin Outposts | 2 humans + AI / co-op | Separated starts and a contested central connection | Reconnect before attempting the final assault? |

The six competitive maps follow the resource quantities in section 3. Cooperative maps use authored objective/resource budgets, visibly identified as scenario rules. Campaign missions have their own authored layouts and are additional content, not a claim that eight skirmish maps contain 24 finished missions.

### 17.4 Editor and user content

Provide terrain/height/ramp painting, resource placement, spawn/team markers, objects, objective regions, undo/redo, grid snapping, sight/path previews, and instant test play. A map record contains title, author, format version, ruleset ID, dimensions, player counts, screenshot, checksum, and required content packs.

Scenario logic uses a bounded trigger library: timer elapsed, region entered, entity destroyed, resource threshold reached, objective completed, and reinforcement event. Imported files cannot execute arbitrary code. Validate sizes, entity counts, recursion, trigger frequency, asset references, ownership, victory conditions, and reachable objectives. Report actionable validation errors before a lobby can launch.

Private/custom maps are supported at release. Public sharing requires upload validation, reports, removal tools, moderation, and ownership attribution. User maps never enter ranked rotation automatically. Competitive review includes both spawn fairness and all six faction matchups.

## 18. Modes, onboarding, and player journey

### 18.1 First session

On first launch, show language, interface scale, sound consent, and the choice to start the tutorial or explore modes. No account is needed for local tutorial, campaign, or skirmish. A returning player sees Continue, Play, Campaign, Replays, Editor, Settings, and Help. Loading identifies remaining assets and offers recoverable errors rather than an indefinite spinner.

The first tutorial teaches a few actions at a time, then removes reminders as the player succeeds. Tooltips state role and counter before numerical details. A practice range allows free unit placement and resetting a scenario; it is clearly separated from ranked balance statistics.

### 18.2 Mode matrix

| Mode | Players | Rules / persistence |
|---|---|---|
| Tutorial | 1 | Five lessons, checkpoints, optional hints |
| Campaign | 1 | Four six-mission campaigns, three difficulties, manual/autosave |
| Skirmish | 1 vs AI, or AI teams up to four total players | Same combat rules; configurable maps, factions, difficulty, speed |
| Scenario co-op | 2 humans or 1 human + AI ally | Two authored scenarios, shared objectives and saves at checkpoints |
| Co-op skirmish | 2 humans vs 2 AI | Standard rules, no ranked rating |
| Ranked | 1v1 | Fixed rules, reviewed maps, account required |
| Unranked | 1v1 or 2v2 | Standard match presets, rematch, reconnect |
| Free-for-all | 3–4 humans/AI | Individual elimination, fixed teams unavailable |
| Custom lobby | 1–4 active participants | Declared settings, private codes, observers, user maps |
| Practice / editor test | 1 | Debug-like player tools, no competitive rewards |

Ranked is standard speed, 6,000 starting credits, 100 Supply, fog on, all strategic operations on, reviewed map version, and no in-match rule changes. Random faction resolves before loading and is shown to opponents. Map veto choices happen before final ready-up. All nonstandard settings are visible to every lobby participant and recorded in the replay.

### 18.3 Accounts and saves

Local progress uses versioned storage with manual export/import and a visible backup action. An account enables ranked play, friends, and optional synchronized progression. Sync conflicts show both timestamps and mission progress; do not silently overwrite a newer local save. Guest-to-account migration previews what will be copied.

Solo has manual saves, three rotating autosaves, mission restart, and 0.75×/1×/1.5× speed. Save the full simulation at a tick boundary: resources, health, fog, commands, queued production, reservations, ammo, cooldowns, buffs, projectiles, AI knowledge, objectives, and random state. Resuming never re-executes already consumed rewards or reinforcements. Online match saves are server-owned; clients cannot load a personal older state into a live match.

### 18.4 Tutorials

1. **Give an order:** select, move, attack, stop, control groups, rally points, and blocked-order feedback.
2. **Operate a base:** gather, protect a hauler, build, resolve low power, use production, repair, and replace a lost HQ through an emergency rig.
3. **Read the counter:** compare rifles, anti-armor, cars, tanks, cover, detection, and transport.
4. **Defend the sky:** aircraft service, ground AA versus fighters, tactical missiles versus ABM, and moving out of a marked area.
5. **Command a match:** win a short standard-rules battle; briefly practice the chosen faction's defining ability and see a debrief/replay.

Tutorial completion does not gate multiplayer. Before a first ranked match, show a short warning that online play continues while the tab is unfocused, along with recommended network quality and the surrender/reconnect rules.

## 19. Campaign and co-op content

### 19.1 Narrative and mission contract

Four fictional operations occur in invented regions, with original leaders and military organizations. Each campaign teaches its faction through different objectives and terrain, not merely swapped unit colors. Briefings explain the objective, failure conditions, available technology, allied roles, and any special rules. The player never needs external political knowledge to understand a mission.

Every mission has an opening checkpoint, at least one mid-mission checkpoint, explicit victory/failure triggers, an optional objective, briefing/debriefing, subtitle coverage, and a tested restart path. Difficulty changes enemy budgets, composition, and event timing; it does not invisibly change the player's unit rules. Scenario-only exceptions appear in the briefing and the objective panel.

### 19.2 United States — Operation Clear Horizon

| Mission | Main objective | Faction lesson / optional objective |
|---|---|---|
| 1. First Foothold | Establish supply and reconnect two isolated Ranger squads | Ground fundamentals; recover an intact engineering rig |
| 2. Open Corridor | Escort three supply vehicles across a branching valley | Coordinate infantry and early aircraft; preserve all three trucks |
| 3. Relay Ridge | Capture two relays and hold one for four minutes | Use Pathfinders and recon before committing aircraft; avoid losing a scout |
| 4. Broken Umbrella | Preserve one of two airfields through twelve minutes of pressure | Rearm, reserve slots, and respond to airfield loss; evacuate a damaged wing |
| 5. Split Front | Disable three military command relays in any order | Airlift infantry to support ground fronts; complete without losing a transport |
| 6. Clear Horizon | Eliminate two production bases while keeping a supply corridor open | Escort and synchronize ground/air attacks; defeat a strategic site before launch |

### 19.3 Iran — Operation Iron Signal

| Mission | Main objective | Faction lesson / optional objective |
|---|---|---|
| 1. Forward Signal | Establish an observation and supply base | Observer positioning; keep the initial recon team alive |
| 2. Eyes Above | Escort two launch vehicles to a depot | Drone sight and recall; recover every starting drone |
| 3. Beyond the Basin | Secure two fields before the starting field empties | Resource expansion supported by fragile scouts; capture both supply stations |
| 4. Hold the Network | Keep two of three drone/radar sites operational for twelve minutes | Preserve service capacity and use mixed defenses; avoid emergency drone losses |
| 5. The Second Volley | Disable three military outposts | Bank charges and identify limited interception; spend below a visible missile budget |
| 6. Iron Signal | Break a layered defense and destroy its command base | Combine ground screening, drone information, artillery, and missiles; preserve an observer network |

### 19.4 Syrian Rebels — Operation Open Road

| Mission | Main objective | Faction lesson / optional objective |
|---|---|---|
| 1. Workshop Foothold | Recover a rig and establish a workshop base | Cover and small-squad control; recover two separated mechanic teams |
| 2. Supply Trail | Escort four trucks through branching routes | Technical mobility and screening; collect limited marked salvage |
| 3. Three Crossings | Hold two of three expansion approaches | Concealment, recon counters, and local surprise; keep a scout concealed until its mark |
| 4. Open Doors | Keep two safehouses and a factory operational | Safehouse preparation, detection, and contested exits; complete a threatened evacuation |
| 5. Relay Break | Capture three military communication buildings | Interruptible sabotage and engineer protection; capture rather than destroy one factory |
| 6. Open Road | Defeat two bases blocking a supply route | Multiple ground threats with mortar/rocket support; win without a lost temporary-raid deployment |

### 19.5 Saudi Arabia — Operation Shieldline

| Mission | Main objective | Faction lesson / optional objective |
|---|---|---|
| 1. Arrival Point | Build a supply base and secure a mechanized assembly area | Ground formation fundamentals; preserve both starting APCs |
| 2. Moving Shield | Escort a convoy through two contested sectors | Cover movement with AA and paid recovery; finish within a repair budget |
| 3. Distant Depots | Secure two separated supply positions | Split protection without abandoning the main force; hold both stations simultaneously |
| 4. Intercept Window | Defend two outposts and one fixed battery | Mobile Aegis deployment and charge management; intercept a marked wave without a building loss |
| 5. Three Positions | Capture three relays under artillery pressure | Hull-down is useful but cannot solve indirect fire; keep a Service vehicle alive |
| 6. Shieldline | Defeat a command complex and a forward base | Advance, establish coverage, repair, and relocate; maintain two connected supply routes |

### 19.6 Cooperative scenarios

**Convoy Union:** two allied economies escort three sequential convoys across a branching map. Only one convoy is active at a time. Each player can request Advance/Hold; either can Hold, while both must approve Advance after a manual hold. An on-screen countdown prevents unnoticed route changes. Completed checkpoints unlock forward repair positions, not unrestricted free units.

**Twin Outposts:** players begin separated, keep at least one HQ alive each, reopen a central supply corridor, and defeat two AI bases. Reinforcement waves announce their entry areas and timing. The final assault uses standard faction counters. The scenario has checkpoints after reconnecting and before the final assault, and can pair a solo player with an AI ally.

## 20. AI behavior

### 20.1 Fair information

Skirmish AI uses the same fog, resources, queues, cap, prerequisites, target legality, aircraft endurance, and cooldowns as humans. It maintains a knowledge record of observed enemies, timestamps, estimated production, and uncertain last-seen structures. It never reads unseen player builds or the human's queued orders.

Campaign scripts may spawn authored reinforcements only from declared events with player-facing warnings. They are a scenario budget, not proof that the ordinary AI can create free units. Waves reserve Supply and wait when the receiving army is full unless the briefing explicitly declares a scenario cap override. Replay/debug tools identify the event and its trigger.

### 20.2 Decision layers

| Layer | Responsibility |
|---|---|
| Economy | Assign haulers, prevent queue jams, reserve repair money, expand before depletion |
| Strategic | Choose a goal from observed information: scout, defend, expand, pressure, or finish |
| Composition | Buy counters to observed spending, with uncertainty and a minimum mixed-army reserve |
| Tactical | Choose legal targets, use cover, retreat valuable damaged units, protect support vehicles |
| Faction | Schedule sorties, maintain drone sight, use safehouses, or deploy/recover formations |
| Recovery | Replace builders/haulers, restore power, reconstruct production, and rebase aircraft |

Easy updates strategic decisions every four seconds, Normal every two, and Hard every second. Unit combat ticks are the same for everyone; difficulty does not slow bullets or movement. Easy has a smaller planning horizon and simpler abilities; Hard uses more of the legal toolset. Difficulty parameters are visible in the menu.

### 20.3 Composition and behavior safeguards

AI limits commitment to a single damage layer, never repeatedly feeds aircraft into observed AA, scouts before a blind missile attack, and reacts to low power or missing service capacity. A defended starting base is not mistaken for the entire opponent's map presence. Scouts explore uncertainty instead of magically selecting the enemy's most valuable hidden target.

AI must handle every custom starting faction and legal map spawn, moving objectives, destroyed bridges in authored scenarios, disconnected players, and prolonged resource exhaustion. It surrenders only when a published scenario rule says to do so or it meets ordinary elimination; it never awards an unexplained automatic win.

## 21. Multiplayer and competitive integrity

### 21.1 Lobby and matchmaking

Provide region/ping estimates, faction and color selection, map preview, team assignment, private codes, invitations, ready state, observer policy, and a readable rules summary. Changes to map, faction, teams, or rules reset ready state. The host cannot start while players are still downloading required assets.

Ranked 1v1 uses skill-rating placement and matching within an acceptable latency region, widening skill range before excessively widening latency. Account rating changes only from a valid match result; no rating bonus for damage, speed, faction purchases, or cosmetic ownership. Faction and map versions are stored with the match so patches do not mix incompatible statistics.

### 21.2 Server authority

Clients submit intention: select locally, then issue commands. The server validates owner, tick, command rate, target visibility, position, resources, Supply, service slots, prerequisite, and cooldown. Clients never supply accepted damage, credit balances, research completion, or victory.

Transmit only permitted fog-filtered information. Do not send full enemy state and rely on the UI to hide it. Rate limits must support legitimate fast play and queued orders without accepting unbounded requests. Preserve a command log and periodic snapshots for diagnostics and replay. Invalid orders produce player-readable feedback, not a silent divergence.

### 21.3 Disconnects, crashes, and results

A disconnected player has 120 seconds to reconnect. Existing units keep their current orders and standard guard behavior; no substitute AI takes over in ranked. The match continues and teammates see the timer. Reconnect reauthenticates the match slot and restores an authoritative snapshot plus subsequent commands. Expiry eliminates the player; an explicit leave/surrender does not receive a free 120-second grace period.

An accepted match with a disconnect uses the normal win/loss result. A server outage that prevents a trustworthy result voids ranked rating and preserves available replay diagnostics. Repeated abuse is reviewable through match records. The result is committed idempotently so retries cannot award duplicate rating or rewards.

### 21.4 Teams and FFA

Allies share vision and tactical pings, but not money, unit orders, ability ownership, service slots, or captured buildings. Damage/heal effects specify whether they affect owned or allied units; in this specification, faction boosts affect **owned** units only. Allied missile defenses coordinate projectile reservations while each pays its own charge. Friendly splash follows the same 50% rule across a team.

FFA has no diplomacy or alliance switching. Enemy color remains consistent across map, minimap, alerts, and replay. Match rewards do not encourage farming a defeated player's wrecks. A defeated player may watch only the permitted delayed perspective until the match ends.

### 21.5 Replays, spectators, and social safety

Competitive observers use a 120-second delay and cannot send messages to active players. Private lobbies may opt into live observers before ready-up. Replays support timeline seek, speed, pause, perspective fog, build orders, combat overlays, and a match-version label. Seeking restores a snapshot and simulates forward; it does not replay reward side effects.

Provide text chat, pings, friends, mute, block, report, and moderator review. Team chat stays team-only; blocked messages do not generate repeated notifications. Names and custom-map text are moderated and escaped before display. Player reports attach match/time references, not unnecessary private data.

## 22. Interface and accessibility

### 22.1 Battlefield layout

- **Top:** credits, observed income, power used/available, Supply used/reserved/cap, Command Energy, match clock.
- **Right:** construction/production/research tabs; queues; explicit missing prerequisites; faction strategic charge.
- **Bottom left:** minimap, explored terrain, friendly forces, observed opponents, pings, selected-player perspective.
- **Bottom center:** selection portraits, health, ammo, stance, service/transit state, commands, and unit abilities.
- **Alert stack:** prioritized messages with timestamps; clicking centers the relevant location without losing selection.

At 1280×720 the battlefield remains the largest area. UI scale can increase without clipping essential commands. Small panels collapse deliberately; they do not overlay the only legal unit target. A build ghost shows footprint, range, power impact, price, and invalid-placement reason.

### 22.2 Readability contract

Selecting a unit reveals what it does, what it can hit, what counters it, and which orders it can obey. Unknown enemy upgrade state is not disclosed through perfect enemy tooltips. Health bars can be always-on, selected-only, or damage-only. Missile warnings, ambush readiness, lost aircraft service capacity, deployed defense, and low power have both a symbol and a color.

Production buttons explain insufficient credits, reserved Supply, absent tech, lost prerequisite, no service slot, disabled building, or queue limit. Multi-selection presents common legal commands and exposes subgroup tabs for mixed forces. Queued ability targeting cannot accidentally cast a different action when selection changes.

### 22.3 Accessibility settings

Remappable hotkeys; keyboard camera movement; optional edge scrolling; sensitivity; zoom speed; selection tolerance; drag-threshold setting; UI and minimap scale; color-vision palettes; subtitles; independent voice/music/effects/UI levels; reduced flashing; adjustable or disabled screen shake; reduced camera motion; and visible replacements for all actionable audio.

Hold/toggle choices apply to common modifiers where safe. No essential command relies solely on double-click speed, rapid repeated clicking, or a color distinction. Focus indicators remain visible in menus. Pause/status screens explain when multiplayer continues in the background. Settings persist and have a local reset-to-default action.

### 22.4 Non-combat states

Design actual screens for loading, incompatible version, missing content, offline mode, full lobby, failed join, reconnect, connection deterioration, lost save, conflicting sync, invalid map, victory, defeat, surrendered teammate, and server outage. Each has a clear recovery action. Never expose raw technical errors as the only explanation.

## 23. Art, animation, sound, and voice

### 23.1 Visual style

A readable 2.5D military battlefield with a fixed elevated camera, zoom, strong silhouettes, subdued terrain, and clear player-color accents. Units remain distinguishable at ordinary play zoom. Render infantry as small squads without turning every cosmetic member into a collision agent. Ground shadows distinguish air units from terrain. Optional high-quality effects never hide essential warning markers.

| Faction | Shape and animation identity | Avoid |
|---|---|---|
| US | Distinct aircraft silhouettes, visible run-up/landing, compact recon equipment | Every vehicle looking like the most advanced answer to every threat |
| Iran | Recognizable drone sizes, unfolding launch racks, visible missile magazines | Making drones visually indistinguishable from US planes |
| Syrian Rebels | Light technicals, varied but readable repaired equipment, infantry cover poses, visible safehouse exits | Disguising combat units as civilians or using real extremist symbols |
| Saudi Arabia | Heavier wheeled armor, deployed stabilizers, service machinery, clear interception launch state | Reusing the US aircraft identity as the faction's main visual hook |

Use original names, models, icons, music, dialogue, UI graphics, and mission assets. Faction markings are fictional military insignia; team colors can be overridden for accessibility without removing the unit silhouette.

### 23.2 Animation and effects checklist

Every unit needs idle, move, aim, fire or work, damage, and destruction states, plus role-specific deploy, pack, repair, board, unload, land, rearm, conceal, or capture states. Buildings need foundation, construction, complete, damaged, disabled, low-power, capture, selling, and destroyed states. The visible build/repair animation must match actual gameplay progress.

Impacts distinguish miss, blocked shot, hit, intercepted missile, decoy, cover mitigation, and illegal target. Death effects do not create confusing lingering selectable units. Cosmetic wrecks fade without blocking paths unless a map object explicitly declares a blocking wreck. Reduced-effects mode preserves the same tactical information.

### 23.3 Audio and unit responses

Each faction has original selection, movement, attack, stop, unavailable-order, damage, repair, ability-ready, and retreat lines. Examples of tone: US “Wing ready”; Iran “Link established”; Syrian Rebels “Route is clear”; Saudi Arabia “Formation ready.” These are game-role cues, not political slogans or caricatures.

Announcer events include base attacked, hauler attacked, low power, unit ready, research complete, aircraft returning, no landing slot, missile warning, interceptor depleted, safehouse transfer canceled, strategic site charging, and capture interrupted. Prioritize immediate threats over routine acknowledgment. Bundle repeated attacks at one location for six seconds. Selection chatter has a short cooldown and never blocks warning captions.

### 23.4 Content completion

The asset manifest must account for every roster entry and building state, portraits, buttons, cursors, minimap symbols, weapon/projectile effects, ambient map sets, menu screens, briefing art, voice events, music transitions, and localization keys. Shared animation rigs and textures may reduce production work without erasing faction silhouettes. Placeholder art or missing voice states block a “finished presentation” claim.

## 24. Browser architecture and content pipeline

### 24.1 System boundaries

| System | Responsibility / owner |
|---|---|
| Shared simulation | Orders, costs, movement, visibility, damage, abilities, objectives; 20 ticks/second |
| Match authority | One server-owned match process for online play; local simulation for solo |
| Renderer | GPU-accelerated 2.5D presentation, interpolation, animation, effects; no authoritative damage |
| Interface | Selection, tooltips, local previews, accessibility, menus, and error recovery |
| Services | Matchmaking, accounts, friends, saves, moderation, match records, and content versions |
| Content data | Unit/weapon/building definitions, map metadata, missions, localization, and audio events |

Use the same combat rules for solo and online. Do not create a simplified local game whose later multiplayer implementation changes targeting or economy. UI and rendering must not halt the authoritative simulation because a menu animation or sound fails.

### 24.2 Performance targets and budgets

Define and record reference devices before optimization: a mainstream integrated-graphics laptop at 1080p and a lower-spec laptop at 720p. Target 60 FPS on the first and 30 on the second, with readable effects at both. These are acceptance targets, not measured claims about the current design.

The worst legal four-player actor case is 100 one-Supply units plus four rigs and eight haulers per player, with 60 structures each: up to 688 units/structures before projectiles and props. Test this case, ordinary mixed armies, maximum simultaneous air returns, mass route changes, and missile interception together. Cosmetic infantry bodies are not separate simulation agents. Visual particle budgets may degrade under load; damage, projectiles, fog, and orders may not be dropped to preserve frame rate.

Server simulation must fit its 50 ms tick budget with headroom under this load. Rendering interpolates between authoritative states. Batch path requests, use spatial indexing, and avoid allocating full-map searches for every unit every tick. Measure long-session memory and repeated matches; menus and replays must release previous assets correctly.

### 24.3 Loading, offline use, and browser recovery

Load common assets first, then the chosen map/factions/mode; show progress and permit retry of failed downloads. Version and cache content. After the required files have been downloaded, solo modes can run offline, with a visible indicator for features that require a connection. Background-tab throttling must not corrupt saves or simulate a false online pause.

Audio starts only after the player enables it through normal interaction. Losing rendering context, tab focus, network, or a service request triggers a designed recovery path. A server never trusts a client merely because it resumed an old browser tab. Long campaign sessions have periodic safe checkpoints and exportable local progress.

### 24.4 Data and ability schema

Every unit definition has a stable ID, name key, faction, role, producer, cost, build time, HP, armor class, Supply, tier, speed, footprint, sight, detection, weapon references, target layers, ammunition, service rules, abilities, prerequisites, and asset references. Every ability defines activation, legal targets, range/area, resource costs, channel/warning, duration, cooldown, stacking, interruption, ownership, fog policy, and expiration behavior.

Schema validation rejects missing references, illegal layers, impossible prerequisites, cyclic tech trees, negative prices, duplicate stable IDs, undefined cooldowns, capacity overflow, and unsupported content. Match rulesets include a version/hash. Save/replay migration is explicit; incompatible files are preserved and clearly identified rather than silently deleted.

### 24.5 Production pipeline

Design data review → asset naming/ID assignment → implementation → automated rule validation → playable scenario check → visual/audio review → balance telemetry → content/version release. Map and mission authors use the same validated ability/trigger definitions as the base game. Changes to a weapon are propagated from its single definition, not manually copied into each faction.

## 25. Balance model, checks, and playtests

### 25.1 What “balanced” means

All factions should have a credible path to victory against every other faction at comparable skill. They should be able to react to scouted threats without buying the opponent's signature unit. They need viable early, middle, and late decisions; comparable match-winning opportunity across reviewed maps; and weaknesses the opponent can exploit without a blind build-order gamble.

Balance does **not** mean identical damage, identical aircraft, equal one-unit duels, or a single 50% global win rate. A faction can look balanced in aggregate while dominating one map or becoming unusable for new players. Separate skill bands, maps, sides, match lengths, and compositions.

### 25.2 Counter relationships

| Threat | Available responses | Why the response is not universal |
|---|---|---|
| Rifle/guerrilla infantry | Rifle squads, scout cars, mortars/artillery; recon against concealment | Cars lose to armor/anti-armor; artillery needs sight and spacing |
| Heavy tanks | Anti-armor crews, raider buggies, other tanks, ground-attack aircraft | Anti-armor cannot attack infantry; aircraft need service and AA avoidance |
| Artillery | Scouting, mobile ground pressure, aircraft when AA allows | Blind attacks cannot see a hidden launcher; support armies still matter |
| Aircraft | Tier 1 AA posts/mobile AA; Syrian portable AA; later fighters | AA has no ground attack; fighters cannot hold territory |
| Drones | Ordinary AA, fighters, service-hub pressure | AA spent at one location cannot cover the whole map |
| Tactical/strategic missiles | Charged fixed batteries; Saudi Aegis; move/disperse; deny vision | ABM cannot stop artillery or planes; charges and coverage are finite |
| Safehouse play | Recon, nearby guards, damage that interrupts transit, clearing the exit | Detection has limited radius; overguarding wastes army value elsewhere |
| Armored defensive formation | Artillery, flanks, pressure elsewhere, removing repair support | Formation defense is useful when it controls a location the opponent needs |

### 25.3 Six matchup questions

| Matchup | Intended contest | Warning signs |
|---|---|---|
| US vs Iran | Aircraft efficiency and fighter escort against drone cost/vision and missile timing | Fighters erase every drone strategy; or cheap drones overwhelm any equal-budget defense |
| US vs Syrian Rebels | Air mobility/recon against covered infantry and attacks on several ground positions | Rebels cannot defend before first aircraft; or concealment has no affordable detection answer |
| US vs Saudi Arabia | Flexible sorties against durable mobile coverage | Saudi defense creates a no-play air map; or US always bypasses deployment commitment |
| Iran vs Syrian Rebels | Vision-supported siege against mobile infantry and safehouse routes | Long-range pressure ignores spotting; or safehouse transit cannot be interrupted reliably |
| Iran vs Saudi Arabia | Banked volleys against finite mobile/fixed interception | Interception produces permanent immunity; or saturation invalidates all investment in defense |
| Syrian Rebels vs Saudi Arabia | Flanks, sabotage, and map breadth against a stronger direct formation | Rebels also win equal-resource frontal armor battles; or Saudi cannot ever be displaced |

Mirror matchups also matter: US airfield snowball, Iranian simultaneous volleys, Syrian concealment/exit loops, and Saudi repair stalemates. Team tests separately examine combinations such as US air plus Saudi interception and Iran missiles plus Syrian scouting.

### 25.4 Analytical checks completed for this revision

The following checks use the specification's actual roster and weapon values. They identify arithmetic and rule problems; they do not simulate human scouting, map geometry, flight paths, or skill.

{{BALANCE_REPORT}}

### 25.5 Required playable test suite

Run deterministic scenario fixtures before human balance sessions:

1. Equal-credit and equal-Supply ground compositions, including surplus cash in the result, with and without cover.
2. Early timing races: earliest legal air/drone opening versus earliest legal AA response, including builders, travel, income, prerequisites, and production queues.
3. Aircraft sortie value at short/medium/long distances, with one/two/three AA sources and retreat/service opportunities.
4. Drone attrition and hub loss with full service queues and every endurance threshold.
5. Single missile, banked volley, multiple launchers, mixed allied batteries, low power, and mobile ABM relocation.
6. Concealment acquisition/loss, detection overlap, one-shot Ambush cooldown, and re-conceal under splash.
7. Safehouse transfer interrupted at every tick boundary; blocked exits, source/destination loss, and simultaneous orders.
8. Saudi deployment and paid repair under repeated damage; verify no healing during combat and no aura stacking.
9. Every strategic operation against prepared, partially prepared, and unprepared opponents at the same total economic investment.
10. Unit preservation versus replacement cost; veterancy growth; salvage limits; and long-match resource depletion.

Record these scenarios as saved test setups and reproducible command sequences. The final game must supply outcomes, not just assertions that the scenarios are covered.

### 25.6 Human playtest plan

Begin with a discovery pass of at least 20 completed matches for each of the six cross-faction pairings across varied maps and sides. This small pass finds obvious failures and does not certify balance. Recruit separate novice, intermediate, and strong RTS players. Alternate sides, alternate factions, and record prior experience.

For release decisions, collect larger samples per matchup/map/skill grouping and publish uncertainty with estimates. Use a Wilson or comparable binomial interval for raw win rates, and a skill-adjusted model for matchmaking data. A 45–55% band is an investigation threshold, not automatic approval. Repeated matches by the same few players are not independent evidence; account for player effects. An under-sampled faction remains unverified even if its observed result is exactly 50%.

Inspect opening diversity, first-contact time, early-air damage, counter adoption, resources denied, effective repair expenditure, unit survival, strategic-operation value, comeback frequency, concession timing, and match duration. Ask players whether they understood why they lost and what action could have prevented it. Readability failures can look like balance failures.

### 25.7 Tuning method

Change one primary lever at a time when possible. Prefer cost/build time, HP, travel/setup, ammo/rearm, warning, or coverage changes before introducing a new immunity. Preserve a faction's defining action: weaken an oppressive Iranian volley by charge economics or warning, not by removing missiles; fix overstrong guerrilla play through detection and exit rules, not by giving every unit permanent reveal.

Track a hypothesis, expected effect, test set, result, and rollback value for every change. Review how a change affects all six pairings and team synergies. Buffing both a unit's damage and health at once compounds combat strength; a 10% boost to each is more than a 10% combat change. Never ship a single-unit spam fix that removes all viable faction openings.

### 25.8 Release balance gates

- Every faction has at least two credible openings and more than one viable late composition on each ranked map.
- Air and missile counters can be afforded and produced before their first plausible threat, based on measured openings.
- No unit or ability becomes a mandatory purchase in essentially every match regardless of scouting; core economy units are the intended exception.
- No same-cost/same-role unit is strictly superior in every relevant dimension without a documented unlock/infrastructure tradeoff.
- No ability loop creates permanent invisibility, uninterruptible transit, free income, infinite healing, zero-warning damage, or unbounded temporary units.
- Balance conclusions state their sample size, skill/map scope, and remaining uncertainty. The word “perfect” is not an acceptance test.

## 26. Completion criteria and production gates

### 26.1 End-to-end coverage checklist

| Area | Done means |
|---|---|
| Economy | Gathering, congestion, depletion, cargo loss, expansion, station capture, refunds, and low-funds repair work together |
| Construction | Placement, power, foundations, prerequisite loss, resume/cancel/sell, outposts, and HQ recovery are verified |
| Unit control | Selection, groups, queues, mixed armies, path recovery, stance limits, legal targets, and ability cancellation are reliable |
| Factions | Every roster entry, unique ability, upgrade, weakness, voice event, and counter is implemented |
| Combat layers | Ground, cover, detection, aircraft/endurance, missiles, ABM, friendly fire, and strategic operations agree with the rules |
| Modes | Tutorials, 24 authored missions, two co-op scenarios, skirmish, online modes, and practice each have complete start/end states |
| Maps | Eight launch maps plus campaign layouts pass path, objective, resource, spawn, and faction reviews |
| Persistence | Save/load, export/import, sync conflict, replay versioning, and interrupted-session recovery are tested |
| Multiplayer | Validation, privacy of fog, matchmaking, teams, reconnect, surrender, results, observers, reports, and outages are covered |
| Presentation | No missing unit/building state, portrait, cursor, alert, caption, briefing, menu, or debrief |
| Accessibility | Full key remapping, UI scale, color alternatives, captions, motion/flash controls, and focus behavior pass real-use review |
| Performance | Declared reference machines pass target workloads with stable memory and correct simulation |
| Content tools | Editor, import validation, test mode, versioned maps, and user-content reporting are usable |
| Operations | Deployment rollback, server monitoring, crash reporting, backup recovery, and moderation ownership are assigned |

### 26.2 Production gates

**Gate A — rules foundation:** one map exercises the complete economic/combat loop, authoritative orders, pathfinding, power, fog, and saving. This is an internal validation build, not the release promise.

**Gate B — faction completeness:** all four rosters, special buildings, abilities, aircraft, missiles, and counter systems operate. Run the analytical and deterministic scenario tests. Correct design contradictions before creating a large campaign on top of them.

**Gate C — content and modes:** all missions/maps, tutorials, modes, accounts, matchmaking, reconnect, replay, editor, and debriefs are integrated. Mission scripts and AI use the same rules as skirmish except declared scenario events.

**Gate D — release quality:** complete art/audio/localization, accessibility, compatibility, stress/recovery testing, human balance sessions, security review, and operational readiness. No critical progression blockers, exploitable economy duplication, fog leaks, or deterministic desyncs remain.

These are completion gates, not a calendar or staffing estimate. A development plan must separately estimate engineering, art, sound, writing, level design, infrastructure, testing, and ongoing service costs.

### 26.3 Verification matrix

Test current stable desktop Chrome, Edge, Firefox, and Safari on recorded reference configurations before claiming support. Include browser zoom, focus loss, offline start, audio consent, network jitter, packet loss, high latency, reconnect storms, low memory, renderer context loss, save corruption, sync conflicts, and two consecutive long matches without a page reload.

For content, test every mission on each difficulty, every faction at each legal start, and every required objective after save/reload. Review animations and audio against actual game state. Automated checks support human QA; neither a passing arithmetic script nor a polished menu establishes a finished RTS.

## 27. Expansion, live operation, and business model

### 27.1 Expansion contract

New maps may introduce one clear terrain/objective idea at a time without changing the standard rules. New units/factions need complete production, targeting, UI, AI, audio, repair, save/replay, and counter definitions. Naval combat introduces a separately defined target layer, shore interaction, production, pathing, and map validation; it is not achieved merely by adding a ship model.

Standard ranked remains a stable declared ruleset. Experimental rules run in marked custom/test queues. Saved games and replays retain content versions; unsupported historical versions remain exportable and receive an explanation rather than disappearing. Avoid requiring expansion purchases to access necessary ranked counters.

### 27.2 Live service

Monitor server tick time, crash rate, failed joins, reconnect success, results integrity, save failures, and reported exploits. Balance telemetry should be limited to useful gameplay events with a stated retention policy and consent choices where required. Do not collect unrelated browsing or device data.

Each patch includes a version, player-readable changes, balance rationale, map list, migration plan, and rollback procedure. Test patches against old saves and recorded regression scenarios. Pause ranked or disable a clearly exploitable new feature when necessary; do not silently change its behavior mid-match.

### 27.3 Fair business model

Cosmetic faction themes, profile items, and optional campaign/map expansions may fund development. Cosmetics preserve silhouettes and threat readability. No paid stat boosts, production skips, better starting resources, exclusive stronger units, extra Command Energy, or purchased competitive rankings. Paid maps used in ranked must remain accessible to matched participants without a combat disadvantage.

## 28. Decisions, assumptions, and reference

### 28.1 Settled design decisions

- The core is a complete C&C-style RTS, with new concepts built on top of a stable base.
- The US owns the air-specialist identity; Iran owns drones/missile saturation; Syrian Rebels own guerrilla movement/concealment; Saudi Arabia owns armored protection/recovery.
- All faction abilities have costs, time rules, legal targets, counterplay, and defined failure behavior.
- Early anti-air is available before an optimized aircraft threat. Interception and ordinary AA are separate layers.
- There is one credit economy, one visible Supply limit, shared target-layer rules, and no faction-wide hidden income or damage bonuses.
- Numeric rosters are explicit; the v1 modifiers are not added on top.
- Standard victories, prerequisite loss, HQ recovery, service loss, capture, transit, and temporary-unit expiry are specified.
- Single-player and multiplayer share combat rules. Ranked fairness and save/replay integrity are part of the foundation.

### 28.2 Still requiring evidence or production

The stated numbers are an internally checked starting balance, not a guarantee of equal human win rates. Human skill, map geometry, pathfinding quality, aircraft travel, latency, and information affect actual outcomes. Implementation must produce the measured scenario results and playtest evidence defined above.

Production must still create and verify the game code, models/sprites, animation, voice, music, UI, missions, map layouts, servers, and editor. Exact staffing, calendar, hosting cost, renderer/library choice, launch regions, moderation staffing, and final localization languages need a production plan. Those decisions do not change the faction identities or omit base-release features.

### 28.3 Reference

The genre reference is EA's [How to play the Command & Conquer Remastered Collection](https://help.ea.com/en/articles/command-and-conquer/command-and-conquer-remastered/how-to-play/), for the familiar construction, resource, production, and command loop. All faction abilities, numbers, story concepts, and rosters here are original proposals rather than claims about real military capabilities or extracted C&C balance data.

**Version 2.0 — revised 27 September 2026.** The Markdown document is the current deliverable. Earlier PDF material is superseded.
