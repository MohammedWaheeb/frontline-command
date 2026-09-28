# Authored mission completion acceptance

Status: active acceptance work, not a release certificate. Opening validation,
file inventory, and a successful content-library download do not prove a mission
can be completed. This lane exercises actual authored files using the native Go
simulation. Product UI teaching and browser input remain separate acceptance.

## Method

`pkg/sim/authored_tutorial_acceptance_test.go` loads the shipped mission and map,
validates both with the production content decoder, and starts the ordinary
mission rules with seed 19027. Drivers submit human orders and require accepted
execution receipts. They observe `PlayerView`, the same filtered perspective
used by the client. Initial authored tag IDs and declared destination hints
identify lesson actors. They do not inspect hidden current enemy state to choose
orders. `StateCopy` never changes the world. Failure diagnostics may export a
complete save for investigation; those diagnostics are not controller input.

Production, credits, Supply, movement, fog, weapon targeting, damage, repair,
service, resource hauling, faction energy, and objectives run in Go. No practice
rules, direct damage, resource edits, objective edits, simulated victory flags,
or clock jumps are used. A driver losing through poor orders is not evidence
that the mission is impossible.

Each successful case requires:

- A real `mission_complete` result for the human team.
- A save at a meaningful intermediate objective, restored into a second engine.
  Both branches then receive identical orders and individual ticks and must
  finish with exactly the same state hash.
- A complete command replay opened from its initial snapshot with seek
  checkpoints explicitly removed; its final state hash must match live play.
- A fresh mission restart with the same seed, definition, and difficulty must
  reproduce the initial state hash. Legal surrender by every human participant then produces a real
  `mission_failed` result and failure debrief. That ended save and its full
  command replay must reproduce the failed state hash. This covers the generic
  failure/restart path; individual authored loss conditions need separate
  playthroughs. Browser restart presentation is not exercised by this test.
- JSON evidence containing the accepted order receipts, actual objectives,
  outcome, debrief, completion tick, midpoint, metadata, and final hash.

Evidence lives in `work/evidence/mission-playthroughs/`. A `.failed.save.json`
file is a diagnostic from a failed attempt, not a completion record. Engine work
can legitimately change hashes and timing; successful branches are compared
within the same test build, and these records are not immutable cross-version
golden hashes.

## Coverage target and commands

The target is 102 native completions: tutorials 1–4 on three difficulties;
Tutorial 5 with all four faction choices on three difficulties; the 24 campaign
missions on three difficulties; and both co-op scenarios on three difficulties.
The tutorial entry point covers the 24 tutorial combinations. All 24 passed in
the recorded native runs: tutorials 1–4 in 188.909 seconds and Tutorial 5
variants in 170.295 seconds. Logs are in
`work/evidence/mission-playthroughs/runs/frontline-tutorial-1234-final-candidate.log`
and `frontline-tutorial-5-final-candidate.log`. These are within-build
determinism checks, not release-wide frozen engine baselines.
The clean native campaign matrices now also pass:

| Matrix | Actual completed combinations | Recorded suite result |
|---|---:|---|
| Four faction openings | 12 / 12 | 56.511 seconds |
| Four convoy missions | 12 / 12 | 37.967 seconds |
| IR03, SA03, SY03 territory missions | 9 / 9 | 69.663 seconds |

Together with the tutorials, these are 57 distinct main-objective completions.
The corresponding logs are `frontline-campaign-opening12-final-candidate.log`,
`frontline-campaign-escort12.log`, and
`frontline-campaign-territory9-final-candidate.log` under the evidence `runs/`
directory. The filenames do not confer release certification. These timings
include different concurrent local workloads and are not performance metrics.

All **102 distinct native combinations** have now passed the complete assertions
at least once. The final new case was SY05 hard: real victory at tick 8344,
midpoint save tick 1144, with paid extra haulers, a forward outpost and turret,
and protected engineers. No capture mission or balance edits were needed.
The clean consolidation uses five disjoint invocations. Core57 passed in
989.704 seconds (`runs/frontline-core57-clean.log`), capture9 in 334.758 seconds
(`runs/frontline-capture-clean9.log`), co-op6 in 268.372 seconds
(`runs/frontline-coop-clean6.log`), and assault18 in 522.004 seconds
(`runs/frontline-assault-clean18.log`), and defense12 in 690.211 seconds
(`runs/frontline-defense-clean12.log`). All five invocations are green, together
covering all 102 distinct combinations with no duplicate counting. The completion
inventory was checked against each log’s victory tick, save tick and final hash.
An earlier combined defense/assault invocation failed one SA04 hard defensive
route; its log is preserved as `frontline-defense-assault-investigation30.log`,
not a green suite. A revised ordinary-order defense moves two tanks and two
anti-armor teams to the missile battery only after tick 9000, preserving the
early eastern screen. The targeted SA04 hard regression then passed at tick
12100 with midpoint 6100; no engine or content changes were needed.
Earlier diagnostic failures remain separate failed tactical
attempts and are not counted as completions. See
`work/evidence/mission-playthroughs/completion-inventory.md` for per-case
victory/save ticks and observed optional awards.

