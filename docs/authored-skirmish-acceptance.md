# Complete deterministic bot matches on authored launch maps

> 2026-09-29 update: the fresh integrated0.3.4 matrix also passes13/13
> ordinary eliminations, paid economy, initial/final restore and full replay.
> Its13,951 accepted and12 rejected receipts were individually audited; the
> rejected orders are preserved and classified at actual planning/execution
> boundaries. See the [new source-specific table](../work/runtime-034-integrated-source/SKIRMISH.md).
> Source/runtime0.3.4 is selectively promoted; final product/balance approval
> does not follow. The0.3.3 result and prior failed histories below remain intact.

The simulation **0.3.3 matrix passes all thirteen cases**, including real
income/spending, ordinary elimination, initial/final saves and exact full replay.
Its ten rejected execution receipts were individually classified: eight actors
destroyed between planning and execution, and two moving placement blockers.
The repeated invalid station-capture intentions from 0.3.2 are absent.
This is functional acceptance, not a balance approval or a multi-seed/human
playtest sample. Every earlier source run and failure remains preserved below.

## Existing evidence and the gap

- `TestAICompleteStandardMatches` covers six cross-faction pairings and four
  mirrors on one synthetic 64×64 fixture with two extra synthetic fields.
- `TestBotsFinishThreeAndFourPlayerMatches` covers synthetic 64×64 three/four
  player free-for-all and team games. See [AI endgame evidence](ai-endgame-verification.md).
- The 70 [balance scenarios](balance-scenario-evidence.md) cover prepared ground
  comparisons, ordinary paid openings and aircraft sorties on synthetic maps.
  Some scenarios explicitly prepare and debit forces; they are not full
  standard-start bot matches on shipping maps.
- [Rendered multiplayer acceptance](rendered-multiplayer-acceptance.md) proves
  product controls and one-to-four human perspectives, but deliberately uses
  surrender for its lifecycle ending. It is not bot combat-victory evidence.

The new driver is `pkg/sim/authored_skirmish_acceptance_test.go`. It reads the
actual map files and requires their exact bytes/hash to match the installed
content index. It does not rewrite map geometry, spawn positions, fields,
objects, stations, shipments or starting resources. Every player begins with
ordinary 6,000 credits, HQ and rig and the normal five-second countdown. All
bots use Normal difficulty. There are no external orders, grants, scripted
attacks, force damage, surrender calls or world-state edits.

## Executed matrix

Faction order below is commander/spawn order, including intentional alternation
of sides across cross-faction cases. It is not both orientations of every pair
or a statistical balance sample. The four mirrors exercise the same faction
from both original starts.

| Case | Map | Factions in spawn order | Seed |
|---|---|---|---:|
| US / IR | Copper Junction | US, IR | 28001 |
| US / SY | Relay Heights | SY, US | 28002 |
| US / SA | Dry River | US, SA | 28003 |
| IR / SY | Industrial Valley | SY, IR | 28004 |
| IR / SA | Border Depots | IR, SA | 28005 |
| SY / SA | Port Outskirts | SA, SY | 28006 |
| US mirror | Copper Junction | US, US | 28007 |
| IR mirror | Relay Heights | IR, IR | 28008 |
| SY mirror | Dry River | SY, SY | 28009 |
| SA mirror | Border Depots | SA, SA | 28010 |
| Three-player FFA | Industrial Valley | US, IR, SY | 28011 |
| Four-player FFA | Border Depots | US, IR, SY, SA | 28012 |
| Two teams of two | Port Outskirts | US, IR, SY, SA | 28013 |

The team game uses the map's declared spawn teams (US/SY against IR/SA). A game
reaching the ordinary 90-minute time limit is recorded as a failed completion
case, including its final state and trace; it is never converted into victory.

## Run and artifacts

The test is opt-in and skips under `-short`, keeping unrelated checks bounded.
Run one case first; run the matrix serially on the same process only when the
other work lanes permit it. Use a new evidence directory for each source run to
preserve failures and corrections.

