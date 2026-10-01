# AI endgame correctness verification

## Demonstrated defects and corrections

Visible actors belonging to a defeated player were repeatedly added to AI
knowledge. They could become a nearby defensive goal, an anti-air threat, a
production counter, or a special-order target. Previously observed structures
belonging to that same defeated player also remained in hidden memory. In a
three/four-player match, this diverted surviving armies from active opponents.

The planner now uses the `Defeated` and `Team` fields already present in the
authorized `PlayerView.Players`. It discards those obsolete observations and
filters defensive goals, remembered goals, composition, capture, launcher
attack and designation decisions. Transport and aircraft safety consume the
filtered observations and current active-opponent goal. Physical wreck
collision remains an ordinary simulation constraint.

An existing explicit attack or hostile channel can outlive its target's
defeat. The planner releases these through normal Stop commands, before it
drops the corresponding remembered identity. Current sight takes precedence
over old ownership memory. An unknown hidden ID is never resolved against live
enemy state. Stop commands group at most 64 owned actors so a force larger than
32 units does not lose pending cancellations under the existing 32-order
planning budget. No direct movement or channel mutation bypasses execution.

Two separate scouting failures were demonstrated: an entirely explored map
always returned its center, and a public endgame structure pulse did not inform
the strategic movement goal. The planner now revisits currently fogged,
passable scouting grid points using the saved deterministic `AIScout` cursor.
It can move toward a surviving opponent's position-only public pulse while
retaining immediate defense priority. Neither correction reads hidden enemies,
grants sight, identifies a hidden target, or permits firing without normal
visibility. A transport already executing a delivery follows its ordinary
order; subsequent collection/delivery planning uses the updated goal.

## Targeted coverage

`pkg/sim/ai_endgame_test.go` covers:

- Public defeat retiring visible and remembered hidden wrecks in both three
  and four-player matches, including anti-air danger and defensive goals.
- Existing visible/remembered attacks enqueueing Stop without mutating the
  live order; normal execution then releases that order.
- Current public ownership overriding remembered ownership, hidden identity
  changes leaving cancellation unchanged, and hostile-channel cancellation.
- Forty attacking units fitting the planning budget without dropped stops.
- Capture, launcher and designation intentions avoiding defeated actors.
- Transport collection proceeding toward an active opponent despite a nearby
  inactive anti-air wreck, and inactive aircraft not changing production.
- Fully explored maps producing multiple scouting destinations.
- Public structure indicators guiding movement without adding target
  knowledge or changing visibility.
- Three/four-player endgame saves preserving the scouting cursor and producing
  identical simulation hashes after 420 further ordinary ticks.

The original defeat-memory, special-target, explored-center and ignored-pulse
tests failed before their corrections. The stale explicit-attack tests also
failed before the ordinary Stop path was added.

## Complete synthetic match evidence

The unchanged `TestBotsFinishThreeAndFourPlayerMatches` uses the synthetic
64×64 player-count fixture, seed 7821, Normal bots, and factions US/IR/SY/SA in
input order. Each run is capped by the existing 90-minute match safety limit
and must finish through ordinary elimination. No timeout victory, resource
grant, scripted damage or hidden-state search was introduced.

| Match | Baseline end tick | Final end tick | Baseline simulated duration | Final simulated duration |
|---|---:|---:|---:|---:|
| Three-player free-for-all | 29,293 | 18,611 | 24:24.65 | 15:30.55 |
| Four-player free-for-all | 104,471 | 18,263 | 87:03.55 | 15:13.15 |
| Four-player two-team | 12,977 | 11,665 | 10:48.85 | 9:43.25 |

Durations are tick counts divided by 20 and include the starting countdown.
Winners changed from team 2 to team 1 in the three-player case and from team 2
to team 4 in the four-player free-for-all. Team 1 won both versions of the team
case. Those changes are expected in a deterministic strategy regression; they
do not measure faction fairness, player skill or the target match-duration
distribution.

Evidence files:

- `work/evidence/ai-endgame-before.log`: baseline reproduced the original
  reported end ticks exactly.
- `work/evidence/ai-endgame-after.log`: initial AI filtering/scouting/pulse
  correction, before later stale-order and shared inactive-asset corrections;
  end ticks 16,228 / 18,273 / 11,783.
- `work/evidence/ai-endgame-final-matches.log`: ordinary economy checks, all
  ten two-player cross-faction/mirror matches, and the integrated three/four
  player matrix passed in 49.843 seconds. This includes the shared simulation
  fixes for inactive targeting, capture, rewards and scheduled operations.
- `work/evidence/ai-endgame-final-player-matrix.log`: final matrix rerun after
  grouping Stop commands under the actor/order limits passed in 14.388 seconds,
  with the final ticks shown above.
- `work/evidence/ai-endgame-race.log`: focused AI and one-to-four-player
  determinism/restore race tests passed in 9.945 seconds.
- `work/evidence/ai-endgame-final-short-race.log`: final full short simulation
  race suite, including the grouped-cancellation regression, passed in 40.106
  seconds. `go vet ./pkg/sim` also passed after the final Go changes.

The two-player complete-match suite covers six cross-faction pairings and four
mirrors on its existing synthetic map, seed 73, with Hard bots. It checks the
ordinary economy and 90-minute safety bound. The complete-match tests are run
without race instrumentation; the short race suite covers the mechanism and
restore tests instead. Wall-clock durations are test-run records, not controlled
performance benchmarks.

## Reproduction and limits

```sh
go test -short -race ./pkg/sim -count=1
go test ./pkg/sim -run '^TestBotsFinishThreeAndFourPlayerMatches$|^TestAICompleteStandardMatches$|^TestAIUsesBaseEconomy$' -count=1 -v
go vet ./pkg/sim
```

This is a fixed synthetic regression sample. Authored map layouts, chokepoints,
mission scripts, human matches, transport route choices and long economic
exhaustion scenarios still require their own acceptance. The general
inactive-asset corrections are separate from the AI policy change, so final
durations cannot be attributed to a single filter. No balance conclusion or
finished-game claim follows from these results.