The co-op driver submits independent player-1/player-2 sequences, checks that
shared vision cannot authorize a teammate's actors, uses each player's own
production and resources, and verifies full shared save/replay hashes. Its
restart failure test surrenders every human participant: an individual surrender
correctly leaves a surviving teammate active. Convoy acceptance additionally
requires explicit two-commander branch approval after Hold; a single approval
must not resume the convoy. These are native tests, separate from the earlier
multi-browser LAN admission/readiness/ownership evidence.

The opening routes earn the US, IR, and SA preservation bonuses. SY01 currently
records the correct unearned mechanic-preservation bonus; a route earning it is
still required. The convoy routes earn US truck preservation, both IR drone
service/recovery goals, and the SA repair budget; the SY salvage achievement
remains open. IR03/SA03 simultaneous-station achievements remain open, while
SY03's continuous concealment mark is earned. Main-objective completion does not
stand in for these remaining optional-achievement journeys.

```sh
FRONTLINE_MISSION_EVIDENCE="$PWD/work/evidence/mission-playthroughs" \
  go test ./pkg/sim -run '^TestAuthoredTutorialCompletion$' -count=1 -v

FRONTLINE_MISSION_EVIDENCE="$PWD/work/evidence/mission-playthroughs" \
  go test ./pkg/sim -run '^TestAuthoredCampaign(Opening|Escort|Territory)Completion$' -count=1 -v
```

The complete 102-case native command is:

```sh
FRONTLINE_MISSION_EVIDENCE="$PWD/work/evidence/mission-playthroughs" \
  go test ./pkg/sim -run '^TestAuthored(Tutorial|Coop|Campaign(Opening|Escort|Territory|Capture|Defense|Assault))Completion$' -count=1 -timeout 90m -v
```

The consolidation uses separate invocations for the same five disjoint groups,
so test logs report the real counts rather than a fabricated aggregate suite.
`runs/native-acceptance-source.md` records the engine/content and driver source
fingerprints captured before the final core57 and capture9 reruns. Test timings
include concurrent local work and are not simulation performance measurements.

The dedicated completion matrix skips with `-short`. A targeted investigation
can select a specific mission, faction, and difficulty with Go's subtest regex,
for example `^TestAuthoredTutorialCompletion/5-command-a-match/US/normal$`.

## Real gameplay checkpoint for product acceptance

With `FRONTLINE_MISSION_CHECKPOINTS` set to a directory, `checkpoint()` additionally
exports its exact native save bytes. This is opt-in and does not change the
simulated world. The shipped evidence artifact
`work/evidence/mission-playthroughs/ui-checkpoints/tutorial-1-give-an-order-US-normal.midpoint.save.json`
was produced by the ordinary Tutorial 1 driver at tick 111, seed 19027. Its move
objective is already complete and paid rifle production is active. Starting
rifle squads are IDs 18–21. After loading, Stop those squads, then Attack Move to
the authored `site1` midpoint `(49999, 82499)`; the recorded native route genuinely
finishes at tick 351. Use the transport's next command sequence after load.

The 928,869-byte save's SHA-256 is
`7f28fc90cf0c9593dafd508c366bee0a8bb0be2dc810fbf6a841c6af6d675727`.
Its export/complete/save/replay acceptance log is
`runs/tutorial1-ui-checkpoint-export.log`. This pre-victory artifact supports a
real product completion journey; importing an already completed save is not a
substitute for earning new campaign progress.

## Defects found and coordinated fixes

### Tutorial 3: an exact unload destination between navigation samples

The authored forward region has a midpoint at `(49999, 82499)`. A transport
could reach the nearest 500-unit navigation sample but remain farther away than
the unload interaction radius, leaving its two passengers embarked forever.
The engine fix adds a clear exact destination tail only for unload within the
same endpoint cell; it does not permit a blocked exit. The tutorial driver again
issues targeted unload at the actual region midpoint, rather than avoiding the
problem with unload-here. All three tutorial difficulties have passed with genuine completion.
Dedicated navigation tests cover faction offsets, blocked goals, and restore.