```sh
FRONTLINE_AUTHORED_AI=1 FRONTLINE_AUTHORED_AI_EVIDENCE="$PWD/work/evidence/authored-skirmish/run-name" go test ./pkg/sim -run '^TestAuthoredSkirmishAcceptance/pair-US-IR$' -v -count=1 -timeout=45m
```

Remove the `/pair-US-IR$` filter to execute all thirteen cases. No `t.Parallel`
is used. The full-game driver is not a tick-latency benchmark; recorded wall
duration is only reproduction context on a shared development machine.

Each case writes:

- `initial.save.json` and `final.save.json`: actual Go state, independently
  decoded and required to retain the exact engine hash.
- `commands.jsonl.gz`: every executed admitted batch and its actual execution
  receipts. Dynamic rejections are counted by code, not hidden. This is not a
  trace of rejected internal AI ideas before `Submit` admission.
- `replay.fcr`: ordinary encoded Go replay. It is decoded and replayed from the
  initial state without checkpoints, requiring exact final hash equality.
- `result.json`: source map hash/size, metadata, seed, economy/army samples each
  simulated minute, first weapon tick, authoritative debrief events/economics,
  execution rejection counts, ending, exact hashes and any failed invariants.

Every tick checks nonnegative credits and the normal 100 Supply limit including
reserved Supply. Each bot must make actual paid economic progress and receive
accepted commands. A rule, save or replay mismatch fails the case. Rejected
individual intentions remain visible in the evidence and need contextual
analysis; an enemy moving or hidden occupancy changing can legitimately reject
an otherwise reasonable plan at execution.

Results here do not establish human balance, all difficulty settings, every map
orientation, visual playability, reference-device performance, or all campaign
objectives. Demonstrated AI defects will be reported before changing production
AI code.


## Original baseline: 2026-09-28

All thirteen cases reached elimination without external commands or surrender.
Four are **failed acceptance cases** because one bot never earned income. Every
initial/final restore and complete replay matched its original final hash.

| Case | End tick | Duration incl. countdown | Winning team | Economic gate | Execution rejections |
|---|---:|---:|---:|---|---|
| pair-US-IR | 11295 | 9:24.75 | 2 | Pass | 7 invalid_capture_target, 9 invalid_designation |
| pair-US-SY | 12064 | 10:03.20 | 2 | FAIL | None |
| pair-US-SA | 11991 | 9:59.55 | 2 | FAIL | None |
| pair-IR-SY | 19868 | 16:33.40 | 2 | Pass | None |
| pair-IR-SA | 18020 | 15:01.00 | 2 | Pass | None |
| pair-SY-SA | 14201 | 11:50.05 | 1 | Pass | 1 invalid_capture_target |
| mirror-US | 13204 | 11:00.20 | 2 | Pass | 2 invalid_capture_target, 11 invalid_designation |
| mirror-IR | 11095 | 9:14.75 | 2 | FAIL | None |
| mirror-SY | 10117 | 8:25.85 | 2 | FAIL | None |
| mirror-SA | 20335 | 16:56.75 | 1 | Pass | 2 invalid_capture_target |
| three-ffa | 85351 | 71:07.55 | 1 | Pass | 86 invalid_capture_target, 64 invalid_designation, 1 not_owner |
| four-ffa | 19946 | 16:37.30 | 3 | Pass | 3 invalid_capture_target, 40 invalid_designation |
| four-team | 12615 | 10:30.75 | 1 | Pass | 1 not_owner |

The exact baseline two-team duration is **10:30.75 (12,615 ticks)**. A provisional
message had an incorrect tick count; the table and retained result are authoritative.
Baseline totals: 8475 accepted executed orders; 101 `invalid_capture_target`, 124 `invalid_designation`, 2 `not_owner`. Rejections remain in the
original gzip traces. They are not reclassified as successful orders.

