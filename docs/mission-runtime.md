# Declarative mission runtime

This is the Go runtime contract for Claude-authored scenarios. It implements
mechanisms; it is not a completed tutorial, campaign, map, or cooperative content
pack. All shipping layouts, narrative, briefing/debriefing, visual objectives,
voice/subtitles and editor UI remain Claude's work. The authoritative types are
`pkg/content/mission.go`; simulation progress lives in `pkg/sim/mission*.go`.

All positions use millitiles, all HP/credits use milliunits, and a second is 20
simulation ticks. The opening five-second match countdown remains part of the
tick clock. Timers are absolute ticks, so authors should account for that initial
100 ticks. Scenario actions never execute while that opening countdown runs.

## Limits and common fields

Mission definitions are at most 2 MiB: one to four players, 256 initial spawn
groups, 32 objectives, 128 triggers, 16 actions per trigger, and 4,096 total
potential actors across initial and repeated spawns. A spawn group contains one
to 32 actors with the same tag/type/owner. A tag can identify several actors but
must have one declared original owner. Tags remain attached after capture or
explicit allied recovery.

Every mission must have at least one required victory objective. Production
content must additionally satisfy the design's opening/midpoint checkpoints,
explicit failure objectives, optional objective, briefing/debriefing, restart,
subtitles and three-difficulty playthrough requirements. Schema validation alone
does not prove those content acceptance requirements.

Each condition has `kind` and applicable arguments. `hold_ticks` requires the
condition to remain continuously true. Each node has its own saved hold timer;
interruption resets that node's timer. Condition trees permit at most six nested
levels, 16 children per node, and 512 nodes across the entire mission. Durations
are at most 108,000 ticks (90 minutes); amounts are at most 1,000,000,000
milliunits. No user code, arbitrary expressions, or unbounded event history runs.

## Conditions

| Kind | Arguments and meaning |
|---|---|
| `all` | `children`: all children true simultaneously |
| `any` | `children`: at least one child true |
| `at_least` | `children`, `count`: at least that many children true simultaneously |
| `timer` | `tick`: current absolute tick reaches it |
| `tag_alive` | `tag`, optional `owner`, `count` (default one): living tagged actors |
| `tag_destroyed` | `tag`: previously spawned tag has no living actors, irrespective of capture/ownership; an unspawned tag is not destroyed |
| `tag_owned` | `tag`, `owner`, `count`: living tagged actors now belonging to that player |
| `tag_operational` | `tag`, optional `owner`, `count`: living, completed, enabled, not disabled or contained; low power alone does not mean inoperable |
| `tag_in_region` | `tag`, `region`, optional `owner`, `count`: living uncontained tagged actors in the authored rectangle |
| `tag_concealed` | `tag`, optional `owner`, `count`: tagged actors currently concealed by the ordinary rules |
| `tag_stationary` | `tag`, `tick` (stationary duration), optional `owner`, `count`: tagged uncontained actors stationary for that duration |
| `count_type` | `type`, optional `owner`, `count`, `compare`: completed living actors of that type |
| `region_entered` | `region`, `owner`, `count`: that player's living uncontained actors in the rectangle |
| `region_held` | Same, plus no living uncontained enemy in the rectangle; allies and neutral props do not contest it |
| `resource_threshold` | `owner`, `amount`, `compare`: current credits |
| `stat_threshold` | `owner`, `type` (`income`, `spent`, `lost`, `kills`, `salvage`), `amount`, `compare`: that cumulative player statistic |
| `upgrade_owned` | `owner`, `type`: completed catalog upgrade |
| `stations_owned` | `owner`, optional `region`, `count`: stations simultaneously owned by that player |
| `field_remaining` | `field` (authored resource ID), `amount`, `compare`: remaining supply at that field |
| `objective_complete` | `objective`: another completed objective; cycles, including nested cycles, are rejected |
| `event_count` | `event`, optional `owner`/`tag`/`type`, `count`, `compare`: matching authoritative event occurrences |
| `event_value` | Same filters, `amount`, `compare`: sum of positive matching event values |
| `convoy_completed` | `convoy`: that declared convoy finished its route |

`compare` defaults to `at_least`; `at_most` is also accepted for numeric
comparisons. `count_type` with `at_most` and zero detects absence. Other actor
counts default to at least one. `region_held` uses exact player ownership for
presence and team relations for contesting: use `any`/`all` for allied coverage.
For two of three sites held simultaneously for twelve minutes, use an
`at_least` node with `count: 2`, three site children, and `hold_ticks: 14400` on
the parent. Putting holds on individual children means each site must separately
satisfy its continuous duration.