### Tutorial 4: the missile source lost its only target information

An interceptor could destroy the hostile aircraft after the missile launcher
accepted a visible attack order but before firing. With the aircraft gone, the
launcher could keep the original direct order without reacquiring the battery.
The content now contains one bounded recovery trigger after `air-defense` is
complete and while the owner-4 `missile_intercepted` count is zero. It issues a
normal `attack_region` order to the existing detachment. It does not fire a
scripted projectile, grant sight, refill charges, or inflict artificial damage.

The recovery exposed a general minimum-range issue: attack-move stopped within
maximum range even when its target was inside minimum range. The engine fix
uses ordinary standoff movement and launcher packing. The launcher also needs
real forward vision because its own sight cannot cover every legal firing
position. The authored detachment now includes one `SY.recon` ground scout,
which follows the same ordinary region order. Ground AA and missile interceptors
retain separate roles, finite ammunition, normal costs, and ordinary visibility.
The driver also requires nonzero paid missile expenditure and actual interceptor
fire, and keeps the noncombatant haulers at home with full health. All spoken
briefing and warning text is unchanged. The mission helper and exact
library hash/byte record are updated alongside the authored file.

### Landed aircraft departure followed by queued Return

The paid guard-clearing investigation issued Attack followed by queued Return to
two completed gunships while they were still landed. Return incorrectly checked
current damage armor (ground while landed) instead of aircraft identity. The
engine lane corrected that validation, preserved queued Return when a target
leaves sight, and tested opposing aircraft traffic during return. Dedicated
all-faction aircraft and two-gunship tests cover actual departure, attack,
return/service, and exact restore/replay. No mission balance was retuned.

### IR01: a replaceable observer was incorrectly a mandatory original actor

The required ridge observation condition used the original recon tag even though
preserving that original team was the optional objective. A paid replacement
therefore could not recover the main mission. The condition now accepts a living
owned `IR.recon` through the engine's validated optional `type` filter on region
conditions. The existing continuous 400-tick hold and enemy contestation remain;
the optional original-team preservation condition is unchanged. The matching
observation checkpoint also accepts a replacement. No briefing/audio text changed.

`TestAuthoredCampaignReplacementObserverCompletion` loses the original observer
to real enemy weapons, pays for a replacement through the ordinary barracks,
uses a ground escort and completes the observation with that replacement. The
recorded normal case finished at tick 3122, midpoint 1364, with the preservation
optional unearned and live/save/replay hashes matching. Its separate
`-paid-replacement.json` evidence suffix prevents it from overwriting the ordinary
IR01 normal run. This also exercises the corrected navigation bridge for a
crowded snapped start; no actor positions are edited by the driver.

## Limits of the evidence

A native objective victory does not prove selection gestures, control groups,
blocked-order UI feedback, camera guidance, presentation reminders, accessibility,
or instructional pacing. In particular Tutorial 1's world objectives can finish
quickly, so the full product teaching journey needs independent input/pacing
acceptance. The suite does not claim all optional objectives or medals, each authored
failure condition, browser campaign/co-op journeys, multiplayer progression
recovery, or full release readiness. Native campaign/co-op main-objective
completion is reported separately from those product acceptance gates.

## Authored presentation corrections

Tutorial 1 now publishes its first movement and second training region markers.
Tutorial 3 publishes the actual APC assembly area, forward unload destination,
and infantry cover region. Tutorial 4 publishes its warning region and return
region. Each marker references an existing public map region and, where useful,
its actual Go objective; no marker queries or exposes hidden current enemies.
The wider audit now covers all 31 presentations: 82 public region markers
cover all 40 objective/convoy region references. The source generator contains
the same markers. These checks establish reference
validity only; world/minimap rendering and focus controls are tested by the
separate product UI lane.

The stale “not yet delivered” audio note now refers to the existing bundled
runtime audio index. All 31 main briefing/debrief IDs were found in that index.
Per-line `subtitles.voice` values remain authoring references; the actual runtime
uses its canonical mission audio IDs. This does not certify listening quality or
claim that every subtitle line has an individual recording. Tutorial metadata
now separates browser-local input records from Go world objective completion;
neither one alone certifies the whole teaching journey.

Original-actor metadata now publishes 58 common groups and one IR-specific
Tutorial 5 group. It distinguishes marked trucks from home haulers, named
wings, observers, training transports and recovered engineering teams through
canonical owned `mission_origin` values. Enemy actors, future reinforcements
and Convoy Union's script-owned trucks receive no owned group label. See
`mission-markers.md` for schema, limitations, and five focused safety tests.