The first US/IR probe predates the executable-hash field. The remaining twelve
results identify one frozen native test executable. Both runs use Go 1.27.1,
protocol 1, simulation 0.2.0 and rules hash
`318de8122eb9a6738a825a62d138f6833fda95b968722f02619b77949a0c4612`.
Per-map bytes, per-run metadata, seeds, full final hashes and executable hashes
are in `work/evidence/authored-skirmish/initial-2026-09-28/summary.json`.
These are functional checks on the shared Apple M4 development host. Worker activity varied; one Blender
worker was active during the matrices. These are not uncontended, reference-device
timing or statistical balance results.

### Demonstrated target filtering defects

The original US/IR replay was inspected before changing AI. All three ordinary
authorized view boundaries (before decision tick, after decision tick, execution
tick) agree for all sixteen rejections:

- Nine US Recon designation requests target observed `IR.at`/`IR.rifle`
  infantry. Their public armor category is invalid for designation.
- Seven engineer capture requests target observed incomplete foundations.
  Ordinary capture requires a completed building, below 25% health.

`ai_tactics.go` now filters observed completion and public unit/building category.
It does not read hidden target state or relax execution validation. Focused tests
prove invalid candidates are skipped, valid alternatives still pass actual order
execution, and changing unseen actors cannot affect these choices.

### Demonstrated sight-acquisition stall

On Relay Heights and Dry River, the original spawn1 haulers remain
`no_known_supplies` at ticks 1200, 2400 and 4800. No field appears in the authorized
view or AI knowledge. The planner spends 5,600 opening credits on structures and
two haulers, then saves its remaining 400 toward further infrastructure without
buying a recon unit. It never acquires resource sight or earns income.

The correction prioritizes one ordinary paid recon from an owned barracks before
optional infrastructure, research or an additional hauler when no usable field
is known. If a scout is unaffordable/unavailable, at most one idle worker per
12 seconds explores a public unexplored waypoint. It preserves cargo, productive
harvesting, construction, and already planned commands. Confirmed blocked routes
rotate goals on that cadence; normal movement still decides reachability. A
worker returns to ordinary gather after movement/discovery. No hidden field
position, grant, cost change, map edit, or new persisted simulation field is used.

Original-map opening regressions now earn 8,513.2–9,963.8 credits and field 21–30
Supply within six minutes on the four failed faction/spawn cases. A separate
cash-starved worker test requires that same worker to receive actual accepted
move/gather commands and produce an actual cargo-delivery event. These focused
results are separate from complete-match and pacing acceptance.

### Pacing remains a review issue

The original Industrial Valley 3FFA lasts 71:07.55. IR is eliminated at 12:09.50;
the remaining two armies continue for almost 59 minutes. US has no haulers by
minute 20 and earns only120 credits/minute station income throughminute 70 despite
remembered usable supplies and an owned supply center. The final ledger still
shows 15,054 credits in its known starting field. This is evidence of inadequate
economic replacement priority; it is not an acceptable balance conclusion just
because elimination eventually occurs. Per-minute actor counts include
positive-health inactive wrecks after defeat; use the `defeated` flag and final
debrief when assessing surviving armies.

The corrected sight acquisition also makes SY/US on Relay Heights a genuine
51:16.00 combat game instead of a zero-income collapse. Final corrected-matrix
pacing and rejections are reported independently below; no safety-bound ending
is converted into a victory.

### Compatibility and diagnostic replay

AI is deterministic simulation behavior and replay currently recomputes its
planning. Old/new planner files therefore require a simulation compatibility
boundary before release. Root owns that version change; this lane does not
silently relabel old replays as compatible. Original AI source is preserved under
`initial-2026-09-28/source/` with SHA256 in the baseline summary. For further old
replay diagnosis, use its Go `-overlay` manifest. The rejection inspector now
requires the entire replay's final hash to match the captured result before
writing contextual evidence.


## First correction matrix

The complete first-two-fix matrix (`corrected-2026-09-28`) passes all thirteen economic,
elimination, initial/final restore and full-replay checks in one serial run.
No 90-minute cap was reached. Native test duration 395.497 seconds is reproduction
context only, not a performance gate.