An objective normally latches once true. Optional preservation, budget, or
"finish with" objectives must set `at_end: true`. These show current progress
but only become complete when required victory occurs; an early surviving
vehicle or unspent budget cannot latch success before a later loss/overspend.
At-end objectives cannot be failure/required objectives, be completed by a
trigger, or be referenced as prerequisites. Failure objectives and all-human
surrender take precedence over simultaneous victory. All-human surrender ends
before any further mission rewards or convoy updates.

## Persistent event metrics

Allowed event names are `construction_complete`, `foundation_placed`,
`unit_ready`, `research_complete`, `cargo_delivered`, `building_captured`,
`station_captured`, `destroyed`, `weapon_fired`, `interceptor_fired`,
`missile_intercepted`, `aircraft_serviced`, `service_lost`, `salvage_collected`,
`salvage_capped`, `raid_canceled`, `raid_exit_blocked`, `ability_activated`,
`scenario_recovered`, `repair_spent`, `missile_spent`, and `convoy_completed`.
Only filter combinations actually declared by conditions allocate counters.
Repeated events do not grow the saved-state shape.

Event owner is the actor's owner at the event. `destroyed` therefore belongs to
the lost actor's player, not the killer. `missile_intercepted` uses the intercepted
projectile's owner; it is not an interceptor kill credit. `interceptor_fired`
counts defender shots, not confirmed interceptions. Events with no live actor
ID cannot match a `tag` or `type` filter. Scenario authors must choose semantics
that match the objective and should not infer a hit from a firing event.

Paid repair and actual tactical/volley ammunition deductions record exact
milli-credit values directly from authoritative payment sites; declined/free
repairs and canceled second shots add no spend. Salvage values likewise use
actual credited income. Other events are normally occurrence metrics; most have
zero value. Metrics are saved, replayed, and rolled back with a failed trigger.
They do not depend on whether a UI consumed a transient event frame.

## Actions and transactional reinforcement

Triggers have an ID, condition, actions, optional `repeat` (one by default, at
most 24), and `interval` (at least 20 ticks when repeating). Supported actions:

| Action | Fields and behavior |
|---|---|
| `spawn` | `spawn: {tag,type,owner,position,count,difficulties?}` |
| `credits` | `owner`, `amount`: explicit scenario grant |
| `complete_objective` | `objective`: complete a non-at-end objective |
| `warning` | `text`, optional `owner`: public scenario announcement |
| `checkpoint` | `text`: checkpoint identifier; server persists human saves |
| `attack_region` | `owner`, `region`: give that owner's armed mobile actors ordinary attack-move orders |
| `recover_tag` | `tag`, human `owner`: transfer existing allied ground actors of the same faction; preserves health/paid value, does not create actors |
| `start_convoy` | `convoy`: start the next declared convoy |

Every spawn uses ordinary supply, rig/hauler/commando, 60-structure,
16-weapon-defense, one-strategic-site, three-safehouse, collision, full building
footprint and aircraft service-slot constraints. Foundations reserve structure
slots. Spawned supply centers suppress automatic included-hauler creation; author
any permitted hauler explicitly. Scenario buildings do not acquire a sellable
paid basis merely by being spawned. No scenario-cap override exists.

A trigger waits if any action cannot succeed. All actions commit together, or
credits, tags, actors, IDs, checkpoints, events and counters roll back together.
Aggregate cap checks run before the rollback copy so a full army's waiting wave
is inexpensive. Repeat counts/timing advance only on successful commit. Saves
and replay do not repeat committed rewards. Authored warning triggers should
announce enemy wave entry/timing; the runtime does not invent narrative warnings.

Recovery rejects enemy actors, aircraft, buildings, loaded/contained actors,
temporary actors, faction mismatches and cap violations. Declared convoy tags
cannot be recovered into manual player control. Recovery is a scenario event,
not a generic unit-capture mechanic. It preserves injuries rather than healing
actors or resetting their purchase value.

## Difficulty

`enemy_credits_multiplier` (500–2000, where 1000 is normal) scales enemy initial
credits only. Friendly human and AI-ally credits remain unchanged; explicit
`credits` actions grant their declared amount. `wave_time_multiplier` scales
only timers explicitly marked `wave: true`. A wave-marked trigger must spawn
enemies and may only combine enemy grants/attack orders with warnings/checkpoints;
it cannot alter friendly units/objectives. Objectives cannot contain wave timers.

A spawn's optional `difficulties: [easy, normal, hard]` selects which difficulties
include it, allowing declared enemy composition changes. Friendly spawn filtering
is rejected. Use consistent tags for alternative compositions, and do not require
destruction of a tag that never spawns at the selected difficulty. No unit stats,
player rules, ordinary objective timers, or ally budgets change invisibly.