| Case | End tick | Duration incl. countdown | Winning team | Remaining execution rejections |
|---|---:|---:|---:|---|
| pair-US-IR | 14067 | 11:43.35 | 2 | None |
| pair-US-SY | 61520 | 51:16.00 | 2 | 2 not_owner |
| pair-US-SA | 13031 | 10:51.55 | 2 | None |
| pair-IR-SY | 19868 | 16:33.40 | 2 | None |
| pair-IR-SA | 17897 | 14:54.85 | 1 | None |
| pair-SY-SA | 14136 | 11:46.80 | 1 | None |
| mirror-US | 10361 | 8:38.05 | 2 | None |
| mirror-IR | 16499 | 13:44.95 | 2 | 1 not_owner |
| mirror-SY | 25204 | 21:00.20 | 2 | 1 occupied |
| mirror-SA | 14458 | 12:02.90 | 1 | None |
| three-ffa | 28763 | 23:58.15 | 2 | 2 not_owner, 1 producer_disabled |
| four-ffa | 21248 | 17:42.40 | 1 | 1 not_owner |
| four-team | 12571 | 10:28.55 | 1 | 1 not_owner |

The original invalid infantry designations and incomplete-foundation captures
are absent. The remaining nine execution rejections (seven `not_owner`, one
`occupied`, one `producer_disabled`) are retained and require exact authorized
snapshot timing classification; this table does not blanket-excuse them.

## Replacement-hauler recovery

A third narrow correction reserves the normal cost of exactly one replacement
hauler when all collectors are gone, an owned producer can legally train, and
usable supplies exist in observed knowledge. Shared authoritative production
checks gate the intention; it is still a normal paid train command. Existing or
queued haulers, exhausted/unknown fields, disabled or unfinished producers and
unavailable queues prevent this reservation. Essential HQ/power/supply recovery
retains priority. Losing eligibility releases the planning reservation next
cycle; no actual credits are held outside ordinary production.

Focused tests pass under the race detector, including exact payment/production,
no duplicates, no savings against disabled/unfinished/exhausted/unknown state,
trickle-income reservation, essential power priority, worker movement/delivery,
invalid-target exclusion, valid alternatives and fog noninterference. Existing
ten synthetic full-match cases and saved endgame regressions also pass. The
separate `recovery-2026-09-28` run verified the affected long endgames and then
the remaining eleven cases. Earlier evidence remains bound to its preserved
source and is not relabeled as testing this third change.


## Complete matrix after three corrections

All thirteen cases pass ordinary elimination, actual income/spending, initial and
final save restoration, and exact full replay. The final source ran in two serial
invocations: the two affected endgames (297.557 seconds) and the remaining eleven
(117.287 seconds). Both identify their actual native executable hashes. This is
one AI source version, not a claim that the two test executables are identical.

| Case | End tick | Duration incl. countdown | Winning team | Execution rejections |
|---|---:|---:|---:|---|
| pair-US-IR | 14067 | 11:43.35 | 2 | None |
| pair-US-SY | 61520 | 51:16.00 | 2 | 2 not_owner |
| pair-US-SA | 13031 | 10:51.55 | 2 | None |
| pair-IR-SY | 19868 | 16:33.40 | 2 | None |
| pair-IR-SA | 18716 | 15:35.80 | 1 | 1 not_owner |
| pair-SY-SA | 14078 | 11:43.90 | 1 | None |
| mirror-US | 10361 | 8:38.05 | 2 | None |
| mirror-IR | 16535 | 13:46.75 | 2 | 1 not_owner |
| mirror-SY | 25204 | 21:00.20 | 2 | 1 occupied |
| mirror-SA | 14458 | 12:02.90 | 1 | None |
| three-ffa | 28763 | 23:58.15 | 2 | 2 not_owner, 1 producer_disabled |
| four-ffa | 21248 | 17:42.40 | 1 | 1 not_owner |
| four-team | 12571 | 10:28.55 | 1 | 1 not_owner |

The two long endgame probes retain exactly the same final hashes after the third
correction. That correction is covered by focused loss/replacement scenarios;
these two trajectories do not demonstrate a pacing improvement from it.

Exact AI source hashes, beside the executable hashes in each phase summary:

| Phase | File | SHA256 |
|---|---|---|
| initial-2026-09-28 | ai.go | `5329e5ed588c5cd3635392adbbcae7417b7503e1ef7af2ffe72d88b1b3f18a85` |
| initial-2026-09-28 | ai_tactics.go | `0502f08cb2df8846da2cb7a4063fb414666a8ae706aaa8166903f4e1a95ab713` |
| corrected-2026-09-28 | ai.go | `0c888656e2f7e9c82e0cd50d777d92c181e18028f4fcf211483ea22d3b056751` |
| corrected-2026-09-28 | ai_tactics.go | `8eb7dfd474fcf153f819460bd68ffdd645055390a269f32478b673f45bd58ce7` |
| recovery-2026-09-28 | ai.go | `09edabda443f6922af3641ab2fa62e372ef908189763ebabe3f9a5c22cfcb968` |
| recovery-2026-09-28 | ai_tactics.go | `8eb7dfd474fcf153f819460bd68ffdd645055390a269f32478b673f45bd58ce7` |

The final `recovery-2026-09-28/summary.json` is the compact per-case result.
All original failed results, command traces, saves and replays remain in their
separate directories. Full data is local evidence, not game content or user data.
Native timing includes a shared busy host and must not be used as an FPS or
reference-device benchmark. Human balance, multiple seeds, other difficulties,
both orientations of every pair and all legal uploaded map geometry remain
outside this thirteen-case sample.


## Final emergency-producer guard and classified rejections

The full-replay inspector verifies final hash before writing its contextual
report. On the three-correction source, all ten remaining receipts are classified
in `recovery-2026-09-28/rejection-classification.json`:

- Eight `not_owner` receipts follow a selected owned actor taking lethal,
  owner-visible damage during the decision tick, before command execution. The
  inspector records its exact private HP, damage and disappearance. Six also
  expose a visible destruction event; the other two still have the lethal
  owner-only damage evidence. The validator correctly rejects the stale command.
- The `occupied` depot site in the SY mirror is clear at planning tangency:
  its own hauler 14 is 2,300 units from the center along Y, exactly the depot's
  1,500 half-height plus 800 hauler radius. Before execution the hauler moves 150
  units into that footprint. This is a measured placement race.
- One `producer_disabled` receipt is a real planning error: at tick 25,982 in
  the 3FFA, emergency rig production uses own factory 3977 while it is visibly
  incomplete at all three boundaries. The emergency branch now uses the shared
  `productionJob` and `jobReady` checks before submitting the ordinary train.

The **latest source includes this fourth, small guard**. Completed/enabled,
disabled, and incomplete factory tests pass under the race detector; the valid
case pays the actual 1,200-credit emergency cost. The affected 3FFA rerun again
ends at 28,763 ticks (23:58.15), now with zero producer-disabled rejections and
only the two already classified destruction races. Initial/final save and full
replay checks pass; exact final hash is
`08e8153353ecb458d26e8df8f2ddef83d3de1ab961123b79439f690a04e0bf98`.

Only that affected authored match was rerun after this final predicate guard.
The other twelve were last run on the preceding three-correction source. This
scope is explicit in `guard-2026-09-28/summary.json`, which records the final AI
file hashes and actual test executable. The earlier complete matrix is not
relabeled as a thirteen-case rerun of the fourth guard.

## Relay pacing and remaining congestion issue

The verified Relay match has active exchanges throughout its first half. Weapon
fire events (SY/US) per five-minute interval are:

| Minutes | SY | US |
|---|---:|---:|
|0–5|56|63|
|5–10|319|311|
|10–15|325|243|
|15–20|247|153|
|20–25|236|145|
|25–30|231|196|
|30–35|28|15|
|35–40|13|53|
|40–45|49|41|
|45–50|162|791|
|50–51:16|10|436|