## Cooperative convoy decisions

`convoys` declares at most three ordered `{id, tag, routes, countdown_ticks}`
records in a co-op mission. Each tag belongs to an allied `script` controller
and contains only unarmed ground units. That script slot counts toward the four
scenario players; it uses ordinary unit caps. Routes contain one to sixteen
region IDs; one to four route choices are allowed. All routes of one convoy have
the same waypoint count, so a branch change retains the current waypoint index.
Countdowns are 60–600 ticks (three to thirty seconds).

Only one convoy may be active. The next cannot start until all earlier convoys
complete. An active convoy uses ordinary pathfinding, terrain, collision, damage
and movement speed. It waits the authored countdown before each leg. All surviving
actors must enter the destination region before advancing; authors must provide
adequate destination area and routes. Destruction uses explicit authored failure
conditions, while preserving every truck can be an optional at-end objective.

Human commanders send ordinary sequenced entity-free orders:

- `convoy_hold`, `type: convoy ID`: either allied human stops the convoy,
  cancels the countdown and clears approvals.
- `convoy_advance`, `type: convoy ID`, `index: route index`: after a manual
  hold, every active allied human must approve the same route. A changed route
  proposal clears earlier votes. Unanimity starts a fresh announced countdown.
  AI allies do not substitute for a missing connected human's decision; in a
  one-human scenario that human's approval suffices.

Script-owned convoy actors reject direct human unit orders. Holds also interrupt
in-progress movement. Countdown/progress/votes persist exactly through saves and
replays. `MissionView.convoys` exposes ID, active/completed/held/moving state,
route and waypoint indexes, `countdown_until`, and approving commander IDs. Use
this authoritative state for the UI and visible countdown; do not predict a
route change or simulate convoy movement in the browser.

Completion emits `convoy_completed`; a bounded trigger can create the next
convoy checkpoint and unlock an authored repair position. Convoy completion itself
gives no credits, buildings, haulers or other reinforcements.

## Editor mission playtests

`sim.NewPracticeMission(catalog, map, definition, difficulty, seed)` runs exactly
the same authored scenario, while setting metadata ruleset `practice-v1` before
returning. Saves and replays retain that mark. Frontend progression storage must
reject practice results as campaign completion evidence. Scenario objectives and
triggers still finish normally; arbitrary practice placement tools remain disabled
inside mission playtests. This is separate from unrestricted practice-range setup.

## Verification and remaining acceptance

Synthetic backend tests exercise nested continuous holds and saved progress,
neutral-object contesting, at-end preservation/spend, actual repair payments,
paid volley save/resume, metric filters, transactional late placement failure,
combined capacity retries, foundation caps, enemy difficulty filters, surrender,
convoy route voting/countdowns/ordinary movement/three sequential completions,
and malformed progress rejection. These tests are not shipping mission maps.
Every authored tutorial, all 24 campaigns and both co-op scenarios still require
all-difficulty completion, midpoint restore, restart, narrative/asset integration,
visual objective review, and real-player cooperative playthroughs.

## Authored tutorial integration corrections

`attack_tag` takes `owner`, source `tag` and `target_tag`. Only nonhuman unit
sources and declared enemy target tags are legal. It issues ordinary Go attack
orders against currently visible, legally attackable tagged actors. No legal
source/target means the containing trigger waits transactionally. Content must
separate spawning/approach from the subsequent tagged attack when new sight is
needed. Captured targets, disabled/embarked sources and illegal layers cannot be
bypassed. Tests verify actual weapon damage, no repeated grants and exact restore.

`emergency_rig_ready` records completion of an actual paid emergency factory job.
Normal HQ rig production does not satisfy it, and enqueueing does not complete
the lesson. Its emitted value is the paid milli-credit cost. Native tests verify
both cases across save/restore.

A tutorial may declare exactly four `tutorial_variants`, one per faction. Each
has a faction, briefing, human-only initial assets and complete objectives and
triggers. Go validates every effective definition; enemy initial composition
stays in the parent. The offline launch field `tutorial_faction` selects a
variant. Omitting it selects the template's default faction. The chosen effective
definition is stored in the engine save and replay, with the same mission ID and
version. No frontend role substitution or duplicate simulation is involved.
`contentcheck` launches every declared variant at all three difficulties; the
native adapter tests all four/default choices and exact save/replay hashes.

Scenario building placement and its bounded four-tile relocation now enforce the
same one-tile field/station/shipment access margin as ordinary construction.
Authored layouts may not silently cover a supply field when their first choice
is blocked. The shipping content passes the stricter opening checks; completed
mission playthroughs and balance remain separate acceptance work.