SY income freezes at 38,277.7 credits after approximately minute 27. At minutes 30
and 35, both haulers still carry 600 credits, with the same sampled positions and
an active owned supply center. At least 22,800 credits remain in an observed
remote field. US continues collecting, reaches 100 Supply around minute 45, and
wins at 51:16; SY falls from 76 Supply at minute 25 to 14 by minute 50.

The full replay validates the 27/30/35/40/45-minute saved and owned-view snapshots.
The separate opt-in `TestAuthoredDepotCongestionEvidence` resumes the unchanged
minute 30 snapshot to minute 35 and requires the exact recorded destination hash.
It observes loaded-truck movement, clearance and deliveries without issuing
commands, changing state, editing the map or altering navigation. This is an
investigation of retained failure evidence, not a passing congestion acceptance
gate. No depot-access or navigation fix has been made in this AI lane.

The current return-to-depot goal is the single radial `approachPoint` in
`harvestGoal`; the crowded base contains many friendly infantry/repair guards.
The read-only alternate-side check finds an ordinary eight-node dynamic path
for hauler 20 to (25500,61500), with depot edge distance 1002, inside the existing
1100 approach threshold. Hauler 13 has no reachable clear candidate at that
instant. Across ticks 36000–42000, both trucks remain loaded for all 6000 ticks
and deliver nothing; hauler 13 stays at exactly (21500,60500), and hauler 20
oscillates within 106 millitiles. Both radial goals remain dynamically blocked,
while static clearance is valid. The unchanged continuation ends at hash
`b81e5577d7956a557ccc0c0b9eb43ae037c166b4dd7a72ef95a3b14114aa1f41`.
`depot-alternate-access.json` records candidate counts, actual path queries and
path nodes; the probe confirms that it leaves the restored state hash unchanged.
A general, bounded depot-approach correction is approved as the next separate
slice; this checkpoint intentionally preserves the unfixed evidence. Ghost collision, arbitrary interaction-radius increases, resource
grants, altered maps or a shorter victory timer are not proposed solutions.

## General depot access correction

The subsequent harvesting correction applies equally to human and bot gather
orders. It keeps the current usable approach and the original clear radial goal.
When blocked, it checks at most 289 grid points in a 17×17 neighborhood around
the depot, sorts legal candidates by squared distance with stable Y/X tie order,
retains the nearest 32, and tries no more than three ordinary dynamic path
searches from the existing shared twelve-search tick budget. Accepted endpoints
remain within the existing 1100 approach threshold. The two-unloader cap,
1200 unloading range, three-second service time, cargo, income and collision
rules are unchanged.

Successful routes use the existing persisted path fields; failed attempts use
the existing two-second route retry. No additional timing cache, unsaved
reservation, teleport or AI privilege is introduced. This is a bounded fallback,
not an exhaustive proof that every possible occupied depot can be reached.

The unedited minute-30 Relay save recovers both original collectors within the
120-second regression window: each delivers twice, including the farther trapped
hauler. The recovered tick38400 hash is
`2665a6673b9756ee4ae644eb8438c1bb464a6415dea09de4264823acd0c28c3d`.
Mid-route restoration and replay from the preserved initial save agree exactly.
The human-order fixture verifies a real accepted gather, physical movement and
actual unloading income. Other focused cases preserve clear routes, bound path
queries, retain retry state across a save and reject a physically enclosed route.
The existing harvest suite passes in 16.292 seconds with its original orientation,
eight-hauler, cliff, map-edge and per-actor delivery requirements. The focused
race run, including the recorded recovery, passes in 118.747 seconds; vet is clean.
All 72 paid openings complete and conserve credits. Income spread between
starts remains at most 3.125%, below the unchanged 5% gate, and all four factions
have identical income at each start. The current opening artifact is
`work/evidence/map-openings/paid-results-depot-access.json`.

The affected authored Relay match is rerun from its original standard opening,
with no extra commands, restored state, resource grants or forced ending. It
finishes by ordinary elimination at tick19504 (16:15.20 including countdown),
US/team2 winning. All 911 executed AI orders are accepted. Initial/final save
restoration and full replay agree at hash
`e98de44713e1a53e594477f06e552f315a0e2770c4dec65977b012092bc25953`.
Exact source hashes, executable and map identities are retained in
`depot-2026-09-28/summary.json`; native test duration is 7.429 seconds on the
shared host, not performance evidence.

Only the affected Relay match was rerun after this general harvesting change.
Earlier thirteen-case matrices remain bound to their recorded earlier source;
this targeted correction is not relabeled as a full latest-source matrix or a
balance approval. The original 51-minute trajectory and exact five-minute stall
remain preserved. Historical opt-in diagnostics require their original0.2.0
version/source overlay after the release compatibility boundary changes.

## Final complete simulation 0.3.0 matrix

All thirteen cases pass in one serial invocation (186.732 native seconds on the
shared development host). Every captured `pkg/sim` file hash is unchanged during
the run. The new directory `final-0.3.0-2026-09-28` contains per-case original
map identity, executable hash, metadata, all command receipts, economic samples,
saves, replay and debrief. `source-identity.json` records the exact source tree;
`summary.json` is the compact result. Older records retain their own versions.

| Case | End tick | Duration including countdown | Winning team | Execution rejections |
|---|---:|---:|---:|---|
| four-ffa | 20075 | 16:43.75 | 3 | None |
| four-team | 13997 | 11:39.85 | 1 | 1 not_owner |
| mirror-IR | 18160 | 15:08.00 | 1 | None |
| mirror-SA | 15525 | 12:56.25 | 1 | None |
| mirror-SY | 20278 | 16:53.90 | 2 | 1 not_owner |
| mirror-US | 10275 | 8:33.75 | 2 | None |
| pair-IR-SA | 17259 | 14:22.95 | 1 | 1 not_owner |
| pair-IR-SY | 24919 | 20:45.95 | 2 | None |
| pair-SY-SA | 27182 | 22:39.10 | 2 | 1 not_owner |
| pair-US-IR | 31409 | 26:10.45 | 2 | 2 not_owner |
| pair-US-SA | 25812 | 21:30.60 | 1 | None |
| pair-US-SY | 19504 | 16:15.20 | 2 | None |
| three-ffa | 21101 | 17:35.05 | 1 | None |

All six remaining `not_owner` receipts are individually classified using current
authorized views before the decision tick, after that tick and at execution. In
every case the selected owned actor receives lethal owner-visible damage during
the decision tick and is absent at execution. Four also expose a visible
destruction event; two expose the lethal private-HP/damage evidence. All five
inspected full replays finish at their recorded hashes before contextual evidence
is accepted. These are execution races, not blanket ignored errors. There are
no invalid designation, invalid capture, disabled producer or occupied-site
rejections in this final matrix. See `rejection-classification.json`.

## Simulation0.3.2 complete matrix and receipt audit

All thirteen cases in `final-0.3.2-2026-09-28` completed by ordinary elimination,
with real income/spending, unchanged authored maps/resources/starts, initial and
final restore equality, and checkpoint-free full replay equality. The serial
suite passed in275.989s on the shared development host. Source snapshots and
SHA-256 manifest are preserved under its `source/`; `summary.json` carries exact
build identities and complete case hashes. Concurrent browser/native work makes
this functional evidence only.

| Case | Final tick | Active elapsed | Winning team |
|---|---:|---:|---:|
| four-ffa | 36898 | 30m39.90s | 1 |
| four-team | 14202 | 11m45.10s | 1 |
| mirror-IR | 27507 | 22m50.35s | 1 |
| mirror-SA | 17875 | 14m48.75s | 1 |
| mirror-SY | 18783 | 15m34.15s | 1 |
| mirror-US | 12639 | 10m26.95s | 2 |
| pair-IR-SA | 15988 | 13m14.40s | 1 |
| pair-IR-SY | 16819 | 13m55.95s | 2 |
| pair-SY-SA | 19720 | 16m21.00s | 2 |
| pair-US-IR | 21107 | 17m30.35s | 1 |
| pair-US-SA | 13670 | 11m18.50s | 2 |
| pair-US-SY | 14706 | 12m10.30s | 1 |
| three-ffa | 21503 | 17m50.15s | 1 |

Every rejected receipt was independently replayed through the exact frozen
source and inspected at the pre-decision, post-decision and execution boundaries:

- Eight `not_owner` receipts follow actual loss of an owned mobile actor between
  planning and execution. The actor is present with low health before planning,
  takes observed damage, and is absent from its owner's live view thereafter.
- Two `occupied` build receipts in four-FFA have visible moving blockers. SA's
  own hauler22 crosses from y45200 to45350/45500 beside the proposed airfield;
  its800 radius is tangent at planning and overlaps afterward. SY rifle2143
  moves from y116911 to116812 beside the proposed power station, crossing its
 350-radius boundary. Neither is a persistent invalid static placement.
- The2v2 has104 `invalid_capture_target` receipts: two engineers each repeat52
  attempts on station10. The station belongs to player2, already defeated in
  all312 corresponding public PlayerSummary snapshots. The ordinary validator
  correctly refuses capture from a defeated owner; the AI station branch
  omitted that public-status filter. This is a confirmed planner defect,
  not a visibility/destruction race. It is preserved before the approved
  bounded correction and next compatibility boundary.

See `receipt-audit.json` and each affected case's `rejection-context.json` and
inspection logs. The Port recovery details, including the old90-minute timeout
and actual untouched-checkpoint movement, are in
[AI task recovery](ai-task-recovery.md).

## Current simulation 0.3.3 complete matrix

The final thirteen-case rerun uses a fresh captured 0.3.3 production/test overlay
in `final-0.3.3-2026-09-28/source`, following the public defeated-station filter
checkpoint `f2b41e8`. Every case passes the same standard-start economy,
ordinary-elimination, initial/final restore and checkpoint-free replay gates.
The serial suite passed in 183.970s on the shared host; no hardware performance
or balance claim is inferred from that wall duration.

| Case | Final tick | Winning team | Exact final hash prefix |
|---|---:|---:|---|
| four-ffa | 36898 | 1 | `1d13f596f5dd` |
| four-team | 14202 | 1 | `136fe0c0df6e` |
| mirror-IR | 27507 | 1 | `20c89620e249` |
| mirror-SA | 17875 | 1 | `2d4435af572a` |
| mirror-SY | 18783 | 1 | `760b461c1e32` |
| mirror-US | 12639 | 2 | `6a9e617a07c9` |
| pair-IR-SA | 15988 | 1 | `71c43a2ba662` |
| pair-IR-SY | 16819 | 2 | `ac661f523dbd` |
| pair-SY-SA | 19720 | 2 | `4a6f89c483df` |
| pair-US-IR | 21107 | 1 | `e4dd63d42a7c` |
| pair-US-SA | 13670 | 2 | `77ddd579f2d5` |
| pair-US-SY | 14706 | 1 | `a74d12dbaa09` |
| three-ffa | 21503 | 1 | `61d0cefbbf9f` |

The team match ends at tick 14202 with zero rejected execution receipts. The
prior 104 defeated-station attempts are gone. The other cases retain exactly
eight `not_owner` receipts after loss of the selected actor and two `occupied`
receipts after visible owned units move into proposed building footprints.
All ten were independently replayed again using 0.3.3, with three authorized
boundary snapshots per receipt; their exact records are in `receipt-audit.json`.
No rejection was silently discarded or reclassified as accepted. Full hashes,
map hashes, native executable hashes and receipt counts are in `summary.json`;
the original state, replay, command trace and minute samples remain in each
case directory. This current result supersedes the 0.3.2 lifecycle report for
acceptance while retaining that report's diagnosed planner defect as history.
